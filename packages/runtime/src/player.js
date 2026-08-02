import * as THREE from 'three';
import { createViewer } from './viewer.js';
import { createAssetLibrary } from './assets.js';
import { createScenePlayer } from './scene-player.js';
import { createScrollDriver } from './scroll.js';
import { createStateStore } from './state.js';
import { createAudioSystem } from './audio.js';
import { resolveNextEdge } from './conditions.js';
import { createPostPipeline } from './post.js';

const DEFAULT_SCROLL_LENGTH = 3;
const DEFAULT_AUTO_SPEED = 0.35; // viewport-heights per second
const FRONTIER_MARGIN = 0.75; // units before the path end where the next scene is resolved

/**
 * The story player. The story unfolds along a dynamic *path* of story
 * nodes: it starts at the story's start scene and extends lazily — when
 * progress nears the end of the path, the next node is resolved from
 * `branches`/`next` against current state. Scrolling back revisits the
 * path already taken; `gotoScene` jumps within it or reroutes it.
 *
 * One scalar drives everything: `units` (viewport-heights of scroll) maps to
 * a per-section progress `t ∈ [0,1]` that drives camera, actor tracks,
 * lights, effects and events. Interactive Mode (scroll) and Playback Mode
 * (auto-play) drive the same value. Section boundaries are instant cuts.
 *
 * @param {HTMLElement} container
 * @param {Awaited<ReturnType<import('./loader.js').loadProject>>} bundle
 * @param {{ persist?: boolean }} [options] persist=false keeps state
 *   in-memory only.
 */
export async function createPlayer(container, bundle, { persist = true } = {}) {
  const viewer = createViewer(container, {
    background: bundle.project.renderStyle?.background,
    maxPixelRatio: bundle.project.settings?.maxPixelRatio,
  });
  const state = createStateStore(bundle.state, {
    storageKey: persist ? `slash:${bundle.project.id}` : undefined,
  });
  const resolveAsset = bundle.resolveAsset ?? ((source) => `${bundle.baseUrl}assets/${source}`);
  const assets = createAssetLibrary(bundle.assetIndex, resolveAsset);
  const audio = createAudioSystem(bundle.assetIndex, resolveAsset);
  const autoSpeed = bundle.project.settings?.autoScrollSpeed ?? DEFAULT_AUTO_SPEED;

  const renderStyle = bundle.project.renderStyle ?? {};
  const postPipeline = renderStyle.post ? createPostPipeline(viewer, renderStyle.post) : null;
  if (postPipeline) viewer.setRenderOverride(() => postPipeline.render());

  const storyNodes = new Map(bundle.story.scenes.map((s) => [s.id, s]));
  const scenePlayers = new Map(); // scene id → scenePlayer (shared across path revisits)

  async function playerFor(sceneId) {
    if (!scenePlayers.has(sceneId)) {
      scenePlayers.set(
        sceneId,
        await createScenePlayer(bundle.scenes[sceneId], {
          assets,
          getState: state.get,
          style: renderStyle.style,
          outline: renderStyle.outline,
        }),
      );
    }
    return scenePlayers.get(sceneId);
  }

  /**
   * @typedef {{ node: any, length: number, start: number, ready: boolean }} PathEntry
   */
  /** @type {PathEntry[]} */
  const path = [];
  let building = false;

  function pathEnd() {
    const last = path.at(-1);
    return last ? last.start + last.length : 0;
  }
  function builtEnd() {
    let end = 0;
    for (const entry of path) {
      if (!entry.ready) break;
      end = entry.start + entry.length;
    }
    return end;
  }

  async function appendNode(id) {
    const node = storyNodes.get(id);
    if (!node) return console.warn(`[slash] unknown story node "${id}"`);
    const doc = bundle.scenes[id];
    const entry = {
      node,
      length: doc.scrollLength ?? DEFAULT_SCROLL_LENGTH,
      start: pathEnd(),
      ready: false,
    };
    path.push(entry);
    building = true;
    await playerFor(id);
    entry.ready = true;
    building = false;
  }
  await appendNode(bundle.story.start);

  const driver = createScrollDriver(container, {
    getTotalUnits: () => pathEnd(),
  });

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
        case 'playSound':
          audio.playSfx(action.asset, { loop: action.loop });
          break;
        case 'setVisible': {
          const actor = scene.actors.get(action.target);
          if (actor) actor.object.visible = action.visible;
          break;
        }
        case 'setEffect': {
          const effect = scene.effects.get(action.target);
          if (effect) effect.setEnabled(action.enabled);
          else console.warn(`[slash] setEffect: unknown effect "${action.target}"`);
          break;
        }
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
            console.warn(
              `[slash] playAnimation: no clip "${action.clip}" on actor "${action.target}"`,
            );
          }
          break;
        }
      }
    }
  }

  let active = null;
  let activeEntry = null;
  let autoPlay = false;
  const ctxFor = (scenePlayer) => ({ run: (event) => runEvent(scenePlayer, event) });
  const progressListeners = new Set();

  function entryIndexAt(units) {
    for (let i = 0; i < path.length; i++) {
      if (units < path[i].start + path[i].length) return i;
    }
    return path.length - 1;
  }
  const localT = (entry, units) => Math.min(1, Math.max(0, (units - entry.start) / entry.length));

  function jumpToScene(id) {
    const existing = path.find((e) => e.node.id === id);
    if (existing) return driver.jumpTo(existing.start);
    if (!storyNodes.has(id)) return console.warn(`[slash] gotoScene: unknown scene "${id}"`);
    // Reroute: drop path beyond the current node, then continue at `id`.
    const cut = path.indexOf(activeEntry);
    if (cut >= 0) path.length = cut + 1;
    appendNode(id).then(() => driver.jumpTo(path.at(-1).start));
  }

  function applyAudio(doc) {
    audio.setBgm(doc.audio?.bgm ?? null);
    audio.setAmbient(doc.audio?.ambient ?? null);
  }

  function applyAtmosphere(scenePlayer) {
    const doc = scenePlayer.doc;
    const fog = doc.environment?.fog ?? renderStyle.post?.fog ?? null;
    viewer.scene.fog = fog ? new THREE.Fog(fog.color, fog.near, fog.far) : null;
    viewer.defaultLights.visible = !scenePlayer.hasLights;
    postPipeline?.setEnabled(doc.post !== false);
  }

  // The single scene currently added to the viewer.
  let shown = null;
  function setShown(sp) {
    if (shown === sp) return;
    if (shown) viewer.scene.remove(shown.group);
    viewer.scene.add(sp.group);
    shown = sp;
  }

  // Primary = the section at the current scroll position; it owns audio,
  // atmosphere and taps.
  function setPrimary(entry) {
    activeEntry = entry;
    const sp = scenePlayers.get(entry.node.id);
    if (sp && sp !== active) {
      active = sp;
      applyAudio(sp.doc);
      applyAtmosphere(sp);
    }
  }

  function notifyProgress(units, doc, t, loading) {
    for (const cb of progressListeners) {
      cb({
        units,
        totalUnits: pathEnd(),
        scene: doc,
        t,
        autoPlay,
        loading,
        pathLength: path.length,
      });
    }
  }

  viewer.onTick((dt) => {
    if (autoPlay) driver.advance(autoSpeed * dt);
    let units = driver.update(dt);

    // Extend the path when progress nears the frontier and a next node
    // resolves. The margin both preloads the next scene and defeats the
    // scroll never landing *exactly* on the end. Note: a branch is committed
    // once appended; state changes within the final margin no longer affect
    // which branch was taken.
    const last = path.at(-1);
    if (!building && last?.ready && units >= pathEnd() - FRONTIER_MARGIN) {
      const { next } = resolveNextEdge(last.node, state.get);
      if (next) appendNode(next);
    }
    // Never advance into a node whose scene is still loading.
    const limit = builtEnd();
    let loading = false;
    if (units > limit) {
      driver.jumpTo(limit);
      units = limit;
      loading = true;
    }

    const primary = path[entryIndexAt(units)];
    if (!primary?.ready) return;

    const sp = scenePlayers.get(primary.node.id);
    if (!sp) return;
    setShown(sp);
    setPrimary(primary);
    const t = localT(primary, units);
    sp.update(t, dt, viewer.camera, ctxFor(sp));
    notifyProgress(units, sp.doc, t, loading);
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
    const hit = raycaster
      .intersectObjects(active.group.children, true)
      .find((h) => h.object.visible);
    active.handleTap(hit ? findActorId(hit.object) : null, ctxFor(active));
  });

  return {
    viewer,
    state,
    /** Subscribe to per-frame progress; returns an unsubscribe function. */
    onProgress(cb) {
      progressListeners.add(cb);
      return () => progressListeners.delete(cb);
    },
    jumpToScene,
    /** Playback Mode: automatic progression sharing the same progress. */
    setAutoPlay(on) {
      autoPlay = on;
    },
    get autoPlay() {
      return autoPlay;
    },
    /** Restart the story: clear state (and its persistence) and rewind. */
    reset() {
      state.reset();
      path.length = 1;
      autoPlay = false;
      driver.jumpTo(0);
    },
    dispose() {
      driver.dispose();
      audio.dispose();
      postPipeline?.dispose();
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
