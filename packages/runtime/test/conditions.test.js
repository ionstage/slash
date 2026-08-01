import test from 'node:test';
import assert from 'node:assert/strict';
import { evalCondition, resolveNext } from '../src/conditions.js';

const stateOf = (obj) => (key) => obj[key];

test('evalCondition: missing condition is always true', () => {
  assert.equal(evalCondition(undefined, stateOf({})), true);
});

test('evalCondition: strict equality against current state', () => {
  const get = stateOf({ rangBell: true, blessings: 1 });
  assert.equal(evalCondition({ key: 'rangBell', equals: true }, get), true);
  assert.equal(evalCondition({ key: 'rangBell', equals: false }, get), false);
  assert.equal(evalCondition({ key: 'blessings', equals: 1 }, get), true);
  assert.equal(evalCondition({ key: 'blessings', equals: '1' }, get), false);
  assert.equal(evalCondition({ key: 'unknown', equals: true }, get), false);
});

test('resolveNext: first matching branch wins over next', () => {
  const entry = {
    next: 'end',
    branches: [
      { when: { key: 'a', equals: true }, next: 'branch-a' },
      { when: { key: 'b', equals: true }, next: 'branch-b' },
    ],
  };
  assert.equal(resolveNext(entry, stateOf({ a: true, b: true })), 'branch-a');
  assert.equal(resolveNext(entry, stateOf({ a: false, b: true })), 'branch-b');
  assert.equal(resolveNext(entry, stateOf({ a: false, b: false })), 'end');
});

test('resolveNext: no branches and no next ends the story', () => {
  assert.equal(resolveNext({ next: null }, stateOf({})), null);
  assert.equal(resolveNext({}, stateOf({})), null);
});
