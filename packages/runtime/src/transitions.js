/**
 * Transition registry: how a boundary between two vertically stacked
 * sections plays. Kept as an extension seam — a new style drops in here
 * without touching the player.
 *
 * The current scope ships only `cut`: an instant swap at the seam, with no
 * band and no dual-section render. Banded styles (crossfade, camera move,
 * continuity) were removed while the runtime is narrowed to scroll↔content
 * sync; re-add them here (with a `banded: true` entry and the player's band
 * controller) when the seam experience is revisited.
 */

/** @type {Record<string, { banded: boolean }>} */
export const TRANSITIONS = {
  // Instant swap at the seam (the default). No band, no dual render.
  cut: { banded: false },
};

/**
 * Resolve an edge's transition to a concrete spec. Unknown or missing types
 * fall back to `cut`.
 * @param {{ type?: string } | undefined} transition
 */
export function resolveTransition(transition) {
  const type = transition?.type ?? 'cut';
  const def = TRANSITIONS[type] ?? TRANSITIONS.cut;
  return { type: def === TRANSITIONS.cut ? 'cut' : type, banded: false, span: 0, def };
}
