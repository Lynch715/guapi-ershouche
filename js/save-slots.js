/* 三个手动档位与自动续玩互相独立；只在玩家明确保存/导入时改写档位。 */
var G = globalThis.G = globalThis.G || {};
(function () {
  const PREFIX = 'usedcar_sim_slot_', MIGRATION = 'usedcar_sim_slots_migrated_v1';
  const validId = id => Number.isInteger(id) && id >= 1 && id <= 3;
  const key = id => PREFIX + id + '_v1';
  const fail = msg => ({ ok: false, msg });
  const storage = () => {
    if (typeof localStorage === 'undefined') throw new Error('浏览器存储不可用，请先导出当前进度。');
    return localStorage;
  };
  const errorText = e => e.name === 'QuotaExceededError' || e.name === 'SecurityError'
    ? '浏览器没能保存，原档位未改变。请先导出当前进度备份。'
    : e.message || '存档没有读出来，原档位已保留。';
  const summary = s => {
    const before = G.state;
    try {
      G.state = s;
      return { month: s.month, net: G.netWorth(), dark: s.dark, rep: s.rep,
        cash: s.cash, cars: s.cars.length, locationId: s.store.location, level: s.store.level, over: s.over,
        location: G.LOCATIONS[s.store.location].name, store: G.STORE_LEVELS[s.store.level].name };
    } finally { G.state = before; }
  };
  const read = id => {
    if (!validId(id)) throw new Error('请选择档位 1、2 或 3。');
    const raw = storage().getItem(key(id));
    if (raw === null) return { id, raw, empty: true, status: 'empty' };
    let entry;
    try {
      entry = JSON.parse(raw);
      if (entry?.format !== 'guapi-slot-v1' || typeof entry.data !== 'string') throw new Error('档位格式无效');
      const state = G.parseSave(entry.data);
      return { id, raw, empty: false, status: 'ready', data: entry.data, savedAt: entry.savedAt,
        legacy: entry.legacy === true, summary: summary(state) };
    } catch (_) {
      return { id, raw, empty: false, status: 'invalid', data: typeof entry?.data === 'string' ? entry.data : raw,
        msg: '存档内容异常，原文件已保留，可先导出备份。' };
    }
  };
  const write = (id, text, expected) => {
    try {
      G.parseSave(text); // 先完整校验；失败时不写任何存储，也不替换当前局。
      const previous = read(id);
      if (expected !== undefined && previous.raw !== expected) return fail('这个档位刚刚有变化，请返回存档页核对后再操作。');
      const entry = { format: 'guapi-slot-v1', savedAt: new Date().toISOString(), data: text };
      storage().setItem(key(id), JSON.stringify(entry));
      return { ok: true, msg: '已保存到档位 ' + id + '。' };
    } catch (e) { return fail(errorText(e)); }
  };
  const slots = G.SaveSlots = {
    count: 3,
    key,
    resume() {
      try {
        const raw = storage().getItem(G.SAVE_KEY);
        if (raw === null) return { status: 'empty' };
        try { return { status: 'ready', summary: summary(G.parseSave(raw)) }; }
        catch (_) { return { status: 'invalid', msg: '上次的自动进度暂时读不出来，原文件仍保留。可以选择其他档位或导入备份。' }; }
      } catch (e) { return { status: 'unavailable', msg: errorText(e) }; }
    },
    init() {
      try {
        const ls = storage();
        if (ls.getItem(MIGRATION) === '1') return true;
        const legacy = ls.getItem(G.SAVE_KEY);
        if (legacy && ls.getItem(key(1)) === null) {
          G.parseSave(legacy);
          ls.setItem(key(1), JSON.stringify({ format: 'guapi-slot-v1', savedAt: new Date().toISOString(), data: legacy, legacy: true }));
        }
        ls.setItem(MIGRATION, '1');
        slots.error = '';
        return true;
      } catch (e) { slots.error = '旧进度仍保留。' + errorText(e); return false; }
    },
    list() {
      return [1, 2, 3].map(id => {
        try { return read(id); }
        catch (e) { return { id, empty: false, status: 'unavailable', msg: errorText(e) }; }
      });
    },
    get(id) { try { return { ok: true, ...read(id) }; } catch (e) { return fail(errorText(e)); } },
    save(id, expected) {
      if (!G.state) return fail('先开张或读取一份存档，再保存到档位。');
      return write(id, JSON.stringify(G.state), expected);
    },
    import(id, text, expected) {
      const result = write(id, text, expected);
      return result.ok ? { ok: true, msg: '已导入档位 ' + id + '，点击「读取」即可继续。' } : result;
    },
    load(id, expected) {
      try {
        const slot = read(id);
        if (expected !== undefined && slot.raw !== expected) return fail('这个档位刚刚有变化，请返回存档页核对后再读取。');
        if (slot.status !== 'ready') return fail(slot.msg || '这个档位还是空的。');
        // importSave 在写入自动续玩成功后才提交全局状态；三个手动档位保持不变。
        return G.importSave(slot.data);
      } catch (e) { return fail(errorText(e)); }
    },
    export(id) {
      try {
        const slot = read(id);
        if (slot.empty) return fail('这个档位还是空的。');
        return { ok: true, text: slot.data, month: slot.summary?.month, invalid: slot.status !== 'ready' };
      } catch (e) { return fail(errorText(e)); }
    },
  };
  slots.init();
})();
