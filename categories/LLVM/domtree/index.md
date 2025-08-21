---
layout: default
title: 支配分析
---

# 支配分析

## 基本概念

**支配(Dominance, Dom)**：当且仅当从入口节点`Entry`到节点`N`的每一条路径都经过节点`D`，则称节点`D`支配节点`N`（`D`可以为`Entry`和`N`）。节点`N`的所有支配节点全集记为`Dom(N)`

**严格支配节点(Strict Dominators, SDom)**：`Dom(N) - N`

**直接支配节点(Immediate Dominator, IDom)**：`N`的所有严格支配节点`SDom(N)`中，同时也被`SDom(N)`中所有节点支配的节点。或者更简洁的说，`N`的所有严格支配节点中离`N`最近的节点

**支配树(Dominator Tree, DT)**：利直接支配节点关系构建的树形结构，其中节点即支配分析中的节点，子节点为父节点直接支配的所有节点

**支配边界(Dominance Frontier, DF)**：`D`的支配边界`DF(D)`指所有满足以下要求的节点`N`的集合：存在`N`的某个前驱节点`P`，使得`D`支配`P`且`D`不严格支配`N`（不严格支配指要么不支配，要么自我支配）

**后支配(Post Dominance, PDom)**：当且仅当从`N`到出口节点`Exit`的每一条路径都经过`P`，则称节点`P`后支配节点`N`

**严格后支配节点(Post Strict Dominators, PSDom)**：`PSDom(N) - N`

**直接后支配节点(Post Immediate Dominator, PIDom)**：`N`的所有严格后支配节点`PSDom(N)`中，同时也被`PSDom(N)`中所有节点后支配的节点。或者更简洁的说，`N`的所有严格后支配节点中离`N`最近的节点

**后支配树(Post Dominator Tree)**：利直接后支配节点关系构建的树形结构，其中节点即支配分析中的节点，子节点为父节点直接后支配的所有节点


![DomTree](images/dom_tree.png){: width="50%"} ![PostDomTree](images/post_dom_tree.png){: width="25%"}

| 节点 |     其支配节点     |   其严格支配节点   | 其直接支配节点 |   其不严格支配节点    | 其支配边界 |    其后支配节点     |  其严格后支配节点   | 其直接后支配节点 |
|:--:|:-------------:|:-----------:|:-------:|:-------------:|:-----:|:-------------:|:-----------:|:--------:|
| 1  | 1,2,3,4,5,6,7 | 2,3,4,5,6,7 |  2,5,7  |       1       |  NA   |       1       |     NA      |    NA    |
| 2  |    2,3,4,6    |    3,4,6    |  3,4,6  |    1,2,5,7    |   7   |       2       |     NA      |    NA    |
| 3  |       3       |     NA      |   NA    | 1,2,3,4,5,6,7 |   6   |       3       |     NA      |    NA    |
| 4  |       4       |     NA      |   NA    | 1,2,3,4,5,6,7 |   6   |       4       |     NA      |    NA    |
| 5  |       5       |     NA      |   NA    | 1,2,3,4,5,6,7 |   7   |       5       |     NA      |    NA    |
| 6  |       6       |     NA      |   NA    | 1,2,3,4,5,6,7 |   7   |    2,3,4,6    |    2,3,4    |  2,3,4   |
| 7  |       7       |     NA      |   NA    | 1,2,3,4,5,6,7 |  NA   | 1,2,3,4,5,6,7 | 1,2,3,4,5,6 |  1,5,6   |

一般而言，支配分析的对象是CFG，即以函数为边界，以基本块为节点，有唯一一个入口基本块和一个或多个基本块。在LLVM中，支配分析也仅限于单个函数的CFG内进行。如果有更高精度的需求，也可以以指令为节点。当有多个入口或出口时，分析阶段会先在CFG上引入一个虚拟入口/出口节点，并将其连接到所有真实入口/出口上。

## 支配分析的作用

LLVM中支配分析的作用众多，下面举几例说明。

### SSA构造 - 插入φ节点

插入φ节点的本质是在寻找BB的汇合点，使得这个汇合点的前驱路径能带来对于某一变量的不同定值。入度>1的BB未必需要φ节点，不同定值的来源也未必是直接前驱BB。以下图为例：

 - Example1: 如果对var的定值仅发生在BB1中，则BB5无需插入φ
 - Example2: 如果是BB1、BB2存在对var的定值，则BB5需要φ节点

![insert phi](images/insert_phi.png){: width="20%"}

这一需求与支配边界的概念高度契合：支配边界寻找的对象本质上就是这样的汇合点，使得当前BB能不能支配汇合点（Example1），但能支配汇合点的前驱节点（Example2）。利用支配边界放置φ节点的方法、更多关于SSA的解释可参考`静态单赋值和φ`章节。

### 循环优化 - 自然循环识别、循环不变代码移动

**自然循环识别**：自然循环，又称可规约循环(reducible loop)，指只有一个入口的循环。LLVM等大多数编译器都仅识别和优化自然循环，不会将不可规约循环视作循环。自然循环识别的本质就是找打回边(back-edge)，而回边满足：

 - 存在BB2到BB1的跳转关系
 - BB1能严格支配BB2

![reducible vs irreducible](images/reducible.png){: width="50%"}

识别之后，LLVM会围绕循环做一些处理。例如在找到循环头(header，即BB1)后，LoopSimplifyPass会为每个循环头生成唯一的前置块(preheader)，便于后续将循环不变式统一移动到循环外。此时，所有原本流入header的非回边前驱边都会被redirect到preheader，再通过其跳转到header上，即preheader只有一个去header的无条件跳转。如果循环头有且只有一个来自循环外的前驱边，且该前驱边不为关键边(critical edge, 参见章节`静态单赋值和φ`)，则CFG中已有符合条件的preheader，此时就无需新增了。

**循环不变代码移动(Loop Invariant Code Motion, LICM)**：LICM的目标时将循环内每次迭代都产生相同结果、必然执行、且无副作用的指令移动到循环外执行。举例来说，这些指令满足：

 - 原位置再循环内：循环内的所有BB可以通过循环识别拿到循环头尾后，从循环尾开始在CFG上向前回溯，直到循环头为止来拿到
 - 没有控制依赖(control dependence)：即原位置的执行不取决与循环内的其他条件，而是每轮必定执行。这可以通过支配树上查找除循环头外是否还被分支BB严格支配来确定
 - 该指令的所有操作数(operands)是否都在循环外定义，或可被递归地确认为循环不变式

值得额外说明的是，LLVM中并不是符合以上条件就一定会移动到preheader中。这是因为移动是有代价的，例如延长了变量的生命周期。仅当LLVM认为该移动总体上是有盈利时才会执行移动操作。

### 冗余消除 - 部分冗余消除、全局值编号

[注] 下面对各功能模块中支配的使用未必完全准确。资料不全、不准，想要确定只能看源码，例如[LLVM`GVNPass::performScalarPRE`](https://github.com/llvm/llvm-project/blob/694a4887089fb006dc597219485d7354540917c6/llvm/lib/Transforms/Scalar/GVN.cpp#L2886)
[注] LLVM中可能并没有global CSE。关于CSE中的支配分析只是一种符合逻辑的做法，不代表LLVM中的具体实现

**公共子表达式消除(Common Subexpression Elimination, CSE)**：CSE目标是优化掉冗余的操作符、操作数（包括操作数的顺序）完全相同的表达式；如果上一次该表达式出现(BB1)到本次出现(BB2)间操作数未被重新定值，且若BB2执行则BB1一定执行，则当前表达式冗余。CSE中支配分析承担了两个目的：

- 提供遍历顺序：遍历BB时需要一个无环的数据结构提供遍历顺序。这个需求和支配树契合，因为支配树包含所有BB且解除了循环
- 确认上一次必定执行：这和支配的概念契合，如果BB1支配BB2，则抵达BB2的所有路径必定经过BB1，即上一次必定执行

![CSE](images/CSE.png){: width="20%"}

**部分冗余消除(Partial Redundancy Elimination， PRE)**：首先解释什么是完全冗余(Full Redundancy)和部分冗余。完全冗余指所有到达该计算的路径，都已经在前面进行过同样的计算，此时删除后者不会改变任何执行结果。部分冗余指只有部分执行路径在到达该计算之前已有相同计算，其余路径没有；此时简单删除会导致无定义使用，必须先补齐未计算的路径才能安全移除。

```text
Entry:
  br i1 %c, label %B, label %C
B:
  %x = a + b
  br label %D
C:
  %y = a + b
  br label %D
D:
  %z = a + b        ; 完全冗余。若%x或%y不存在，则为部分冗余
```

PRE的目标是将沿某些但非全部执行路径重复计算的表达式（即部分冗余），通过代码移动和φ插入，尽可能消除同一路径上的冗余计算，使得任一执行路径上每个表达式最多只执行一次。同时，它也会为后续的全局值编号铺路，使冗余的形式满足完全冗余，使全局值编号能一举全部消除。

![PRE1](images/PRE1.png){: width="50%"}

上图示例中选择了Latest策略，即在保证消除部分冗余的前提下，把插入点推后到尽可能接近使用点。Earliest则是另一种策略，即找到最靠近入口且满足安全要求的插入点，也就是在B1中插入。Earliest、Latest在不同场景下各有优劣。总之，在PRE中，支配分析承担了两项任务：

- φ插入：同SSA构造
- 寻找插入位置（间接）：通过数据流分析找到合适的安插位置，以保证不论走哪条路径，旧use处都有正确、可用的表达式

**全局值编号(Global Value Numbering, GVN)**：目标是给每个表达式分配一个值号(Value Number)，并在全局范围内复用相同值号的计算，以消除完全冗余。GVN支持交换律，`a+b`和`b+a`会给相同的值号。一般而言GVN需要SSA以确定操作数的值是否发生改变。

[TODO]待研究：似乎LLVM中的实现和理论定义有偏差。如果B、C中都已经算过表达式了，D中相同表达式理论上算是完全冗余，但是实际上GVN可能不会处理，因为没有一个能支配D的节点有定义相同表达式。

LLVM中支配分析在GVN中承担了2个任务：

- 提供遍历顺序：同CSE
- 继承和合并支配节点的表达式：如果A支配B且两个节点中有相同的表达式，则B的表达式必定完全冗余

**全局值编号(Global Value Numbering, GVN)**：目标是给每个表达式分配一个值号(Value Number)，并在全局范围内复用相同值号的计算，以消除完全冗余。GVN支持交换律，`a+b`和`b+a`会给相同的值号。一般而言GVN需要SSA以确定操作数的值是否发生改变。

[TODO]待研究：似乎LLVM中的实现和理论定义有偏差。如果B、C中都已经算过表达式了，D中相同表达式理论上算是完全冗余，但是实际上GVN可能不会处理，因为没有一个能支配D的节点有定义相同表达式。

LLVM中支配分析在GVN中承担了2个任务：

- 提供遍历顺序：同CSE
- 继承和合并支配节点的表达式：如果A支配B且两个节点中有相同的表达式，则B的表达式必定完全冗余

## LLVM中的支配分析

LLVM中的支配分析的核心产物是支配树/后支配树，其他支配分析，例如支配、严格支配等的计算，都是在支配树上产生的。支配边界虽然有独立于支配树的Pass（`domfrontier`, `domtree`, `postdomtree`)，但它实现中也用了`domtree`的结果。这样实现的目的可能是为了避免支配、直接支配节点过多导致的内存开销。

仍以上一小节`基本块和控制流图`中的LLVM IR`6.ll`为例，LLVM对其`domtree`， `domfrontier`分析结果形式分别为：

```text
PS C:\Users\xjshu\CLionProjects\playground> opt -S --passes=print<domtree> 6.ll -o 6dom.ll
DominatorTree for function: func
=============================--------------------------------
Inorder Dominator Tree: DFSNumbers invalid: 0 slow queries.  
    // 虽然叫Inorder但这只是LLVM历史遗留术语，实际上的输出逻辑是PreOrder
    // DFSNumbers invalid说明在这次打印中并未计算或启用节点的DFS进入/离开编号（它们全为默认值 4294967295，即 -1u） 
    // 0 slow queries表示在分析过程中没有触发任何需要额外工作（slow queries）的情况
  [1] %2 {4294967295,4294967295} [0]    // [1]指当前层级；[0]指父节点所在层级（0表示无）
    [2] %7 {4294967295,4294967295} [1]
      [3] %10 {4294967295,4294967295} [2]
        [4] %14 {4294967295,4294967295} [3]
        [4] %22 {4294967295,4294967295} [3]
          [5] %23 {4294967295,4294967295} [4]
        [4] %18 {4294967295,4294967295} [3]
      [3] %26 {4294967295,4294967295} [2]
Roots: %2 
DominatorTree for function: main
=============================--------------------------------
Inorder Dominator Tree: DFSNumbers invalid: 0 slow queries.
```

在LLVM实际代码中，需要显示调用`recalculateDFSNumber`才能获得DFS进入/离开编号。这个编号用于在O(1)时间内完成支配判断：如果某节点编号在当前节点DFS in-out编号范围内，则必定受当前节点支配。

```text
PS C:\Users\xjshu\CLionProjects\playground> opt -S --passes=print<domfrontier> 6.ll -o 6dom.ll
DominanceFrontier for function: func
  DomFrontier for BB %23 is:     %7
  DomFrontier for BB %2 is:
  DomFrontier for BB %14 is:     %22
  DomFrontier for BB %26 is:
  DomFrontier for BB %22 is:     %7
  DomFrontier for BB %18 is:     %22
  DomFrontier for BB %10 is:     %7
  DomFrontier for BB %7 is:      %7
DominanceFrontier for function: main
  DomFrontier for BB %0 is:
```

## 支配分析算法

TODO

