/**
 * Scroll → world mapping for the continuous vertical world.
 *
 * The whole runtime is driven by one scalar: `units` (viewport-heights of
 * scroll, from the native scroll driver). This module turns that scalar into
 * everything the world player needs, and is the single source of truth for the
 * mapping. It is a pure module (no Three.js) so it can be unit-tested in Node
 * and reasoned about in isolation — the same role `tracks.js` plays for
 * keyframes.
 *
 * The camera descends through a world that is fixed in space:
 *
 *     travel = units * travelPerUnit          // metres the camera has descended
 *     g      = clamp(units / length, 0, 1)    // global progress for atmosphere tracks
 *     camera = travelPoint + camera.offset    // travelPoint.y = -travel (+ drift)
 *     layerY = -(1 - parallax) * travel        // per-layer parallax (see below)
 *     rigY   = -travel                         // the traveler rig rides with the camera
 *
 * Perspective already makes near objects stream past faster than far ones; the
 * per-layer `parallax` factor adds *deliberate* extra separation on top:
 *   parallax = 1 → the layer is true world space (full parallax);
 *   parallax = 0 → the layer rides with the camera (appears infinitely far).
 */

import { sampleTrack } from './tracks.js';

/**
 * Metres the camera has descended at a given scroll position.
 * @param {number} units Scroll position in viewport-heights.
 * @param {{ travelPerUnit?: number }} world
 * @returns {number}
 */
export function travelAt(units, world) {
  return units * (world.travelPerUnit ?? 1);
}

/**
 * Global progress g ∈ [0,1] across the whole world — the axis atmosphere
 * (fog, lights, effects) and actor tracks are keyframed against.
 * @param {number} units
 * @param {{ length?: number }} world
 * @returns {number}
 */
export function progressAt(units, world) {
  const length = world.length || 1;
  return Math.min(1, Math.max(0, units / length));
}

/**
 * Vertical offset applied to a parallax layer's group. Chosen so the layer's
 * apparent rise-rate (relative to the descending camera) equals `parallax`:
 * world-space layers (parallax 1) stay put and rise at full rate; distant
 * layers (parallax → 0) follow the camera down and barely move on screen.
 * @param {number} parallax
 * @param {number} travel
 * @returns {number}
 */
export function layerOffset(parallax, travel) {
  return -(1 - parallax) * travel || 0; // normalize -0 → 0
}

/**
 * Vertical offset of the traveler rig — it descends with the camera so
 * camera-following actors stay framed while world landmarks stream past.
 * @param {number} travel
 * @returns {number}
 */
export function rigOffset(travel) {
  return -travel || 0; // normalize -0 → 0
}

/**
 * The camera pose at progress g / descent `travel`. Position and look-at are
 * authored relative to the descending travel point; `drift` adds subtle,
 * art-directed motion keyframed over g.
 *
 * @param {any} world Validated world document (uses `world.camera`).
 * @param {number} g Global progress in [0,1].
 * @param {number} travel Metres descended (from {@link travelAt}).
 * @returns {{ position: number[], target: number[], fov: number }}
 */
export function cameraPose(world, g, travel) {
  const cam = world.camera;
  const offset = cam.offset ?? [0, 0, 0];
  const target = cam.target ?? [0, 0, 0];
  const baseY = -travel; // the travel point descends with scroll

  const pos = [offset[0], baseY + offset[1], offset[2]];
  const tgt = [target[0], baseY + target[1], target[2]];

  const drift = cam.drift;
  if (drift?.position) {
    const d = sampleTrack(drift.position, g);
    pos[0] += d[0];
    pos[1] += d[1];
    pos[2] += d[2];
  }
  if (drift?.target) {
    const d = sampleTrack(drift.target, g);
    tgt[0] += d[0];
    tgt[1] += d[1];
    tgt[2] += d[2];
  }
  const fov = (cam.fov ?? 50) + (drift?.fov ? sampleTrack(drift.fov, g) : 0);
  return { position: pos, target: tgt, fov };
}
