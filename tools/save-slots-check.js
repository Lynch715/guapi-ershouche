/* 三档 UI、导入导出和自动续玩隔离；仅使用新建浏览器上下文。 */
const fs=require('fs'),path=require('path');
module.exports=async function(browser,url,out,check,result,prefix,online){
 const primary='usedcar_sim_save_v1';
 for(const [width,height] of [[390,844],[430,932],[1280,800]]){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'});
  try{
   const p=await ctx.newPage();p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)result.errors.push(r.status()+' '+r.url());});
   const click=act=>p.locator('[data-act="'+act+'"]').first().click();
   const slot=(id,act)=>p.locator(`.save-slot[data-slot="${id}"] [data-act="slot-${act}"]`);
   const shot=async name=>{await p.waitForLoadState('networkidle');await p.waitForFunction(()=>!document.querySelector('#toast.show'));await p.screenshot({path:path.join(out,prefix+(online?'-online':'')+'-slots-'+name+'-'+width+'.png')});};
   await p.goto(url);await click('menu');
   check(await p.locator('.save-slot').count()===3,width+' 默认三个档位');
   check(await p.locator('.save-slot.is-empty').count()===3,width+' 首次安装三个空档');
   check(await slot(1,'save').isDisabled()&&await slot(1,'load').isDisabled()&&await slot(1,'export').isDisabled(),width+' 未开局空档位不可保存读取导出');
   await shot('empty');await click('menu-close');
   // 模拟已有旧自动档升级，而非写入真实浏览器存档。
   const legacy=await p.evaluate(()=>{G.newGame('small','suburb',888);G.act.visit('private');G.act.inspectVisit();G.act.buyOffer(0);G.act.closeVisit();G.save();localStorage.removeItem('usedcar_sim_slots_migrated_v1');return JSON.stringify(G.state);});
   await p.reload();await click('menu');
   check((await p.locator('.save-slot[data-slot="1"]').innerText()).includes('原来的自动存档'),width+' 旧档自动备份到档位1且可见');
   check(await p.evaluate(()=>G.SaveSlots.export(1).text)===legacy,width+' 旧档原文不变');
   await slot(1,'load').click();await click('confirm-no');check(await p.evaluate(()=>!G.state),width+' 取消读取不启动游戏');
   await slot(1,'load').click();await click('confirm-yes');check(await p.evaluate(()=>JSON.stringify(G.state))===legacy,width+' 档位1可以读取继续');
   await click('menu');
   for(const id of [2,3]){
    await p.evaluate(()=>{G.act.endMonth();while(G.cleanPending())G.act.decide(G.currentDecision().options.findIndex(o=>!o.disabled));G.save();G.render();});
    await slot(id,'save').click();check((await p.locator(`.save-slot[data-slot="${id}"]`).innerText()).includes('第 '+id+' 月'),width+' 可选择保存到档位'+id);
   }
   const all=await p.evaluate(()=>G.SaveSlots.list().map(s=>s.data));
   check(all[0]===legacy&&JSON.parse(all[1]).month===2&&JSON.parse(all[2]).month===3,width+' 三个档位是独立快照');
   await p.locator('.save-menu .modal-body').evaluate(e=>e.scrollTop=0);await shot('filled');
   for(const id of [1,2,3]){
    await slot(id,'export').click();check(await p.locator('#save-text,[data-act="save-copy"]').count()===0,width+' 档位导出只提供文件');
    const downloading=p.waitForEvent('download');await click('save-download');const d=await downloading;
    check(fs.readFileSync(await d.path(),'utf8')===all[id-1]&&d.suggestedFilename().includes('档位'+id)&&d.suggestedFilename().endsWith('.json'),width+' 档位'+id+' JSON文件名及内容正确');await click('save-close');
   }
   await slot(1,'save').click();check((await p.locator('.confirm-dialog').innerText()).includes('覆盖档位 1'),width+' 覆盖显示目标档位');await click('confirm-no');
   check(await p.evaluate(()=>G.SaveSlots.export(1).text)===legacy,width+' 取消覆盖保留原档');
   await click('save-import');await p.locator('#save-slot').selectOption('2');check(await p.locator('[data-act="save-apply"]').isDisabled(),width+' 未选择文件时不可导入');await p.locator('#save-file').setInputFiles({name:'损坏.json',mimeType:'application/json',buffer:Buffer.from('wrong-json')});await p.waitForFunction(()=>!G.ui.fileReading&&G.ui.importData);await click('save-apply');
   check((await p.locator('#save-error').innerText()).includes('不完整'),width+' 损坏导入可解释');
   check(await p.evaluate(()=>G.SaveSlots.export(2).text)===all[1],width+' 损坏导入不改目标档位');
   await p.locator('#save-file').setInputFiles({name:'备份.json',mimeType:'application/json',buffer:Buffer.from(legacy)});
   await p.waitForFunction(text=>!G.ui.fileReading&&G.ui.importData===text,legacy);
   check(await p.locator('#save-slot').inputValue()==='2',width+' 选文件重绘后保留目标档位');await shot('import');
   await click('save-apply');await shot('confirm');await click('confirm-no');
   check(await p.evaluate(()=>G.SaveSlots.export(2).text)===all[1],width+' 取消导入保留原档');
   await click('save-apply');const current=await p.evaluate(()=>JSON.stringify(G.state));await click('confirm-yes');
   check(await p.evaluate(()=>G.SaveSlots.export(2).text)===legacy,width+' 导入文件到指定档位2');
   check(await p.evaluate(()=>JSON.stringify(G.state))===current&&await p.evaluate(key=>localStorage.getItem(key),primary)===current,width+' 导入不替换当前局和自动续玩');
   check(await p.evaluate(()=>G.SaveSlots.export(1).text)===all[0]&&await p.evaluate(()=>G.SaveSlots.export(3).text)===all[2],width+' 导入不影响其他档位');
   await slot(3,'load').click();await click('confirm-yes');check(await p.evaluate(()=>G.state.month)===3,width+' 可读取档位3');
   await p.reload();await click('continue');check(await p.evaluate(()=>G.state.month)===3,width+' 刷新可自动续玩');
   await click('menu');await click('new-game');await click('confirm-yes');
   check(await p.locator('.start').count()===1,width+' 新开局回到开始页');await click('start');
   if(await p.locator('[data-tutorial="skip"]').count())await p.locator('[data-tutorial="skip"]').click();await click('menu');
   check(await p.evaluate(()=>G.SaveSlots.export(3).text)===all[2]&&await p.evaluate(()=>G.state.month)===1,width+' 新开局不删除手动档');
   await slot(3,'load').click();await click('confirm-yes');check(await p.evaluate(()=>G.state.month)===3,width+' 新开局后仍能切回原档');
   const geometry=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth}));check(!geometry.overflow,width+' 三档全流程无横向溢出');
  }finally{await ctx.close();}
 }
};
