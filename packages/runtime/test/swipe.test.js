import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwipeDriver } from '../src/swipe.js';

const WIDTH = 360; // viewport width used by the harness
const DEG = Math.PI / 180;
const deg = (rad) => (rad * 180) / Math.PI;

/**
 * Minimal event-target harness: enough DOM for the driver (a canvas host and
 * its window) to run in Node, so the gesture rules — the wobble deadband, the
 * drag mapping, the flick coast, the settle onto a configured step, key
 * rotation — are testable without a browser.
 *
 * A driver built with no `steps` rotates freely and rests wherever it is left;
 * one built with `steps` comes to rest only on those angles. Both are exercised
 * below, since free rotation is what the snap degenerates to.
 */
function harness() {
  const make = () => {
    const listeners = new Map();
    return {
      addEventListener(type, fn) {
        (listeners.get(type) ?? listeners.set(type, new Set()).get(type)).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      emit(type, ev) {
        for (const fn of listeners.get(type) ?? []) fn(ev);
      },
      listenerCount() {
        return [...listeners.values()].reduce((n, set) => n + set.size, 0);
      },
    };
  };
  const win = make();
  const root = { style: { overscrollBehaviorX: '' } };
  const element = {
    ...make(),
    clientWidth: WIDTH,
    ownerDocument: { defaultView: win, documentElement: root },
  };
  return { element, win, root };
}

let clock = 0;
const mouse = (x, y) => ({
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  clientX: x,
  clientY: y,
  timeStamp: clock,
  preventDefault() {},
});
const touch = (x, y) => {
  const list = [{ identifier: 7, clientX: x, clientY: y }];
  return { touches: list, changedTouches: list, timeStamp: clock };
};

/** Drag from (x0,y0) to (x1,y1) in `steps`, `ms` apart, with the given device. */
function drag(h, [x0, y0], [x1, y1], { steps = 8, ms = 16, device = mouse } = {}) {
  const at = (i) => [x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps];
  const touching = device === touch;
  h.element.emit(touching ? 'touchstart' : 'pointerdown', device(x0, y0));
  for (let i = 1; i <= steps; i++) {
    clock += ms;
    h.win.emit(touching ? 'touchmove' : 'pointermove', device(...at(i)));
  }
}

const release = (h, [x, y], device = mouse) =>
  h.win.emit(device === touch ? 'touchend' : 'pointerup', device(x, y));

/** Run `seconds` of frames and return the resting angle in degrees. */
function settle(driver, seconds = 3, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i++) driver.update(dt);
  return deg(driver.yaw);
}

/** Right-hand drag of `px`, slow enough that the release is not a throw. */
function turnAndRest(h, px) {
  drag(h, [0, 100], [px, 100]);
  clock += 250; // the finger rests, so nothing is thrown
  release(h, [px, 100]);
}

test('a horizontal drag turns the world 1:1 with the finger', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {}); // default 180°/width

  // Cross the wobble deadband, then drag half a viewport width to the right.
  h.element.emit('pointerdown', mouse(0, 100));
  clock += 16;
  h.win.emit('pointermove', mouse(8, 100)); // exactly the deadband: no rotation yet
  assert.equal(driver.update(0), 0);
  clock += 16;
  h.win.emit('pointermove', mouse(8 + WIDTH / 2, 100));

  // Half a width at 180°/width = 90°, negative: dragging right pushes the
  // world right, which walks the camera left around the pivot.
  assert.equal(Math.round(deg(driver.update(0.016))), -90);
});

test('degreesPerWidth scales the gesture', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { degreesPerWidth: 90 });
  drag(h, [0, 100], [-WIDTH, 100]); // a full width to the left
  // The 8px deadband is not charged, so expect just under a full 90° turn.
  assert.ok(Math.abs(deg(driver.update(0.016)) - 90 * (1 - 8 / WIDTH)) < 0.5);
});

test('a diagonal drag turns by its horizontal component alone', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  // Vertical-dominant, but horizontal movement still counts: the two axes are
  // independent, not exclusive. The vertical component is the browser's to
  // scroll natively — nothing here touches it.
  drag(h, [0, 0], [40, 200]);
  release(h, [40, 200]);
  const expected = -(40 - 8) * ((180 * DEG) / WIDTH);
  assert.ok(Math.abs(driver.yaw - expected) < 1e-9);
});

test('hand wobble during a vertical drag does not spin the world', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  drag(h, [0, 0], [5, 300]); // 5px of sideways slop over a long vertical drag
  release(h, [5, 300]);
  assert.equal(driver.update(0.016), 0);
});

test('touch keeps turning while the browser scrolls the same gesture', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  // Touch events keep arriving throughout a native scroll (pointer events do
  // not), which is why fingers are read from them.
  drag(h, [0, 400], [120, 100], { device: touch });
  release(h, [120, 100], touch);
  const expected = -(120 - 8) * ((180 * DEG) / WIDTH);
  assert.ok(Math.abs(driver.yaw - expected) < 1e-9);
});

test('a gesture the browser has committed to scrolling still turns the view', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});

  // Phase 1: the finger moves straight down. The browser takes the gesture for
  // native scrolling and fires pointercancel — pointer events stop here.
  h.element.emit('touchstart', touch(200, 100));
  for (let i = 1; i <= 6; i++) {
    clock += 16;
    h.win.emit('touchmove', touch(200, 100 + i * 40));
  }
  h.win.emit('pointercancel', { ...mouse(200, 340), pointerType: 'touch' });
  assert.equal(driver.update(0.016), 0, 'straight down turns nothing');

  // Phase 2: the same finger, still down, now moves sideways while that scroll
  // runs on. touchmove keeps arriving, so the horizontal axis stays live.
  for (let i = 1; i <= 5; i++) {
    clock += 16;
    h.win.emit('touchmove', touch(200 + i * 30, 340 + i * 10));
  }
  const expected = -(150 - 8) * ((180 * DEG) / WIDTH);
  assert.ok(Math.abs(driver.yaw - expected) < 1e-9, 'sideways travel mid-scroll turns the view');
});

test('a new gesture always takes over, even if the last one never ended', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});

  // A gesture whose touchend never arrives (dropped event, engine-specific
  // cancellation) must not swallow horizontal input for good.
  h.element.emit('touchstart', touch(0, 100));
  clock += 16;
  h.win.emit('touchmove', touch(60, 100));
  const stranded = driver.yaw;
  assert.ok(stranded !== 0);

  h.element.emit('touchstart', touch(0, 100)); // fresh contact, no touchend first
  for (let i = 1; i <= 4; i++) {
    clock += 16;
    h.win.emit('touchmove', touch(i * 25, 100));
  }
  assert.ok(driver.yaw < stranded, 'the new gesture turns the view');
});

test('touch drags that the browser cancels stop without a throw', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  drag(h, [0, 400], [200, 400], { device: touch, steps: 6, ms: 8 }); // a fast flick
  const atCancel = driver.yaw;
  h.win.emit('touchcancel', touch(200, 400));
  assert.equal(driver.update(0.016), atCancel);
});

test('a flick coasts and decays to a stop', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  drag(h, [0, 100], [180, 100], { steps: 6, ms: 8 }); // fast throw right
  const atRelease = driver.update(0);
  release(h, [180, 100]);

  const afterOneFrame = driver.update(0.016);
  assert.ok(afterOneFrame < atRelease, 'the coast continues in the drag direction');

  let last = afterOneFrame;
  for (let i = 0; i < 200; i++) {
    const next = driver.update(0.016);
    assert.ok(next <= last + 1e-12, 'the coast never reverses');
    last = next;
  }
  assert.equal(driver.update(0.016), last, 'and it settles');
  assert.ok(last < afterOneFrame, 'having travelled further than the release point');
});

test('holding still before release stops instead of throwing', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  drag(h, [0, 100], [180, 100], { steps: 6, ms: 8 });
  clock += 250; // the finger rests for a moment
  release(h, [180, 100]);

  const settled = driver.update(0.016);
  assert.equal(driver.update(0.016), settled);
});

test('arrow keys turn the view while held, in the same sense as a swipe', () => {
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  const key = (k) => ({ key: k, target: { tagName: 'CANVAS' }, preventDefault() {} });

  h.win.emit('keydown', key('ArrowRight'));
  driver.update(0.5);
  const right = driver.yaw;
  assert.ok(right < 0, 'ArrowRight turns the world right, like dragging right');

  h.win.emit('keyup', key('ArrowRight'));
  assert.equal(driver.update(0.5), right, 'and stops dead on release — no coast');

  h.win.emit('keydown', key('ArrowLeft'));
  driver.update(0.5);
  assert.ok(Math.abs(driver.yaw) < 1e-9, 'the same hold the other way returns to 0');
});

test('typing in a field is not a rotation', () => {
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  h.win.emit('keydown', { key: 'ArrowRight', target: { tagName: 'INPUT' }, preventDefault() {} });
  assert.equal(driver.update(0.5), 0);
});

test('a diagonal wheel gesture rotates without cancelling its own scrolling', () => {
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  let prevented = 0;
  const wheel = (deltaX, deltaY) => ({
    deltaX,
    deltaY,
    deltaMode: 0,
    preventDefault: () => prevented++,
  });

  h.element.emit('wheel', wheel(0, 120)); // a plain vertical scroll
  assert.equal(driver.update(0.016), 0);

  h.element.emit('wheel', wheel(1, 120)); // vertical scroll with trackpad jitter
  assert.equal(driver.update(0.016), 0, 'jitter below the deadband is ignored');

  h.element.emit('wheel', wheel(WIDTH / 2 + 1, 120)); // a genuinely diagonal swipe
  assert.equal(Math.round(deg(driver.update(0.016))), 90);
  assert.equal(prevented, 0, 'wheel events are never cancelled — the page keeps scrolling');
});

test('rotation is unbounded and persists across frames', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { degreesPerWidth: 360 });
  for (let i = 0; i < 3; i++) {
    drag(h, [0, 100], [-WIDTH, 100]);
    clock += 250; // settle, so no flick is thrown
    release(h, [-WIDTH, 100]);
    driver.update(0.016);
  }
  assert.ok(deg(driver.yaw) > 2 * 360, 'three full-width drags pass two full turns');

  const held = driver.yaw;
  for (let i = 0; i < 60; i++) driver.update(0.016); // idle frames
  assert.equal(driver.yaw, held, 'and the angle stays put until swiped again');
});

// --- snapping: continuous under the finger, discrete at rest ---

const QUARTERS = [0, 90, 180, 270];
const IRREGULAR = [0, 40, 180, 300]; // gaps of 40, 140, 120 and 60 degrees

test('a release settles onto the nearest configured step', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { steps: QUARTERS });

  turnAndRest(h, 108); // 100px past the deadband at 0.5°/px = −50°
  assert.equal(Math.round(deg(driver.yaw)), -50, 'the drag itself tracks the finger 1:1');
  assert.equal(Math.round(settle(driver)), -90, 'and −50° is nearer −90° than 0°');
});

test('a gentle release falls back to the step it came from', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { steps: QUARTERS });

  turnAndRest(h, 48); // −20°: not yet halfway to the next step
  assert.equal(Math.round(settle(driver)), 0);
});

test('a flick carries past intervening steps in proportion to its throw', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { steps: QUARTERS });

  drag(h, [0, 100], [180, 100], { steps: 6, ms: 8 }); // a hard throw right
  const atRelease = deg(driver.yaw);
  release(h, [180, 100]);

  const rest = settle(driver);
  assert.equal(Math.round(atRelease), -86, 'the finger itself only reached −86°');
  assert.equal(Math.round(rest), -270, 'the coast carries on past −90° and −180°');
});

test('settling never unwinds accumulated turns', () => {
  clock = 0;
  const h = harness();
  // One step, at the front — so the only question is *which* front.
  const driver = createSwipeDriver(h.element, { degreesPerWidth: 360, steps: [0] });

  for (let i = 0; i < 2; i++) {
    drag(h, [0, 100], [-WIDTH, 100]); // a full width left = +352°
    clock += 250;
    release(h, [-WIDTH, 100]);
  }
  assert.equal(Math.round(deg(driver.yaw)), 704, 'nearly two full turns in');
  assert.equal(Math.round(settle(driver)), 720, 'two turns on, not back to zero');
});

test('steps need not be evenly spaced', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { steps: IRREGULAR });

  // −35° sits between the 0° step and the 300° one. With even quarters it
  // would fall back to 0°; here the 300° step is only 60° below the front,
  // so it is the nearer of the two and wins.
  turnAndRest(h, 78);
  assert.equal(Math.round(deg(driver.yaw)), -35);
  assert.equal(Math.round(settle(driver)), -60, '300° reached the short way round');
});

test('a vertical scroll gesture never drags the view onto a step', () => {
  clock = 0;
  const h = harness();
  // Deliberately no step at 0: if a gesture that never turned the view could
  // trigger a settle, this would visibly swing to 45° on the first scroll.
  const driver = createSwipeDriver(h.element, { steps: [45, 135] });

  drag(h, [200, 0], [203, 400], { device: touch }); // straight down, hand wobble only
  release(h, [203, 400], touch);
  assert.equal(settle(driver), 0, 'the view is left exactly where the author framed it');
});

test('a cancelled gesture still comes to rest on a step, without a throw', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { steps: QUARTERS });

  drag(h, [0, 100], [180, 100], { device: touch, steps: 6, ms: 8 }); // a fast flick
  h.win.emit('touchcancel', touch(180, 100));
  // −86°, so the nearest step is −90°: reached, but not thrown past it the way
  // the same gesture would have been on a real release.
  assert.equal(Math.round(settle(driver)), -90);
});

test('arrow keys move one step at a time, along irregular intervals', () => {
  const h = harness();
  const driver = createSwipeDriver(h.element, { steps: IRREGULAR });
  const key = (k) => ({ key: k, target: { tagName: 'CANVAS' }, preventDefault() {} });

  h.win.emit('keydown', key('ArrowLeft'));
  assert.equal(Math.round(settle(driver)), 40);
  h.win.emit('keydown', key('ArrowLeft'));
  assert.equal(Math.round(settle(driver)), 180, 'the next gap is 140°, not another 40°');

  // Auto-repeat walks on without waiting for each settle to finish.
  h.win.emit('keydown', key('ArrowRight'));
  h.win.emit('keydown', key('ArrowRight'));
  assert.equal(Math.round(settle(driver)), 0, 'two steps back the way it came');
});

test('a trackpad gesture settles onto a step once it stops', () => {
  const h = harness();
  const driver = createSwipeDriver(h.element, { steps: QUARTERS });
  const wheel = (deltaX) => ({ deltaX, deltaY: 120, deltaMode: 0, preventDefault() {} });

  // Three events of one gesture, each a frame apart: nothing settles mid-stream.
  for (let i = 0; i < 3; i++) {
    h.element.emit('wheel', wheel(35));
    driver.update(1 / 60);
  }
  assert.equal(Math.round(deg(driver.yaw)), 51, 'the view tracks the gesture as it arrives');

  assert.equal(Math.round(settle(driver)), 90, 'and settles once the stream goes quiet');
});

test('with no steps configured the view rests wherever it is left', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {}); // free rotation

  turnAndRest(h, 108);
  assert.equal(Math.round(settle(driver)), -50, 'no step to be pulled towards');
});

test('dispose removes every listener and restores the document', () => {
  const h = harness();
  h.root.style.overscrollBehaviorX = 'auto';
  const driver = createSwipeDriver(h.element, {});
  assert.equal(h.root.style.overscrollBehaviorX, 'none');
  assert.ok(h.element.listenerCount() + h.win.listenerCount() > 0);

  driver.dispose();
  assert.equal(h.element.listenerCount() + h.win.listenerCount(), 0);
  assert.equal(h.root.style.overscrollBehaviorX, 'auto');
});
