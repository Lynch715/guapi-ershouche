/* Comprehensive-audit regressions: exercise outcomes, accounting and old-save recovery. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
for(const f of ['data','util','car','game','staff','finance','events','art'])require(path.join(__dirname,'..','js',f+'.js'));
const G=globalThis.G;let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=seed=>G.newGame('small','suburb',seed||1001);
function stock(flaws=[],catId='family'){
 const c=G.Car.generate('private',{catId,hiddenRate:0});c.newPrice=500000;c.year=2025;c.mileage=c.mileageShown=20000;
 c.flaws=flaws.map(id=>({id,known:false,concealed:false,fixed:false}));G.addCar(c,100000,'审计合成车源');return c;
}
const out=path.resolve(__dirname,'../_screens/audit-fix-20261110');fs.mkdirSync(out,{recursive:true});

// Every event sale path must use the same budget ceiling, including fees derived from sales.
for(const [id,option,count,cat] of [['lowball',0,1,'family'],['referral',0,2,'family'],['referral',1,2,'family'],['trade_in',0,1,'family'],['trade_in',1,1,'family'],['trade_in',2,1,'family'],['vip_fleet',0,3,'family'],['collector',0,1,'classic'],['yinyang_contract',0,1,'family'],['yinyang_contract',1,1,'family']]){
 fresh();G.state.store.level=2;
 const budgets=new Map();for(let i=0;i<count;i++){const c=stock([],cat);G.act.setPrice(c.id,200000000);budgets.set(c.id,G.eventSalePrice(c,Infinity,id==='collector'));}
 G.forceEvent(id);const oldChance=G.chance;G.chance=()=>true;
 const result=G.act.decide(option);G.chance=oldChance;
 check(result.ok,id+' decision works');
 check(id==='referral'&&option===1 ? G.state.sales.length===0 : G.state.sales.length>0,id+' sells within budget or refuses an unaffordable firm price');
 check(G.state.sales.every(s=>s.price<=budgets.get(s.carId)),id+' respects value and budget');
 check(!G.state.over&&G.netWorth()<G.state.goal,id+' does not win from a fabricated listing');
 if(id==='yinyang_contract'&&option===0){const sale=G.state.sales[0];check(G.state.month_.revenue===sale.price+G.round(sale.price*0.03,100),'extra fee uses actual price, not listing');}
 check(G.parseSave(JSON.stringify(G.state)).sales.length===G.state.sales.length,id+' save remains readable');
}
fresh(1008);G.act.visit('private');G.act.buyOffer(0);G.act.closeVisit();G.act.setPrice(G.state.cars[0].id,200000000);G.act.endMonth();
check(G.state.pending[0].data.id==='lowball','seed 1008 reaches the original exploit without forced cards');
G.act.decide(0);check(!G.state.over&&G.state.sales[0].price<200000,'seed 1008 no longer yields 180 million');

// One refund closes the entire sale and cannot consume unrelated pending decisions.
fresh();let c=stock(['gearbox','mileage']);c.warranty='y1';c.finance='private';
G.sellRetail(c,200000);let s=G.state;const sale=s.sales[0],cash=s.cash,bombs=clone(s.bombs);
s.pending=[...bombs.map(b=>({type:'complaint',data:b})),{type:'buyerDefault',data:{names:[c.name,'另一位买家'],loss:150000,items:[{saleId:sale.id,name:c.name,loss:140000},{saleId:s.nextId++,name:'另一位买家',loss:10000}]}},{type:'event',data:{id:'hot_model',ctx:{cat:'family'}}}];
check(G.act.decide(0).ok,'refund resolves');
check(s.cars.length===1&&s.cash===cash-sale.price,'refund returns one vehicle and pays once');
check(!s.bombs.length&&!s.warranties.length&&!s.buyerLoans.length,'refund clears bombs, warranty and buyer loan');
check(s.cars[0].inspected&&s.cars[0].flaws.every(f=>f.known&&!f.concealed),'returned vehicle is genuinely fully inspected');
check(s.pending.length===2&&s.pending[0].type==='buyerDefault'&&s.pending[0].data.loss===10000,'refund removes related default but retains another buyer');
check(s.pending[1].data.id==='hot_model','refund does not shift away the next unrelated event');
check(G.parseSave(JSON.stringify(s)).cars.length===1,'refund save parses');
G.act.decide(2);G.act.decide(0);const after=s.cash;
s.pending=[{type:'complaint',data:bombs[1]}];
check(G.cleanPending()===0&&s.cash===after,'stale duplicate complaints are discarded without another refund');

// A later sale of the same physical car has a different lifecycle and may be refunded once.
c=s.cars[0];c.flaws.forEach(f=>{f.known=true;f.concealed=true;});G.sellRetail(c,150000);
const later=clone(s.bombs[0]);s.pending=[{type:'complaint',data:later}];
check(G.act.decide(0).ok&&s.cars.length===1&&s.returnedSales.length===2,'reselling a returned vehicle does not inherit the old refund lock');

// Recover only the recognizable historical duplicate-return bug; reject arbitrary duplicate IDs.
fresh();c=stock(['gearbox','mileage']);G.sellRetail(c,200000);s=G.state;
const legacySale=s.sales[0],copies=clone(s.bombs).map(b=>{const x=b.car;x.cost=legacySale.price;x.inspected=true;x.warranty='none';x.autoPrice=true;x.flaws.find(f=>f.id===b.flawId).known=true;return x;});
s.cars=copies;s.bombs=[];delete s.returnedSales;s.log.unshift({m:1,type:'event',text:`「${c.name}」退车退款 ${G.fmt(legacySale.price)}，车辆回到库存`});
const originalLegacy=JSON.stringify(s),live=G.state,rng=s.rngState,oldCash=s.cash;
const recovered=G.parseSave(originalLegacy);
check(recovered.cars.length===1&&recovered.cars[0].flaws.every(f=>f.known),'legacy duplicate returns merge knowledge into one vehicle');
check(recovered.cash===oldCash&&recovered.rngState===rng,'legacy recovery does not guess cash adjustments or advance RNG');
check(G.state===live&&JSON.stringify(live)===originalLegacy,'legacy recovery does not mutate the currently running game');
check(G.parseSave(JSON.stringify(recovered)).cars.length===1,'repaired legacy save is stable on a second import');
const broken=clone(s);broken.cars[1].year--;assert.throws(()=>G.parseSave(JSON.stringify(broken)));checks++;
fs.writeFileSync(path.join(out,'recovered-return-save.json'),JSON.stringify(recovered,null,2));

// Month-end inspection may seal the game and must not erase the terminal state by decay.
fresh();s=G.state;s.dark=95;
for(let i=0;i<3;i++)s.sales.push({id:s.nextId++,month:1,name:'审计销售',price:200000,cost:100000,concealed:true,audited:false});
const rand=G.rand;G.rand=()=>0;let report=G.act.endMonth().report;G.rand=rand;
check(s.over==='sealed'&&s.dark===100,'inspection seals at 100 before decay');
check(report.darkChange===5&&s.history[0].dark===100,'terminal report and history agree on blackening');
check(!G.act.endMonth().ok&&!G.act.decide(0).ok,'terminal games cannot continue through pending decisions');

fresh();c=stock();G.forceEvent('peer_price_war');const beforePrice=c.price;G.act.decide(0);const reduced=c.price;G.refreshAutoPrices();
check(reduced<beforePrice&&c.price===reduced&&c.autoPrice===false,'event markdown survives automatic refresh');
check(G.act.suggestPrice(c.id).ok&&c.autoPrice,'players can explicitly restore automatic pricing');

// All sale channels feed one monthly ledger; financed fees do not create fake vehicle rows.
fresh();s=G.state;c=stock();G.forceEvent('lowball');G.act.decide(0);
const peer=stock();G.act.sellToPeer(peer.id);report=G.act.endMonth().report;
check(report.sales.length===2&&report.sales.some(x=>x.type==='event')&&report.sales.some(x=>x.type==='peer'),'report includes event retail and wholesale exactly once');
check(report.sales.reduce((sum,x)=>sum+x.price,0)===report.revenue,'unfinanced report rows reconcile to revenue');
check(s.month_.transactions===undefined&&G.monthSales().length===0,'new month starts with an empty sales ledger');

// Import strips unsafe rendering fields while preserving text as inert text data.
fresh();s=clone(G.state);
s.month_.negotiatedSales=[{name:'<img src=x onerror=alert(1)>',price:10000,profit:2000,warranty:'',art:'<img src=x onerror=alert(1)>',extra:'<svg onload=alert(1)>'}];
s.month_.opexBy={'<b id="audit-html-marker">审计标记</b>':100};
let parsed=G.parseSave(JSON.stringify(s));
check(!('art' in parsed.month_.negotiatedSales[0])&&!('extra' in parsed.month_.negotiatedSales[0]),'import reconstructs sale rows from allowed data fields');
check(parsed.month_.negotiatedSales[0].name===s.month_.negotiatedSales[0].name,'literal player text is retained for escaped rendering');
s.month_.opexBy['坏账目']='100';assert.throws(()=>G.parseSave(JSON.stringify(s)));checks++;
fresh();s=clone(G.state);s.candidates[0].gender='m" onerror="alert(1)';assert.throws(()=>G.parseSave(JSON.stringify(s)));checks++;
fresh();G.forceEvent('talent_walkin');s=clone(G.state);s.pending[0].data.ctx.cand.gender='m" onerror="alert(1)';assert.throws(()=>G.parseSave(JSON.stringify(s)));checks++;
check(['m','f'].includes(G.Art.staffGender(s.pending[0].data.ctx.cand)),'avatar renderer independently rejects an unsafe gender path');
fresh();G.forceEvent('lucky_find');s=clone(G.state);s.pending[0].data.ctx.car.color='bad';assert.throws(()=>G.parseSave(JSON.stringify(s)));checks++;

// New hires, including event hires, start all effects and payroll in the next month.
fresh();s=G.state;let e=G.Staff.makeCandidate({role:'tech',level:3});s.candidates=[e];G.act.hire(e.id);
check(G.Staff.refurbMult()===1&&G.Staff.payroll()===0&&G.maxAp()===6,'new hire has no current-month discount, pay or AP effect');
check(e.startsMonth===2&&!G.EVENT_MAP.tech_sells_parts.when(s),'pending hire is not eligible for at-work misconduct events');
const hireSalary=e.salary;report=G.act.endMonth().report;
check(!report.opexBy['员工工资']&&G.Staff.payroll()===hireSalary&&G.Staff.refurbMult()===0.7&&s.ap===7,'all hire effects activate together at next-month opening');
check(e.tenure===0,'start of first working month is not counted as a completed month');
delete e.startsMonth;parsed=G.parseSave(JSON.stringify(s));G.state=parsed;
check(G.Staff.refurbMult()===0.7&&G.Staff.payroll()===hireSalary,'existing staff in old saves stay active');

fresh();s=G.state;c=stock();G.removeCar(c);s.pending=[{type:'pledgeDispute',data:{id:s.nextId++,client:'审计车主',car:c,amount:100000,rate:0.03,term:1,monthsLeft:0,double:true,checked:true}}];
G.act.decide(2);check(s.cars[0].cost===100000&&s.month_.opex===30000,'settlement fee is expensed without being capitalized again');
G.act.sellToPeer(c.id);check(s.month_.cogs+s.month_.opex===130000,'lifetime cost recognizes principal plus settlement only once');

fresh();s=G.state;s.cash=130000000;s.dark=99;s.store.level=5;s.store.location='autocity';
for(let i=0;i<180;i++)s.sales.push({id:s.nextId++,month:1,name:'审计销售',price:200000,cost:100000,concealed:true,audited:false});
check(G.inspectChance()===1,'displayed and actual inspection probability is capped at 100%');
s.over='win';s.dark=29;s.stats.greyOps=100;
check(!G.endingInfo().text.includes('没靠一台黑车'),'clean ending does not invent a spotless history');
console.log(`${checks} 项全面审计修复回归通过。`);
fs.writeFileSync(path.join(out,'engine-regression.json'),JSON.stringify({checks,passed:true},null,2));
