/* =========================================================
 * 事件卡。每月月结后随机抽 0~2 张，玩家必须先处理才能继续操作。
 *
 * 字段速查：
 *   id        唯一标识
 *   title     标题
 *   tone      'good' | 'bad' | 'neutral'（只影响弹窗颜色）
 *   weight    抽中权重，数字或 (s) => 数字，默认 3
 *   cooldown  抽中后多少个月内不再出现，默认 4
 *   once      整局只出现一次
 *   when(s)   出现条件，返回 false 就不进卡池
 *   setup(s)  抽中时准备上下文（选哪台车、报价多少），返回 null 表示这次不出
 *   text      文案，字符串或 (ctx) => 字符串
 *   options   选项数组：
 *     label   按钮文字
 *     hint    小字说明；不写就按 effect 自动生成
 *     when    (ctx) => 不可选的原因（返回 null 表示可选）
 *     effect  通用效果 { cash, dark, rep, ap, traffic, market: { 品类: ±比例 } }，可以是函数
 *     run     (ctx) => 结果文本。需要动车辆、做判定时用
 *
 * ctx 会存进存档，所以只能放数字、字符串、车辆对象这类纯数据，不能放函数。
 * 引用库存车时，车辆 id 一律放在 ctx.id / ctx.ids / ctx.targetId 里；引用员工放在 ctx.staffId。
 * 如果同月前一张卡把这台车卖掉了、这个人走了，引擎会自动作废这张卡。
 * ========================================================= */
var G = globalThis.G = globalThis.G || {};

(function () {
  const S = () => G.state;
  const fmt = n => G.fmt(n);
  const carOf = id => S().cars.find(c => c.id === id);
  const listed = () => S().cars.filter(c => c.price > 0);
  const moy = () => ((S().month - 1) % 12) + 1;               // 当前是几月（1~12）
  const lvl = () => S().store.level;
  const catName = k => G.CATEGORIES[k].name;
  const staffOf = role => S().staff.filter(e => e.role === role);
  const staffById = id => S().staff.find(e => e.id === id);
  // 某岗位里品行最差的人越差，出事的权重越高
  const shady = role => { const l = staffOf(role); return l.length ? 1 + 8 * (1 - Math.min(...l.map(e => e.integrity))) : 0; };
  const pickShady = role => {
    const l = staffOf(role);
    const e = G.weighted(Object.fromEntries(l.map(x => [x.id, 0.05 + (1 - x.integrity)])));
    const emp = l.find(x => String(x.id) === e);
    return { staffId: emp.id, name: emp.name };
  };
  // 品行变化：正数变坏，负数变好
  const worsen = (id, d) => { const e = staffById(id); if (e) e.integrity = +G.clamp(e.integrity - d, 0, 1).toFixed(2); };
  const hiddenUndisclosed = car => car.flaws.some(f => !f.fixed && !G.Car.seen(f, 'public'));

  // 选项条件
  const needCash = n => () => (S().cash < n ? `现金不足（需要 ${fmt(n)}）` : null);
  const needAp = n => () => (S().ap < n ? `行动点不足（需要 ${n} 点）` : null);
  const notFull = () => (S().cars.length >= G.capacity() ? '库存已满' : null);
  const all = (...fs) => ctx => { for (const f of fs) { const r = f(ctx); if (r) return r; } return null; };

  // 生成一台外部来的车，带上报价
  function offerCar(chId, factor, opts) {
    const car = G.Car.generate(chId, opts);
    return { car, price: G.round(G.Car.value(car, 'public') * factor) };
  }
  function buyCar(ctx, source, extra = 0) {
    S().cash -= ctx.price + extra;
    return G.addCar(ctx.car, ctx.price + extra, source);
  }

  G.EVENTS = [
    /* ================= 行情 ================= */
    {
      id: 'hot_model', title: '热门车型涨价', tone: 'good', weight: 4, cooldown: 6,
      setup: () => ({ cat: G.pick(['family', 'suv', 'ev', 'perf', 'lux']) }),
      text: c => `一款${catName(c.cat)}在短视频上爆火，整个品类跟着涨价，库存里的同类车也水涨船高。`,
      options: [{ label: '知道了', effect: c => ({ market: { [c.cat]: 0.10 } }) }],
    },
    {
      id: 'ev_subsidy_end', title: '新能源补贴退潮', tone: 'bad', weight: 2, cooldown: 24,
      text: '地方购车补贴到期不再续，新车降价抢客，二手新能源车价格应声下跌。',
      options: [{ label: '知道了', effect: { market: { ev: -0.12 } } }],
    },
    {
      id: 'oil_up', title: '油价大涨', tone: 'neutral', weight: 2, cooldown: 12,
      text: '国际油价连续上调，买家开始关心油耗：新能源更好卖了，大排量的性能车、豪华车没那么香了。',
      options: [{ label: '知道了', effect: { market: { ev: 0.08, perf: -0.06, lux: -0.03 } } }],
    },
    {
      id: 'inspection_policy', title: '年检新政', tone: 'bad', weight: 2, cooldown: 24,
      text: '新规收紧了老旧车辆的年检标准，车龄大的家用车和 SUV 一下子不好卖了。',
      options: [{ label: '知道了', effect: { market: { family: -0.05, suv: -0.03 } } }],
    },
    {
      id: 'ev_recall', title: '新能源召回事件', tone: 'bad', weight: 2, cooldown: 18,
      setup: s => ({ evIds: s.cars.filter(c => c.catId === 'ev').map(c => c.id) }),
      text: c => `某品牌电池包大规模召回，新能源二手车行情跳水。${c.evIds.length ? `你库存里有 ${c.evIds.length} 台新能源车。` : ''}`,
      options: [
        {
          label: '主动联系厂家给库存车免费检测', when: all(c => (c.evIds.length ? null : '库存里没有新能源车'), needAp(1)),
          effect: { market: { ev: -0.15 }, ap: -1, rep: 2 },
          run: c => {
            const found = [];
            c.evIds.map(carOf).filter(Boolean).forEach(car => { const f = G.Car.reveal(car); if (f.length) found.push(`「${car.name}」${f.join('、')}`); });
            return `厂家检测完毕${found.length ? `，查出：${found.join('；')}` : '，没有发现问题'}。客户觉得你靠谱。`;
          },
        },
        { label: '不管，等风头过去', effect: { market: { ev: -0.15 } } },
      ],
    },

    /* ================= 季节 ================= */
    {
      id: 'holiday_rush', title: '节假日购车旺季', tone: 'good', weight: 6, cooldown: 4,
      when: () => [4, 5, 9, 10].includes(moy()),
      text: '假期临近，看车的人明显多了起来。',
      options: [
        { label: '加投一波广告', when: () => needCash(30000 * lvl())(), effect: () => ({ cash: -30000 * lvl(), traffic: 2.0 }) },
        { label: '正常接待', effect: { traffic: 1.4 } },
      ],
    },
    {
      id: 'year_end_rush', title: '年底冲量', tone: 'neutral', weight: 7, cooldown: 6,
      when: () => moy() >= 11,
      text: '年底购车潮来了，行情整体上浮。不过这时候来卖车的骗子也特别多，收车时多留个心眼。',
      options: [{ label: '知道了', effect: { traffic: 1.4, market: { family: 0.03, suv: 0.03, ev: 0.03, perf: 0.03, lux: 0.03 } } }],
    },
    {
      id: 'rainy_flood_car', title: '雨季：拖车场来电', tone: 'bad', weight: 6, cooldown: 2,
      when: () => moy() >= 6 && moy() <= 8,
      setup: () => offerCar('wreck', 0.6, { flaw: 'flood' }),
      text: c => `暴雨过后泡水车扎堆。拖车场老板打电话：有台「${c.car.name}」（${c.car.year}年）泡过水，${fmt(c.price)} 就能拉走。收拾干净，外行根本看不出来……`,
      options: [
        { label: '拉回来', hint: c => `-${fmt(c.price + 3000)}（含拖车费）`, when: c => all(notFull, needCash(c.price + 3000))(c),
          run: c => { buyCar(c, '雨季拖车场', 3000); return `「${c.car.name}」拉回来了。怎么卖，看你的良心。`; } },
        { label: '不碰泡水车' },
      ],
    },
    {
      id: 'cold_wave', title: '寒潮来袭', tone: 'bad', weight: 5, cooldown: 6,
      when: s => [12, 1, 2].includes(moy()) && s.cars.length > 0,
      text: '连续几天零下，库存车的电瓶集体亏电。',
      options: [{
        label: '知道了',
        run: () => {
          let n = 0;
          for (const car of S().cars) {
            const f = car.flaws.find(x => x.id === 'battery');
            if (f && !f.fixed) continue;
            if (f) f.fixed = false; else car.flaws.push({ id: 'battery', known: true, concealed: false, fixed: false });
            n++;
          }
          return `${n} 台车电瓶亏电，记得换易损件。`;
        },
      }],
    },

    /* ================= 客户 ================= */
    {
      id: 'referral', title: '老客户介绍朋友来', tone: 'good', weight: s => 2 + s.rep / 20, cooldown: 3,
      when: () => listed().length >= 2,
      setup: () => {
        const cars = [...listed()].sort((a, b) => a.price - b.price).slice(0, 2);
        return { ids: cars.map(c => c.id), total: cars.reduce((t, c) => t + c.price, 0) };
      },
      text: c => `老客户带了两个朋友，看中了${c.ids.map(id => `「${carOf(id).name}」`).join('和')}，挂牌合计 ${fmt(c.total)}，希望打个九五折一起拿下。`,
      options: [
        { label: '九五折一起卖', hint: c => `立即回款约 ${fmt(c.total * 0.95)} · 口碑 +2`,
          run: c => { c.ids.map(carOf).filter(Boolean).forEach(x => G.sellRetail(x, G.round(x.price * 0.95))); G.addRep(2); return '两台车一起成交，老客户很有面子。'; } },
        { label: '坚持原价', hint: '一半可能只成交一台',
          run: c => { const x = carOf(c.ids[0]); if (x && G.chance(0.5)) { G.sellRetail(x); return `朋友咬咬牙，按原价买了「${x.name}」。`; } return '他们觉得你不给面子，走了。'; } },
      ],
    },
    {
      id: 'lowball', title: '难缠的砍价客户', tone: 'neutral', weight: 4, cooldown: 3,
      when: () => listed().length > 0,
      setup: () => { const car = G.pick(listed()); return { id: car.id, price: car.price }; },
      text: c => `一位客户在「${carOf(c.id).name}」前转了三圈，说现金全款，但挂牌 ${fmt(c.price)} 必须让一成。`,
      options: [
        { label: '让一成，成交', hint: c => `成交价 ${fmt(G.round(c.price * 0.9))}`,
          run: c => { const x = carOf(c.id); if (x) G.sellRetail(x, G.round(c.price * 0.9)); return '客户满意地提车走了。'; } },
        { label: '一分不让' },
      ],
    },
    {
      id: 'trade_in', title: '置换客户', tone: 'neutral', weight: 5, cooldown: 3,
      when: () => listed().length > 0,
      setup: () => {
        const target = G.pick(listed());
        const t = offerCar('private', 1);
        return { targetId: target.id, car: t.car, value: t.price };
      },
      text: c => `客户想买「${carOf(c.targetId).name}」（挂牌 ${fmt(carOf(c.targetId).price)}），拿自己的「${c.car.name}」（${c.car.year}年，表显 ${G.fmtKm(c.car.mileageShown)}）来置换。他的车你没验过，看着车况还行，市场价大约 ${fmt(c.value)}。`,
      options: [
        { label: '收下置换车，压价到八五折', hint: c => `置换车作价 ${fmt(G.round(c.value * 0.85))}`,
          run: c => {
            const x = carOf(c.targetId); if (!x) return '客户要的车已经不在了。';
            G.sellRetail(x); S().cash -= G.round(c.value * 0.85);
            G.addCar(c.car, G.round(c.value * 0.85), '置换收车');
            return '置换成交。他的车有没有坑，验了才知道。';
          } },
        { label: '良心置换：按市场价作价', hint: c => `置换车作价 ${fmt(c.value)} · 口碑 +3`,
          run: c => {
            const x = carOf(c.targetId); if (!x) return '客户要的车已经不在了。';
            G.sellRetail(x); S().cash -= c.value;
            G.addCar(c.car, c.value, '置换收车'); G.addRep(3);
            return '客户逢人就说你们家置换最公道。';
          } },
        { label: '只卖车，不收置换', hint: '一半可能客户直接走人',
          run: c => { const x = carOf(c.targetId); if (x && G.chance(0.5)) { G.sellRetail(x); return '客户自己去卖旧车，还是在你这买了车。'; } return '客户嫌麻烦，去别家了。'; } },
      ],
    },
    {
      id: 'vip_fleet', title: '网约车公司批量采购', tone: 'good', weight: 4, cooldown: 6,
      when: s => s.store.level >= 2 && listed().filter(c => ['family', 'ev', 'suv'].includes(c.catId)).length >= 3,
      setup: () => {
        const cars = listed().filter(c => ['family', 'ev', 'suv'].includes(c.catId)).sort((a, b) => a.price - b.price).slice(0, 3);
        return { ids: cars.map(c => c.id), total: cars.reduce((t, c) => t + c.price, 0) };
      },
      text: c => `一家网约车公司要一次性拿走 3 台车（挂牌合计 ${fmt(c.total)}），出价打九二折。他们有专业车队，交车后会逐台检测，有问题会集中投诉。`,
      options: [
        { label: '接单', hint: c => `回款约 ${fmt(c.total * 0.92)} · 有没披露的问题会被追责`,
          run: c => {
            let bad = 0, refund = 0;
            for (const x of c.ids.map(carOf).filter(Boolean)) {
              const p = G.round(x.price * 0.92);
              const hidden = hiddenUndisclosed(x);
              G.sellRetail(x, p);
              if (hidden && G.chance(0.6)) { bad++; refund += G.round(p * 0.15); }
            }
            if (!bad) { G.addRep(4); return '车队验收全部通过，对方说下次还找你。'; }
            G.spend(refund, '售后赔偿'); G.addRep(-5 * bad);
            return `车队检测出 ${bad} 台车有问题，集中投诉，你赔了 ${fmt(refund)}，口碑 -${5 * bad}。`;
          } },
        { label: '婉拒' },
      ],
    },
    {
      id: 'collector', title: '收藏家上门', tone: 'good', weight: 5, cooldown: 4,
      when: s => s.cars.some(c => G.CATEGORIES[c.catId].classic),
      setup: s => { const car = G.pick(s.cars.filter(c => G.CATEGORIES[c.catId].classic)); return { id: car.id, offer: G.round(G.Car.value(car, 'public') * 1.25) }; },
      text: c => `一位老藏家看上了「${carOf(c.id).name}」，开价 ${fmt(c.offer)}。情怀车还在慢慢升值，要不要现在出手？`,
      options: [
        { label: '卖', hint: c => `成交 ${fmt(c.offer)}`, run: c => { const x = carOf(c.id); if (x) G.sellRetail(x, c.offer); return '藏家满意地把车拖走了。'; } },
        { label: '再放放' },
      ],
    },
    {
      id: 'classic_offer', title: '偶遇稀有老车', tone: 'good', weight: 3, cooldown: 8,
      when: () => !notFull(),
      setup: () => offerCar('private', G.range(0.85, 1.0), { catId: 'classic' }),
      text: c => `一位老爷子要出手家里放了多年的「${c.car.name}」（${c.car.year}年），报价 ${fmt(c.price)}。情怀车越放越值钱，但每月要花保管费。`,
      options: [
        { label: '买下', hint: c => `-${fmt(c.price)}`, when: c => needCash(c.price)(), run: c => { buyCar(c, '私人藏车'); return '老车入库，记得验一验。'; } },
        { label: '不要' },
      ],
    },
    {
      id: 'lucky_find', title: '散户急售', tone: 'neutral', weight: 4, cooldown: 3,
      when: () => !notFull(),
      setup: () => offerCar('private', 0.65, { hiddenRate: 0.55 }),
      text: c => `有人急着用钱，要把「${c.car.name}」（${c.car.year}年，表显 ${G.fmtKm(c.car.mileageShown)}）以 ${fmt(c.price)} 当天出手，比行情低三成多。他说今天必须成交，来不及验车。`,
      options: [
        { label: '捡漏，直接买', hint: c => `-${fmt(c.price)}`, when: c => needCash(c.price)(), run: c => { buyCar(c, '散户急售'); return '车到手了。便宜有没有好货，验了才知道。'; } },
        { label: '没验过的车不碰' },
      ],
    },

    /* ================= 同行 ================= */
    {
      id: 'peer_price_war', title: '同行低价抢客', tone: 'bad', weight: 4, cooldown: 6,
      text: '隔壁车行挂出一排「全城最低价」，把你的客户截走了不少。',
      options: [
        { label: '跟着降价', hint: '所有挂牌价下调 5%', run: () => { listed().forEach(c => { c.price = G.round(c.price * 0.95); }); return '你也挂出了降价横幅，客流稳住了。'; } },
        { label: '找人私下「沟通」', effect: { cash: -20000, dark: 8 }, when: needCash(20000), result: '对方第二天就撤了横幅。没人知道那天晚上发生了什么。' },
        { label: '不理会', effect: { traffic: 0.6 } },
      ],
    },
    {
      id: 'peer_rumor', title: '同行散布谣言', tone: 'bad', weight: 3, cooldown: 8,
      text: '本地车友群里有人说你们家「专卖事故车」，截图到处转。',
      options: [
        { label: '发声明澄清', effect: { ap: -1, rep: -2 }, when: needAp(1) },
        { label: '花钱做公关', effect: () => ({ cash: -50000 * lvl() }), when: () => needCash(50000 * lvl())() },
        { label: '反击：也去抹黑对方', hint: '黑化 +6，可能被反咬',
          run: () => { G.addDark(6); if (G.chance(0.5)) { G.addRep(-1); return '你那边的料更狠，舆论转向了对方。'; } G.addRep(-8); return '被对方抓住把柄反咬一口，两家一起被骂。'; } },
        { label: '不理', effect: { rep: -6 } },
      ],
    },
    {
      id: 'peer_dump', title: '同行急用钱甩车', tone: 'neutral', weight: 4, cooldown: 3,
      when: () => !notFull(),
      setup: () => offerCar('peer', 0.78, { hiddenRate: 0.4 }),
      text: c => `老同行资金周转不开，要把「${c.car.name}」（${c.car.year}年）按 ${fmt(c.price)} 甩给你，拍胸脯说「车况没毛病」。`,
      options: [
        { label: '买下', hint: c => `-${fmt(c.price)}`, when: c => needCash(c.price)(), run: c => { buyCar(c, '同行甩卖'); return '车到手了。同行的「没毛病」，你信几分？'; } },
        { label: '婉拒' },
      ],
    },

    /* ================= 员工（点名到具体员工，ctx.staffId 失效时自动作废） ================= */
    {
      id: 'tech_sells_parts', title: '技师私下倒卖配件', tone: 'bad', cooldown: 8,
      weight: () => shady('tech'), when: () => staffOf('tech').length > 0,
      setup: () => pickShady('tech'),
      text: c => `你发现${c.name}把换下来的好件、库存配件拿出去倒卖。`,
      options: [
        { label: '开除', hint: '不给补偿 · 口碑 +1', run: c => { G.Staff.remove(c.staffId, '因倒卖配件被开除'); G.addRep(1); return `${c.name}走人了。`; } },
        { label: '默许', effect: { cash: -5000, dark: 5 }, run: c => { worsen(c.staffId, 0.1); return '你睁一只眼闭一只眼。配件少了点，大家心照不宣。'; } },
        { label: '约谈', hint: '行动点 -1，不一定管用', when: needAp(1),
          run: c => { S().ap -= 1; if (G.chance(0.6)) { worsen(c.staffId, -0.3); return `${c.name}认错，保证不再犯。`; } G.addDark(3); return `${c.name}嘴上认错，背地里照旧。`; } },
      ],
    },
    {
      id: 'sales_kickback', title: '销售吃回扣', tone: 'bad', cooldown: 8,
      weight: () => shady('sales'), when: () => staffOf('sales').length > 0,
      setup: () => pickShady('sales'),
      text: c => `有客户反映，${c.name}私下多收了「服务费」，还暗示能帮忙「处理」车况报告。`,
      options: [
        { label: '开除并给客户退钱', effect: { cash: -15000, rep: 3 }, run: c => { G.Staff.remove(c.staffId, '因吃回扣被开除'); return `${c.name}被开除，客户拿回了钱。`; } },
        { label: '默许，反正钱进了店', effect: { cash: 20000, dark: 6, rep: -2 }, run: c => { worsen(c.staffId, 0.1); return '这事就这么过去了。'; } },
        { label: '扣奖金警告', effect: { rep: -1 }, run: c => { worsen(c.staffId, -0.15); return `${c.name}老实了一阵子。`; } },
      ],
    },
    {
      id: 'finance_books', title: '财务提议做账', tone: 'bad', cooldown: 12,
      weight: () => shady('finance'), when: () => staffOf('finance').length > 0,
      setup: () => pickShady('finance'),
      text: c => `${c.name}悄悄跟你说：几笔收入走私人账户，今年能少缴不少税。`,
      options: [
        { label: '照做', effect: () => ({ cash: 50000 * lvl(), dark: 10 }) },
        { label: '拒绝' },
        { label: '拒绝，并把人换掉', effect: { dark: -3 }, run: c => { G.Staff.remove(c.staffId, '被换掉'); return `${c.name}走了，账本干净了。`; } },
      ],
    },
    {
      id: 'staff_poached', title: '同行高薪挖人', tone: 'bad', weight: 3, cooldown: 6,
      when: () => S().staff.some(e => e.level >= 2),
      setup: () => {
        const e = G.pick(S().staff.filter(x => x.level >= 2));
        return { staffId: e.id, name: e.name, role: G.ROLES[e.role].name, raise: G.round(e.salary * 0.3, 500) };
      },
      text: c => `隔壁车行开出高薪，要挖走你的${c.role}${c.name}。他来问你的意思。`,
      options: [
        { label: '加薪留人', hint: c => `月薪 +${fmt(c.raise)}`, run: c => { const e = staffById(c.staffId); e.salary += c.raise; worsen(c.staffId, -0.1); return `${c.name}留下了，干劲更足。`; } },
        { label: '放他走', run: c => { G.Staff.remove(c.staffId, '跳槽去了同行'); return `${c.name}跳槽了。`; } },
      ],
    },
    {
      id: 'staff_promotion', title: '老员工要求升职加薪', tone: 'neutral', weight: 4, cooldown: 4,
      when: () => S().staff.some(e => e.tenure >= 12 && e.level < 3),
      setup: () => {
        const e = G.pick(S().staff.filter(x => x.tenure >= 12 && x.level < 3));
        const next = G.round(G.ROLES[e.role].salary[e.level] * G.range(0.95, 1.1), 500);
        return { staffId: e.id, name: e.name, role: e.role, level: e.level, salary: next };
      },
      text: c => `${c.name}在店里干了一年多，手艺见长，想升到 ${c.level + 1} 级，月薪涨到 ${fmt(c.salary)}。`,
      options: [
        { label: '同意', hint: c => `升到 ${c.level + 1} 级：${G.Staff.effectText(c.role, c.level + 1)}`,
          run: c => { const e = staffById(c.staffId); e.level++; e.salary = c.salary; e.tenure = 0; worsen(c.staffId, -0.15); return `${c.name}升到了 ${e.level} 级。`; } },
        { label: '拒绝', hint: '可能心生不满，甚至离职',
          run: c => { worsen(c.staffId, 0.2); if (G.chance(0.35)) { G.Staff.remove(c.staffId, '觉得没前途，辞职了'); return `${c.name}辞职了。`; } staffById(c.staffId).tenure = 0; return `${c.name}没说什么，但看得出来不太高兴。`; } },
      ],
    },
    {
      id: 'talent_walkin', title: '资深人才上门', tone: 'good', weight: 2, cooldown: 10,
      when: () => S().staff.length < G.Staff.slots(),
      setup: () => {
        const role = G.pick(Object.keys(G.ROLES));
        const e = G.Staff.makeCandidate({ role, level: 3, integrity: G.range(0.6, 1) });
        e.salary = G.round(G.ROLES[role].salary[2] * 0.85, 500);
        return { cand: e };
      },
      text: c => `一位从 4S 店出来的老${G.ROLES[c.cand.role].name}${c.cand.name}想找个新东家，3 级水平，开价 ${fmt(c.cand.salary)}/月，比市场价低。`,
      options: [
        { label: '请进来', hint: c => G.Staff.effectText(c.cand.role, 3),
          when: () => (S().staff.length >= G.Staff.slots() ? '编制已满' : null),
          run: c => { G.Staff.add(JSON.parse(JSON.stringify(c.cand))); return `${c.cand.name}入职了。`; } },
        { label: '暂时不需要' },
      ],
    },

    /* ================= 灰色诱惑 ================= */
    {
      id: 'yinyang_contract', title: '客户要求阴阳合同', tone: 'bad', weight: 4, cooldown: 4,
      when: () => listed().length > 0,
      setup: () => { const car = G.pick(listed()); return { id: car.id, fee: G.round(car.price * 0.03, 100) }; },
      text: c => `客户看中「${carOf(c.id).name}」，条件是合同上把价格写低，帮他少缴税，另外愿意额外给你 ${fmt(c.fee)} 辛苦费。`,
      options: [
        { label: '签阴阳合同', hint: c => `成交 + 额外 ${fmt(c.fee)} · 黑化 +10 · 监管抽查会翻台账`,
          run: c => { const x = carOf(c.id); if (!x) return '车已经不在了。'; const sale = G.sellRetail(x); sale.concealed = true; S().cash += c.fee; S().month_.revenue += c.fee; G.addDark(10); return '合同签了，钱也收了。这笔账，监管来查时说不清。'; } },
        { label: '只签正规合同', hint: '一半可能客户走人',
          run: c => { const x = carOf(c.id); if (x && G.chance(0.5)) { G.sellRetail(x); return '客户犹豫了一下，还是按正规合同买了。'; } return '客户去别家找愿意配合的了。'; } },
      ],
    },
    {
      id: 'record_wipe', title: '「消记录」服务上门', tone: 'bad', weight: 3, cooldown: 6,
      when: s => s.cars.some(c => c.flaws.some(f => f.known && !f.fixed && !f.concealed && !G.FLAWS[f.id].visible)),
      setup: s => {
        const car = G.pick(s.cars.filter(c => c.flaws.some(f => f.known && !f.fixed && !f.concealed && !G.FLAWS[f.id].visible)));
        return { id: car.id };
      },
      text: c => `有人上门推销：能把「${carOf(c.id).name}」的维修和出险记录从查询平台上「处理」掉，一万块包干。`,
      options: [
        { label: '花钱处理', hint: () => `-${fmt(10000)} · 黑化 +12`, when: needCash(10000),
          run: c => { const x = carOf(c.id); x.flaws.forEach(f => { if (f.known && !f.fixed && !G.FLAWS[f.id].visible) f.concealed = true; }); G.spend(10000, '灰色操作'); G.addDark(12); return `「${x.name}」的记录「干净」了。`; } },
        { label: '轰出去' },
      ],
    },
    {
      id: 'stolen_car', title: '手续含糊的便宜车', tone: 'bad', weight: s => 1 + s.dark / 25, cooldown: 6,
      when: () => !notFull(),
      setup: () => {
        const o = offerCar('private', 0.45, { hiddenRate: 0 });
        o.car.flaws.push({ id: 'stolen', known: true, concealed: true, fixed: false });
        o.car.inspected = true;
        o.price = G.round(G.Car.value(o.car, 'public') * 0.45);
        return o;
      },
      text: c => `一个生面孔开来一台「${c.car.name}」，只要 ${fmt(c.price)}，不到行情一半。登记证书「在补办」，发票「找不到了」。`,
      options: [
        { label: '收了', hint: c => `-${fmt(c.price)} · 黑化 +15`, when: c => needCash(c.price)(),
          run: c => { buyCar(c, '来路不明'); G.addDark(15); return '车停进了后院。最好别多问。'; } },
        { label: '拒收', effect: { rep: 1 } },
        { label: '拒收并报警', effect: { dark: -5, rep: 2, ap: -1 }, when: needAp(1), result: '警察说这台车确实在协查名单上，表扬了你。' },
      ],
    },
    {
      id: 'ledger_check', title: '监管抽查台账', tone: 'bad', weight: s => 2 + s.dark / 15, cooldown: 5,
      text: '市场监管所来电：明天上午到店核查车辆台账和检测报告。',
      options: [
        { label: '配合检查',
          run: () => {
            let fine = 0, found = 0;
            for (const car of S().cars) for (const f of car.flaws) if (f.concealed && !f.fixed && G.chance(0.5)) { f.concealed = false; found++; fine += 50000; }
            if (!found) { G.addRep(2); return '台账清清楚楚，检查顺利通过。口碑 +2'; }
            G.spend(fine, '罚款'); G.addDark(4); G.addRep(-5);
            return `查出 ${found} 处隐瞒，罚款 ${fmt(fine)}，口碑 -5。`;
          } },
        { label: '托关系打招呼', effect: { cash: -30000, dark: 5 }, when: needCash(30000), result: '电话打过去，检查「改期」了。' },
      ],
    },

    /* ================= 洗白 ================= */
    {
      id: 'charity_inspection', title: '行业公益检测活动', tone: 'good', weight: s => (s.dark > 30 ? 6 : 2), cooldown: 6,
      text: '行业协会组织公益活动：免费帮市民检测二手车。参加要出钱出人，但能大大改善形象。',
      options: [
        { label: '参加', effect: () => ({ cash: -50000 * lvl(), ap: -2, dark: -12, rep: 5 }), when: () => all(needCash(50000 * lvl()), needAp(2))() },
        { label: '不参加' },
      ],
    },
    {
      id: 'surrender_car', title: '要不要上交问题车', tone: 'neutral', weight: 3, cooldown: 6,
      when: s => s.cars.some(c => c.flaws.some(f => !f.fixed && f.known && (f.concealed || ['majorAcc', 'flood', 'stolen'].includes(f.id)))),
      setup: s => {
        const car = G.pick(s.cars.filter(c => c.flaws.some(f => !f.fixed && f.known && (f.concealed || ['majorAcc', 'flood', 'stolen'].includes(f.id)))));
        return { id: car.id };
      },
      text: c => { const x = carOf(c.id); return `「${x.name}」（成本 ${fmt(x.cost)}）的问题你心里有数。监管部门正在开展问题车源专项整治，主动上交可以从轻。`; },
      options: [
        { label: '主动上交', hint: c => `损失成本 ${fmt(carOf(c.id).cost)} · 黑化 -10 · 口碑 +3`,
          run: c => { const x = carOf(c.id); G.removeCar(x); S().month_.cogs += x.cost; G.addDark(-10); G.addRep(3); return `「${x.name}」上交了。钱亏了，心里踏实了。`; } },
        { label: '留着' },
      ],
    },
    {
      id: 'third_party', title: '第三方检测机构合作', tone: 'good', weight: s => (s.dark > 20 ? 4 : 2), cooldown: 12,
      when: s => !s.perks.thirdParty,
      text: () => `一家权威检测机构提议常驻你的门店，每月收费 ${fmt(G.CONFIG.thirdPartyFee)}。有他们盯着，员工不敢乱来，黑化增长会慢很多。`,
      options: [
        { label: '签约', hint: () => `每月 -${fmt(G.CONFIG.thirdPartyFee)} · 之后黑化增长 ×${G.CONFIG.thirdPartyDarkMult} · 可在门店页解约`,
          run: () => { S().perks.thirdParty = true; G.addRep(2); return '检测机构入驻，门口挂上了认证牌子。口碑 +2'; } },
        { label: '不需要' },
      ],
    },

    /* ================= 曝光 ================= */
    {
      id: 'media', title: '本地媒体想来采访', tone: 'good', weight: 3, cooldown: 12,
      when: s => s.rep >= 60 && s.dark < 30,
      text: '本地生活号想做一期「良心车商」专题，点名要采访你。',
      options: [
        { label: '接受采访', effect: { ap: -1, rep: 5, traffic: 1.3 }, when: needAp(1) },
        { label: '婉拒' },
      ],
    },
    {
      id: 'viral', title: '短视频上了热门', tone: 'neutral', weight: 3, cooldown: 6,
      setup: s => ({ bad: s.dark > 50 && G.chance(0.7) }),
      text: c => (c.bad
        ? '有买家把在你这买的车拆开拍了视频，标题「二手车行的套路有多深」，播放量破百万。'
        : '员工随手拍的看车视频火了，评论区都在问地址。'),
      options: [{ label: '知道了', effect: c => (c.bad ? { rep: -8, traffic: 0.7 } : { rep: 3, traffic: 1.6 }) }],
    },

    /* ================= 门店 ================= */
    {
      id: 'landlord', title: '房东要涨租', tone: 'bad', weight: 2, cooldown: 18,
      setup: () => ({ extra: G.round(G.level().baseRent * G.loc().rent * 2) }),
      text: c => `房东说周边都涨了，要求一次性补交 ${fmt(c.extra)}，否则合同到期不续。也可以趁机搬到别的地段。`,
      options: [
        { label: '交钱', effect: c => ({ cash: -c.extra }) },
        ...Object.entries(G.LOCATIONS).map(([id, l]) => ({
          label: `搬到${l.name}`, hint: () => `-${fmt(100000)} · 行动点 -2 · ${l.desc}`,
          when: all(() => (S().store.location === id ? '已经在这里' : null), needCash(100000), needAp(2)),
          run: () => { const s = S(); G.spend(100000, '搬迁'); s.ap -= 2; s.store.location = id; return `搬到了${l.name}。`; },
        })),
      ],
    },
  ];

  G.EVENT_MAP = Object.fromEntries(G.EVENTS.map(e => [e.id, e]));
})();
