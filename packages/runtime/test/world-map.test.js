import test from 'node:test';
import assert from 'node:assert/strict';
import { travelAt, progressAt, layerOffset, rigOffset, cameraPose } from '../src/world-map.js';

test('travel scales linearly with scroll and travelPerUnit', () => {
  const world = { travelPerUnit: 6 };
  assert.equal(travelAt(0, world), 0);
  assert.equal(travelAt(2, world), 12);
  assert.equal(travelAt(1, {}), 1); // default travelPerUnit = 1
});

test('progress is units/length, clamped to [0,1]', () => {
  const world = { length: 10 };
  assert.equal(progressAt(0, world), 0);
  assert.equal(progressAt(5, world), 0.5);
  assert.equal(progressAt(10, world), 1);
  assert.equal(progressAt(12, world), 1); // clamped
});

test('layer offset: parallax 1 is world-fixed, parallax 0 rides the camera', () => {
  const travel = 20;
  assert.equal(layerOffset(1, travel), 0); // true world space: rises at full rate
  assert.equal(layerOffset(0, travel), -travel); // locked to camera → never passes
  assert.equal(layerOffset(0.25, travel), -15); // distant layer moves slowly
});

test('the traveler rig descends with the camera', () => {
  assert.equal(rigOffset(0), 0);
  assert.equal(rigOffset(18), -18);
});

test('camera pose descends with travel and folds in offsets', () => {
  const world = { camera: { offset: [0, 2, 8], target: [0, 1, 0], fov: 48 } };
  const a = cameraPose(world, 0, 0);
  assert.deepEqual(a.position, [0, 2, 8]);
  assert.deepEqual(a.target, [0, 1, 0]);
  assert.equal(a.fov, 48);

  const b = cameraPose(world, 0.5, 30);
  assert.deepEqual(b.position, [0, -28, 8]); // -30 travel + 2 offset
  assert.deepEqual(b.target, [0, -29, 0]); // -30 travel + 1 offset
});

test('camera drift adds art-directed motion over global progress', () => {
  const world = {
    camera: {
      offset: [0, 2, 8],
      target: [0, 1, 0],
      fov: 48,
      drift: {
        target: [
          { t: 0, value: [0, 0, 0] },
          { t: 1, value: [0, 0, -4] },
        ],
        fov: [
          { t: 0, value: 0 },
          { t: 1, value: 6 },
        ],
      },
    },
  };
  const mid = cameraPose(world, 0.5, 30);
  assert.deepEqual(mid.target, [0, -29, -2]); // -30 travel + 1 offset, z drifts to -2
  assert.equal(mid.fov, 51); // 48 + 3
});
