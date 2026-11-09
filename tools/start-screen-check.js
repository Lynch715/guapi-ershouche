/* 开始页验收：人物/车辆裁切、70vh/内容高度、按钮间距、手机悬浮菜单。 */
const fs=require('fs'),path=require('path');
module.exports=async function startScreenCheck(page,width,height,out,check,result,prefix,online){
  const data=await page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const image=document.querySelector('.keyart img'),imageStyle=getComputedStyle(image),button=document.querySelector('.toolbar button');
    const textRects=[...document.querySelectorAll('.keyart-copy h1,.keyart-copy p')].map(e=>{const r=document.createRange();r.selectNodeContents(e);const b=r.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};});
    return {start:box(document.querySelector('.start')),hero:box(document.querySelector('.keyart')),options:box(document.querySelector('.start-options')),menu:box(document.querySelector('.toolbar')),
      last:box(document.querySelector('[data-act=start]')),lastCard:box(document.querySelector('.pick-location:last-child')),source:image.currentSrc,
      image:{box:box(image),width:image.naturalWidth,height:image.naturalHeight,fit:imageStyle.objectFit,position:imageStyle.objectPosition},textRects,
      menuStyle:{background:getComputedStyle(button).backgroundColor,blur:getComputedStyle(button).backdropFilter||getComputedStyle(button).webkitBackdropFilter},
      resources:performance.getEntriesByType('resource').map(r=>r.name).filter(s=>s.includes('/ui/keyart_')),
      locations:[...document.querySelectorAll('.pick-location')].map(card=>{const art=card.querySelector('.loc-art'),scene=art.querySelector('.store-scene'),building=scene.querySelector('.store-building'),input=card.querySelector('input');return {id:input.value,card:box(card),art:box(art),scene:box(scene),building:box(building),copy:box(card.querySelector('.loc-copy')),input:box(input),loaded:building.complete&&building.naturalWidth>0,src:building.getAttribute('src'),background:getComputedStyle(scene).backgroundImage,radius:getComputedStyle(card).borderTopLeftRadius,artRadius:getComputedStyle(art).borderTopLeftRadius,clip:getComputedStyle(card).overflow};}),
      boxes:[...document.querySelectorAll('.start,.keyart,.keyart-copy,.start-options,.pick,.start h3,.start button')].map(e=>box(e)),
      radios:[...document.querySelectorAll('.start input[type=radio]')].map(e=>{const base=getComputedStyle(e),ring=getComputedStyle(e,'::before'),dot=getComputedStyle(e,'::after');return {checked:e.checked,hit:box(e),background:base.backgroundColor,border:ring.borderColor,borderWidth:ring.borderWidth,opacity:dot.opacity};})};
  });
  const label=width+'×'+height;
  check(data.radios.every(r=>r.hit.width>=44&&r.hit.height>=44),label+' 单选保留44px点击区');
  check(data.radios.every(r=>r.background==='rgba(0, 0, 0, 0)'&&r.borderWidth==='2px'&&r.border===(r.checked?'rgb(226, 184, 102)':'rgb(177, 182, 195)')&&+r.opacity===(r.checked?1:0)),label+' 未选空心次要色、选中金圈金点');
  check(data.source.endsWith('keyart_a_mobile.webp'),label+' 开始页统一用A竖图');
  check(!data.resources.some(s=>s.includes('keyart_a_desktop')),label+' 不请求或预载A横图');
  // 原画固定关键区域；验证 cover 后整张脸及西瓜车都留在可见画幅，再逐张目视。
  const image=data.image,scale=image.fit==='cover'?Math.max(image.box.width/image.width,image.box.height/image.height):Math.min(image.box.width/image.width,image.box.height/image.height);
  const positions=image.position.split(' ').map(v=>parseFloat(v)/100);
  const ox=image.box.x+(image.box.width-image.width*scale)*positions[0],oy=image.box.y+(image.box.height-image.height*scale)*positions[1];
  const region=([x,y,right,bottom])=>({x:ox+x*scale,y:oy+y*scale,right:ox+right*scale,bottom:oy+bottom*scale});
  const visible=r=>r.x>=data.hero.x-.5&&r.y>=data.hero.y-.5&&r.right<=data.hero.right+.5&&r.bottom<=data.hero.bottom+.5;
  data.face=region([820,750,1100,1060]);data.car=region([130,660,850,1320]);
  check(visible(data.face),label+' 墨镜车商整脸未被裁掉');check(visible(data.car),label+' 西瓜车和瓜皮帽保留');
  check(data.textRects.every(r=>r.bottom<data.car.y),label+' 标题文案在天空区域');
  check(data.locations.length===3&&new Set(data.locations.map(l=>l.background)).size===3,label+' 三种独立地段背景');
  check(data.locations.every(l=>l.loaded&&l.src.endsWith('store_l1.webp')&&l.background.includes('bg_'+l.id+'.webp')),label+' 地段背景和一级门店合成且加载完成');
  if(width<1000){
    check(data.locations.every(l=>Math.abs(l.scene.width/l.scene.height-2.4)<.01&&Math.abs(l.scene.x-l.card.x-1)<.5&&Math.abs(l.scene.width-l.card.width+2)<.5&&Math.abs(l.scene.y-l.card.y-1)<.5),label+' 手机缩略图2.4比1并贴合卡片内边框');
    check(data.locations.every(l=>l.input.y>=l.scene.bottom&&l.copy.y>=l.scene.bottom&&l.clip==='hidden'&&parseFloat(l.radius)-parseFloat(l.artRadius)===1),label+' 圆点文字在图下且缩略图圆角对齐金框');
  }else check(data.locations.every(l=>Math.abs(l.scene.width-160)<.5&&Math.abs(l.scene.height-80)<.5&&l.scene.right<=l.copy.x),label+' 电脑160×80左图右文');
  if(width>=1000){
    check(data.start.width<=1200.5&&Math.abs(data.start.x+data.start.width/2-width/2)<.5,label+' 内容最大1200px且水平居中');
    check(Math.abs(data.start.y+data.start.height/2-height/2)<.5,label+' 内容垂直居中');
    check(Math.abs(data.hero.height-Math.max(data.options.height,height*.7))<.5,label+' 首图高度=max(右栏,70vh)');
    check(Math.abs(data.options.y+data.options.height/2-data.hero.y-data.hero.height/2)<.5,label+' 右栏在首图范围垂直居中');
    check(Math.abs(data.last.y-data.lastCard.bottom-24)<.5,label+' 开张按钮紧跟末张地段卡24px');
    check(Math.abs(data.hero.width/data.options.width-1.5)<.01,label+' 左右栏3比2');
    check(Math.abs(data.menu.right-data.start.right)<.5&&Math.abs(data.menu.y-data.start.y)<.5,label+' 菜单位于内容区右上角');
    check(data.last.bottom<=height-8,label+' 开张按钮完整在首屏');
  } else {
    check(Math.abs(data.hero.y-16)<.5,label+' 首图上移至页面16px处');
    check(Math.abs(data.menu.y-data.hero.y-12)<.5&&Math.abs(data.hero.right-data.menu.right-12)<.5,label+' 菜单浮在图内右上12px');
    check(data.menu.bottom<data.hero.bottom&&data.menu.x>data.hero.x,label+' 菜单完整在图内');
    check(data.textRects.every(r=>r.right<=data.menu.x||r.bottom<=data.menu.y||r.y>=data.menu.bottom),label+' 悬浮菜单不遮标题和标语');
    check(data.menuStyle.background==='rgba(17, 18, 21, 0.65)'&&data.menuStyle.blur==='blur(6px)',label+' 菜单半透明深底和轻微毛玻璃');
  }
  await page.screenshot({path:path.join(out,prefix+(online?'-online':'')+(width>=1000?'-desktop-':'-mobile-')+width+'.png')});
  if([390,430,1280].includes(width)){
    await page.evaluate(()=>{const title=[...document.querySelectorAll('.start-options>h3')].find(e=>e.textContent==='门店地段');scrollTo(0,scrollY+title.getBoundingClientRect().y-12);});
    await page.screenshot({path:path.join(out,prefix+(online?'-online':'')+'-locations-context-'+width+'.png')});
    await page.locator('.start-options>.picks').last().screenshot({path:path.join(out,prefix+(online?'-online':'')+'-locations-'+width+'.png')});
    await page.locator('.pick-location .loc-art').first().click();
    check(await page.locator('input[name=loc]').first().isChecked(),label+' 点击缩略图也能选择地段');
    await page.locator('input[name=loc]').nth(1).check();await page.evaluate(()=>scrollTo(0,0));
  }
  if(width===390&&!online){
    await page.screenshot({path:path.join(out,prefix+'-mobile-after-full.png'),fullPage:true});
    const before=path.join(out,'t05-browser-results.json');
    if(fs.existsSync(before)){
      const baseline=JSON.parse(fs.readFileSync(before,'utf8')).startScreens.find(s=>s.width===390);
      const sameSize=['width','height'].every(k=>Math.abs(baseline.hero[k]-data.hero[k])<.01);
      check(sameSize&&Math.abs(baseline.hero.y-data.hero.y-52)<.5,'390手机首图尺寸不变、上移52px');result.mobileBaseline={sameSize,movedUp:baseline.hero.y-data.hero.y};
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
    const saved=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),hero=r('.keyart'),options=r('.start-options');return {height:hero.height,target:Math.max(options.height,innerHeight*.7),center:Math.abs(hero.y+hero.height/2-options.y-options.height/2),gap:r('[data-act=start]').y-r('.pick-location:last-child').bottom};});
    check(Math.abs(saved.height-saved.target)<.5&&saved.center<.5&&Math.abs(saved.gap-24)<.5,label+' 带继续按钮时高度/居中/24px间距均保持');
    await page.evaluate(()=>{G.hasSave=window.__startHasSave;delete window.__startHasSave;G.render();scrollTo(0,0);});
  } else await page.evaluate(()=>scrollTo(0,0));
  (result.startScreens??=[]).push({width,height,...data});
};
