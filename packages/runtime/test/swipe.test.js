import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwipeDriver } from '../src/swipe.js';

const WIDTH = 360; // viewport width used by the harness
const DEG = Math.PI / 180;
const deg = (rad) => (rad * 180) / Math.PI;

/**
 * Minimal event-target harness: enough DOM for the driver (a canvas host and
 * its window) to run in Node, so the gesture rules — axis locking, the drag
 * mapping, the flick coast, key rotation — are testable without a browser.
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
  const element = { ...make(), clientWidth: WIDTH, ownerDocument: { defaultView: win } };
  return { element, win };
}

let clock = 0;
const pointer = (x, y, extra = {}) => ({
  pointerId: 1,
  pointerType: 'touch',
  clientX: x,
  clientY: y,
  timeStamp: clock,
  preventDefault() {},
  ...extra,
});

/** Drag from (x0,y0) to (x1,y1) in `steps`, `ms` apart. Returns the driver. */
function drag(h, driver, [x0, y0], [x1, y1], { steps = 8, ms = 16 } = {}) {
  h.element.emit('pointerdown', pointer(x0, y0));
  for (let i = 1; i <= steps; i++) {
    clock += ms;
    h.win.emit('pointermove', pointer(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps));
  }
  return driver;
}

test('a horizontal drag turns the world 1:1 with the finger', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {}); // default 180°/width

  // Cross the dead zone, then drag half a viewport width to the right.
  h.element.emit('pointerdown', pointer(0, 100));
  clock += 16;
  h.win.emit('pointermove', pointer(8, 100)); // exactly the dead zone: locks, no rotation
  assert.equal(driver.update(0), 0);
  clock += 16;
  h.win.emit('pointermove', pointer(8 + WIDTH / 2, 100));

  // Half a width at 180°/width = 90°, negative: dragging right pushes the
  // world right, which walks the camera left around the pivot.
  assert.equal(Math.round(deg(driver.update(0.016))), -90);
});

test('degreesPerWidth scales the gesture', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { degreesPerWidth: 90 });
  drag(h, driver, [0, 100], [-WIDTH, 100]); // a full width to the left
  // 8px of dead zone is not charged, so expect just under a full 90° turn.
  assert.ok(Math.abs(deg(driver.update(0.016)) - 90 * (1 - 8 / WIDTH)) < 0.5);
});

test('a mostly-vertical drag is left to the page and never rotates', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  drag(h, driver, [0, 0], [40, 200]); // diagonal, dominated by Y
  assert.equal(driver.update(0.016), 0);
});

test('a flick coasts and decays to a stop', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  drag(h, driver, [0, 100], [180, 100], { steps: 6, ms: 8 }); // fast throw right
  const atRelease = driver.update(0);
  h.win.emit('pointerup', pointer(180, 100));

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
  drag(h, driver, [0, 100], [180, 100], { steps: 6, ms: 8 });
  clock += 250; // the finger rests for a moment
  h.win.emit('pointerup', pointer(180, 100));

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

test('horizontal wheel rotates; vertical wheel is left to native scroll', () => {
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
  assert.equal(prevented, 0, 'vertical wheel events are not consumed');

  h.element.emit('wheel', wheel(WIDTH / 2, 0));
  assert.equal(Math.round(deg(driver.update(0.016))), 90);
  assert.equal(prevented, 1);
});

test('rotation is unbounded and persists across frames', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, { degreesPerWidth: 360 });
  for (let i = 0; i < 3; i++) {
    drag(h, driver, [0, 100], [-WIDTH, 100]);
    h.win.emit('pointerup', pointer(-WIDTH, 100, { timeStamp: (clock += 250) }));
    driver.update(0.016);
  }
  assert.ok(deg(driver.yaw) > 2 * 360, 'three full-width drags pass two full turns');

  const held = driver.yaw;
  for (let i = 0; i < 60; i++) driver.update(0.016); // idle frames
  assert.equal(driver.yaw, held, 'and the angle stays put until swiped again');
});

test('dispose removes every listener', () => {
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  assert.ok(h.element.listenerCount() + h.win.listenerCount() > 0);
  driver.dispose();
  assert.equal(h.element.listenerCount() + h.win.listenerCount(), 0);
});

test('the driver never touches vertical position', () => {
  clock = 0;
  const h = harness();
  const driver = createSwipeDriver(h.element, {});
  drag(h, driver, [0, 100], [200, 260]); // horizontal-dominant but diagonal
  h.win.emit('pointerup', pointer(200, 260));
  // Only the horizontal component is read: 8px dead zone, then 192px of travel.
  const expected = -(200 - 8) * ((180 * DEG) / WIDTH);
  assert.ok(Math.abs(driver.yaw - expected) < 1e-9);
});
