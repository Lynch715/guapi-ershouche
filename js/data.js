/* =========================================================
 * 数据配置：所有数值、文案都在这里。调平衡、加内容只改这个文件。
 * 金额单位：元
 * ========================================================= */
var G = globalThis.G = globalThis.G || {};

G.VERSION = 'v1.1';
// 议价按车辆分别记录，最多三轮；只有主动接待新买家花行动点。
G.TRADE = {
  rounds: 3, buyerAP: 1,
  firmQuoteRate: { private: 0.12, dealer4s: 0.28, peer: 0.30, wreck: 0.10 },
  cuts: { gentle: { name: '试探砍价', rate: 0.03 }, firm: { name: '认真压价', rate: 0.07 }, hard: { name: '狠砍一刀', rate: 0.12 } },
  counters: { gentle: { name: '多让一点', share: 0.25 }, firm: { name: '各退一步', share: 0.5 }, hard: { name: '坚持原价', share: 1 } },
  styles: [
    { name: '爽快型', hint: '说话痛快，合理的价格容易谈拢', floor: [0.84, 0.90], patience: 4, concede: 0.65, buyerConcede: 0.55,
      seller: { accept: '行，{price}，痛快给你。', counter: ['这个价接不住。{price}，咱们各退一步。', '我再挪一点，{price}，你也给个准话。'], firm: '已经让到{price}，再低真聊不下去了。', leave: '你这刀太狠，今天不卖了。' },
      buyer: { open: '{price}，合适我今天就开走。', accept: '行，{price}，办手续吧！', counter: ['我也往上加一点，{price}，你看行不行？', '再凑到{price}，咱们都爽快点。'], firm: '我最多就出{price}，再加真没有了。', leave: '价钱差太多，今天先算了。' } },
    { name: '精打细算型', hint: '每一笔都要算，得多拉扯两句', floor: [0.90, 0.95], patience: 4, concede: 0.45, buyerConcede: 0.18,
      seller: { accept: '{price}，账算得过来，就这么定。', counter: ['我这边也有成本，{price}，您再想想。', '已经给您抹了一笔，{price}，不能光我让呀。'], firm: '{price}就是底线，没法再抹了。', leave: '这账怎么算都不合适，换家看看吧。' },
      buyer: { open: '先按{price}聊聊，我还得留点钱办手续。', accept: '{price}，算下来能接受，就定这个数。', counter: ['先别急着定，我算算……加到{price}怎么样？', '再从预算里挤一点，{price}，您也松松口。'], firm: '怎么算都只能到{price}，您给个准话吧。', leave: '这笔账还是对不上，我先不买了。' } },
    { name: '急性子', hint: '不喜欢来回磨，试探太多会走人', floor: [0.88, 0.96], patience: 2, concede: 0.55, buyerConcede: 0.30,
      seller: { accept: '{price}，就这么着，别再磨了。', counter: ['{price}，行就收，不行我去下一家。', '我赶时间，{price}，这回给个准话。'], firm: '就{price}，再问也一样。', leave: '这价没法聊，我先走了。' },
      buyer: { open: '{price}，我就想今天把车定了。', accept: '{price}就{price}，别折腾了，成交！', counter: ['加到{price}，别让我来回跑。', '{price}，能不能卖给句话。'], firm: '{price}，这是最后一次问了。', leave: '磨半天还是谈不拢，别家看看去。' } },
  ],
};
G.CONFIG = {
  maxSaveChars: 10000000,    // 导入大小上限，防止选中超大文件
  sealDark: 100,             // 黑化达到此值查封
  inspectSurgeAt: 70,         // 超过此值进入突击检查期
  // 过亿规模后，民间担保集中暴露；小本目标以下不改原有规则。
  capitalRisk: { threshold: 100000000, ramp: 25000000, defaultScale: 0.18, defaultCap: 0.25,
    collectLossScale: 0.15, collectDarkScale: 4, inspectScale: 0.25, darkInspectScale: 0.35 },
  apPerMonth: 6,
  apPerLevel: 0,              // 门店每升一级，每月多几个行动点（现在由员工提供，保留为 0）
  startYear: 2026,            // 第 1 回合 = 2026 年 1 月
  difficulties: [             // 目标按"会玩的老实人约 8 年通关"校准（tools/sim.js）
    { id: 'small', name: '小本起家', cash: 5000000,   goal: 100000000 },
    { id: 'mid',   name: '中型资本', cash: 50000000,  goal: 200000000 },
    { id: 'big',   name: '雄厚资本', cash: 100000000, goal: 250000000 },
  ],
  startRep: 50,
  inventoryNetRate: 0.9,      // 库存计入净资产时的折算率
  peerSellRate: 0.82,         // 批发给同行 = 已知车况估值 × 该比例
  listMarkup: 1.08,           // 默认挂牌价 = 对外估值 × 该值
  offerInspectCost: 1500,     // 收车时现场验车：每台车的费用（1 点行动点验完本次所有车）
  classicStorageFee: 2000,    // 情怀收藏车每月保管费 / 台
  adCostPerLevel: 20000,      // 广告费 = 门店等级 × 该值
  adTrafficMult: 1.6,
  bombLifetime: 36,           // 潜伏期过后，隐患可能爆发的月数
  bombDormant: [6, 18],       // 售出后的潜伏期（月）：这段时间买家还没发现
  bombKnowingMult: 1.3,       // 知情隐瞒的爆发率倍数
  bombUnknownMult: 0.7,       // 车行自己也不知道的隐患，爆发率倍数
  maxComplaintsPerMonth: 2,
  warrantySmallClaim: 0.03,   // 质保期内每月小额理赔概率
  inspectFine: { default: 50000, flood: 150000, sale: 100000 },
  inspectDarkScale: 0.4,      // 突击检查概率 = 地段基础 + 该值 × (黑化/100)^指数 + (黑化>70 时再加 surge)
  inspectDarkExp: 3,
  inspectSurge: 0.35,
  inspectRep: 5,              // 突击检查查出问题：口碑 -N
  inspectDarkBase: 3,         // 突击检查查出问题：黑化 + 基础值 + 每处 × 下一项（上限 40）
  inspectDarkPerItem: 4,
  lawsuitFee: 30000,
  complaintDark: { refund: 2, comp: 6, fightWin: 4, fightLose: 12 },  // 知情隐瞒被找上门：各处理方式的黑化
  caughtRep: 1,               // 客户识破被掩盖的问题时口碑 -N（每台车只算一次）
  compensateRate: 1.0,        // 投诉时"补偿维修费" = 成交价 × 瑕疵折损 × 该值
  eventChance: 0.75,          // 每月至少一张事件卡的概率
  secondEventChance: 0.3,     // 再来一张的概率
  thirdPartyFee: 30000,       // 第三方检测机构常驻：每月费用
  thirdPartyDarkMult: 0.6,    // 常驻期间黑化增长 × 该值
  reportDark: 3,              // 主动报备整改：黑化 -N（每月一次）
  concealDark: 2,             // 掩盖问题的默认黑化代价（瑕疵自己写了 darkConceal 的除外）
  darkTrafficDiv: 400,        // 客流 × (1 - 黑化 / 该值)
  darkDecay: 3,               // 黑化每月自然回落
  repDecay: 0.06,             // 口碑高于 50 时，每月回落差值的这个比例
  offersPerLevel: 1.0,        // 门店每升一级，每次看车多看的比例
  premiumPerLevel: 1.5,       // 门店每升一级，性能车/豪华车/收藏车车源权重 × (1 + 该值)
};

/* 地段 */
G.LOCATIONS = {
  city:     { name: '市区商圈',   rent: 1.0, traffic: 1.3, inspect: 0.06, desc: '客流高、租金贵' },
  suburb:   { name: '城郊产业园', rent: 0.5, traffic: 0.8, inspect: 0.03, desc: '租金低，散户买家多，监管松' },
  autocity: { name: '汽车城专区', rent: 1.2, traffic: 1.6, inspect: 0.10, desc: '客流极高，监管也盯得紧' },
};

/* 门店等级（下标即等级）。wages = 老板自己和杂工的基本开销，员工工资另算；staffSlots = 员工编制；apCap = 员工最多能带来的行动点（店小，人多了也施展不开） */
G.STORE_LEVELS = [
  null,
  { name: '1级小店',     capacity: 8,  baseRent: 30000,  wages: 10000,  traffic: 10,  upgradeCost: 0,       inspectBonus: 0.03, staffSlots: 2, apCap: 2 },
  { name: '2级中型车行', capacity: 20, baseRent: 80000,  wages: 20000,  traffic: 24,  upgradeCost: 1500000, inspectBonus: 0, staffSlots: 4, apCap: 4 },
  { name: '3级大型展厅', capacity: 45, baseRent: 200000, wages: 50000, traffic: 44, upgradeCost: 8000000, inspectBonus: 0, staffSlots: 7, apCap: 6 },
  { name: '4级连锁两店', capacity: 90, baseRent: 400000, wages: 120000, traffic: 90, upgradeCost: 25000000, inspectBonus: 0, staffSlots: 11, apCap: 8 },
  { name: '5级区域连锁', capacity: 180, baseRent: 800000, wages: 250000, traffic: 180, upgradeCost: 60000000, inspectBonus: 0, staffSlots: 16, apCap: 10 },
];

/* 员工岗位。数组下标 = 等级 1~3
 *   ap 每月行动点  traffic 客流加成  refurbDiscount 整备打折  fineCut 罚款和赔偿减免  salary 月薪基准
 */
G.ROLES = {
  manager: { name: '门店经理', ap: [1, 2, 3],                                  salary: [30000, 50000, 80000], weight: 2, desc: '统筹调度，每月多出行动点' },
  tech:    { name: '维修技师', ap: [1, 1, 1], refurbDiscount: [0.1, 0.2, 0.3], salary: [20000, 30000, 45000], weight: 4, desc: '多干活，整备更便宜' },
  sales:   { name: '销售顾问', traffic: [0.06, 0.1, 0.15],                      salary: [15000, 25000, 40000], weight: 4, desc: '带来更多客户' },
  finance: { name: '财务',     fineCut: [0.2, 0.35, 0.5],                       salary: [15000, 25000, 40000], weight: 2, desc: '罚款和售后赔偿打折' },
};
G.STAFF_CAPS = { traffic: 0.5, refurbDiscount: 0.5, fineCut: 0.7 };   // 同类加成的总上限
G.SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '胡', '朱', '郭', '何', '罗', '高', '林'];

/* ---------- 贷款与抵押 ---------- */
/* 车行自身融资：rate 为月利率；ltv 为最多能贷抵押物价值的比例 */
G.LOANS = {
  store: { name: '门店抵押贷',   rate: 0.005, term: 24, ltv: 0.6, desc: '拿门店装修和设备抵押，利率低、期限长' },
  stock: { name: '库存车抵押贷', rate: 0.008, term: 12, ltv: 0.5, desc: '拿在库车辆抵押，额度跟着库存走' },
};
G.FINANCE = {
  storeBaseValue: 500000,   // 1 级小店的装修设备价值；之后每次升级费用都计入门店价值
  prepayFee: 0.01,          // 提前还款手续费（按剩余本金）
  seizeAfter: 3,            // 连续逾期几个月触发强制拍卖
  creditStart: 80,          // 征信分 0~100：>=70 良好，>=40 一般（利率上浮），<40 差（借不到钱）
  creditFairRateUp: 0.002,
  overdueCredit: 15,        // 每逾期一次征信 -N
};
/* 卖车时给买家的金融方案 */
G.BUYER_FINANCE = {
  none:    { name: '全款',         bonus: 0,    fee: 0 },
  bank:    { name: '合作银行车贷', bonus: 0.02, fee: 0.01, desc: '买家首付三成，手续费稳定，没有风险' },
  private: { name: '民间车贷',     bonus: 0.06, fee: 0.05, months: 12, defaultRate: 0.05, lossRate: 0.7, dark: 0, collectLoss: 0.35,
             desc: '谁都能贷，服务费高；车行兜底担保，买家断供要你来收拾' },
};
/* 车主抵押借款：车主押车借钱，到期本息赎回；不赎回车归车行 */
G.PLEDGE = {
  ap: 1, clients: [2, 4], ltv: [0.4, 0.7], rate: [0.02, 0.04], term: [1, 3],
  redeemRate: 0.7,          // 到期赎回概率
  doubleRate: 0.2,          // 二次抵押（车早已押给别人）的概率
  checkCost: 500,           // 查抵押登记
  partsRate: 0.35,          // 二次抵押的车过不了户，只能拆件卖：估值 × 该值
};

/* 车型品类：每个品类独立行情 */
G.CATEGORIES = {
  family:  { name: '家用代步', short: '轿车',   newPrice: [100000, 220000],  yearlyDep: 0.86, vol: 0.020, weight: 28 },
  suv:     { name: 'SUV',      short: 'SUV',    newPrice: [180000, 450000],  yearlyDep: 0.87, vol: 0.025, weight: 26 },
  ev:      { name: '新能源',   short: '电动车', newPrice: [150000, 350000],  yearlyDep: 0.80, vol: 0.040, weight: 18 },
  perf:    { name: '性能车',   short: '轿跑',   newPrice: [400000, 1000000], yearlyDep: 0.85, vol: 0.035, weight: 10 },
  lux:     { name: '豪华车',   short: '行政车', newPrice: [600000, 2000000], yearlyDep: 0.84, vol: 0.030, weight: 12 },
  classic: { name: '情怀收藏', short: '经典车', newPrice: [200000, 800000],  classic: true, classicBase: 0.5, appreciate: 0.006, vol: 0.030, weight: 6 },
};

/* 虚构品牌（避免真实车标授权问题） */
G.ORIGINS = ['德系', '日系', '国产', '美系', '韩系', '法系'];
G.MODEL_NAMES = ['风语', '青岚', '远航者', '赤焰', '银隼', '云栖', '铁骑', '白鹭', '雷鸣', '夜枭', '晨曦', '墨影', '翠屏', '流萤', '朔风', '玄甲'];

/* 瑕疵
 * visible: 显性，谁都看得见
 * hit: 对估值的折损比例
 * grade: 存在该瑕疵时车况评级的上限
 * repairRate: 可维修，费用 = 新车价 × 该值
 * bombRate: 售出时未披露，每月爆发投诉的基础概率
 * darkConceal: 掩盖该瑕疵增加的黑化值（默认 CONFIG.concealDark）
 */
G.FLAWS = {
  scratch:  { name: '漆面划痕',     visible: true,  hit: 0.04 },
  tires:    { name: '轮胎老化',     visible: true,  hit: 0.03 },
  dirty:    { name: '内饰脏污',     visible: true,  hit: 0.03 },
  battery:  { name: '电瓶亏电',     visible: true,  hit: 0.02 },
  chassis:  { name: '底盘暗伤',     visible: false, hit: 0.12, grade: 'B', repairRate: 0.05, mech: true, bombRate: 0.04 },
  gearbox:  { name: '变速箱隐患',   visible: false, hit: 0.15, grade: 'B', repairRate: 0.07, mech: true, bombRate: 0.045 },
  minorAcc: { name: '小事故修复史', visible: false, hit: 0.15, grade: 'C', bombRate: 0.025 },
  majorAcc: { name: '重大事故史',   visible: false, hit: 0.40, grade: 'D', bombRate: 0.035, darkConceal: 3 },
  flood:    { name: '泡水/火烧',    visible: false, hit: 0.60, grade: 'E', bombRate: 0.03, darkConceal: 5 },
  mileage:  { name: '里程表被调',   visible: false, hit: 0,    grade: 'B', bombRate: 0.03 },
  stolen:   { name: '来路不明',     visible: false, hit: 0.80, grade: 'E', bombRate: 0.06, darkConceal: 5 },
};
G.HIDDEN_WEIGHTS = { minorAcc: 4, chassis: 3, gearbox: 3, majorAcc: 1.5, flood: 0.8 };
G.VISIBLE_FLAWS = ['scratch', 'tires', 'dirty', 'battery'];

/* 收车渠道 */
G.CHANNELS = {
  private:  { name: '个人散户',     ap: 2, offers: 4, factor: [0.66, 1.00], visibleRate: 0.40, hiddenRate: 0.35, tamperRate: 0.12,
              desc: '价格浮动大，容易捡漏，也容易买到隐瞒事故的车', tags: ['可验车', '风险中'] },
  dealer4s: { name: '4S店置换车',   ap: 2, offers: 4, factor: [0.86, 0.96], visibleRate: 0.15, hiddenRate: 0.08, tamperRate: 0,
              desc: '车况相对透明，收购价偏高', tags: ['可验车', '风险低'], catWeights: { family: 35, suv: 30, ev: 20, perf: 7, lux: 8 } },
  auction:  { name: '拍卖平台',     ap: 2, offers: 6, factor: [0.60, 0.85], visibleRate: 0.50, hiddenRate: 0.45, tamperRate: 0.15, blind: true,
              desc: '批量车源价格低，但不能验车，盲盒属性强', tags: ['不可验车', '风险高'] },
  peer:     { name: '同行调货',     ap: 1, offers: 3, factor: [0.90, 0.98], visibleRate: 0.25, hiddenRate: 0.22, tamperRate: 0.08,
              desc: '只花 1 点，快速拿车，利润薄，同行可能隐瞒问题', tags: ['可验车', '省行动点'] },
  wreck:    { name: '事故车拖车场', ap: 1, offers: 4, factor: [0.45, 0.70], visibleRate: 0.80, hiddenRate: 0, tamperRate: 0, severe: true, towFee: 3000,
              desc: '重大事故、泡水火烧车，价格极低，只花 1 点。烂车开不回来，要付拖车费', tags: ['灰色高危', '拖车费'] },
};

/* 整备项目（新增项目只需在这里加一条，再在 game.js 的 service 里处理特殊效果） */
G.SERVICES = {
  clean:   { name: '清洗抛光',     ap: 0, cost: 800,  fixes: ['dirty'] },
  paint:   { name: '钣金补漆',     ap: 1, cost: 6000, fixes: ['scratch'] },
  parts:   { name: '更换易损件',   ap: 1, cost: 4000, fixes: ['tires', 'battery'] },
  inspect: { name: '深度检测',     ap: 1, cost: 1500 },
  repair:  { name: '维修隐患',     ap: 1 },                       // 费用按瑕疵计算
  conceal: { name: '掩盖问题',     ap: 0, cost: 3000, grey: true }, // 黑化按瑕疵计算；偷工减料不花工时
  tamper:  { name: '调表',         ap: 0, cost: 1000, grey: true, dark: 2 },
};

/* 质保 */
G.WARRANTY = {
  none: { name: '无质保',    bonus: 0,    months: 0 },
  m3:   { name: '3个月质保', bonus: 0.03, months: 3 },
  y1:   { name: '1年质保',   bonus: 0.07, months: 12 },
};

/* 客户 */
G.CUSTOMER = {
  willing: [1.00, 1.17],   // 心理价 = 感知价值 × 该区间随机
  darkPenalty: 0,          // 黑化越高，客户越抠门
  specificPref: 0.6,       // 有明确车型偏好的比例
  detect: 0.4,             // 精明客户识破未披露问题的系数
  concealDetectMult: 0.3,  // 被刻意掩盖的问题，识破率再 × 该值
};

/* 结局 */
G.ENDINGS = {
  win_clean: { title: '良心车行连锁大佬', text: '你没靠一台黑车，把小门店做成了全城最有口碑的车行。同行背后骂你傻，客户排队找你买车。' },
  win_grey:  { title: '灰色暴发户',       text: '钱是赚到了，但每次电话响你都会心里一紧。那些卖出去的车，不知道哪天会找上门。' },
  foreclosed: { title: '门店被法拍', text: '月供一拖再拖，银行终于失去了耐心。法院的封条贴在了展厅大门上。' },
  bankrupt:  { title: '破产清算',         text: '资金链断了。库存被低价甩卖，门店贴上了转租告示。' },
  sealed:    { title: '车行被查封',       text: '执法人员封存了全部台账和车辆。你在二手车圈的故事，到此为止。' },
};
