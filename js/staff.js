/* =========================================================
 * 员工系统：招聘池、雇佣解雇、加成汇总
 * 岗位数值在 data.js 的 G.ROLES
 *
 * 员工：{ id, role, name, level 1~3, salary, integrity 0~1（品行，玩家看不到）, tenure 在职月数 }
 * 品行低的员工更容易触发倒卖配件、吃回扣、做假账等事件（见 events.js）
 * ========================================================= */
var G = globalThis.G = globalThis.G || {};

(function () {
  const S = () => G.state;
  const ok = msg => ({ ok: true, msg });
  const fail = msg => ({ ok: false, msg });

  function sum(key) {
    let t = 0;
    for (const e of G.Staff.active()) { const v = G.ROLES[e.role][key]; if (v) t += v[e.level - 1]; }
    return G.STAFF_CAPS[key] !== undefined ? Math.min(t, G.STAFF_CAPS[key]) : t;
  }

  function nameFor(role) {
    const x = G.pick(G.SURNAMES);
    return { manager: `${x}经理`, tech: `${x}师傅`, sales: `小${x}`, finance: G.chance(0.5) ? `${x}姐` : `${x}会计` }[role];
  }

  G.Staff = {
    list: role => S().staff.filter(e => !role || e.role === role),
    isActive: e => (e.startsMonth || 0) <= S().month,
    active: role => S().staff.filter(e => G.Staff.isActive(e) && (!role || e.role === role)),
    slots: () => G.level().staffSlots,
    payroll: () => G.Staff.active().reduce((t, e) => t + e.salary, 0),
    apRaw: () => Math.round(sum('ap')),
    apBonus: () => Math.min(Math.round(sum('ap')), G.level().apCap),
    trafficMult: () => 1 + sum('traffic'),
    refurbMult: () => 1 - sum('refurbDiscount'),
    fineMult: () => 1 - sum('fineCut'),

    /** 某岗位某等级的效果文字 */
    effectText(role, level) {
      const r = G.ROLES[role], i = level - 1, p = [];
      if (r.ap) p.push(`行动点 +${r.ap[i]}`);
      if (r.refurbDiscount) p.push(`整备 -${Math.round(r.refurbDiscount[i] * 100)}%`);
      if (r.traffic) p.push(`客流 +${Math.round(r.traffic[i] * 100)}%`);
      if (r.fineCut) p.push(`罚款赔偿 -${Math.round(r.fineCut[i] * 100)}%`);
      return p.join(' · ');
    },
    /** 全店加成汇总 */
    summary() {
      const raw = this.apRaw(), cap = G.level().apCap;
      const p = [`行动点 +${this.apBonus()}${raw > cap ? `（门店上限 ${cap}，多出的 ${raw - cap} 点用不上）` : `（门店上限 ${cap}）`}`];
      const t = sum('traffic'), d = sum('refurbDiscount'), f = sum('fineCut');
      if (t) p.push(`客流 +${Math.round(t * 100)}%`);
      if (d) p.push(`整备 -${Math.round(d * 100)}%`);
      if (f) p.push(`罚款赔偿 -${Math.round(f * 100)}%`);
      return p.join(' · ');
    },

    makeCandidate(opts = {}) {
      const s = S();
      const role = opts.role || G.weighted(Object.fromEntries(Object.entries(G.ROLES).map(([k, r]) => [k, r.weight])));
      // 门店越大，越能吸引高级人才
      const lvl = opts.level || G.weighted({ 1: 6, 2: 1 + s.store.level, 3: Math.max(0, s.store.level - 1) });
      const level = +lvl;
      return {
        id: s.nextId++, role, level, name: nameFor(role),
        salary: G.round(G.ROLES[role].salary[level - 1] * G.range(0.9, 1.15), 500),
        integrity: +(opts.integrity ?? G.range(0.25, 1)).toFixed(2),
        tenure: 0,
      };
    },
    refreshCandidates() {
      const s = S(), n = 3 + Math.floor(s.store.level / 2);
      s.candidates = Array.from({ length: n }, () => this.makeCandidate());
    },
    monthly() {
      for (const e of S().staff) if ((e.startsMonth || 0) < S().month) e.tenure++;
      this.refreshCandidates();
    },
    /** 加入团队（招聘和事件里共用） */
    add(e) {
      e.startsMonth = S().month + 1;
      S().staff.push(e);
      G.log(`${G.ROLES[e.role].name}${e.name}入职（${e.level}级，月薪 ${G.fmt(e.salary)}）`, 'good');
    },
    remove(id, why) {
      const s = S(), e = s.staff.find(x => x.id === id);
      if (!e) return null;
      s.staff = s.staff.filter(x => x.id !== id);
      G.log(`${G.ROLES[e.role].name}${e.name}${why || '离职'}`);
      return e;
    },
  };

  G.act.hire = function (id) {
    const s = S(), c = s.candidates.find(x => x.id === id);
    if (!c) return fail('候选人已经走了');
    const e = G.guard(0, 0); if (e) return fail(e);
    if (s.staff.length >= G.Staff.slots()) return fail(`编制已满（${G.Staff.slots()} 人），升级门店可以扩编`);
    s.candidates = s.candidates.filter(x => x.id !== id);
    G.Staff.add(c);
    return ok(`${c.name}下个月开始干活`);
  };

  G.act.fire = function (id) {
    const s = S(), emp = s.staff.find(x => x.id === id);
    if (!emp) return fail('没有这个人');
    const e = G.guard(0, emp.salary); if (e) return fail(e);
    G.spend(emp.salary, '人事');                // 补偿一个月工资
    G.Staff.remove(id, `被辞退，补偿 ${G.fmt(emp.salary)}`);
    return ok(`${emp.name}已辞退`);
  };
})();
