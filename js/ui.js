/* =========================================================
 * 界面：每次操作后整页重绘（简单可靠，原型阶段够用）
 * 所有按钮用 data-act 标记，统一在底部事件委托里处理
 * ========================================================= */
var G = globalThis.G = globalThis.G || {};

(function () {
  const ui = G.ui = { tab: 'buy', stockPage: 1, report: null, result: null, help: false, saveDialog: null, settling: false, menu: false, confirm: null, importText: '' };
  let previousHUD = null, renderedState = null, lockedScroll = 0;
  function syncOverlay() {
    const open = !!document.querySelector('.overlay, .month-transition');
    const wasOpen = document.body.classList.contains('modal-open');
    if (open && !wasOpen) { lockedScroll = window.scrollY; document.body.style.top = -lockedScroll + 'px'; document.body.classList.add('modal-open'); }
    else if (!open && wasOpen) { document.body.classList.remove('modal-open'); document.body.style.top = ''; window.scrollTo(0, lockedScroll); }
  }
  const fmt = n => G.fmt(n);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const level3 = (v, lo, hi) => v >= hi ? '高' : v >= lo ? '中' : '低';

  /* ---------- 小组件 ---------- */
  let toastTimer;
  function toast(msg, bad) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 1500);
  }

  G.toast = toast;

  function toolbar() {
    return '<div class="toolbar"><button class="btn sm icon-button" data-act="menu" aria-label="存档菜单"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>';
  }
  function helpModal() {
    const c = G.CONFIG, pct = n => `${Math.round(n * 100)}%`;
    const section = (title, text) => `<section class="help-section"><h4>${title}</h4><p>${text}</p></section>`;
    return modal(`瓜皮二手车 · 经营指南`,
      section('行动点', `每月基础 ${c.apPerMonth} 点，月底刷新。看车、检测和部分整备会花点数；经理和技师能增加行动点，受门店上限限制。`) +
      section('收车渠道', Object.values(G.CHANNELS).map(ch => `${ch.name}：${ch.ap} 点，${ch.desc}。`).join('<br>')) +
      section('车况与检测', `显性问题直接可见，隐性问题要检测。现场验车每台 ${fmt(c.offerInspectCost)}，一次验完一批；深度检测 ${G.SERVICES.inspect.ap} 点。评级越靠后，坑越深；“据你所知”也未必是真相。`) +
      section('隐瞒与黑化', `掩盖问题默认增加 ${c.concealDark} 黑化，重大问题另算。隐藏车况能抬高买家眼中的估值，但售后旧账会在潜伏 ${c.bombDormant.join('～')} 个月后继续追你 ${c.bombLifetime} 个月。`) +
      section('抽查与查封', `黑化超过 ${c.inspectSurgeAt} 进入突击检查期，达到 ${c.sealDark} 查封。每月自然回落 ${c.darkDecay}，主动报备减 ${c.reportDark}。规模超过 ${fmt(c.capitalRisk.threshold)} 后，隐瞒台账越多、黑化越高，越容易被盯上。`) +
      section('口碑', `开局 ${c.startRep}。口碑提高客流，客户投诉与曝光会伤口碑；高于 ${c.startRep} 的部分每月回落 ${pct(c.repDecay)}，得持续经营。`) +
      section('员工', `经理增加行动点，技师节省整备，销售提高客流，财务减少罚款赔偿。${G.STORE_LEVELS.slice(1).map(l => `${l.name}编制 ${l.staffSlots} 人、行动点加成上限 ${l.apCap}`).join('；')}。新员工下月开始干活，辞退补一个月工资。`) +
      section('贷款与抵押', `${Object.values(G.LOANS).map(l => `${l.name}月息 ${(l.rate * 100).toFixed(1)}%、${l.term} 期、最高抵押物的 ${pct(l.ltv)}`).join('；')}。连续逾期 ${G.FINANCE.seizeAfter} 个月会拍卖库存或法拍门店。民间车贷基础月断供 ${pct(G.BUYER_FINANCE.private.defaultRate)}，大规模集中担保会提高断供率与催收代价。车主抵押借款月息 ${G.PLEDGE.rate.map(pct).join('～')}，查登记 ${fmt(G.PLEDGE.checkCost)}，别把二次抵押当捡漏。`) +
      section('结局条件', `净资产达到所选目标即可通关：${c.difficulties.map(d => `${d.name} ${fmt(d.goal)}`).join('；')}。黑化达到 ${c.sealDark} 查封；现金窟窿靠甩车也填不平会破产，长期亏损同样可能关门；门店贷连续逾期 ${G.FINANCE.seizeAfter} 个月触发法拍。`) +
      `<p class="muted">自动存档保存在本浏览器。菜单里的「存档」可以备份和恢复。${G.state ? '' : '开张后可重新播放引导。'}</p>`,
      `${G.state ? '<button class="btn" data-act="tutorial-replay">重新播放引导</button>' : ''}<button class="btn primary" data-act="help-close">收起指南</button>`, 'help');
  }

  function gradeBadge(g) { return `<span class="grade g${g}">${g}</span>`; }

  function flawChips(car, mode) {
    // mode: 'offer' 收车时 / 'stock' 库存里
    const chips = [];
    for (const f of car.flaws) {
      const d = G.FLAWS[f.id];
      if (!d.visible && !f.known) continue;
      let cls = d.visible ? 'chip-vis' : 'chip-hid';
      let label = d.name;
      if (f.fixed) { cls = 'chip-fixed'; label += ' ✓'; }
      else if (f.concealed) { cls = 'chip-dark'; label += '（已掩盖）'; }
      chips.push(`<span class="chip ${cls}">${label}</span>`);
    }
    if (!car.inspected) chips.push(`<span class="chip chip-unknown">${mode === 'offer' ? '未验车' : '未检测'}：可能藏着问题</span>`);
    else if (!car.flaws.some(f => !G.FLAWS[f.id].visible)) chips.push('<span class="chip chip-fixed">已检测 无隐患</span>');
    return chips.length ? `<div class="chips">${chips.join('')}</div>` : '';
  }

  function kmText(car) {
    const mf = car.flaws.find(f => f.id === 'mileage');
    if (mf && mf.known) return `表显 ${G.fmtKm(car.mileageShown)} <span class="neg">实际 ${G.fmtKm(car.mileage)}</span>`;
    return G.fmtKm(car.mileageShown);
  }

  /* ---------- 开始界面 ---------- */
  function startScreen() {
    const diffs = G.CONFIG.difficulties.map((d, i) => `
      <label class="pick">
        <input type="radio" name="diff" value="${d.id}" ${i === 0 ? 'checked' : ''}>
        <div><b>${d.name}</b><span>启动资金 ${fmt(d.cash)}</span><span class="muted">目标净资产 ${fmt(d.goal)}</span></div>
      </label>`).join('');
    const locs = Object.entries(G.LOCATIONS).map(([id, l], i) => `
      <label class="pick">
        <input type="radio" name="loc" value="${id}" ${i === 1 ? 'checked' : ''}>
        <div><div class="loc-art">${G.Art.store(1, id, { empty: true })}</div><b>${l.name}</b><span>${l.desc}</span>
          <span class="muted">租金 ${level3(l.rent, 0.8, 1.1)} · 客流 ${level3(l.traffic, 1, 1.5)} · 抽查 ${level3(l.inspect, 0.05, 0.09)}</span></div>
      </label>`).join('');
    return `
      <div class="start">${toolbar()}
        <div class="start-intro"><div class="start-art">${G.Art.keyart()}</div></div>
        <div class="start-options">
        <h3>启动资金</h3><div class="picks">${diffs}</div>
        <h3>门店地段</h3><div class="picks">${locs}</div>
        <button class="btn primary big" data-act="start">开张营业</button>
        ${G.hasSave() ? '<button class="btn big" data-act="continue">继续上次存档</button>' : ''}</div>
      </div>`;
  }

  /* ---------- 顶部 HUD ---------- */
  function hud() {
    const s = G.state, net = G.netWorth();
    const dots = Array.from({ length: Math.max(G.maxAp(), s.ap) }, (_, i) => `<i class="${i < s.ap ? 'on' : previousHUD && i < previousHUD.ap ? 'spent' : ''}"></i>`).join('');
    const darkCls = s.dark > 70 ? 'hi' : s.dark > 40 ? 'mid' : 'lo';
    return `
      <header class="hud">${toolbar()}
        <div class="hud-top">
          <div><b>${G.dateLabel()}</b> <span class="muted">第 ${s.month} 月 · ${G.level().name} · ${G.loc().name}</span></div>
          <div class="ap" title="本月剩余行动点">${dots}<b>${s.ap}</b></div>
        </div>
        <div class="hud-grid">
          <div class="stat"><label>现金</label><b data-stat="cash" class="${s.cash < 0 ? 'neg' : ''}">${fmt(s.cash)}</b>${s.loans.length ? `<small class="muted">月供 ${fmt(G.Finance.monthlyPayment())}</small>` : ''}</div>
          <div class="stat"><label>净资产</label><b data-stat="net">${fmt(net)}</b>
            <div class="bar gold"><i style="width:${G.clamp(net / s.goal * 100, 0, 100)}%"></i></div>
            <small class="muted">目标 ${fmt(s.goal)}</small></div>
          <div class="stat"><label>黑化值</label><b data-stat="dark" class="dark-${darkCls}">${s.dark}</b>
            <div class="bar dark"><i style="width:${s.dark}%"></i></div>
            <small class="muted">${s.dark > 70 ? '随时突击检查！' : '>70 突击检查'}</small></div>
          <div class="stat"><label>口碑</label><b data-stat="rep">${s.rep}</b>
            <div class="bar rep"><i style="width:${s.rep}%"></i></div></div>
        </div>
      </header>`;
  }

  function tabs() {
    const s = G.state;
    const t = [['buy', '收车'], ['stock', `库存 ${s.cars.length}/${G.capacity()}`], ['team', `团队 ${s.staff.length}/${G.Staff.slots()}`], ['store', '门店'], ['ledger', '财务']];
    return `<nav class="tabs">${t.map(([id, n]) => `<button class="${ui.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${n}</button>`).join('')}</nav>`;
  }

  /* ---------- 收车 ---------- */
  function buyTab() {
    const P = G.PLEDGE;
    const pledgeCard = `
      <div class="card channel pledge">
        <div class="row"><h4>车主抵押借款</h4><span class="ap-cost">${P.ap} 点</span></div>
        <p class="muted">车主押车借钱，月息 ${P.rate[0] * 100}～${P.rate[1] * 100}%；到期不赎回，车归车行。小心车早就押给了别人。</p>
        <div class="chips"><span class="chip chip-hid">放贷收息</span><span class="chip chip-dark">二次抵押风险</span><span class="chip chip-hid">在外放款 ${G.state.pledges.length} 笔</span></div>
        <button class="btn" data-act="pledge-visit">接待借款车主</button>
      </div>`;
    return pledgeCard + Object.entries(G.CHANNELS).map(([id, ch]) => `
      <div class="card channel">
        <div class="row"><h4>${ch.name}</h4><span class="ap-cost">${ch.ap} 点</span></div>
        <p class="muted">${ch.desc}</p>
        <div class="chips">${ch.tags.map(t => `<span class="chip ${/高危|风险高|不可/.test(t) ? 'chip-dark' : 'chip-hid'}">${t}</span>`).join('')}
          <span class="chip chip-hid">一次看 ${G.offerCount(id)} 台</span></div>
        <button class="btn primary" data-act="visit" data-ch="${id}">去看车</button>
      </div>`).join('');
  }

  function visitModal() {
    const s = G.state, v = s.visit, ch = G.CHANNELS[v.chId];
    const uninspected = v.offers.filter(o => !o.car.inspected).length;
    const inspectBtn = ch.blind
      ? '<p class="muted center">拍卖车不能验车，只能看照片下手</p>'
      : uninspected
        ? `<button class="btn" data-act="inspect-visit">带检测师傅验车（1 点 · ${fmt(G.visitInspectCost())}）</button>`
        : '';
    const offers = v.offers.length ? v.offers.map((o, i) => {
      const c = o.car, cat = G.CATEGORIES[c.catId];
      const price = G.offerPrice(o), ref = G.Car.value(c, 'public');
      return `
        <div class="card offer">
          <div class="car-art">${G.Art.car(c, { size: 280 })}</div>
          <div class="row"><h4>${esc(c.name)}</h4>${gradeBadge(G.Car.grade(c, 'owner'))}</div>
          <p class="muted">${cat.name} · ${G.paintOf(c).name} · ${c.year}年 · ${kmText(c)}</p>
          ${flawChips(c, 'offer')}
          <div class="row price-row">
            <div><small class="muted">卖家报价</small><b class="gold">${fmt(price)}</b></div>
            <div><small class="muted">按已知车况估价</small><b>${fmt(ref)}</b></div>
            <button class="btn primary" data-act="buy" data-i="${i}">买下</button>
          </div>
          ${ch.towFee ? `<small class="muted">另付拖车费 ${fmt(ch.towFee)}</small>` : ''}
        </div>`;
    }).join('') : '<p class="muted center">这一批车已经被你挑完了</p>';
    return modal(`${ch.name} · 看车`, `
      <p class="muted">库存 ${s.cars.length}/${G.capacity()} · 现金 ${fmt(s.cash)} · 剩余行动点 ${s.ap}</p>
      ${inspectBtn}${offers}`, '<button class="btn" data-act="visit-close">离开</button>');
  }

  function pledgeModal() {
    const s = G.state, v = s.pledgeVisit, P = G.PLEDGE;
    const cards = v.clients.length ? v.clients.map(c => `
      <div class="card pledge-card">
        <div class="row"><h4>${esc(c.client)}</h4>${c.checked ? (c.double ? '<span class="stamp">二次抵押</span>' : '<span class="chip chip-fixed">登记干净</span>') : '<span class="stamp unknown">二次抵押风险：未查</span>'}</div>
        <div class="car-art">${G.Art.car(c.car, { size: 260 })}</div>
        <p class="muted">押「${esc(c.car.name)}」· ${G.paintOf(c.car).name} · ${c.car.year}年 · ${G.fmtKm(c.car.mileageShown)}</p>
        <div class="pledge-terms">
          <div><small>车辆估值</small><b>${fmt(c.value)}</b></div>
          <div><small>借款额度</small><b class="gold">${fmt(c.amount)}</b></div>
          <div><small>月利率</small><b>${(c.rate * 100).toFixed(1)}%</b></div>
          <div><small>到期</small><b>${c.term} 个月后</b></div>
        </div>
        <small class="muted">到期应还本息 ${fmt(Math.round(c.amount * (1 + c.rate * c.term)))} · 协议：逾期未赎回，车辆归车行处置</small>
        <div class="row" style="margin-top:8px;gap:8px">
          ${c.checked ? '' : `<button class="btn sm" data-act="pledge-check" data-id="${c.id}">查抵押登记<small>${fmt(P.checkCost)}</small></button>`}
          <button class="btn sm primary" data-act="pledge-sign" data-id="${c.id}">办理抵押</button>
        </div>
      </div>`).join('') : '<p class="muted center">今天没别的客户了</p>';
    return modal('抵押业务', `<p class="muted">现金 ${fmt(s.cash)} · 到期赎回率大约 ${Math.round(P.redeemRate * 100)}%</p>${cards}`, '<button class="btn" data-act="pledge-close">送客</button>');
  }

  /* ---------- 库存 ---------- */
  function carCard(c) {
    const cat = G.CATEGORIES[c.catId];
    const gO = G.Car.grade(c, 'owner'), gP = G.Car.grade(c, 'public');
    const vP = G.Car.value(c, 'public'), vO = G.Car.value(c, 'owner');
    const svcs = Object.entries(G.SERVICES).filter(([sid]) => !G.serviceBlock(c, sid)).map(([sid, sv]) => {
      const dark = G.serviceDark(c, sid), cost = G.serviceCost(c, sid);
      return `<button class="btn sm ${sv.grey ? 'grey-op' : ''}" data-act="svc" data-car="${c.id}" data-svc="${sid}">
        ${sv.name}<small>${sv.ap ? sv.ap + '点 · ' : ''}${fmt(cost)}${dark ? ` · 黑化+${dark}` : ''}</small></button>`;
    }).join('');
    const margin = c.price - c.cost;
    return `
      <div class="card car">
        <div class="car-art">${G.Art.car(c, { size: 280 })}</div>
        <div class="row"><h4>${esc(c.name)}</h4>
          <div>${gradeBadge(gO)}${gP !== gO ? `<small class="muted"> 对外 </small>${gradeBadge(gP)}` : ''}</div></div>
        <p class="muted">${cat.name} · ${G.paintOf(c).name} · ${c.year}年 · ${kmText(c)} · 在库 ${c.monthsInStock} 月 · 来自${esc(c.source || '—')}</p>
        ${flawChips(c, 'stock')}
        <div class="row vals">
          <div><small class="muted">成本</small><b>${fmt(c.cost)}</b></div>
          <div><small class="muted">对外估价</small><b>${fmt(vP)}</b></div>
          <div><small class="muted">按已知车况估价</small><b>${fmt(vO)}${c.inspected ? '' : '?'}</b></div>
        </div>
        <div class="row list-row">
          <label>挂牌价 <input type="number" step="0.1" min="0" data-price="${c.id}" value="${(c.price / 10000).toFixed(1)}"> 万</label>
          ${c.autoPrice !== false ? '<span class="chip chip-fixed">自动跟随估值</span>' : `<button class="btn sm" data-act="suggest" data-car="${c.id}">恢复自动定价</button>`}
          <select data-warranty="${c.id}">${Object.entries(G.WARRANTY).map(([k, w]) => `<option value="${k}" ${c.warranty === k ? 'selected' : ''}>${w.name}</option>`).join('')}</select>
          <select data-finance="${c.id}" title="给买家的金融方案">${Object.entries(G.BUYER_FINANCE).map(([k, f]) => `<option value="${k}" ${(c.finance || 'none') === k ? 'selected' : ''}>${f.name}${f.fee ? ` +${Math.round(f.fee * 100)}%服务费` : ''}</option>`).join('')}</select>
        </div>
        <small class="${margin >= 0 ? 'pos' : 'neg'}">按挂牌价成交 毛利 ${fmt(margin)}</small>
        ${svcs ? `<div class="svcs">${svcs}</div>` : ''}
        <div class="row foot"><span class="muted">急用钱？</span>
          <button class="btn sm" data-act="peer" data-car="${c.id}">批发给同行 ${fmt(G.peerPrice(c))}</button></div>
      </div>`;
  }

  function stockTab() {
    const s = G.state;
    if (!s.cars.length) return `<div class="garage-wrap">${G.Art.garage([], G.capacity())}<div class="garage-label">车库 0/${G.capacity()}</div></div><div class="empty small">库存是空的，先去「收车」吧</div>`;
    const total = Math.ceil(s.cars.length / 20);
    ui.stockPage = G.clamp(ui.stockPage, 1, total);
    const pager = `<div class="row stock-pager"><button class="btn sm" data-act="stock-prev" ${ui.stockPage === 1 ? 'disabled' : ''}>上一页</button><span>第 ${ui.stockPage} / ${total} 页 · 每页 20 台</span><button class="btn sm" data-act="stock-next" ${ui.stockPage === total ? 'disabled' : ''}>下一页</button></div>`;
    return `<div class="garage-wrap">${G.Art.garage(s.cars, G.capacity())}<div class="garage-label">车库 ${s.cars.length}/${G.capacity()}</div></div>
      <p class="muted tip">车都挂好了，月底等买家。嫌卖得慢，就看看价。</p>` + pager + '<div class="stock-grid">' + s.cars.slice((ui.stockPage - 1) * 20, ui.stockPage * 20).map(carCard).join('') + '</div>' + pager;
  }

  /* ---------- 门店 ---------- */
  function storeTab() {
    const s = G.state, lvl = G.level(), next = G.STORE_LEVELS[s.store.level + 1];
    const market = Object.entries(G.CATEGORIES).map(([k, c]) => {
      const m = s.market[k], d = Math.round((m - 1) * 100);
      return `<div class="mkt"><span>${c.name}</span><b class="${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '—'} ${Math.abs(d)}%</b></div>`;
    }).join('');
    const mines = new Set(s.bombs.filter(b => b.knowing).map(b => b.saleId)).size;
    return `
      <div class="card store-hero">
        <div class="store-art">${G.Art.store(s.store.level, s.store.location)}</div>
        <div class="row"><h4>${lvl.name} · ${G.loc().name}</h4></div>
        <p class="muted">库存上限 ${lvl.capacity} 台 · 基础客流 ${lvl.traffic} · 员工编制 ${lvl.staffSlots} 人 · 每月固定开销 ${fmt(G.monthlyFixedCost())}（含工资）</p>
        <p class="muted">本月被抽查概率约 ${Math.round(G.inspectChance() * 100)}%</p>
        ${next ? `<div class="next-preview"><small class="muted">升级后</small>${G.Art.store(s.store.level + 1, s.store.location)}</div>` : ''}
        ${next ? `<button class="btn primary" data-act="upgrade">升级为${next.name}（${fmt(next.upgradeCost)}）<small>库存 ${next.capacity} 台 · 客流 ${next.traffic} · 编制 ${next.staffSlots} 人 · 车源更多更高端</small></button>` : '<p class="muted">已是最高等级</p>'}
      </div>
      <div class="card">
        <h4>经营动作</h4>
        <button class="btn" data-act="advertise" ${s.buffs.ad ? 'disabled' : ''}>线上广告投放（1 点 · ${fmt(G.CONFIG.adCostPerLevel * s.store.level)}）<small>${s.buffs.ad ? '本月已投放' : '本月客流 ×' + G.CONFIG.adTrafficMult}</small></button>
        <button class="btn" data-act="report-reg" ${s.flags.reported ? 'disabled' : ''}>去市场监管部门报备（1 点）<small>${s.flags.reported ? '本月已报备' : `黑化 -${G.CONFIG.reportDark}`}</small></button>
      </div>
      <div class="card"><h4>行情看板</h4><div class="mkts">${market}</div><small class="muted">行情每月波动，影响收车价和卖价</small></div>
      ${s.perks.thirdParty ? `<div class="card"><h4>第三方检测机构常驻中</h4>
        <p class="muted">每月 ${fmt(G.CONFIG.thirdPartyFee)} · 黑化增长 ×${G.CONFIG.thirdPartyDarkMult}</p>
        <button class="btn" data-act="cancel-third">解约</button></div>` : ''}
      <div class="card"><h4>售后风险</h4>
        <p class="muted">质保中的车：${s.warranties.length} 台</p>
        <p class="${mines ? 'neg' : 'muted'}">你心里清楚、卖出时隐瞒了问题的车：${mines} 台</p>
        <small class="muted">没检测就卖出的车也可能有你不知道的隐患</small>
      </div>
`;
  }

  /* ---------- 团队 ---------- */
  const stars = n => '★'.repeat(n) + '<span class="muted">' + '★'.repeat(3 - n) + '</span>';
  function staffCard(e, hire) {
    const r = G.ROLES[e.role];
    return `
      <div class="card staff">
        <div class="avatar role-${e.role}">${G.Art.avatar(e) || e.name.replace(/(经理|师傅|姐|会计|小)/g, '').slice(0, 1)}</div>
        <div class="staff-body">
          <div class="row"><h4>${esc(e.name)} <small class="muted">${r.name}</small></h4><span class="stars">${stars(e.level)}</span></div>
          <p class="muted">${G.Staff.effectText(e.role, e.level)}</p>
          <div class="row">
            <span>月薪 <b class="gold">${fmt(e.salary)}</b>${hire ? '' : ` <small class="muted">· 在职 ${e.tenure} 月</small>`}</span>
            ${hire
              ? `<button class="btn sm primary" data-act="hire" data-id="${e.id}">招聘</button>`
              : `<button class="btn sm" data-act="fire" data-id="${e.id}">辞退<small>补偿 ${fmt(e.salary)}</small></button>`}
          </div>
        </div>
      </div>`;
  }
  function teamTab() {
    const s = G.state, full = s.staff.length >= G.Staff.slots();
    return `
      <div class="card">
        <div class="row"><h4>团队 ${s.staff.length}/${G.Staff.slots()} 人</h4><span class="muted">月薪合计 ${fmt(G.Staff.payroll())}</span></div>
        <p class="muted">全店加成：${G.Staff.summary()}</p>
        <small class="muted">新人下月上岗。至于人品，处久了才知道。</small>
      </div>
      ${s.staff.length ? s.staff.map(e => staffCard(e, false)).join('') : '<div class="empty small">还没有员工，大小事都得你亲自来</div>'}
      <h4 class="section">本月来应聘的${full ? '<small class="muted">（编制已满，升级门店可以扩编）</small>' : ''}</h4>
      ${s.candidates.length ? s.candidates.map(e => staffCard(e, true)).join('') : '<p class="muted">这个月没人来应聘</p>'}
      <p class="muted center">候选人每月刷新</p>`;
  }

  /* ---------- 账本 ---------- */
  function financeCenter() {
    const s = G.state, F = G.Finance;
    const stockVal = s.cars.reduce((t, c) => t + G.Car.value(c, 'owner'), 0);
    const credit = F.creditLabel();
    const loanForm = type => {
      const cfg = G.LOANS[type], lim = F.limit(type), rate = F.rate(type);
      const def = Math.min(lim, G.round(lim / 2, 10000)) || lim;
      return `
        <div class="loan-form">
          <div class="row"><b>${cfg.name}</b><small class="muted">月利率 ${(rate * 100).toFixed(1)}% · ${cfg.term} 期</small></div>
          <small class="muted">${cfg.desc} · 可借额度 <b class="gold">${fmt(lim)}</b></small>
          ${lim > 0 ? `<div class="row list-row">
            <label>借 <input type="number" step="1" min="1" id="amt-${type}" value="${Math.round(def / 10000)}"> 万</label>
            <small class="muted" id="pv-${type}">月供约 ${fmt(G.loanPreview(type, def))}</small>
            <button class="btn sm primary" data-act="borrow" data-type="${type}">办理</button>
          </div>` : ''}
        </div>`;
    };
    const loans = s.loans.map(l => `
      <div class="row loan-item">
        <div><b>${G.LOANS[l.type].name}</b><br><small class="muted">剩余本金 ${fmt(l.remaining)} · 月供 ${fmt(l.payment)} · 还剩 ${l.monthsLeft} 期${l.overdue ? ` · <span class="neg">逾期 ${l.overdue} 月</span>` : ''}</small></div>
        <button class="btn sm" data-act="repay" data-id="${l.id}">提前还款<small>手续费 ${fmt(G.round(l.remaining * G.FINANCE.prepayFee, 100))}</small></button>
      </div>`).join('');
    const pledges = s.pledges.map(p => `
      <div class="row loan-item"><div><b>${esc(p.client)}</b> 押「${esc(p.car.name)}」<br>
        <small class="muted">借出 ${fmt(p.amount)} · 月息 ${(p.rate * 100).toFixed(1)}% · ${p.monthsLeft} 个月后到期${p.checked ? (p.double ? ' · <span class="neg">已知二次抵押</span>' : ' · 登记干净') : ' · 未查登记'}</small></div></div>`).join('');
    return `
      <div class="fin-grid">
        <div class="fin-card">
          <h4>资产</h4>
          <div><small>自有现金</small><b class="gold">${fmt(s.cash)}</b></div>
          <div><small>库存估值</small><b>${fmt(stockVal)}</b></div>
          <div><small>抵押放款</small><b>${fmt(F.assets())}</b></div>
          <div><small>净资产</small><b>${fmt(G.netWorth())}</b></div>
        </div>
        <div class="fin-card">
          <h4>负债</h4>
          <div><small>银行贷款</small><b class="gold">${fmt(F.debt())}</b></div>
          <div><small>月供</small><b class="${F.monthlyPayment() ? 'neg' : ''}">${F.monthlyPayment() ? '-' + fmt(F.monthlyPayment()) : '0'}</b></div>
          <div><small>民间车贷担保</small><b>${s.buyerLoans.length} 笔</b></div>
          <div><small>征信</small><b class="${credit === '良好' ? 'pos' : credit === '一般' ? 'gold' : 'neg'}">${credit}</b><small class="muted">${s.credit} 分</small></div>
        </div>
      </div>
      <div class="card">
        <h4>车行融资</h4>
        <p class="muted">民间担保还挂着 ${fmt(F.buyerRisk().exposure)}，月断供约 ${(F.buyerRisk().defaultRate * 100).toFixed(1)}%。摊子越大，催账越扎手。</p>
        <small class="muted">逾期会降征信；连续逾期 ${G.FINANCE.seizeAfter} 个月：库存贷强制拍卖库存，门店贷直接法拍门店（游戏结束）</small>
        ${loanForm('store')}${loanForm('stock')}
        ${loans ? `<h4 class="sub">在还的贷款</h4>${loans}` : '<p class="muted">暂时没欠银行的钱，睡觉都踏实点。</p>'}
      </div>
      ${pledges ? `<div class="card"><h4>放出去的抵押借款</h4>${pledges}</div>` : '<div class="card"><p class="muted">还没往外放款，钱都在自己兜里。</p></div>'}`;
  }

  function ledgerTab() {
    const s = G.state;
    const rows = s.history.slice(-12).reverse().map(h => `
      <tr><td>${G.dateLabel(h.month)}</td><td>${fmt(h.revenue)}</td><td>${fmt(h.cogs + h.opex)}</td>
      <td class="${h.profit >= 0 ? 'pos' : 'neg'}">${fmt(h.profit)}</td><td>${h.dark}</td></tr>`).join('');
    const logs = s.log.slice(0, 80).map(l => `<li class="log-${esc(l.type)}"><span class="muted">${G.dateLabel(l.m)}</span> ${esc(l.text)}</li>`).join('');
    return `${financeCenter()}
      <div class="card"><h4>月度收支（近 12 个月）</h4>
        ${rows ? `<table><thead><tr><th>月份</th><th>收入</th><th>成本+费用</th><th>利润</th><th>黑化</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">还没有月结记录</p>'}
        <p class="muted">累计零售 ${s.stats.sold} 台 · 批发 ${s.stats.soldPeer} 台 · 最高单月利润 ${fmt(s.stats.peakProfit)}</p>
      </div>
      <div class="card"><h4>经营日志</h4><ul class="log">${logs}</ul></div>`;
  }

  /* ---------- 弹窗 ---------- */
  function modal(title, body, foot = '', cls = '') {
    return `<div class="overlay"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div></div>`;
  }

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function animateReport() {
    if (!ui.report || reducedMotion()) return;
    const nodes = [...document.querySelectorAll('[data-count]')], start = performance.now();
    nodes.forEach(el => { el.dataset.counting = '1'; });
    const tick = now => {
      const t = Math.min(1, (now - start) / 500);
      for (const el of nodes) {
        if (!el.isConnected) return;
        const v = Number(el.dataset.count) * (1 - Math.pow(1 - t, 3));
        if (t === 1) delete el.dataset.counting;
        el.textContent = el.dataset.unit === 'dark' ? `${v > 0 ? '+' : ''}${Math.round(v)}` : fmt(v);
      }
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function reportModal(r) {
    const sales = r.sales.length
      ? `<ul class="sales">${r.sales.map((x,i) => `<li style="animation-delay:${i*80}ms">${x.art || ''}<span>${esc(x.name)}${x.warranty ? ` <small class="muted">${x.warranty}</small>` : ''}</span><b>${fmt(x.price)}</b><small class="${x.profit >= 0 ? 'pos' : 'neg'}">${x.profit >= 0 ? '+' : ''}${fmt(x.profit)}</small></li>`).join('')}</ul>`
      : '<p class="muted">这个月一台都没卖出去</p>';
    const lines = r.lines.map(l => `<li class="log-${esc(l.type)}">${esc(l.text)}</li>`).join('');
    return modal(`${r.date} 月结`, `
      <p class="muted">本月进店客户 ${r.customers} 位</p>
      <h4>成交</h4>${sales}
      ${lines ? `<h4>本月动态</h4><ul class="log">${lines}</ul>` : ''}
      <div class="pnl">
        <div><small>收入</small><b>${fmt(r.revenue)}</b></div>
        <div><small>车辆成本</small><b>${fmt(r.cogs)}</b></div>
        <div><small>经营费用</small><b>${fmt(r.opex)}</b></div>
        <div><small>净利润 ${r.newRecord ? '<span class="record-badge">新纪录</span>' : ''}</small><b class="profit-number ${r.profit >= 0 ? 'profit-up pos' : 'profit-down neg'}" data-count="${r.profit}">${fmt(r.profit)}</b></div>
        <div><small>资产变化</small><b class="${(r.netChange || 0) >= 0 ? 'pos' : 'neg'}" data-count="${r.netChange || 0}">${fmt(r.netChange || 0)}</b></div>
        <div><small>黑化变化</small><b class="${(r.darkChange || 0) > 0 ? 'neg' : 'pos'}" data-count="${r.darkChange || 0}" data-unit="dark">${(r.darkChange || 0) > 0 ? '+' : ''}${r.darkChange || 0}</b></div>
      </div>
      <p class="muted">还有没处理的事，钱要等谈完再算。</p>
      ${Object.keys(r.opexBy || {}).length ? `<p class="muted opex-by">费用明细：${Object.entries(r.opexBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')}</p>` : ''}`,
    `<button class="btn primary" data-act="close-report">${G.cleanPending() ? '处理 ' + G.state.pending.length + ' 件事' : '继续经营'}</button>`, 'report');
  }

  function decisionModal() {
    const d = G.currentDecision(), more = G.state.pending.length - 1;  // currentDecision 已清理过
    return modal(d.title, `${d.car ? `<div class="car-art">${G.Art.car(d.car, { size: 260 })}</div>` : ''}<p>${esc(d.text)}</p>
      <div class="options">${d.options.map((o, i) => `<button class="btn option" data-act="decide" data-i="${i}" ${o.disabled ? 'disabled' : ''}>
        <b>${o.label}</b><small>${o.disabled ? o.disabled : o.hint || '&nbsp;'}</small></button>`).join('')}</div>
      ${more ? `<p class="muted center">还有 ${more} 件事等你处理</p>` : ''}`,
    '', `decision tone-${d.tone || 'bad'}`);
  }

  function overModal() {
    const s = G.state, e = G.endingInfo();
    return modal(e.title, `
      <div class="store-art">${G.Art.ending(G.endingId()) || G.Art.store(s.store.level, s.store.location)}</div>
      <p>${e.text}</p>
      <div class="pnl">
        <div><small>最终净资产</small><b>${fmt(G.netWorth())}</b></div>
        <div><small>经营月数</small><b>${s.month - 1}</b></div>
        <div><small>累计成交</small><b>${s.stats.sold + s.stats.soldPeer} 台</b></div>
        <div><small>最高单月利润</small><b>${fmt(s.stats.peakProfit)}</b></div>
        <div><small>黑化值</small><b>${s.dark}</b></div>
        <div><small>口碑</small><b>${s.rep}</b></div>
      </div>`, '<button class="btn primary" data-act="restart">重新开局</button>', 'ending');
  }

  function saveModal() { return G.SaveUI.editor(); }
  function currentModal() {
    const s = G.state;
    if (ui.settling) return `<div class="month-transition" role="status"><small>旧账翻篇，生意继续</small><b>${G.dateLabel()}</b><span>月底这笔账，正在算……</span></div>`;
    if (ui.confirm) return G.SaveUI.confirm();
    if (ui.saveDialog) return saveModal();
    if (ui.help) return helpModal();
    if (ui.menu) return G.SaveUI.menu();
    if (!s) return '';
    if (ui.report) return reportModal(ui.report);
    if (ui.result) return modal('结果', `<p>${esc(ui.result)}</p>`, '<button class="btn primary" data-act="close-result">好</button>');
    if (G.cleanPending()) return decisionModal();
    if (s.over) return overModal();
    if (s.visit) return visitModal();
    if (s.pledgeVisit) return pledgeModal();
    return '';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const app = document.getElementById('app');
    if (renderedState !== G.state) { previousHUD = null; renderedState = G.state; }
    const currentHUD = G.Feedback.snapshot();
    if (!G.state) { app.innerHTML = startScreen() + currentModal(); G.Art.preload?.(); G.Tutorial?.render(); G.Feedback.prepare(); syncOverlay(); return; }
    const body = { buy: buyTab, stock: stockTab, team: teamTab, store: storeTab, ledger: ledgerTab }[ui.tab]();
    const scroll = window.scrollY;
    app.innerHTML = `${hud()}${tabs()}<main>${body}</main>
      <footer class="bar-bottom ${G.state.ap === 0 && !G.state.over ? 'ready-to-settle' : ''}"><button class="btn primary big" data-act="end-month" ${G.state.over || ui.settling ? 'disabled' : ''}>${ui.settling ? '结算中……' : '结束本月 · 进入月结'}</button></footer>
      ${currentModal()}`;
    window.scrollTo(0, scroll);
    G.Tutorial?.render();
    G.Feedback.prepare(); syncOverlay();
    G.Feedback.changes(previousHUD, currentHUD); previousHUD = currentHUD;
    animateReport();
    if (!ui.settling && G.state.over) G.Feedback.big(G.state.over === 'win' ? 'win' : 'bad', 'over:' + G.state.seed + ':' + G.state.over);
    else if (!ui.settling && ui.report && ui.report.lines.some(l => /突击检查|法院|官司|查封/.test(l.text))) G.Feedback.big('bad', 'report:' + G.state.seed + ':' + ui.report.month);
    else if (!ui.settling && !ui.report && !ui.result && G.state.pending[0] && ['complaint','buyerDefault','pledgeDispute'].includes(G.state.pending[0].type)) G.Feedback.big('bad', 'pending:' + G.state.seed + ':' + G.state.month + ':' + JSON.stringify(G.state.pending[0]));
  }
  G.render = render;

  function run(res, quiet) {
    if (res && !res.ok) { toast(res.msg, true); G.Sound?.play('bad'); }
    else if (res && res.msg && !quiet) toast(res.msg);
    if (G.state && !G.save()) toast('这次没存上，去菜单里备份一下，别让生意白忙。', true);
    render();
  }

  /* ---------- 事件 ---------- */
  const handlers = {
    mute() { G.Sound.toggle(); render(); },
    'stock-prev'() { ui.stockPage--; window.scrollTo(0, 0); render(); },
    'stock-next'() { ui.stockPage++; window.scrollTo(0, 0); render(); },
    help() { ui.help = true; render(); },
    'help-close'() { ui.help = false; render(); },
    'tutorial-replay'() { G.Tutorial.start(true); },
    start() {
      const diff = document.querySelector('input[name=diff]:checked').value;
      const loc = document.querySelector('input[name=loc]:checked').value;
      G.newGame(diff, loc); G.Art.preload(loc);
      ui.tab = 'buy'; run(); window.scrollTo(0, 0); G.Tutorial?.start();
    },
    continue() { if (G.load()) run(null); else toast(G.loadError || '这份存档没读出来，试试之前的备份。', true); },
    tab(el) { if (ui.tab === el.dataset.tab) { toast('就在这页，接着忙吧'); return; } ui.tab = el.dataset.tab; window.scrollTo(0, 0); render(); },
    visit(el) { run(G.act.visit(el.dataset.ch), true); },
    'inspect-visit'() { run(G.act.inspectVisit()); },
    buy(el) { const res = G.act.buyOffer(+el.dataset.i); if (res.ok) { G.Sound.play('deal'); G.Feedback.vibrate('deal'); } run(res); },
    'visit-close'() { run(G.act.closeVisit(), true); },
    'pledge-visit'() { run(G.act.pledgeVisit(), true); },
    'pledge-check'(el) { run(G.act.pledgeCheck(+el.dataset.id)); },
    'pledge-sign'(el) { run(G.act.pledgeSign(+el.dataset.id)); },
    'pledge-close'() { run(G.act.pledgeClose(), true); },
    borrow(el) { const t = el.dataset.type; run(G.act.borrow(t, (parseFloat(document.getElementById('amt-' + t).value) || 0) * 10000)); },
    repay(el) { run(G.act.repay(+el.dataset.id)); },
    svc(el) { run(G.act.service(+el.dataset.car, el.dataset.svc)); },
    suggest(el) { run(G.act.suggestPrice(+el.dataset.car), true); },
    peer(el) { const res = G.act.sellToPeer(+el.dataset.car); if (res.ok) { G.Sound.play('deal'); G.Feedback.vibrate('deal'); } run(res); },
    advertise() { run(G.act.advertise()); },
    'report-reg'() { run(G.act.reportReg()); },
    upgrade() { run(G.act.upgrade()); },
    'cancel-third'() { run(G.act.cancelThirdParty()); },
    hire(el) { run(G.act.hire(+el.dataset.id)); },
    fire(el) {
      const id = +el.dataset.id;
      if (fireArmed !== id) { fireArmed = id; toast('再点一次确认辞退', true); setTimeout(() => { fireArmed = null; }, 3000); return; }
      fireArmed = null; run(G.act.fire(id));
    },
    'end-month'() {
      if (ui.settling) { toast('账还在算，稍等一下'); return; }
      if (G.state.over || G.cleanPending()) { run(G.act.endMonth(), true); return; }
      const oldPeak = G.state.stats.peakProfit;
      ui.settling = true; render();
      requestAnimationFrame(() => {
        const res = G.act.endMonth();
        if (!res.ok) { ui.settling = false; run(res, true); return; }
        res.report.newRecord = res.report.profit > oldPeak;
        G.Sound.play('month'); G.Feedback.vibrate('month'); G.save(); render();
        setTimeout(() => { ui.settling = false; ui.report = res.report; render(); }, reducedMotion() ? 0 : 700);
      });
    },
    'close-report'() { ui.report = null; render(); },
    decide(el) { const res = G.act.decide(+el.dataset.i); if (res.ok) { ui.result = res.msg; if (G.state.over) G.Sound.play(G.state.over === 'win' ? 'win' : 'bad'); } run(res, true); },
    'close-result'() { ui.result = null; render(); },
  };
  Object.assign(handlers, G.SaveUI.handlers);
  let fireArmed = null;

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.getAttribute('aria-disabled') === 'true') { e.preventDefault(); toast(el.dataset.disabledReason, true); return; }
    if (ui.settling) { toast('账还在算，稍等一下'); return; }
    if (!el.disabled && handlers[el.dataset.act]) handlers[el.dataset.act](el);
  });
  document.addEventListener('input', e => {
    const m = e.target.id && e.target.id.match(/^amt-(\w+)$/);
    if (m) { const pv = document.getElementById('pv-' + m[1]); if (pv) pv.textContent = `月供约 ${fmt(G.loanPreview(m[1], (parseFloat(e.target.value) || 0) * 10000))}`; }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.name === 'loc') G.Art.preload(el.value);
    if (el.type === 'radio') document.querySelectorAll('.pick').forEach(p => p.classList.toggle('is-picked', p.querySelector('input').checked));
    if (el.dataset.price) run(G.act.setPrice(+el.dataset.price, parseFloat(el.value) * 10000), true);
    else if (el.dataset.warranty) run(G.act.setWarranty(+el.dataset.warranty, el.value), true);
    else if (el.dataset.finance) run(G.act.setFinance(+el.dataset.finance, el.value), true);
  });

  document.addEventListener('DOMContentLoaded', () => { G.state = null; render(); });
})();
