import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwipeDriver } from '../src/swipe.js';

const WIDTH = 360; // viewport width used by the harness
const DEG = Math.PI / 180;
const deg = (rad) => (rad * 180) / Math.PI;

/**
 * Minimal event-target harness: enough DOM for the driver (a canvas host and
 * its window) to run in Node, so the gesture rules — the wobble deadband, the
 * drag mapping, the flick coast, key rotation — are testable without a browser.
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
