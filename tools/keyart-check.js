/* 三案 × 五尺寸的开始页验收；由 browser-check.js 调用，不影响游戏运行。 */
const path = require('path');
module.exports = async function keyartCheck(browser, url, out, check, result, prefix='t06') {
  result.keyarts = [];
  for (const [width, height] of [[390,844],[430,932],[1280,800],[1440,900],[1920,1080]]) {
    const ctx = await browser.newContext({ viewport:{width,height}, hasTouch:width<500, isMobile:width<500, reducedMotion:'reduce' });
    try {
      const page = await ctx.newPage();
      page.on('pageerror', e => result.errors.push('首图 '+e.message));
      page.on('console', m => { if(m.type()==='error')result.errors.push(m.text()); });
      page.on('response', r => { if(r.status()>=400)result.errors.push(r.status()+' '+r.url()); });
      await page.goto(url);
      for (const variant of ['a','b','c']) {
        await page.evaluate(v => { G.CONFIG.keyart=v; G.render(); scrollTo(0,0); }, variant);
        await page.waitForLoadState('networkidle');
        await page.locator('.keyart img').evaluateAll(images => Promise.all(images.map(im=>im.decode())));
        const info = await page.evaluate(() => {
          const hero=document.querySelector('.keyart'), title=hero.querySelector('h1'), copy=hero.querySelector('.keyart-copy');
          const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
          const first=document.querySelector('.start-options .pick'), card=box(first), menu=box(document.querySelector('.toolbar'));
          const range=document.createRange();range.selectNodeContents(title);const ink=range.getBoundingClientRect();
          const image=hero.querySelector('img');
          return { variant:hero.dataset.keyart, hero:box(hero), title:box(title), ink:{x:ink.x,y:ink.y,right:ink.right,bottom:ink.bottom},copy:box(copy),menu,
            font:parseFloat(getComputedStyle(title).fontSize), card, visibleCardFraction:Math.max(0,Math.min(innerHeight,card.bottom)-Math.max(0,card.y))/card.height,
            fits:document.documentElement.scrollWidth<=innerWidth, headings:document.querySelectorAll('h1').length, sticker:!!hero.querySelector('.logo-mark'),
            image:image?{url:image.currentSrc,ok:image.complete&&image.naturalWidth>0,natural:[image.naturalWidth,image.naturalHeight],fit:getComputedStyle(image).objectFit}:null,
            filters:[...hero.querySelectorAll('image[filter]')].map(el=>el.getAttribute('filter')),
            moving:[hero,...hero.querySelectorAll('*')].some(el=>{const s=getComputedStyle(el);return s.animationName!=='none'&&s.animationDuration!=='0s';}) };
        });
        const label=variant.toUpperCase()+' '+width+'×'+height;
        check(info.variant===variant,label+' 配置切换');
        check(info.headings===1&&!info.sticker,label+' 唯一叠图标题且无方块贴纸');
        check(info.font>=40,label+' 标题至少40px');
        check(info.ink.x>=info.hero.x&&info.ink.right<=info.hero.right&&info.ink.y>=info.hero.y&&info.copy.bottom<=info.hero.bottom,label+' 标题和文案完整在首图内');
        if(width<1000) {
          check(Math.abs(info.menu.y-info.hero.y-12)<.5&&Math.abs(info.hero.right-info.menu.right-12)<.5,label+' 菜单在图内右上内缩12px');
          check(info.ink.right<=info.menu.x||info.ink.bottom<=info.menu.y||info.ink.y>=info.menu.bottom,label+' 悬浮菜单不遮标题');
        } else check(info.menu.x>=info.hero.right,label+' 电脑菜单不覆盖首图');
        check(info.fits,label+' 无横向溢出');
        check(info.visibleCardFraction>=.5,label+' 首屏看见至少半张启动资金卡');
        check(!info.moving,label+' 减少动态效果不播放动画');
        if(variant==='b')check(info.filters.includes('url(#artTint7)')&&info.filters.length===3,label+' 复用三辆车与绿色染色');
        else {
          check(info.image.ok&&info.image.fit===(variant==='a'&&width>=1000?'cover':'contain'),label+' 图片加载及当前构图适配');
          check(info.image.url.endsWith('keyart_'+variant+'_'+(variant==='a'||width<1000?'mobile':'desktop')+'.webp'),label+' 使用指定构图');
        }
        // 百分比布局存在子像素舍入；容许半个 CSS 像素，仍严格限制在招牌内。
        if(variant==='c')check(info.copy.y+.5>=info.hero.y+info.hero.height*.06&&info.copy.bottom-.5<=info.hero.y+info.hero.height*(width<1000?.345:.395),label+' 文字位于实测招牌边界');
        const filename=prefix+'-keyart-'+variant+'-'+width+'.png';
        await page.screenshot({path:path.join(out,filename)});
        result.keyarts.push({width,height,filename,...info});
      }
      // 关闭位图美术时仍保留标题和可用的开始页。
      await page.evaluate(()=>{G.ASSET_PACK.ui=false;G.ASSET_PACK.cars=false;G.render();});
      check(await page.locator('.keyart-b svg').count()===3,width+' 关闭美术可退回代码车图');
    } finally { await ctx.close(); }
  }
};
