/**
 * Entry point of the exported player bundle (built by vite.player.config.js
 * and embedded into exported story sites by the editor). Boots against
 * project files sitting next to the page.
 */
import { loadProject } from './loader.js';
import { createPlayer } from './player.js';

async function main() {
  const app = document.getElementById('app');
  const bundle = await loadProject('./');
  const player = await createPlayer(app, bundle);

  const bar = document.getElementById('progress-fill');
  const label = document.getElementById('scene-label');
  const hint = document.getElementById('hint');
  player.onProgress(({ units, totalUnits, scene }) => {
    if (bar) bar.style.width = `${(units / totalUnits) * 100}%`;
    if (label) label.textContent = scene.name ?? scene.id;
    if (hint) hint.style.opacity = units > 0.2 ? '0' : '1';
  });
}

main().catch((err) => {
  console.error(err);
  const label = document.getElementById('scene-label');
  if (label) label.textContent = String(err.message ?? err);
});
