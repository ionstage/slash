/**
 * Default player HUD: world label and an input hint. Injects its own DOM and
 * styles into `root`. Optional debug overlays: `stats` (frame-time / triangles
 * / draw calls) and `sync` (scroll↔world: units, global progress, camera
 * descent, swipe rotation, per-layer parallax offsets — for verifying the
 * scroll and rotation behaviour).
 *
 * @param {Awaited<ReturnType<import('./world-player.js').createWorldPlayer>>} player
 * @param {HTMLElement} [root]
 * @param {{ stats?: boolean, sync?: boolean }} [options]
 */
export function attachHud(player, root = document.body, { stats = false, sync = false } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    .slash-hud { position: fixed; inset: 0; pointer-events: none;
      font: 13px/1.5 system-ui, sans-serif; color: rgba(255,255,255,0.75); }
    .slash-hud * { box-sizing: border-box; }
    .slash-label { position: absolute; left: 16px; bottom: 14px; letter-spacing: 0.06em;
      white-space: pre-wrap; }
    .slash-hint { position: absolute; left: 0; right: 0; bottom: 44px; text-align: center;
      color: rgba(255,255,255,0.55); transition: opacity 0.6s; }
    .slash-stats { position: absolute; top: 10px; left: 12px;
      font: 11px/1.5 ui-monospace, monospace; color: rgba(255,255,255,0.65);
      background: rgba(10,10,16,0.5); border-radius: 4px; padding: 2px 8px; }
    .slash-sync { position: absolute; left: 12px; white-space: pre;
      font: 11px/1.5 ui-monospace, monospace; color: rgba(255,255,255,0.7);
      background: rgba(10,10,16,0.55); border-radius: 4px; padding: 4px 8px; }
  `;

  const hud = document.createElement('div');
  hud.className = 'slash-hud';
  hud.innerHTML = `
    <span class="slash-label"></span>
    <div class="slash-hint">Scroll ↓ · Swipe ↔ to turn</div>
  `;
  root.append(style, hud);

  const label = hud.querySelector('.slash-label');
  const hint = hud.querySelector('.slash-hint');

  player.onProgress(({ units, name }) => {
    label.textContent = name;
    hint.style.opacity = units > 0.2 ? '0' : '1';
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
        statsEl.textContent = `${Math.round(frames / elapsed)} fps · ${k(info.triangles)} tris · ${info.calls} calls`;
        frames = 0;
        elapsed = 0;
      }
    });
  }

  if (sync) {
    const syncEl = document.createElement('div');
    syncEl.className = 'slash-sync';
    syncEl.style.top = stats ? '36px' : '10px';
    hud.append(syncEl);
    player.onProgress(({ units, totalUnits, g, travel, cameraY, yaw, layers }) => {
      const layerLines = layers
        .map((l) => `  ${l.id.padEnd(6)} p${l.parallax.toFixed(2)}  y ${l.y.toFixed(1)}`)
        .join('\n');
      // Rotation is unbounded; show it folded into (-180°, 180°] plus the
      // signed turn count, so a free-spinning turntable stays readable.
      const deg = (yaw * 180) / Math.PI;
      const folded = deg - 360 * Math.round(deg / 360);
      const turns = Math.round((deg - folded) / 360);
      syncEl.textContent =
        `units ${units.toFixed(3)} / ${totalUnits.toFixed(2)}\n` +
        `g ${g.toFixed(3)}   travel ${travel.toFixed(1)}m\n` +
        `camera.y ${cameraY.toFixed(1)}\n` +
        `yaw ${folded.toFixed(1)}°${turns ? ` (${turns > 0 ? '+' : ''}${turns} turns)` : ''}\n` +
        `layers (offset y):\n${layerLines}`;
    });
  }

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
