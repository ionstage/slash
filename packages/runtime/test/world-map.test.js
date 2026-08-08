import test from 'node:test';
import assert from 'node:assert/strict';
import {
  travelAt,
  progressAt,
  layerOffset,
  rigOffset,
  orbit,
  cameraPose,
} from '../src/world-map.js';

const round = (v) => v.map((n) => Number(n.toFixed(6)) + 0);

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

test('orbit turns a point on a horizontal circle around the pivot', () => {
  const pivot = [0, 1, 0];
  const point = [0, 3, 8]; // 8 m from the axis, 2 m above the pivot

  assert.deepEqual(orbit(point, pivot, 0), point); // identity at yaw 0
  assert.deepEqual(round(orbit(point, pivot, Math.PI / 2)), [8, 3, 0]); // quarter turn
  assert.deepEqual(round(orbit(point, pivot, Math.PI)), [0, 3, -8]); // half turn
  assert.deepEqual(round(orbit(point, pivot, 2 * Math.PI)), [0, 3, 8]); // full turn is a no-op
});

test('orbit preserves height and radius at any angle, about any pivot', () => {
  const pivot = [-2, -30, 5];
  const point = [3, 4.5, -1];
  const radius = Math.hypot(point[0] - pivot[0], point[2] - pivot[2]);

  for (const yaw of [-9, -1.3, 0.4, 2.7, 17]) {
    const p = orbit(point, pivot, yaw);
    assert.equal(p[1], point[1], 'height is untouched by rotation');
    assert.ok(Math.abs(Math.hypot(p[0] - pivot[0], p[2] - pivot[2]) - radius) < 1e-9);
  }
});

test('yaw orbits the camera around its look-at, leaving the descent alone', () => {
  const world = { camera: { offset: [0, 2, 8], target: [0, 1, 0], fov: 48 } };
  const straight = cameraPose(world, 0.5, 30);
  const turned = cameraPose(world, 0.5, 30, Math.PI / 2);

  // Same scroll position → same height and same look-at; only the angle moved.
  assert.deepEqual(round(turned.position), [8, -28, 0]);
  assert.equal(turned.position[1], straight.position[1]);
  assert.deepEqual(turned.target, straight.target);
  assert.equal(turned.fov, straight.fov);

  // Rotating at a different scroll position gives the same rotation, shifted
  // vertically by the extra travel — the two axes never interfere.
  const lower = cameraPose(world, 0.5, 42, Math.PI / 2);
  assert.deepEqual(round(lower.position), [8, -40, 0]);
});

test('yaw orbits around the drifted look-at point', () => {
  const world = {
    camera: {
      offset: [0, 2, 8],
      target: [0, 1, 0],
      drift: {
        target: [
          { t: 0, value: [0, 0, 0] },
          { t: 1, value: [4, 0, 0] },
        ],
      },
    },
  };
  const turned = cameraPose(world, 1, 0, Math.PI);
  assert.deepEqual(turned.target, [4, 1, 0]); // the pivot itself never rotates
  assert.deepEqual(round(turned.position), [8, 2, -8]); // half turn about x = 4
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
