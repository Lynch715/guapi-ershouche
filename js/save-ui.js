/* 三个手动档位、自动续玩、文件导入导出；覆盖前先确认。 */
var G = globalThis.G = globalThis.G || {};
(function () {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ui=()=>G.ui, draw=()=>G.render(), toast=(s,b)=>G.toast(s,b);
 const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'保存时间未知';
 const shell=(title,body,foot='',cls='')=>`<div class="overlay"><section class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-heading"><h3>${esc(title)}</h3><button class="btn sm icon-button" data-act="menu-close" aria-label="关闭菜单">×</button></div><div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:''}</section></div>`;
 const showResult=result=>{draw();toast(result.msg,!result.ok);};
 const cancelFileRead=()=>{ui().fileReadToken=(ui().fileReadToken||0)+1;};
 const reset=()=>Object.assign(ui(),{menu:false,saveDialog:null,confirm:null,help:false,report:null,result:null,tab:'store',stockPage:1,importText:'',saveError:''});
 const slotInfo=slot=>slot.summary?`第 ${slot.summary.month} 月 · ${esc(slot.summary.location)} · ${esc(slot.summary.store)}<br>净资产 ${G.fmt(slot.summary.net)} · 黑化 ${slot.summary.dark} · 口碑 ${slot.summary.rep}`:esc(slot.msg||'还没有保存进度');
 const S=G.SaveUI={
  menu(){
   const s=G.state, slots=G.SaveSlots.list();
   const summary=s?`<div class="save-summary"><span>当前进度 · 自动保留 <b>第 ${s.month} 月 · ${esc(G.LOCATIONS[s.store.location].name)}</b></span><span>净资产 <b>${G.fmt(G.netWorth())}</b></span><span>黑化 <b>${s.dark}</b></span><span>口碑 <b>${s.rep}</b></span></div>`:'';
   const cards=slots.map(slot=>`<section class="save-slot ${slot.empty?'is-empty':''}" data-slot="${slot.id}" aria-label="档位 ${slot.id}"><div class="save-slot-heading"><b>档位 ${slot.id}</b><span>${slot.empty?'空档位':slot.status==='ready'?esc(date(slot.savedAt)):'暂时无法读取'}</span></div><p class="save-slot-info">${slotInfo(slot)}${slot.legacy?'<small>原来的自动存档已备份到这里</small>':''}</p><div class="save-slot-actions"><button class="btn ${slot.empty&&s?'primary':''}" data-act="slot-save" data-slot="${slot.id}" ${!s||slot.status==='unavailable'?'disabled':''}>保存到此</button><button class="btn" data-act="slot-load" data-slot="${slot.id}" ${slot.status!=='ready'?'disabled':''}>读取</button><button class="btn" data-act="slot-export" data-slot="${slot.id}" ${slot.empty||slot.status==='unavailable'?'disabled':''}>导出</button></div></section>`).join('');
   const actions=`<button class="btn" data-act="save-import">导入存档到档位</button>${s?`<div class="menu-group"><button class="btn primary" data-act="menu-close">继续游戏</button><button class="btn" data-act="save-export">导出当前进度</button></div><button class="btn" data-act="new-game">新开一局</button><div class="menu-group"><button class="btn" data-act="mute" aria-pressed="${!G.Sound.muted}">音效：${G.Sound.muted?'关':'开'}</button><button class="btn" data-act="vibration" aria-pressed="${G.Feedback.vibration}">震动：${G.Feedback.vibration?'开':'关'}</button></div><button class="btn" data-act="help">游戏帮助</button><button class="btn" data-act="tutorial-replay">重新看一遍引导</button>`:''}`;
   return shell('存档',summary+'<p class="save-intro">三个档位由你手动保存，继续经营不会覆盖。导入时可选择目标档位。</p>'+`<div class="save-slots">${cards}</div>`+(G.SaveSlots.error?`<p class="neg" role="alert">${esc(G.SaveSlots.error)}</p>`:'')+actions+`<p class="menu-version">瓜皮二手车 ${G.VERSION}</p>`,'','save-menu');
  },
  editor(){
   const exporting=ui().saveDialog==='export';
   const target=exporting?'':`<label for="save-slot">导入到哪个档位</label><select id="save-slot" class="save-target">${G.SaveSlots.list().map(slot=>`<option value="${slot.id}" ${slot.id===ui().importSlot?'selected':''}>档位 ${slot.id} · ${slot.empty?'空档位':slot.summary?'第 '+slot.summary.month+' 月':'已有内容'}</option>`).join('')}</select>`;
   const body=`<p>${exporting?'复制存档码或下载文件，换台手机也能接着忙。':'粘贴存档码，或选择导出的文件。先存入所选档位，再点击「读取」继续；当前游戏不会被替换。'}</p>${target}<label for="save-text">存档码</label><textarea id="save-text" class="save-text" spellcheck="false" ${exporting?'readonly':''}>${esc(exporting?ui().exportText:ui().importText||'')}</textarea>${exporting?'':`<label class="btn save-file-label" for="save-file">选择存档文件<input id="save-file" type="file" accept=".txt,.json,application/json,text/plain"></label>`}<p id="save-error" class="neg" role="alert">${esc(ui().saveError||'')}</p>`;
   return shell(exporting?(ui().exportSlot?'导出档位 '+ui().exportSlot:'导出当前进度'):'导入存档',body,`${exporting?'<button class="btn primary" data-act="save-copy">复制存档码</button><button class="btn" data-act="save-download">下载存档文件</button>':'<button class="btn primary" data-act="save-apply">导入到所选档位</button>'}<button class="btn" data-act="save-close">返回存档页</button>`,'save-dialog');
  },
  confirm(){
   const kind=ui().confirm,id=ui().targetSlot;
   const slot=G.SaveSlots.get(id);
   const info=slot.ok&&!slot.empty?`<div class="save-confirm-info">档位 ${id} 原有进度：<p>${slotInfo(slot)}</p></div>`:'';
   const text={
    'slot-save':[`覆盖档位 ${id}？`,'用当前进度覆盖这个档位，其他档位不受影响。', '确认覆盖'],
    'slot-load':[`读取档位 ${id}？`,'当前自动续玩会切换到这个档位的进度。三个手动档位都会保留。','读取此档'],
    'slot-import':[`导入到档位 ${id}？`,slot.empty?'导入后可在存档页读取，当前游戏保持不变。':'这会覆盖所选档位，当前游戏和其他档位保持不变。','确认导入'],
    restart:['新开一局？','回到开张界面。开新店后自动续玩会换成新局，三个手动档位都会保留。','去开新店'],
    'start-new':['开始这家新店？','开张后将替换自动续玩进度，三个手动档位仍保留。想保留旧进度，可以先取消并保存到手动档位。','确认开张'],
   }[kind]||['确认操作？','请返回存档页重新选择。','确定'];
   return shell(text[0],`<p>${text[1]}</p>${['restart','start-new'].includes(kind)?'':info}`,`<button class="btn primary" data-act="confirm-yes">${text[2]}</button><button class="btn" data-act="confirm-no">取消</button>`,'confirm-dialog');
  },
  handlers:{
   menu(){ui().menu=true;draw();},
   'menu-close'(){cancelFileRead();ui().menu=false;ui().saveDialog=null;ui().confirm=null;ui().help=false;draw();},
   'new-game'(){ui().confirm='restart';draw();},
   restart(){ui().menu=true;ui().confirm='restart';draw();},
   'confirm-no'(){ui().confirm=null;draw();},
   'confirm-yes'(){
    const kind=ui().confirm,id=ui().targetSlot,expected=ui().slotExpected;
    if(kind==='start-new'){G.startConfiguredGame();return;}
    if(kind==='restart'){
     G.Tutorial?.stop(false);G.state=null;Object.assign(ui(),{menu:false,confirm:null,saveDialog:null,help:false,report:null,result:null,tab:'buy',stockPage:1,entry:'new',newGameApproved:true});draw();window.scrollTo(0,0);return;
    }
    let result;
    if(kind==='slot-save')result=G.SaveSlots.save(id,expected);
    else if(kind==='slot-import')result=G.SaveSlots.import(id,ui().importText||'',expected);
    else if(kind==='slot-load')result=G.SaveSlots.load(id,expected);
    else return;
    ui().confirm=null;
    if(!result.ok){ui().saveError=result.msg;showResult(result);return;}
    if(kind==='slot-load'){G.Tutorial?.stop(false);reset();draw();window.scrollTo(0,0);toast(result.msg);return;}
    if(kind==='slot-import')Object.assign(ui(),{menu:true,saveDialog:null,importText:'',saveError:''});
    showResult(result);
   },
   'slot-save'(el){
    const slot=G.SaveSlots.get(+el.dataset.slot);if(!slot.ok){toast(slot.msg,true);return;}
    ui().targetSlot=slot.id;ui().slotExpected=slot.raw;
    if(slot.empty){showResult(G.SaveSlots.save(slot.id,slot.raw));return;}
    ui().confirm='slot-save';draw();
   },
   'slot-load'(el){
    const slot=G.SaveSlots.get(+el.dataset.slot);if(!slot.ok||slot.status!=='ready'){toast(slot.msg||'这个档位还是空的。',true);return;}
    ui().targetSlot=slot.id;ui().slotExpected=slot.raw;ui().confirm='slot-load';draw();
   },
   'slot-export'(el){
    const result=G.SaveSlots.export(+el.dataset.slot);if(!result.ok){toast(result.msg,true);return;}
    Object.assign(ui(),{saveDialog:'export',saveError:result.invalid?'这份档位内容异常，导出的原文件可以留作恢复。':'',exportText:result.text,exportSlot:+el.dataset.slot,exportMonth:result.month});draw();
   },
   'save-export'(){
    if(!G.state)return;Object.assign(ui(),{saveDialog:'export',saveError:'',exportText:JSON.stringify(G.state),exportSlot:null,exportMonth:G.state.month});draw();
   },
   'save-import'(){
    cancelFileRead();
    const empty=G.SaveSlots.list().find(slot=>slot.empty);
    Object.assign(ui(),{saveError:'',saveDialog:'import',importText:'',importSlot:empty?.id||1});draw();
   },
   'save-close'(){cancelFileRead();ui().saveDialog=null;ui().saveError='';ui().menu=true;draw();},
   'save-copy'(){
    const el=document.getElementById('save-text');if(!el)return;el.focus();el.select();toast('存档码选好了，正在复制……');
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(el.value).then(()=>toast('复制好了，找个地方收好。')).catch(()=>toast('没能自动复制，长按选中的存档码手动复制吧。'));
    else toast('长按选中的存档码，手动复制吧。');
   },
   'save-download'(){
    if(!ui().exportText)return;const blob=new Blob([ui().exportText],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='瓜皮二手车-'+(ui().exportSlot?'档位'+ui().exportSlot:'当前进度')+(ui().exportMonth?'-第'+ui().exportMonth+'月':'')+'.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('存档文件备好了，收进下载里。');
   },
   'save-apply'(){
    ui().importText=document.getElementById('save-text').value;ui().importSlot=+document.getElementById('save-slot').value;
    try{
     G.parseSave(ui().importText);const slot=G.SaveSlots.get(ui().importSlot);if(!slot.ok)throw new Error(slot.msg);
     ui().targetSlot=slot.id;ui().slotExpected=slot.raw;ui().confirm='slot-import';ui().saveError='';draw();
    }catch(e){ui().saveError=e.message;document.getElementById('save-error').textContent=ui().saveError;toast(ui().saveError,true);}
   },
   vibration(){G.Feedback.toggleVibration();draw();},
   'tutorial-replay'(){ui().menu=false;ui().help=false;G.Tutorial.start(true);},
  },
 };
 document.addEventListener('input',e=>{if(e.target.id==='save-text'&&ui().saveDialog==='import'){cancelFileRead();ui().importText=e.target.value;}});
 document.addEventListener('change',async e=>{
  if(e.target.id==='save-slot'){ui().importSlot=+e.target.value;return;}
  if(e.target.id!=='save-file')return;const file=e.target.files[0];if(!file)return;
  if(file.size>G.CONFIG.maxSaveChars){ui().saveError='这份文件太大了，像是选错了。';draw();return;}
  // 用户离开导入页或重选文件后，迟到的读取结果不再覆盖当前输入。
  const token=ui().fileReadToken=(ui().fileReadToken||0)+1;
  try{const text=await file.text();if(ui().saveDialog!=='import'||ui().fileReadToken!==token)return;ui().importText=text;ui().saveError='';draw();toast('文件读好了，选好档位后再确认导入。');}catch(_){if(ui().saveDialog==='import'&&ui().fileReadToken===token){ui().saveError='这份文件没读出来，重新选一次试试。';draw();}}
 });
})();
