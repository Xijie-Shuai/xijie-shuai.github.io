---
layout: default
title: 静态单赋值和φ
---

# 静态单赋值(Static Single Assignment, SSA)和φ节点

## SSA基本概念和φ问题

**SSA**是一种IR的形式，它的核心特点为
- **静态**：对代码进行静态分析，不需要考虑代码动态的执行情况
- **单赋值**：每个变量在其作用域内仅被赋值一次

### 单赋值

一个简单的例子：

```C
// 3.c
int main() {
    int x = 10;
    int y = x + 1;
    x = 20;
    int z = x + 2;
    return 0;
}
// clang -S -emit-llvm 3.c -o 3.ll
// 对应的SSA形式示意和LLVM IR中的真实SSA
x1 = 10;        // store i32 10, ptr %2, align 4; %5 = load i32, ptr %2, align 4
y = x1 + 1;     // %6 = add nsw i32 %5, 1
x2 = 20;        // store i32 20, ptr %2, align 4; %7 = load i32, ptr %2, align 4
z = x2 + 2;     %8 = add nsw i32 %7, 2
```

在不涉及分支的例子里SSA很简单，但当同一逻辑变量在不同控制流（分支、循环等）多次赋值时并通过φ节点在控制流汇合处合并各版本时，则引入变量汇聚问题。

```text
// pseudocode1
y = 0;
if (x > 42) then {
    y = 1;
} else {
    y = x + 2;
}
print(y);

// SSA with φ node
y1 = 0;
if (x > 42) then {
    y2 = 1;
} else {
    y3 = x + 2;
}
y4 = φ(if:y3, else:y2);
print(y4);
```

φ函数本质上是一个选择操作，指从不同的执行路径中选择执行结果，例如当if语句执行时φ函数的结果为y2，当else语句执行时φ函数的结果为y3。通过重命名和φ函数，SSA达成“单赋值”和“静态”的目的。

### 静态

静态指不考虑实际执行是的分支走向、循环轮数等。下面伪代码的SSA形式CFG如下。

```text
x = 0;
y = 0;
do {
    y = y + x;
    x = x + 1;
} while (x < 10);
print(y);
```

![Loop SSA](images/loop_ssa.png){: width="50%"}

### SSA有什么用

引入SSA形式的目的在于简化编译器的实现，使得每个变量名只对应一次赋值，Def-Use链清晰，易于实现常量传播、死代码消除、公共子表达式消除等功能，且无需额外的繁琐分析。

引入φ函数后，SSA的表达能力就完备了，但通常硬件并没有相应的指令描述φ函数，所以引入φ函数后还需要将φ函数消除（参阅后续小节`SSA析构`）。

### Clang+LLVM编译流程中的SSA

Clang+LLVM编译流程中的SSA生命周期如下：

![SSA Lifespan](images/SSA_lifespan.png){: width="100%"}

 - Clang EmitLLVM生成的LLVM IR比较特殊。它自然采用SSA形式，因为变量通过`%var = …`天然单次定义，若有重名则自动添加后缀；而多次赋值被`store`指令表达，不会体现成“多次对同一左值的修改”。

```C
// 5.c 
int main() {
    int cond = 0;
    if (cond > 0) {
        int x = 10;
    }
    int x = 0;
    x = x + 1;
    x = x + 1;
    return 0;
}
// clang -cc1 -emit-llvm -disable-llvm-passes 5.c -o 5.ll
// 输出的LLVM IR主体
define dso_local i32 @main() #0 {
entry:
  %retval = alloca i32, align 4
  %cond = alloca i32, align 4
  %x = alloca i32, align 4
  %x1 = alloca i32, align 4             // x1的重命名；LLVM IR并不遵循C那套块级作用域来分配栈空间。Clang会先把函数里
    // 所有局部变量收集起来，再统一在函数入口处用alloca分配对应的栈槽，以使后续的SSA转换（mem2reg）以及优化易于实现。
  store i32 0, ptr %retval, align 4
  store i32 0, ptr %cond, align 4
  %0 = load i32, ptr %cond, align 4
  %cmp = icmp sgt i32 %0, 0
  br i1 %cmp, label %if.then, label %if.end

if.then:                                          ; preds = %entry      // 注释，用于帮人理解前驱BB是谁
  store i32 10, ptr %x, align 4
  br label %if.end

if.end:                                           ; preds = %if.then, %entry
  store i32 0, ptr %x1, align 4
  %1 = load i32, ptr %x1, align 4
  %add = add nsw i32 %1, 1
  store i32 %add, ptr %x1, align 4
  %2 = load i32, ptr %x1, align 4
  %add2 = add nsw i32 %2, 1             // add的重命名
  store i32 %add2, ptr %x1, align 4
  ret i32 0
}
```

 - Mem2reg是LLVM中端的第一个Transform Pass，它将
```text
// opt -S -passes=mem2reg 5.ll -o 5_mem2reg.ll   即基于原始LLVM IR只跑mem2reg
define dso_local i32 @main() #0 {
entry:
  %retval = alloca i32, align 4
  %cond = alloca i32, align 4
  %x = alloca i32, align 4
  %x1 = alloca i32, align 4
  store i32 0, ptr %retval, align 4
  store i32 0, ptr %cond, align 4
  %0 = load i32, ptr %cond, align 4
  %cmp = icmp sgt i32 %0, 0
  br i1 %cmp, label %if.then, label %if.end

if.then:                                          ; preds = %entry
  store i32 10, ptr %x, align 4
  br label %if.end

if.end:                                           ; preds = %if.then, %entry
  store i32 0, ptr %x1, align 4
  %1 = load i32, ptr %x1, align 4
  %add = add nsw i32 %1, 1
  store i32 %add, ptr %x1, align 4
  %2 = load i32, ptr %x1, align 4
  %add2 = add nsw i32 %2, 1
  store i32 %add2, ptr %x1, align 4
  ret i32 0
}
```
 - 
 - 寄存器分配后将虚拟寄存器映射到物理寄存器，彻底打破SSA单赋值约束。

clang + LLVM 编译流程中的 SSA 生命周期
LLVM 在不同层级对 SSA 支持不同，但可概括为以下几个阶段：

3.1 LLVM IR 层（SSA 初始阶段）
开始时点

Clang 前端的 EmitLLVMIRAction 生成的 LLVM IR 自然采用 SSA 形式：函数参数和局部变量通过 %v = … 单次定义。

mem2reg Pass（PromoteMemoryToRegister）进一步将所有 alloca/load/store 模拟的“变量”提升为 SSA 版本，并插入 φ 节点。

结束时点

在 IR→IR 优化管线（如 instcombine、loop-unroll、gvn 等）期间，SSA 形式始终保留，并通过 PreservedAnalyses 保证 φ 节点和版本正确更新。

3.2 SelectionDAG 层（SSA 暂停）
转换节点

SelectionDAGBuilder 将 SSA LLVM IR 展开为 DAG 节点（SDNode），φ 节点被转换为物理寄存器间的复制（CopyToReg/CopyFromReg）。

状态

此时 SSA 形式不再是 DAG 的表示，依赖关系交织在图结构中，不再显式维护 φ。

3.3 Machine IR 层（虚拟寄存器 SSA）
重新开始 SSA

从 DAG → MachineFunction 生成的 虚拟寄存器（Virtual Register）体系，默认也是单次定义、SSA 风格；每条 MachineInstr 定义新的虚拟寄存器版本。

用途

在寄存器分配（Register Allocation）与调度之前，继续利用 SSA 简化活跃区间分析（Live Interval）、寄存器压力评估等。

3.4 寄存器分配后（SSA 结束）
结束时点

RegisterAllocator 将虚拟寄存器映射到物理寄存器，并在必要时插入复制指令（Copies/Spills），彻底打破 SSA 单赋值约束。

Prolog/Epilog 插入、StackSlot 分配等后端阶段均在非 SSA 格式下进行。

最终

进入 MC 层（MCInst → 汇编/对象文件）时，不再保有任何 SSA 结构或 φ 节点。

总结
LLVM IR 层：从前端 CodeGen 到所有 IR-to-IR 优化，SSA 始终存在。

SelectionDAG：SSA 被物理寄存器复制替代，DAG 不再显式为 SSA。

Machine IR：引入虚拟寄存器 SSA，持续到寄存器分配。

寄存器分配后：SSA 形式彻底消失，进入最终编码阶段。


3. 为什么 SelectionDAG 层要“暂停” SSA？
SelectionDAG 阶段将 LLVM IR 从 SSA 形式“降级”到 DAG 结构，主要有以下考量：

目标无关的 SSA 信息不再必要

DAG 更关注操作依赖和目标机器特性（延迟、支持的指令模式），SSA 结构（φ节点、版本编号）对后端指令匹配帮助有限。

简化指令选择与调度

把 φ 节点转换为显式的寄存器复制（CopyToReg/CopyFromReg），让 DAG 节点只表达数据流依赖，方便做 Legalize、Combine 和 Instruction Selection。

跨寄存器与寄存器类统一处理

后端需要考虑物理寄存器的种类、调用约定、寄存器别名等，SSA 版本信息反而不利于映射到真实寄存器资源。

分层优化原则

在 LLVM IR 层保持 SSA 以利 IR-to-IR 的高层优化；

在 DAG 层放弃 SSA，将控制流合并的逻辑托付给后续的寄存器分配与调度阶段。

1. Clang EmitLLVMIRAction 阶段
不做支配分析

Clang 前端生成 LLVM IR 时，会为每个局部变量插入 alloca、load、store，而不是直接生成 φ 节点。

它只是根据 AST 控制流结构创建 BasicBlock 及分支指令，并不构建 DominatorTree 或计算支配边界。

输出非 SSA IR

此阶段的 IR 可以被看做“基于内存的”形式（Memory-SSA 尚未引入），变量多次 store 到同一个 alloca，并多次 load。

这种 IR 方便在前端一步到位映射 C/C++ 语义，但并不是严格的 SSA。

2. mem2reg Pass（PromoteMemoryToRegister）
真正引入 SSA

将所有 alloca/load/store 的“内存变量”提升到 SSA 寄存器。

在控制流的合流点插入 φ 节点，分别合并不同前驱 BasicBlock 的值版本。

支配分析的时机

构建 Dominator Tree（DominatorTreeAnalysis）

计算 Dominance Frontier（DominanceFrontier 分析）

根据 Frontier 在每个必要的 BasicBlock 插入 φ 节点

默认管线位置

Legacy PM: -mem2reg

New PM: 在默认 default<O2> 中已包含 mem2reg

mem2reg Pass 的归属与执行时机
1. mem2reg 属于 LLVM 而非 Clang
mem2reg（PromoteMemoryToRegister）是 LLVM IR-to-IR 优化管线中的一个 Pass，位于 LLVM 的 lib/Transforms/Utils/PromoteMemoryToRegister.cpp。

Clang 前端只负责把 AST 转成“基于内存”的 LLVM IR（含 alloca/load/store），而不执行 SSA 转换。

2. 在编译流水线中的位置
Clang EmitLLVMIR

生成初始 IR，变量以内存方式表示（alloca + load/store）

mem2reg Pass

将内存变量提升到 SSA 寄存器，插入 φ 节点

后续 IR-to-IR 优化

比如 instcombine, gvn, loop-rotate 等继续在 SSA 形式上运行

3. mem2reg 之前的操作
Clang 前端 EmitLLVMIRAction

根据 AST 生成带多次 store/load 的 IR

结果是“内存 SSA”，未插 φ

（可选）用户手动插入其他 IR Pass

例如用 opt 先跑 -mem2reg 之前的分析：-verify, -dot-cfg

4. mem2reg 之后的主要 Pass
instcombine：合并和简化算术/逻辑指令

gvn：全局值编号消除冗余表达式

sroa：拆分和优化 alloca（SSA 形式更易生效）

loop-passes：循环转换、展开、矢量化等

early-inliner：内联小函数，进一步增加 SSA 变量


























IR中的φ未必会以`y4 = φ(if:y3, else:y2);`的形式写出。例如Clang EmitLLVM输出的LLVM IR中φ的形式如下。
```text
7:
  store i32 1, ptr %3, align 4      // 将1存入%3指向的位置
  br label %11

8:
  %9 = load i32, ptr %2, align 4
  %10 = add nsw i32 %9, 2
  store i32 %10, ptr %3, align 4    // 将%10存入%3指向的位置
  br label %11
```

## SSA构造


