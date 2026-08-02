import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTransition, TRANSITIONS } from '../src/transitions.js';

test('the registry ships only cut in the current scope', () => {
  assert.deepEqual(Object.keys(TRANSITIONS), ['cut']);
  assert.equal(TRANSITIONS.cut.banded, false);
});

test('missing/unknown transitions resolve to a non-banded cut', () => {
  for (const t of [undefined, { type: 'cut' }, { type: 'wobble' }, { type: 'crossfade' }]) {
    const r = resolveTransition(t);
    assert.equal(r.type, 'cut');
    assert.equal(r.banded, false);
    assert.equal(r.span, 0);
  }
});
