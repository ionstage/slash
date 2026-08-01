/**
 * Content-format migrations. Old projects are upgraded to the current
 * format on load, so the runtime, editor and validator only ever deal with
 * the latest shape. Migrations are pure and return new objects.
 *
 * Scene v1 → v2: the camera moved from position/lookAt/fov keyframe *tracks*
 * to a single held `viewpoint` (the shot) plus optional `drift` offsets. The
 * first keyframe becomes the viewpoint; any further motion is preserved
 * losslessly as drift, so a migrated v1 scene plays identically to the
 * original — see migrateScene.
 */

/** @param {number[]} a @param {number[]} b */
const sub = (a, b) => a.map((v, i) => v - b[i]);
const withEasing = (k) => (k.easing ? { easing: k.easing } : {});
/** Keyframe values re-expressed as offsets from `base`. */
const offsets = (keyframes, base) =>
  keyframes.map((k) => ({ t: k.t, value: sub(k.value, base), ...withEasing(k) }));

/**
 * Upgrade a single scene document to the current format version.
 * A no-op (returns the input) for scenes already at v2 or newer.
 * @param {any} scene
 * @returns {any}
 */
export function migrateScene(scene) {
  if (!scene || scene.formatVersion >= 2) return scene;
  const out = { ...scene, formatVersion: 2 };
  const cam = scene.camera ?? {};
  if (cam.tracks && !cam.viewpoint) out.camera = cameraFromTracks(cam);
  return out;
}

function cameraFromTracks(cam) {
  const posKf = cam.tracks.position ?? [{ t: 0, value: [0, 1.6, 5] }];
  const lookKf = cam.tracks.lookAt ?? [{ t: 0, value: [0, 1.2, 0] }];
  const fovKf = cam.tracks.fov;
  const basePos = posKf[0].value;
  const baseLook = lookKf[0].value;

  const viewpoint = { position: basePos, target: baseLook };
  const baseFov = fovKf ? fovKf[0].value : cam.fov;
  if (baseFov != null) viewpoint.fov = baseFov;

  /** @type {Record<string, any>} */
  const drift = {};
  if (posKf.length > 1) drift.position = offsets(posKf, basePos);
  if (lookKf.length > 1) drift.target = offsets(lookKf, baseLook);
  if (fovKf && fovKf.length > 1)
    drift.fov = fovKf.map((k) => ({ t: k.t, value: k.value - baseFov, ...withEasing(k) }));

  return Object.keys(drift).length ? { viewpoint, drift } : { viewpoint };
}

/**
 * Migrate every scene in a `{ id: sceneDoc }` map.
 * @param {Record<string, any>} scenes
 * @returns {Record<string, any>}
 */
export function migrateScenes(scenes) {
  const out = {};
  for (const [id, scene] of Object.entries(scenes)) out[id] = migrateScene(scene);
  return out;
}
