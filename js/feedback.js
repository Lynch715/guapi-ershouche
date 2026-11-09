/* 界面反馈与震动，只读经营数字，不消耗引擎随机数。 */
var G = globalThis.G = globalThis.G || {};
(function () {
  const KEY='usedcar_sim_vibration'; let vibration=true;
  try { vibration=localStorage.getItem(KEY)!=='0'; } catch (_) {}
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seen=new Set();
  const F=G.Feedback={
    get vibration(){return vibration;},
    toggleVibration(){vibration=!vibration;try{localStorage.setItem(KEY,vibration?'1':'0');}catch(_){}return vibration;},
    vibrate(kind){if(!vibration||G.Sound?.muted||!navigator.vibrate)return;try{navigator.vibrate(kind==='bad'?30:kind==='month'?20:10);}catch(_){}},
    snapshot(){const s=G.state;return s?{cash:s.cash,net:G.netWorth(),dark:s.dark,rep:s.rep,ap:s.ap}:null;},
    changes(before,after){
      if(!before||!after||reduced())return;
      for(const key of ['cash','net','dark','rep']){
        const amount=after[key]-before[key];if(!amount)continue;
        const target=document.querySelector(`[data-stat="${key}"]`);if(!target)continue;
        const text=document.createElement('span');text.className='stat-float '+((key==='dark'?amount<0:amount>0)?'gain':'loss');
        text.textContent=(key==='dark'?'黑化 ':key==='rep'?'口碑 ':'')+(amount>0?'+':'')+(['cash','net'].includes(key)?G.fmt(amount):amount);
        target.parentElement.appendChild(text);setTimeout(()=>text.remove(),800);
      }
    },
    prepare(){
      document.querySelectorAll('.pick').forEach(p => p.classList.toggle('is-picked', p.querySelector('input').checked));
      for(const el of document.querySelectorAll('button[disabled]')){
        const reasons={'stock-prev':'已经是第一页了','stock-next':'最后一页了，没有更多车了','advertise':'这个月已经打过广告了','report-reg':'这个月已经报备过了','end-month':G.state?.over?'这局已经结束了':'账还在算，稍等一下'};
        el.dataset.disabledReason=reasons[el.dataset.act]||el.querySelector('small')?.textContent||'现在还不能选这一项';
        el.setAttribute('aria-disabled','true');el.disabled=false;
      }
    },
    big(kind,key){
      if(seen.has(key))return;seen.add(key);if(seen.size>80)seen.delete(seen.values().next().value);
      G.Sound?.play(kind==='win'?'win':'bad');F.vibrate('bad');
      if(reduced())return;const app=document.getElementById('app');app.classList.remove('screen-hit');void app.offsetWidth;app.classList.add('screen-hit');setTimeout(()=>app.classList.remove('screen-hit'),300);
    },
  };
})();
