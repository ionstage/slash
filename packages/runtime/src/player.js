import * as THREE from 'three';
import { createViewer } from './viewer.js';
import { createAssetLibrary } from './assets.js';
import { createScenePlayer } from './scene-player.js';
import { createScrollDriver } from './scroll.js';
import { createStateStore } from './state.js';

const DEFAULT_SCROLL_LENGTH = 3;

/**
 * The story player: owns the viewer, the scroll driver, story state and all
 * scene players, and maps the global scroll position onto per-scene
 * progress. This is Interactive Mode; Playback Mode (M3) will reuse it with
 * an auto-play driver instead of the scroll driver.
 *
 * @param {HTMLElement} container
 * @param {Awaited<ReturnType<import('./loader.js').loadProject>>} bundle
 */
export async function createPlayer(container, bundle) {
  const viewer = createViewer(container, {
    background: bundle.project.renderStyle?.background,
    maxPixelRatio: bundle.project.settings?.maxPixelRatio,
  });
  const state = createStateStore(bundle.state);
  const assets = createAssetLibrary(bundle.assetIndex, bundle.baseUrl);

  // Linear scene chain: follow `next` links from the story's start scene.
  // Guards against cycles; branching replaces this in M3.
  const order = [];
  const storyEntries = new Map(bundle.story.scenes.map((s) => [s.id, s]));
  const seen = new Set();
  for (let id = bundle.story.start; id && storyEntries.has(id) && !seen.has(id); ) {
    seen.add(id);
    const doc = bundle.scenes[id];
    const length = doc.scrollLength ?? DEFAULT_SCROLL_LENGTH;
    const start = order.length ? order[order.length - 1].start + order[order.length - 1].length : 0;
    order.push({ id, doc, length, start });
    id = storyEntries.get(id).next;
  }
  const totalUnits = order.reduce((sum, e) => sum + e.length, 0);

  // M1 assembles every scene upfront; lazy loading is an M5 concern.
  const scenePlayers = new Map();
  for (const entry of order) {
    scenePlayers.set(entry.id, await createScenePlayer(entry.doc, { assets }));
  }

  const driver = createScrollDriver(container, { totalUnits });

  function runEvent(scene, event) {
    for (const action of event.actions) {
      switch (action.type) {
        case 'log':
          console.log('[slash]', action.message);
          break;
        case 'setState':
          state.set(action.key, action.value);
          break;
        case 'gotoScene':
          jumpToScene(action.scene);
          break;
        case 'playAnimation': {
          const actor = scene.actors.get(action.target);
          const clip = actor && THREE.AnimationClip.findByName(actor.clips, action.clip);
          if (actor?.mixer && clip) {
            const clipAction = actor.mixer.clipAction(clip);
            clipAction.reset();
            clipAction.setLoop(action.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
            clipAction.clampWhenFinished = true;
            clipAction.play();
          } else {
            console.warn(`[slash] playAnimation: no clip "${action.clip}" on actor "${action.target}"`);
          }
          break;
        }
      }
    }
  }

  let active = null;
  const ctx = { run: (event) => runEvent(active, event) };
  const progressListeners = new Set();

  function entryAt(units) {
    for (const entry of order) {
      if (units < entry.start + entry.length) return entry;
    }
    return order[order.length - 1];
  }

  function jumpToScene(id) {
    const entry = order.find((e) => e.id === id);
    if (entry) driver.jumpTo(entry.start);
    else console.warn(`[slash] gotoScene: unknown scene "${id}"`);
  }

  viewer.onTick((dt) => {
    const units = driver.update(dt);
    const entry = entryAt(units);
    const scenePlayer = scenePlayers.get(entry.id);
    if (scenePlayer !== active) {
      if (active) viewer.scene.remove(active.group);
      viewer.scene.add(scenePlayer.group);
      active = scenePlayer;
    }
    const t = Math.min(1, Math.max(0, (units - entry.start) / entry.length));
    active.update(t, dt, viewer.camera, ctx);
    for (const cb of progressListeners) cb({ units, totalUnits, scene: entry.doc, t });
  });

  // Tap: pointer up close to pointer down = tap; raycast into the active scene.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = viewer.renderer.domElement;
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !active) return;
    const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
    down = null;
    if (moved > 8) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, viewer.camera);
    const hit = raycaster.intersectObjects(active.group.children, true)[0];
    active.handleTap(hit ? findActorId(hit.object) : null, ctx);
  });

  return {
    viewer,
    state,
    totalUnits,
    /** Subscribe to per-frame progress; returns an unsubscribe function. */
    onProgress(cb) {
      progressListeners.add(cb);
      return () => progressListeners.delete(cb);
    },
    jumpToScene,
    dispose() {
      driver.dispose();
      viewer.dispose();
    },
  };
}

function findActorId(object) {
  for (let o = object; o; o = o.parent) {
    if (o.userData.slashActorId) return o.userData.slashActorId;
  }
  return null;
}
