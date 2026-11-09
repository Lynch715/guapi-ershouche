/* 由已选首图和同一套 HTML/CSS 排出 1200×630 分享图，车辆不裁切。
 * 本地预览运行后：PLAYWRIGHT_MODULE=... node tools/build_share.js
 */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),url=process.env.USEDCAR_TEST_URL||'http://127.0.0.1:8893/';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(url))throw new Error('分享图从本地已验证版本生成');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1,reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
    await page.goto(url);
    const variant=await page.evaluate(()=>{
      const hero=G.Art.keyart();document.body.innerHTML='<div class="start">'+hero+'</div>';G.Art.ensureDefs();return G.CONFIG.keyart;
    });
    await page.addStyleTag({content:`html,body{width:1200px;height:630px;overflow:hidden;margin:0;background:#17342f}
      .start{display:block;width:1200px;height:630px;padding:0;margin:0}
      .keyart{width:1200px;height:630px;aspect-ratio:auto;border-radius:0;box-shadow:none}
      .start .keyart-title{font-size:88px;line-height:1.18;letter-spacing:2px;-webkit-text-stroke:2px #193529}
      .keyart-copy .keyart-subtitle{font-size:30px;line-height:1.35;margin-top:10px}
      .keyart-copy .keyart-tagline{font-size:24px;line-height:1.4;margin-top:8px}
      .keyart-a .keyart-copy{top:8%;left:8%;right:25%;text-align:left}
      .keyart-c .keyart-copy{top:6%;height:33%}
      .keyart-c .keyart-title{-webkit-text-stroke:0;text-shadow:0 3px 0 #86602a,0 0 22px #e2b86688}
      .keyart-b .keyart-copy{top:6%}`});
    await page.waitForLoadState('networkidle');
    await page.locator('.keyart img').evaluateAll(images=>Promise.all(images.map(im=>im.decode())));
    if(errors.length)throw new Error(errors.join('\n'));
    const target=path.join(root,'assets/icon/og-image.png');
    await page.screenshot({path:target});
    console.log('分享图已生成：assets/icon/og-image.png，方案 '+variant.toUpperCase()+'，1200×630，完整桌面构图 + CSS 文字');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
