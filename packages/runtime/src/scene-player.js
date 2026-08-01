import * as THREE from 'three';
import { sampleTrack } from './tracks.js';
import { evalCondition } from './conditions.js';

const DEG = Math.PI / 180;

/**
 * Assembles one scene document into a Three.js group and drives it from the
 * scene's progress axis: actor tracks, camera tracks, glTF clip playback and
 * event triggers. Action execution is delegated to the player via `ctx.run`.
 *
 * @param {any} sceneDoc Validated scene document.
 * @param {{
 *   assets: ReturnType<import('./assets.js').createAssetLibrary>,
 *   getState?: (key: string) => unknown,
 * }} deps getState powers `when` gates, state triggers and visibleWhen;
 *   defaults to "no state" (all conditions with a key fail).
 */
export async function createScenePlayer(sceneDoc, { assets, getState = () => undefined }) {
  const group = new THREE.Group();
  group.name = `scene:${sceneDoc.id}`;

  const stage = await assets.instantiate(sceneDoc.stage.assetId);
  applyTransform(stage.object, sceneDoc.stage.transform);
  group.add(stage.object);

  /** @type {Map<string, {def: any, object: import('three').Object3D, clips: any[], mixer: THREE.AnimationMixer | null}>} */
  const actors = new Map();
  for (const def of sceneDoc.actors ?? []) {
    const { object, clips } = await assets.instantiate(def.assetId);
    object.userData.slashActorId = def.id;
    applyTransform(object, def.transform);
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(object) : null;
    if (mixer && def.idleClip) {
      const clip = THREE.AnimationClip.findByName(clips, def.idleClip);
      if (clip) mixer.clipAction(clip).play();
      else console.warn(`[slash] idle clip "${def.idleClip}" not found on actor "${def.id}"`);
    }
    actors.set(def.id, { def, object, clips, mixer });
    group.add(object);
  }

  let lastT = 0;
  const fired = new Set();

  // `when` is checked before `once` is consumed: a gated event stays armed
  // until its condition holds at trigger time.
  function shouldFire(event) {
    if (event.when && !evalCondition(event.when, getState)) return false;
    if (event.once !== false && fired.has(event.id)) return false;
    fired.add(event.id);
    return true;
  }

  function applyVisibility() {
    for (const { def, object } of actors.values()) {
      if (def.visibleWhen) object.visible = evalCondition(def.visibleWhen, getState);
    }
  }

  return {
    doc: sceneDoc,
    group,
    actors,

    /**
     * Advance the scene to progress t.
     * @param {number} t Scene progress in [0,1].
     * @param {number} dt Seconds since last frame (drives clip playback).
     * @param {THREE.PerspectiveCamera} camera
     * @param {{ run: (event: any) => void }} ctx
     */
    update(t, dt, camera, ctx) {
      for (const { def, object, mixer } of actors.values()) {
        const tracks = def.tracks ?? {};
        if (tracks.position) object.position.fromArray(sampleTrack(tracks.position, t));
        if (tracks.rotation) {
          const [x, y, z] = sampleTrack(tracks.rotation, t);
          object.rotation.set(x * DEG, y * DEG, z * DEG);
        }
        if (tracks.scale) object.scale.fromArray(sampleTrack(tracks.scale, t));
        mixer?.update(dt);
      }

      const cam = sceneDoc.camera;
      camera.position.fromArray(sampleTrack(cam.tracks.position, t));
      const look = sampleTrack(cam.tracks.lookAt, t);
      camera.lookAt(look[0], look[1], look[2]);
      camera.fov = cam.tracks.fov ? sampleTrack(cam.tracks.fov, t) : (cam.fov ?? 50);
      camera.updateProjectionMatrix();

      applyVisibility();

      for (const event of sceneDoc.events ?? []) {
        if (event.trigger.type === 'progress') {
          if (lastT < event.trigger.at && t >= event.trigger.at && shouldFire(event)) ctx.run(event);
        } else if (event.trigger.type === 'state') {
          // Level-triggered on the progress loop: fires once the state matches.
          if (getState(event.trigger.key) === event.trigger.equals && shouldFire(event))
            ctx.run(event);
        }
      }
      lastT = t;
    },

    /**
     * Dispatch a tap. Fires tap events targeting the tapped actor, plus
     * untargeted tap events on any tap.
     * @param {string | null} actorId
     * @param {{ run: (event: any) => void }} ctx
     */
    handleTap(actorId, ctx) {
      for (const event of sceneDoc.events ?? []) {
        if (event.trigger.type !== 'tap') continue;
        if (event.trigger.target && event.trigger.target !== actorId) continue;
        if (shouldFire(event)) ctx.run(event);
      }
    },
  };
}

function applyTransform(object, transform) {
  if (!transform) return;
  if (transform.position) object.position.fromArray(transform.position);
  if (transform.rotation) {
    const [x, y, z] = transform.rotation;
    object.rotation.set(x * DEG, y * DEG, z * DEG);
  }
  if (transform.scale !== undefined) {
    if (typeof transform.scale === 'number') object.scale.setScalar(transform.scale);
    else object.scale.fromArray(transform.scale);
  }
}
