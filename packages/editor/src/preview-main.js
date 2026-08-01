/**
 * Runs inside the preview iframe: receives the in-memory project from the
 * editor and plays it with the real runtime player. State is not persisted
 * (persist: false) so every preview starts from initial state.
 */
import { validateProject } from '@slash/schema';
import { createPlayer, attachHud } from '@slash/runtime';

const errorEl = document.getElementById('preview-error');
let player = null;
let hud = null;

window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'slash-preview') return;
  try {
    const { docs, files } = e.data;
    const result = validateProject(docs);
    if (!result.valid) {
      errorEl.textContent =
        'Project has errors:\n' +
        result.errors.slice(0, 8).map((err) => `${err.path}: ${err.message}`).join('\n');
      return;
    }
    player?.dispose();
    hud?.dispose();
    const urls = new Map(
      Object.entries(files).map(([path, blob]) => [path, URL.createObjectURL(blob)]),
    );
    const bundle = { ...docs, baseUrl: '', resolveAsset: (source) => urls.get(source) };
    player = await createPlayer(document.getElementById('app'), bundle, { persist: false });
    hud = attachHud(player);
    console.log('[slash] preview playing:', docs.project.title);
  } catch (err) {
    console.error(err);
    errorEl.textContent = String(err.message ?? err);
  }
});

window.parent.postMessage({ type: 'slash-preview-ready' }, '*');
