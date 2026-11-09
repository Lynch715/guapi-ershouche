/* =========================================================
 * 车辆引擎：生成、估值、评级
 *
 * 估值有三种"视角"，这是信息不对称玩法的核心：
 *   'true'   上帝视角：所有瑕疵都算（玩家看不到）
 *   'owner'  车行视角：车行已知的瑕疵（含自己掩盖的）
 *   'public' 买家视角：显性瑕疵 + 车行已知且没掩盖的
 * ========================================================= */
var G = globalThis.G = globalThis.G || {};

(function () {
  const def = id => G.FLAWS[id];

  function seen(f, view, extra) {
    if (f.fixed) return false;
    if (view === 'true') return true;
    if (def(f.id).visible) return true;
    if (extra && extra.has(f.id)) return true;
    if (view === 'owner') return f.known;
    return f.known && !f.concealed;
  }

  const curYear = () => G.CONFIG.startYear + Math.floor((G.state.month - 1) / 12);
  const ageMonths = car => (G.CONFIG.startYear - car.year) * 12 + (G.state.month - 1) + 6;

  function ageFactor(car) {
    const cat = G.CATEGORIES[car.catId];
    if (cat.classic) return cat.classicBase * Math.pow(1 + cat.appreciate, G.state.month - car.bornMonth);
    return Math.pow(cat.yearlyDep, ageMonths(car) / 12);
  }

  function km(car, view = 'owner', extra) {
    const mf = car.flaws.find(f => f.id === 'mileage');
    return mf && seen(mf, view, extra) ? car.mileage : car.mileageShown;
  }

  function value(car, view = 'public', extra) {
    const mileageFactor = G.clamp(1 - km(car, view, extra) / 600000, 0.55, 1);
    let v = car.newPrice * ageFactor(car) * mileageFactor * G.state.market[car.catId];
    for (const f of car.flaws) if (seen(f, view, extra)) v *= 1 - def(f.id).hit;
    return Math.round(v);
  }

  const ORDER = 'EDCBA';
  function grade(car, view = 'public') {
    let g = 'A';
    for (const f of car.flaws) {
      if (!seen(f, view)) continue;
      const fg = def(f.id).grade || 'B';
      if (ORDER.indexOf(fg) < ORDER.indexOf(g)) g = fg;
    }
    return g;
  }

  const mk = (id, known) => ({ id, known, concealed: false, fixed: false });

  /** opts: { catId 指定品类, flaw 强制加一个已知瑕疵, hiddenRate 覆盖隐性瑕疵概率 } */
  function generate(chId, opts = {}) {
    const s = G.state, ch = G.CHANNELS[chId];
    const weights = { ...(ch.catWeights || Object.fromEntries(Object.entries(G.CATEGORIES).map(([k, c]) => [k, c.weight]))) };
    // 门店越大，高端车源越多
    const premium = 1 + G.CONFIG.premiumPerLevel * (s.store.level - 1);
    for (const k of ['perf', 'lux', 'classic']) if (weights[k]) weights[k] *= premium;
    const catId = opts.catId || G.weighted(weights);
    const cat = G.CATEGORIES[catId];
    const age = cat.classic ? G.randInt(18, 30) : G.randInt(1, 7);
    const mileage = G.round(age * (cat.classic ? G.range(2000, 6000) : G.range(6000, 22000)), 100);
    const flaws = [];
    for (const v of G.VISIBLE_FLAWS) if (G.chance(ch.visibleRate * 0.5)) flaws.push(mk(v, true));
    if (opts.flaw) flaws.push(mk(opts.flaw, true));
    else if (ch.severe) flaws.push(mk(G.chance(0.6) ? 'majorAcc' : 'flood', true));
    else if (G.chance(opts.hiddenRate ?? ch.hiddenRate)) flaws.push(mk(G.weighted(G.HIDDEN_WEIGHTS), false));
    let mileageShown = mileage;
    if (mileage > 30000 && G.chance(ch.tamperRate)) {
      mileageShown = G.round(mileage * G.range(0.4, 0.65), 100);
      flaws.push(mk('mileage', false));
    }
    return {
      id: s.nextId++,
      name: `${G.pick(G.ORIGINS)}${cat.short}·${G.pick(G.MODEL_NAMES)}`,
      catId,
      newPrice: G.round(G.range(cat.newPrice[0], cat.newPrice[1])),
      year: curYear() - age,
      bornMonth: s.month,
      mileage, mileageShown, flaws,
      inspected: false,
      cost: 0, price: 0, warranty: 'none', monthsInStock: 0,
    };
  }

  /** 揭开所有隐性瑕疵，返回新发现的瑕疵名 */
  function reveal(car) {
    const found = [];
    for (const f of car.flaws) if (!f.known) { f.known = true; if (!f.fixed) found.push(def(f.id).name); }
    car.inspected = true;
    return found;
  }

  G.Car = { seen, value, grade, km, generate, reveal };
})();
