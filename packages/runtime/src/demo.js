/**
 * Runtime demo page: plays the sample project (served at / by Vite's
 * publicDir, see vite.config.js). Query flags: ?stats shows the perf
 * readout; ?sync shows the scroll↔world sync overlay. The player is
 * exposed as `window.slashPlayer` for debugging.
 */
import { loadProject, createWorldPlayer, attachHud, showBootOverlay } from './index.js';

async function main() {
  const boot = showBootOverlay();
  const params = new URLSearchParams(location.search);
  const bundle = await loadProject('/');
  const player = await createWorldPlayer(document.getElementById('app'), bundle);
  window.slashPlayer = player;
  attachHud(player, document.body, { stats: params.has('stats'), sync: params.has('sync') });
  boot.done();
  console.log('[slash] player ready:', bundle.project.title);
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentText('beforeend', String(err.message ?? err));
});
