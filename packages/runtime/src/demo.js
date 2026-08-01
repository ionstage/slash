/**
 * Runtime demo page: plays the sample project (served at / by Vite's
 * publicDir, see vite.config.js). Add ?stats to show the perf readout.
 */
import { loadProject, createPlayer, attachHud, showBootOverlay } from './index.js';

async function main() {
  const boot = showBootOverlay();
  const bundle = await loadProject('/');
  const player = await createPlayer(document.getElementById('app'), bundle);
  attachHud(player, document.body, { stats: new URLSearchParams(location.search).has('stats') });
  boot.done();
  console.log('[slash] player ready:', bundle.project.title);
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentText('beforeend', String(err.message ?? err));
});
