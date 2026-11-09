/* =========================================================
 * 无界面模拟：让几种 AI 策略各跑 N 局，输出成长曲线，用来调数值。
 * 用法：node tools/sim.js [局数=200] [最多月数=120] [难度=small] [地段=suburb]
 * ========================================================= */
const path = require('path');
for (const f of ['data', 'util', 'car', 'game', 'staff', 'finance', 'events']) require(path.join(__dirname, '..', 'js', f + '.js'));
const G = globalThis.G;

/* 临时覆盖参数做对比实验，例如：
 * PATCH='{"CUSTOMER.willing":[1,1.15],"STORE_LEVELS.3.wages":100000}' node tools/sim.js */
if (process.env.PATCH) {
  for (const [k, v] of Object.entries(JSON.parse(process.env.PATCH))) {
    const keys = k.split('.'); let o = G;
    keys.slice(0, -1).forEach(x => { o = o[x]; });
    o[keys[keys.length - 1]] = v;
  }
}
const RUNS = process.env.DEBUG || process.env.NORUN ? 0 : (+process.argv[2] || 200);
const MONTHS = +process.argv[3] || 120;
const DIFF = process.argv[4] || 'small';
const LOC = process.argv[5] || 'suburb';
const CHECKPOINTS = [12, 36, 60, 96, 120].filter(m => m <= MONTHS);

const S = () => G.state;
const USE_FIN = process.env.NOFIN ? false : true;   // NOFIN=1 关掉机器人的贷款行为做对照
const GREY_MIN_GAIN = +(process.env.GREY_MIN_GAIN || 40000);   // 差价低于这个就不值得冒险
const GREY_WRECK = +(process.env.GREY_WRECK || 0.5);   // 去事故车拖车场的比例
const GREY_CAP = process.env.GREY_CAP !== undefined ? +process.env.GREY_CAP : 50;   // 黑心机器人愿意把黑化推到多高

/* ---------- 共用动作 ---------- */
function shop(chId, { inspect, maxRatio, keepCash }) {
  const s = S();
  if (s.over || s.cars.length >= G.capacity() || s.ap < G.CHANNELS[chId].ap) return false;
  if (!G.act.visit(chId).ok) return false;
  if (inspect && !G.CHANNELS[chId].blind && s.ap >= 1) G.act.inspectVisit();
  const offers = s.visit.offers.map((o, i) => ({ i, ratio: G.offerPrice(o) / G.Car.value(o.car, 'owner') })).sort((a, b) => b.i - a.i);
  for (const { i, ratio } of offers) {
    const o = s.visit.offers[i];
    if (ratio <= maxRatio && s.cash - G.offerPrice(o) > keepCash) G.act.buyOffer(i);
  }
  G.act.closeVisit();
  return true;
}
function fixWorthIt(car) {
  for (const sid of ['clean', 'paint', 'parts', 'repair']) {
    if (G.serviceBlock(car, sid) || S().ap < G.SERVICES[sid].ap) continue;
    const before = G.Car.value(car, 'public'), cost = G.serviceCost(car, sid);
    // 估算修完后的估值
    const snap = JSON.parse(JSON.stringify(car.flaws));
    car.flaws.forEach(f => { if (!f.fixed && ((G.SERVICES[sid].fixes || []).includes(f.id) || (sid === 'repair' && f.known && G.FLAWS[f.id].repairRate))) f.fixed = true; });
    const after = G.Car.value(car, 'public');
    car.flaws = snap;
    if (after - before > cost * 1.2) G.act.service(car.id, sid);
  }
}
/** 按岗位优先级招人：want = { 岗位: 目标人数 }，按顺序填满，同岗位挑等级最高的 */
function hireByPlan(want) {
  const s = S();
  for (const [role, n] of Object.entries(want)) {
    while (s.staff.length < G.Staff.slots() && G.Staff.list(role).length < n) {
      const c = s.candidates.filter(x => x.role === role).sort((a, b) => b.level - a.level)[0];
      if (!c || s.cash < G.monthlyFixedCost() * 4 + c.salary * 6) break;
      if (!G.act.hire(c.id).ok) return;      // 局已结束等情况：招不进来就别再试
    }
  }
}
function staffPlan(order) {
  // 按编制比例分配：order = [[岗位, 比例], ...]
  const slots = G.Staff.slots(), plan = {};
  for (const [role, share] of order) plan[role] = Math.max(1, Math.round(slots * share));
  return plan;
}
/** 用门店贷补差价升级 */
function upgradeWithLoan(mult) {
  const s = S(), next = G.STORE_LEVELS[s.store.level + 1];
  if (!next || s.cars.length < G.capacity() * 0.7 || s.loans.length) return;
  const need = next.upgradeCost * mult - s.cash;
  if (need > 0 && need <= G.Finance.limit('store')) G.act.borrow('store', need);
  if (s.cash > next.upgradeCost * mult) G.act.upgrade();
}
/** 接待借款车主：check=是否先查登记 */
function lendPledges(check, keepCash) {
  const s = S();
  if (s.ap < G.PLEDGE.ap || !G.act.pledgeVisit().ok) return;
  for (const c of [...s.pledgeVisit.clients]) {
    if (check) G.act.pledgeCheck(c.id);
    if ((!check || !c.double) && s.cash - c.amount > keepCash) G.act.pledgeSign(c.id);
  }
  G.act.pledgeClose();
}
function upgradeIfReady(mult) {
  const s = S(), next = G.STORE_LEVELS[s.store.level + 1];
  if (next && s.cash > next.upgradeCost * mult && s.cars.length >= G.capacity() * 0.7) G.act.upgrade();
}

/* ---------- 事件选择 ---------- */
function effOf(ev, i, ctx) { const e = ev.options[i].effect; return (typeof e === 'function' ? e(ctx) : e) || {}; }
function chooseEvent(style) {
  const p = S().pending[0], ev = G.EVENT_MAP[p.data.id], ctx = p.data.ctx;
  const opts = G.currentDecision().options.map((o, i) => ({ o, i })).filter(x => !x.o.disabled);
  const score = ({ i }) => {
    const e = effOf(ev, i, ctx);
    if (style === 'honest') return -(e.dark || 0) * 30000 + (e.cash || 0) + (e.rep || 0) * 15000 - (e.ap || 0) * -10000 + ((e.traffic || 1) - 1) * 50000;
    if (style === 'grey') return (e.cash || 0) + ((e.traffic || 1) - 1) * 50000 - (S().dark > CUR_CAP - 15 ? (e.dark || 0) * 30000 : 0) + (ev.id === 'third_party' && i === 0 ? -1 : 0);
    return G.rand();
  };
  return opts.reduce((a, b) => (score(b) > score(a) ? b : a)).i;
}

/* ---------- 策略 ---------- */
function makeGrey(cap) {
  return {
    month() {
      const s = S();
      for (const car of s.cars) if (car.monthsInStock >= 5) G.act.sellToPeer(car.id);
      while (s.ap >= 3 && s.cars.length < G.capacity()) if (!shop(G.chance(GREY_WRECK) ? 'wreck' : 'private', { inspect: true, maxRatio: 0.95, keepCash: G.monthlyFixedCost() * 3 })) break;
      for (const car of s.cars) {
        G.act.service(car.id, 'clean');
        for (const sid of ['conceal', 'tamper']) {
          if (s.ap < G.SERVICES[sid].ap || G.serviceBlock(car, sid)) continue;
          const dark = G.serviceDark(car, sid);
          if (s.dark + dark > cap) continue;
          // 估算收益：掩盖/调表后买家眼中估值的提升
          const snap = JSON.parse(JSON.stringify({ f: car.flaws, km: car.mileageShown }));
          const before = G.Car.value(car, 'public');
          if (sid === 'conceal') car.flaws.forEach(f => { if (f.known && !f.fixed && !G.FLAWS[f.id].visible) f.concealed = true; });
          else car.mileageShown *= 0.52;
          const gain = G.Car.value(car, 'public') - before;
          car.flaws = snap.f; car.mileageShown = snap.km;
          if (gain > GREY_MIN_GAIN) G.act.service(car.id, sid);
        }
        car.warranty = 'none';
        if (USE_FIN && !process.env.G_NOPRIV) car.finance = 'private';
      }
      if (USE_FIN) {
        if (!process.env.G_NOPLEDGE) lendPledges(false, G.monthlyFixedCost() * 4);
        if (!process.env.G_NOSTOCK && !s.loans.length && s.cars.length >= G.capacity() * 0.8) G.act.borrow('stock', G.Finance.limit('stock') * 0.6);
        upgradeWithLoan(1.2);
      }
      if (s.dark > 0 && s.ap >= 1) G.act.reportReg();
      upgradeIfReady(1.3);
      hireByPlan(staffPlan([['manager', 0.25], ['finance', 0.15], ['tech', 0.3], ['sales', 0.3]]));
    },
    complaint: 1, events: 'grey', cap,
  };
}

const STRATEGIES = {
  // 会玩的老实人：验车捡漏、该修就修、3个月质保、滞销车批发、攒够钱就升级
  pro: {
    month() {
      const s = S();
      for (const car of s.cars) if (car.monthsInStock >= 5) G.act.sellToPeer(car.id);
      while (s.ap >= 3 && s.cars.length < G.capacity()) if (!shop(G.chance(0.6) ? 'private' : 'dealer4s', { inspect: true, maxRatio: 0.93, keepCash: G.monthlyFixedCost() * 3 })) break;
      if (s.ap >= 1 && s.cars.length < G.capacity()) shop('peer', { inspect: false, maxRatio: 0.9, keepCash: G.monthlyFixedCost() * 3 });
      for (const car of s.cars) { fixWorthIt(car); car.warranty = 'm3'; if (USE_FIN) car.finance = 'bank'; }
      if (USE_FIN) { lendPledges(true, G.monthlyFixedCost() * 6); upgradeWithLoan(1.3); }
      if (s.ap >= 1 && s.cars.length >= 3 && s.cash > G.CONFIG.adCostPerLevel * s.store.level * 10) G.act.advertise();
      upgradeIfReady(1.3);
      hireByPlan(staffPlan([['manager', 0.25], ['tech', 0.35], ['sales', 0.3], ['finance', 0.1]]));
    },
    complaint: 1, events: 'honest',
  },
  // 黑心：事故车/散户车源，只对赚头大的车掩盖或调表；cap 是愿意把黑化推到多高
  grey: makeGrey(GREY_CAP),          // 谨慎黑心
  greyRisky: makeGrey(GREY_CAP + 15), // 激进黑心
  // 新手：随便挑渠道，一半时候验车，比买家估值便宜就买，价格全靠自动定价
  novice: {
    month() {
      const s = S();
      while (s.ap >= 2 && s.cars.length < G.capacity()) if (!shop(G.pick(['private', 'dealer4s', 'auction', 'peer']), { inspect: G.chance(0.5), maxRatio: 1.0, keepCash: 300000 })) break;
      for (const car of s.cars) if (s.ap > 0 && G.chance(0.3)) { const sid = G.pick(['clean', 'paint', 'parts']); if (!G.serviceBlock(car, sid)) G.act.service(car.id, sid); }
      if (S().cash > 2 * G.STORE_LEVELS[Math.min(3, s.store.level + 1)].upgradeCost) upgradeIfReady(2);
      if (s.candidates.length && s.staff.length < G.Staff.slots() && G.chance(0.5) && s.cash > 1000000) G.act.hire(G.pick(s.candidates).id);
      if (USE_FIN) {
        for (const car of s.cars) if (G.chance(0.2)) car.finance = G.pick(['none', 'bank', 'private']);
        if (G.chance(0.15)) lendPledges(G.chance(0.5), 500000);
        if (G.chance(0.05) && !s.loans.length) G.act.borrow(G.pick(['store', 'stock']), G.Finance.limit('stock') * 0.5);
      }
    },
    complaint: 'random', events: 'random',
  },
};

let CUR_CAP = GREY_CAP;
function play(name, seed) {
  const st = STRATEGIES[name];
  CUR_CAP = st.cap ?? GREY_CAP;
  G.newGame(DIFF, LOC, seed);
  const curve = {};
  let wonAt = null;
  for (let m = 1; m <= MONTHS && !S().over; m++) {
    st.month();
    G.act.endMonth();
    while (G.cleanPending() && !S().over) {
      const p = S().pending[0];
      if (p.type === 'complaint') G.act.decide(st.complaint === 'random' ? G.randInt(0, 2) : st.complaint);
      else if (p.type === 'buyerDefault' || p.type === 'pledgeDispute') {
        // 黑心：黑化还低时用灰色手段（催收 / 私下摆平），高了就走法律程序
        const greyOpt = p.type === 'buyerDefault' ? 1 : 2;
        const pick = st.events === 'grey' ? (S().dark < CUR_CAP - 20 ? greyOpt : 0) : st.events === 'honest' ? 0 : G.randInt(0, 2);
        G.act.decide(pick);
      }
      else G.act.decide(chooseEvent(st.events));
    }
    if (S().over === 'win' && !wonAt) wonAt = m;
    if (CHECKPOINTS.includes(m)) curve[m] = G.netWorth();
  }
  // 提前结束的局：破产/查封记为 0，通关记为目标值
  for (const cp of CHECKPOINTS) if (curve[cp] === undefined) curve[cp] = S().over === 'win' ? S().goal : (S().over ? 0 : G.netWorth());
  return { over: S().over || 'running', wonAt, curve, dark: S().dark, rep: S().rep, level: S().store.level, sold: S().stats.sold };
}

const med = arr => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };
const pct = (res, k) => (res.filter(r => r.over === k).length / res.length * 100).toFixed(0).padStart(3) + '%';

if (!process.env.QUIET) console.log(`难度 ${DIFF} · 地段 ${LOC} · 每种策略 ${RUNS} 局 · 最多 ${MONTHS} 个月 · 目标 ${G.fmt(G.CONFIG.difficulties.find(d => d.id === DIFF).goal)}`);
const summary = {};
for (const name of Object.keys(STRATEGIES).filter(n => !process.env.ONLY || process.env.ONLY.split(',').includes(n))) {
  const res = [];
  for (let i = 0; i < RUNS; i++) res.push(play(name, 1000 + i));
  const wins = res.filter(r => r.wonAt).map(r => r.wonAt);
  summary[name] = { runs: RUNS, win: res.filter(r => r.over === 'win').length / RUNS * 100, median: wins.length ? med(wins) : null, sealed: res.filter(r => r.over === 'sealed').length / RUNS * 100, bankrupt: res.filter(r => r.over === 'bankrupt').length / RUNS * 100, foreclosed: res.filter(r => r.over === 'foreclosed').length / RUNS * 100 };
  console.log(`\n【${name}】`);
  console.log('  净资产中位：' + CHECKPOINTS.map(m => `${m}月 ${G.fmt(med(res.map(r => r.curve[m])))}`).join(' │ '));
  if (res.some(r => r.over === 'foreclosed')) console.log(`  门店被法拍${pct(res, 'foreclosed')}`);
  console.log(`  通关${pct(res, 'win')}${wins.length ? `（中位 ${med(wins)} 月，最快 ${Math.min(...wins)} 月）` : ''}  破产${pct(res, 'bankrupt')}  查封${pct(res, 'sealed')}`);
  console.log(`  结束时：黑化中位 ${med(res.map(r => r.dark))} · 口碑中位 ${med(res.map(r => r.rep))} · 门店等级中位 ${med(res.map(r => r.level))} · 零售中位 ${med(res.map(r => r.sold))} 台`);
}

if (process.env.RESULT_FILE) require('fs').writeFileSync(process.env.RESULT_FILE, JSON.stringify({ difficulty: DIFF, location: LOC, months: MONTHS, seeds: [1000, 1000 + RUNS - 1], summary }, null, 2));

/* 单局年度账本：DEBUG=1 node tools/sim.js 1 120 */
if (process.env.DEBUG) {
  play(process.env.DEBUG === '1' ? 'pro' : process.env.DEBUG, 1000);
  const h = S().history;
  for (let y = 0; y * 12 < h.length; y++) {
    const yr = h.slice(y * 12, y * 12 + 12);
    const sum = k => yr.reduce((t, x) => t + x[k], 0);
    const by = {};
    yr.forEach(x => Object.entries(x.opexBy || {}).forEach(([k, v]) => { by[k] = (by[k] || 0) + v; }));
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}${G.fmt(v)}`).join(' ');
    console.log(`第${y + 1}年 L${yr[yr.length - 1].level || '?'} 收入 ${G.fmt(sum('revenue'))} 毛利 ${G.fmt(sum('revenue') - sum('cogs'))} 费用 ${G.fmt(sum('opex'))} 利润 ${G.fmt(sum('profit'))} 净资产 ${G.fmt(yr[yr.length - 1].net)}\n      费用明细：${top}`);
  }
}

module.exports = { play, STRATEGIES };
