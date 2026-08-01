/**
 * Story state, initialized from state.json (flags and counters), with
 * optional localStorage persistence and change notification (state-change
 * triggers and hidden elements re-evaluate through `subscribe`).
 */

/**
 * @param {{ flags?: Record<string, {initial: boolean}>, counters?: Record<string, {initial: number}> }} stateDef
 * @param {{ storageKey?: string }} [options] Provide a storageKey to persist.
 */
export function createStateStore(stateDef, { storageKey } = {}) {
  const values = new Map();
  const listeners = new Set();

  function initials() {
    values.clear();
    for (const [key, def] of Object.entries(stateDef.flags ?? {})) values.set(key, def.initial);
    for (const [key, def] of Object.entries(stateDef.counters ?? {})) values.set(key, def.initial);
  }
  initials();

  if (storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      for (const [key, value] of Object.entries(saved)) {
        if (values.has(key)) values.set(key, value);
      }
    } catch {
      /* corrupt storage: keep initials */
    }
  }

  function persist() {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(values)));
    } catch {
      /* quota/private mode: state stays in-memory */
    }
  }

  return {
    get: (key) => values.get(key),
    set(key, value) {
      if (!values.has(key)) console.warn(`[slash] setState: unknown state key "${key}"`);
      const before = values.get(key);
      values.set(key, value);
      persist();
      if (before !== value) for (const fn of listeners) fn(key, value);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot: () => Object.fromEntries(values),
    reset() {
      initials();
      if (storageKey) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
      }
      for (const fn of listeners) fn(null, null);
    },
  };
}
