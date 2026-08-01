import playerSource from '../../runtime/dist-player/player.js?raw';
import { buildZip } from './zip.js';
import { documentEntries } from './fs.js';

/**
 * Story export: a self-contained static site — index.html + the prebuilt
 * player bundle (npm run build:player) + the project's content files.
 * Runs on any static host; optimization (dedupe/compression) lands in M5.
 */

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>__TITLE__</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #1a1a2e;
        overscroll-behavior: none; font: 13px/1.5 system-ui, sans-serif; }
      #app { position: fixed; inset: 0; touch-action: none; }
      #app canvas { display: block; width: 100%; height: 100%; }
      #progress { position: fixed; top: 0; left: 0; right: 0; height: 3px;
        background: rgba(255,255,255,0.12); pointer-events: none; }
      #progress-fill { width: 0; height: 100%; background: #e8b04b; }
      #scene-label { position: fixed; left: 16px; bottom: 14px;
        color: rgba(255,255,255,0.75); letter-spacing: 0.06em; pointer-events: none; }
      #hint { position: fixed; left: 0; right: 0; bottom: 44px; text-align: center;
        color: rgba(255,255,255,0.55); pointer-events: none; transition: opacity 0.6s; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="progress"><div id="progress-fill"></div></div>
    <span id="scene-label"></span>
    <div id="hint">Scroll &#8595;</div>
    <script type="module" src="./player.js"></script>
  </body>
</html>
`;

/**
 * @param {{ docs: any, files: Map<string, Blob> }} source
 * @returns {Promise<{ blob: Blob, paths: string[] }>}
 */
export async function buildExport({ docs, files }) {
  const encoder = new TextEncoder();
  const entries = [
    {
      path: 'index.html',
      data: encoder.encode(INDEX_HTML.replace('__TITLE__', escapeHtml(docs.project.title))),
    },
    { path: 'player.js', data: encoder.encode(playerSource) },
  ];
  for (const [path, text] of Object.entries(documentEntries(docs))) {
    entries.push({ path, data: encoder.encode(text) });
  }
  for (const [path, blob] of files) {
    entries.push({ path: `assets/${path}`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return { blob: buildZip(entries), paths: entries.map((e) => e.path) };
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
