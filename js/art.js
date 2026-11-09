/* =========================================================
 * 美术渲染：车辆、门店、车库与首图。WebP 素材配合 SVG 染色，车辆保留矢量后备。
 *
 * 想换成自己的图片素材：在 G.ART_OVERRIDES 里填路径即可，例如
 *   G.ART_OVERRIDES.car.suv = 'assets/cars/suv.webp';
 *   G.ART_OVERRIDES.store[3] = 'assets/store/l3.webp';
 * 填了的用图片，没填的继续用矢量画。
 * ========================================================= */
var G = globalThis.G = globalThis.G || {};

G.ART_OVERRIDES = G.ART_OVERRIDES || { car: {}, store: {} };

/* 正式美术素材（assets/）。哪一组关掉（false）或者文件缺失，就退回矢量画。 */
G.ASSET_BASE = G.ASSET_BASE ?? 'assets/';
G.ASSET_PACK = G.ASSET_PACK || { cars: true, garage: true, store: true, staff: true, endings: true, ui: true };

// 开始页首图：a = 西瓜皮车与心虚车商；b = 现有车图代码拼装；c = 车行灯箱招牌。
// 只改这个字母即可切换，不影响经营、随机数和存档。
G.CONFIG.keyart = 'a';

(function () {
  /* ---------- 颜色工具 ---------- */
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const lighten = (c, t) => mix(c, '#ffffff', t);
  const darken = (c, t) => mix(c, '#000000', t);
  const lum = c => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  let uid = 0;
  const nid = p => `${p}${++uid}`;

  G.PAINTS = [
    { name: '珍珠白', c: '#e8eaee' }, { name: '曜石黑', c: '#25282e' }, { name: '星光银', c: '#a9b0ba' },
    { name: '中国红', c: '#c0302f' }, { name: '深海蓝', c: '#2a4d8a' }, { name: '钛灰', c: '#676d77' },
    { name: '香槟金', c: '#c5a467' }, { name: '墨绿', c: '#2e5b48' }, { name: '活力橙', c: '#e07a2e' },
  ];
  // 不同车型偏好的颜色（下标），用车辆 id 稳定地挑一个，不消耗随机数
  const PAINT_POOL = {
    family: [0, 1, 2, 5, 4, 0, 2], suv: [0, 1, 2, 5, 4, 7], ev: [0, 2, 4, 5, 0, 7],
    perf: [3, 8, 1, 0, 4, 3], lux: [1, 1, 0, 2, 5, 6], classic: [3, 7, 6, 0, 4, 8],
  };
  G.paintOf = car => {
    if (car.color !== undefined) return G.PAINTS[car.color];
    const pool = PAINT_POOL[car.catId] || [0];
    return G.PAINTS[pool[(car.id * 7919 + 13) % pool.length]];
  };

  /* ---------- 车型造型（侧视，车头朝右，viewBox 200×90，地面 y=80） ---------- */
  const SHAPES = {
    family: {
      body: 'M8,64 C8,56 14,52 24,51 L56,49 C66,40 76,33 92,32 L128,32 C142,32 152,40 162,48 L184,51 C192,52 194,58 194,64 L194,68 C194,71 192,72 189,72 L11,72 C9,72 8,71 8,68 Z',
      windows: ['M62,49 C70,41 78,36 92,36 L107,36 L107,49 Z', 'M111,36 L127,36 C137,36 146,42 154,49 L111,49 Z'],
      wheels: [44, 156], r: 12, belt: 56, head: [186, 53], tail: [9, 54], door: [108, 50, 70], mirror: [148, 46],
    },
    suv: {
      body: 'M8,68 L8,48 C8,44 10,42 16,42 L30,40 L42,24 C44,21 47,20 52,20 L132,20 C138,20 142,22 146,26 L162,40 L184,43 C190,44 194,48 194,56 L194,68 C194,71 192,72 189,72 L11,72 C9,72 8,71 8,68 Z',
      windows: ['M34,40 L45,26 C46,25 48,24 51,24 L74,24 L74,40 Z', 'M78,24 L106,24 L106,40 L78,40 Z', 'M110,24 L131,24 C135,24 138,25 141,28 L154,40 L110,40 Z'],
      wheels: [46, 156], r: 14, belt: 52, head: [186, 47], tail: [9, 46], door: [108, 41, 68], rails: true, cladding: true, mirror: [148, 37],
    },
    ev: {
      body: 'M10,66 C10,56 16,50 28,48 L44,46 C60,30 76,26 98,26 L122,26 C142,26 156,36 170,46 L184,49 C192,51 194,57 194,64 L194,68 C194,71 192,72 189,72 L13,72 C11,72 10,71 10,68 Z',
      windows: ['M50,46 C62,34 76,30 96,30 L104,30 L104,46 Z', 'M108,30 L120,30 C136,30 148,38 160,46 L108,46 Z'],
      wheels: [46, 154], r: 13, belt: 55, lightbar: true, aero: true, door: [106, 47, 70], mirror: [154, 43],
    },
    perf: {
      body: 'M6,64 C6,58 10,54 20,53 L48,51 C70,40 86,36 104,36 L118,36 C134,37 146,44 160,51 L188,55 C195,56 197,60 197,65 L197,68 C197,71 195,72 192,72 L9,72 C7,72 6,71 6,68 Z',
      windows: ['M64,50 C80,42 92,39 104,39 L116,39 C128,40 138,45 148,51 Z'],
      wheels: [44, 158], r: 13, belt: 60, head: [188, 57], tail: [7, 56], spoiler: true, caliper: true, door: [100, 52, 70], mirror: [142, 48],
    },
    lux: {
      body: 'M4,63 C4,55 12,51 22,50 L54,48 C66,38 78,31 96,30 L134,30 C148,30 158,38 166,47 L188,50 C196,51 198,57 198,63 L198,68 C198,71 196,72 193,72 L7,72 C5,72 4,71 4,68 Z',
      windows: ['M60,48 C68,40 76,35 90,34 L98,34 L98,48 Z', 'M102,34 L118,34 L118,48 L102,48 Z', 'M122,34 L134,34 C144,34 152,40 160,48 L122,48 Z'],
      wheels: [44, 160], r: 13, belt: 56, head: [190, 52], tail: [5, 53], chrome: true, door: [120, 49, 70], mirror: [154, 45],
    },
    classic: {
      body: 'M10,66 C10,58 12,54 18,52 C24,46 34,44 46,46 L58,46 C66,34 78,30 94,30 L118,30 C132,30 140,36 148,46 L162,46 C174,44 184,48 188,54 C192,56 194,60 194,66 L194,69 C194,71 193,72 191,72 L13,72 C11,72 10,71 10,69 Z',
      windows: ['M64,46 C70,37 80,34 92,34 L104,34 L104,46 Z', 'M108,34 L117,34 C127,34 134,38 140,46 L108,46 Z'],
      wheels: [44, 160], r: 12, belt: 57, head: [188, 54], tail: [11, 56], bumpers: true, whitewall: true, round: true, door: [106, 47, 70], mirror: [134, 43],
    },
  };

  function wheel(x, r, sh, opts) {
    const y = 72, tire = opts.oldTires ? '#3a2f28' : '#15171b';
    let s = `<circle cx="${x}" cy="${y}" r="${r + 2.5}" fill="#0b0c0e"/>`;           // 轮拱阴影
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${tire}"/>`;
    if (opts.oldTires) s += `<path d="M${x - r + 2},${y - 2} l3,1 M${x + r - 4},${y + 3} l3,-2 M${x - 2},${y + r - 2} l2,-3" stroke="#6b5a4a" stroke-width="0.8"/>`;
    if (sh.whitewall) s += `<circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="#e9e6dc"/>`;
    const rim = r * (sh.whitewall ? 0.55 : 0.68);
    s += `<circle cx="${x}" cy="${y}" r="${rim}" fill="url(#rim)"/>`;
    if (sh.aero) {
      s += `<circle cx="${x}" cy="${y}" r="${rim * 0.92}" fill="#c9ced6"/><path d="M${x - rim * 0.6},${y} A${rim * 0.6},${rim * 0.6} 0 0 1 ${x + rim * 0.6},${y}" stroke="#8a919b" stroke-width="1.2" fill="none"/>`;
    } else {
      const n = sh.round ? 8 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        s += `<line x1="${x}" y1="${y}" x2="${(x + Math.cos(a) * rim * 0.95).toFixed(1)}" y2="${(y + Math.sin(a) * rim * 0.95).toFixed(1)}" stroke="#5b616b" stroke-width="${sh.round ? 0.7 : 1.6}"/>`;
      }
    }
    if (sh.caliper) s += `<path d="M${x + rim * 0.3},${y - rim * 0.75} a${rim * 0.8},${rim * 0.8} 0 0 1 ${rim * 0.5},${rim * 0.5}" stroke="#d63a2f" stroke-width="2.2" fill="none"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${rim * 0.2}" fill="#3a3f47"/>`;
    return s;
  }

  /**
   * 画一台车。view：'public' 买家眼中（掩盖的问题看不见），'owner' 车行所知
   * opts.size: 宽度像素；opts.plain: 不画瑕疵
   */
  G.Art = {};

  /* ---------- 素材版渲染 ----------
   * 车身：白车底图 + 只在「车漆遮罩」范围内叠一层正片叠底的颜色（SVG 滤镜，双击打开的本地网页也能用）
   * 遮罩由 tools/make_paint_masks.py 生成：车窗、车灯、轮胎轮毂不会被染色
   */
  G.ASSET_EXT = 'webp';
  const A = p => G.ASSET_BASE + (p.startsWith('icon/') ? p : p + '.' + G.ASSET_EXT);
  G.assetPath = A;
  const MODELS = ['family', 'suv', 'ev', 'perf', 'lux', 'classic'];
  const tintColor = c => (lum(c) < 0.2 ? lighten(c, 0.12) : c);   // 纯黑叠出来会糊成一片，稍微提亮
  G.Art.ensureDefs = function () {
    if (typeof document === 'undefined' || document.getElementById('art-defs')) return;
    let d = '';
    G.PAINTS.forEach((p, i) => {
      d += `<filter id="artTint${i}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feFlood flood-color="${tintColor(p.c)}"/><feComposite in2="SourceAlpha" operator="in"/><feBlend in="SourceGraphic" mode="multiply"/></filter>`;
    });
    const mask = (id, href, w, h, type) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" style="mask-type:${type}"><image href="${href}" width="${w}" height="${h}"/></mask>`;
    for (const m of MODELS) {
      for (const v of ['base', 'flood', 'crash']) {
        d += mask(`artPaint_${m}_${v}`, A(`cars/${m}_${v}_paint`), 1200, 540, 'luminance');
        d += mask(`artAlpha_${m}_${v}`, A(`cars/${m}_${v}`), 1200, 540, 'alpha');
      }
      d += mask(`artTopPaint_${m}`, A(`garage/top_${m}_paint`), 200, 400, 'luminance');
    }
    const el = document.createElement('div');
    el.innerHTML = `<svg id="art-defs" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true"><defs>${d}</defs></svg>`;
    document.body.appendChild(el.firstChild);
  };
  const paintIndex = car => Math.max(0, G.PAINTS.indexOf(G.paintOf(car)));

  // 各车型原图轮心位置（1200×540），只把老化贴图缩放到轮胎，不覆盖车门。
  const TIRES = { family: [[270,377,86],[945,373,89]], suv: [[256,400,99],[972,401,99]],
    ev: [[270,378,92],[948,378,92]], perf: [[251,367,92],[947,367,92]],
    lux: [[281,381,89],[959,379,90]], classic: [[244,406,93],[950,406,93]] };
  const failed = new Set(), preloaded = new Set();
  G.Art.preload = function (location = 'suburb') {
    if (typeof Image === 'undefined') return;
    const paths = [];
    if (G.ASSET_PACK.cars) for (const m of MODELS) for (const variant of ['base', 'flood', 'crash']) paths.push(`cars/${m}_${variant}`, `cars/${m}_${variant}_paint`);
    if (G.ASSET_PACK.cars) paths.push('cars/decal_tire', 'cars/decal_dirt', 'cars/decal_scratch');
    if (G.ASSET_PACK.store) paths.push(`store/bg_${location}`, 'store/store_l1', 'store/store_l2');
    for (const path of paths) {
      const src = A(path); if (preloaded.has(src)) continue; preloaded.add(src);
      const img = new Image(); img.onerror = () => { failed.add(src); }; img.src = src;
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('error', e => {
    const el = e.target, src = el.getAttribute?.('href') || el.getAttribute?.('src');
    if (!src) return;
    failed.add(src);
    const picture = el.closest('.car-picture');
    if (picture) {
      picture.querySelector('.asset-picture').hidden = true;
      picture.querySelector('.vector-picture').hidden = false;
    } else if (el.tagName?.toLowerCase() === 'img') el.style.display = 'none';
  }, true);

  function assetCar(car, opts) {
    G.Art.ensureDefs();
    const m = MODELS.includes(car.catId) ? car.catId : 'family';
    const has = fid => !opts.plain && car.flaws && car.flaws.some(f => f.id === fid && !f.fixed && (G.FLAWS[fid].visible || (f.known && !f.concealed)));
    const v = has('flood') ? 'flood' : has('majorAcc') ? 'crash' : 'base';
    const w = opts.size || 160, src = A(`cars/${m}_${v}`);
    if (failed.has(src) || failed.has(A(`cars/${m}_${v}_paint`))) return vectorCar(car, opts);
    let s = `<svg class="art-car" viewBox="0 0 1200 540" width="${w}" height="${Math.round(w * 0.45)}" xmlns="http://www.w3.org/2000/svg">
      <image href="${src}" width="1200" height="540"/>
      <image href="${src}" width="1200" height="540" filter="url(#artTint${paintIndex(car)})" mask="url(#artPaint_${m}_${v})"/>`;
    if (has('dirty')) s += `<g mask="url(#artAlpha_${m}_${v})" opacity="0.75"><image href="${A('cars/decal_dirt')}" width="1200" height="540"/></g>`;
    if (has('scratch')) s += `<g mask="url(#artAlpha_${m}_${v})" opacity="0.55"><image href="${A('cars/decal_scratch')}" width="1200" height="540"/></g>`;
    if (has('tires')) s += `<g mask="url(#artAlpha_${m}_${v})" opacity="0.65">${TIRES[m].map(([x,y,r]) => `<image href="${A('cars/decal_tire')}" x="${x-r}" y="${y-r}" width="${r*2}" height="${r*2}"/>`).join('')}</g>`;
    return `<span class="car-picture"><span class="asset-picture">${s}</svg></span><span class="vector-picture" hidden>${vectorCar(car, opts)}</span></span>`;
  }

  G.Art.car = function (car, opts = {}) {
    if (G.ASSET_PACK.cars && !G.ART_OVERRIDES.car[car.catId]) return assetCar(car, opts);
    const ov = G.ART_OVERRIDES.car[car.catId];
    if (ov && !failed.has(ov)) return `<span class="car-picture"><span class="asset-picture"><img class="art-img" src="${ov}" alt="车辆" style="width:${opts.size || 160}px"></span><span class="vector-picture" hidden>${vectorCar(car, opts)}</span></span>`;
    return vectorCar(car, opts);
  };
  function vectorCar(car, opts = {}) {
    const sh = SHAPES[car.catId] || SHAPES.family;
    const paint = G.paintOf(car).c;
    const id = nid('c');
    const has = fid => !opts.plain && car.flaws && car.flaws.some(f => f.id === fid && !f.fixed && (G.FLAWS[fid].visible || (f.known && !f.concealed)));
    const flood = has('flood'), crash = has('majorAcc');
    const w = opts.size || 160;
    let s = `<svg class="art-car" viewBox="0 0 200 90" width="${w}" height="${(w * 0.45).toFixed(0)}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${lighten(paint, 0.35)}"/><stop offset="0.45" stop-color="${paint}"/><stop offset="1" stop-color="${darken(paint, 0.45)}"/>
        </linearGradient>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9fb3c8"/><stop offset="0.5" stop-color="#2b3644"/><stop offset="1" stop-color="#151b23"/>
        </linearGradient>
        <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5a7a8a" stop-opacity="0"/><stop offset="0.25" stop-color="#5b5a3e" stop-opacity="0.75"/><stop offset="1" stop-color="#3b3226" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="81" rx="92" ry="5" fill="#000" opacity="0.45"/>
      <path d="${sh.body}" fill="url(#${id}b)" stroke="${lum(paint) < 0.3 ? '#8a919c' : darken(paint, 0.55)}" stroke-width="${lum(paint) < 0.3 ? 1 : 0.8}"/>`;
    // 腰线高光
    s += `<path d="M${sh.wheels[0] - 30},${sh.belt} L${sh.wheels[1] + 30},${sh.belt}" stroke="${lighten(paint, 0.5)}" stroke-width="0.8" opacity="0.6"/>`;
    if (sh.cladding) s += `<path d="M8,64 L194,64 L194,68 C194,71 192,72 189,72 L11,72 C9,72 8,71 8,68 Z" fill="#23262b" opacity="0.85"/>`;
    // 车窗
    for (const wpath of sh.windows) s += `<path d="${wpath}" fill="url(#${id}g)" stroke="#0d1014" stroke-width="0.6"/>`;
    if (sh.lightbar) s += `<path d="M106,30 L106,46" stroke="${darken(paint, 0.3)}" stroke-width="2"/>`;
    // 门缝
    if (sh.door) s += `<path d="M${sh.door[0]},${sh.door[1]} L${sh.door[0] + 2},${sh.door[2]}" stroke="${darken(paint, 0.5)}" stroke-width="0.6" opacity="0.8"/>`;
    // 车灯
    if (sh.lightbar) {
      s += `<rect x="182" y="51" width="12" height="2.2" rx="1" fill="#e8f4ff"/><rect x="10" y="53" width="10" height="2" rx="1" fill="#ff3b3b"/>`;
    } else {
      s += crash ? '' : `<path d="M${sh.head[0]},${sh.head[1]} l7,0.5 l-0.5,3.5 l-6,-0.5 Z" fill="#f4f1d8"/>`;
      s += `<path d="M${sh.tail[0]},${sh.tail[1]} l5,0 l0,4 l-5,0 Z" fill="#c42424"/>`;
    }
    if (sh.chrome) s += `<path d="M18,61 L188,61" stroke="#e3e6ea" stroke-width="1.2" opacity="0.9"/>`;
    if (sh.bumpers) s += `<rect x="186" y="62" width="10" height="4" rx="2" fill="#dfe3e8"/><rect x="6" y="62" width="10" height="4" rx="2" fill="#dfe3e8"/>`;
    if (sh.rails) s += `<path d="M52,18 L132,18" stroke="#2a2d33" stroke-width="2.4" stroke-linecap="round"/>`;
    if (sh.spoiler) s += `<path d="M6,47 L28,46 L28,49 L8,50 Z" fill="${darken(paint, 0.35)}"/><path d="M18,49 L18,53" stroke="#1a1c20" stroke-width="2"/>`;
    // 后视镜、门把手
    if (sh.mirror) s += `<path d="M${sh.mirror[0]},${sh.mirror[1]} l7,-2 l1,4 l-7,1 Z" fill="${darken(paint, 0.2)}" stroke="${darken(paint, 0.5)}" stroke-width="0.4"/>`;
    if (sh.door) s += `<rect x="${sh.door[0] + 6}" y="${sh.belt - 1}" width="7" height="1.6" rx="0.8" fill="${lighten(paint, 0.45)}" opacity="0.8"/>`;
    // 轮子
    for (const x of sh.wheels) s += wheel(x, sh.r, sh, { oldTires: has('tires') });

    /* ---------- 瑕疵叠加 ---------- */
    if (has('scratch')) {
      const x0 = sh.wheels[0] + 18;
      s += `<path d="M${x0},${sh.belt + 2} l14,4 l-6,1 l16,3 M${x0 + 4},${sh.belt + 7} l18,2 M${x0 + 30},${sh.belt + 1} l10,5" stroke="#f1f1f1" stroke-width="0.9" opacity="0.85" fill="none" stroke-linecap="round"/>`;
    }
    if (has('dirty')) {
      for (const [dx, dy, rr] of [[20, 66, 4], [60, 68, 5], [96, 67, 3.5], [130, 69, 4.5], [172, 66, 3], [80, 62, 2.5]]) s += `<ellipse cx="${dx}" cy="${dy}" rx="${rr * 1.6}" ry="${rr * 0.7}" fill="#5a4630" opacity="0.55"/>`;
    }
    if (flood) {
      s += `<clipPath id="${id}cl"><path d="${sh.body}"/></clipPath><rect x="0" y="52" width="200" height="22" fill="url(#${id}w)" clip-path="url(#${id}cl)"/>`;
      s += `<path d="M4,55 Q30,53 56,55 T110,55 T160,54 T198,55" stroke="#2f2a1f" stroke-width="0.8" fill="none" opacity="0.8"/>`;
    }
    if (crash) {
      const fx = sh.wheels[1] + sh.r + 4;
      s += `<path d="M${fx},${sh.belt - 10} l8,3 l-3,4 l7,2 l-5,4 l6,3 l-3,6 l-10,2 Z" fill="#1c1d20" opacity="0.92"/>`;
      s += `<path d="M${fx - 8},${sh.belt - 6} l5,4 l-3,3 l5,4" stroke="#0b0b0c" stroke-width="1" fill="none"/>`;
      const fw = sh.windows[sh.windows.length - 1];
      const m = fw.match(/M(\d+),(\d+)/);
      if (m) s += `<path d="M${+m[1] + 18},${+m[2] + 3} l4,4 l-3,3 l5,3 M${+m[1] + 22},${+m[2] + 7} l6,-1" stroke="#cfe2f2" stroke-width="0.7" fill="none" opacity="0.9"/>`;
    }
    s += `<defs><radialGradient id="rim" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#eef1f4"/><stop offset="1" stop-color="#7d848e"/></radialGradient></defs></svg>`;
    return s;
  };

  /* ---------- 车库：停车场俯视图 ---------- */
  function topCar(x, y, w, h, color) {
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.35}" fill="${color}" stroke="${lum(color) < 0.3 ? '#8a919c' : darken(color, 0.5)}" stroke-width="0.8"/>
      <rect x="${x + w * 0.15}" y="${y + h * 0.22}" width="${w * 0.7}" height="${h * 0.16}" rx="1.5" fill="#1d2630"/>
      <rect x="${x + w * 0.18}" y="${y + h * 0.66}" width="${w * 0.64}" height="${h * 0.12}" rx="1.5" fill="#1d2630"/>
      <rect x="${x + w * 0.12}" y="${y + h * 0.4}" width="${w * 0.76}" height="${h * 0.24}" rx="2" fill="${lighten(color, 0.15)}"/></g>`;
  }
  function assetGarage(cars, capacity) {
    G.Art.ensureDefs();
    const shown = Math.min(capacity, 45);
    const cols = shown <= 8 ? shown : shown <= 20 ? 10 : 15;
    const rows = Math.ceil(shown / cols);
    const cw = 100, ch = 200, gap = 26, pad = 18;
    const W = cols * cw + pad * 2, H = rows * ch + (rows - 1) * gap + pad * 2;
    let s = `<svg class="art-garage" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" rx="22" fill="#15161a"/>`;
    for (let i = 0; i < shown; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = pad + c * cw, y = pad + r * (ch + gap);
      s += `<image href="${A('garage/garage_stall')}" x="${x}" y="${y}" width="${cw}" height="${ch}" preserveAspectRatio="none"/>`;
      const car = cars[i];
      if (car) {
        const m = MODELS.includes(car.catId) ? car.catId : 'family';
        const t = `translate(${x + cw * 0.08},${y + ch * 0.06}) scale(${(cw * 0.84) / 200})`;
        s += `<g transform="${t}"><image href="${A(`garage/top_${m}`)}" width="200" height="400"/>
          <image href="${A(`garage/top_${m}`)}" width="200" height="400" filter="url(#artTint${paintIndex(car)})" mask="url(#artTopPaint_${m})"/></g>`;
      } else {
        s += `<text x="${x + cw / 2}" y="${y + ch / 2 + 10}" font-size="30" text-anchor="middle" fill="#e2b866" opacity="0.35">${i + 1}</text>`;
      }
    }
    if (capacity > shown) s += `<text x="${W - 24}" y="${H - 18}" font-size="26" text-anchor="end" fill="#8b8f99">另有 ${capacity - shown} 个车位</text>`;
    return s + '</svg>';
  }
  G.Art.garage = function (cars, capacity) {
    if (G.ASSET_PACK.garage) return assetGarage(cars, capacity);
    const shown = Math.min(capacity, 45);
    const cols = shown <= 8 ? shown : shown <= 20 ? 10 : 15;
    const rows = Math.ceil(shown / cols);
    const cw = 22, ch = 38, pad = 10, W = cols * cw + pad * 2, H = rows * (ch + 14) + pad * 2 + 6;
    let s = `<svg class="art-garage" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" rx="10" fill="#1a1c20"/>
      <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="#26292f"/>`;
    for (let i = 0; i < shown; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = pad + c * cw, y = pad + r * (ch + 14) + 4;
      s += `<path d="M${x},${y} L${x},${y + ch} M${x + cw},${y} L${x + cw},${y + ch}" stroke="#e2b866" stroke-width="0.8" opacity="0.55"/>`;
      const car = cars[i];
      if (car) s += topCar(x + 3.5, y + 4, cw - 7, ch - 8, G.paintOf(car).c);
      else s += `<text x="${x + cw / 2}" y="${y + ch / 2 + 3}" font-size="7" text-anchor="middle" fill="#4a4e57">${i + 1}</text>`;
    }
    if (capacity > shown) s += `<text x="${W - 12}" y="${H - 10}" font-size="9" text-anchor="end" fill="#8b8f99">另有 ${capacity - shown} 个车位</text>`;
    return s + '</svg>';
  };

  /* ---------- 头像、结局、主视觉 ---------- */
  G.Art.staffGender = e => e.gender || (/姐/.test(e.name) ? 'f' : (/经理|师傅|会计/.test(e.name) ? (e.id % 2 ? 'f' : 'm') : (e.id % 3 ? 'm' : 'f')));
  G.Art.avatar = function (e) {
    if (!G.ASSET_PACK.staff) return null;
    return `<img class="avatar-img" src="${A(`staff/staff_${e.role}_${G.Art.staffGender(e)}`)}" alt="">`;
  };
  G.Art.ending = function (id) {
    if (!G.ASSET_PACK.endings) return null;
    return `<img class="ending-img" src="${A(`endings/ending_${id}`)}" alt="">`;
  };
  G.Art.keyart = function () {
    const choice = ['a', 'b', 'c'].includes(G.CONFIG.keyart) ? G.CONFIG.keyart : 'a';
    const variant = G.ASSET_PACK.ui ? choice : 'b';
    const car = (catId, color, place) => `<div class="keyart-car keyart-car-${place}">${G.Art.car({ id: 400 + color, catId, color, flaws: [] }, { size: 480, plain: true })}<i class="keyart-price"></i>${place === 'front' ? '<i class="keyart-rind"></i>' : ''}</div>`;
    const scene = variant === 'b'
      ? `<div class="keyart-code-scene" aria-hidden="true"><div class="keyart-ground"></div>${car('classic', 6, 'back')}${car('suv', 3, 'middle')}${car('family', 7, 'front')}</div>`
      : `<picture class="keyart-picture"><source media="(min-width: 1000px)" srcset="${A(`ui/keyart_${variant}_desktop`)}"><img src="${A(`ui/keyart_${variant}_mobile`)}" width="1122" height="1402" alt="" fetchpriority="high" decoding="async"></picture>`;
    return `<section class="keyart keyart-${variant}" data-keyart="${variant}" aria-labelledby="start-title">${scene}<div class="keyart-copy"><h1 id="start-title" class="keyart-title"><span>瓜皮</span>二手车</h1><p class="keyart-subtitle">二手车商模拟器</p><p class="keyart-tagline">钱和良心，总得守住一个。</p></div></section>`;
  };

  /* ---------- 门店场景 ---------- */
  function sky(loc, W, H) {
    let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1220"/><stop offset="1" stop-color="#2a2433"/></linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe7b5"/><stop offset="0.6" stop-color="#e9c47c"/><stop offset="1" stop-color="#b8904c"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#sky)"/>`;
    // 星星
    for (let i = 0; i < 24; i++) s += `<circle cx="${(i * 73) % W}" cy="${(i * 37) % 60 + 4}" r="${i % 3 ? 0.6 : 1}" fill="#fff" opacity="${0.3 + (i % 4) * 0.12}"/>`;
    if (loc === 'city') {
      // 市区天际线
      const bs = [[0, 70, 30], [28, 50, 26], [52, 82, 22], [72, 40, 34], [104, 64, 24], [126, 30, 30], [154, 58, 22], [174, 46, 28], [200, 74, 26], [224, 36, 30], [252, 60, 24], [274, 44, 32], [304, 68, 26], [328, 52, 32]];
      for (const [x, y, w] of bs) {
        s += `<rect x="${x}" y="${y}" width="${w}" height="${H - y}" fill="#171c2b"/>`;
        for (let wy = y + 6; wy < 120; wy += 8) for (let wx = x + 4; wx < x + w - 4; wx += 6) if ((wx * wy) % 5 < 2) s += `<rect x="${wx}" y="${wy}" width="2.5" height="3" fill="#f2c96b" opacity="0.55"/>`;
      }
    } else if (loc === 'suburb') {
      // 城郊：厂房、烟囱、树
      s += `<path d="M0,150 L0,96 L40,96 L40,82 L70,96 L70,82 L100,96 L100,150 Z" fill="#252a36"/>
        <rect x="80" y="50" width="9" height="46" fill="#252a36"/><path d="M84,46 q6,-8 0,-16 q-6,-8 2,-14" stroke="#3a3f4c" stroke-width="3" fill="none" opacity="0.6"/>
        <rect x="262" y="58" width="8" height="38" fill="#252a36"/>
        <path d="M240,150 L240,94 L300,94 L300,80 L360,94 L360,150 Z" fill="#252a36"/>`;
      for (let i = 0; i < 6; i++) s += `<rect x="${8 + i * 14}" y="104" width="6" height="4" fill="#f2c96b" opacity="0.4"/><rect x="${248 + i * 18}" y="102" width="6" height="4" fill="#f2c96b" opacity="0.4"/>`;
      for (const [x, y] of [[112, 128], [128, 124], [222, 126], [236, 130]]) s += `<circle cx="${x}" cy="${y}" r="11" fill="#1f3029"/><rect x="${x - 1.5}" y="${y}" width="3" height="22" fill="#1f3029"/>`;
    } else {
      // 汽车城：一排车行和旗帜
      for (const [x, w, c] of [[0, 70, '#1d2230'], [74, 60, '#20202c'], [262, 52, '#1d2230'], [318, 50, '#22202a']]) {
        s += `<rect x="${x}" y="80" width="${w}" height="40" fill="${c}"/><rect x="${x + 6}" y="86" width="${w - 12}" height="6" fill="#3b82f6" opacity="0.5"/>`;
      }
      for (const x of [150, 170, 190, 210, 230, 250]) s += `<path d="M${x},64 L${x},100" stroke="#3a3f4b" stroke-width="1"/><path d="M${x},64 l10,3 l-10,3 Z" fill="${['#e2b866', '#ef5350', '#3b82f6'][x % 3]}" opacity="0.8"/>`;
    }
    return s;
  }
  function building(level) {
    // 返回 [svg, 招牌中心x, 招牌y]
    const gold = '#e2b866';
    const glass = (x, y, w, h) => {
      let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#glass)"/>`;
      // 展厅里的车
      for (let cx = x + 6; cx + 44 < x + w; cx += 52) g += `<g transform="translate(${cx},${y + h - 2}) scale(0.24)" opacity="0.55">${carSilhouette('#3b2f1e')}</g>`;
      // 竖框和反光
      g += Array.from({ length: Math.floor(w / 26) }, (_, i) => `<path d="M${x + (i + 1) * 26},${y} L${x + (i + 1) * 26},${y + h}" stroke="#2a2418" stroke-width="1.5"/>`).join('');
      g += `<path d="M${x + w * 0.15},${y} L${x + w * 0.05},${y + h} M${x + w * 0.22},${y} L${x + w * 0.12},${y + h} M${x + w * 0.62},${y} L${x + w * 0.52},${y + h}" stroke="#fff" stroke-width="3" opacity="0.12"/>`;
      return g + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#1a1610" stroke-width="2"/>`;
    };
    const sign = (x, y, w, text, big) => `<rect x="${x}" y="${y}" width="${w}" height="${big ? 16 : 12}" rx="2" fill="#141518" stroke="${gold}" stroke-width="1"/>
      <text x="${x + w / 2}" y="${y + (big ? 12 : 9)}" font-size="${big ? 10 : 8}" text-anchor="middle" fill="${gold}" font-weight="700" letter-spacing="1">${text}</text>`;
    switch (level) {
      case 1: return `
        <rect x="120" y="92" width="120" height="58" fill="#3a3530"/><path d="M114,92 L180,74 L246,92 Z" fill="#2c2722"/>
        <rect x="132" y="108" width="54" height="42" fill="#5c5650"/>${Array.from({ length: 6 }, (_, i) => `<path d="M132,${112 + i * 6} L186,${112 + i * 6}" stroke="#46413b" stroke-width="1.2"/>`).join('')}
        <rect x="196" y="110" width="30" height="22" fill="#f3d79a" opacity="0.8"/><rect x="198" y="132" width="10" height="18" fill="#2a2622"/>
        ${sign(140, 95, 84, '二手车行')}
        <path d="M120,92 l-14,8 M240,92 l14,8" stroke="#555" stroke-width="0.8"/>`;
      case 2: return `
        <rect x="90" y="84" width="180" height="66" fill="#2f3138"/>
        ${glass(100, 104, 110, 46)}<rect x="218" y="104" width="42" height="46" fill="#4d4f57"/>
        <rect x="86" y="80" width="188" height="6" fill="#1d1e22"/>${sign(126, 88, 108, '二手车行 · 精品车源')}`;
      case 3: return `
        <path d="M70,150 L70,72 L230,62 L290,72 L290,150 Z" fill="#23252b"/>
        ${glass(82, 92, 196, 58)}
        <path d="M70,72 L230,62 L290,72" stroke="${gold}" stroke-width="2" fill="none"/>
        ${sign(130, 72, 100, '二手车精品展厅', true)}
        ${[60, 300].map(x => `<path d="M${x},150 L${x},70" stroke="#666" stroke-width="1"/><path d="M${x},70 l14,4 l-14,4 Z" fill="${gold}"/>`).join('')}`;
      case 4: return [[30, 0.85], [190, 1]].map(([x, k]) => `
        <g transform="translate(${x},${150 - 150 * k}) scale(${k})">
          <path d="M10,150 L10,82 L150,72 L150,150 Z" fill="#23252b"/>${glass(18, 98, 124, 52)}
          <path d="M10,82 L150,72" stroke="${gold}" stroke-width="2"/>${sign(40, 80, 84, x > 100 ? '旗舰店' : '一号店')}
        </g>`).join('');
      default: return `
        <rect x="150" y="20" width="64" height="130" fill="#1f2228"/>
        ${Array.from({ length: 10 }, (_, i) => `<rect x="156" y="${28 + i * 12}" width="52" height="7" fill="#f3d79a" opacity="${0.4 + (i % 3) * 0.2}"/>`).join('')}
        <rect x="150" y="16" width="64" height="6" fill="${gold}"/>
        ${sign(152, 4, 60, '集团总部')}
        <path d="M30,150 L30,94 L150,86 L150,150 Z" fill="#23252b"/>${glass(38, 108, 106, 42)}
        <path d="M214,150 L214,86 L334,94 L334,150 Z" fill="#23252b"/>${glass(220, 108, 106, 42)}
        <path d="M30,94 L150,86 M214,86 L334,94" stroke="${gold}" stroke-width="2"/>`;
    }
  }
  G.Art.store = function (level, loc, opts = {}) {
    if (G.ASSET_PACK.store && !G.ART_OVERRIDES.store[level]) {
      return `<div class="store-scene" style="background-image:url('${A(`store/bg_${loc}`)}')">${opts.empty ? '' : `<img class="store-building l${level}" src="${A(`store/store_l${level}`)}" alt="">`}</div>`;
    }
    const ov = G.ART_OVERRIDES.store[level];
    if (ov) return `<img class="art-img wide" src="${ov}" alt="">`;
    const W = 360, H = 180;
    let s = `<svg class="art-store" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">`;
    s += sky(loc, W, H);
    s += `<rect x="0" y="150" width="${W}" height="30" fill="#1b1c20"/><path d="M0,150 L${W},150" stroke="#3a3d45"/>`;
    for (let x = 6; x < W; x += 34) s += `<rect x="${x}" y="170" width="18" height="2" fill="#e2b866" opacity="0.35"/>`;
    if (!opts.empty) {
      s += building(level);
      // 门口停的车：等级越高越多
      const n = [0, 2, 3, 4, 5, 6][level] || 2;
      const colors = ['#e8eaee', '#c0302f', '#25282e', '#2a4d8a', '#a9b0ba', '#c5a467'];
      for (let i = 0; i < n; i++) s += `<g transform="translate(${16 + i * (330 / n)},150) scale(0.3)">${carSilhouette(colors[i % colors.length])}</g>`;
    }
    return s + '</svg>';
  };
  // 门店场景里用的小车（简单剪影，比完整车省很多节点）
  function carSilhouette(color) {
    const sh = SHAPES.family;
    return `<g transform="translate(0,-82)"><path d="${sh.body}" fill="${color}" stroke="${darken(color, 0.5)}"/>
      ${sh.windows.map(w => `<path d="${w}" fill="#1d2630"/>`).join('')}
      ${sh.wheels.map(x => `<circle cx="${x}" cy="72" r="12" fill="#111"/><circle cx="${x}" cy="72" r="6" fill="#9aa0a8"/>`).join('')}
      <path d="M186,53 l7,0.5 l-0.5,3.5 l-6,-0.5 Z" fill="#fff6c8"/></g>`;
  }
})();
