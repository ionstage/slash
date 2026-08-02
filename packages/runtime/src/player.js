import * as THREE from 'three';
import { createViewer } from './viewer.js';
import { createAssetLibrary } from './assets.js';
import { createScenePlayer } from './scene-player.js';
import { createScrollDriver } from './scroll.js';
import { createStateStore } from './state.js';
import { createAudioSystem } from './audio.js';
import { resolveNextEdge } from './conditions.js';
import { resolveTransition } from './transitions.js';
import { createPostPipeline } from './post.js';

const DEFAULT_SCROLL_LENGTH = 3;
const DEFAULT_AUTO_SPEED = 0.35; // viewport-heights per second
const FRONTIER_MARGIN = 0.75; // units before the path end where the next scene is resolved

/**
 * The story player. The story unfolds along a dynamic *path* of story
 * nodes: it starts at the story's start scene and extends lazily — when
 * progress reaches the end of the path, the next node is resolved from
 * `branches`/`next` against current state. Scrolling back revisits the
 * path already taken; `gotoScene` jumps within it or reroutes it.
 *
 * Each node can carry viewpoint variants; horizontal swipes (or arrow
 * keys) switch the active variant without touching vertical progress.
 * Interactive Mode (scroll) and Playback Mode (auto-play) drive the same
 * progress value.
 *
 * @param {HTMLElement} container
 * @param {Awaited<ReturnType<import('./loader.js').loadProject>>} bundle
 * @param {{ persist?: boolean }} [options] persist=false keeps state
 *   in-memory only (editor preview).
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
  const scenePlayers = new Map(); // scene doc id → scenePlayer (shared across path revisits)

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
   * @typedef {{ node: any, length: number, start: number, vpIndex: number, ready: boolean }} PathEntry
   * The scene doc id of an entry's active variant: variantId(entry).
   */
  /** @type {PathEntry[]} */
  const path = [];
  let building = false;

  function variantIds(entry) {
    return [entry.node.id, ...(entry.node.viewpoints ?? []).map((v) => v.id)];
  }
  function variantId(entry) {
    return variantIds(entry)[entry.vpIndex] ?? entry.node.id;
  }
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

  async function appendNode(id, transition) {
    const node = storyNodes.get(id);
    if (!node) return console.warn(`[slash] unknown story node "${id}"`);
    const doc = bundle.scenes[id];
    const entry = {
      node,
      length: doc.scrollLength ?? DEFAULT_SCROLL_LENGTH,
      start: pathEnd(),
      vpIndex: 0,
      ready: false,
      // How the seam INTO this entry plays (from the edge that led here).
      enterTransition: resolveTransition(transition),
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
    onSwipe: (direction) => switchViewpoint(direction),
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
            console.warn(`[slash] playAnimation: no clip "${action.clip}" on actor "${action.target}"`);
          }
          break;
        }
      }
    }
  }

  let active = null;
  let activeEntry = null;
  let autoPlay = false;
  // Each scene player gets an event context bound to itself, so an event
  // firing during a transition (when two scenes are live) resolves its
  // actors/effects against the scene that owns it.
  const ctxFor = (scenePlayer) => ({ run: (event) => runEvent(scenePlayer, event) });
  const progressListeners = new Set();

  function entryIndexAt(units) {
    for (let i = 0; i < path.length; i++) {
      if (units < path[i].start + path[i].length) return i;
    }
    return path.length - 1;
  }
  const localT = (entry, units) =>
    Math.min(1, Math.max(0, (units - entry.start) / entry.length));

  function jumpToScene(id) {
    // A jump can skip past a continuity seam's far edge in either direction,
    // where the per-frame reconcile can't unwind the handoff — restore first.
    restoreAllCarried();
    const existing = path.find((e) => e.node.id === id);
    if (existing) return driver.jumpTo(existing.start);
    if (!storyNodes.has(id)) return console.warn(`[slash] gotoScene: unknown scene "${id}"`);
    // Reroute: drop path beyond the current node, then continue at `id`.
    const cut = path.indexOf(activeEntry);
    if (cut >= 0) path.length = cut + 1;
    appendNode(id).then(() => driver.jumpTo(path.at(-1).start));
  }

  async function switchViewpoint(direction) {
    const entry = activeEntry;
    if (!entry) return;
    const ids = variantIds(entry);
    const next = entry.vpIndex + direction;
    if (next < 0 || next >= ids.length) return;
    entry.vpIndex = next;
    await playerFor(ids[next]); // build variant on first visit
    notifyViewpoint();
  }

  const viewpointListeners = new Set();
  function notifyViewpoint() {
    const entry = activeEntry;
    const payload = entry
      ? { index: entry.vpIndex, count: variantIds(entry).length }
      : { index: 0, count: 1 };
    for (const cb of viewpointListeners) cb(payload);
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

  // Scenes currently added to the viewer (one, or two during a transition).
  const shown = new Set();
  function setShown(players) {
    for (const sp of shown) {
      if (!players.includes(sp)) {
        viewer.scene.remove(sp.group);
        sp.setOpacity(1); // leave revisitable scenes fully opaque
        shown.delete(sp);
      }
    }
    for (const sp of players) {
      if (!shown.has(sp)) {
        viewer.scene.add(sp.group);
        shown.add(sp);
      }
    }
  }

  // Primary = the section at the current scroll position; it owns audio,
  // atmosphere, viewpoint UI, taps. Flips at the seam midpoint.
  function setPrimary(entry) {
    activeEntry = entry;
    const sp = scenePlayers.get(variantId(entry));
    if (sp && sp !== active) {
      active = sp;
      applyAudio(sp.doc);
      applyAtmosphere(sp);
      notifyViewpoint();
    }
  }

  /**
   * If `units` sits inside a seam's transition band, describe it: the
   * outgoing/incoming entries, progress `p` (0→1) across the band, and the
   * resolved transition. Bands straddle a seam; the half below it is found
   * via the lower entry's outgoing edge, the half above via the upper
   * entry's `enterTransition`.
   */
  function bandAt(pi, units) {
    const next = path[pi + 1];
    if (next?.ready) {
      const tr = next.enterTransition;
      const seam = next.start;
      const half = tr.span / 2;
      if (tr.banded && units >= seam - half && units <= seam + half)
        return { out: path[pi], in: next, p: (units - (seam - half)) / tr.span, tr };
    }
    const cur = path[pi];
    if (pi > 0 && path[pi - 1].ready) {
      const tr = cur.enterTransition;
      const seam = cur.start;
      const half = tr.span / 2;
      if (tr.banded && units >= seam - half && units <= seam + half)
        return { out: path[pi - 1], in: cur, p: (units - (seam - half)) / tr.span, tr };
    }
    return null;
  }

  const camA = new THREE.Vector3();
  const camB = new THREE.Vector3();
  const tgtA = new THREE.Vector3();
  const tgtB = new THREE.Vector3();
  const camO = new THREE.Vector3();
  const ORIGIN = [0, 0, 0];
  // Blend from pose `a` to pose `b`; `b` is expressed relative to `offset` (the
  // incoming stage's position during a `continuity` band — [0,0,0] otherwise).
  function applyBlendedCamera(a, b, mix, offset = ORIGIN) {
    const cam = viewer.camera;
    camB.fromArray(b.position).add(camO.fromArray(offset));
    tgtB.fromArray(b.target).add(camO);
    cam.position.copy(camA.fromArray(a.position).lerp(camB, mix));
    cam.lookAt(tgtA.fromArray(a.target).lerp(tgtB, mix));
    cam.fov = a.fov + (b.fov - a.fov) * mix;
    cam.updateProjectionMatrix();
  }

  // Carried actors handed off by a `continuity` seam: id → the home record
  // (with its authoring def) so scrolling back can restore track-driven play.
  const carriedHome = new Map();

  /**
   * Reconcile carried actors for a `continuity` seam into `path[i]`. Below the
   * band's far edge the actor stays in (and is driven by) the outgoing scene;
   * at/after it, the actor is reparented into the incoming scene and idles —
   * so it "walks in and stays". The seam's `offset` keeps world position
   * continuous across the reparent. Idempotent; safe to call every frame.
   */
  function reconcileContinuity(i, units) {
    const inEntry = path[i];
    const outEntry = path[i - 1];
    if (!inEntry) return;
    const tr = inEntry.enterTransition;
    if (tr.type !== 'continuity' || !outEntry?.ready || !inEntry.ready) return;
    const outSp = scenePlayers.get(variantId(outEntry));
    const inSp = scenePlayers.get(variantId(inEntry));
    if (!outSp || !inSp) return;
    const [ox, oy, oz] = tr.offset;
    const handedOff = units >= inEntry.start + tr.span / 2;
    for (const id of tr.carry) {
      if (handedOff && !inSp.hasAdopted(id)) {
        // Snap to the seam pose first: a jump across the seam may not have
        // rendered the band, leaving the actor at a stale position.
        outSp.poseActorAt(id, 1);
        const rec = outSp.detachActor(id);
        if (!rec) continue;
        rec.object.position.set(rec.object.position.x - ox, rec.object.position.y - oy, rec.object.position.z - oz);
        inSp.adoptActor(id, { object: rec.object, mixer: rec.mixer });
        carriedHome.set(id, { outSp, inSp, record: rec, offset: tr.offset });
      } else if (!handedOff && inSp.hasAdopted(id)) {
        const rel = inSp.releaseActor(id);
        const home = carriedHome.get(id);
        if (!rel || !home) continue;
        rel.object.position.set(rel.object.position.x + ox, rel.object.position.y + oy, rel.object.position.z + oz);
        home.outSp.attachActor(home.record);
        carriedHome.delete(id);
      }
    }
  }

  // Return every carried actor to its home scene (track-driven again). Called
  // when the path is truncated/reset, where the scroll-back reconcile that
  // normally restores them can't run.
  function restoreAllCarried() {
    for (const [id, h] of carriedHome) {
      if (h.inSp.hasAdopted(id)) {
        h.inSp.releaseActor(id);
        const o = h.record.object;
        o.position.set(o.position.x + h.offset[0], o.position.y + h.offset[1], o.position.z + h.offset[2]);
      }
      if (!h.outSp.hasActor(id)) h.outSp.attachActor(h.record);
    }
    carriedHome.clear();
  }

  function notifyProgress(units, doc, t, loading) {
    for (const cb of progressListeners) {
      cb({ units, totalUnits: pathEnd(), scene: doc, t, autoPlay, loading });
    }
  }

  viewer.onTick((dt) => {
    if (autoPlay) driver.advance(autoSpeed * dt);
    let units = driver.update(dt);

    // Extend the path when progress nears the frontier and a next node
    // resolves. The margin both defeats the damped scroll's asymptote
    // (it never *exactly* reaches the end) and preloads the next scene.
    // Note: a branch is committed once appended; state changes within the
    // final margin of a scene no longer affect which branch was taken.
    const last = path.at(-1);
    if (!building && last?.ready && units >= pathEnd() - FRONTIER_MARGIN) {
      const { next, transition } = resolveNextEdge(last.node, state.get);
      if (next) appendNode(next, transition);
    }
    // Never advance into a node whose scene is still loading.
    const limit = builtEnd();
    let loading = false;
    if (units > limit) {
      driver.jumpTo(limit);
      units = limit;
      loading = true;
    }

    const pi = entryIndexAt(units);
    const primary = path[pi];
    if (!primary?.ready) return;

    // Hand carried actors across nearby continuity seams before rendering.
    reconcileContinuity(pi, units);
    reconcileContinuity(pi + 1, units);

    // Transition band: render both sections and blend opacity + camera.
    const band = bandAt(pi, units);
    const pOut = band && scenePlayers.get(variantId(band.out));
    const pIn = band && scenePlayers.get(variantId(band.in));
    if (band && pOut && pIn) {
      setShown([pOut, pIn]);
      // The outgoing stage anchors at origin; the incoming stage sits at the
      // transition's `offset` (zero except for `continuity`) so a carried
      // actor's path reads as continuous across the seam.
      pOut.group.position.set(0, 0, 0);
      pIn.group.position.fromArray(band.tr.offset);
      const tOut = localT(band.out, units);
      const tIn = localT(band.in, units);
      pOut.update(tOut, dt, viewer.camera, ctxFor(pOut), false);
      pIn.update(tIn, dt, viewer.camera, ctxFor(pIn), false);
      const w = band.tr.def.weights(band.p);
      pOut.setOpacity(w.from);
      pIn.setOpacity(w.to);
      applyBlendedCamera(
        pOut.sampleCamera(tOut),
        pIn.sampleCamera(tIn),
        band.tr.def.cameraMix(band.p),
        band.tr.offset,
      );
      setPrimary(primary);
      const t = localT(primary, units);
      notifyProgress(units, primary === band.out ? pOut.doc : pIn.doc, t, loading);
      return;
    }

    // Single section. Always restore full opacity and origin: fast scrolling
    // can skip a band's edge, leaving the surviving scene mid-fade or offset.
    const sp = scenePlayers.get(variantId(primary));
    if (!sp) return;
    setShown([sp]);
    sp.setOpacity(1);
    sp.group.position.set(0, 0, 0);
    setPrimary(primary);
    const t = localT(primary, units);
    sp.update(t, dt, viewer.camera, ctxFor(sp), true);
    notifyProgress(units, sp.doc, t, loading);
  });

  // Keyboard: viewpoint switching (mirrors horizontal swipe).
  function onKey(e) {
    if (e.key === 'ArrowRight') switchViewpoint(1);
    if (e.key === 'ArrowLeft') switchViewpoint(-1);
  }
  window.addEventListener('keydown', onKey);

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
    /** Subscribe to viewpoint changes ({index, count}). */
    onViewpoint(cb) {
      viewpointListeners.add(cb);
      cb({ index: activeEntry?.vpIndex ?? 0, count: activeEntry ? variantIds(activeEntry).length : 1 });
      return () => viewpointListeners.delete(cb);
    },
    jumpToScene,
    switchViewpoint,
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
      restoreAllCarried();
      path.length = 1;
      if (path[0]) path[0].vpIndex = 0;
      autoPlay = false;
      driver.jumpTo(0);
      notifyViewpoint();
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
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
