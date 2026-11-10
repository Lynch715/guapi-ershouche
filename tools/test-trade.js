/* 议价交易的不变量、存档续谈、账本和旧流程回归。node tools/test-trade.js */
const assert = require('node:assert/strict');
const path = require('node:path');
for (const f of ['data', 'util', 'car', 'game', 'staff', 'finance', 'events']) require(path.join(__dirname, '..', 'js', f + '.js'));
const G = globalThis.G;
let checks = 0;
function check(ok, label) { assert.ok(ok, label); checks++; }
function fresh(seed = 17) { G.newGame('small', 'suburb', seed); return G.state; }
function stock(seed = 17) {
  const s = fresh(seed), car = G.Car.generate('dealer4s', { hiddenRate: 0 });
  car.flaws = []; G.Car.reveal(car); G.addCar(car, 30000, 'test');
  return { s, car };
}
function roundTrip() { G.state = G.parseSave(JSON.stringify(G.state)); return G.state; }
function rejects(mutator) {
  const copy = JSON.parse(JSON.stringify(G.state)); mutator(copy);
  assert.throws(() => G.parseSave(JSON.stringify(copy))); checks++;
}

let s = fresh(); G.act.visit('private');
const before = JSON.stringify(s), ids = s.visit.offers.map(o => o.car.id), cash = s.cash, ap = s.ap;
check(!G.act.rejectOffer(99).ok && JSON.stringify(s) === before, '不存在的车不能误拒绝或改状态');
check(G.act.rejectOffer(1).ok && s.visit.offers.length === ids.length - 1, '拒绝只移除一台车');
check(!s.visit.offers.some(o => o.car.id === ids[1]) && s.visit.offers[0].car.id === ids[0], '拒绝不影响其他车源顺序');
check(s.cash === cash && s.ap === ap && !s.stats.bought && !s.cars.length, '拒绝不扣钱、不花行动点、不购买');
s = roundTrip(); check(!s.visit.offers.some(o => o.car.id === ids[1]), '刷新后拒绝的车不会复现');
while (s.visit.offers.length) G.act.rejectOffer(0);
check(G.act.closeVisit().ok && !s.visit, '拒绝整批后可以正常离开');

s = fresh(); G.act.visit('auction');
const auction = JSON.stringify(s);
check(!G.act.bargainOffer(0, 'hard').ok && JSON.stringify(s) === auction, '拍卖固定报价，不消耗随机数或修改状态');
check(G.act.rejectOffer(0).ok, '拍卖也可以拒绝');

s = fresh(); G.act.visit('private');
const rng = s.rngState;
check(!G.act.bargainOffer(0, 'typo').ok && s.rngState === rng, '无效策略不抽取卖家性格');
let o = s.visit.offers[0], initial = G.offerPrice(o);
check(G.act.bargainOffer(0, 'gentle').ok && G.offerPrice(o) <= initial && o.negotiation.rounds === 1, '收购议价只降低报价，不立即扣款');
const quote = G.offerPrice(o), talk = JSON.stringify(o.negotiation);
s = roundTrip(); o = s.visit.offers[0];
check(JSON.stringify(o.negotiation) === talk && G.offerPrice(o) === quote, '保存重载保留议价轮次、底价和报价');
rejects(x => x.visit.offers[0].negotiation.rounds = 100);
rejects(x => x.visit.offers[0].negotiation.discount = 0.9);
rejects(x => x.visit.offers[0].negotiation.style = 99);
const purchaseCash = s.cash, purchaseAp = s.ap;
check(G.act.buyOffer(0).ok && s.cash === purchaseCash - quote && s.cars[0].cost === quote, '按议后报价准确入库并记成本');
check(s.ap === purchaseAp && s.stats.bought === 1, '收购谈价与成交不额外花行动点');
check(!s.visit.offers.some(x => x.car.id === o.car.id), '成交车从本批移除');

s = fresh(); G.act.visit('wreck'); o = s.visit.offers[0];
G.act.bargainOffer(0, 'gentle');
const towTotal = G.offerPrice(o) + G.CHANNELS.wreck.towFee, towCash = s.cash;
check(G.act.buyOffer(0).ok && s.cars[0].cost === towTotal && s.cash === towCash - towTotal, '议价不免除拖车费');

s = fresh(); G.act.visit('private'); o = s.visit.offers[0];
o.negotiation = { style: 2, floor: 0.96, discount: 0, rounds: 0, patience: 2, message: '' };
const walkId = o.car.id;
check(G.act.bargainOffer(0, 'hard').ok && !s.visit.offers.some(x => x.car.id === walkId), '急性子遇到狠砍会离场，车辆不能再买');
check(s.visit.message.includes('谈崩') && !s.cars.length, '谈崩留下可见结果且不误成交');

s = fresh(); G.act.visit('private'); o = s.visit.offers[0];
o.negotiation = { style: 0, floor: 0.84, discount: 0, rounds: 0, patience: 4, message: '' };
for (let i = 0; i < 3; i++) G.act.bargainOffer(0, 'gentle');
const final = JSON.stringify(s);
check(!G.act.bargainOffer(0, 'gentle').ok && JSON.stringify(s) === final, '第四轮无法继续压价');
o.car.flaws.push({id:'flood',known:false,fixed:false,concealed:false});
const preInspect = G.offerPrice(o); G.act.inspectVisit();
check(G.offerPrice(o) < preInspect && o.negotiation.rounds === 3, '验车按新车况降价，不能重置谈价轮次');
s.cash = 0; const noCash = JSON.stringify(s);
check(!G.act.buyOffer(0).ok && JSON.stringify(s) === noCash, '现金不足时保持报价、车源、库存');
s.cash = 5000000; s.store.level = 1;
while (s.cars.length < G.capacity()) G.addCar(G.Car.generate('dealer4s'), 10000, 'test');
check(!G.act.buyOffer(0).ok && s.visit.offers.includes(o), '库存满时不丢议价结果');

let scene = stock(); s = scene.s; let car = scene.car;
const list = car.price;
check(G.act.reducePrice(car.id).ok && car.price < list && car.autoPrice === false, '一键降价并停止自动回涨');
const reduced = car.price; G.refreshAutoPrices(); check(car.price === reduced, '自动刷新不会撤销手动降价');
check(G.act.suggestPrice(car.id).ok && car.autoPrice && car.price === G.suggestPrice(car), '可恢复自动定价');
car.price = 1000; G.act.reducePrice(car.id); check(car.price < 1000, '低价车辆也能实际降价');
car.price = 100; check(!G.act.reducePrice(car.id).ok && car.price === 100, '最低挂牌价不会降成零或负数');
G.act.suggestPrice(car.id);
s.ap = 0; const noAp = JSON.stringify(s);
check(!G.act.meetBuyer(car.id).ok && JSON.stringify(s) === noAp, '行动点不足不能召唤买家');
s.ap = 6; G.act.setWarranty(car.id,'m3'); G.act.setFinance(car.id,'private'); const cashBeforeMeet = s.cash;
check(G.act.meetBuyer(car.id).ok && s.ap === 5 && s.cash === cashBeforeMeet, '主动接待只扣一次行动点，不直接交易');
const bSnap = JSON.stringify(car.buyer), bRng = s.rngState;
G.act.meetBuyer(car.id);
check(s.ap === 5 && s.rngState === bRng && JSON.stringify(car.buyer) === bSnap, '关窗重开不会换买家或重复扣点');
s = roundTrip(); car = s.cars[0];
check(JSON.stringify(car.buyer) === bSnap, '保存重载保留买家报价、预算和耐心');
G.act.setPrice(car.id, car.price * 2); G.act.meetBuyer(car.id);
check(car.buyer.budget === JSON.parse(bSnap).budget && car.buyer.willingness === JSON.parse(bSnap).willingness && s.rngState === bRng && s.ap === 5, '改挂牌价不能重抽当前买家的预算');
rejects(x => x.cars[0].buyer.quote = x.cars[0].buyer.budget + 1);
rejects(x => x.cars[0].buyer.month = x.month + 1);
rejects(x => x.cars[0].buyer.status = 'invalid');
const invalidCounter = JSON.stringify(s);
check(!G.act.counterBuyer(car.id, 'typo').ok && JSON.stringify(s) === invalidCounter, '无效还价不改买家状态');
const b = car.buyer; b.anchor = 100000; b.quote = 80000; b.budget = 95000; b.style = 0;
check(G.act.counterBuyer(car.id, 'gentle').ok && b.status === 'agreed' && b.quote === 85000, '合理让价可以谈成');
const agreed = JSON.stringify(s);
check(!G.act.counterBuyer(car.id, 'hard').ok && JSON.stringify(s) === agreed, '谈好价格后不可再抬价');
const salePrice = b.quote, cost = car.cost, saleCash = s.cash;
check(G.act.acceptBuyer(car.id).ok && !s.cars.length && s.stats.sold === 1, '确认后才移车和记零售成交');
const fee = G.round(salePrice * G.BUYER_FINANCE.private.fee, 100);
check(s.cash === saleCash + salePrice + fee && s.month_.revenue === salePrice + fee && s.month_.cogs === cost, '零售收入、车贷服务费和成本准确记账');
check(s.sales[0].price === salePrice && s.warranties.length === 1 && s.buyerLoans.length === 1, '议价沿用质保、销售台账和担保贷款');
const sold = JSON.stringify(s); check(!G.act.acceptBuyer(car.id).ok && JSON.stringify(s) === sold, '连点成交不会重复收钱');
check(G.parseSave(JSON.stringify(s)).month_.negotiatedSales.length === 1, '当月议价成交可保存');
const report = G.act.endMonth().report;
check(report.sales.some(x => x.price === salePrice && x.profit === salePrice - cost), '月结成交明细包含主动销售');
check(report.revenue >= salePrice && report.cogs === cost && report.sales.length === 1, '月结不漏算或重复计算议价交易');
check(!s.month_.negotiatedSales, '新月不重复展示上月的主动成交');

scene = stock(22); s = scene.s; car = scene.car; G.act.meetBuyer(car.id);
Object.assign(car.buyer, { anchor:100000, quote:80000, budget:81000, style:2, patience:2 });
check(G.act.counterBuyer(car.id, 'hard').ok && car.buyer.status === 'left', '坚持高价可能把买家谈走');
const departed = JSON.stringify(car.buyer), departedAp = s.ap;
check(!G.act.acceptBuyer(car.id).ok && s.cars.includes(car), '离场买家不能成交');
G.act.meetBuyer(car.id); check(JSON.stringify(car.buyer) === departed && s.ap === departedAp, '谈崩当月不能刷出新买家');
s.month++; s.ap = 6; G.act.meetBuyer(car.id);
check(car.buyer.month === s.month && s.ap === 5 && car.buyer.status === 'talking', '下月可再接待一位新买家');
G.act.dismissBuyer(car.id);
check(car.buyer.status === 'left' && s.cars.includes(car) && car.price > 0, '送客保留库存和挂牌');

scene = stock(23); s = scene.s; car = scene.car; G.act.meetBuyer(car.id);
Object.assign(car.buyer, { anchor:100000, quote:80000, budget:81000, style:0, patience:4 });
for (let i = 0; i < 3; i++) G.act.counterBuyer(car.id, 'gentle');
check(car.buyer.rounds === 3 && car.buyer.status === 'final', '三轮后保留买家最终报价');
check(!G.act.counterBuyer(car.id, 'gentle').ok && G.act.acceptBuyer(car.id).ok, '最终报价仍可成交，但不能继续拉扯');

// 保留信息不对称：主动买家同样验车，发现隐瞒会走，未知问题会被揭示。
scene = stock(24); s = scene.s; car = scene.car;
car.flaws = [{id:'flood',known:true,concealed:true,fixed:false}];
const chance = G.chance; G.chance = () => true;
G.act.meetBuyer(car.id); G.chance = chance;
check(car.buyer.status === 'left' && car.caught && s.rep < 50, '识破隐瞒拒绝成交并沿用口碑代价');
scene = stock(25); s = scene.s; car = scene.car;
car.flaws = [{id:'gearbox',known:false,concealed:false,fixed:false}];
G.chance = () => true; G.act.meetBuyer(car.id); G.chance = chance;
check(car.flaws[0].known && car.buyer.message.includes('验出'), '买家检测可揭开未知车况');
check(G.act.acceptBuyer(car.id).ok && !s.bombs.length, '已公开的隐患不冒充隐瞒投诉');

scene = stock(26); s = scene.s; car = scene.car;
car.flaws = [{id:'flood',known:false,concealed:false,fixed:false}];
G.chance = () => false; G.act.meetBuyer(car.id); G.chance = chance;
check(G.act.acceptBuyer(car.id).ok && s.bombs.length === 1 && s.bombs[0].price === s.sales[0].price, '未验出隐患仍按议价成交价生成售后责任');
check(G.parseSave(JSON.stringify(s)).bombs.length === 1, '含主动销售售后数据的存档可继续');

// 原始版本没有议价字段的存档保持可读；不点议价时原价买卖照常。
s = fresh(27); G.act.visit('private'); o = s.visit.offers[0]; const oldPrice = G.offerPrice(o);
s = roundTrip(); check(!s.visit.offers[0].negotiation && G.offerPrice(s.visit.offers[0]) === oldPrice, '旧看车存档原价续买');
G.act.buyOffer(0); G.act.closeVisit(); car = s.cars[0]; car.price = 100;
check(!car.buyer && G.act.endMonth().ok && !s.cars.length, '不使用主动议价仍照常月底自动零售');

scene = stock(28); s = scene.s; car = scene.car;
G.act.meetBuyer(car.id); G.act.visit('private');
for (const blocked of ['pending', 'over']) {
  if (blocked === 'pending') G.forceEvent('lowball');
  else { s.pending = []; s.over = 'sealed'; }
  const locked = JSON.stringify(s);
  const actions = [() => G.act.rejectOffer(0), () => G.act.bargainOffer(0,'gentle'), () => G.act.meetBuyer(car.id), () => G.act.counterBuyer(car.id,'gentle'), () => G.act.acceptBuyer(car.id), () => G.act.dismissBuyer(car.id), () => G.act.reducePrice(car.id)];
  check(actions.every(fn => !fn().ok) && JSON.stringify(s) === locked, `${blocked} 时不能绕过事件或结局继续交易`);
}

// 多种种子重复交易、月结和读档，检查交易结果始终可继续。
for (let seed = 100; seed < 120; seed++) {
  s = fresh(seed);
  for (let month = 0; month < 6 && !s.over; month++) {
    while (G.cleanPending()) G.act.decide(G.currentDecision().options.findIndex(o => !o.disabled));
    G.act.visit('private');
    if (s.visit) {
      G.act.inspectVisit();
      while (s.visit.offers.length) {
        if (s.cars.length < G.capacity()) { G.act.bargainOffer(0, 'gentle'); const r = G.act.buyOffer(0); if (!r.ok) G.act.rejectOffer(0); }
        else G.act.rejectOffer(0);
      }
      G.act.closeVisit();
    }
    for (const c of [...s.cars]) {
      if (!G.act.meetBuyer(c.id).ok) break;
      if (c.buyer.status === 'talking') G.act.counterBuyer(c.id, 'firm');
      if (c.buyer.status !== 'left') G.act.acceptBuyer(c.id);
    }
    s = roundTrip(); G.act.endMonth(); s = roundTrip();
  }
  check(Number.isFinite(s.cash) && s.month > 1, `种子${seed} 交易与月结持续可保存`);
}
console.log(`${checks} 项收车拒绝与买卖议价检查通过。`);
