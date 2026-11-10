/* =========================================================
 * 贷款与抵押：车行经营贷、买家车贷、车主抵押借款
 * 数值在 data.js 的 G.LOANS / G.FINANCE / G.BUYER_FINANCE / G.PLEDGE
 *
 * 状态：
 *   s.loans       车行借的钱 { id, type, principal, remaining, rate, term, monthsLeft, payment, overdue }
 *   s.buyerLoans  民间车贷（车行兜底）{ id, name, balance, monthsLeft }
 *   s.pledges     车主押车借款 { id, client, car, amount, rate, term, monthsLeft, double, checked }
 *   s.credit      征信分 0~100
 *   s.storeValue  门店抵押物价值（装修设备 + 历次升级投入）
 * ========================================================= */
var G = globalThis.G = globalThis.G || {};

(function () {
  const S = () => G.state;
  const ok = msg => ({ ok: true, msg });
  const fail = msg => ({ ok: false, msg });
  const F = () => G.FINANCE;

  const annuity = (p, r, n) => (r ? p * r / (1 - Math.pow(1 + r, -n)) : p / n);

  G.Finance = {
    init(s) {
      Object.assign(s, {
        loans: s.loans || [], buyerLoans: s.buyerLoans || [], pledges: s.pledges || [],
        credit: s.credit ?? F().creditStart, storeValue: s.storeValue ?? F().storeBaseValue, pledgeVisit: s.pledgeVisit || null,
      });
    },

    /* ---------- 征信与额度 ---------- */
    creditLabel(c = S().credit) { return c >= 70 ? '良好' : c >= 40 ? '一般' : '差'; },
    rate(type) {
      const c = S().credit;
      return G.LOANS[type].rate + (c < 70 ? F().creditFairRateUp : 0);
    },
    collateral(type) {
      const s = S();
      if (type === 'store') return s.storeValue;
      return s.cars.reduce((t, c) => t + G.Car.value(c, 'owner'), 0);
    },
    outstanding(type) { return S().loans.filter(l => !type || l.type === type).reduce((t, l) => t + l.remaining, 0); },
    limit(type) {
      if (S().credit < 40) return 0;
      return Math.max(0, G.round(this.collateral(type) * G.LOANS[type].ltv - this.outstanding(type), 10000));
    },
    monthlyPayment() { return S().loans.reduce((t, l) => t + l.payment, 0); },

    /** 净资产里的金融部分：放出去的抵押款算资产，银行贷款算负债 */
    assets() { return S().pledges.reduce((t, p) => t + p.amount, 0); },
    debt() { return this.outstanding(); },

    /* ---------- 卖车时 ---------- */
    willBonus(car) { return G.BUYER_FINANCE[car.finance || 'none'].bonus; },
    onSale(car, price, r) {
      const s = S(), bf = G.BUYER_FINANCE[car.finance || 'none'];
      if (!bf.fee) return;
      const fee = G.round(price * bf.fee, 100);
      s.cash += fee; s.month_.revenue += fee;
      if (car.finance === 'private') {
        s.buyerLoans.push({ id: s.nextId++, name: car.name, balance: G.round(price * bf.lossRate, 100), total: bf.months, monthsLeft: bf.months });
        if (bf.dark) G.addDark(bf.dark);
      }
      const line = `「${car.name}」走${bf.name}，服务费 +${G.fmt(fee)}`;
      if (r) r.lines.push({ type: 'good', text: line }); else G.log(line);
    },

    /* ---------- 月结 ---------- */
    monthly(r) {
      this.payLoans(r);
      this.runBuyerLoans(r);
      this.runPledges(r);
    },

    payLoans(r) {
      const s = S();
      for (const l of [...s.loans]) {
        const interest = Math.round(l.remaining * l.rate);
        const pay = Math.min(l.payment, l.remaining + interest);
        if (s.cash >= pay) {
          s.cash -= pay - interest; G.spend(interest, '利息');
          l.remaining = Math.max(0, l.remaining - (pay - interest));
          l.monthsLeft--; l.overdue = 0;
          s.credit = Math.min(100, s.credit + 1);
          if (l.remaining <= 0 || l.monthsLeft <= 0) {
            s.loans = s.loans.filter(x => x !== l);
            r.lines.push({ type: 'good', text: `${G.LOANS[l.type].name}已还清` });
          }
        } else {
          l.overdue++;
          s.credit = Math.max(0, s.credit - F().overdueCredit);
          r.lines.push({ type: 'bad', text: `${G.LOANS[l.type].name}月供 ${G.fmt(pay)} 还不上，逾期第 ${l.overdue} 个月！征信 -${F().overdueCredit}` });
          if (l.overdue >= F().seizeAfter) this.foreclose(l, r);
        }
      }
    },

    foreclose(l, r) {
      const s = S();
      if (l.type === 'store') {
        r.lines.push({ type: 'bad', text: `门店抵押贷连续逾期 ${l.overdue} 个月，银行申请法拍门店！` });
        s.over = 'foreclosed';
        return;
      }
      // 库存车抵押：按批发价拍卖库存抵债
      let owed = l.remaining;
      const cars = [...s.cars].sort((a, b) => G.peerPrice(b) - G.peerPrice(a));
      for (const car of cars) {
        if (owed <= 0) break;
        const p = Math.round(G.peerPrice(car) * 0.85);
        owed -= p; s.month_.revenue += p; s.month_.cogs += car.cost;
        G.removeCar(car);
        r.lines.push({ type: 'bad', text: `「${car.name}」被银行强制拍卖，抵债 ${G.fmt(p)}` });
      }
      s.loans = s.loans.filter(x => x !== l);
      if (owed < 0) s.cash += -owed;                 // 拍多了的钱退回
      else if (owed > 0) s.cash -= owed;             // 拍完还不够，记成现金窟窿
    },

    buyerRisk() {
      const cfg = G.CONFIG.capitalRisk, s = S();
      const exposure = s.buyerLoans.reduce((t, b) => t + b.balance * b.monthsLeft / b.total, 0);
      const scale = G.clamp((G.netWorth() - cfg.threshold) / cfg.ramp, 0, 1);
      const load = scale * exposure / Math.max(1, G.netWorth());
      return { exposure, load, defaultRate: Math.min(Math.max(cfg.defaultCap, G.BUYER_FINANCE.private.defaultRate), G.BUYER_FINANCE.private.defaultRate + load * cfg.defaultScale) };
    },
    runBuyerLoans(r) {
      const s = S(), bf = G.BUYER_FINANCE.private;
      const risk = this.buyerRisk();
      const names = []; let loss = 0;
      s.buyerLoans = s.buyerLoans.filter(b => {
        b.monthsLeft--;
        if (G.chance(risk.defaultRate)) {
          const l = G.round(b.balance * (b.monthsLeft + 1) / b.total, 100);
          if (l > 0) { names.push(b.name); loss += l; }
          return false;
        }
        return b.monthsLeft > 0;
      });
      // 本月所有断供合并成一件事处理
      if (names.length) {
        s.pending.push({ type: 'buyerDefault', data: { names, loss, riskLoad: risk.load } });
        r.lines.push({ type: 'bad', text: `本月 ${names.length} 位民间车贷买家断供，要垫付 ${G.fmt(loss)}` });
      }
    },

    runPledges(r) {
      const s = S();
      s.pledges = s.pledges.filter(p => {
        p.monthsLeft--;
        if (p.monthsLeft > 0) return true;
        const due = Math.round(p.amount * (1 + p.rate * p.term));
        if (G.chance(G.PLEDGE.redeemRate)) {
          s.cash += due; s.month_.revenue += due - p.amount;
          r.lines.push({ type: 'good', text: `${p.client}按时赎回「${p.car.name}」，本息 ${G.fmt(due)}（利息 ${G.fmt(due - p.amount)}）` });
          return false;
        }
        if (p.double) {
          s.pending.push({ type: 'pledgeDispute', data: p });
          r.lines.push({ type: 'bad', text: `${p.client}没来赎车，「${p.car.name}」原来早押给别人了` });
        } else {
          r.lines.push({ type: 'warn', text: `${p.client}没来赎车，「${p.car.name}」归车行了` });
          this.takeCar(p.car, p.amount, '抵押断赎', r);
        }
        return false;
      });
    },

    /** 断赎拿到的车：入库；库存满了就直接批发 */
    takeCar(car, cost, source, r) {
      const s = S();
      if (s.cars.length < G.capacity()) { G.addCar(car, cost, source); return; }
      Object.assign(car, { cost });
      const p = G.peerPrice(car);
      s.cash += p; s.month_.revenue += p; s.month_.cogs += cost;
      const line = `库存满了，「${car.name}」直接批发给同行 ${G.fmt(p)}`;
      if (r) r.lines.push({ type: 'warn', text: line }); else G.log(line);
    },
  };

  /* ---------- 行动 ---------- */
  G.act.borrow = function (type, amount) {
    const s = S(), cfg = G.LOANS[type];
    if (!cfg) return fail('没这类借款。');
    const e = G.guard(0, 0); if (e) return fail(e);
    if (s.credit < 40) return fail('征信太差，银行不放款');
    amount = G.round(amount, 10000);
    const lim = G.Finance.limit(type);
    if (amount <= 0) return fail('金额不对');
    if (amount > lim) return fail(`超出额度（最多 ${G.fmt(lim)}）`);
    const rate = G.Finance.rate(type);
    const payment = Math.round(annuity(amount, rate, cfg.term));
    s.loans.push({ id: s.nextId++, type, principal: amount, remaining: amount, rate, term: cfg.term, monthsLeft: cfg.term, payment, overdue: 0 });
    s.cash += amount;
    G.log(`办理${cfg.name} ${G.fmt(amount)}，月利率 ${(rate * 100).toFixed(1)}%，${cfg.term} 期，月供 ${G.fmt(payment)}`);
    return ok(`到账 ${G.fmt(amount)}，月供 ${G.fmt(payment)}`);
  };
  G.loanPreview = (type, amount) => Math.round(annuity(amount, G.Finance.rate(type), G.LOANS[type].term));

  G.act.repay = function (id) {
    const s = S(), l = s.loans.find(x => x.id === id);
    if (!l) return fail('没有这笔贷款');
    const fee = G.round(l.remaining * F().prepayFee, 100);
    const e = G.guard(0, l.remaining + fee); if (e) return fail(e);
    s.cash -= l.remaining; G.spend(fee, '利息');
    s.loans = s.loans.filter(x => x !== l);
    G.log(`提前还清${G.LOANS[l.type].name} ${G.fmt(l.remaining)}，手续费 ${G.fmt(fee)}`);
    return ok('已还清');
  };

  G.act.setFinance = function (carId, f) {
    const car = S().cars.find(c => c.id === carId);
    if (!car || !Object.prototype.hasOwnProperty.call(G.BUYER_FINANCE,f)) return fail('这项办不了，换个试试。');
    const e = G.guard(0,0); if (e) return fail(e);
    car.finance = f;
    G.refreshBuyer(car);
    return ok();
  };

  // 车主抵押借款：花 1 点接待一批来借钱的车主
  G.act.pledgeVisit = function () {
    const s = S(), cfg = G.PLEDGE;
    if (s.pledgeVisit || s.visit) return fail('正在接待中');
    const e = G.guard(cfg.ap, 0); if (e) return fail(e);
    s.ap -= cfg.ap;
    const n = G.randInt(cfg.clients[0], cfg.clients[1]);
    const clients = [];
    for (let i = 0; i < n; i++) {
      const car = G.Car.generate('private');
      const value = G.Car.value(car, 'public');
      clients.push({
        id: s.nextId++, client: `${G.pick(G.SURNAMES)}${G.pick(['先生', '女士', '老板'])}`, car, value,
        amount: G.round(value * G.range(cfg.ltv[0], cfg.ltv[1])),
        rate: +G.range(cfg.rate[0], cfg.rate[1]).toFixed(3),
        term: G.randInt(cfg.term[0], cfg.term[1]),
        double: G.chance(cfg.doubleRate), checked: false,
      });
    }
    s.pledgeVisit = { clients };
    return ok();
  };
  G.act.pledgeCheck = function (id) {
    const s = S(), c = s.pledgeVisit && s.pledgeVisit.clients.find(x => x.id === id);
    if (!c) return fail('客户已经走了');
    if (c.checked) return fail('已经查过了');
    const e = G.guard(0, G.PLEDGE.checkCost); if (e) return fail(e);
    G.spend(G.PLEDGE.checkCost, '验车');
    c.checked = true;
    return ok(c.double ? '登记显示：这台车已经抵押给了别家！' : '登记干净，没有其他抵押');
  };
  G.act.pledgeSign = function (id) {
    const s = S(), c = s.pledgeVisit && s.pledgeVisit.clients.find(x => x.id === id);
    if (!c) return fail('客户已经走了');
    const e = G.guard(0, c.amount); if (e) return fail(e);
    s.cash -= c.amount;
    s.pledges.push({ id: c.id, client: c.client, car: c.car, amount: c.amount, rate: c.rate, term: c.term, monthsLeft: c.term, double: c.double, checked: c.checked });
    s.pledgeVisit.clients = s.pledgeVisit.clients.filter(x => x !== c);
    G.log(`给${c.client}办理抵押借款 ${G.fmt(c.amount)}，押「${c.car.name}」，月息 ${(c.rate * 100).toFixed(1)}%，${c.term} 个月`);
    return ok(`借出 ${G.fmt(c.amount)}`);
  };
  G.act.pledgeClose = function () { S().pledgeVisit = null; return ok(); };

  /* ---------- 决策 ---------- */
  const collectionLoss = d => Math.min(1, G.BUYER_FINANCE.private.collectLoss + (d.riskLoad || 0) * G.CONFIG.capitalRisk.collectLossScale);
  const collectionDark = d => Math.min(20, 4 + 2 * (d.names ? d.names.length : 1)) + Math.ceil((d.riskLoad || 0) * G.CONFIG.capitalRisk.collectDarkScale);
  G.DECISIONS.buyerDefault = {
    view(d) {
      const n = d.names ? d.names.length : 1, law = G.legalCost(10000 * n), dark = collectionDark(d);
      const who = d.names ? (n > 1 ? `「${d.names[0]}」等 ${n} 台车` : `「${d.names[0]}」`) : `「${d.name}」`;
      return {
        title: '民间车贷断供', tone: 'bad',
        text: `${who}的买家不还钱了，你作为担保方要垫付剩余贷款共 ${G.fmt(d.loss)}。`,
        options: [
          { label: '走法律程序', hint: `诉讼费 ${G.fmt(law)}，追回约一半` },
          { label: '找人上门催收', hint: `追回约 ${Math.round((1 - collectionLoss(d)) * 100)}% · 黑化 +${dark} · 口碑 -3` },
          { label: '认栽', hint: `-${G.fmt(d.loss)}` },
        ],
      };
    },
    resolve(d, i) {
      const n = d.names ? d.names.length : 1;
      if (i === 0) { const lost = Math.round(d.loss * 0.5) + G.legalCost(10000 * n); G.spend(lost, '坏账'); return `官司打完，追回一半，净损失 ${G.fmt(lost)}`; }
      if (i === 1) { const lost = Math.round(d.loss * collectionLoss(d)); G.spend(lost, '坏账'); G.addDark(collectionDark(d)); G.addRep(-3); return `催收的人「上门谈了谈」，钱追回了大部分，损失 ${G.fmt(lost)}`; }
      G.spend(d.loss, '坏账'); return `认栽，垫付 ${G.fmt(d.loss)}`;
    },
  };
  G.DECISIONS.pledgeDispute = {
    view(p) {
      return {
        car: p.car,
        title: '二次抵押纠纷', tone: 'bad',
        text: `${p.client}押在你这的「${p.car.name}」（你借出 ${G.fmt(p.amount)}）早就抵押给了别家，现在过不了户。`,
        options: [
          { label: '拆件卖掉', hint: `回收约 ${G.fmt(G.round(G.Car.value(p.car, 'public') * G.PLEDGE.partsRate))}` },
          { label: '打官司争车', hint: `诉讼费 ${G.fmt(G.legalCost(20000))}，一半可能拿到干净的车` },
          { label: '私下找原抵押方「摆平」', hint: `-${G.fmt(G.round(p.amount * 0.3))} · 黑化 +6，拿到车` },
        ],
      };
    },
    resolve(p, i) {
      const s = S();
      if (i === 0) {
        const got = G.round(G.Car.value(p.car, 'public') * G.PLEDGE.partsRate);
        s.cash += got; s.month_.revenue += got; s.month_.cogs += p.amount;
        return `「${p.car.name}」拆件卖了 ${G.fmt(got)}，亏了 ${G.fmt(p.amount - got)}`;
      }
      if (i === 1) {
        G.spend(G.legalCost(20000), '售后赔偿');
        if (G.chance(0.5)) { G.Finance.takeCar(p.car, p.amount, '官司赢回'); return `官司赢了，「${p.car.name}」归你`; }
        s.month_.cogs += p.amount;
        return `官司输了，车被原抵押方拿走，借出去的 ${G.fmt(p.amount)} 打了水漂`;
      }
      const cost = G.round(p.amount * 0.3);
      G.spend(cost, '灰色操作'); G.addDark(6);
      G.Finance.takeCar(p.car, p.amount + cost, '私下摆平');
      return `花 ${G.fmt(cost)} 摆平了，「${p.car.name}」归你`;
    },
  };
})();
