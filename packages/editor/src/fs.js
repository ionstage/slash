import { buildZip } from './zip.js';

/**
 * Project persistence. Chromium: File System Access API (open/save a real
 * directory). Other browsers: zip download fallback for saving; opening a
 * directory is Chromium-only in M2.
 */

export const hasFileSystemAccess = 'showDirectoryPicker' in window;

/** Open a project directory; returns { docs, files, dirHandle }. */
export async function openProjectDirectory() {
  const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const json = async (path) => JSON.parse(await (await fileAt(dirHandle, path)).text());

  const project = await json('project.json');
  const story = await json('story.json');
  const assetIndex = await json('assets/index.json');
  const state = await json('state.json');
  const scenes = {};
  for (const entry of story.scenes ?? []) scenes[entry.id] = await json(entry.path);

  // Pull every binary under assets/ (except index.json) into memory.
  const files = new Map();
  const assetsDir = await dirHandle.getDirectoryHandle('assets');
  await collectFiles(assetsDir, '', files);
  files.delete('index.json');

  return { docs: { project, story, scenes, assetIndex, state }, files, dirHandle };
}

async function fileAt(dirHandle, path) {
  const parts = path.split('/');
  let dir = dirHandle;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
  return (await dir.getFileHandle(parts.at(-1))).getFile();
}

async function collectFiles(dirHandle, prefix, out) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') out.set(prefix + name, await handle.getFile());
    else await collectFiles(handle, `${prefix}${name}/`, out);
  }
}

/** All content documents as { path: jsonString } entries. */
export function documentEntries(docs) {
  const entries = {
    'project.json': docs.project,
    'story.json': docs.story,
    'assets/index.json': docs.assetIndex,
    'state.json': docs.state,
  };
  for (const node of docs.story.scenes) {
    for (const entry of [node, ...(node.viewpoints ?? [])]) {
      entries[entry.path] = docs.scenes[entry.id];
    }
  }
  return Object.fromEntries(
    Object.entries(entries).map(([path, doc]) => [path, JSON.stringify(doc, null, 2) + '\n']),
  );
}

/** Write the project into a directory handle. */
export async function saveProjectDirectory(dirHandle, docs, files) {
  for (const [path, text] of Object.entries(documentEntries(docs))) {
    await writeFile(dirHandle, path, text);
  }
  for (const [path, blob] of files) {
    await writeFile(dirHandle, `assets/${path}`, blob);
  }
}

async function writeFile(dirHandle, path, data) {
  const parts = path.split('/');
  let dir = dirHandle;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const handle = await dir.getFileHandle(parts.at(-1), { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

/** Zip of the project source (fallback save for non-Chromium browsers). */
export async function projectSourceZip(docs, files) {
  const encoder = new TextEncoder();
  const entries = Object.entries(documentEntries(docs)).map(([path, text]) => ({
    path,
    data: encoder.encode(text),
  }));
  for (const [path, blob] of files) {
    entries.push({ path: `assets/${path}`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return buildZip(entries);
}

export function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
