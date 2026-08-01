import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTrack } from '../src/tracks.js';

test('clamps before the first and after the last keyframe', () => {
  const track = [
    { t: 0.2, value: 1 },
    { t: 0.8, value: 5 },
  ];
  assert.equal(sampleTrack(track, 0), 1);
  assert.equal(sampleTrack(track, 1), 5);
});

test('interpolates linearly by default', () => {
  const track = [
    { t: 0, value: 0 },
    { t: 1, value: 10 },
  ];
  assert.equal(sampleTrack(track, 0.5), 5);
  assert.equal(sampleTrack(track, 0.25), 2.5);
});

test('interpolates vec3 values componentwise', () => {
  const track = [
    { t: 0, value: [0, 0, 0] },
    { t: 1, value: [2, 4, -6] },
  ];
  assert.deepEqual(sampleTrack(track, 0.5), [1, 2, -3]);
});

test('picks the correct segment among many keyframes', () => {
  const track = [
    { t: 0, value: 0 },
    { t: 0.5, value: 10 },
    { t: 1, value: 0 },
  ];
  assert.equal(sampleTrack(track, 0.25), 5);
  assert.equal(sampleTrack(track, 0.75), 5);
  assert.equal(sampleTrack(track, 0.5), 10);
});

test('easing shapes the segment leading into the later keyframe', () => {
  const track = [
    { t: 0, value: 0 },
    { t: 1, value: 1, easing: 'easeIn' },
  ];
  const v = sampleTrack(track, 0.5);
  assert.ok(v < 0.5, `easeIn midpoint should be below linear, got ${v}`);
  assert.equal(sampleTrack(track, 0), 0);
  assert.equal(sampleTrack(track, 1), 1);
});

test('easeInOut is symmetric around the midpoint', () => {
  const track = [
    { t: 0, value: 0 },
    { t: 1, value: 1, easing: 'easeInOut' },
  ];
  assert.equal(sampleTrack(track, 0.5), 0.5);
  const a = sampleTrack(track, 0.25);
  const b = sampleTrack(track, 0.75);
  assert.ok(Math.abs(a + b - 1) < 1e-9);
});

test('step holds the previous value until the keyframe is reached', () => {
  const track = [
    { t: 0, value: 0 },
    { t: 0.5, value: 1, easing: 'step' },
    { t: 1, value: 2, easing: 'step' },
  ];
  assert.equal(sampleTrack(track, 0.49), 0);
  assert.equal(sampleTrack(track, 0.5), 1);
  assert.equal(sampleTrack(track, 0.99), 1);
  assert.equal(sampleTrack(track, 1), 2);
});
