/* 首局提示只保存在浏览器偏好中，不改变玩家存档。 */
var G = globalThis.G = globalThis.G || {};
(function () {
  const KEY = 'usedcar_sim_tutorial_done';
  let step = -1, firstMonth = 1, memoryDone = false;
  const done = () => { try { return memoryDone || localStorage.getItem(KEY) === '1'; } catch (_) { return memoryDone; } };
  const steps = [
    ['先看行动点', () => `顶栏的小圆点是行动点。每月基础 ${G.CONFIG.apPerMonth} 点，看车、检测和整备都要用；月底刷新，别把自己忙成一台报废车。`, '.ap'],
    ['去收车看看', () => '点「收车」，挑一个可验车的渠道，再点「去看车」。便宜不是罪，便宜得离谱最好先验。', '[data-act="visit"]'],
    ['买下第一台车', () => '在看车弹窗里先验车，再挑一台买下。现金和车位够就能收；买完点「下一步」去库存。', '[data-act="buy"]'],
    ['整备与挂牌', () => '库存里的车已自动挂牌。可以清洗、修车、选质保；手动改价会停止自动定价。整备花的钱得能从售价里赚回来。', '.list-row'],
    ['结束本月', () => '准备好后点底部「结束本月」。客户会来挑车，房租工资也会来挑你的钱包；读完月结，点下一步。', '[data-act="end-month"]'],
    ['守住两条线', () => `黑化是被盯上的程度，达到 ${G.CONFIG.sealDark} 会查封；口碑影响客流。报备每月能减 ${G.CONFIG.reportDark} 黑化，灰色旧账却可能晚几年才找来。右上角菜单里能备份、看帮助。祝你开张大吉。`, '.hud-grid'],
  ];
  const T = G.Tutorial = {
    start(force) {
      if (!G.state || (!force && done())) return;
      step = 0; firstMonth = G.state.month; G.ui.help = false; G.render();
    },
    stop(remember = true) {
      step = -1;
      if (remember) { memoryDone = true; try { localStorage.setItem(KEY, '1'); } catch (_) {} }
      T.render();
    },
    render() {
      document.getElementById('tutorial-card')?.remove();
      document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
      const active = step >= 0 && !!G.state && !G.state.over;
      document.body.classList.toggle('tutorial-active', active);
      if (!active) return;
      const [title, text, selector] = steps[step];
      const card = document.createElement('aside');
      card.id = 'tutorial-card'; card.className = 'tutorial-card'; card.setAttribute('aria-label', '新手引导');
      card.innerHTML = `<small>开张指南 ${step + 1} / ${steps.length}</small><h4>${title}</h4><p>${text()}</p><div class="tutorial-actions"><button class="btn sm" data-tutorial="skip">跳过引导</button><button class="btn sm primary" data-tutorial="next">${step === steps.length - 1 ? '开始经营' : '下一步'}</button></div>`;
      document.body.appendChild(card);
      document.querySelectorAll(selector).forEach(el => el.classList.add('tutorial-focus'));
    },
  };
  document.addEventListener('click', e => {
    const action = e.target.closest('[data-tutorial]')?.dataset.tutorial;
    if (!action) return;
    if (action === 'skip') { T.stop(); return; }
    if (step === 2 && !G.state.cars.length) { G.toast('先买一台车，或者跳过引导'); return; }
    if (step === 4 && G.state.month <= firstMonth) { G.toast('先点「结束本月」看看月结'); return; }
    step++;
    if (step === steps.length) { T.stop(); return; }
    if (step === 1 || step === 2) G.ui.tab = 'buy';
    if (step === 3) { G.act.closeVisit(); G.ui.tab = 'stock'; }
    G.render();
  });
})();
