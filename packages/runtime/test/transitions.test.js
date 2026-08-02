import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTransition, TRANSITIONS } from '../src/transitions.js';

test('missing/unknown transitions resolve to a non-banded cut', () => {
  for (const t of [undefined, { type: 'cut' }, { type: 'wobble' }]) {
    const r = resolveTransition(t);
    assert.equal(r.type, 'cut');
    assert.equal(r.banded, false);
    assert.equal(r.span, 0);
  }
});

test('banded transitions take the edge span, else the registry default', () => {
  assert.equal(resolveTransition({ type: 'crossfade' }).span, TRANSITIONS.crossfade.defaultSpan);
  assert.equal(resolveTransition({ type: 'crossfade', span: 0.9 }).span, 0.9);
});

test('continuity carries carry/offset through and is marked stacked', () => {
  const r = resolveTransition({ type: 'continuity', carry: ['hero'], offset: [0, -0.3, -16] });
  assert.equal(r.type, 'continuity');
  assert.equal(r.stacked, true);
  assert.deepEqual(r.carry, ['hero']);
  assert.deepEqual(r.offset, [0, -0.3, -16]);
  // Stacked continuity keeps both stages fully opaque (no dissolve).
  assert.deepEqual(r.def.weights(0.5), { from: 1, to: 1 });
});

test('continuity defaults: empty carry, zero offset, non-stacked types stay []/[0,0,0]', () => {
  const c = resolveTransition({ type: 'continuity' });
  assert.deepEqual(c.carry, []);
  assert.deepEqual(c.offset, [0, 0, 0]);
  const x = resolveTransition({ type: 'crossfade' });
  assert.equal(x.stacked, false);
  assert.deepEqual(x.offset, [0, 0, 0]);
});
