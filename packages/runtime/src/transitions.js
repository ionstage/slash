/**
 * Transition registry: how a boundary between two vertically stacked
 * sections plays. The player opens a *band* of `span` scroll units straddling
 * a seam; inside it both sections render and the transition drives how they
 * blend. `p` runs 0→1 across the band (outgoing → incoming).
 *
 * Each banded transition provides:
 *  - `weights(p)` → { from, to }: opacity of the outgoing / incoming section.
 *  - `cameraMix(p)` → 0..1: how far the camera has moved from the outgoing
 *    section's viewpoint to the incoming section's viewpoint.
 *
 * `cut` is not banded — the player swaps sections instantly at the seam.
 * New styles (e.g. N3's `continuity`) drop in here without touching the player.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (p) => p * p * (3 - 2 * p);
/** A crossfade centered at `mid`, `width` wide — 0 before, 1 after. */
const ramp = (p, mid, width) => smoothstep(clamp01((p - (mid - width / 2)) / width));

/** @type {Record<string, { banded: boolean, stacked?: boolean, defaultSpan?: number, weights?: (p: number) => {from: number, to: number}, cameraMix?: (p: number) => number }>} */
export const TRANSITIONS = {
  // Instant swap at the seam (the default). No band, no dual render.
  cut: { banded: false },

  // Both sections dissolve across the whole band; the camera eases from the
  // outgoing viewpoint to the incoming one so the incoming lands framed.
  crossfade: {
    banded: true,
    defaultSpan: 0.5,
    weights: (p) => ({ from: 1 - p, to: p }),
    cameraMix: smoothstep,
  },

  // The camera glides the length of the band (the move is the star); the
  // visibility swap is a quick dissolve around the midpoint.
  camera: {
    banded: true,
    defaultSpan: 0.9,
    weights: (p) => {
      const to = ramp(p, 0.5, 0.34);
      return { from: 1 - to, to };
    },
    cameraMix: smoothstep,
  },

  // Both stages coexist at an authored `offset` (stacked, no fade) while a
  // carried actor walks across the seam; the camera glides from the outgoing
  // viewpoint to the incoming one. `stacked` tells the player to place the
  // incoming group (and its camera) at `offset` inside the band and to hand
  // carried actors off at the band's far edge. See player.js.
  continuity: {
    banded: true,
    stacked: true,
    defaultSpan: 1,
    weights: () => ({ from: 1, to: 1 }),
    cameraMix: smoothstep,
  },
};

/**
 * Resolve an edge's transition to a concrete spec with a numeric span.
 * Unknown or missing types fall back to `cut`. `carry`/`offset` are carried
 * through for `continuity`.
 * @param {{ type?: string, span?: number, carry?: string[], offset?: number[] } | undefined} transition
 */
export function resolveTransition(transition) {
  const type = transition?.type ?? 'cut';
  const def = TRANSITIONS[type] ?? TRANSITIONS.cut;
  if (!def.banded) return { type: 'cut', banded: false, span: 0, def };
  return {
    type,
    banded: true,
    stacked: def.stacked ?? false,
    span: transition?.span ?? def.defaultSpan,
    carry: transition?.carry ?? [],
    offset: transition?.offset ?? [0, 0, 0],
    def,
  };
}
