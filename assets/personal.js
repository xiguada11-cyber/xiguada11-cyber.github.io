window.ERPersonal = (() => {
  const key = 'erPersonalState.v1';
  const empty = { favorites: {}, later: {}, read: {}, hidden: {}, weights: {} };
  function load() {
    try { return { ...empty, ...(JSON.parse(localStorage.getItem(key) || '{}')) }; }
    catch { return { ...empty }; }
  }
  function save(state) { localStorage.setItem(key, JSON.stringify(state)); }
  function toggle(bucket, item) {
    const state = load();
    state[bucket] = state[bucket] || {};
    if (state[bucket][item.id]) delete state[bucket][item.id];
    else state[bucket][item.id] = { id: item.id, title: item.title, url: item.sourceUrl || item.sourceUrl || item.url || item.officialUrl || '#', type: item.contentType || item.category || '', savedAt: new Date().toISOString() };
    save(state);
    return state;
  }
  function has(bucket, id) { return !!load()[bucket]?.[id]; }
  function label(bucket, id, on, off) { return has(bucket, id) ? on : off; }
  function setWeight(name, value) { const s = load(); s.weights[name] = Number(value); save(s); return s; }
  function getWeight(name, fallback = 5) { return load().weights?.[name] ?? fallback; }
  function all(bucket) { return Object.values(load()[bucket] || {}); }
  return { load, save, toggle, has, label, setWeight, getWeight, all };
})();
