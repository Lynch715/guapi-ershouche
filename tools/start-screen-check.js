/* 开始页验收：桌面居中/首图高度、单选点击与键盘，以及可选的手机基线。 */
const fs=require('fs'),path=require('path');
module.exports=async function startScreenCheck(page,width,height,out,check,result,prefix,online){
  const data=await page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    return {start:box(document.querySelector('.start')),hero:box(document.querySelector('.keyart')),options:box(document.querySelector('.start-options')),menu:box(document.querySelector('.toolbar')),
      last:box(document.querySelector('[data-act=start]')),source:document.querySelector('.keyart img').currentSrc,
      boxes:[...document.querySelectorAll('.start,.keyart,.keyart-copy,.start-options,.pick,.start h3,.start button')].map(e=>box(e)),
      radios:[...document.querySelectorAll('.start input[type=radio]')].map(e=>{const base=getComputedStyle(e),ring=getComputedStyle(e,'::before'),dot=getComputedStyle(e,'::after');return {checked:e.checked,hit:box(e),background:base.backgroundColor,border:ring.borderColor,borderWidth:ring.borderWidth,opacity:dot.opacity};})};
  });
  const label=width+'×'+height;
  check(data.radios.every(r=>r.hit.width>=44&&r.hit.height>=44),label+' 单选保留44px点击区');
  check(data.radios.every(r=>r.background==='rgba(0, 0, 0, 0)'&&r.borderWidth==='2px'&&r.border===(r.checked?'rgb(226, 184, 102)':'rgb(177, 182, 195)')&&+r.opacity===(r.checked?1:0)),label+' 未选空心次要色、选中金圈金点');
  if(width>=1000){
    check(data.start.width<=1200.5&&Math.abs(data.start.x+data.start.width/2-width/2)<.5,label+' 内容最大1200px且水平居中');
    check(Math.abs(data.start.y+data.start.height/2-height/2)<.5,label+' 内容垂直居中');
    check(data.hero.height>=height*.75-.5&&Math.abs(data.hero.height-data.options.height)<.5,label+' 首图至少75vh且撑满右栏');
    check(Math.abs(data.hero.width/data.options.width-1.5)<.01,label+' 左右栏3比2');
    check(Math.abs(data.menu.right-data.start.right)<.5&&Math.abs(data.menu.y-data.start.y)<.5,label+' 菜单位于内容区右上角');
    check(data.last.bottom<=height-8,label+' 开张按钮完整在首屏');
    check(data.source.endsWith('keyart_a_desktop.webp'),label+' 使用A桌面图');
  }
  await page.screenshot({path:path.join(out,prefix+(online?'-online':'')+(width>=1000?'-desktop-':'-mobile-')+width+'.png')});
  if(width===390&&!online){
    await page.screenshot({path:path.join(out,prefix+'-mobile-after-full.png'),fullPage:true});
    const before=path.join(out,'t05-mobile-before.json');
    if(fs.existsSync(before)){
      const baseline=JSON.parse(fs.readFileSync(before,'utf8'));
      const same=baseline.boxes.length===data.boxes.length&&baseline.boxes.every((b,i)=>['x','y','width','height'].every(k=>Math.abs(b[k]-data.boxes[i][k])<.01));
      check(same,'390手机所有标题、卡片、按钮和首图布局坐标与修改前一致');result.mobileBaseline={same,commit:baseline.commit};
    }
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  check(await page.locator('input[name=diff]').first().evaluate(e=>getComputedStyle(e,'::before').transitionDuration==='0.15s'&&getComputedStyle(e,'::after').transitionDuration.split(', ').every(t=>t==='0.15s')),label+' 单选切换过渡150ms');
  for(const name of ['diff','loc']){
    const inputs=page.locator('input[name='+name+']');await inputs.nth(2).check();
    await page.waitForFunction(name=>+getComputedStyle(document.querySelector('input[name='+name+']:checked'),'::after').opacity===1,name);
    check(await inputs.nth(2).isChecked()&&await page.locator('input[name='+name+']:checked').count()===1,label+' '+name+' 点击保持互斥');
    await inputs.nth(2).press('ArrowLeft');check(await inputs.nth(1).isChecked(),label+' '+name+' 原生方向键可切换');
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  check(await page.locator('input[name=diff]').first().evaluate(e=>getComputedStyle(e,'::before').transitionDuration==='0s'&&getComputedStyle(e,'::after').transitionDuration==='0s'),label+' 减少动态效果关闭单选过渡');
  await page.locator('input[name=diff]').first().check();await page.locator('input[name=loc]').nth(1).check();
  if(width>=1000){
    await page.evaluate(()=>{window.__startHasSave=G.hasSave;G.hasSave=()=>true;G.render();});
    check(await page.locator('[data-act=continue]').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight-8),label+' 含继续按钮也完整在首屏');
    await page.evaluate(()=>{G.hasSave=window.__startHasSave;delete window.__startHasSave;G.render();scrollTo(0,0);});
  } else await page.evaluate(()=>scrollTo(0,0));
  (result.startScreens??=[]).push({width,height,...data});
};
