/* 工具函数：带种子的随机数（状态存在存档里，可复现）、格式化 */
var G = globalThis.G = globalThis.G || {};

G.rand = function () {
  const s = G.state;
  let t = (s.rngState = (s.rngState + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
G.range = (a, b) => a + (b - a) * G.rand();
G.randInt = (a, b) => Math.floor(G.range(a, b + 1));
G.chance = p => G.rand() < p;
G.pick = arr => arr[Math.floor(G.rand() * arr.length)];
G.weighted = obj => {
  const entries = Object.entries(obj);
  let r = G.rand() * entries.reduce((t, [, w]) => t + w, 0);
  for (const [k, w] of entries) if ((r -= w) < 0) return k;
  return entries[entries.length - 1][0];
};
G.gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += G.rand(); return (u - 3) / Math.sqrt(0.5); };
G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
G.round = (v, step = 1000) => Math.round(v / step) * step;

G.fmt = function (n) {
  const neg = n < 0; n = Math.abs(n);
  let s;
  if (n >= 1e8) s = (n / 1e8).toFixed(2) + '亿';
  else if (n >= 1e6) s = Math.round(n / 1e4) + '万';
  else if (n >= 1e4) s = (n / 1e4).toFixed(1) + '万';
  else s = Math.round(n) + '元';
  return (neg ? '-' : '') + s;
};
G.fmtKm = n => (n / 10000).toFixed(1) + '万公里';
// 谈价以百元为一步，不能把不同报价都四舍五入成同一个整数“万”。
G.fmtTrade = n => Math.abs(n) >= 10000 ? (n / 10000).toFixed(Math.round(n) % 100 === 0 ? 2 : 4) + '万' : Math.round(n) + '元';
