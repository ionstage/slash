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
  return resolveNextEdge(storyEntry, get).next;
}

/**
 * Like {@link resolveNext}, but also returns the chosen edge's `transition`
 * (the branch's, or the node's for `next`). Used to play the seam into the
 * next section.
 *
 * @param {{next?: string | null, transition?: any, branches?: Array<{when: any, next: string, transition?: any}>}} storyEntry
 * @param {(key: string) => unknown} get
 * @returns {{ next: string | null, transition: any }}
 */
export function resolveNextEdge(storyEntry, get) {
  for (const branch of storyEntry.branches ?? []) {
    if (evalCondition(branch.when, get)) return { next: branch.next, transition: branch.transition };
  }
  return { next: storyEntry.next ?? null, transition: storyEntry.transition };
}
