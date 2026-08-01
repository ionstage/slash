/**
 * Bottom bar: progress scrubber, camera viewpoint capture and camera
 * preview. Scrubbing drives the viewport through the same scene-player
 * update the runtime uses.
 *
 * A section's camera is a single held viewpoint (a comic-panel shot), so
 * "capture" writes the current free-camera pose into `camera.viewpoint`.
 * (Authoring `drift` offsets is a later milestone.)
 */
export function createTimeline(elements, store, viewport) {
  const { scrubber, tLabel, btnSetKey, btnDeleteKey, previewToggle } = elements;

  btnSetKey.textContent = 'Capture viewpoint';
  btnDeleteKey.hidden = true;

  function refresh() {
    const enabled = Boolean(store.docs);
    scrubber.disabled = !enabled;
    btnSetKey.disabled = !enabled;
    tLabel.textContent = `t=${viewport.progress.toFixed(2)}`;
  }

  scrubber.addEventListener('input', () => {
    viewport.setProgress(Number(scrubber.value));
    refresh();
  });

  btnSetKey.addEventListener('click', () => {
    const scene = store.activeScene();
    if (!scene) return;
    const pose = viewport.cameraPose();
    const viewpoint = (scene.camera.viewpoint ??= { position: [0, 2, 6], target: [0, 1, 0] });
    viewpoint.position = pose.position;
    viewpoint.target = pose.lookAt;
    store.touch('scene', { source: 'timeline' });
  });

  previewToggle.addEventListener('change', () => {
    viewport.setCameraPreview(previewToggle.checked);
  });

  store.subscribe(() => refresh());
  refresh();
}
