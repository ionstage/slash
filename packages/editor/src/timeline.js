import { upsertKey, deleteKeyNear, keyNear } from './track-edit.js';

/**
 * Bottom bar: progress scrubber, camera keying and camera preview.
 * Scrubbing drives the viewport through the same scene-player update the
 * runtime uses.
 */
export function createTimeline(elements, store, viewport) {
  const { scrubber, tLabel, btnSetKey, btnDeleteKey, previewToggle } = elements;

  function refresh() {
    const enabled = Boolean(store.docs);
    scrubber.disabled = !enabled;
    btnSetKey.disabled = !enabled;
    tLabel.textContent = `t=${viewport.progress.toFixed(2)}`;
    const track = store.activeScene()?.camera.tracks.position;
    btnDeleteKey.disabled = !enabled || !keyNear(track, viewport.progress);
  }

  scrubber.addEventListener('input', () => {
    viewport.setProgress(Number(scrubber.value));
    refresh();
  });

  btnSetKey.addEventListener('click', () => {
    const scene = store.activeScene();
    if (!scene) return;
    const pose = viewport.cameraPose();
    upsertKey(scene.camera.tracks.position, viewport.progress, pose.position, 'easeInOut');
    upsertKey(scene.camera.tracks.lookAt, viewport.progress, pose.lookAt, 'easeInOut');
    store.touch('scene', { source: 'timeline' });
  });

  btnDeleteKey.addEventListener('click', () => {
    const scene = store.activeScene();
    if (!scene) return;
    deleteKeyNear(scene.camera.tracks.position, viewport.progress);
    deleteKeyNear(scene.camera.tracks.lookAt, viewport.progress);
    store.touch('scene', { source: 'timeline' });
  });

  previewToggle.addEventListener('change', () => {
    viewport.setCameraPreview(previewToggle.checked);
  });

  store.subscribe(() => refresh());
  refresh();
}
