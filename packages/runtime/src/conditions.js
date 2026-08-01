/**
 * State-condition evaluation and branch resolution. Pure module (Node-testable).
 */

/**
 * @param {{key: string, equals: unknown} | undefined} condition
 * @param {(key: string) => unknown} get State getter.
 * @returns {boolean} true when there is no condition or it holds.
 */
export function evalCondition(condition, get) {
  return !condition || get(condition.key) === condition.equals;
}

/**
 * Resolve which story node follows `storyEntry`: the first matching branch
 * wins, otherwise `next`, otherwise null (story ends).
 *
 * @param {{next?: string | null, branches?: Array<{when: any, next: string}>}} storyEntry
 * @param {(key: string) => unknown} get
 * @returns {string | null}
 */
export function resolveNext(storyEntry, get) {
  for (const branch of storyEntry.branches ?? []) {
    if (evalCondition(branch.when, get)) return branch.next;
  }
  return storyEntry.next ?? null;
}
