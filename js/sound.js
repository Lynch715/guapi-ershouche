/* 轻量 WebAudio 音效，无音频资源、无网络请求。只在真实交互后启动。 */
var G = globalThis.G = globalThis.G || {};
(function () {
  const KEY = 'usedcar_sim_muted';
  let muted = false, ctx;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (_) {}
  const patterns = {
    click: [[520, 0, 0.035]], deal: [[880, 0, 0.12], [1320, 0.08, 0.18]],
    month: [[330, 0, 0.13], [440, 0.1, 0.15], [660, 0.2, 0.2]],
    bad: [[100, 0, 0.25]], win: [[523, 0, 0.17], [659, 0.15, 0.17], [784, 0.3, 0.17], [1047, 0.45, 0.3]],
  };
  G.Sound = {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (_) {}
      if (muted && ctx?.state === 'running') ctx.suspend().catch(() => {});
      return muted;
    },
    play(kind = 'click') {
      if (muted) return;
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        ctx = ctx || new Audio();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        for (const [hz, offset, duration] of patterns[kind] || patterns.click) {
          const oscillator = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + offset;
          oscillator.type = kind === 'bad' ? 'triangle' : 'sine'; oscillator.frequency.value = hz;
          gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(kind === 'click' ? 0.015 : 0.035, start + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + duration + 0.01);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        }
      } catch (_) { /* 不支持音频时安静降级 */ }
    },
  };
  document.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (button && !button.disabled && !['mute', 'end-month', 'buy', 'peer'].includes(button.dataset.act)) G.Sound.play('click');
  }, true);
})();
