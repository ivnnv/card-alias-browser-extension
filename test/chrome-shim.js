// In-memory stand-in for the chrome.* APIs so test/fixture.html runs in a plain tab.
(() => {
  const data = {};
  const changeListeners = [];
  const messageListeners = [];
  const notify = (changes) => queueMicrotask(() => changeListeners.forEach((f) => f(changes, 'sync')));

  const sync = {
    async get(keys) {
      if (keys == null) return structuredClone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: data[k], newValue: v };
        data[k] = structuredClone(v);
      }
      notify(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const k of [].concat(keys)) {
        changes[k] = { oldValue: data[k] };
        delete data[k];
      }
      notify(changes);
    },
  };

  window.chrome = {
    storage: { sync, onChanged: { addListener: (f) => changeListeners.push(f) } },
    runtime: { onMessage: { addListener: (f) => messageListeners.push(f) } },
  };
  window.__cardAliasTest = {
    data,
    contextMenu(selection = '') {
      messageListeners.forEach((f) => f({ type: 'card-alias:add', selection }));
    },
  };
})();
