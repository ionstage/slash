/**
 * Keyframe track sampling over the scene progress axis t in [0,1].
 * Tracks are arrays of { t, value, easing? } sorted by t, per the scene
 * schema. Values are numbers or fixed-length number arrays (vec3).
 *
 * Pure module (no Three.js) so it can be unit-tested in Node and reused by
 * the editor's scrubber.
 */

const EASING = {
  linear: (u) => u,
  easeIn: (u) => u * u * u,
  easeOut: (u) => 1 - (1 - u) ** 3,
  easeInOut: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2),
  step: (u) => (u >= 1 ? 1 : 0),
};

/**
 * Sample a track at progress t. The easing of the *later* keyframe shapes
 * the segment leading into it (matching the schema's documentation).
 *
 * @param {Array<{t: number, value: number | number[], easing?: string}>} track
 * @param {number} t
 * @returns {number | number[]}
 */
export function sampleTrack(track, t) {
  const first = track[0];
  if (t <= first.t) return first.value;
  const last = track[track.length - 1];
  if (t >= last.t) return last.value;

  let i = 0;
  while (track[i + 1].t < t) i++;
  const k0 = track[i];
  const k1 = track[i + 1];
  const span = k1.t - k0.t;
  const u = span > 0 ? (t - k0.t) / span : 1;
  const eased = (EASING[k1.easing] ?? EASING.linear)(u);
  return lerpValue(k0.value, k1.value, eased);
}

function lerpValue(a, b, u) {
  if (Array.isArray(a)) return a.map((v, i) => v + (b[i] - v) * u);
  return a + (b - a) * u;
}
