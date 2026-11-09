/* 存档、帮助和偏好：一处菜单；任何导入都先读、再确认、最后提交。 */
var G = globalThis.G = globalThis.G || {};
(function () {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ui=()=>G.ui, draw=()=>G.render(), toast=(s,b)=>G.toast(s,b);
 const shell=(title,body,foot='',cls='')=>`<div class="overlay"><section class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-heading"><h3>${esc(title)}</h3><button class="btn sm icon-button" data-act="menu-close" aria-label="关闭菜单">×</button></div><div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:''}</section></div>`;
 const S=G.SaveUI={
  menu(){
   const s=G.state;
   const summary=s?`<div class="save-summary"><span>开张 <b>${s.startedAt?esc(new Date(s.startedAt).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})):'老店，日子记不清了'}</b></span><span>经营 <b>第 ${s.month} 月</b></span><span>净资产 <b>${G.fmt(G.netWorth())}</b></span><span>黑化 <b>${s.dark}</b></span><span>口碑 <b>${s.rep}</b></span></div>`:'';
   const actions=s?`<button class="btn primary" data-act="menu-close">继续游戏</button><button class="btn" data-act="new-game">新开一局</button><div class="menu-group"><button class="btn" data-act="save-export">导出存档</button><button class="btn" data-act="save-import">导入存档</button></div><div class="menu-group"><button class="btn" data-act="mute" aria-pressed="${!G.Sound.muted}">音效：${G.Sound.muted?'关':'开'}</button><button class="btn" data-act="vibration" aria-pressed="${G.Feedback.vibration}">震动：${G.Feedback.vibration?'开':'关'}</button></div><button class="btn" data-act="help">游戏帮助</button><button class="btn" data-act="tutorial-replay">重新看一遍引导</button>`:'<button class="btn primary" data-act="save-import">导入存档</button>';
   return shell('存档',summary+actions+`<p class="menu-version">瓜皮二手车 ${G.VERSION}</p>`,'','save-menu');
  },
  editor(){
   const exporting=ui().saveDialog==='export';
   const body=`<p>${exporting?'存档码整段收好，换台手机也能接着忙。':'把存档码贴进来，或者选之前下载的文件。读不出来，原来这局还在。'}</p><label for="save-text">存档码</label><textarea id="save-text" class="save-text" spellcheck="false" ${exporting?'readonly':''}>${esc(exporting?JSON.stringify(G.state):ui().importText||'')}</textarea>${exporting?'':`<label class="btn save-file-label" for="save-file">选择存档文件<input id="save-file" type="file" accept=".txt,application/json,text/plain"></label>`}<p id="save-error" class="neg" role="alert">${esc(ui().saveError||'')}</p>`;
   return shell(exporting?'导出存档':'导入存档',body,`${exporting?'<button class="btn primary" data-act="save-copy">复制存档码</button><button class="btn" data-act="save-download">下载存档文件</button>':'<button class="btn primary" data-act="save-apply">用这份存档</button>'}<button class="btn" data-act="save-close">返回存档页</button>`,'save-dialog');
  },
  confirm(){return shell(ui().confirm==='import'?'换成这份存档？':'新开一局？',`<p>${ui().confirm==='import'?'这局的进度会被覆盖，确定换成刚才那份存档吗？':'这局的进度会被覆盖，确定吗？'}</p><p class="muted">舍不得这份进度，就先回去导出备份。</p>`,`<button class="btn primary" data-act="confirm-yes">确定</button><button class="btn" data-act="confirm-no">先不换</button>`,'confirm-dialog');},
  handlers:{
   menu(){ui().menu=true;draw();},
   'menu-close'(){ui().menu=false;ui().saveDialog=null;ui().confirm=null;ui().help=false;draw();},
   'new-game'(){ui().confirm='restart';draw();},
   restart(){ui().menu=true;ui().confirm='restart';draw();},
   'confirm-no'(){ui().confirm=null;draw();},
   'confirm-yes'(){
    if(ui().confirm==='import'){
     const result=G.importSave(ui().importText||'');ui().confirm=null;
     if(!result.ok){ui().saveError=result.msg;draw();toast(result.msg,true);return;}
     G.Tutorial?.stop(false);Object.assign(ui(),{menu:false,saveDialog:null,help:false,report:null,result:null,tab:'store',stockPage:1,importText:'',saveError:''});draw();toast(result.msg);return;
    }
    G.Tutorial?.stop(false);G.clearSave();G.state=null;Object.assign(ui(),{menu:false,confirm:null,saveDialog:null,help:false,report:null,result:null,tab:'buy',stockPage:1});draw();window.scrollTo(0,0);
   },
   'save-export'(){ui().saveError='';ui().saveDialog='export';draw();S.handlers['save-copy']();},
   'save-import'(){ui().saveError='';ui().saveDialog='import';ui().importText='';draw();document.getElementById('save-text').focus();},
   'save-close'(){ui().saveDialog=null;ui().menu=true;draw();},
   'save-copy'(){
    const el=document.getElementById('save-text');if(!el)return;el.focus();el.select();toast('存档码选好了，正在复制……');
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(el.value).then(()=>toast('复制好了，找个地方收好。')).catch(()=>toast('没能自动复制，长按选中的存档码手动复制吧。'));
    else toast('长按选中的存档码，手动复制吧。');
   },
   'save-download'(){
    if(!G.state)return;const blob=new Blob([JSON.stringify(G.state)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='瓜皮二手车-第'+G.state.month+'月.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('存档文件备好了，收进下载里。');
   },
   'save-apply'(){
    ui().importText=document.getElementById('save-text').value;
    try{G.parseSave(ui().importText);ui().confirm='import';ui().saveError='';draw();}catch(_){ui().saveError='这串存档好像不完整，复制的时候是不是漏了一截？';document.getElementById('save-error').textContent=ui().saveError;toast(ui().saveError,true);}
   },
   vibration(){G.Feedback.toggleVibration();draw();},
   'tutorial-replay'(){ui().menu=false;ui().help=false;G.Tutorial.start(true);},
  },
 };
 document.addEventListener('input',e=>{if(e.target.id==='save-text')ui().importText=e.target.value;});
 document.addEventListener('change',async e=>{
  if(e.target.id!=='save-file')return;const file=e.target.files[0];if(!file)return;
  if(file.size>G.CONFIG.maxSaveChars){ui().saveError='这份文件太大了，像是选错了。';draw();return;}
  try{ui().importText=await file.text();ui().saveError='';draw();toast('文件读好了，确认后就能接着玩。');}catch(_){ui().saveError='这份文件没读出来，重新选一次试试。';draw();}
 });
})();
