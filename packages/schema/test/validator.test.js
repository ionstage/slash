import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, validateProject, migrateScene, migrateStory } from '../src/index.js';

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
    formatVersion: 2,
    start: 'a',
    scenes: [{ id: 'a', path: 'scenes/a.json', next: null }],
  },
  scenes: { a: minimalScene('a') },
  assetIndex: {
    formatVersion: 1,
    assets: [{ id: 'ground', type: 'stage', kind: 'primitive', primitive: { shape: 'plane' } }],
  },
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

test('migrateStory bumps v1 stories to v2', () => {
  const v1 = {
    formatVersion: 1,
    start: 'a',
    scenes: [{ id: 'a', path: 'scenes/a.json', next: null }],
  };
  const v2 = migrateStory(v1);
  assert.equal(v2.formatVersion, 2);
  assert.ok(validateDocument('story', v2).valid);
  const already = migrateStory(v2);
  assert.equal(already, v2); // pass-through
});

test('story is a linear chain: `branches` and `transition` are rejected', () => {
  const story = {
    formatVersion: 2,
    start: 'a',
    scenes: [
      { id: 'a', path: 'scenes/a.json', next: 'b' },
      { id: 'b', path: 'scenes/b.json', next: null },
    ],
  };
  assert.ok(validateDocument('story', story).valid);

  // Branching and per-edge transitions were removed from the format.
  story.scenes[0].branches = [{ when: { key: 'x', equals: true }, next: 'b' }];
  assert.ok(!validateDocument('story', story).valid);
  delete story.scenes[0].branches;
  story.scenes[0].transition = { type: 'cut' };
  assert.ok(!validateDocument('story', story).valid);
});

test('scenes are passive: `events` and `audio` are rejected', () => {
  const scene = minimalScene('a');
  scene.events = [{ id: 'e', trigger: { type: 'progress', at: 0.5 }, actions: [] }];
  assert.ok(!validateDocument('scene', scene).valid);

  const scene2 = minimalScene('a');
  scene2.audio = { ambient: 'wind' };
  assert.ok(!validateDocument('scene', scene2).valid);
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
