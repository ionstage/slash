/**
 * Runs inside the preview iframe: receives the in-memory project from the
 * editor and plays it with the real runtime player.
 */
import { validateProject } from '@slash/schema';
import { createPlayer } from '@slash/runtime';

const label = document.getElementById('scene-label');
let player = null;

window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'slash-preview') return;
  try {
    const { docs, files } = e.data;
    const result = validateProject(docs);
    if (!result.valid) {
      label.textContent =
        'Project has errors:\n' +
        result.errors.slice(0, 8).map((err) => `${err.path}: ${err.message}`).join('\n');
      return;
    }
    player?.dispose();
    const urls = new Map(
      Object.entries(files).map(([path, blob]) => [path, URL.createObjectURL(blob)]),
    );
    const bundle = { ...docs, baseUrl: '', resolveAsset: (source) => urls.get(source) };
    player = await createPlayer(document.getElementById('app'), bundle);

    const bar = document.getElementById('progress-fill');
    player.onProgress(({ units, totalUnits, scene }) => {
      bar.style.width = `${(units / totalUnits) * 100}%`;
      label.textContent = scene.name ?? scene.id;
    });
    console.log('[slash] preview playing:', docs.project.title);
  } catch (err) {
    console.error(err);
    label.textContent = String(err.message ?? err);
  }
});

window.parent.postMessage({ type: 'slash-preview-ready' }, '*');
