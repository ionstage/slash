/**
 * Runtime demo page: plays the sample project (served at / by Vite's
 * publicDir, see vite.config.js).
 */
import { loadProject, createPlayer } from './index.js';

async function main() {
  const app = document.getElementById('app');
  const bundle = await loadProject('/');
  const player = await createPlayer(app, bundle);

  const bar = document.getElementById('progress-fill');
  const label = document.getElementById('scene-label');
  const hint = document.getElementById('hint');
  player.onProgress(({ units, totalUnits, scene }) => {
    bar.style.width = `${(units / totalUnits) * 100}%`;
    label.textContent = scene.name ?? scene.id;
    hint.style.opacity = units > 0.2 ? '0' : '1';
  });
  console.log('[slash] player ready:', bundle.project.title);
}

main().catch((err) => {
  console.error(err);
  document.getElementById('scene-label').textContent = String(err.message ?? err);
});
