window.ERPersonal = (() => {
  const key = 'erPersonalState.v2';
  const legacyKey = 'erPersonalState.v1';
  const empty = { favorites: {}, later: {}, read: {}, hidden: {}, recent: {}, weights: {} };

  function normalize(state = {}) {
    return { ...empty, ...state };
  }

  function load() {
    try {
      const current = JSON.parse(localStorage.getItem(key) || '{}');
      if (Object.keys(current).length) return normalize(current);
      const legacy = JSON.parse(localStorage.getItem(legacyKey) || '{}');
      return normalize(legacy);
    } catch {
      return { ...empty };
    }
  }

  function save(state) {
    localStorage.setItem(key, JSON.stringify(normalize(state)));
  }

  function asItem(item = {}) {
    return {
      id: item.id || item.title || String(Date.now()),
      title: item.title || item.name || '未命名内容',
      url: item.sourceUrl || item.url || item.officialUrl || item.guideUrl || '#',
      type: item.contentType || item.category || item.projectType || '',
      savedAt: new Date().toISOString()
    };
  }

  function remember(item) {
    const state = load();
    const data = asItem(item);
    state.recent[data.id] = data;
    const recent = Object.values(state.recent)
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
      .slice(0, 12);
    state.recent = Object.fromEntries(recent.map((entry) => [entry.id, entry]));
    save(state);
    return state;
  }

  function toggle(bucket, item) {
    const state = load();
    state[bucket] = state[bucket] || {};
    const data = asItem(item);
    if (state[bucket][data.id]) delete state[bucket][data.id];
    else state[bucket][data.id] = data;
    if (bucket !== 'hidden') {
      state.recent[data.id] = { ...data, savedAt: new Date().toISOString() };
    }
    save(state);
    return state;
  }

  function remove(bucket, id) {
    const state = load();
    if (state[bucket]) delete state[bucket][id];
    save(state);
    return state;
  }

  function has(bucket, id) {
    return !!load()[bucket]?.[id];
  }

  function label(bucket, id, on, off) {
    return has(bucket, id) ? on : off;
  }

  function setWeight(name, value) {
    const state = load();
    state.weights[name] = Number(value);
    save(state);
    return state;
  }

  function getWeight(name, fallback = 5) {
    return load().weights?.[name] ?? fallback;
  }

  function all(bucket) {
    return Object.values(load()[bucket] || {})
      .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  }

  return { load, save, toggle, remove, has, label, setWeight, getWeight, all, remember };
})();
