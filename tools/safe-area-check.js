/* env 的变量替代值仅注入隔离测试页；验证最终截图顶部像素，不声称实体iPhone验收。 */
const path=require('path');
module.exports=async function safeAreaCheck(browser,url,out,check,result,prefix,online){
  result.safeArea=[];
  for(const [width,height] of [[390,844],[430,932],[1280,800]]){
    const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:width<500,isMobile:width<500,reducedMotion:'reduce'});
    try{
      const page=await ctx.newPage();
      page.on('pageerror',e=>result.errors.push('安全区 '+e.message));
      page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
      page.on('response',r=>{if(r.status()>=400)result.errors.push(r.status()+' '+r.url());});
      const shot=name=>path.join(out,prefix+(online?'-online':'')+'-safe-'+name+'-'+width+'.png');
      const verify=async name=>{
        await page.waitForLoadState('networkidle');
        const data=await page.evaluate(()=>{
          const shield=document.querySelector('.safe-area-shield'),r=shield.getBoundingClientRect(),style=getComputedStyle(shield),overlay=document.querySelector('.overlay'),modal=document.querySelector('.modal');
          const text=[...document.querySelectorAll('.modal h3,.modal label,.modal button,.month-transition>*')].filter(e=>e.getBoundingClientRect().width>0);
          return {y:r.y,height:r.height,width:r.width,z:+style.zIndex,color:style.backgroundColor,pointer:style.pointerEvents,scroll:scrollY,
            overlay:overlay?{y:overlay.getBoundingClientRect().y,z:+getComputedStyle(overlay).zIndex}:null,
            modal:modal?{y:modal.getBoundingClientRect().y,bottom:modal.getBoundingClientRect().bottom}:null,
            minTextY:text.length?Math.min(...text.map(e=>e.getBoundingClientRect().y)):null};
        });
        check(data.y===0&&data.height===47&&data.width===width&&data.z===9&&data.pointer==='none',width+' '+name+' 固定47px遮挡条');
        if(data.overlay){check(data.overlay.z>data.z&&data.overlay.y>=47,width+' '+name+' 弹窗在遮挡条上层且避开状态栏');check(data.modal.y>=47-.5&&data.modal.bottom<=height+.5,width+' '+name+' 弹窗完整在可用区域');}
        const png=await page.screenshot({path:shot(name)});
        const pixels=await page.evaluate(async data=>{
          const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
          const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=47;const g=c.getContext('2d');g.drawImage(image,0,0);
          const rgba=g.getImageData(0,0,c.width,47).data;let wrong=0;
          for(let i=0;i<rgba.length;i+=4)if(rgba[i]!==17||rgba[i+1]!==18||rgba[i+2]!==21||rgba[i+3]!==255)wrong++;
          return {wrong,total:c.width*47};
        },png.toString('base64'));
        check(pixels.wrong===0,width+' '+name+' 顶部47px逐像素为干净底色');
        result.safeArea.push({width,height,name,...data,...pixels});
      };
      await page.goto(url);await page.waitForLoadState('networkidle');
      const zero=await page.evaluate(()=>({height:document.querySelector('.safe-area-shield').getBoundingClientRect().height,hero:document.querySelector('.keyart').getBoundingClientRect().y}));
      check(zero.height===0&&(width>=1000||Math.abs(zero.hero-16)<.5),width+' 普通模式安全区0且无额外空白');
      await page.addStyleTag({content:':root{--safe-area-top:47px!important}'});
      if(width>=1000)await page.evaluate(()=>{G.newGame('small','suburb',707);G.save();G.state=null;G.render();});
      await verify('start');
      await page.evaluate(()=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)/2));
      await verify('start-scroll');
      if(width<1000){
        await page.evaluate(()=>{const h=[...document.querySelectorAll('.start-options>h3')].find(e=>e.textContent==='门店地段');scrollTo(0,scrollY+h.getBoundingClientRect().y-59);});
        await verify('locations');
      }
      // 实际开始页存档菜单，包含滚动前的锁屏位置。
      await page.locator('[data-act=menu]').click();await verify('start-menu');
      await page.locator('[data-act=menu-close]').first().click();
      // 隔离上下文中生成正常经营页；每个原生弹窗都经同一渲染路径。
      const fixture=async name=>{
        await page.evaluate(name=>{
          G.Tutorial.stop(false);G.newGame('small','suburb',707);
          Object.assign(G.ui,{tab:'store',menu:false,help:false,saveDialog:null,confirm:null,result:null,report:null,settling:false});
          G.state.pending=[];
          if(name==='game')for(let i=0;i<35;i++){
            G.state.history.push({month:i+1,revenue:10000,cogs:5000,opex:1000,profit:4000,cash:5000000,net:5000000,dark:0,rep:50});
            G.state.log.push({m:i+1,type:'info',text:'门店继续经营，核对滚动时的安全区遮挡。'});
          }
          if(name==='save')G.ui.menu=true;
          if(name==='import'||name==='export')G.ui.saveDialog=name;
          if(name==='confirm')G.ui.confirm='restart';
          if(name==='help')G.ui.help=true;
          if(name==='visit')G.act.visit('private');
          if(name==='pledge')G.act.pledgeVisit();
          if(name==='report'){const r=G.act.endMonth();G.ui.report=r.report;G.state.pending=[];}
          if(name==='result')G.ui.result='本月经营结束，接着打理车行。'.repeat(60);
          if(name==='decision'){const e=G.EVENTS.find(e=>!e.setup&&!e.when);G.forceEvent(e.id);}
          if(name==='ending')G.state.over='win';
          if(name==='month')G.ui.settling=true;
          G.render();scrollTo(0,0);
          if(name==='tutorial-visit'){G.Tutorial.start(true);G.act.visit('private');G.render();}
        },name);
      };
      await fixture('game');
      for(const tab of ['buy','stock','team','store','ledger']){
        await page.evaluate(tab=>{G.ui.tab=tab;G.render();scrollTo(0,(document.documentElement.scrollHeight-innerHeight)/2);},tab);
        await verify('game-'+tab+'-scroll');
      }
      const hud=await page.locator('.hud').evaluate(e=>({top:e.getBoundingClientRect().y,padding:parseFloat(getComputedStyle(e).paddingTop)}));
      check(hud.top>=0&&hud.padding>=59,width+' 游戏HUD的文字避开安全区');
      await page.evaluate(()=>G.toast('存档和经营照常，状态栏区域保持干净。'));
      check(await page.locator('#toast').evaluate(e=>e.getBoundingClientRect().y>=47),width+' 提示文字避开安全区');
      await verify('toast');
      await page.evaluate(()=>document.getElementById('toast').className='');
      for(const name of ['save','import','export','confirm','help','visit','pledge','report','result','decision','ending','tutorial-visit','month']){
        await fixture(name);
        await page.evaluate(()=>{const body=document.querySelector('.modal-body');if(body)body.scrollTop=body.scrollHeight/2;});
        await verify(name+'-scroll');
      }
    }finally{await ctx.close();}
  }
};
