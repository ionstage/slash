import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, validateProject } from '../src/index.js';

const minimalWorld = () => ({
  formatVersion: 3,
  id: 'w',
  length: 6,
  camera: { offset: [0, 2, 8], target: [0, 1, 0] },
  layers: [{ id: 'world', parallax: 1 }],
  objects: [{ id: 'ground', assetId: 'ground', layer: 'world', worldY: 0 }],
  actors: [{ id: 'hero', assetId: 'hero', follow: 'camera' }],
});

const minimalDocs = () => ({
  project: { formatVersion: 1, id: 'p', title: 'P' },
  world: minimalWorld(),
  assetIndex: {
    formatVersion: 1,
    assets: [
      { id: 'ground', type: 'stage', kind: 'primitive', primitive: { shape: 'plane' } },
      { id: 'hero', type: 'character', kind: 'primitive', primitive: { shape: 'capsule' } },
    ],
  },
});

test('accepts a minimal valid project', () => {
  const result = validateProject(minimalDocs());
  assert.deepEqual(result.errors, []);
  assert.ok(result.valid);
});

test('rejects unknown properties and bad enums with precise paths', () => {
  const world = minimalWorld();
  world.camera.drift = { position: [{ t: 0, value: [0, 0, 0], easing: 'bounce' }] };
  world.mystery = true;
  const result = validateDocument('world', world);
  assert.ok(!result.valid);
  const paths = result.errors.map((e) => e.path);
  assert.ok(paths.includes('/camera/drift/position/0/easing'));
  assert.ok(paths.includes('/mystery'));
});

test('the world is passive: legacy scene/story fields are rejected', () => {
  const world = minimalWorld();
  world.objects[0].events = [{ id: 'e', trigger: { type: 'progress', at: 0.5 }, actions: [] }];
  assert.ok(!validateDocument('world', world).valid);

  const world2 = minimalWorld();
  world2.scenes = [{ id: 'a', path: 'scenes/a.json' }];
  assert.ok(!validateDocument('world', world2).valid);
});

test('actor follow is constrained to camera/world', () => {
  const world = minimalWorld();
  world.actors[0].follow = 'swipe';
  assert.ok(!validateDocument('world', world).valid);
});

test('cross-reference checks catch dangling ids and unknown layers', () => {
  const docs = minimalDocs();
  docs.world.objects[0].assetId = 'ghost';
  docs.world.objects[0].layer = 'nowhere';
  docs.world.actors[0].assetId = 'phantom';
  const result = validateProject(docs);
  assert.ok(!result.valid);
  const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  assert.match(messages, /unknown asset "ghost"/);
  assert.match(messages, /unknown layer "nowhere"/);
  assert.match(messages, /unknown asset "phantom"/);
});

test('cross-reference checks catch duplicate object/layer ids', () => {
  const docs = minimalDocs();
  docs.world.layers.push({ id: 'world', parallax: 0.5 });
  docs.world.objects.push({ id: 'ground', assetId: 'ground', layer: 'world', worldY: -4 });
  const result = validateProject(docs);
  assert.ok(!result.valid);
  const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  assert.match(messages, /duplicate layer ids/);
  assert.match(messages, /duplicate object id "ground"/);
});
