/* 五种视口的固定场景截图。开发检查，使用现有 Playwright。 */
const fs=require('fs'), path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..'), mode=process.argv[2]||'before';
const url=process.env.USEDCAR_TEST_URL||'http://127.0.0.1:8893/';
const out=path.join(root,'_screens','t03-'+mode);fs.mkdirSync(out,{recursive:true});
const results={mode,url,viewports:[],errors:[]};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [w,h] of [[375,667],[390,844],[430,932],[1280,800],[1920,1080]]){
 const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:w<500,isMobile:w<500,reducedMotion:'reduce'});const p=await ctx.newPage();
 p.on('pageerror',e=>results.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)results.errors.push(r.status()+' '+r.url());});
 let firstBytes=0;const firstRequests=new Set();p.on('response',async r=>{if(!firstRequests.has(r.url())){firstRequests.add(r.url());try{firstBytes+=(await r.body()).length;}catch(_){}}});
 await p.goto(url);await p.waitForLoadState('networkidle');
 const v={width:w,height:h,pages:[]};
 async function shot(name){await p.waitForLoadState('networkidle');await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,`${w}-${name}.png`),fullPage:false});v.pages.push({name,...await p.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,inputs:[...document.querySelectorAll('input,select,textarea')].map(e=>parseFloat(getComputedStyle(e).fontSize))}))});}
 await shot('01-start');v.firstBytes=firstBytes;
 v.firstResources=[...firstRequests].filter(u=>u.startsWith(url)).map(u=>new URL(u).pathname);
 v.firstFileBodyBytes=v.firstResources.reduce((sum,u)=>{const file=path.join(root,decodeURIComponent(u).replace(/^\//,''));return sum+(fs.existsSync(file)&&fs.statSync(file).isFile()?fs.statSync(file).size:0);},0);
 await p.evaluate(()=>{G.newGame('small','suburb',303);G.ui.tab='buy';G.render();});await shot('02-buy');
 await p.locator('[data-act="visit"][data-ch="private"]').click();await shot('03-visit');
 await p.evaluate(()=>{G.state.visit=null;G.state.store.level=2;for(const [catId,flaw] of [['family','flood'],['suv','majorAcc'],['perf','tires']]){const c=G.Car.generate('wreck',{catId,flaw});G.Car.reveal(c);G.addCar(c,90000,'试驾车源');}G.ui.tab='stock';G.render();});await shot('04-stock');
 for(const [tab,name] of [['team','05-team'],['store','06-store'],['ledger','07-finance']]){await p.locator(`[data-act="tab"][data-tab="${tab}"]`).click();await shot(name);}
 await p.evaluate(()=>{G.ui.report=G.act.endMonth().report;G.render();});await shot('08-report');
 await p.evaluate(()=>{G.ui.report=null;G.ui.help=true;G.render();});await shot('09-help');
 await p.evaluate(()=>{G.ui.help=false;G.state.pending=[];G.state.cash=G.state.goal;G.state.over='win';G.render();});await shot('10-ending');
 results.viewports.push(v);await ctx.close();
 }
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));await browser.close();}if(results.errors.length)throw new Error(results.errors.join('\n'));console.log(mode+': 50 张截图，错误 0');})().catch(e=>{console.error(e);process.exitCode=1;});
