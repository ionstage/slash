import playerSource from '../../runtime/dist-player/player.js?raw';
import { buildZip } from './zip.js';
import { documentEntries } from './fs.js';
import { optimizeProject } from './optimize.js';

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
        overscroll-behavior: none; font: 13px/1.5 system-ui, sans-serif; color: #d5d5e0; }
      #app { position: fixed; inset: 0; touch-action: none; }
      #app canvas { display: block; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./player.js"></script>
  </body>
</html>
`;

/**
 * @param {{ docs: any, files: Map<string, Blob> }} source
 * @returns {Promise<{ blob: Blob, paths: string[], report: object }>} report
 *   summarizes the optimization pass (pruned assets, dedupe count, sizes).
 */
export async function buildExport(source) {
  const { docs, files, report } = await optimizeProject(source);
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
  for (const [path, data] of files) {
    entries.push({ path: `assets/${path}`, data });
  }
  return { blob: buildZip(entries), paths: entries.map((e) => e.path), report };
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
