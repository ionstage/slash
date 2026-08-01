/**
 * Editor entry: builds the store, viewport and panels, and wires the
 * topbar (new/open/sample/save/export/preview).
 */
import { loadProject } from '@slash/runtime';
import { createProjectStore } from './project-store.js';
import { createViewport } from './viewport.js';
import { createHierarchy } from './hierarchy.js';
import { createInspector } from './inspector.js';
import { createTimeline } from './timeline.js';
import { createPreviewPanel } from './preview-panel.js';
import {
  hasFileSystemAccess,
  openProjectDirectory,
  saveProjectDirectory,
  projectSourceZip,
  downloadBlob,
} from './fs.js';
import { buildExport } from './export.js';

const $ = (id) => document.getElementById(id);

const toastEl = $('toast');
let toastTimer = null;
function toast(message, ms = 3200) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}

const store = createProjectStore();
const viewport = createViewport($('viewport'), store);

createHierarchy(
  {
    sceneList: $('scene-list'),
    objectList: $('object-list'),
    assetList: $('asset-list'),
    dropZone: $('drop-zone'),
  },
  store,
  { toast },
);
createInspector($('inspector-body'), store, viewport);
createTimeline(
  {
    scrubber: $('progress-scrubber'),
    tLabel: $('t-label'),
    btnSetKey: $('btn-set-key'),
    btnDeleteKey: $('btn-delete-key'),
    previewToggle: $('camera-preview-toggle'),
  },
  store,
  viewport,
);
const preview = createPreviewPanel(
  {
    overlay: $('preview-overlay'),
    frameWrap: $('preview-frame-wrap'),
    iframe: $('preview-iframe'),
    btnClose: $('btn-preview-close'),
    btnMobile: $('btn-preview-mobile'),
  },
  store,
);

// --- Topbar ---

$('btn-new').addEventListener('click', () => {
  store.newProject();
  toast('New project created');
});

$('btn-sample').addEventListener('click', async () => {
  try {
    const bundle = await loadProject('/');
    store.loadBundle(bundle);
    store.dirty = true; // in-memory copy; saving writes to a chosen location
    toast(`Loaded sample: ${bundle.project.title}`);
  } catch (err) {
    toast(`Sample load failed: ${err.message}`);
  }
});

$('btn-open').addEventListener('click', async () => {
  if (!hasFileSystemAccess) return toast('Directory open needs a Chromium browser');
  try {
    const { docs, files, dirHandle } = await openProjectDirectory();
    store.loadBundle(docs, files, dirHandle);
    toast(`Opened ${docs.project.title}`);
  } catch (err) {
    if (err.name !== 'AbortError') toast(`Open failed: ${err.message}`);
  }
});

$('btn-save').addEventListener('click', async () => {
  if (!store.docs) return toast('Nothing to save');
  try {
    if (hasFileSystemAccess) {
      store.dirHandle ??= await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveProjectDirectory(store.dirHandle, store.docs, store.files);
      store.dirty = false;
      store.emit('saved');
      toast('Saved');
    } else {
      downloadBlob(
        `${store.docs.project.id}-source.zip`,
        await projectSourceZip(store.docs, store.files),
      );
      toast('Downloaded project source zip');
    }
  } catch (err) {
    if (err.name !== 'AbortError') toast(`Save failed: ${err.message}`);
  }
});

$('btn-export').addEventListener('click', async () => {
  if (!store.docs) return toast('Nothing to export');
  const result = store.validate();
  if (!result.valid) {
    toast(`Cannot export, ${result.errors.length} error(s): ${result.errors[0].path}: ${result.errors[0].message}`, 6000);
    return;
  }
  const { blob, paths } = await buildExport(store);
  downloadBlob(`${store.docs.project.id}-story.zip`, blob);
  toast(`Exported ${paths.length} files`);
});

$('btn-preview').addEventListener('click', () => {
  if (!store.docs) return toast('Nothing to preview');
  preview.open();
});

$('btn-add-scene').addEventListener('click', () => {
  if (store.docs) store.addScene();
});

// Gizmo mode hotkeys (skip while typing in a field).
window.addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  const modes = { w: 'translate', e: 'rotate', r: 'scale' };
  if (modes[e.key]) viewport.setGizmoMode(modes[e.key]);
});

// Title + dirty indicator.
store.subscribe(() => {
  $('project-title').textContent = store.docs ? store.docs.project.title : 'No project open';
  $('dirty-dot').hidden = !store.dirty;
});

// Dev/debug hook (used by automated verification; not a public API).
window.__slash = { store, buildExport: () => buildExport(store) };
