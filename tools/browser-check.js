/* 开发验收：使用机器上已有的 Playwright。游戏运行不需要 npm。
 * PLAYWRIGHT_MODULE=... node tools/browser-check.js
 */
const fs=require('fs'),path=require('path');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),url=process.env.USEDCAR_TEST_URL||'http://127.0.0.1:8893/';
const online=/^https:\/\/[^/]+\.github\.io\//.test(url);if(!online&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/$/.test(url))throw new Error('请使用本地预览或 Pages 地址');
const out=path.join(root,'_screens');const result={url,checks:[],errors:[],viewports:[],buttons:[],performance:{}};
function check(value,msg){result.checks.push({pass:!!value,msg});if(!value)throw new Error(msg);}
const act=(p,name)=>p.locator(`[data-act="${name}"]`);
async function click(p,name){const el=act(p,name).first();const disabled=await el.isDisabled();if(disabled)await el.evaluate(e=>e.scrollIntoView({block:'center'}));await el.click({force:disabled});result.buttons.push(name);}
async function menu(p){if(!await p.locator('.save-menu').count())await click(p,'menu');}
async function endMonth(p){await click(p,'end-month');await p.locator('.report').waitFor();}
async function pending(p){for(let i=0;i<16;i++){if(await act(p,'close-result').count()){await click(p,'close-result');continue;}const opts=p.locator('[data-act="decide"]:not([aria-disabled="true"])');if(!await opts.count())return;await opts.first().click();result.buttons.push('decide');}throw new Error('待办未处理完');}
async function geometry(p,label){const d=await p.evaluate(()=>({w:innerWidth,doc:document.documentElement.scrollWidth,inputs:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.getBoundingClientRect().width>0).map(e=>parseFloat(getComputedStyle(e).fontSize)),small:[...document.querySelectorAll('button,select,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<43.5||r.height<43.5);}).map(e=>e.dataset.act||e.tagName)}));check(d.doc<=d.w,label+' 无横向溢出');check(d.inputs.every(n=>n>=16),label+' 表单不小于 16px');check(!d.small.length,label+' 点击区域不小于 44px '+d.small.join(','));}
async function touch(p,label){const r=await p.evaluate(()=>{const gesture=new Event('gesturestart',{bubbles:true,cancelable:true});document.dispatchEvent(gesture);const move=new Event('touchmove',{bubbles:true,cancelable:true});Object.defineProperty(move,'touches',{value:[{},{}]});document.dispatchEvent(move);const wheel=new WheelEvent('wheel',{ctrlKey:true,bubbles:true,cancelable:true});document.dispatchEvent(wheel);const key=new KeyboardEvent('keydown',{key:'+',ctrlKey:true,bubbles:true,cancelable:true});document.dispatchEvent(key);const one=new Event('touchend',{bubbles:true,cancelable:true}),two=new Event('touchend',{bubbles:true,cancelable:true});document.body.dispatchEvent(one);document.body.dispatchEvent(two);return {scale:visualViewport.scale,gesture:gesture.defaultPrevented,move:move.defaultPrevented,wheel:wheel.defaultPrevented,key:key.defaultPrevented,double:two.defaultPrevented};});check(r.gesture&&r.move&&r.wheel&&r.key&&r.double&&Math.abs(r.scale-1)<.001,label+' 双指 / 手势 / 双击 / 组合键被拦截，scale=1');}
async function snapshot(p,name){await p.waitForLoadState('networkidle');await p.screenshot({path:path.join(out,name+'.png')});}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [w,h] of (online?[[430,932],[1280,800]]:[[375,667],[390,844],[430,932],[1280,800],[1920,1080]]).filter(([width])=>!process.env.USEDCAR_WIDTH || width===Number(process.env.USEDCAR_WIDTH))){
 const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:w<500,isMobile:w<500,reducedMotion:'reduce'});
 await ctx.addInitScript(()=>{window.__vibes=[];window.__tones=0;try{navigator.vibrate=n=>{window.__vibes.push(n);return true;};}catch(_){}const Base=window.AudioContext;if(Base)window.AudioContext=class extends Base{createOscillator(){window.__tones++;return super.createOscillator();}};});
 const p=await ctx.newPage();p.on('pageerror',e=>result.errors.push(w+': '+e.message));p.on('response',r=>{if(r.status()>=400)result.errors.push(r.status()+' '+r.url());});p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await p.goto(url);await p.waitForLoadState('networkidle');check((await p.title()).includes('瓜皮二手车'),'游戏名');await geometry(p,w+' 开始');await touch(p,w+' 开始');
 check(await p.locator('meta[name="viewport"]').getAttribute('content').then(s=>s.includes('user-scalable=no')),'viewport 已限制');
 await menu(p);check(await act(p,'save-import').count()===1&&await act(p,'save-export').count()===0,'未开局菜单只提供导入');await click(p,'menu-close');
 await click(p,'start');check(await p.locator('#tutorial-card').count()===1,'首局引导出现');await p.locator('[data-tutorial="skip"]').click();
 await p.evaluate(()=>{G.state.rngState=303;G.state.seed=303;});
 await p.locator('[data-act="visit"][data-ch="private"]').click();await geometry(p,w+' 看车');await click(p,'inspect-visit');await click(p,'buy');check((await p.locator('#toast').innerText()).includes('花了'),'买车金额反馈');await click(p,'visit-close');
 check(await p.evaluate(()=>window.__vibes.length>0&&window.__tones>0),'成交有合成音效和震动调用');
 await endMonth(p);await geometry(p,w+' 月结');check(await p.locator('[data-count]').count()===3,'三项结算数字');check(await p.evaluate(()=>!document.querySelector('[data-counting]')),'减少动态效果不启动数字动画');
 const count=await p.evaluate(()=>G.cleanPending());check((await act(p,'close-report').innerText())===(count?'处理 '+count+' 件事':'继续经营'),'月结提示待办数量');await click(p,'close-report');await pending(p);
 while(await p.evaluate(()=>G.state.month)<4){await p.locator('[data-act="tab"][data-tab="buy"]').click();await p.locator('[data-act="visit"][data-ch="dealer4s"]').click();await click(p,'inspect-visit');await click(p,'buy');await click(p,'visit-close');await endMonth(p);await click(p,'close-report');await pending(p);}
 check(await p.evaluate(()=>G.state.month)===4,'实际经营三个月');
 await menu(p);check(await p.locator('.save-summary').count()===1,'存档概况');await geometry(p,w+' 存档页');
 const locked=await p.evaluate(()=>{const before=window.scrollY;window.scrollBy(0,500);return document.body.classList.contains('modal-open')&&window.scrollY===before;});check(locked,'弹窗锁住背景');
 await click(p,'help');check(await p.locator('.help-section').count()===9,'帮助九节');await geometry(p,w+' 帮助');await click(p,'help-close');
 await click(p,'tutorial-replay');check(await p.locator('#tutorial-card').count()===1,'菜单重播引导');await p.locator('[data-tutorial="skip"]').click();await menu(p);
 await click(p,'save-export');const exported=await p.locator('#save-text').inputValue();check(JSON.parse(exported).version===1,'导出保留原存档格式');await geometry(p,w+' 导出');
 const downloadPromise=p.waitForEvent('download');await click(p,'save-download');const downloaded=await downloadPromise;const file=await downloaded.path();check(fs.readFileSync(file,'utf8')===exported&&downloaded.suggestedFilename().endsWith('.txt'),'txt 下载内容完整');
 await click(p,'save-close');await click(p,'save-import');await p.locator('#save-text').fill('丢了半截的存档');await click(p,'save-apply');check((await p.locator('#save-error').innerText()).includes('不完整'),'坏存档用口语解释');check(await p.evaluate(()=>JSON.stringify(G.state))===exported,'坏存档不改变进度');
 await p.locator('#save-file').setInputFiles({name:'车行备份.txt',mimeType:'text/plain',buffer:Buffer.from(exported)});await p.waitForFunction(()=>document.getElementById('save-text').value.startsWith('{'));await click(p,'save-apply');check(await p.locator('.confirm-dialog').count()===1,'导入先确认');check(await p.evaluate(()=>JSON.stringify(G.state))===exported,'确认前不提交');await click(p,'confirm-no');await click(p,'save-apply');await click(p,'confirm-yes');check(await p.locator('.save-dialog').count()===0,'确认后读入存档');
 await menu(p);const muteBefore=await p.evaluate(()=>G.Sound.muted);await click(p,'mute');const vibeBefore=await p.evaluate(()=>G.Feedback.vibration);await click(p,'vibration');await p.reload();await click(p,'continue');check(await p.evaluate(()=>G.Sound.muted)!==muteBefore&&await p.evaluate(()=>G.Feedback.vibration)!==vibeBefore,'音效与震动偏好持久化');check(await p.locator('#tutorial-card').count()===0,'继续存档不重复引导');
 await menu(p);await click(p,'new-game');await click(p,'confirm-no');check(await p.evaluate(()=>G.state.month)===4,'取消新局保留进度');await click(p,'menu-close');
 for(const tab of ['buy','stock','team','store','ledger']){await p.locator(`[data-act="tab"][data-tab="${tab}"]`).click();await geometry(p,w+' '+tab);await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));check(await p.evaluate(()=>document.querySelector('main').getBoundingClientRect().bottom<=document.querySelector('.bar-bottom').getBoundingClientRect().top+1),tab+' 页末不被月结遮住');}
 await p.evaluate(()=>{G.ui.tab='stock';if(!G.state.cars.length)G.addCar(G.Car.generate('private'),50000,'分页检查车源');G.render();});await click(p,'stock-prev');const disabledMessage=await p.locator('#toast').innerText();check(disabledMessage.includes('第一页'),'禁用控件解释原因：'+disabledMessage);
 if(online)await snapshot(p,'t03-online-'+(w<500?'mobile':'desktop'));else await snapshot(p,'t03-menu-flow-'+w);
 result.viewports.push({width:w,height:h});await ctx.close();
 }
 if(!online){
 const ctx=await browser.newContext({viewport:{width:430,height:932},reducedMotion:'no-preference'});const p=await ctx.newPage();await p.goto(url);await p.evaluate(()=>{G.newGame('small','suburb',1100);G.ui.tab='buy';G.render();});
 const t=await p.evaluate(()=>{document.querySelector('[data-act="end-month"]').click();document.querySelector('[data-act="end-month"]').click();return performance.now();});await p.locator('.report').waitFor();const duration=await p.evaluate(t=>performance.now()-t,t);check(await p.evaluate(()=>G.state.month)===2,'连点只结算一个月');check(duration>=600&&duration<1500,'月份过场约 700ms');result.performance.transitionMs=duration;await p.waitForFunction(()=>!document.querySelector('[data-counting]'));
 await p.evaluate(()=>{G.ui.report=null;G.state.pending=[];G.state.store.level=5;G.state.cars=[];for(let i=0;i<180;i++)G.addCar(G.Car.generate('private'),100000,'性能车源');G.ui.tab='stock';G.render();});check(await p.locator('.card.car').count()===20,'180 台库存分页');
 result.performance.renderMs=await p.evaluate(()=>{const t=performance.now();G.render();return performance.now()-t;});await ctx.close();
 }
 check(result.errors.length===0,'页面、控制台、图片及 manifest 无错误');
}finally{fs.writeFileSync(path.join(out,online?'t03-online-results.json':'t03-browser-results.json'),JSON.stringify(result,null,2));await browser.close();}console.log(result.checks.length+' 项检查通过，错误 0');})().catch(e=>{console.error(e);process.exitCode=1;});
