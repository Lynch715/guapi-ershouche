/* 计算实际文本的颜色对比；禁用控件、图片、存档码和遮罩后的背景不计入正文。 */
const fs=require('fs'),path=require('path');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const all=[];try{
for(const width of [375,1920]){const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});await p.goto(process.env.USEDCAR_TEST_URL||'http://127.0.0.1:8893/');
for(const scene of ['start','buy','stock','team','store','ledger','report','help','menu','ending','continue','new']){
await p.evaluate(scene=>{G.state=null;Object.assign(G.ui,{menu:false,confirm:null,help:false,report:null,result:null,saveDialog:null});if(scene!=='start'){G.newGame('small','suburb',303);G.state.store.level=2;for(let i=0;i<3;i++){const c=G.Car.generate('wreck');G.Car.reveal(c);G.addCar(c,90000,'试驾车源');}G.ui.tab=['buy','stock','team','store','ledger'].includes(scene)?scene:'buy';if(scene==='report')G.ui.report=G.act.endMonth().report;if(scene==='help')G.ui.help=true;if(scene==='menu')G.ui.menu=true;if(scene==='ending'){G.state.pending=[];G.state.over='win';}if(scene==='continue'||scene==='new'){G.save();G.state=null;G.ui.entry=scene;}}G.render();},scene);
const audit=await p.evaluate(()=>{
 const root=document.querySelector('.overlay')||document.getElementById('app');const bad=[];let checked=0;
 const rgb=s=>{const a=s.match(/[\d.]+/g)?.map(Number);return a&&a.length>=3?[a[0],a[1],a[2],a[3]??1]:null;};
 const luminance=c=>c.slice(0,3).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const bg=el=>{for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.backgroundImage.startsWith('linear-gradient')){const stops=[...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m=>rgb(m[0]));if(stops.length)return stops;}const c=rgb(s.backgroundColor);if(c&&c[3]>.99)return[c];}return[[17,18,21,1]];};
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while(node=walk.nextNode()){const text=node.textContent.trim(),el=node.parentElement;if(!text||!el||el.closest('svg,textarea,[hidden],[aria-disabled="true"]'))continue;const r=el.getBoundingClientRect(),style=getComputedStyle(el);if(!r.width||!r.height||style.visibility==='hidden')continue;const color=rgb(style.color);if(!color)continue;const min=Number.parseFloat(style.fontSize)>=24||(Number.parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700)?3:4.5;const value=Math.min(...bg(el).map(c=>ratio(color,c)));checked++;if(value+.02<min)bad.push({text:text.slice(0,60),ratio:Math.round(value*100)/100,color:style.color,tag:el.className});}
 return{checked,bad};});all.push({width,scene,...audit});
}await p.close();}
}finally{fs.writeFileSync(path.resolve(__dirname,'../_screens/t03-style-results.json'),JSON.stringify(all,null,2));await browser.close();}const bad=all.flatMap(x=>x.bad.map(b=>({...b,width:x.width,scene:x.scene})));console.log(JSON.stringify({checked:all.reduce((a,b)=>a+b.checked,0),bad},null,2));if(bad.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
