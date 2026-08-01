import * as THREE from 'three';
import { sampleTrack } from './tracks.js';
import { evalCondition } from './conditions.js';
import { applyStyle } from './styles.js';
import { createEffect } from './effects.js';

const DEG = Math.PI / 180;

/**
 * Assembles one scene document into a Three.js group and drives it from the
 * scene's progress axis: actor tracks, the camera viewpoint (held, with
 * optional drift), glTF clip playback and event triggers. Action execution
 * is delegated to the player via `ctx.run`.
 *
 * @param {any} sceneDoc Validated scene document.
 * @param {{
 *   assets: ReturnType<import('./assets.js').createAssetLibrary>,
 *   getState?: (key: string) => unknown,
 *   style?: string,
 *   outline?: object,
 * }} deps getState powers `when` gates, state triggers and visibleWhen;
 *   defaults to "no state" (all conditions with a key fail). style/outline
 *   come from project.renderStyle.
 */
export async function createScenePlayer(
  sceneDoc,
  { assets, getState = () => undefined, style = 'toon', outline = {} },
) {
  const group = new THREE.Group();
  group.name = `scene:${sceneDoc.id}`;

  const stage = await assets.instantiate(sceneDoc.stage.assetId);
  applyTransform(stage.object, sceneDoc.stage.transform);
  applyStyle(stage.object, style, outline);
  group.add(stage.object);

  /** @type {Map<string, {def: any, object: import('three').Object3D, clips: any[], mixer: THREE.AnimationMixer | null}>} */
  const actors = new Map();
  for (const def of sceneDoc.actors ?? []) {
    const { object, clips } = await assets.instantiate(def.assetId);
    object.userData.slashActorId = def.id;
    applyTransform(object, def.transform);
    applyStyle(object, style, outline);
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(object) : null;
    if (mixer && def.idleClip) {
      const clip = THREE.AnimationClip.findByName(clips, def.idleClip);
      if (clip) mixer.clipAction(clip).play();
      else console.warn(`[slash] idle clip "${def.idleClip}" not found on actor "${def.id}"`);
    }
    actors.set(def.id, { def, object, clips, mixer });
    group.add(object);
  }

  // Scene lighting: when authored, the player switches the viewer's
  // default lights off (see hasLights).
  const lights = new Map();
  for (const def of sceneDoc.lights ?? []) {
    const color = new THREE.Color(...(def.color ?? [1, 1, 1]));
    const intensity = def.intensity ?? 1;
    let light;
    if (def.type === 'ambient') light = new THREE.AmbientLight(color, intensity);
    else if (def.type === 'point') light = new THREE.PointLight(color, intensity, def.distance ?? 0);
    else {
      light = new THREE.DirectionalLight(color, intensity);
      light.target.position.fromArray(def.target ?? [0, 0, 0]);
      group.add(light.target);
    }
    if (def.position) light.position.fromArray(def.position);
    lights.set(def.id, { def, light });
    group.add(light);
  }

  const effects = new Map();
  for (const def of sceneDoc.effects ?? []) {
    const effect = createEffect(def);
    effects.set(def.id, effect);
    group.add(effect.object);
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

  function updateLightsAndEffects(t, dt) {
    for (const { def, light } of lights.values()) {
      const tracks = def.tracks ?? {};
      if (tracks.intensity) light.intensity = sampleTrack(tracks.intensity, t);
      if (tracks.color) light.color.setRGB(...sampleTrack(tracks.color, t));
      if (tracks.position) light.position.fromArray(sampleTrack(tracks.position, t));
    }
    for (const effect of effects.values()) effect.update(dt, t);
  }

  return {
    doc: sceneDoc,
    group,
    actors,
    effects,
    hasLights: lights.size > 0,

    /**
     * Ambient-only advance (idle clips, particles) without touching
     * progress, camera or events — used by the editor viewport.
     */
    tickAmbient(dt) {
      for (const { mixer } of actors.values()) mixer?.update(dt);
      updateLightsAndEffects(lastT, dt);
    },

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

      // Camera holds the section's viewpoint (a comic-panel shot); optional
      // `drift` adds restrained offsets over progress.
      const { viewpoint, drift } = sceneDoc.camera;
      const [px, py, pz] = viewpoint.position;
      const [lx, ly, lz] = viewpoint.target;
      if (drift?.position) {
        const d = sampleTrack(drift.position, t);
        camera.position.set(px + d[0], py + d[1], pz + d[2]);
      } else {
        camera.position.set(px, py, pz);
      }
      if (drift?.target) {
        const d = sampleTrack(drift.target, t);
        camera.lookAt(lx + d[0], ly + d[1], lz + d[2]);
      } else {
        camera.lookAt(lx, ly, lz);
      }
      camera.fov = (viewpoint.fov ?? 50) + (drift?.fov ? sampleTrack(drift.fov, t) : 0);
      camera.updateProjectionMatrix();

      applyVisibility();
      updateLightsAndEffects(t, dt);

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
