// assets/js/sidebar.js
document.addEventListener('DOMContentLoaded', () => {
  // 取出所有一级目录 <details>
  const detailsList = Array.from(
    document.querySelectorAll('.sidebar .toc > details')
  );

  detailsList.forEach(detail => {
    const summary = detail.querySelector('summary');
    const content = detail.querySelector('ul');

    // —— 初始化样式 ——
    content.style.maxHeight   = '0';
    content.style.overflow    = 'hidden';
    content.style.transition  = 'max-height 0.4s ease';

    // —— 点击时收起其它同级，并让浏览器切换 open 属性 ——
    summary.addEventListener('click', () => {
      detailsList.forEach(d => {
        if (d !== detail && d.hasAttribute('open')) {
          d.removeAttribute('open');
        }
      });
      // 当前 detail 会自动由浏览器添加/移除 open
    });

    // —— 监听 toggle 事件，做动画 ——
    detail.addEventListener('toggle', () => {
      if (detail.open) {
        // 展开：先设定为实际高度，再在 transitionend 时放开限制
        content.style.maxHeight = content.scrollHeight + 'px';
        const cleanup = () => {
          // 动画完后，解除高度限制以适应内容增删
          if (detail.open) content.style.maxHeight = 'none';
          content.removeEventListener('transitionend', cleanup);
        };
        content.addEventListener('transitionend', cleanup);

      } else {
        // 收缩：先把 maxHeight 设为当前高度，再下帧切到 0
        content.style.maxHeight = content.scrollHeight + 'px';
        requestAnimationFrame(() => {
          content.style.maxHeight = '0';
        });
      }
    });
  });
});
