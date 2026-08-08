import test from 'node:test';
import assert from 'node:assert/strict';
import { createScrollDriver } from '../src/scroll.js';
import { createSwipeDriver } from '../src/swipe.js';

const VH = 800; // viewport height used by the harness
const WIDTH = 360;
const TOTAL = 12; // story length, units

/**
 * Minimal event-target harness: enough DOM for the driver (a canvas host, its
 * document and window) to run in Node. Now that the runtime owns scrolling
 * outright, the whole feel — drag mapping, wheel smoothing, flick coast,
 * clamping, keys — is this module's own arithmetic, so all of it is testable
 * here rather than being the browser's to vary.
 */
function harness({ total = TOTAL, innerHeight = VH } = {}) {
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
  const style = () => ({
    overflow: '',
    height: '',
    touchAction: '',
    overscrollBehaviorX: '',
    overscrollBehaviorY: '',
  });
  const win = { ...make(), innerHeight };
  const html = { style: style() };
  const body = { style: style() };
  const element = {
    ...make(),
    clientWidth: WIDTH,
    clientHeight: innerHeight,
    style: style(),
    querySelectorAll: () => [],
    ownerDocument: {
      defaultView: win,
      documentElement: html,
      body,
      // A native-scroll driver appended a spacer here. This one must not.
      createElement() {
        throw new Error('the scroll driver must not create DOM');
      },
    },
  };
  const h = { element, win, html, body, total };
  h.driver = createScrollDriver(element, { getTotalUnits: () => h.total });
  return h;
}

let clock = 0;
const touch = (x, y) => {
  const list = [{ identifier: 7, clientX: x, clientY: y }];
  return { touches: list, changedTouches: list, timeStamp: clock };
};
const wheel = (deltaY, extra = {}) => ({
  deltaX: 0,
  deltaY,
  deltaMode: 0,
  cancelable: true,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  ...extra,
});
const key = (k, extra = {}) => ({ key: k, target: {}, preventDefault() {}, ...extra });

/** Run `seconds` of frames; returns the final position. */
function frames(h, seconds, dt = 1 / 60) {
  let p = h.driver.position;
  for (let i = 0; i < Math.round(seconds / dt); i++) p = h.driver.update(dt);
  return p;
}

/** Drag a finger from y0 to y1 in `steps` moves, `ms` apart. Does not release. */
function drag(h, [x0, y0], [x1, y1], { steps = 8, ms = 16 } = {}) {
  const at = (i) => [x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps];
  h.element.emit('touchstart', touch(x0, y0));
  for (let i = 1; i <= steps; i++) {
    clock += ms;
    h.win.emit('touchmove', touch(...at(i)));
  }
}

const release = (h, [x, y]) => h.win.emit('touchend', touch(x, y));

// --- the page is out of the browser's hands ---

test('the document is pinned: nothing native is left to scroll', () => {
  const h = harness();
  assert.equal(h.html.style.overflow, 'hidden');
  assert.equal(h.body.style.overflow, 'hidden');
  assert.equal(h.element.style.touchAction, 'none');
  // Vertical chaining/pull-to-refresh is ours; the X longhand is swipe.js's.
  assert.equal(h.html.style.overscrollBehaviorY, 'none');
  assert.equal(h.html.style.overscrollBehaviorX, '');
});

test('wheel events are cancelled, since their vertical component is ours to spend', () => {
  const h = harness();
  const ev = wheel(240);
  h.element.emit('wheel', ev);
  assert.equal(ev.defaultPrevented, true);
});

test('dispose restores the document and removes every listener', () => {
  const h = harness();
  h.driver.dispose();
  assert.equal(h.html.style.overflow, '');
  assert.equal(h.body.style.overflow, '');
  assert.equal(h.element.style.touchAction, '');
  assert.equal(h.html.style.overscrollBehaviorY, '');
  assert.equal(h.element.listenerCount(), 0);
  assert.equal(h.win.listenerCount(), 0);
});

// --- wheel ---

test('a wheel click scrolls by exactly its pixels, smoothed over a few frames', () => {
  const h = harness();
  h.element.emit('wheel', wheel(300));
  const first = h.driver.update(1 / 60);
  assert.ok(first > 0 && first < 300 / VH, `eased into it, got ${first}`);
  assert.ok(Math.abs(frames(h, 1) - 300 / VH) < 1e-6);
});

test('a second wheel click extends the first', () => {
  const h = harness();
  h.element.emit('wheel', wheel(300));
  frames(h, 0.05);
  h.element.emit('wheel', wheel(300));
  assert.ok(Math.abs(frames(h, 1) - 600 / VH) < 1e-6);
});

test('line and page wheel deltas are converted to pixels', () => {
  const lines = harness();
  lines.element.emit('wheel', wheel(3, { deltaMode: 1 }));
  assert.ok(Math.abs(frames(lines, 1) - (3 * 16) / VH) < 1e-6);

  const pages = harness();
  pages.element.emit('wheel', wheel(1, { deltaMode: 2 }));
  assert.ok(Math.abs(frames(pages, 1) - 1) < 1e-6);
});

test('a pinch-zoom wheel is left to the browser', () => {
  const h = harness();
  const ev = wheel(300, { ctrlKey: true });
  h.element.emit('wheel', ev);
  assert.equal(frames(h, 1), 0, 'it does not scroll the story');
  assert.equal(ev.defaultPrevented, false, 'and browser zoom still works');
});

// --- bounds ---

test('the position never leaves [0, total]', () => {
  const h = harness();
  h.element.emit('wheel', wheel(-1000)); // up, at the top
  assert.equal(frames(h, 1), 0);

  h.element.emit('wheel', wheel(1e6)); // far past the end
  assert.equal(frames(h, 3), TOTAL);
});

test('a flick into the end runs at full speed and stops there', () => {
  const h = harness();
  h.driver.jumpTo(TOTAL - 1);
  drag(h, [180, 600], [180, 200]); // a throw worth ~2.1 units, into a 1-unit gap
  release(h, [180, 200]);

  // Arrives under its own speed. Easing into a clamped target would instead
  // creep in asymptotically and still be short of the end seconds later.
  assert.equal(frames(h, 0.5), TOTAL);
});

test('an end stops the story without resisting it — reversing responds at once', () => {
  const h = harness();
  h.driver.jumpTo(TOTAL - 1);
  drag(h, [180, 600], [180, 200]); // overshoot the end hard
  release(h, [180, 200]);
  assert.equal(frames(h, 1), TOTAL);

  // No overshoot was banked, so the way back starts immediately and travels
  // exactly as far as it was asked to.
  h.element.emit('wheel', wheel(-160));
  assert.ok(Math.abs(frames(h, 1) - (TOTAL - 160 / VH)) < 1e-6);
});

test('the top behaves the same way', () => {
  const h = harness();
  h.driver.jumpTo(0.5);
  drag(h, [180, 200], [180, 600]); // throw backwards, past the start
  release(h, [180, 600]);
  assert.equal(frames(h, 0.5), 0);

  h.element.emit('wheel', wheel(160));
  assert.ok(Math.abs(frames(h, 1) - 160 / VH) < 1e-6);
});

test('a story that shrinks under the viewer pulls the position back', () => {
  const h = harness();
  h.driver.jumpTo(TOTAL);
  assert.equal(h.driver.position, TOTAL);
  h.total = 4;
  assert.equal(h.driver.update(1 / 60), 4);
});

test('the story position survives a viewport resize', () => {
  const h = harness();
  h.element.emit('wheel', wheel(400));
  const units = frames(h, 1);
  h.win.innerHeight = 500; // rotate the device
  assert.equal(h.driver.update(1 / 60), units); // units are viewport-relative
});

// --- drag ---

test('a drag tracks the finger 1:1, spending exactly the deadband', () => {
  const h = harness();
  drag(h, [180, 600], [180, 200]); // 400 px up
  assert.ok(Math.abs(h.driver.update(1 / 60) - (400 - 8) / VH) < 1e-9);
});

test('a drag shorter than the deadband does not move the story', () => {
  const h = harness();
  drag(h, [180, 600], [180, 594], { steps: 3 });
  assert.equal(h.driver.update(1 / 60), 0);
});

test('dragging down runs the story backwards', () => {
  const h = harness();
  h.driver.jumpTo(3);
  drag(h, [180, 200], [180, 600]); // 400 px down
  assert.ok(Math.abs(h.driver.update(1 / 60) - (3 - (400 - 8) / VH)) < 1e-9);
});

// --- momentum, which is now ours and not the browser's ---

test('a flick coasts on after the finger lifts, decelerating to a stop', () => {
  const h = harness();
  drag(h, [180, 600], [180, 200]);
  const atRelease = h.driver.update(1 / 60);
  release(h, [180, 200]);

  // Each successive slice of the coast covers less ground than the last —
  // the shape of a decay, not a constant drift.
  let from = atRelease;
  let previous = Infinity;
  for (let i = 0; i < 5; i++) {
    const to = frames(h, 0.2);
    const covered = to - from;
    assert.ok(covered > 0, 'still moving forward');
    assert.ok(covered < previous, 'and slowing down');
    from = to;
    previous = covered;
  }
  assert.ok(from > atRelease, 'the coast carried the story past the release');

  const settled = frames(h, 6); // an exponential ease is cut off, not asymptotic
  assert.equal(frames(h, 1), settled, 'and comes to a full stop');
});

test('a finger held still before release does not throw', () => {
  const h = harness();
  drag(h, [180, 600], [180, 200]);
  clock += 200; // hold, then lift
  release(h, [180, 200]);
  const stopped = h.driver.update(1 / 60);
  assert.ok(Math.abs(frames(h, 1) - stopped) < 1e-9);
});

test('touching the world stops its coast dead', () => {
  const h = harness();
  drag(h, [180, 600], [180, 200]);
  release(h, [180, 200]);
  const moving = frames(h, 0.1);

  h.element.emit('touchstart', touch(180, 400)); // land a finger mid-coast
  const onContact = h.driver.update(1 / 60);
  assert.ok(Math.abs(onContact - moving) < 1e-9, 'stopped where it was touched');
  assert.equal(frames(h, 1), onContact, 'and stays stopped');
});

test('a wheel click during a coast takes over instead of inheriting it', () => {
  const h = harness();
  drag(h, [180, 600], [180, 200]);
  release(h, [180, 200]);
  const moving = frames(h, 0.1);

  h.element.emit('wheel', wheel(160));
  assert.ok(Math.abs(frames(h, 2) - (moving + 160 / VH)) < 1e-6);
});

// --- keys ---

test('held arrow keys scroll, and stop when released', () => {
  const h = harness();
  h.win.emit('keydown', key('ArrowDown'));
  const down = frames(h, 0.5);
  assert.ok(down > 0.3 && down < 0.7, `~KEY_RATE * 0.5s, got ${down}`);

  h.win.emit('keyup', key('ArrowDown'));
  const rest = frames(h, 1);
  assert.equal(frames(h, 1), rest);

  h.win.emit('keydown', key('ArrowUp'));
  assert.ok(frames(h, 0.5) < rest, 'ArrowUp runs it back');
});

test('page keys jump by a near-screenful, Home and End go to the ends', () => {
  const h = harness();
  h.win.emit('keydown', key('PageDown'));
  assert.equal(frames(h, 3), 0.9);

  h.win.emit('keydown', key('End'));
  assert.equal(frames(h, 5), TOTAL);

  h.win.emit('keydown', key('Home'));
  assert.equal(frames(h, 5), 0);

  h.win.emit('keydown', key(' ', { shiftKey: true }));
  assert.equal(frames(h, 3), 0, 'shift+space at the top has nowhere to go');
});

test('keys typed into a form field are the field’s, not the story’s', () => {
  const h = harness();
  h.win.emit('keydown', key('PageDown', { target: { tagName: 'INPUT' } }));
  h.win.emit('keydown', key('ArrowDown', { target: { isContentEditable: true } }));
  assert.equal(frames(h, 1), 0);
});

test('losing focus releases held keys', () => {
  const h = harness();
  h.win.emit('keydown', key('ArrowDown'));
  frames(h, 0.2);
  h.win.emit('blur', {});
  const stopped = frames(h, 1);
  assert.equal(frames(h, 1), stopped);
});

// --- the two axes, on one gesture ---

test('one diagonal gesture scrolls and turns at the same time', () => {
  const h = harness();
  const swipe = createSwipeDriver(h.element, {});

  drag(h, [180, 600], [40, 300]); // down-left and up: both components
  const units = h.driver.update(1 / 60);
  const yaw = swipe.update(1 / 60);

  assert.ok(units > 0, 'the vertical component scrolled');
  assert.ok(yaw !== 0, 'the horizontal component turned');
  swipe.dispose();
});

test('neither axis moves on the other’s pure gesture', () => {
  const h = harness();
  const swipe = createSwipeDriver(h.element, {});

  drag(h, [180, 600], [180, 300]); // straight up
  assert.ok(h.driver.update(1 / 60) > 0);
  assert.equal(swipe.update(1 / 60), 0, 'a pure scroll never turns the view');
  release(h, [180, 300]);

  const before = frames(h, 3); // let the flick settle out
  drag(h, [180, 300], [40, 300]); // straight across
  assert.ok(swipe.update(1 / 60) !== 0);
  assert.ok(Math.abs(h.driver.update(1 / 60) - before) < 1e-9, 'a pure turn never scrolls');
  swipe.dispose();
});
