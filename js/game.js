/* =========================================================
 * 游戏引擎：状态、行动、销售、月结、待办决策
 * 不碰 DOM，所以 tools/sim.js 能在 node 里直接跑。
 * ========================================================= */
var G = globalThis.G = globalThis.G || {};

(function () {
  const ok = msg => ({ ok: true, msg });
  const fail = msg => ({ ok: false, msg });
  const S = () => G.state;
  const owns = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
  function rememberTrade(n, ask, quote, text) {
    n.history = n.history || [];
    n.history.push({ round: n.rounds, ask, quote, text });
    if (n.history.length > 8) n.history.shift();
  }
  function tradeLine(side, n, kind, price) {
    let line = G.TRADE.styles[n.style][side][kind];
    if (Array.isArray(line)) line = line[Math.max(0, n.rounds - 1) % line.length];
    return line.replace(/\{price\}/g, G.fmtTrade(price));
  }

  /* ---------- 基础 ---------- */
  G.log = function (text, type = 'info') {
    const s = S();
    s.log.unshift({ m: s.month, text, type });
    if (s.log.length > 300) s.log.length = 300;
  };

  G.level = () => G.STORE_LEVELS[S().store.level];
  G.loc = () => G.LOCATIONS[S().store.location];
  G.capacity = () => G.level().capacity;
  G.maxAp = () => G.CONFIG.apPerMonth + G.CONFIG.apPerLevel * (S().store.level - 1) + G.Staff.apBonus();
  G.dateLabel = (m = S().month) => `${G.CONFIG.startYear + Math.floor((m - 1) / 12)}年${((m - 1) % 12) + 1}月`;
  G.netWorth = () => {
    const s = S();
    return Math.round(s.cash + s.cars.reduce((t, c) => t + G.Car.value(c, 'owner') * G.CONFIG.inventoryNetRate, 0)
      + G.Finance.assets() - G.Finance.debt());
  };
  G.monthlyFixedCost = () => {
    const lvl = G.level(), loc = G.loc(), s = S();
    const classic = s.cars.filter(c => G.CATEGORIES[c.catId].classic).length;
    return Math.round(lvl.baseRent * loc.rent + lvl.wages + G.Staff.payroll() + classic * G.CONFIG.classicStorageFee + (s.perks.thirdParty ? G.CONFIG.thirdPartyFee : 0));
  };
  G.suggestPrice = car => G.round(G.Car.value(car, 'public') * G.CONFIG.listMarkup);
  /** 开着"自动定价"的车，挂牌价跟着估值走（行情变动、整备、验出问题后都会更新） */
  G.refreshAutoPrices = () => { for (const c of S().cars) { if (c.autoPrice !== false) c.price = G.suggestPrice(c); G.refreshBuyer?.(c); } };
  G.peerPrice = car => G.round(G.Car.value(car, 'owner') * G.CONFIG.peerSellRate);
  G.inspectChance = () => {
    const s = S();
    // 黑化低时几乎不被盯，越往上越陡；超过 70 进入突击检查期
    const c = G.CONFIG;
    const scale = G.clamp((G.netWorth() - c.capitalRisk.threshold) / c.capitalRisk.ramp, 0, 1);
    const hidden = s.cars.filter(car => car.flaws.some(f => f.concealed && !f.fixed)).length + s.sales.filter(x => x.concealed && !x.audited && x.month >= s.month - 6).length;
    return scale * (Math.min(1, hidden / G.capacity()) * c.capitalRisk.inspectScale + c.capitalRisk.darkInspectScale * Math.pow(s.dark / 100, c.inspectDarkExp)) + G.loc().inspect + G.level().inspectBonus + c.inspectDarkScale * Math.pow(s.dark / 100, c.inspectDarkExp) + (s.dark > c.inspectSurgeAt ? c.inspectSurge : 0);
  };

  G.guard = (ap, cash) => guard(ap, cash);
  function guard(ap, cash) {
    const s = S();
    if (s.over) return '游戏已结束';
    if (G.cleanPending()) return '请先处理待办事件';
    if (s.ap < ap) return `行动点不足（需要 ${ap} 点）`;
    if (s.cash < cash) return `现金不足（需要 ${G.fmt(cash)}）`;
    return null;
  }
  /** 记一笔经营费用（带分类，月结里分项显示） */
  G.spend = function (n, cat = '其他') {
    const s = S();
    s.cash -= n;
    if (!n) return;
    s.month_.opex += n;
    s.month_.opexBy = s.month_.opexBy || {};
    s.month_.opexBy[cat] = (s.month_.opexBy[cat] || 0) + n;
  };
  function pay(ap, cash, cat) {        // cat 为 null 表示不是经营费用（买车、升级等投资）
    S().ap -= ap;
    if (cat === null) S().cash -= cash; else G.spend(cash, cat);
  }
  const expense = (n, cat) => G.spend(n, cat);
  /** 罚款、赔偿类支出：财务能打折 */
  G.legalCost = n => Math.round(n * G.Staff.fineMult());

  G.addDark = function (n, why) {
    const s = S(), before = s.dark;
    if (n > 0 && s.perks.thirdParty) n = Math.ceil(n * G.CONFIG.thirdPartyDarkMult);
    s.dark = G.clamp(s.dark + n, 0, 100);
    const d = s.dark - before;
    if (d && why) G.log(`${why}：黑化 ${d > 0 ? '+' : ''}${d}`, d > 0 ? 'dark' : 'good');
  };
  G.addRep = function (n, why) {
    const s = S(), before = s.rep;
    s.rep = G.clamp(s.rep + n, 0, 100);
    const d = s.rep - before;
    if (d && why) G.log(`${why}：口碑 ${d > 0 ? '+' : ''}${d}`, d > 0 ? 'good' : 'bad');
  };

  function checkEnd() {
    const s = S();
    if (s.over) return;
    if (s.dark >= G.CONFIG.sealDark) s.over = 'sealed';
    else if (G.netWorth() >= s.goal) s.over = 'win';
  }
  G.endingId = function () {
    const s = S();
    return s.over === 'win' ? (s.dark < 30 ? 'win_clean' : 'win_grey') : s.over;
  };
  G.endingInfo = function () {
    const s = S();
    if (s.over === 'foreclosed') return G.ENDINGS.foreclosed;
    if (s.over === 'win') return G.ENDINGS[s.dark < 30 ? 'win_clean' : 'win_grey'];
    return G.ENDINGS[s.over];
  };

  /* ---------- 新游戏 / 存档 ---------- */
  G.newGame = function (diffId, locId, seed) {
    const d = G.CONFIG.difficulties.find(x => x.id === diffId) || G.CONFIG.difficulties[0];
    seed = seed ?? (Date.now() % 2147483647);
    G.state = {
      version: 1, seed, rngState: seed, startedAt: new Date().toISOString(),
      month: 1, ap: G.CONFIG.apPerMonth,
      cash: d.cash, goal: d.goal, diffId,
      dark: 0, rep: G.CONFIG.startRep,
      store: { level: 1, location: locId },
      market: Object.fromEntries(Object.keys(G.CATEGORIES).map(k => [k, 1])),
      cars: [], sales: [], warranties: [], bombs: [], pending: [], visit: null,
      buffs: { ad: false, traffic: 1 }, flags: { reported: false },
      perks: { thirdParty: false }, eventCd: {}, eventsSeen: {},
      month_: { revenue: 0, cogs: 0, opex: 0 },
      history: [], log: [], lossStreak: 0,
      stats: { bought: 0, sold: 0, soldPeer: 0, peakProfit: 0, greyOps: 0 },
      staff: [], candidates: [],
      loans: [], buyerLoans: [], pledges: [], credit: G.FINANCE.creditStart, storeValue: G.FINANCE.storeBaseValue, pledgeVisit: null,
      nextId: 1, over: null, lastReport: null,
    };
    G.Staff.refreshCandidates();
    G.log(`车行开业！地段：${G.LOCATIONS[locId].name}，启动资金 ${G.fmt(d.cash)}。`);
    return G.state;
  };

  G.SAVE_KEY = 'usedcar_sim_save_v1';
  const hasLS = () => { try { return typeof localStorage !== 'undefined'; } catch (_) { return false; } };
  G.save = () => {
    try { if (!hasLS() || !G.state) return false; localStorage.setItem(G.SAVE_KEY, JSON.stringify(G.state)); return true; }
    catch (_) { return false; }
  };
  G.hasSave = () => { try { return hasLS() && !!localStorage.getItem(G.SAVE_KEY); } catch (_) { return false; } };
  G.load = () => {
    try { if (!G.hasSave()) return false; const candidate = G.parseSave(localStorage.getItem(G.SAVE_KEY)); G.state = candidate; return true; }
    catch (e) { G.loadError = e.message; return false; }
  };
  // 迁移不提交全局状态；补招聘池需要 RNG 时，临时绑定并确保恢复。
  G.migrate = s => {
    s.startedAt = typeof s.startedAt === 'string' && Number.isFinite(Date.parse(s.startedAt)) ? s.startedAt : null;
    s.buffs = Object.assign({ ad: false, traffic: 1 }, s.buffs);
    s.flags = Object.assign({ reported: false }, s.flags);
    s.cars.forEach(c => {
      if (c.autoPrice === undefined) c.autoPrice = false;
      c.finance = c.finance || 'none'; c.warranty = c.warranty || 'none';
      c.monthsInStock = c.monthsInStock ?? 0;
    });
    s.perks = Object.assign({ thirdParty: false }, s.perks);
    for (const key of ['eventCd', 'eventsSeen']) s[key] = s[key] || {};
    for (const key of ['staff', 'sales', 'warranties', 'bombs', 'pending', 'history', 'log']) s[key] = s[key] || [];
    s.month_ = Object.assign({ revenue: 0, cogs: 0, opex: 0, opexBy: {} }, s.month_);
    s.stats = Object.assign({ bought: 0, sold: 0, soldPeer: 0, peakProfit: 0, greyOps: 0 }, s.stats);
    s.lossStreak = s.lossStreak ?? 0;
    G.Finance.init(s);
    if (!s.candidates) {
      const previous = G.state;
      try { G.state = s; G.Staff.refreshCandidates(); } finally { G.state = previous; }
    }
    return s;
  };
  G.parseSave = text => {
    if (typeof text !== 'string' || text.length > G.CONFIG.maxSaveChars) throw new Error('这份存档没读出来，检查一下是不是选错了文件。');
    let s;
    try { s = JSON.parse(text); } catch (_) { throw new Error('这份存档不完整或格式不正确，请重新选择备份文件。'); }
    const keyOf = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
    const object = x => x && typeof x === 'object' && !Array.isArray(x);
    const number = (x, min = -Infinity, max = Infinity) => Number.isFinite(x) && x >= min && x <= max;
    const integer = (x, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && x >= min && x <= max;
    const need = (condition, message) => { if (!condition) throw new Error(`这份存档暂时读不了：${message}`); };
    const tradeHistory = h => need(h === undefined || (Array.isArray(h) && h.length <= 8 && h.every(x => object(x) && integer(x.round, 0, G.TRADE.rounds) && (x.ask === null || number(x.ask, 0)) && number(x.quote, 0) && typeof x.text === 'string')), '议价记录损坏');
    need(object(s) && s.version === 1, '版本不支持');
    const walk = x => {
      if (typeof x === 'number') need(Number.isFinite(x), '有些账目对不上');
      if (!x || typeof x !== 'object') return;
      for (const [key, value] of Object.entries(x)) { need(!['__proto__', 'constructor', 'prototype'].includes(key), '有些记录对不上'); walk(value); }
    };
    walk(s);
    need(integer(s.month, 1) && integer(s.ap, 0, 200) && number(s.cash) && number(s.goal, 1), '月份、资金或行动点无效');
    need(number(s.dark, 0, G.CONFIG.sealDark) && number(s.rep, 0, 100) && integer(s.nextId, 1) && integer(s.rngState, -2147483648, 4294967295) && number(s.seed), '经营状态不完整');
    need(object(s.store) && G.STORE_LEVELS[s.store.level] && integer(s.store.level, 1) && keyOf(G.LOCATIONS, s.store.location), '门店等级或地段无效');
    need(G.CONFIG.difficulties.some(d => d.id === s.diffId), '启动资金档无效');
    need(object(s.market) && Object.keys(G.CATEGORIES).every(k => number(s.market[k], 0.01)), '行情数据无效');
    need(Array.isArray(s.cars) && s.cars.length <= 1000, '缺少库存或车辆过多');
    for (const key of ['staff','candidates','sales','warranties','bombs','pending','history','log','loans','buyerLoans','pledges']) need(s[key] === undefined || Array.isArray(s[key]), `有一段记录不完整`);
    for (const key of ['buffs','flags','perks','eventCd','eventsSeen','month_','stats']) need(s[key] === undefined || object(s[key]), `有一段记录不完整`);
    if (s.candidates === undefined && s.staff?.length) s.candidates = [];
    s = G.migrate(s);
    const car = c => {
      need(object(c) && integer(c.id, 1) && typeof c.name === 'string' && keyOf(G.CATEGORIES, c.catId), '车辆资料无效');
      need(['newPrice','year','bornMonth','mileage','mileageShown','cost','price','monthsInStock'].every(k => number(c[k], 0)), '车辆金额或车龄损坏');
      need(keyOf(G.WARRANTY, c.warranty) && keyOf(G.BUYER_FINANCE, c.finance || 'none') && Array.isArray(c.flaws), '车辆方案或车况损坏');
      need(c.color === undefined || integer(c.color, 0, G.PAINTS ? G.PAINTS.length - 1 : 8), '车漆无效');
      c.flaws.forEach(f => need(object(f) && keyOf(G.FLAWS, f.id) && ['known','concealed','fixed'].every(k => typeof f[k] === 'boolean'), '车辆瑕疵无效'));
      if (c.buyer !== undefined) {
        const b = c.buyer;
        need(object(b) && integer(b.month, 1, s.month) && integer(b.style, 0, G.TRADE.styles.length - 1) && integer(b.rounds, 0, G.TRADE.rounds) && integer(b.patience, 0, 4)
          && ['talking','agreed','final','left'].includes(b.status) && typeof b.message === 'string'
          && ['anchor','quote','budget'].every(k => number(b[k], 100)) && b.quote <= b.budget && b.budget <= b.anchor, '买家议价记录损坏');
        tradeHistory(b.history);
        need(b.willingness === undefined || number(b.willingness, 0, 10), '买家估价损坏');
        if (b.terms !== undefined) need(object(b.terms) && number(b.terms.value, 1) && number(b.terms.price, 0) && keyOf(G.WARRANTY,b.terms.warranty) && keyOf(G.BUYER_FINANCE,b.terms.finance), '洽谈方案损坏');
      }
    };
    s.cars.forEach(car);
    need(new Set(s.cars.map(c => c.id)).size === s.cars.length, '库存车辆编号重复');
    for (const e of [...s.staff, ...s.candidates]) need(object(e) && integer(e.id, 1) && keyOf(G.ROLES, e.role) && integer(e.level, 1, 3) && number(e.salary, 0) && number(e.integrity, 0, 1) && integer(e.tenure) && typeof e.name === 'string', '员工资料损坏');
    for (const l of s.loans) need(object(l) && integer(l.id, 1) && keyOf(G.LOANS, l.type) && ['principal','remaining','rate','term','monthsLeft','payment','overdue'].every(k => number(l[k], 0)), '车行贷款损坏');
    for (const b of s.buyerLoans) need(object(b) && integer(b.id, 1) && typeof b.name === 'string' && number(b.balance, 0) && number(b.total, 1) && number(b.monthsLeft, 0), '担保贷款损坏');
    const pledge = p => { need(object(p) && integer(p.id, 1) && typeof p.client === 'string' && ['amount','rate','term'].every(k => number(p[k], 0)), '车主抵押损坏'); car(p.car); };
    s.pledges.forEach(p => { pledge(p); need(number(p.monthsLeft, 0), '抵押期限损坏'); });
    for (const b of s.bombs) { need(keyOf(G.FLAWS, b.flawId) && number(b.price, 0) && number(b.monthsLeft, 0), '售后记录损坏'); car(b.car); }
    for (const w of s.warranties) need(object(w) && typeof w.name === 'string' && number(w.monthsLeft, 0) && number(w.newPrice, 0) && Array.isArray(w.mech) && w.mech.every(k => G.FLAWS[k]?.mech), '质保记录损坏');
    for (const p of s.pending) {
      need(object(p) && keyOf(G.DECISIONS, p.type) && object(p.data), '待办类型无效');
      if (p.type === 'event') need(keyOf(G.EVENT_MAP, p.data.id) && object(p.data.ctx), '事件卡损坏');
      else if (p.type === 'complaint') { need(keyOf(G.FLAWS, p.data.flawId) && number(p.data.price, 0), '投诉损坏'); car(p.data.car); }
      else if (p.type === 'pledgeDispute') pledge(p.data);
      else if (p.type === 'buyerDefault') need(number(p.data.loss, 0) && (typeof p.data.name === 'string' || (Array.isArray(p.data.names) && p.data.names.every(n => typeof n === 'string'))), '断供记录损坏');
    }
    need(s.over === null || ['win','sealed','bankrupt','foreclosed'].includes(s.over), '结局无效');
    need(number(s.credit, 0, 100) && number(s.storeValue, 0), '征信或抵押物损坏');
    need(['revenue','cogs','opex'].every(k => number(s.month_[k], 0)) && object(s.month_.opexBy), '月度账本损坏');
    if (s.month_.negotiatedSales !== undefined) need(Array.isArray(s.month_.negotiatedSales) && s.month_.negotiatedSales.every(x => object(x) && typeof x.name === 'string' && typeof x.warranty === 'string' && number(x.price, 0) && number(x.profit)), '议价成交台账损坏');
    need(Object.values(s.stats).every(v => number(v, 0)), '经营统计损坏');
    if (s.visit !== null && s.visit !== undefined) {
      need(object(s.visit) && keyOf(G.CHANNELS, s.visit.chId) && Array.isArray(s.visit.offers), '看车现场损坏');
      need(s.visit.message === undefined || typeof s.visit.message === 'string', '看车反馈损坏');
      s.visit.offers.forEach(o => {
        car(o.car); need(number(o.factor, 0), '车辆报价损坏');
        if (o.negotiation !== undefined) {
          const n = o.negotiation;
          need(object(n) && integer(n.style, 0, G.TRADE.styles.length - 1) && integer(n.rounds, 0, G.TRADE.rounds) && integer(n.patience, 0, 4)
            && number(n.floor, 0.8, 1) && number(n.discount, 0, 1 - n.floor + 0.00001) && typeof n.message === 'string', '卖家议价记录损坏');
          tradeHistory(n.history);
        }
      });
    }
    if (s.pledgeVisit) { need(Array.isArray(s.pledgeVisit.clients), '抵押接待损坏'); s.pledgeVisit.clients.forEach(pledge); }
    for (const h of s.history) need(object(h) && ['month','revenue','cogs','opex','profit','cash','net','dark','rep'].every(k => number(h[k])), '历史账本损坏');
    for (const l of s.log) need(object(l) && typeof l.text === 'string' && integer(l.m, 1) && ['info','good','bad','dark','warn','event'].includes(l.type), '日志损坏');
    for (const sale of s.sales) need(object(sale) && integer(sale.id, 1) && integer(sale.month, 1) && typeof sale.name === 'string' && number(sale.price, 0) && number(sale.cost, 0), '销售台账损坏');
    need(number(s.buffs.traffic, 0) && typeof s.buffs.ad === 'boolean' && typeof s.flags.reported === 'boolean' && typeof s.perks.thirdParty === 'boolean', '经营加成损坏');
    need(Object.values(s.eventCd).every(v => number(v, 0)) && Object.values(s.eventsSeen).every(v => number(v, 0)), '事件记录损坏');
    const activeIds = [...s.cars, ...s.staff, ...s.candidates, ...s.loans, ...s.buyerLoans, ...s.pledges, ...(s.visit?.offers.map(o => o.car) || []), ...(s.pledgeVisit?.clients.flatMap(p => [p, p.car]) || [])].map(x => x.id);
    need(activeIds.every(id => id < s.nextId), '后续编号无效');
    // 让引擎和所有事件视图实际读取一次；沙盒对象出错时仍不影响当前局。
    const previous = G.state;
    try {
      G.state = s; need(Number.isFinite(G.netWorth()) && Number.isFinite(G.maxAp()) && Number.isFinite(G.monthlyFixedCost()), '经营数据超出范围');
      const pending = s.pending;
      for (const p of pending) { s.pending = [p]; if (G.cleanPending()) G.currentDecision(); }
      s.pending = pending;
    } finally { G.state = previous; }
    return s;
  };
  G.importSave = text => {
    try {
      const candidate = G.parseSave(text);
      if (hasLS()) localStorage.setItem(G.SAVE_KEY, JSON.stringify(candidate));
      G.state = candidate;
      return ok('存档读进来了，接着开张。');
    } catch (e) { return fail(e.name === 'QuotaExceededError' || e.name === 'SecurityError' ? '浏览器不允许写入存档，当前局未改变，请先导出备份' : /存档|JSON/.test(e.message) ? e.message : '这份存档暂时读不了：文件内容不完整，原来这局还在。'); }
  };
  G.clearSave = () => { try { if (hasLS()) localStorage.removeItem(G.SAVE_KEY); } catch (_) {} };

  /* ---------- 行动 ---------- */
  G.act = {};

  // 收车：去渠道看车
  G.act.visit = function (chId) {
    const s = S(), ch = G.CHANNELS[chId];
    if (s.visit) return fail('正在看车中');
    const e = guard(ch.ap, 0); if (e) return fail(e);
    pay(ch.ap, 0, '收车');
    const offers = [];
    for (let i = 0; i < G.offerCount(chId); i++) offers.push({ car: G.Car.generate(chId), factor: G.range(ch.factor[0], ch.factor[1]) });
    s.visit = { chId, offers };
    return ok();
  };
  // 卖家报价：按买家视角估值打折。验车揭开问题后，报价会随之下降
  // 门店越大，送上门的车源越多
  G.offerCount = chId => G.CHANNELS[chId].offers + Math.ceil(G.CHANNELS[chId].offers * G.CONFIG.offersPerLevel * (S().store.level - 1));
  G.offerBasePrice = o => G.round(G.Car.value(o.car, 'public') * o.factor);
  G.offerPrice = o => o.negotiation ? Math.max(100, G.round(G.offerBasePrice(o) * (1 - o.negotiation.discount), 100)) : G.offerBasePrice(o);

  G.act.rejectOffer = function (i) {
    const s = S(), o = s.visit?.offers[i];
    if (!o) return fail('车辆不存在');
    const e = guard(0, 0); if (e) return fail(e);
    s.visit.offers.splice(i, 1);
    s.visit.message = `已拒绝「${o.car.name}」，本批不再显示。`;
    return ok(s.visit.message);
  };

  G.act.bargainOffer = function (i, tactic) {
    const s = S(), o = s.visit?.offers[i];
    if (!o || !owns(G.TRADE.cuts, tactic)) return fail('这台车暂时谈不了');
    const cut = G.TRADE.cuts[tactic];
    if (G.CHANNELS[s.visit.chId].blind) return fail('拍卖平台按报价成交，不能私下议价');
    const e = guard(0, 0); if (e) return fail(e);
    if (o.negotiation?.rounds >= G.TRADE.rounds) return fail('已经谈到最后一轮，可以按现价买下或拒绝');
    if (!o.negotiation) {
      const style = G.randInt(0, G.TRADE.styles.length - 1), d = G.TRADE.styles[style];
      const floor = G.chance(G.TRADE.firmQuoteRate[s.visit.chId] || 0) ? 1 : G.range(...d.floor);
      o.negotiation = { style, floor, discount: 0, rounds: 0, patience: d.patience, message: '' };
    }
    const n = o.negotiation, d = G.TRADE.styles[n.style], before = G.offerPrice(o), base = G.offerBasePrice(o);
    const ask = Math.max(100, G.round(before * (1 - cut.rate), 100)), floor = Math.max(100, Math.ceil(base * n.floor / 100) * 100);
    n.rounds++;
    if (ask >= floor) {
      n.discount = Math.min(1 - n.floor, Math.max(n.discount, 1 - ask / Math.max(100, base)));
      n.message = `你出 ${G.fmtTrade(ask)}。卖家：“${tradeLine('seller',n,'accept',G.offerPrice(o))}”`;
    } else {
      n.patience = Math.max(0, n.patience - (tactic === 'hard' ? 2 : 1));
      if (!n.patience) {
        s.visit.offers.splice(i, 1);
        s.visit.message = `「${o.car.name}」谈崩了。卖家：“${tradeLine('seller',n,'leave',before)}”车辆已离场。`;
        G.log(s.visit.message, 'warn');
        return ok(s.visit.message);
      }
      const counter = Math.max(floor, Math.min(before, G.round(before - (before - ask) * d.concede, 100)));
      n.discount = Math.min(1 - n.floor, Math.max(n.discount, 1 - counter / Math.max(100, base)));
      n.message = `你出 ${G.fmtTrade(ask)}。卖家：“${tradeLine('seller',n,G.offerPrice(o) < before ? 'counter' : 'firm',G.offerPrice(o))}”`;
    }
    if (n.rounds === G.TRADE.rounds) n.message += ' 这是最后报价。';
    rememberTrade(n, ask, G.offerPrice(o), n.message);
    s.visit.message = '';
    return ok(n.message);
  };

  // 现场验车：花 1 点，把本次看的车全部验一遍
  G.visitInspectCost = () => { const v = S().visit; return v ? v.offers.filter(o => !o.car.inspected).length * G.CONFIG.offerInspectCost : 0; };
  G.act.inspectVisit = function () {
    const s = S(), v = s.visit;
    if (!v) return fail('没有在看车');
    if (G.CHANNELS[v.chId].blind) return fail('拍卖车不允许验车');
    const todo = v.offers.filter(o => !o.car.inspected);
    if (!todo.length) return fail('都已经验过了');
    const cost = G.visitInspectCost();
    const e = guard(1, cost); if (e) return fail(e);
    pay(1, cost, '验车');
    const found = [];
    for (const o of todo) { const f = G.Car.reveal(o.car); if (f.length) found.push(`「${o.car.name}」${f.join('、')}`); }
    return ok(found.length ? `验出问题：${found.join('；')}。卖家按实际车况重新报价` : '这批车都没有隐性问题');
  };

  G.act.buyOffer = function (i) {
    const s = S(), o = s.visit && s.visit.offers[i];
    if (!o) return fail('车辆不存在');
    if (s.cars.length >= G.capacity()) return fail(`库存已满（上限 ${G.capacity()} 台）`);
    const ch = G.CHANNELS[s.visit.chId];
    const price = G.offerPrice(o), tow = ch.towFee || 0;
    const e = guard(0, price + tow); if (e) return fail(e);
    pay(0, price + tow, null);
    const car = o.car;
    Object.assign(car, { cost: price + tow, boughtMonth: s.month, monthsInStock: 0, warranty: 'none', source: ch.name, autoPrice: true, finance: 'none' });
    car.price = G.suggestPrice(car);
    s.cars.push(car);
    s.visit.offers.splice(i, 1);
    s.stats.bought++;
    G.log(`从${ch.name}收购「${car.name}」，${G.fmt(price)}${tow ? `，拖车费 ${G.fmt(tow)}` : ''}`);
    checkEnd();
    return ok(`买下了「${car.name}」，花了 ${G.fmt(price + tow)}`);
  };

  G.act.closeVisit = function () { S().visit = null; return ok(); };

  // 整备
  const repairable = f => f.known && !f.fixed && G.FLAWS[f.id].repairRate;
  const concealable = f => f.known && !f.fixed && !f.concealed && !G.FLAWS[f.id].visible;

  G.serviceCost = (car, sid) => {
    const base = sid === 'repair'
      ? car.flaws.filter(repairable).reduce((t, f) => t + G.round(car.newPrice * G.FLAWS[f.id].repairRate, 100), 0)
      : G.SERVICES[sid].cost;
    return G.SERVICES[sid].grey ? base : G.round(base * G.Staff.refurbMult(), 100);   // 技师让正规整备更便宜
  };

  G.serviceDark = (car, sid) => sid === 'conceal'
    ? car.flaws.filter(concealable).reduce((t, f) => t + (G.FLAWS[f.id].darkConceal || G.CONFIG.concealDark), 0)
    : (G.SERVICES[sid].dark || 0);

  /** 返回不可用原因，可用返回 null */
  G.serviceBlock = function (car, sid) {
    const sv = G.SERVICES[sid];
    if (sv.fixes) return car.flaws.some(f => !f.fixed && sv.fixes.includes(f.id)) ? null : '这项不用折腾。';
    if (sid === 'inspect') return car.inspected ? '已检测' : null;
    if (sid === 'repair') return car.flaws.some(repairable) ? null : '查出来的问题里，没有能修的。';
    if (sid === 'conceal') return car.flaws.some(concealable) ? null : '没有需要掩盖的问题';
    if (sid === 'tamper') {
      if (car.flaws.some(f => f.id === 'mileage' && f.known)) return '里程已有问题';
      return car.mileageShown < 30000 ? '里程太低，没必要' : null;
    }
    return null;
  };

  G.act.service = function (carId, sid) {
    const s = S(), car = s.cars.find(c => c.id === carId), sv = G.SERVICES[sid];
    if (!car || !sv) return fail('车辆不存在');
    const block = G.serviceBlock(car, sid); if (block) return fail(block);
    const cost = G.serviceCost(car, sid);
    const e = guard(sv.ap, cost); if (e) return fail(e);
    const dark = G.serviceDark(car, sid);
    pay(sv.ap, cost, sv.grey ? '灰色操作' : '整备');
    const names = list => list.map(f => G.FLAWS[f.id].name).join('、');
    let msg;
    if (sv.fixes) {
      car.flaws.forEach(f => { if (!f.fixed && sv.fixes.includes(f.id)) f.fixed = true; });
      msg = `${sv.name}完成`;
    } else if (sid === 'inspect') {
      const found = G.Car.reveal(car);
      msg = found.length ? `检测发现：${found.join('、')}` : '检测完成，未发现隐性问题';
    } else if (sid === 'repair') {
      const list = car.flaws.filter(repairable); list.forEach(f => { f.fixed = true; });
      msg = `修好了：${names(list)}`;
    } else if (sid === 'conceal') {
      const list = car.flaws.filter(concealable); list.forEach(f => { f.concealed = true; });
      msg = `已掩盖：${names(list)}`;
      s.stats.greyOps++;
    } else if (sid === 'tamper') {
      const existing = car.flaws.find(f => f.id === 'mileage');
      if (existing) Object.assign(existing, { known: true, concealed: true });
      else car.flaws.push({ id: 'mileage', known: true, concealed: true, fixed: false });
      car.mileageShown = G.round(car.mileageShown * G.range(0.45, 0.6), 100);
      msg = `表显里程改为 ${G.fmtKm(car.mileageShown)}`;
      s.stats.greyOps++;
    }
    G.log(`「${car.name}」${msg}${cost ? `（${G.fmt(cost)}）` : ''}`, sv.grey ? 'dark' : 'info');
    if (dark) G.addDark(dark, sv.name);
    G.refreshAutoPrices();
    checkEnd();
    return ok(msg);
  };

  G.act.setPrice = function (carId, price) {
    const car = S().cars.find(c => c.id === carId);
    if (!car) return fail('车辆不存在');
    if (!Number.isFinite(price) || price < 0) return fail('请输入有效的挂牌价');
    const e = guard(0,0); if (e) return fail(e);
    car.price = Math.max(0, Math.round(price || 0));
    car.autoPrice = false;
    G.refreshBuyer(car);
    return ok();
  };
  G.act.suggestPrice = function (carId) {
    const car = S().cars.find(c => c.id === carId);
    if (!car) return fail('车辆不存在');
    const e = guard(0,0); if (e) return fail(e);
    car.autoPrice = true;
    car.price = G.suggestPrice(car);
    G.refreshBuyer(car);
    return ok('已恢复自动定价');
  };
  G.act.reducePrice = function (carId) {
    const car = S().cars.find(c => c.id === carId);
    if (!car) return fail('车辆不存在');
    const e = guard(0, 0); if (e) return fail(e);
    if (car.price <= 100) return fail('挂牌价已经很低了');
    car.price = Math.max(100, Math.min(car.price - 100, G.round(car.price * 0.97, 100)));
    car.autoPrice = false;
    G.refreshBuyer(car);
    return ok(`已降价挂牌为 ${G.fmtTrade(car.price)}，之后可手动改价或恢复自动定价`);
  };
  G.act.setWarranty = function (carId, w) {
    const car = S().cars.find(c => c.id === carId);
    if (!car || !owns(G.WARRANTY,w)) return fail('这项办不了，换个试试。');
    const e = guard(0,0); if (e) return fail(e);
    car.warranty = w;
    G.refreshBuyer(car);
    return ok();
  };

  G.act.sellToPeer = function (carId) {
    const s = S(), car = s.cars.find(c => c.id === carId);
    if (!car) return fail('车辆不存在');
    const e = guard(0, 0); if (e) return fail(e);
    const price = G.peerPrice(car);
    s.cash += price; s.month_.revenue += price; s.month_.cogs += car.cost;
    s.cars.splice(s.cars.indexOf(car), 1);
    s.stats.soldPeer++;
    G.log(`「${car.name}」批发给同行，回款 ${G.fmt(price)}`);
    return ok(`回款 ${G.fmt(price)}`);
  };

  // 门店
  G.act.advertise = function () {
    const s = S();
    if (s.buffs.ad) return fail('本月已经投放过广告');
    const cost = G.CONFIG.adCostPerLevel * s.store.level;
    const e = guard(1, cost); if (e) return fail(e);
    pay(1, cost, '广告');
    s.buffs.ad = true;
    G.log(`投放广告，本月客流提升（${G.fmt(cost)}）`);
    return ok('本月客流提升');
  };
  G.act.reportReg = function () {
    const s = S();
    if (s.flags.reported) return fail('本月已经报备过');
    const e = guard(1, 0); if (e) return fail(e);
    if (s.dark <= 0) return fail('台账干净，没什么要报备的');
    pay(1, 0, '其他');
    s.flags.reported = true;
    G.addDark(-G.CONFIG.reportDark, '主动去市场监管部门报备整改');
    return ok('报备完成');
  };
  G.act.cancelThirdParty = function () {
    const s = S();
    if (!s.perks.thirdParty) return fail('没有常驻检测机构');
    s.perks.thirdParty = false;
    G.log('与第三方检测机构解约');
    return ok('已解约，下月起不再扣费');
  };
  G.act.upgrade = function () {
    const s = S(), next = G.STORE_LEVELS[s.store.level + 1];
    if (!next) return fail('已经是最高等级');
    const e = guard(0, next.upgradeCost); if (e) return fail(e);
    pay(0, next.upgradeCost, null);   // 投资，不计入当月经营费用
    s.storeValue += next.upgradeCost;  // 门店价值上升，可以抵押的额度也上升
    s.store.level++;
    G.log(`门店升级为${next.name}！库存上限 ${next.capacity} 台`, 'good');
    return ok(`升级为${next.name}`);
  };

  /* ---------- 待办决策（事件引擎的内核，第 3 步的事件卡也走这里） ---------- */
  G.DECISIONS = {};
  // 事件卡引用的库存车（ctx.id / ctx.ids / ctx.targetId）已经不在了，这张卡作废
  function eventStillValid(p) {
    if (p.type !== 'event') return true;
    const c = p.data.ctx, cars = S().cars;
    const refs = [c.id, c.targetId, ...(c.ids || [])].filter(x => x !== undefined);
    if (c.staffId !== undefined && !S().staff.some(e => e.id === c.staffId)) return false;
    return refs.every(id => cars.some(car => car.id === id));
  }
  G.cleanPending = () => { const s = S(); s.pending = s.pending.filter(eventStillValid); return s.pending.length; };
  G.currentDecision = function () {
    const s = S();
    G.cleanPending();
    const p = s.pending[0];
    return p ? G.DECISIONS[p.type].view(p.data) : null;
  };
  G.act.decide = function (i) {
    const s = S(), p = s.pending[0];
    if (!p) return fail('没有待办事件');
    const opt = G.currentDecision().options[i];
    if (!opt) return fail('这项现在选不了。');
    if (opt.disabled) return fail(opt.disabled);
    const text = G.DECISIONS[p.type].resolve(p.data, i);
    s.pending.shift();
    G.log(text, 'event');
    checkEnd();
    return ok(text);
  };

  // 售后投诉：隐患债务爆发
  const hitOf = id => G.FLAWS[id].hit || 0.15;
  G.DECISIONS.complaint = {
    view(b) {
      const f = G.FLAWS[b.flawId], K = G.CONFIG.complaintDark;
      const comp = G.round(G.legalCost(b.price * hitOf(b.flawId) * G.CONFIG.compensateRate), 100);
      return {
        car: b.car,
        title: b.knowing ? '客户维权：隐瞒问题曝光' : '客户投诉：车辆隐患',
        text: `${G.dateLabel(b.soldMonth)}售出的「${b.name}」（成交价 ${G.fmt(b.price)}），买家发现了「${f.name}」${b.knowing ? '，而且拿到了你知情隐瞒的证据' : ''}，要求退车并赔偿。`,
        options: [
          { label: '退车退款', hint: `-${G.fmt(b.price)}，车辆退回库存 · ${b.knowing ? `黑化+${K.refund} 口碑-3` : '口碑+2'}` },
          { label: '补偿维修费', hint: `-${G.fmt(comp)} · ${b.knowing ? `黑化+${K.comp} 口碑-1` : '口碑+3'}` },
          { label: '拒绝索赔，硬扛', hint: b.knowing ? `败诉风险高，可能退一赔三 · 黑化+${K.fightWin}～${K.fightLose}` : '有一定败诉风险' },
        ],
      };
    },
    resolve(b, i) {
      const s = S(), f = G.FLAWS[b.flawId];
      const comp = G.round(G.legalCost(b.price * hitOf(b.flawId) * G.CONFIG.compensateRate), 100);
      if (i === 0) {
        S().cash -= b.price;   // 退车：钱退回、车回库（成本按退款价计），不算经营费用
        const car = b.car;
        car.flaws.forEach(x => { if (x.id === b.flawId) { x.known = true; } x.concealed = false; });
        Object.assign(car, { cost: b.price, warranty: 'none', monthsInStock: 0, inspected: true, autoPrice: true, finance: 'none' });
        car.price = G.suggestPrice(car);
        s.cars.push(car);
        if (b.knowing) { G.addDark(G.CONFIG.complaintDark.refund); G.addRep(-3); } else G.addRep(2);
        return `「${b.name}」退车退款 ${G.fmt(b.price)}，车辆回到库存${s.cars.length > G.capacity() ? '（已超出库存上限）' : ''}`;
      }
      if (i === 1) {
        expense(comp, '售后赔偿');
        G.addRep(b.knowing ? -1 : 3);
        if (b.knowing) G.addDark(G.CONFIG.complaintDark.comp);
        return `给「${b.name}」的买家补偿 ${G.fmt(comp)}，事情平息了`;
      }
      // 硬扛
      const loseP = b.knowing ? 0.65 : 0.35;
      expense(G.CONFIG.lawsuitFee, '售后赔偿');
      if (G.chance(loseP)) {
        const pay3 = G.legalCost(b.knowing ? b.price * 3 : comp * 1.5);
        expense(Math.round(pay3), '售后赔偿');
        G.addRep(b.knowing ? -15 : -8);
        if (b.knowing) G.addDark(G.CONFIG.complaintDark.fightLose);
        return `「${b.name}」官司败诉！${b.knowing ? '被判退一赔三，' : ''}赔偿 ${G.fmt(pay3)}，另付诉讼费 ${G.fmt(G.CONFIG.lawsuitFee)}`;
      }
      G.addRep(b.knowing ? -6 : -3);
      if (b.knowing) G.addDark(G.CONFIG.complaintDark.fightWin);
      return `「${b.name}」官司胜诉，只花了诉讼费 ${G.fmt(G.CONFIG.lawsuitFee)}，但名声受了点影响（${f.name}）`;
    },
  };

  /* ---------- 事件卡引擎（卡片内容在 events.js） ----------
   * 一张卡：{ id, title, tone, weight, cooldown, once, when(s), setup(s) -> ctx, text(ctx), options[] }
   * 选项：{ label, hint?, when?(ctx) -> 不可选原因, effect?: {...} | (ctx) => {...}, run?(ctx) -> 结果文本 }
   * 通用效果 effect：cash 现金 / dark 黑化 / rep 口碑 / ap 行动点 / traffic 本月客流倍率 / market {品类: 涨跌}
   */
  G.applyEffect = function (eff) {
    const s = S();
    if (!eff) return;
    if (eff.cash < 0) G.spend(-eff.cash, '事件');
    else if (eff.cash > 0) { s.cash += eff.cash; s.month_.revenue += eff.cash; }
    if (eff.dark) G.addDark(eff.dark);
    if (eff.rep) G.addRep(eff.rep);
    if (eff.ap) s.ap = Math.max(0, s.ap + eff.ap);
    if (eff.traffic) s.buffs.traffic = +(s.buffs.traffic * eff.traffic).toFixed(2);
    if (eff.market) for (const [k, d] of Object.entries(eff.market)) s.market[k] = +G.clamp(s.market[k] + d, 0.7, 1.4).toFixed(3);
  };
  G.effectText = function (eff) {
    if (!eff) return '';
    const sign = n => (n > 0 ? '+' : '') + n;
    const p = [];
    if (eff.cash) p.push(`现金 ${eff.cash > 0 ? '+' : ''}${G.fmt(eff.cash)}`);
    if (eff.ap) p.push(`行动点 ${sign(eff.ap)}`);
    if (eff.dark) p.push(`黑化 ${sign(eff.dark)}`);
    if (eff.rep) p.push(`口碑 ${sign(eff.rep)}`);
    if (eff.traffic) p.push(`本月客流 ×${eff.traffic}`);
    if (eff.market) for (const [k, d] of Object.entries(eff.market)) p.push(`${G.CATEGORIES[k].name}行情 ${d > 0 ? '+' : ''}${Math.round(d * 100)}%`);
    return p.join(' · ');
  };
  const call = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);

  G.DECISIONS.event = {
    view(d) {
      const ev = G.EVENT_MAP[d.id], ctx = d.ctx;
      const car = ctx.car || ctx.cand ? ctx.car : S().cars.find(c => c.id === (ctx.id ?? ctx.targetId ?? (ctx.ids || [])[0]));
      return {
        title: ev.title, tone: ev.tone || 'neutral', text: call(ev.text, ctx), car,
        options: ev.options.map(o => ({
          label: o.label,
          hint: o.hint ? call(o.hint, ctx) : G.effectText(call(o.effect, ctx)),
          disabled: o.when ? o.when(ctx) : null,
        })),
      };
    },
    resolve(d, i) {
      const ev = G.EVENT_MAP[d.id], o = ev.options[i], ctx = d.ctx;
      const eff = call(o.effect, ctx);
      G.applyEffect(eff);
      const text = o.run ? o.run(ctx) : null;
      return `【${ev.title}】${text || o.result || (eff ? `${o.label}：${G.effectText(eff)}` : o.label)}`;
    },
  };

  function pickEvent() {
    const s = S();
    const pool = G.EVENTS.filter(e =>
      !(e.once && s.eventsSeen[e.id]) &&
      (s.eventCd[e.id] || 0) <= s.month &&
      !s.pending.some(p => p.type === 'event' && p.data.id === e.id) &&
      (!e.when || e.when(s)));
    while (pool.length) {
      const weights = Object.fromEntries(pool.map(e => [e.id, Math.max(0.01, call(e.weight ?? 3, s))]));
      const e = G.EVENT_MAP[G.weighted(weights)];
      const ctx = e.setup ? e.setup(s) : {};
      if (!ctx) { pool.splice(pool.indexOf(e), 1); continue; }
      s.pending.push({ type: 'event', data: { id: e.id, ctx } });
      s.eventsSeen[e.id] = (s.eventsSeen[e.id] || 0) + 1;
      s.eventCd[e.id] = s.month + (e.cooldown ?? 4);
      return e;
    }
    return null;
  }
  function runEvents(r) {
    if (!G.EVENTS) return;
    const n = (G.chance(G.CONFIG.eventChance) ? 1 : 0) + (G.chance(G.CONFIG.secondEventChance) ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const e = pickEvent();
      if (e) r.lines.push({ type: 'event', text: `新事件：${e.title}` });
    }
  }
  G.forceEvent = function (id) {           // 调试用：在控制台 G.forceEvent('stolen_car')
    const e = G.EVENT_MAP[id], s = S();
    const ctx = e.setup ? e.setup(s) : {};
    if (!ctx) return false;
    s.pending.push({ type: 'event', data: { id, ctx } });
    return true;
  };

  /* ---------- 月结 ---------- */
  function customerCount() {
    const s = S(), lvl = G.level(), loc = G.loc();
    const x = lvl.traffic * loc.traffic * (0.5 + s.rep / 100) * (s.buffs.ad ? G.CONFIG.adTrafficMult : 1) * (s.buffs.traffic || 1) * G.Staff.trafficMult()
      * (1 - s.dark / G.CONFIG.darkTrafficDiv) * G.range(0.7, 1.3);
    return Math.floor(x) + (G.chance(x % 1) ? 1 : 0);
  }

  function sellRetail(car, r, priceOverride) {
    const s = S(), price = priceOverride ?? car.price;
    s.cash += price; s.month_.revenue += price; s.month_.cogs += car.cost;
    s.cars.splice(s.cars.indexOf(car), 1);
    const saleId = s.nextId++;
    const hidden = car.flaws.filter(f => !f.fixed && !G.Car.seen(f, 'public'));
    s.sales.push({ id: saleId, month: s.month, name: car.name, price, cost: car.cost, concealed: hidden.some(f => f.known), audited: false });
    if (s.sales.length > 200) s.sales.shift();
    const wd = G.WARRANTY[car.warranty];
    if (wd.months) s.warranties.push({
      saleId, name: car.name, monthsLeft: wd.months, newPrice: car.newPrice,
      mech: car.flaws.filter(f => !f.fixed && G.FLAWS[f.id].mech).map(f => f.id),
    });
    for (const f of hidden) s.bombs.push({
      saleId, flawId: f.id, knowing: f.known, monthsLeft: G.CONFIG.bombLifetime,
      dormant: G.randInt(G.CONFIG.bombDormant[0], G.CONFIG.bombDormant[1]),   // 先潜伏几个月，买家才会发现
      name: car.name, price, soldMonth: s.month, car: JSON.parse(JSON.stringify(car)),
    });
    s.stats.sold++;
    G.Finance.onSale(car, price, r);
    if (r) r.sales.push({ name: car.name, price, profit: price - car.cost, warranty: wd.months ? wd.name : '', art: G.Art ? G.Art.car(car, { size: 56, plain: true }) : '' });
    else G.log(`「${car.name}」成交 ${G.fmt(price)}，毛利 ${G.fmt(price - car.cost)}`);
    return s.sales[s.sales.length - 1];
  }
  /** 事件里直接成交一台车（会正常产生质保和隐患） */
  G.sellRetail = (car, price) => sellRetail(car, null, price);

  const buyerTerms = car => ({ value: Math.max(1,G.Car.value(car,'public')), price: car.price, warranty: car.warranty, finance: car.finance || 'none' });
  // 条件改变只重估同一位买家，不重抽预算偏好、不恢复耐心或轮次。
  G.refreshBuyer = function (car) {
    const b = car.buyer;
    if (!b || b.month !== S().month || b.status === 'left') return false;
    const terms = buyerTerms(car), bonus = t => G.WARRANTY[t.warranty].bonus + G.BUYER_FINANCE[t.finance].bonus;
    if (!b.terms || b.willingness === undefined) {
      b.terms = terms;
      b.willingness = Math.max(0,b.budget / terms.value - bonus(terms));
      return false; // 兼容上一版已谈到一半的报价。
    }
    const previous = b.terms;
    if (Object.keys(terms).every(k => terms[k] === previous[k])) return false;
    b.terms = terms;
    if (terms.price < 100) {
      b.status = 'left'; b.message = '车辆已撤下挂牌，本次洽谈结束；下月可再主动接待。';
      rememberTrade(b,null,b.quote,b.message); return true;
    }
    const material = terms.value !== previous.value || terms.warranty !== previous.warranty || terms.finance !== previous.finance;
    b.anchor = Math.min(b.anchor,terms.price); // 不能临时抬高挂牌，诱使原买家加预算。
    const budget = Math.max(100,Math.min(b.anchor,G.round(terms.value * (b.willingness + bonus(terms)),100)));
    b.quote = Math.max(100,Math.min(b.quote,budget,G.round(b.quote * budget / b.budget,100)));
    b.budget = budget;
    if (material && b.status === 'agreed') b.status = b.rounds < G.TRADE.rounds ? 'talking' : 'final';
    b.message = `${material ? '车况或质保、金融方案有变，买家按新条件重新核价' : '挂牌已调整，本次洽谈不会随抬价增加预算'}：“现在出 ${G.fmtTrade(b.quote)}。”轮次和耐心保持不变。`;
    rememberTrade(b,null,b.quote,b.message);
    return true;
  };

  // 主动零售：每台车每月只接待一位买家，暂离、刷新和改挂牌价都不重抽预算。
  G.act.meetBuyer = function (carId) {
    const s = S(), car = s.cars.find(c => c.id === carId);
    if (!car) return fail('车辆不存在');
    const existing = car.buyer?.month === s.month;
    const e = guard(existing ? 0 : G.TRADE.buyerAP, 0); if (e) return fail(e);
    if (existing) { G.refreshBuyer(car); return ok(); }
    if (car.price < 100) return fail('先给这台车设一个至少100元的挂牌价');
    pay(G.TRADE.buyerAP, 0, '接待');
    const style = G.randInt(0, G.TRADE.styles.length - 1), d = G.TRADE.styles[style];
    const shrewd = G.rand(), found = [];
    let caught = false;
    for (const f of car.flaws) {
      if (f.fixed || G.Car.seen(f, 'public') || !G.chance(shrewd * G.CUSTOMER.detect * (f.concealed ? G.CUSTOMER.concealDetectMult : 1))) continue;
      if (f.concealed) caught = true;
      else if (!f.known) { f.known = true; found.push(G.FLAWS[f.id].name); }
    }
    if (found.length) G.refreshAutoPrices();
    const anchor = Math.max(100, car.price), terms = buyerTerms(car);
    const willingness = G.range(...G.CUSTOMER.willing) - s.dark * G.CUSTOMER.darkPenalty;
    const will = terms.value * (willingness + G.WARRANTY[car.warranty].bonus + G.Finance.willBonus(car));
    const budget = Math.max(100, Math.min(anchor, G.round(will, 100)));
    const quote = Math.max(100, Math.min(budget, G.round(Math.min(anchor * G.range(0.86, 0.94), budget * 0.95), 100)));
    car.buyer = { month: s.month, style, anchor, quote, budget, willingness, terms, rounds: 0, patience: d.patience, status: caught ? 'left' : 'talking', message: '', history: [] };
    car.buyer.message = caught ? '买家验出了被掩盖的问题：“这车况你可没说，算了！”买家已离开。'
      : `${found.length ? `买家验出${found.join('、')}，按已知车况重新估价。` : ''}买家：“${tradeLine('buyer',car.buyer,'open',quote)}”`;
    rememberTrade(car.buyer,null,quote,car.buyer.message);
    if (caught && !car.caught) { car.caught = true; G.addRep(-G.CONFIG.caughtRep); }
    if (caught) G.log(`「${car.name}」${car.buyer.message}`, 'warn');
    return ok();
  };

  G.buyerCounterPrice = (b, tactic) => Math.max(b.quote, Math.min(b.anchor, G.round(b.quote + (b.anchor - b.quote) * G.TRADE.counters[tactic].share, 100)));
  G.act.counterBuyer = function (carId, tactic) {
    const car = S().cars.find(c => c.id === carId), b = car?.buyer;
    if (!b || b.month !== S().month || !owns(G.TRADE.counters, tactic)) return fail('当前没有这位买家');
    const e = guard(0, 0); if (e) return fail(e);
    if (G.refreshBuyer(car)) return fail('交易条件已变化，请看清新报价后再还价');
    if (b.status !== 'talking' || b.rounds >= G.TRADE.rounds) return fail('不能再还价了，可按买家报价成交或送客');
    const ask = G.buyerCounterPrice(b, tactic), d = G.TRADE.styles[b.style];
    b.rounds++;
    // 有预算也未必第一句就全掏出来；越往后，买家越愿意亮出能接受的价格。
    const readiness = Math.min(1,d.buyerConcede + 0.18 * (b.rounds - 1));
    const readyPrice = Math.min(b.budget,G.round(b.quote + (b.budget-b.quote) * readiness,100));
    if (ask <= b.budget && (ask <= readyPrice || b.rounds === G.TRADE.rounds)) {
      b.quote = ask; b.status = 'agreed';
      b.message = `你还价 ${G.fmtTrade(ask)}。买家：“${tradeLine('buyer',b,'accept',ask)}”`;
    } else {
      b.patience = Math.max(0, b.patience - (tactic === 'hard' && ask > b.budget ? 2 : 1));
      if (!b.patience) {
        b.status = 'left';
        b.message = `你还价 ${G.fmtTrade(ask)}。买家：“${tradeLine('buyer',b,'leave',b.quote)}”本月这位买家已离开。`;
        G.log(`「${car.name}」${b.message}`, 'warn');
      } else {
        const before = b.quote;
        b.quote = Math.max(before,Math.min(b.budget,ask,G.round(before + (Math.min(ask,b.budget) - before) * readiness,100)));
        b.status = b.rounds >= G.TRADE.rounds ? 'final' : 'talking';
        b.message = `你还价 ${G.fmtTrade(ask)}。买家：“${tradeLine('buyer',b,b.quote > before ? 'counter' : 'firm',b.quote)}”${b.status === 'final' ? ' 这是买家的最后报价。' : ''}`;
      }
    }
    rememberTrade(b,ask,b.quote,b.message);
    return ok(b.message);
  };

  G.act.acceptBuyer = function (carId) {
    const car = S().cars.find(c => c.id === carId), b = car?.buyer;
    if (!b || b.month !== S().month || b.status === 'left') return fail('买家已经离开');
    const e = guard(0, 0); if (e) return fail(e);
    if (G.refreshBuyer(car)) return fail('交易条件已变化，请确认买家的新报价再成交');
    b.status = 'left';
    sellRetail(car, null, b.quote);
    S().month_.negotiatedSales = S().month_.negotiatedSales || [];
    S().month_.negotiatedSales.push({ name: car.name, price: b.quote, profit: b.quote - car.cost, warranty: G.WARRANTY[car.warranty].months ? G.WARRANTY[car.warranty].name : '' });
    checkEnd();
    return ok(`「${car.name}」议价成交 ${G.fmtTrade(b.quote)}，毛利 ${G.fmtTrade(b.quote - car.cost)}`);
  };
  G.act.dismissBuyer = function (carId) {
    const b = S().cars.find(c => c.id === carId)?.buyer;
    if (!b || b.month !== S().month) return fail('当前没有这位买家');
    const e = guard(0, 0); if (e) return fail(e);
    b.status = 'left'; b.message = '你婉拒了这位买家。本月仍可等待其他客户在月底进店。';
    return ok('已送客，车辆继续挂牌');
  };

  /** 事件里把一台车加入库存 */
  G.addCar = function (car, cost, source) {
    const s = S();
    Object.assign(car, { cost, boughtMonth: s.month, monthsInStock: 0, warranty: 'none', source, autoPrice: true, finance: 'none' });
    car.price = G.suggestPrice(car);
    s.cars.push(car);
    s.stats.bought++;
    G.log(`「${car.name}」入库，花费 ${G.fmt(cost)}（${source}）`);
    return car;
  };
  G.removeCar = car => { const s = S(); s.cars.splice(s.cars.indexOf(car), 1); };

  function runSales(r) {
    const s = S(), n = customerCount();
    r.customers = n;
    const caught = new Set();
    const pub = new Map(s.cars.map(c => [c.id, G.Car.value(c, 'public')]));   // 估值缓存：一个月内不变
    const avail = s.cars.filter(c => c.price > 0);
    for (let i = 0; i < n; i++) {
      if (!avail.length) break;
      const anchor = G.pick(avail);
      const budget = anchor.price * G.range(0.85, 1.4);
      const wantCat = G.chance(G.CUSTOMER.specificPref) ? anchor.catId : null;
      const shrewd = G.rand();
      const w = G.range(G.CUSTOMER.willing[0], G.CUSTOMER.willing[1]) - s.dark * G.CUSTOMER.darkPenalty;
      let best = null;
      for (const car of avail) {
        if (wantCat && car.catId !== wantCat) continue;
        if (car.price > budget) continue;
        const disc = new Set();
        for (const f of car.flaws) {
          // 专门「处理」过的问题更难看出来
          const detect = shrewd * G.CUSTOMER.detect * (f.concealed ? G.CUSTOMER.concealDetectMult : 1);
          if (f.fixed || G.Car.seen(f, 'public') || !G.chance(detect)) continue;
          disc.add(f.id);
          if (f.concealed) {
            // 同一台车只在第一次被识破时影响口碑（消息传开一次就够了）
            if (!caught.has(car.id) && !car.caught) {
              caught.add(car.id); car.caught = true; G.addRep(-G.CONFIG.caughtRep);
              r.lines.push({ type: 'bad', text: `客户验车时识破了「${car.name}」被掩盖的问题，扭头就走（口碑 -${G.CONFIG.caughtRep}）` });
            }
          } else if (!f.known) {
            f.known = true;
            pub.set(car.id, G.Car.value(car, 'public'));
            r.lines.push({ type: 'warn', text: `客户验车时发现「${car.name}」有「${G.FLAWS[f.id].name}」，你现在知道了` });
          }
        }
        const will = (disc.size ? G.Car.value(car, 'public', disc) : pub.get(car.id)) * (w + G.WARRANTY[car.warranty].bonus + G.Finance.willBonus(car));
        if (car.price <= will && (!best || will - car.price > best.surplus)) best = { car, surplus: will - car.price };
      }
      if (best) { sellRetail(best.car, r); avail.splice(avail.indexOf(best.car), 1); }
    }
  }

  function runWarranties(r) {
    const s = S();
    for (const w of s.warranties) {
      w.monthsLeft--;
      if (w.mech.length && G.chance(0.2)) {
        const id = w.mech.shift();
        const cost = G.round(w.newPrice * G.FLAWS[id].repairRate, 100);
        expense(cost, '质保理赔'); G.addRep(1);
        s.bombs = s.bombs.filter(b => !(b.saleId === w.saleId && b.flawId === id)); // 质保兜住了，雷拆掉
        r.lines.push({ type: 'warn', text: `质保理赔：「${w.name}」${G.FLAWS[id].name}，维修 ${G.fmt(cost)}（客户满意，口碑 +1）` });
      } else if (G.chance(G.CONFIG.warrantySmallClaim)) {
        const cost = G.round(G.range(3000, 10000), 100);
        expense(cost, '质保理赔');
        r.lines.push({ type: 'warn', text: `质保小额理赔：「${w.name}」${G.fmt(cost)}` });
      }
    }
    s.warranties = s.warranties.filter(w => w.monthsLeft > 0);
  }

  function runBombs(r) {
    const s = S(); let fired = 0;
    s.bombs = s.bombs.filter(b => {
      if (b.dormant > 0) { b.dormant--; return true; }
      b.monthsLeft--;
      const rate = G.FLAWS[b.flawId].bombRate * (b.knowing ? G.CONFIG.bombKnowingMult : G.CONFIG.bombUnknownMult);
      if (fired < G.CONFIG.maxComplaintsPerMonth && G.chance(rate)) {
        fired++;
        s.pending.push({ type: 'complaint', data: b });
        r.lines.push({ type: 'bad', text: `「${b.name}」的买家找上门了` });
        return false;
      }
      return b.monthsLeft > 0;
    });
  }

  function runCosts(r) {
    const s = S(), lvl = G.level(), loc = G.loc();
    const rent = Math.round(lvl.baseRent * loc.rent), wages = lvl.wages;
    const classic = s.cars.filter(c => G.CATEGORIES[c.catId].classic).length * G.CONFIG.classicStorageFee;
    const third = s.perks.thirdParty ? G.CONFIG.thirdPartyFee : 0;
    const payroll = G.Staff.payroll();
    expense(rent + wages, '房租开销');
    if (payroll) expense(payroll, '员工工资');
    if (classic) expense(classic, '收藏车保管');
    if (third) expense(third, '第三方检测');
    r.lines.push({ type: 'info', text: `房租 ${G.fmt(rent)} · 基本开销 ${G.fmt(wages)}${payroll ? ` · 员工工资 ${G.fmt(payroll)}` : ''}${classic ? ` · 收藏车保管 ${G.fmt(classic)}` : ''}${third ? ` · 第三方检测 ${G.fmt(third)}` : ''}` });
  }

  function runAging(r) {
    for (const car of S().cars) {
      car.monthsInStock++;
      if (car.monthsInStock < 2 || !G.chance(0.2)) continue;
      const id = G.chance(0.5) ? 'battery' : 'tires';
      const f = car.flaws.find(x => x.id === id);
      if (f && !f.fixed) continue;
      if (f) f.fixed = false; else car.flaws.push({ id, known: true, concealed: false, fixed: false });
      r.lines.push({ type: 'warn', text: `「${car.name}」停放太久，出现${G.FLAWS[id].name}` });
    }
  }

  function runMarket(r) {
    const s = S(), moves = [];
    for (const [k, cat] of Object.entries(G.CATEGORIES)) {
      const before = s.market[k];
      const m = before + (1 - before) * 0.1 + G.gauss() * cat.vol;
      s.market[k] = +G.clamp(m, 0.75, 1.3).toFixed(3);
      const d = s.market[k] - before;
      if (Math.abs(d) >= 0.03) moves.push(`${cat.name}${d > 0 ? '↑' : '↓'}${Math.abs(d * 100).toFixed(0)}%`);
    }
    if (moves.length) r.lines.push({ type: 'info', text: `行情变动：${moves.join('，')}` });
  }

  function runInspection(r) {
    const s = S();
    if (!G.chance(G.inspectChance())) return;
    let fine = 0, found = 0;
    for (const car of s.cars) for (const f of car.flaws) {
      if (f.concealed && !f.fixed && G.chance(0.6)) {
        f.concealed = false; found++;
        fine += f.id === 'flood' ? G.CONFIG.inspectFine.flood : G.CONFIG.inspectFine.default;
      }
    }
    for (const sale of s.sales) {
      if (sale.month >= s.month - 6 && sale.concealed && !sale.audited && G.chance(0.3)) {
        sale.audited = true; found++; fine += G.CONFIG.inspectFine.sale;
      }
    }
    fine = G.round(G.legalCost(fine), 100);
    if (found) {
      // 查出越多，黑化跳得越狠：被盯上之后很容易连锁翻车
      const darkUp = Math.min(40, G.CONFIG.inspectDarkBase + found * G.CONFIG.inspectDarkPerItem);
      expense(fine, '罚款'); G.addDark(darkUp); G.addRep(-G.CONFIG.inspectRep);
      r.lines.push({ type: 'bad', text: `市场监管突击检查！查出 ${found} 处问题，罚款 ${G.fmt(fine)}，黑化 +${darkUp}，口碑 -${G.CONFIG.inspectRep}` });
    } else {
      G.addRep(2);
      r.lines.push({ type: 'good', text: '市场监管突击检查，台账干净，顺利通过（口碑 +2）' });
    }
  }

  function runLiquidation(r) {
    const s = S();
    if (s.cash >= 0 || s.over) return;
    const sorted = [...s.cars].sort((a, b) => G.peerPrice(b) - G.peerPrice(a));
    for (const car of sorted) {
      if (s.cash >= 0) break;
      const p = Math.round(G.peerPrice(car) * 0.9);
      s.cash += p; s.month_.revenue += p; s.month_.cogs += car.cost;
      s.cars.splice(s.cars.indexOf(car), 1);
      r.lines.push({ type: 'bad', text: `资金链紧张，「${car.name}」被迫甩卖 ${G.fmt(p)}` });
    }
    if (s.cash < 0) s.over = 'bankrupt';
  }

  G.act.endMonth = function () {
    const s = S();
    if (s.over) return fail('游戏已结束');
    if (G.cleanPending()) return fail('请先处理待办事件');
    s.visit = null; s.pledgeVisit = null;
    const beforeNet = G.netWorth(), beforeDark = s.dark;
    const r = { month: s.month, date: G.dateLabel(), sales: [...(s.month_.negotiatedSales || [])], lines: [], customers: 0 };

    G.refreshAutoPrices();
    runSales(r);
    runWarranties(r);
    runBombs(r);
    runCosts(r);
    G.Finance.monthly(r);
    runAging(r);
    runMarket(r);
    runInspection(r);
    runLiquidation(r);

    const m = s.month_;
    r.revenue = m.revenue; r.cogs = m.cogs; r.opex = m.opex; r.opexBy = m.opexBy || {};
    r.profit = m.revenue - m.cogs - m.opex;
    r.cash = s.cash; r.net = G.netWorth();
    s.history.push({ level: s.store.level, month: s.month, revenue: m.revenue, cogs: m.cogs, opex: m.opex, opexBy: m.opexBy || {}, profit: r.profit, cash: s.cash, net: r.net, dark: s.dark, rep: s.rep });
    s.stats.peakProfit = Math.max(s.stats.peakProfit, r.profit);
    // 黑化自然回落：旧账慢慢被时间冲淡
    if (s.dark > 0 && G.CONFIG.darkDecay) s.dark = Math.max(0, s.dark - G.CONFIG.darkDecay);
    // 口碑向 50 回落：高口碑要持续维护
    if (s.rep > 50) s.rep -= Math.ceil((s.rep - 50) * G.CONFIG.repDecay);
    else if (s.rep < 50 && G.chance(0.5)) s.rep += 1;
    s.lossStreak = r.profit < 0 ? s.lossStreak + 1 : 0;
    if (!s.over && s.lossStreak >= 12 && s.cash < G.monthlyFixedCost()) s.over = 'bankrupt';

    s.month++;
    s.ap = G.maxAp();
    s.buffs.ad = false;
    s.buffs.traffic = 1;
    s.flags.reported = false;
    s.month_ = { revenue: 0, cogs: 0, opex: 0, opexBy: {} };
    checkEnd();
    G.Staff.monthly();
    G.refreshAutoPrices();
    if (!s.over) runEvents(r);
    r.netChange = r.net - beforeNet; r.darkChange = s.dark - beforeDark;
    s.lastReport = r;
    G.log(`${r.date}月结：成交 ${r.sales.length} 台，利润 ${G.fmt(r.profit)}`, r.profit >= 0 ? 'good' : 'bad');
    return { ok: true, report: r };
  };
})();
