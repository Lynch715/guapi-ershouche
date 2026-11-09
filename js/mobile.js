/* 触屏与安全区配合：阻止页面缩放，输入和按钮的正常点击照常。 */
var G = globalThis.G = globalThis.G || {};
(function () {
  const stop = e => { if (e.cancelable) e.preventDefault(); };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, {passive:false});
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) stop(e); }, {passive:false});
  let lastTouch = 0, lastTarget = null;
  document.addEventListener('touchend', e => {
    const now = Date.now(), interactive = e.target.closest?.('input,select,textarea,button,a,label,[role="button"]');
    if (!interactive && lastTarget === e.target && now - lastTouch < 300) stop(e);
    lastTouch = now; lastTarget = e.target;
  }, {passive:false});
  document.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) stop(e); }, {passive:false});
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+','=','-','0','Add','Subtract'].includes(e.key)) stop(e); });
  document.addEventListener('dragstart', e => { if (e.target.tagName === 'IMG') stop(e); });
  document.addEventListener('contextmenu', e => { if (e.target.closest('button,.tabs,.card,.pick') && !e.target.closest('input,select,textarea')) stop(e); });
  const prepare = () => document.querySelectorAll('img:not([draggable="false"])').forEach(img => { img.draggable = false; });
  document.addEventListener('DOMContentLoaded', () => { prepare(); new MutationObserver(prepare).observe(document.getElementById('app'), {childList:true,subtree:true}); });
})();
