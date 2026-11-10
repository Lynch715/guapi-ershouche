/* 冒烟测试：每张事件卡的每个选项，在几种不同局面下各跑一遍，确保不报错。
 * 用法：node tools/test-events.js */
const path = require('path');
for (const f of ['data', 'util', 'car', 'game', 'staff', 'finance', 'events']) require(path.join(__dirname, '..', 'js', f + '.js'));
const G = globalThis.G;
const originalLog = console.log;
let assertions = 0;
console.log = (...args) => { if (String(args[0]).startsWith('✗')) process.exitCode = 1; if (/^[✓✗]/.test(String(args[0]))) assertions++; originalLog(...args); };

// 造几种局面：空库存 / 满库存带各种问题车 / 2级店雨季 / 高黑化冬天
function scene(kind, seed) {
  G.newGame('small', 'city', seed);
  const s = G.state;
  if (kind === 'empty') return;
  s.store.level = ['rich','trusted'].includes(kind) ? 2 : 1;
  s.month = { full: 7, rich: 10, dark: 12, trusted: 5 }[kind];
  if (kind === 'trusted') s.rep = 80;
  if (kind === 'dark') { s.dark = 60; s.rep = 30; }
  const chans = ['private', 'auction', 'wreck', 'peer', 'dealer4s'];
  for (let i = 0; s.cars.length < G.capacity() - (kind === 'rich' ? 3 : 0); i++) {
    const car = G.Car.generate(chans[i % chans.length], i % 4 === 0 ? { catId: 'classic' } : {});
    G.Car.reveal(car);
    if (i % 3 === 0) car.flaws.forEach(f => { if (!G.FLAWS[f.id].visible) f.concealed = true; });
    G.addCar(car, 100000, 'test');
  }
  // 每个岗位一个 2 级、品行一般、干满一年的员工
  for (const role of Object.keys(G.ROLES)) {
    const e = G.Staff.makeCandidate({ role, level: 2, integrity: 0.3 });
    e.tenure = 13;
    s.staff.push(e);
  }
}

let runs = 0, errors = 0;
for (const ev of G.EVENTS) {
  for (const kind of ['empty', 'full', 'rich', 'dark', 'trusted']) {
    for (let oi = 0; oi < ev.options.length; oi++) {
      scene(kind, 7 + oi);
      const s = G.state;
      if (ev.when && !ev.when(s)) continue;
      try {
        if (!G.forceEvent(ev.id)) continue;
        const view = G.currentDecision();
        if (!view.title || !view.text || view.options.length !== ev.options.length) throw new Error('view 不完整');
        const res = G.act.decide(oi);
        if (!res.ok && !view.options[oi].disabled) throw new Error('decide 失败：' + res.msg);
        JSON.stringify(s);                                   // 存档能序列化
        if (Number.isNaN(s.cash) || Number.isNaN(s.dark) || Number.isNaN(s.rep)) throw new Error('出现 NaN');
        if (s.cars.some(c => !c.price && c.price !== 0)) throw new Error('车辆价格异常');
        runs++;
      } catch (e) {
        errors++;
        console.log(`✗ ${ev.id} [${kind}] 选项${oi}「${ev.options[oi].label}」：${e.message}`);
      }
    }
  }
}
const never = G.EVENTS.filter(ev => !['empty', 'full', 'rich', 'dark', 'trusted'].some(k => { scene(k, 1); return !ev.when || ev.when(G.state); }));

// 员工相关：雇佣、解雇、加成
G.newGame('small', 'city', 9);
const c = G.state.candidates[0];
console.log(G.act.hire(c.id).ok && G.state.staff.length === 1 ? '✓ 招聘' : '✗ 招聘失败');
G.state.candidates.slice(1).forEach(x => G.act.hire(x.id));
console.log(G.state.staff.length === G.Staff.slots() ? '✓ 编制上限生效' : '✗ 编制上限没生效：' + G.state.staff.length);
const ap0 = G.maxAp(); G.act.fire(G.state.staff[0].id);
console.log(G.state.staff.length === G.Staff.slots() - 1 ? '✓ 解雇' : '✗ 解雇失败');
G.act.endMonth(); while (G.cleanPending()) G.act.decide(G.currentDecision().options.findIndex(o => !o.disabled));
console.log(G.state.ap === G.maxAp() && G.state.candidates.length > 0 ? `✓ 月初行动点 = ${G.state.ap}，候选人已刷新` : '✗ 月初状态异常');
// 旧存档迁移
const old = JSON.parse(JSON.stringify(G.state)); delete old.staff; delete old.candidates;
G.state = G.migrate(old);
console.log(Array.isArray(G.state.staff) && G.state.candidates.length ? '✓ 旧存档迁移' : '✗ 旧存档迁移失败');
console.log(`\n${G.EVENTS.length} 张卡，跑了 ${runs} 个选项组合，错误 ${errors} 个`);
if (never.length) console.log('这些卡在测试局面里一次都没触发：', never.map(e => e.id).join(', '));

// 同一台车被两张卡引用：先处理的卡卖掉车，后一张应自动作废
G.newGame('small', 'city', 5);
const c1 = G.Car.generate('private'); G.addCar(c1, 80000, 't');
G.state.pending.push({ type: 'event', data: { id: 'lowball', ctx: { id: c1.id, price: c1.price } } });
G.state.pending.push({ type: 'event', data: { id: 'collector', ctx: { id: c1.id, offer: 1 } } });
G.act.decide(0);
console.log(G.currentDecision() === null && G.state.pending.length === 0 ? '✓ 失效事件自动作废' : '✗ 失效事件没有作废');

/* ---------- 贷款与抵押 ---------- */
const check = (cond, msg) => console.log((cond ? '✓ ' : '✗ ') + msg);
const resolveAll = pick => { while (G.cleanPending()) { const d = G.currentDecision(); G.act.decide(pick ?? d.options.findIndex(o => !o.disabled)); } };
function stocked(seed) {
  G.newGame('small', 'city', seed);
  for (let i = 0; i < 6; i++) { const car = G.Car.generate('dealer4s'); G.Car.reveal(car); G.addCar(car, 100000, 'test'); }
  return G.state;
}

// 借款与额度
let s = stocked(21);
const lim = G.Finance.limit('store');
check(lim === G.round(G.FINANCE.storeBaseValue * G.LOANS.store.ltv, 10000), `门店贷额度 ${G.fmt(lim)}`);
check(!G.act.borrow('store', lim + 10000).ok, '超额借款被拒');
const cash0 = s.cash, net0 = G.netWorth();
check(G.act.borrow('store', lim).ok && s.cash === cash0 + lim, '借款到账');
check(Math.abs(G.netWorth() - net0) < 2, '借款不改变净资产');
check(G.Finance.limit('store') === 0, '借满后额度为 0');
const rem0 = s.loans[0].remaining;
s.cars = []; G.act.endMonth(); resolveAll();
check(s.loans[0].remaining < rem0 && s.loans[0].monthsLeft === G.LOANS.store.term - 1, '月结扣月供，本金减少');
check(G.act.repay(s.loans[0].id).ok && s.loans.length === 0, '提前还款');

// 逾期 → 库存贷强制拍卖
s = stocked(22);
G.act.borrow('stock', G.Finance.limit('stock'));
s.cars.forEach(c => { c.autoPrice = false; c.price = 1e9; });   // 车卖不出去
// 每月只留够房租工资的钱：付得起开销，付不起月供
for (let m = 0; m < 3 && !s.over; m++) { s.cash = G.monthlyFixedCost() + 1000; G.act.endMonth(); resolveAll(); }
check(s.loans.length === 0 && s.credit < G.FINANCE.creditStart, `库存贷连续逾期被强制拍卖，征信降到 ${s.credit}`);

// 门店贷逾期 → 法拍结局
s = stocked(23);
G.act.borrow('store', G.Finance.limit('store'));
s.cars = [];
for (let m = 0; m < 3 && !s.over; m++) { s.cash = G.monthlyFixedCost() + 1000; G.act.endMonth(); resolveAll(); }
check(s.over === 'foreclosed' && G.endingInfo().title === '门店被法拍', '门店贷连续逾期 → 门店被法拍结局');

// 征信差借不到
s = stocked(24); s.credit = 30;
check(!G.act.borrow('store', 100000).ok, '征信差借不到钱');

// 买家车贷：服务费、民间车贷断供决策
s = stocked(25);
const car = s.cars[0]; G.act.setFinance(car.id, 'private');
const before = s.cash, salePrice = G.eventSalePrice(car,200000); G.sellRetail(car, 200000);
check(s.cash === before + salePrice + G.round(salePrice * G.BUYER_FINANCE.private.fee, 100), '民间车贷按实际成交价收服务费');
check(s.buyerLoans.length === 1, '民间车贷记入担保');
const originalDefaultRate = G.BUYER_FINANCE.private.defaultRate;
G.BUYER_FINANCE.private.defaultRate = 1;          // 强制断供
G.act.endMonth();
check(G.currentDecision() && G.currentDecision().title === '民间车贷断供', '断供触发催收决策');
for (let i = 0; i < 3; i++) { const t = JSON.parse(JSON.stringify(s)); const r = G.act.decide(i); check(r.ok, `断供选项${i}：${r.msg}`); G.state = s = t; }
G.BUYER_FINANCE.private.defaultRate = originalDefaultRate;

// 车主抵押借款：赎回 / 断赎入库 / 二次抵押纠纷三个选项
for (const [label, redeem, dbl] of [['按时赎回', 1, false], ['断赎车归车行', 0, false], ['二次抵押纠纷', 0, true]]) {
  s = stocked(26); s.cars = [];
  G.act.pledgeVisit();
  const c = s.pledgeVisit.clients[0]; c.double = dbl; c.term = 1;
  G.act.pledgeCheck(c.id);
  const cash1 = s.cash; G.act.pledgeSign(c.id);
  check(s.cash === cash1 - c.amount && G.Finance.assets() === c.amount, `${label}：放款 ${G.fmt(c.amount)}，计入资产`);
  G.PLEDGE.redeemRate = redeem; G.act.pledgeClose(); G.act.endMonth();
  if (redeem) check(s.pledges.length === 0 && s.cash > cash1 - c.amount, `${label}：收回本息`);
  else if (!dbl) check(s.cars.some(x => x.id === c.car.id), `${label}：车进库存`);
  else {
    check(G.currentDecision() && G.currentDecision().title === '二次抵押纠纷', `${label}：触发纠纷决策`);
    for (let i = 0; i < 3; i++) { const t = JSON.parse(JSON.stringify(s)); const r = G.act.decide(i); check(r.ok, `纠纷选项${i}：${r.msg}`); G.state = s = t; }
  }
}
G.PLEDGE.redeemRate = 0.7;
JSON.stringify(G.state);
check(true, '存档可序列化');

/* ---------- v0.9 存档、规模风险回归 ---------- */
s = stocked(177);
const legacy = JSON.parse(JSON.stringify(s));
for (const k of ['startedAt','staff','candidates','loans','buyerLoans','pledges','credit','storeValue','pledgeVisit','buffs','flags','perks','eventCd','eventsSeen']) delete legacy[k];
legacy.cars.forEach(c => { delete c.autoPrice; delete c.finance; });
const live = G.state;
const migrated = G.parseSave(JSON.stringify(legacy));
check(G.state === live, '迁移校验不提交当前局');
check(migrated.startedAt === null, '旧存档无开张日期时保持未知');
check(G.parseSave(JSON.stringify({ ...legacy, startedAt: {} })).startedAt === null, '损坏的开张日期不显示无效时间');
G.state = migrated;
for (let m = 0; m < 24; m++) { const r = G.act.endMonth(); check(r.ok && Number.isFinite(G.netWorth()), `旧存档续玩第 ${m + 1} 个月`); resolveAll(); }
const roundtrip = G.parseSave(JSON.stringify(G.state));
check(JSON.stringify(roundtrip) === JSON.stringify(G.state), '完整存档往返保留全部数据与随机种子');
const beforeImport = JSON.stringify(G.state);
for (const bad of ['no-json', '{}', 'null', JSON.stringify({ ...G.state, cars: [{id:1}] }), JSON.stringify({ ...G.state, pending:[{type:'unknown',data:{}}] }), JSON.stringify({ ...G.state, history:[null] }), JSON.stringify({ ...G.state, ap:1e12 }), JSON.stringify({ ...G.state, staff:[{ id:1, role:'constructor',level:1,name:'坏数据',salary:1,integrity:1,tenure:0 }] })]) {
  check(!G.importSave(bad).ok && JSON.stringify(G.state) === beforeImport, '损坏存档被拒，当前存档不变');
}
s = stocked(178); const loanCar = s.cars[0]; loanCar.finance = 'private'; G.sellRetail(loanCar, 200000);
s.pending.push({type:'buyerDefault',data:{names:['测试车'],loss:40000}});
check(G.parseSave(JSON.stringify(s)).pending.length === 1, '合法待办与金融数据可导入');
const smallRisk = G.Finance.buyerRisk();
check(smallRisk.load === 0 && smallRisk.defaultRate === G.BUYER_FINANCE.private.defaultRate, '小本规模不受风险新规影响');
s.cash = 160000000;
s.buyerLoans.push({id:s.nextId++,name:'测试担保',balance:100000000,total:12,monthsLeft:12});
check(G.Finance.buyerRisk().defaultRate > smallRisk.defaultRate, '大规模集中担保提高断供风险');
check(Number.isFinite(G.inspectChance()), '大规模抽查概率有效');
console.log(`\n断言 ${assertions} 项，事件组合 ${runs} 项，${process.exitCode ? '有失败' : '全部通过'}`);
if (errors) process.exitCode = 1;
