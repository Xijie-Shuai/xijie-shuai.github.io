// assets/js/sidebar.js
document.addEventListener('DOMContentLoaded', () => {
  const detailsList = Array.from(
    document.querySelectorAll('.sidebar .toc > details')
  );

  // 手风琴收起函数
  function collapseDetail(detail) {
    const content = detail.querySelector('ul');
    // 先把 max-height 设成当前高度
    content.style.maxHeight = content.scrollHeight + 'px';
    // 下一帧变 0
    requestAnimationFrame(() => { content.style.maxHeight = '0px'; });
    // 动画完后删 open
    content.addEventListener('transitionend', function handler() {
      detail.removeAttribute('open');
      content.removeEventListener('transitionend', handler);
    });
  }

  detailsList.forEach(detail => {
    const summary = detail.querySelector('summary');
    const content = detail.querySelector('ul');

    // 初始化：隐藏/过渡
    content.style.overflow   = 'hidden';
    content.style.transition = 'max-height 0.4s ease';
    // 如果页面初始有 open：让它展开到自然高度
    if (detail.hasAttribute('open')) {
      content.style.maxHeight = 'none';
    } else {
      content.style.maxHeight = '0px';
    }

    summary.addEventListener('click', event => {
      event.preventDefault();  // 一定要阻止浏览器原生 toggle

      // 如果当前是收起状态 → 展开
      if (!detail.hasAttribute('open')) {
        // 1. 先把 open，加上去保证内容可见
        detail.setAttribute('open', '');
        // 2. 再从 0 → scrollHeight 做动画
        content.style.maxHeight = content.scrollHeight + 'px';
        content.addEventListener('transitionend', function handler() {
          // 展开完后放开高度限制
          if (detail.hasAttribute('open')) {
            content.style.maxHeight = 'none';
          }
          content.removeEventListener('transitionend', handler);
        });

      } else {
        // 否则当前是展开 → 收缩
        collapseDetail(detail);
      }

      // 收起其它同级
      detailsList.forEach(d => {
        if (d !== detail && d.hasAttribute('open')) {
          collapseDetail(d);
        }
      });
    });
  });
});
