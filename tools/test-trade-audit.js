/* 针对议价审计发现的套利、输入边界、真实往返与方案重估回归。 */
const assert = require('node:assert/strict'), path = require('node:path');
for(const f of ['data','util','car','game','staff','finance','events'])require(path.join(__dirname,'..','js',f+'.js'));
const G=globalThis.G; let checks=0;
const check=(ok,msg)=>{assert.ok(ok,msg);checks++;};
function stock(seed=60){G.newGame('small','suburb',seed);const c=G.Car.generate('dealer4s',{hiddenRate:0});c.flaws=[];G.Car.reveal(c);G.addCar(c,30000,'audit');return c;}
function corrupt(fn){const s=JSON.parse(JSON.stringify(G.state));fn(s);assert.throws(()=>G.parseSave(JSON.stringify(s)));checks++;}

G.newGame('small','suburb',61); G.act.visit('private');
for(const key of ['constructor','toString','__proto__',null,{},99]){
 const before=JSON.stringify(G.state);
 check(!G.act.bargainOffer(0,key).ok && JSON.stringify(G.state)===before,'卖家拒绝异常策略且不污染存档：'+String(key));
}
const ordinaryChance=G.chance;G.chance=()=>true;
const firmOffer=G.state.visit.offers[0],firmPrice=G.offerPrice(firmOffer);
G.act.bargainOffer(0,'gentle');G.chance=ordinaryChance;
check(firmOffer.negotiation.floor===1&&G.offerPrice(firmOffer)===firmPrice,'报价实在的卖家可以守价，不再台台轻砍必降');
check(firmOffer.negotiation.message.includes('底')||firmOffer.negotiation.message.includes('一样')||firmOffer.negotiation.message.includes('聊不下去'),'守价时直说不能再降，不显示虚假的让利');
let c=stock(); G.act.meetBuyer(c.id);
for(const key of ['constructor','toString','__proto__']){
 const before=JSON.stringify(G.state);
 check(!G.act.counterBuyer(c.id,key).ok && !G.act.setWarranty(c.id,key).ok && !G.act.setFinance(c.id,key).ok && JSON.stringify(G.state)===before,'异常策略和方案不误入对象原型：'+key);
}
for(const price of [NaN,Infinity,-1]){
 const before=JSON.stringify(G.state); check(!G.act.setPrice(c.id,price).ok&&JSON.stringify(G.state)===before,'无效价格不能污染当前洽谈或存档');
}

// 用高于心理价的挂牌，避免最高报价被原挂牌封顶，真正检查质保/金融的价格贡献。
c=stock(); G.act.setPrice(c.id,G.round(G.Car.value(c,'public')*1.4,100)); G.act.setWarranty(c.id,'y1'); G.act.setFinance(c.id,'private');
G.act.meetBuyer(c.id); let b=c.buyer;
const prior={quote:b.quote,budget:b.budget,rng:G.state.rngState,ap:G.state.ap,rounds:b.rounds,patience:b.patience};
G.act.setWarranty(c.id,'none'); G.act.setFinance(c.id,'none');
check(b.budget<prior.budget && b.quote<prior.quote,'撤掉质保/金融后重新核价，不能保留高配方案的报价');
check(b.terms.warranty==='none'&&b.terms.finance==='none','报价绑定当前实际方案');
check(G.state.rngState===prior.rng&&G.state.ap===prior.ap&&b.rounds===prior.rounds&&b.patience===prior.patience,'重估不重抽预算、不返还轮次或行动点');
const revised=b.quote;
check(G.act.acceptBuyer(c.id).ok&&G.state.sales[0].price===revised&&!G.state.warranties.length&&!G.state.buyerLoans.length,'按重估后的无质保全款报价成交');

c=stock(62); G.act.setPrice(c.id,G.round(G.Car.value(c,'public')*1.4,100));G.act.setWarranty(c.id,'y1');G.act.meetBuyer(c.id);b=c.buyer;
c.warranty='none'; const beforeSale=G.state.cash;
check(!G.act.acceptBuyer(c.id).ok&&G.state.cars.includes(c)&&G.state.cash===beforeSale,'成交前二次核对，未经过界面的条件变化也不能按旧价成交');
check(G.act.acceptBuyer(c.id).ok,'玩家看到新报价后可以再确认成交');

c=stock(63);G.act.meetBuyer(c.id);b=c.buyer;
const original={anchor:b.anchor,budget:b.budget,quote:b.quote,rng:G.state.rngState,willingness:b.willingness};
G.act.setPrice(c.id,c.price*3);
check(b.anchor===original.anchor&&b.quote===original.quote&&b.budget===original.budget,'抬高挂牌不能凭空提高老买家预算');
G.act.setPrice(c.id,Math.floor(b.quote/2));
check(b.quote<=c.price&&b.budget<=c.price,'公开降价后不能向原买家收更高的旧价');
for(let i=0;i<10;i++){G.act.setWarranty(c.id,i%2?'none':'y1');G.act.setFinance(c.id,i%2?'none':'private');}
check(b.willingness===original.willingness&&G.state.rngState===original.rng&&b.rounds===0,'反复改方案不重抽客户或增加轮次');
check(b.history.length<=8&&G.parseSave(JSON.stringify(G.state)).cars.length===1,'反复修改保留有限报价记录且可读档');
check(b.quote<=b.budget&&b.budget<=b.anchor,'反复修改不产生高于预算的承诺价');

c=stock(64); c.inspected=false;c.flaws=[{id:'flood',known:false,concealed:false,fixed:false}];G.refreshAutoPrices();
const chance=G.chance;G.chance=()=>false;G.act.meetBuyer(c.id);G.chance=chance;b=c.buyer;
const oldQuote=b.quote,oldBudget=b.budget,oldRound=b.rounds;
check(G.act.service(c.id,'inspect').ok&&b.quote<oldQuote&&b.budget<oldBudget,'接待后验出泡水问题，自动压低旧报价');
check(b.rounds===oldRound&&b.terms.value===G.Car.value(c,'public'),'整备检测后的报价依据与已知车况一致');

// 旧版议价记录没有估价偏好和条件快照，也可原价续谈，不重抽客户。
c=stock(65);G.act.meetBuyer(c.id);b=c.buyer;delete b.willingness;delete b.terms;delete b.history;
G.state=G.parseSave(JSON.stringify(G.state));c=G.state.cars[0];b=c.buyer;
const legacy={quote:b.quote,budget:b.budget,rng:G.state.rngState,ap:G.state.ap};G.act.meetBuyer(c.id);
check(b.quote===legacy.quote&&b.budget===legacy.budget&&G.state.rngState===legacy.rng&&G.state.ap===legacy.ap,'上一版中途议价记录保留报价和行动点');
check(b.terms&&Number.isFinite(b.willingness),'旧议价记录补全条件快照后可继续核价');
corrupt(s=>s.cars[0].buyer.history=[{round:4,ask:1,quote:1,text:'bad'}]);
corrupt(s=>s.cars[0].buyer.terms.warranty='invalid');
corrupt(s=>s.cars[0].buyer.willingness=-1);

// 同样有足额预算，精打细算型会先还价，爽快型可以快速成交。
for(const style of [0,1]){
 c=stock(66);G.act.meetBuyer(c.id);b=c.buyer;Object.assign(b,{style,anchor:100000,budget:100000,quote:80000,patience:4});
 G.act.counterBuyer(c.id,'gentle');
 check(style===0?b.status==='agreed':b.status==='talking'&&b.quote>80000&&b.quote<85000,'性格影响实际让步速度，不只换文案');
 if(style===1){
  G.act.counterBuyer(c.id,'firm');check(b.status==='talking'&&b.rounds===2,'第二轮仍可来回还价');
  G.act.counterBuyer(c.id,'hard');check(b.status==='agreed'&&b.rounds===3&&b.quote===100000,'三轮合理拉扯后能谈到对方可承受的价');
  check(b.history.length===4&&b.history[1].text!==b.history[2].text,'保留开价与往返记录，文案随轮次变化');
  check(G.parseSave(JSON.stringify(G.state)).cars[0].buyer.history.length===4,'完整报价记录随存档保留');
 }
}
c=stock(67);G.act.meetBuyer(c.id);b=c.buyer;Object.assign(b,{style:0,anchor:100000,budget:81000,quote:81000,patience:4});
G.act.counterBuyer(c.id,'gentle');check(b.quote===81000&&b.message.includes('最多'),'买家不再加钱时明确表示守价，不假装加价');
check(G.fmtTrade(1000000)!==G.fmtTrade(1000100)&&G.fmtTrade(123400)==='12.34万','报价精确到百元，不同报价不会显示成相同金额');
check(G.fmtTrade(123456)==='12.3456万','旧档有非整百金额时仍能显示准确报价');

let firstDeals=0,repeat=0,walks=0;
for(let seed=1000;seed<1300;seed++){
 c=stock(seed);G.act.meetBuyer(c.id);b=c.buyer;G.act.counterBuyer(c.id,'gentle');
 if(b.status==='agreed')firstDeals++;if(b.status==='talking')repeat++;
 for(let i=1;i<3&&b.status==='talking';i++)G.act.counterBuyer(c.id,'gentle');
 if(b.status==='left')walks++;
 check(b.quote<=b.budget&&b.budget<=b.anchor,'配对样本报价始终不超预算');
}
check(firstDeals>0&&firstDeals<270&&repeat>60,'默认车况下兼有爽快成交与多轮还价，消除100%一轮必成');
check(walks<90,'温和谈价的离场风险保持有限');

c=stock(68);G.act.meetBuyer(c.id);G.forceEvent('lowball');
const locked=JSON.stringify(G.state);
check([()=>G.act.setPrice(c.id,100),()=>G.act.suggestPrice(c.id),()=>G.act.setWarranty(c.id,'y1'),()=>G.act.setFinance(c.id,'private')].every(f=>!f().ok)&&JSON.stringify(G.state)===locked,'待办期间不可绕过决策修改当前交易条件');
console.log(`${checks} 项议价审计回归检查通过（含300个配对样本）。`);
