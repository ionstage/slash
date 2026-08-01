import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createViewer, createAssetLibrary, createScenePlayer } from '@slash/runtime';
import { roundVec, round } from './track-edit.js';

const RAD = 180 / Math.PI;

/**
 * The editing viewport: the runtime's viewer plus orbit navigation, gizmo
 * editing, click selection and progress scrubbing. The active scene is
 * assembled with the runtime's own scene player, so what you edit is what
 * plays.
 *
 * @param {HTMLElement} container
 * @param {ReturnType<import('./project-store.js').createProjectStore>} store
 */
export function createViewport(container, store) {
  const viewer = createViewer(container);
  const canvas = viewer.renderer.domElement;

  const grid = new THREE.GridHelper(30, 30, '#4a4a6a', '#2a2a4a');
  grid.position.y = 0.01;
  viewer.scene.add(grid);

  const orbit = new OrbitControls(viewer.camera, canvas);
  orbit.target.set(0, 1, 0);
  orbit.enableDamping = true;
  viewer.onTick(() => orbit.update());

  const gizmo = new TransformControls(viewer.camera, canvas);
  viewer.scene.add(gizmo.getHelper());
  gizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
  });
  gizmo.addEventListener('objectChange', () => {
    writeBackTransform();
    store.touch('scene', { source: 'viewport' });
  });

  // A scratch camera absorbs scene-player camera writes while the user
  // orbits freely; "camera preview" routes them to the real camera instead.
  const scratchCamera = new THREE.PerspectiveCamera();
  let cameraPreview = false;

  let scenePlayer = null;
  let library = null;
  let progress = 0;
  const blobUrls = [];
  const noopCtx = { run: () => {} };

  function resolveAsset(source) {
    const blob = store.files.get(source);
    if (!blob) return `assets/${source}`;
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    return url;
  }

  function rebuildLibrary() {
    for (const url of blobUrls.splice(0)) URL.revokeObjectURL(url);
    library = createAssetLibrary(store.docs.assetIndex, resolveAsset);
  }

  let rebuildToken = 0;
  async function rebuildScene() {
    const token = ++rebuildToken;
    const sceneDoc = store.activeScene();
    if (!sceneDoc) return;
    const renderStyle = store.docs.project.renderStyle ?? {};
    const next = await createScenePlayer(sceneDoc, {
      assets: library,
      style: renderStyle.style,
      outline: renderStyle.outline,
    });
    if (token !== rebuildToken) return; // superseded while loading
    if (scenePlayer) viewer.scene.remove(scenePlayer.group);
    scenePlayer = next;
    viewer.scene.add(scenePlayer.group);
    const fog = sceneDoc.environment?.fog ?? renderStyle.post?.fog ?? null;
    viewer.scene.fog = fog ? new THREE.Fog(fog.color, fog.near, fog.far) : null;
    viewer.defaultLights.visible = !scenePlayer.hasLights;
    applyProgress();
    attachGizmo();
  }
  viewer.onTick((dt) => scenePlayer?.tickAmbient(dt));

  function applyProgress() {
    scenePlayer?.update(progress, 0, cameraPreview ? viewer.camera : scratchCamera, noopCtx);
  }

  function selectedObject() {
    if (!scenePlayer || !store.selection) return null;
    if (store.selection.kind === 'stage') return scenePlayer.group.children[0];
    return scenePlayer.actors.get(store.selection.id)?.object ?? null;
  }

  function attachGizmo() {
    const object = selectedObject();
    if (object) gizmo.attach(object);
    else gizmo.detach();
  }

  function writeBackTransform() {
    const object = gizmo.object;
    if (!object) return;
    const target =
      store.selection?.kind === 'stage'
        ? (store.activeScene().stage.transform ??= {})
        : store.actor(store.selection.id);
    if (!target) return;
    const t = store.selection.kind === 'stage' ? target : (target.transform ??= {});
    t.position = roundVec(object.position.toArray());
    t.rotation = roundVec([
      object.rotation.x * RAD,
      object.rotation.y * RAD,
      object.rotation.z * RAD,
    ]);
    const s = object.scale;
    t.scale =
      Math.abs(s.x - s.y) < 1e-6 && Math.abs(s.y - s.z) < 1e-6 ? round(s.x) : roundVec(s.toArray());
  }

  // Click selection (ignored while the gizmo is hovered or dragged).
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !scenePlayer) return;
    const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
    down = null;
    if (moved > 6 || gizmo.dragging || gizmo.axis) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, viewer.camera);
    const hit = raycaster.intersectObjects(scenePlayer.group.children, true)[0];
    if (!hit) return store.select(null);
    for (let o = hit.object; o; o = o.parent) {
      if (o.userData.slashActorId) return store.select({ kind: 'actor', id: o.userData.slashActorId });
    }
    store.select({ kind: 'stage' });
  });

  store.subscribe((type, meta) => {
    if (type === 'project' || type === 'assets') {
      rebuildLibrary();
      rebuildScene();
    } else if (type === 'scene' && meta.source !== 'viewport') {
      rebuildScene();
    } else if (type === 'selection') {
      attachGizmo();
    }
  });

  return {
    viewer,
    setProgress(t) {
      progress = t;
      applyProgress();
    },
    get progress() {
      return progress;
    },
    setCameraPreview(on) {
      cameraPreview = on;
      orbit.enabled = !on;
      if (on) applyProgress();
    },
    setGizmoMode(mode) {
      gizmo.setMode(mode); // 'translate' | 'rotate' | 'scale'
    },
    /** Current free-camera pose, for camera keyframing. */
    cameraPose() {
      return {
        position: roundVec(viewer.camera.position.toArray()),
        lookAt: roundVec(orbit.target.toArray()),
      };
    },
  };
}
