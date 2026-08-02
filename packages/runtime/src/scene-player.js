import * as THREE from 'three';
import { sampleTrack } from './tracks.js';
import { applyStyle } from './styles.js';
import { createEffect } from './effects.js';

const DEG = Math.PI / 180;

/**
 * Assembles one scene document into a Three.js group and drives it from the
 * scene's progress axis: actor tracks, the camera viewpoint (held, with
 * optional drift), glTF idle-clip playback, lights and effects. Scenes are
 * passive — scrolling is the only input.
 *
 * @param {any} sceneDoc Validated scene document.
 * @param {{
 *   assets: ReturnType<import('./assets.js').createAssetLibrary>,
 *   style?: string,
 *   outline?: object,
 * }} deps style/outline come from project.renderStyle.
 */
export async function createScenePlayer(sceneDoc, { assets, style = 'toon', outline = {} }) {
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
    else if (def.type === 'point')
      light = new THREE.PointLight(color, intensity, def.distance ?? 0);
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

  function updateLightsAndEffects(t, dt) {
    for (const { def, light } of lights.values()) {
      const tracks = def.tracks ?? {};
      if (tracks.intensity) light.intensity = sampleTrack(tracks.intensity, t);
      if (tracks.color) light.color.setRGB(...sampleTrack(tracks.color, t));
      if (tracks.position) light.position.fromArray(sampleTrack(tracks.position, t));
    }
    for (const effect of effects.values()) effect.update(dt, t);
  }

  // The section's held viewpoint at progress t, with optional drift offsets.
  function cameraPose(t) {
    const { viewpoint, drift } = sceneDoc.camera;
    const pos = [...viewpoint.position];
    const tgt = [...viewpoint.target];
    if (drift?.position) {
      const d = sampleTrack(drift.position, t);
      pos[0] += d[0];
      pos[1] += d[1];
      pos[2] += d[2];
    }
    if (drift?.target) {
      const d = sampleTrack(drift.target, t);
      tgt[0] += d[0];
      tgt[1] += d[1];
      tgt[2] += d[2];
    }
    const fov = (viewpoint.fov ?? 50) + (drift?.fov ? sampleTrack(drift.fov, t) : 0);
    return { position: pos, target: tgt, fov };
  }

  return {
    doc: sceneDoc,
    group,
    actors,
    effects,
    hasLights: lights.size > 0,

    /**
     * Advance the scene to progress t.
     * @param {number} t Scene progress in [0,1].
     * @param {number} dt Seconds since last frame (drives clip playback).
     * @param {THREE.PerspectiveCamera} camera
     */
    update(t, dt, camera) {
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

      // Camera holds the section's viewpoint (a comic-panel shot).
      const pose = cameraPose(t);
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();

      updateLightsAndEffects(t, dt);
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
