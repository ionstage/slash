import * as THREE from 'three';
import { createViewer } from './viewer.js';
import { createAssetLibrary } from './assets.js';
import { createScrollDriver } from './scroll.js';
import { createPostPipeline } from './post.js';
import { applyStyle } from './styles.js';
import { createEffect } from './effects.js';
import { sampleTrack } from './tracks.js';
import { travelAt, progressAt, layerOffset, rigOffset, cameraPose } from './world-map.js';

const DEG = Math.PI / 180;

/**
 * The world player: plays one continuous vertical world (`world.json`).
 *
 * Scroll is a single axis (`units`, viewport-heights). The camera descends
 * through a world that is fixed in space, so environments stream past while
 * camera-following actors stay framed — an attraction where the stage moves
 * and the characters travel through it. All motion is derived every frame from
 * `units` via the pure mapping in `world-map.js`:
 *
 *   - the camera dollies down (`cameraPose`),
 *   - each parallax layer group is offset (`layerOffset`),
 *   - the traveler rig (camera-following actors, effects, key lights) rides
 *     down with the camera (`rigOffset`),
 *   - atmosphere (fog, lights, effects) and actor tracks are sampled over
 *     global progress `g`.
 *
 * The world is passive — scrolling is the only input.
 *
 * @param {HTMLElement} container
 * @param {Awaited<ReturnType<import('./loader.js').loadProject>>} bundle
 */
export async function createWorldPlayer(container, bundle) {
  const world = bundle.world;
  const viewer = createViewer(container, {
    background: bundle.project.renderStyle?.background,
    maxPixelRatio: bundle.project.settings?.maxPixelRatio,
  });
  const resolveAsset = bundle.resolveAsset ?? ((source) => `${bundle.baseUrl}assets/${source}`);
  const assets = createAssetLibrary(bundle.assetIndex, resolveAsset);

  const renderStyle = bundle.project.renderStyle ?? {};
  const postPipeline = renderStyle.post ? createPostPipeline(viewer, renderStyle.post) : null;
  if (postPipeline) viewer.setRenderOverride(() => postPipeline.render());

  // --- parallax layers + the traveler rig ---
  /** @type {Map<string, {def: any, group: THREE.Group}>} */
  const layers = new Map();
  for (const def of world.layers) {
    const group = new THREE.Group();
    group.name = `layer:${def.id}`;
    layers.set(def.id, { def, group });
    viewer.scene.add(group);
  }
  const rig = new THREE.Group(); // descends with the camera
  rig.name = 'travelRig';
  viewer.scene.add(rig);

  const worldParent = layers.get('world')?.group ?? viewer.scene;

  // --- objects: placed at absolute worldY within their layer ---
  for (const obj of world.objects ?? []) {
    const layer = layers.get(obj.layer);
    if (!layer) {
      console.warn(`[slash] object "${obj.id}" references unknown layer "${obj.layer}"`);
      continue;
    }
    const { object } = await assets.instantiate(obj.assetId);
    object.name = `object:${obj.id}`;
    applyTransform(object, obj.transform);
    object.position.y += obj.worldY;
    applyStyle(object, renderStyle.style, renderStyle.outline);
    layer.group.add(object);
  }

  // --- actors: persistent characters (camera-following ride the rig) ---
  /** @type {Array<{def: any, object: THREE.Object3D, baseY: number, mixer: THREE.AnimationMixer | null}>} */
  const actors = [];
  for (const def of world.actors ?? []) {
    const { object, clips } = await assets.instantiate(def.assetId);
    object.name = `actor:${def.id}`;
    object.userData.slashActorId = def.id;
    applyTransform(object, def.transform);
    const worldFollow = def.follow !== 'camera';
    const baseY = worldFollow ? (def.worldY ?? 0) : 0;
    object.position.y += baseY;
    applyStyle(object, renderStyle.style, renderStyle.outline);
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(object) : null;
    if (mixer && def.idleClip) {
      const clip = THREE.AnimationClip.findByName(clips, def.idleClip);
      if (clip) mixer.clipAction(clip).play();
      else console.warn(`[slash] idle clip "${def.idleClip}" not found on actor "${def.id}"`);
    }
    (worldFollow ? worldParent : rig).add(object);
    actors.push({ def, object, baseY, mixer });
  }

  // --- atmosphere: fog, lights, effects (continuous over global progress g) ---
  const env = world.environment ?? {};

  const fog = env.fog ? new THREE.Fog(0x000000, 1, 100) : projectFog(renderStyle);
  viewer.scene.fog = fog;

  /** @type {Array<{def: any, light: THREE.Light}>} */
  const lights = [];
  for (const def of env.lights ?? []) {
    const light = buildLight(def);
    const parent = def.follow === 'world' ? viewer.scene : rig;
    parent.add(light);
    if (light.target) parent.add(light.target);
    lights.push({ def, light });
  }
  viewer.defaultLights.visible = lights.length === 0;

  /** @type {Array<ReturnType<typeof createEffect>>} */
  const effects = [];
  for (const def of env.effects ?? []) {
    const effect = createEffect(def);
    rig.add(effect.object); // ambient effects travel with the viewer
    effects.push(effect);
  }

  // --- scroll driver over the whole world length ---
  const driver = createScrollDriver(container, { getTotalUnits: () => world.length });

  const progressListeners = new Set();

  viewer.onTick((dt) => {
    const units = driver.update();
    const travel = travelAt(units, world);
    const g = progressAt(units, world);

    // Camera dolly.
    const pose = cameraPose(world, g, travel);
    viewer.camera.position.set(...pose.position);
    viewer.camera.lookAt(...pose.target);
    viewer.camera.fov = pose.fov;
    viewer.camera.updateProjectionMatrix();

    // Parallax layers + traveler rig.
    for (const { def, group } of layers.values()) {
      group.position.y = layerOffset(def.parallax, travel);
    }
    rig.position.y = rigOffset(travel);

    // Persistent actors: tracks are sampled over g (relative to their parent).
    for (const { def, object, baseY, mixer } of actors) {
      const tracks = def.tracks ?? {};
      if (tracks.position) {
        const [x, y, z] = sampleTrack(tracks.position, g);
        object.position.set(x, baseY + y, z);
      }
      if (tracks.rotation) {
        const [x, y, z] = sampleTrack(tracks.rotation, g);
        object.rotation.set(x * DEG, y * DEG, z * DEG);
      }
      if (tracks.scale) object.scale.fromArray(sampleTrack(tracks.scale, g));
      mixer?.update(dt);
    }

    // Atmosphere.
    if (env.fog && viewer.scene.fog) {
      const c = sampleTrack(env.fog.color, g);
      viewer.scene.fog.color.setRGB(c[0], c[1], c[2]);
      viewer.scene.fog.near = sampleTrack(env.fog.near, g);
      viewer.scene.fog.far = sampleTrack(env.fog.far, g);
    }
    for (const { def, light } of lights) {
      const tracks = def.tracks ?? {};
      if (tracks.intensity) light.intensity = sampleTrack(tracks.intensity, g);
      if (tracks.color) light.color.setRGB(...sampleTrack(tracks.color, g));
      if (tracks.position) light.position.fromArray(sampleTrack(tracks.position, g));
    }
    for (const effect of effects) effect.update(dt, g);

    notifyProgress(units, travel, g, pose.position[1]);
  });

  function notifyProgress(units, travel, g, cameraY) {
    if (progressListeners.size === 0) return;
    const layerOffsets = [...layers.values()].map(({ def, group }) => ({
      id: def.id,
      parallax: def.parallax,
      y: group.position.y,
    }));
    for (const cb of progressListeners) {
      cb({ units, totalUnits: world.length, travel, g, cameraY, name: world.name ?? world.id, layers: layerOffsets });
    }
  }

  return {
    viewer,
    /** Subscribe to per-frame progress; returns an unsubscribe function. */
    onProgress(cb) {
      progressListeners.add(cb);
      return () => progressListeners.delete(cb);
    },
    dispose() {
      driver.dispose();
      postPipeline?.dispose();
      viewer.dispose();
    },
  };
}

function projectFog(renderStyle) {
  const f = renderStyle.post?.fog;
  return f ? new THREE.Fog(f.color, f.near, f.far) : null;
}

function buildLight(def) {
  const color = new THREE.Color(...(def.color ?? [1, 1, 1]));
  const intensity = def.intensity ?? 1;
  let light;
  if (def.type === 'ambient') {
    light = new THREE.AmbientLight(color, intensity);
  } else if (def.type === 'point') {
    light = new THREE.PointLight(color, intensity, def.distance ?? 0);
  } else {
    light = new THREE.DirectionalLight(color, intensity);
    light.target.position.fromArray(def.target ?? [0, 0, 0]);
  }
  if (def.position) light.position.fromArray(def.position);
  return light;
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
