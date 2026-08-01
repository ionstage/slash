/**
 * Keyframe editing helpers shared by the timeline and inspector.
 * Tracks stay sorted by t; keys closer than EPSILON merge into one.
 */

const EPSILON = 0.02;

export function upsertKey(track, t, value, easing) {
  const existing = track.findIndex((k) => Math.abs(k.t - t) < EPSILON);
  const key = { t: round(t), value };
  if (easing) key.easing = easing;
  if (existing >= 0) {
    key.easing = easing ?? track[existing].easing;
    if (!key.easing) delete key.easing;
    track[existing] = key;
  } else {
    track.push(key);
    track.sort((a, b) => a.t - b.t);
  }
}

export function keyNear(track, t) {
  return track?.find((k) => Math.abs(k.t - t) < EPSILON);
}

export function deleteKeyNear(track, t) {
  const i = track.findIndex((k) => Math.abs(k.t - t) < EPSILON);
  if (i >= 0 && track.length > 1) track.splice(i, 1);
  return i >= 0;
}

export function round(v) {
  return Math.round(v * 1000) / 1000;
}

export function roundVec(arr) {
  return arr.map(round);
}
