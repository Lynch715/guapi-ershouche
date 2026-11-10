/* 三档、旧档迁移及写入失败保护。node tools/test-save-slots.js */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let checks=0;
function check(value,msg){assert.ok(value,msg);checks++;}
function app(initial={},block={}){
 const data=new Map(Object.entries(initial));
 const localStorage={getItem(k){if(block.read)throw Object.assign(new Error('read denied'),{name:'SecurityError'});return data.get(k)??null;},setItem(k,v){if(block.write||block.writeKey===k)throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});data.set(k,String(v));},removeItem(k){data.delete(k);}};
 const ctx=vm.createContext({console,localStorage});
 for(const f of ['data','util','car','game','staff','finance','events','save-slots'])vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),ctx);
 return {G:ctx.G,data,block};
}
const primary='usedcar_sim_save_v1',marker='usedcar_sim_slots_migrated_v1';
const {G:seed}=app();seed.newGame('small','suburb',888);seed.act.visit('private');seed.act.inspectVisit();seed.act.buyOffer(0);seed.act.closeVisit();
const legacy=JSON.stringify(seed.state);
let {G,data,block}=app({[primary]:legacy});
check(G.SaveSlots.list().length===3,'默认恰好三个档位');
check(G.SaveSlots.get(1).status==='ready'&&G.SaveSlots.get(1).legacy,'旧自动存档备份到档位1');
check(G.SaveSlots.export(1).text===legacy&&data.get(primary)===legacy,'迁移保持原始旧档和自动续玩逐字节不变');
check(G.SaveSlots.get(2).empty&&G.SaveSlots.get(3).empty,'其他两个档位为空');
check(G.SaveSlots.resume().status==='ready'&&G.SaveSlots.resume().summary.month===1,'回访摘要可识别旧自动进度');
check(data.get(primary)===legacy&&G.state===undefined,'读取回访摘要不提交状态或写存储');
const migrated=data.get(G.SaveSlots.key(1));G.SaveSlots.init();check(data.get(G.SaveSlots.key(1))===migrated,'重复迁移不覆盖');
G.load();const originalState=JSON.stringify(G.state);
const old=JSON.parse(legacy);delete old.staff;delete old.candidates;delete old.startedAt;
check(G.SaveSlots.import(2,JSON.stringify(old),null).ok,'旧版本存档可导入指定档位');
check(JSON.stringify(G.state)===originalState&&data.get(primary)===legacy,'导入档位不替换当前局与自动续玩');
check(G.SaveSlots.load(2).ok&&G.state.startedAt===null,'旧档位可读取并迁移');
G.act.endMonth();while(G.cleanPending())G.act.decide(G.currentDecision().options.findIndex(o=>!o.disabled));G.save();
const progressed=JSON.stringify(G.state);check(G.SaveSlots.export(1).text===legacy,'自动保存和月结不覆盖手动快照');
check(G.SaveSlots.save(3,null).ok,'当前进度可选择保存到档位3');
check(G.SaveSlots.export(3).text===progressed,'导出指定档位而非任意当前局');
G.newGame(G.CONFIG.difficulties[1].id,'city',999);G.save();
check(G.SaveSlots.export(1).text===legacy&&G.SaveSlots.export(3).text===progressed,'新开局保留所有档位');
const beforeAll=JSON.stringify([...data]),beforeState=JSON.stringify(G.state);
for(const bad of ['bad-json','{}',JSON.stringify({...JSON.parse(legacy),cars:[{}]}),JSON.stringify({...JSON.parse(legacy),cash:'NaN'}),JSON.stringify({...JSON.parse(legacy),pending:[{type:'fake',data:{}}]})]){
 check(!G.SaveSlots.import(2,bad).ok,'坏存档被拒绝');
 check(JSON.stringify([...data])===beforeAll&&JSON.stringify(G.state)===beforeState,'坏存档不改任何档位、自动续玩或当前局');
}
for(const id of [0,4,NaN,'1']){
 check(!G.SaveSlots.save(id).ok&&!G.SaveSlots.load(id).ok&&!G.SaveSlots.import(id,legacy).ok&&!G.SaveSlots.export(id).ok,'非法档位编号被拒绝');
}
block.write=true;
check(!G.SaveSlots.save(2).ok&&!G.SaveSlots.import(2,legacy).ok&&!G.SaveSlots.load(1).ok,'配额不足时保存、导入、读取都报告失败');
check(JSON.stringify([...data])===beforeAll&&JSON.stringify(G.state)===beforeState,'写入失败保留全部存档与当前局');
block.write=false;block.read=true;
check(G.SaveSlots.resume().status==='unavailable','回访页识别存储不可用');
check(G.SaveSlots.list().every(s=>s.status==='unavailable'),'存储受限时仍提供三个可解释的档位');
check(!G.SaveSlots.save(2).ok&&!G.SaveSlots.load(1).ok,'存储受限不会替换进度');block.read=false;
const expected=G.SaveSlots.get(2).raw;
check(G.SaveSlots.import(2,legacy,expected).ok,'首次确认时目标一致可保存');
const changed=data.get(G.SaveSlots.key(2));
check(!G.SaveSlots.save(2,expected).ok&&!G.SaveSlots.import(2,progressed,expected).ok&&!G.SaveSlots.load(2,expected).ok,'等待确认时其他标签改档位会阻止过期操作');
check(data.get(G.SaveSlots.key(2))===changed,'冲突时不覆盖较新的档位');
data.set(G.SaveSlots.key(2),'broken-slot');const corruptBefore=JSON.stringify([...data]);
check(G.SaveSlots.get(2).status==='invalid'&&!G.SaveSlots.load(2).ok,'损坏档位不能读取');
check(G.SaveSlots.export(2).text==='broken-slot'&&JSON.stringify([...data])===corruptBefore,'损坏内容可导出恢复且不会静默删除');
check(G.SaveSlots.get(1).status==='ready'&&G.SaveSlots.get(3).status==='ready','单一损坏不会影响其他档位');
const restart=app(Object.fromEntries(data));
check(restart.G.SaveSlots.export(1).text===legacy&&restart.G.SaveSlots.export(3).text===progressed,'刷新后仍是独立持久化的三个档位');
let broken=app({[primary]:'bad-old-save'});
check(broken.G.SaveSlots.resume().status==='invalid','回访识别损坏自动档，仍保留原文');
check(broken.data.get(primary)==='bad-old-save'&&broken.G.SaveSlots.error&&broken.G.SaveSlots.get(1).empty,'损坏旧自动档保留原文并显示错误');
let quota=app({[primary]:legacy},{writeKey:marker});
check(quota.G.SaveSlots.export(1).text===legacy&&quota.data.get(primary)===legacy,'迁移写标记失败仍保留旧档和备份');
const backup=quota.data.get(quota.G.SaveSlots.key(1));quota.block.writeKey=null;quota.G.SaveSlots.init();
check(quota.data.get(quota.G.SaveSlots.key(1))===backup,'重试迁移不会重复覆盖档位1');
let occupied=app({[primary]:progressed,[G.SaveSlots.key(1)]:migrated});
check(occupied.G.SaveSlots.export(1).text===legacy,'升级发现已有档位1时不覆盖');
let blank=app();check(blank.G.SaveSlots.resume().status==='empty','新玩家没有回访进度');blank.G.newGame('small','suburb',55);blank.G.save();blank.G.SaveSlots.init();
check(blank.G.SaveSlots.list().every(s=>s.empty),'首次安装后的新自动档不会擅自占用手动档位');
console.log(checks+' 项三档存档断言通过。');
