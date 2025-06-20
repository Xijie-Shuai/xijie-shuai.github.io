// assets/js/sidebar.js
document.addEventListener("DOMContentLoaded", () => {
  // 找到所有顶级 details summary
  const tops = document.querySelectorAll(".sidebar .toc > details > summary");
  tops.forEach(sum => {
    sum.addEventListener("click", () => {
      // 收起其它同级目录
      tops.forEach(s => {
        if (s !== sum) s.parentElement.removeAttribute("open");
      });
      // 当前 summary 的 details 会自动 toggle open
    });
  });
});
