/**
 * In-memory story state, initialized from state.json (flags and counters).
 * Persistence (localStorage) arrives in M3.
 */

/**
 * @param {{ flags?: Record<string, {initial: boolean}>, counters?: Record<string, {initial: number}> }} stateDef
 */
export function createStateStore(stateDef) {
  const values = new Map();

  function reset() {
    values.clear();
    for (const [key, def] of Object.entries(stateDef.flags ?? {})) values.set(key, def.initial);
    for (const [key, def] of Object.entries(stateDef.counters ?? {})) values.set(key, def.initial);
  }
  reset();

  return {
    get: (key) => values.get(key),
    set(key, value) {
      if (!values.has(key)) console.warn(`[slash] setState: unknown state key "${key}"`);
      values.set(key, value);
    },
    snapshot: () => Object.fromEntries(values),
    reset,
  };
}
