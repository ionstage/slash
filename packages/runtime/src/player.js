import * as THREE from 'three';
import { createViewer } from './viewer.js';
import { createAssetLibrary } from './assets.js';
import { createScenePlayer } from './scene-player.js';
import { createScrollDriver } from './scroll.js';
import { createPostPipeline } from './post.js';

const DEFAULT_SCROLL_LENGTH = 3;
const FRONTIER_MARGIN = 0.75; // units before the path end where the next scene is resolved

/**
 * The story player. The story is a single linear chain of sections: it starts
 * at the story's start scene and extends lazily — when progress nears the end
 * of the built path, the next section (`next`) is appended. Scrolling back
 * revisits sections already descended.
 *
 * One scalar drives everything: `units` (viewport-heights of scroll) maps to a
 * per-section progress `t ∈ [0,1]` that drives camera, actor tracks, lights and
 * effects. Section boundaries are instant cuts. Scenes are passive — scrolling
 * is the only input.
 *
 * @param {HTMLElement} container
 * @param {Awaited<ReturnType<import('./loader.js').loadProject>>} bundle
 */
export async function createPlayer(container, bundle) {
  const viewer = createViewer(container, {
    background: bundle.project.renderStyle?.background,
    maxPixelRatio: bundle.project.settings?.maxPixelRatio,
  });
  const resolveAsset = bundle.resolveAsset ?? ((source) => `${bundle.baseUrl}assets/${source}`);
  const assets = createAssetLibrary(bundle.assetIndex, resolveAsset);

  const renderStyle = bundle.project.renderStyle ?? {};
  const postPipeline = renderStyle.post ? createPostPipeline(viewer, renderStyle.post) : null;
  if (postPipeline) viewer.setRenderOverride(() => postPipeline.render());

  const scenePlayers = new Map(); // scene id → scenePlayer (shared across path revisits)

  async function playerFor(sceneId) {
    if (!scenePlayers.has(sceneId)) {
      scenePlayers.set(
        sceneId,
        await createScenePlayer(bundle.scenes[sceneId], {
          style: renderStyle.style,
          outline: renderStyle.outline,
          assets,
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
    const node = bundle.story.scenes.find((s) => s.id === id);
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

  const progressListeners = new Set();

  function entryIndexAt(units) {
    for (let i = 0; i < path.length; i++) {
      if (units < path[i].start + path[i].length) return i;
    }
    return path.length - 1;
  }
  const localT = (entry, units) => Math.min(1, Math.max(0, (units - entry.start) / entry.length));

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

  // Atmosphere (fog, lights, post) follows the section at the scroll position.
  let atmosphereFor = null;
  function setPrimary(sp) {
    if (sp === atmosphereFor) return;
    atmosphereFor = sp;
    applyAtmosphere(sp);
  }

  function notifyProgress(units, doc, t, loading) {
    for (const cb of progressListeners) {
      cb({
        units,
        totalUnits: pathEnd(),
        scene: doc,
        t,
        loading,
        pathLength: path.length,
      });
    }
  }

  viewer.onTick((dt) => {
    let units = driver.update(dt);

    // Extend the path when progress nears the frontier. The margin both
    // preloads the next scene and defeats the scroll never landing *exactly*
    // on the end.
    const last = path.at(-1);
    if (!building && last?.ready && units >= pathEnd() - FRONTIER_MARGIN) {
      const next = last.node.next ?? null;
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
    setPrimary(sp);
    const t = localT(primary, units);
    sp.update(t, dt, viewer.camera);
    notifyProgress(units, sp.doc, t, loading);
  });

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
