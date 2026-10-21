/* Preferences are optional: blocked storage or a full quota must never stop editing.
 * Cache values in this tab, and stay in memory-only mode after any storage failure.
 * In particular, don't read stale disk values after a failed write. */
(function (G) {
  'use strict';
  const memory = new Map();
  let persistent = true;
  function unavailable() {
    if (!persistent) return;
    persistent = false;
    G.dispatchEvent(new Event('gelfigure-storage-unavailable'));
  }
  function getItem(key) {
    if (persistent || !memory.has(key)) {
      try {
        const value = G.localStorage.getItem(key);
        memory.set(key, value);
        return value;
      } catch (e) { memory.set(key, null); unavailable(); }
    }
    return memory.has(key) ? memory.get(key) : null;
  }
  function setItem(key, value) {
    value = String(value);
    memory.set(key, value);
    if (persistent) {
      try { G.localStorage.setItem(key, value); }
      catch (e) { unavailable(); }
    }
  }
  G.PrefStorage = { getItem, setItem, get persistent() { return persistent; } };
})(window);
