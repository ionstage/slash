import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, WebIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { reachableAssetIds, dedupeFiles, optimizeGlb } from '../src/optimize.js';

test('reachableAssetIds collects stage, actors, audio and playSound refs', () => {
  const docs = {
    story: {
      scenes: [
        { id: 'a', viewpoints: [{ id: 'a-alt' }] },
        { id: 'b' },
      ],
    },
    scenes: {
      a: {
        stage: { assetId: 'ground' },
        actors: [{ id: 'hero', assetId: 'hero-model' }],
        audio: { ambient: 'wind' },
        events: [],
      },
      'a-alt': {
        stage: { assetId: 'ground-alt' },
        events: [
          { id: 'e', trigger: { type: 'tap' }, actions: [{ type: 'playSound', asset: 'chime' }] },
        ],
      },
      b: { stage: { assetId: 'ground' }, events: [] },
    },
  };
  const used = reachableAssetIds(docs);
  assert.deepEqual(
    [...used].sort(),
    ['chime', 'ground', 'ground-alt', 'hero-model', 'wind'],
  );
});

test('dedupeFiles collapses identical bytes and reports rewrites', async () => {
  const bytes = (s) => new TextEncoder().encode(s);
  const { files, rewrites } = await dedupeFiles(
    new Map([
      ['models/a.glb', bytes('same-content')],
      ['models/b.glb', bytes('same-content')],
      ['models/c.glb', bytes('different')],
    ]),
  );
  assert.equal(files.size, 2);
  assert.equal(rewrites.get('models/b.glb'), 'models/a.glb');
  assert.ok(!rewrites.has('models/c.glb'));
});

function testGlb() {
  // A 33x33 grid: enough vertices that quantization + meshopt visibly shrink it.
  const doc = new Document();
  const buffer = doc.createBuffer();
  const n = 33;
  const positions = new Float32Array(n * n * 3);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 3;
      positions[i] = x / n;
      positions[i + 1] = Math.sin(x * 0.7) * Math.cos(y * 0.7);
      positions[i + 2] = y / n;
    }
  }
  const indices = [];
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const i = y * n + x;
      indices.push(i, i + 1, i + n, i + 1, i + n + 1, i + n);
    }
  }
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(positions)
    .setBuffer(buffer);
  const index = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint32Array(indices))
    .setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(index);
  const mesh = doc.createMesh('grid').addPrimitive(prim);
  const node = doc.createNode('grid').setMesh(mesh);
  doc.createScene().addChild(node);
  return doc;
}

test('optimizeGlb shrinks a GLB and keeps it loadable (meshopt)', async () => {
  const io = new WebIO()
    .registerExtensions([EXTMeshoptCompression])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const original = await io.writeBinary(testGlb());
  const optimized = await optimizeGlb(original);

  assert.ok(
    optimized.length < original.length,
    `expected smaller output (${optimized.length} vs ${original.length})`,
  );
  const roundTrip = await io.readBinary(optimized);
  const names = roundTrip.getRoot().listExtensionsUsed().map((e) => e.extensionName);
  assert.ok(names.includes('EXT_meshopt_compression'), `extensions: ${names}`);
});
