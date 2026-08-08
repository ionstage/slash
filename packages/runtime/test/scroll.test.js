import test from 'node:test';
import assert from 'node:assert/strict';
import { createScrollDriver } from '../src/scroll.js';

const VH = 800; // viewport height used by the harness
const TOTAL = 12; // story length, units

/**
 * Minimal DOM harness for the native scroll driver. The driver's whole job is
 * to hand this axis to the browser and read the result back, so what there is
 * to test is the handover: the document is made scrollable, a spacer of the
 * right height is installed and maintained, story position is the scroll offset
 * in viewport-heights, and everything is put back on dispose.
 *
 * There is deliberately no input in here. Momentum, clamping at the ends,
 * keyboard paging and stopping a coast on contact are the browser's again —
 * the harness asserts the driver does not so much as register a listener.
 */
function harness({ total = TOTAL, innerHeight = VH, canvasCount = 0, attach = true } = {}) {
  const trackedStyle = () => ({
    overflow: '',
    height: '',
    touchAction: '',
    cssText: '',
  });

  const scroller = { scrollTop: 0 };
  const win = {
    innerHeight,
    addEventListener: refuse,
    removeEventListener: refuse,
    scrollTo(_x, y) {
      scroller.scrollTop = y;
    },
  };
  const html = { style: trackedStyle() };
  const body = {
    style: trackedStyle(),
    children: [],
    appendChild(el) {
      this.children.push(el);
    },
  };
  const canvases = Array.from({ length: canvasCount }, () => ({ style: trackedStyle() }));

  function refuse() {
    throw new Error('the native scroll driver must not listen for input');
  }

  const doc = {
    defaultView: win,
    documentElement: html,
    body,
    scrollingElement: scroller,
    createElement() {
      return {
        dataset: {},
        style: {
          cssText: '',
          _height: '',
          writes: 0,
          get height() {
            return this._height;
          },
          set height(v) {
            this._height = v;
            this.writes++;
          },
        },
        remove() {
          body.children = body.children.filter((c) => c !== this);
        },
      };
    },
  };

  const element = {
    style: trackedStyle(),
    clientHeight: innerHeight,
    ownerDocument: doc,
    addEventListener: refuse,
    removeEventListener: refuse,
    querySelectorAll: () => canvases,
  };

  const h = { element, win, html, body, scroller, canvases, total };
  h.attach = () => (h.driver = createScrollDriver(element, { getTotalUnits: () => h.total }));
  h.spacer = () => body.children.at(-1);
  h.spacerHeight = () => parseFloat(h.spacer().style.height);
  if (attach) h.attach();
  return h;
}

test('story position is the scroll offset in viewport heights', () => {
  const h = harness();
  assert.equal(h.driver.update(1 / 60), 0);

  h.scroller.scrollTop = VH * 3.5;
  assert.equal(h.driver.update(1 / 60), 3.5);
  assert.equal(h.driver.position, 3.5);
});

test('the document is handed to the browser to scroll', () => {
  const h = harness({ canvasCount: 2 });
  assert.equal(h.html.style.overflow, 'visible');
  assert.equal(h.body.style.overflow, 'visible');
  assert.equal(h.body.style.height, 'auto');
  // pan-y gives the browser the vertical axis while leaving `touchmove`
  // flowing, which is what keeps swipe.js's horizontal axis live.
  assert.equal(h.element.style.touchAction, 'pan-y');
  for (const c of h.canvases) assert.equal(c.style.touchAction, 'pan-y');
});

test('a spacer gives the document exactly the story’s scroll height', () => {
  const h = harness();
  // (total + 1) viewport-heights: the extra one is eaten by the viewport, so
  // the largest reachable scroll offset is exactly `total` units.
  assert.equal(h.spacerHeight(), (TOTAL + 1) * VH);

  h.scroller.scrollTop = h.spacerHeight() - VH; // scrolled to the bottom
  assert.equal(h.driver.update(1 / 60), TOTAL, 'the bottom of the document is the end');
});

test('the spacer follows a story that grows or shrinks', () => {
  const h = harness();
  h.total = 20;
  h.driver.update(1 / 60);
  assert.equal(h.spacerHeight(), 21 * VH);

  h.total = 3;
  h.driver.update(1 / 60);
  assert.equal(h.spacerHeight(), 4 * VH);
});

test('the spacer is only rewritten when its height actually changes', () => {
  const h = harness();
  const before = h.spacer().style.writes;
  for (let i = 0; i < 100; i++) h.driver.update(1 / 60);
  assert.equal(h.spacer().style.writes, before, 'a per-frame call is not a per-frame write');

  h.total = 15;
  h.driver.update(1 / 60);
  assert.equal(h.spacer().style.writes, before + 1);
});

test('a viewport resize keeps the end of the story at the bottom', () => {
  const h = harness();
  // Mobile toolbars collapse mid-scroll, so the viewport height genuinely
  // changes under a live gesture and the spacer has to be rescaled with it.
  h.win.innerHeight = 500;
  h.driver.update(1 / 60);
  assert.equal(h.spacerHeight(), (TOTAL + 1) * 500);

  h.scroller.scrollTop = h.spacerHeight() - 500;
  assert.equal(h.driver.update(1 / 60), TOTAL);
});

test('viewport height falls back to the host element when the window has none', () => {
  const h = harness({ innerHeight: 0 });
  h.element.clientHeight = 640;
  h.driver.update(1 / 60);
  assert.equal(h.spacerHeight(), (TOTAL + 1) * 640);
});

test('jumpTo scrolls the document', () => {
  const h = harness();
  h.driver.jumpTo(5);
  assert.equal(h.scroller.scrollTop, 5 * VH);
  assert.equal(h.driver.position, 5);
});

test('dispose removes the spacer and restores the document', () => {
  const h = harness({ canvasCount: 1, attach: false });
  // The state the page CSS left behind, which the driver has to hand back.
  h.html.style.overflow = 'hidden';
  h.body.style.overflow = 'hidden';
  h.body.style.height = '100%';
  h.element.style.touchAction = 'none';
  h.canvases[0].style.touchAction = 'none';

  h.attach();
  assert.equal(h.body.children.length, 1, 'the spacer is installed');
  assert.equal(h.html.style.overflow, 'visible');

  h.driver.dispose();
  assert.equal(h.body.children.length, 0, 'and taken away again');
  assert.equal(h.html.style.overflow, 'hidden');
  assert.equal(h.body.style.overflow, 'hidden');
  assert.equal(h.body.style.height, '100%');
  assert.equal(h.element.style.touchAction, 'none');
  assert.equal(h.canvases[0].style.touchAction, 'none');
});
