import { WebIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

/**
 * Export-time optimization (Asset Reuse / Performance in the spec):
 *  - reachable-asset pruning: only assets a scene actually references ship
 *  - content-hash dedupe: identical binaries collapse to one file
 *  - GLB compression: gltf-transform dedup/prune/reorder/quantize with
 *    EXT_meshopt_compression (the runtime already wires MeshoptDecoder)
 *
 * DRACO and KTX2/basis are intentionally out: their encoders need external
 * wasm binaries; meshopt ships embedded. Audio stays as-authored.
 */

/**
 * Asset ids actually referenced by the story's scenes (stage, actors,
 * scene audio, playSound actions).
 *
 * @param {{ story: any, scenes: Record<string, any> }} docs
 * @returns {Set<string>}
 */
export function reachableAssetIds(docs) {
  const used = new Set();
  for (const node of docs.story.scenes) {
    for (const entry of [node, ...(node.viewpoints ?? [])]) {
      const scene = docs.scenes[entry.id];
      if (!scene) continue;
      used.add(scene.stage.assetId);
      for (const actor of scene.actors ?? []) used.add(actor.assetId);
      if (scene.audio?.bgm) used.add(scene.audio.bgm);
      if (scene.audio?.ambient) used.add(scene.audio.ambient);
      for (const event of scene.events ?? []) {
        for (const action of event.actions) {
          if (action.type === 'playSound') used.add(action.asset);
        }
      }
    }
  }
  return used;
}

/**
 * Collapse byte-identical files to a single path, returning the rewritten
 * file map and a source-path rewrite table.
 *
 * @param {Map<string, Uint8Array>} files path → bytes
 * @returns {Promise<{ files: Map<string, Uint8Array>, rewrites: Map<string, string> }>}
 */
export async function dedupeFiles(files) {
  const byHash = new Map();
  const rewrites = new Map();
  const out = new Map();
  for (const [path, bytes] of files) {
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const canonical = byHash.get(hash);
    if (canonical) {
      rewrites.set(path, canonical);
    } else {
      byHash.set(hash, path);
      out.set(path, bytes);
    }
  }
  return { files: out, rewrites };
}

let io = null;
async function gltfIO() {
  if (!io) {
    await MeshoptEncoder.ready;
    io = new WebIO()
      .registerExtensions([EXTMeshoptCompression])
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  }
  return io;
}

/**
 * Optimize one GLB. Returns the smaller of optimized/original bytes.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function optimizeGlb(bytes) {
  const _io = await gltfIO();
  const doc = await _io.readBinary(bytes);
  await doc.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder }), quantize());
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const optimized = await _io.writeBinary(doc);
  return optimized.length < bytes.length ? optimized : bytes;
}

/**
 * Run the whole pipeline over a project's documents + binary files.
 * Returns optimized copies (originals untouched) plus a report.
 *
 * @param {{ docs: any, files: Map<string, Blob> }} source
 * @returns {Promise<{ docs: any, files: Map<string, Uint8Array>, report: {
 *   prunedAssets: string[], dedupedFiles: number, bytesBefore: number, bytesAfter: number,
 * } }>}
 */
export async function optimizeProject({ docs, files }) {
  const out = JSON.parse(JSON.stringify(docs));

  // 1. Prune unreachable assets (and their files).
  const used = reachableAssetIds(out);
  const prunedAssets = out.assetIndex.assets.filter((a) => !used.has(a.id)).map((a) => a.id);
  const keptSources = new Set(
    out.assetIndex.assets.filter((a) => used.has(a.id)).map((a) => a.source).filter(Boolean),
  );
  out.assetIndex.assets = out.assetIndex.assets.filter((a) => used.has(a.id));

  let bytesBefore = 0;
  const binaries = new Map();
  for (const [path, blob] of files) {
    if (!keptSources.has(path)) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    bytesBefore += bytes.length;
    binaries.set(path, bytes);
  }

  // 2. Compress models.
  for (const [path, bytes] of binaries) {
    if (!path.endsWith('.glb')) continue;
    try {
      binaries.set(path, await optimizeGlb(bytes));
    } catch (err) {
      console.warn(`[slash] export: could not optimize ${path}, keeping original`, err);
    }
  }

  // 3. Dedupe identical binaries and rewrite asset sources.
  const { files: dedupedBinaries, rewrites } = await dedupeFiles(binaries);
  for (const asset of out.assetIndex.assets) {
    if (asset.source && rewrites.has(asset.source)) asset.source = rewrites.get(asset.source);
  }

  let bytesAfter = 0;
  for (const bytes of dedupedBinaries.values()) bytesAfter += bytes.length;

  return {
    docs: out,
    files: dedupedBinaries,
    report: { prunedAssets, dedupedFiles: rewrites.size, bytesBefore, bytesAfter },
  };
}
