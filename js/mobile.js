/* 保留浏览器缩放与辅助功能，只避免装饰图片被拖动。 */
var G = globalThis.G = globalThis.G || {};
(function () {
  const stop = e => { if (e.cancelable) e.preventDefault(); };
  document.addEventListener('dragstart', e => { if (e.target.tagName === 'IMG') stop(e); });
  document.addEventListener('contextmenu', e => { if (e.target.closest('button,.tabs,.card,.pick') && !e.target.closest('input,select,textarea')) stop(e); });
  const prepare = () => document.querySelectorAll('img:not([draggable="false"])').forEach(img => { img.draggable = false; });
  document.addEventListener('DOMContentLoaded', () => { prepare(); new MutationObserver(prepare).observe(document.getElementById('app'), {childList:true,subtree:true}); });
})();
