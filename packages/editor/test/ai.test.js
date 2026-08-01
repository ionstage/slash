import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonResponse, mergeEnvelope } from '../src/ai/envelope.js';
import { buildScenesPrompt, projectContext } from '../src/ai/prompts.js';
import { mockEnvelope } from '../src/ai/providers.js';

const docs = () => ({
  project: { formatVersion: 1, id: 'p', title: 'P' },
  story: {
    formatVersion: 1,
    start: 'a',
    scenes: [{ id: 'a', path: 'scenes/a.json', next: null }],
  },
  scenes: {
    a: {
      formatVersion: 2,
      id: 'a',
      stage: { assetId: 'ground' },
      camera: {
        viewpoint: { position: [0, 1, 5], target: [0, 0, 0] },
      },
    },
  },
  assetIndex: {
    formatVersion: 1,
    assets: [
      { id: 'ground', type: 'stage', kind: 'primitive', primitive: { shape: 'plane' } },
      { id: 'hero', type: 'character', kind: 'primitive', primitive: { shape: 'capsule' } },
    ],
  },
  state: { formatVersion: 1, flags: { met: { initial: false } } },
});

test('parseJsonResponse handles fences and surrounding prose', () => {
  assert.deepEqual(parseJsonResponse('{"a": 1}'), { a: 1 });
  assert.deepEqual(parseJsonResponse('Sure!\n```json\n{"a": 1}\n```\nDone.'), { a: 1 });
  assert.throws(() => parseJsonResponse('no json here'));
});

test('mergeEnvelope splices valid scenes into the story chain', () => {
  const result = mergeEnvelope(docs(), mockEnvelope(docs(), 'a foggy bridge crossing'));
  assert.deepEqual(result.errors, []);
  assert.ok(result.ok);
  assert.equal(result.addedSceneIds.length, 1);
  const [id] = result.addedSceneIds;
  assert.equal(result.docs.story.scenes.at(-1).id, id);
  assert.equal(result.docs.story.scenes[0].next, id); // spliced after previous last node
  assert.equal(result.docs.scenes[id].stage.assetId, 'ground');
});

test('mergeEnvelope renames colliding scene ids', () => {
  const envelope = mockEnvelope(docs(), 'a'); // slug collides with existing scene "a"
  const result = mergeEnvelope(docs(), envelope);
  assert.ok(result.ok);
  assert.notEqual(result.addedSceneIds[0], 'a');
});

test('mergeEnvelope rejects invalid generated content without applying', () => {
  const envelope = mockEnvelope(docs(), 'bad scene');
  envelope.scenes[0].stage.assetId = 'ghost';
  const result = mergeEnvelope(docs(), envelope);
  assert.ok(!result.ok);
  assert.match(result.errors.map((e) => e.message).join(), /unknown asset "ghost"/);
});

test('mergeEnvelope merges new state keys', () => {
  const envelope = mockEnvelope(docs(), 'stateful scene');
  envelope.state = { flags: { doorOpen: { initial: false } } };
  envelope.scenes[0].events.push({
    id: 'open-door',
    trigger: { type: 'tap' },
    actions: [{ type: 'setState', key: 'doorOpen', value: true }],
  });
  const result = mergeEnvelope(docs(), envelope);
  assert.deepEqual(result.errors, []);
  assert.equal(result.docs.state.flags.doorOpen.initial, false);
  assert.equal(result.docs.state.flags.met.initial, false); // existing keys kept
});

test('buildScenesPrompt embeds project context and the scene schema', () => {
  const prompt = buildScenesPrompt(projectContext(docs()), 'A duel at dawn');
  assert.match(prompt, /"ground"/);
  assert.match(prompt, /"hero"/);
  assert.match(prompt, /A duel at dawn/);
  assert.match(prompt, /"scrollLength"/); // scene schema embedded
  assert.match(prompt, /Existing state keys: \["met"\]/);
});
