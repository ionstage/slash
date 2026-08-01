import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, validateProject, migrateScene } from '../src/index.js';

const minimalScene = (id) => ({
  formatVersion: 2,
  id,
  stage: { assetId: 'ground' },
  camera: {
    viewpoint: { position: [0, 1, 5], target: [0, 0, 0] },
  },
});

const minimalDocs = () => ({
  project: { formatVersion: 1, id: 'p', title: 'P' },
  story: {
    formatVersion: 1,
    start: 'a',
    scenes: [{ id: 'a', path: 'scenes/a.json', next: null }],
  },
  scenes: { a: minimalScene('a') },
  assetIndex: {
    formatVersion: 1,
    assets: [{ id: 'ground', type: 'stage', kind: 'primitive', primitive: { shape: 'plane' } }],
  },
  state: { formatVersion: 1 },
});

test('accepts a minimal valid project', () => {
  const result = validateProject(minimalDocs());
  assert.deepEqual(result.errors, []);
  assert.ok(result.valid);
});

test('rejects unknown properties and bad enums with precise paths', () => {
  const scene = minimalScene('a');
  scene.camera.drift = { position: [{ t: 0, value: [0, 0, 0], easing: 'bounce' }] };
  scene.mystery = true;
  const result = validateDocument('scene', scene);
  assert.ok(!result.valid);
  const paths = result.errors.map((e) => e.path);
  assert.ok(paths.includes('/camera/drift/position/0/easing'));
  assert.ok(paths.includes('/mystery'));
});

test('migrateScene upgrades v1 camera tracks to a viewpoint, preserving motion as drift', () => {
  const v1 = {
    formatVersion: 1,
    id: 'a',
    stage: { assetId: 'ground' },
    camera: {
      fov: 45,
      tracks: {
        position: [
          { t: 0, value: [0, 2, 6] },
          { t: 1, value: [3, 2, 0], easing: 'easeInOut' },
        ],
        lookAt: [{ t: 0, value: [0, 1, 0] }],
      },
    },
  };
  const v2 = migrateScene(v1);
  assert.equal(v2.formatVersion, 2);
  assert.deepEqual(v2.camera.viewpoint, { position: [0, 2, 6], target: [0, 1, 0], fov: 45 });
  // The moving position track becomes drift offsets from the viewpoint.
  assert.deepEqual(v2.camera.drift.position, [
    { t: 0, value: [0, 0, 0] },
    { t: 1, value: [3, 0, -6], easing: 'easeInOut' },
  ]);
  // A single-keyframe lookAt has no motion, so no target drift.
  assert.equal(v2.camera.drift.target, undefined);
  assert.ok(validateDocument('scene', v2).valid);
  // Already-migrated documents pass through untouched.
  assert.equal(migrateScene(v2), v2);
});

test('oneOf rejects an action matching no variant', () => {
  const scene = minimalScene('a');
  scene.events = [
    {
      id: 'e',
      trigger: { type: 'progress', at: 0.5 },
      actions: [{ type: 'explode' }],
    },
  ];
  const result = validateDocument('scene', scene);
  assert.ok(!result.valid);
});

test('cross-reference checks catch dangling ids', () => {
  const docs = minimalDocs();
  docs.scenes.a.stage.assetId = 'ghost';
  docs.story.start = 'nowhere';
  const result = validateProject(docs);
  assert.ok(!result.valid);
  const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  assert.match(messages, /unknown scene "nowhere"/);
  assert.match(messages, /unknown asset "ghost"/);
});

test('cross-reference checks catch unknown state keys in setState actions', () => {
  const docs = minimalDocs();
  docs.scenes.a.events = [
    {
      id: 'e',
      trigger: { type: 'progress', at: 0.5 },
      actions: [{ type: 'setState', key: 'missing', value: true }],
    },
  ];
  const result = validateProject(docs);
  assert.ok(!result.valid);
  assert.match(result.errors[0].message, /unknown state key/);
});
