/**
 * Entry point of the exported player bundle (built by vite.player.config.js
 * and embedded into exported story sites by the editor). Boots against
 * project files sitting next to the page.
 */
import { loadProject } from './loader.js';
import { createPlayer } from './player.js';
import { attachHud, showBootOverlay } from './hud.js';

async function main() {
  const boot = showBootOverlay();
  const bundle = await loadProject('./');
  const player = await createPlayer(document.getElementById('app'), bundle);
  attachHud(player);
  boot.done();
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentText('beforeend', String(err.message ?? err));
});
