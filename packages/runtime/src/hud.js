/**
 * Default player HUD, shared by the demo page, the editor preview and
 * exported stories: progress bar, scene label, scroll hint, play/pause
 * (Playback Mode), restart, and a viewpoint indicator when the current
 * story span has variants. Injects its own DOM and styles into `root`.
 *
 * @param {ReturnType<import('./player.js').createPlayer> extends Promise<infer P> ? P : never} player
 * @param {HTMLElement} [root]
 * @param {{ stats?: boolean }} [options] stats shows a frame-time /
 *   triangles / draw-calls readout (used by the editor preview).
 */
export function attachHud(player, root = document.body, { stats = false } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    .slash-hud { position: fixed; inset: 0; pointer-events: none;
      font: 13px/1.5 system-ui, sans-serif; color: rgba(255,255,255,0.75); }
    .slash-hud * { box-sizing: border-box; }
    .slash-progress { position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: rgba(255,255,255,0.12); }
    .slash-progress-fill { width: 0; height: 100%; background: #e8b04b; }
    .slash-label { position: absolute; left: 16px; bottom: 14px; letter-spacing: 0.06em;
      white-space: pre-wrap; }
    .slash-hint { position: absolute; left: 0; right: 0; bottom: 44px; text-align: center;
      color: rgba(255,255,255,0.55); transition: opacity 0.6s; }
    .slash-controls { position: absolute; right: 12px; bottom: 10px; display: flex; gap: 6px;
      pointer-events: auto; }
    .slash-controls button { background: rgba(30,30,42,0.8); color: rgba(255,255,255,0.85);
      border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 4px 10px;
      font: inherit; cursor: pointer; }
    .slash-controls button:hover { border-color: #e8b04b; }
    .slash-viewpoint { position: absolute; top: 12px; right: 12px; display: none; gap: 4px;
      align-items: center; color: rgba(255,255,255,0.7); }
    .slash-viewpoint .dot { width: 7px; height: 7px; border-radius: 50%;
      background: rgba(255,255,255,0.3); }
    .slash-viewpoint .dot.on { background: #e8b04b; }
    .slash-wait { position: absolute; left: 0; right: 0; bottom: 70px; text-align: center;
      color: rgba(255,255,255,0.6); opacity: 0; transition: opacity 0.3s; }
    .slash-stats { position: absolute; top: 10px; left: 12px;
      font: 11px/1.5 ui-monospace, monospace; color: rgba(255,255,255,0.65);
      background: rgba(10,10,16,0.5); border-radius: 4px; padding: 2px 8px; }
  `;

  const hud = document.createElement('div');
  hud.className = 'slash-hud';
  hud.innerHTML = `
    <div class="slash-progress"><div class="slash-progress-fill"></div></div>
    <span class="slash-label"></span>
    <div class="slash-hint">Scroll ↓</div>
    <div class="slash-viewpoint"></div>
    <div class="slash-wait">Loading…</div>
    <div class="slash-controls">
      <button class="slash-play" title="Playback Mode">▶</button>
      <button class="slash-reset" title="Restart story">↺</button>
    </div>
  `;
  root.append(style, hud);

  const fill = hud.querySelector('.slash-progress-fill');
  const label = hud.querySelector('.slash-label');
  const hint = hud.querySelector('.slash-hint');
  const playBtn = hud.querySelector('.slash-play');
  const viewpointEl = hud.querySelector('.slash-viewpoint');
  const waitEl = hud.querySelector('.slash-wait');

  player.onProgress(({ units, totalUnits, scene, autoPlay, loading }) => {
    fill.style.width = `${(units / Math.max(totalUnits, 1e-6)) * 100}%`;
    label.textContent = scene.name ?? scene.id;
    hint.style.opacity = units > 0.2 ? '0' : '1';
    playBtn.textContent = autoPlay ? '⏸' : '▶';
    waitEl.style.opacity = loading ? '1' : '0';
  });

  if (stats) {
    const statsEl = document.createElement('div');
    statsEl.className = 'slash-stats';
    hud.append(statsEl);
    let frames = 0;
    let elapsed = 0;
    player.viewer.onTick((dt) => {
      frames++;
      elapsed += dt;
      if (elapsed >= 0.5) {
        const info = player.viewer.renderer.info.render;
        const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
        statsEl.textContent =
          `${Math.round(frames / elapsed)} fps · ${k(info.triangles)} tris · ${info.calls} calls`;
        frames = 0;
        elapsed = 0;
      }
    });
  }

  player.onViewpoint(({ index, count }) => {
    viewpointEl.style.display = count > 1 ? 'flex' : 'none';
    viewpointEl.replaceChildren(
      ...Array.from({ length: count }, (_, i) => {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i === index ? ' on' : '');
        return dot;
      }),
    );
  });

  playBtn.addEventListener('click', () => player.setAutoPlay(!player.autoPlay));
  hud.querySelector('.slash-reset').addEventListener('click', () => player.reset());

  return {
    /** Also expose the label for error reporting by boot code. */
    label,
    dispose() {
      hud.remove();
      style.remove();
    },
  };
}

/**
 * Full-screen boot overlay shown while the project and its first scene
 * load. Call `done()` once the player is ready.
 * @param {HTMLElement} [root]
 */
export function showBootOverlay(root = document.body) {
  const overlay = document.createElement('div');
  overlay.textContent = 'Loading…';
  overlay.style.cssText =
    'position:fixed;inset:0;display:grid;place-items:center;z-index:9;' +
    'color:rgba(255,255,255,0.6);font:14px/1.5 system-ui,sans-serif;' +
    'background:inherit;transition:opacity 0.4s';
  root.append(overlay);
  return {
    done() {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 450);
    },
  };
}
