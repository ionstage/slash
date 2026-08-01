/**
 * Runtime demo page: plays the sample project (served at / by Vite's
 * publicDir, see vite.config.js).
 */
import { loadProject, createPlayer, attachHud } from './index.js';

async function main() {
  const bundle = await loadProject('/');
  const player = await createPlayer(document.getElementById('app'), bundle);
  attachHud(player);
  console.log('[slash] player ready:', bundle.project.title);
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentText('beforeend', String(err.message ?? err));
});
