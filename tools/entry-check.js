/* 回访直接继续，新局单独设置；浏览与取消均不改存档。 */
const fs=require('fs'),path=require('path');
module.exports=async function(browser,url,out,check,result,prefix,online){
 for(const [width,height]of[[375,667],[390,844],[430,932],[1280,800]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<500,isMobile:width<500,reducedMotion:'reduce'});
  try{
   const p=await ctx.newPage();p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)result.errors.push(r.status()+' '+r.url());});
   const click=act=>p.locator('[data-act="'+act+'"]').first().click();
   const shot=async name=>{await p.waitForLoadState('networkidle');await p.screenshot({path:path.join(out,prefix+(online?'-online':'')+'-entry-'+name+'-'+width+'.png')});};
   await p.goto(url);await p.waitForLoadState('networkidle');
   check(await p.locator('.start').count()===1&&await p.locator('.return-entry').count()===0,width+' 首次进入直接设置新局');
   await click('start');await p.locator('[data-tutorial=skip]').click();
   const before=await p.evaluate(()=>{
    for(let i=0;i<2;i++){G.act.endMonth();while(G.cleanPending())G.act.decide(G.currentDecision().options.findIndex(o=>!o.disabled));}
    G.save();G.SaveSlots.save(2);return {state:JSON.stringify(G.state),slot:G.SaveSlots.get(2).raw};
   });
   await p.reload();await p.waitForLoadState('networkidle');
   check(await p.locator('.return-entry').count()===1&&await p.locator('.start,.keyart,input[name=diff],input[name=loc]').count()===0,width+' 回访进入继续页且没有旧开屏和配置');
   check((await p.locator('.resume-details').innerText()).includes('第 3 月'),width+' 回访摘要展示上次经营月份');
   check(await p.evaluate(()=>!G.state),width+' 浏览摘要不启动或结算游戏');
   check(await p.evaluate(()=>localStorage.getItem(G.SAVE_KEY))===before.state&&await p.evaluate(()=>G.SaveSlots.get(2).raw)===before.slot,width+' 回访不改自动档及手动档');
   check(await p.locator('[data-act=continue]').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight-8),width+' 继续按钮在首屏');
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),width+' 回访页无横向溢出');await shot('return');
   await click('entry-new');check(await p.locator('.start').count()===1&&await p.locator('.return-entry,[data-act=continue]').count()===0,width+' 新开一局进入独立配置页');
   await p.locator('input[name=diff][value=mid]').check();await p.locator('input[name=loc][value=city]').check();
   check(await p.evaluate(()=>{const a=document.querySelector('[data-act=entry-continue]').getBoundingClientRect(),b=document.querySelector('.toolbar button').getBoundingClientRect();return a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y;}),width+' 新局返回按钮与菜单互不遮挡');
   await shot('new');await click('start');
   check(await p.locator('.confirm-dialog').count()===1&&await p.evaluate(()=>localStorage.getItem(G.SAVE_KEY))===before.state,width+' 确认开张前保留自动进度');
   await click('confirm-no');check(await p.locator('input[name=diff][value=mid]').isChecked()&&await p.locator('input[name=loc][value=city]').isChecked(),width+' 取消开张保留资金和地段选择');
   await click('entry-continue');check(await p.locator('.return-entry').count()===1&&await p.evaluate(()=>localStorage.getItem(G.SAVE_KEY))===before.state,width+' 可从新局设置返回继续页且不改旧进度');
   await click('continue');check(await p.evaluate(()=>JSON.stringify(G.state))===before.state,width+' 一次点击精确续玩原状态');
   check(await p.locator('#tutorial-card').count()===0,width+' 续玩不重播引导');
   await p.reload();await click('entry-new');await p.locator('input[name=diff][value=mid]').check();await p.locator('input[name=loc][value=city]').check();await click('start');await click('confirm-yes');
   check(await p.evaluate(()=>G.state.month===1&&G.state.diffId==='mid'&&G.state.store.location==='city'),width+' 确认新局采用所选资金与地段');
   check(await p.evaluate(()=>G.SaveSlots.get(2).raw)===before.slot,width+' 新开局保留手动旧档');
   await p.reload();check((await p.locator('.resume-details').innerText()).includes('第 1 月'),width+' 新局后回访展示新的自动续玩');
   await p.evaluate(()=>localStorage.setItem(G.SAVE_KEY,'broken-auto'));await p.reload();
   check(await p.locator('.return-entry .resume-empty').count()===1&&await p.locator('[data-act=continue]').count()===0,width+' 损坏自动档不盲目续玩');
   check(await p.evaluate(()=>localStorage.getItem(G.SAVE_KEY))==='broken-auto',width+' 查看坏档提示不删除原文');
   await click('menu');check(await p.locator('.save-slot[data-slot="2"] [data-act=slot-load]').isEnabled(),width+' 坏自动档仍可选择手动档继续');
   await p.evaluate(()=>localStorage.removeItem(G.SAVE_KEY));await p.reload();
   check(await p.locator('.return-entry').count()===1&&await p.locator('.start').count()===0,width+' 只有手动档也进入继续页');
   check((await p.locator('.resume-empty').innerText()).includes('手动档位'),width+' 手动档入口说明清晰');await shot('manual-only');
  }finally{await ctx.close();}
 }
};
