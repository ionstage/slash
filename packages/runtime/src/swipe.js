/**
 * Horizontal swipe input driver — turntable rotation.
 *
 * The second input axis, alongside native vertical scroll (`scroll.js`). A
 * horizontal drag turns the world: the driver accumulates a single scalar
 * `yaw` (radians), which `world-map.js` turns into a camera orbit around the
 * look-at point at unchanged height. This module owns *only* the gesture and
 * its feel; it knows nothing about the world.
 *
 * **The axes are independent, not exclusive.** One gesture can do both: a
 * diagonal swipe scrolls by its vertical component and turns by its horizontal
 * one, at the same time. Only the decomposition is separate — the horizontal
 * component never moves the world vertically (`yaw` reaches nothing but the
 * camera orbit) and the vertical component never turns it.
 *
 * **A horizontal drag turns the view even while the page is scrolling** — a
 * scroll in progress never suspends the horizontal axis, whether it is running
 * under the finger or coasting on momentum. That requirement is why touch is
 * handled through touch events rather than pointer events: when the browser
 * claims a gesture for native scrolling it fires `pointercancel` and no further
 * pointer events arrive, but `touchmove` keeps being dispatched throughout the
 * scroll. So the finger's sideways travel is still ours while its vertical
 * travel is the browser's. Pointer events handle mouse and pen, which the
 * browser never claims.
 *
 * Nothing here writes scroll position, and the horizontal axis is gated only
 * against noise, never against the vertical one:
 *
 *   - A drag ignores its first `WOBBLE_PX` of horizontal travel, so the hand
 *     wobble in a vertical scroll does not slowly spin the world. Exactly that
 *     much is ever ignored, whatever the browser's move-event granularity.
 *   - Wheel events are never cancelled — cancelling one would take its vertical
 *     component with it — so horizontal trackpad travel rotates while the same
 *     gesture scrolls. `overscroll-behavior-x` (not `preventDefault`) keeps
 *     horizontal overscroll from triggering back-navigation.
 *
 * Feel: the drag is 1:1 with the finger ("grab the world and spin it") and a
 * flick coasts to a stop with exponential decay. Rotation is unbounded — a
 * free 360° turntable — and persists while scrolling until swiped again.
 *
 * Inputs: touch/pen/mouse drag, trackpad horizontal wheel, ← / → keys.
 *
 * @param {HTMLElement} element Canvas host (the same element `scroll.js` gets).
 * @param {{ degreesPerWidth?: number }} [options] `degreesPerWidth`: degrees
 *   the world turns per full-viewport-width drag — the swipe-feel knob, as
 *   `travelPerUnit` is the scroll-feel knob.
 */
export function createSwipeDriver(element, { degreesPerWidth = 180 } = {}) {
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;

  const DEG = Math.PI / 180;
  const WOBBLE_PX = 8; // horizontal travel ignored at the start of a drag
  const WHEEL_NOISE_PX = 1; // per-event horizontal deadband for wheels
  const COAST_TAU = 0.22; // s, e-folding time of the flick coast
  const COAST_MIN = 0.02; // rad/s below which the coast stops
  const COAST_MAX = 12; // rad/s cap on a flick
  const STALE_MS = 90; // a pause before release kills the throw
  const KEY_RATE = 1.1; // rad/s while an arrow key is held
  const LINE_PX = 16; // px per line for deltaMode 1 wheels

  // A drag across the full viewport width turns the world by
  // `degreesPerWidth`, so the gesture feels the same on every screen size.
  const radiansPerPixel = () =>
    (degreesPerWidth * DEG) / (element.clientWidth || win.innerWidth || 1);

  let yaw = 0;
  let omega = 0; // rad/s, the post-flick coast
  /** @type {number | null} */
  let dragId = null; // pointerId / touch identifier of the live gesture
  let tracking = false; // past the wobble deadband
  let startX = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0; // px/s, smoothed over recent moves
  /** @type {Set<string>} */
  const keys = new Set();

  // --- one gesture, whatever kind of pointing device produced it ---

  function beginDrag(id, x, t) {
    if (dragId !== null) return; // one gesture at a time (ignore extra fingers)
    dragId = id;
    tracking = false;
    startX = lastX = x;
    lastT = t;
    velocity = 0;
  }

  /** @returns {boolean} whether this move produced rotation. */
  function moveDrag(id, x, t) {
    if (id !== dragId) return false;

    if (!tracking) {
      const totalX = x - startX;
      if (Math.abs(totalX) < WOBBLE_PX) return false;
      // Start rotating from where the deadband was crossed, not from this
      // event, so exactly WOBBLE_PX is ever spent — however coarse the
      // browser's move events are.
      tracking = true;
      omega = 0; // grabbing stops the coast
      lastX = startX + Math.sign(totalX) * WOBBLE_PX;
    }

    const dx = x - lastX;
    const dt = Math.max((t - lastT) / 1000, 1e-4);
    // Drag right pushes the world right, which walks the camera left (negative
    // yaw) — the pivot is between them. See `orbit` in world-map.js.
    yaw -= dx * radiansPerPixel();
    velocity = velocity * 0.6 + (dx / dt) * 0.4;
    lastX = x;
    lastT = t;
    return true;
  }

  function endDrag(id, t, throwable = true) {
    if (id !== dragId) return;
    if (tracking && throwable) {
      // A finger held still before release means "stop here", not "throw".
      const stale = t - lastT > STALE_MS;
      const flick = stale ? 0 : -velocity * radiansPerPixel();
      omega = Math.max(-COAST_MAX, Math.min(COAST_MAX, flick));
    }
    dragId = null;
    tracking = false;
  }

  // --- touch: read sideways travel even while the browser scrolls ---

  function findTouch(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }

  function onTouchStart(ev) {
    // A fresh single-finger contact always takes over. Horizontal input must
    // never be swallowed by a gesture whose end we somehow missed (a dropped
    // touchend, an engine-specific cancellation) — that would silently kill
    // turning for the rest of the session.
    if (ev.touches.length === 1) dragId = null;
    const t = ev.changedTouches[0];
    if (t) beginDrag(t.identifier, t.clientX, ev.timeStamp);
  }

  function onTouchMove(ev) {
    const t = findTouch(ev.touches, dragId);
    if (t) moveDrag(t.identifier, t.clientX, ev.timeStamp);
  }

  function onTouchEnd(ev) {
    const t = findTouch(ev.changedTouches, dragId);
    if (t) endDrag(t.identifier, ev.timeStamp);
  }

  function onTouchCancel(ev) {
    const t = findTouch(ev.changedTouches, dragId);
    if (t) endDrag(t.identifier, ev.timeStamp, false);
  }

  // --- mouse / pen: pointer events, which the browser never takes away ---

  function onPointerDown(ev) {
    if (ev.pointerType === 'touch') return; // fingers come in as touch events
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    beginDrag(ev.pointerId, ev.clientX, ev.timeStamp);
  }

  function onPointerMove(ev) {
    if (ev.pointerType === 'touch') return;
    // Suppress text selection only once the drag is actually turning.
    if (moveDrag(ev.pointerId, ev.clientX, ev.timeStamp)) ev.preventDefault();
  }

  function onPointerUp(ev) {
    if (ev.pointerType === 'touch') return;
    endDrag(ev.pointerId, ev.timeStamp);
  }

  function onPointerCancel(ev) {
    if (ev.pointerType === 'touch') return;
    endDrag(ev.pointerId, ev.timeStamp, false);
  }

  function onWheel(ev) {
    // Soft deadband: a deliberate vertical scroll on a trackpad still emits a
    // pixel or two of horizontal jitter, which would otherwise drift the view.
    const raw = ev.deltaMode === 1 ? ev.deltaX * LINE_PX : ev.deltaX;
    const px = Math.sign(raw) * Math.max(0, Math.abs(raw) - WHEEL_NOISE_PX);
    if (px === 0) return;
    // Wheel deltas are the negation of finger travel, so this matches the drag.
    // Trackpads emit their own momentum tail; no extra coast. The event is left
    // uncancelled so its vertical component keeps scrolling the page.
    yaw += px * radiansPerPixel();
    omega = 0;
  }

  function onKeyDown(ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const el = ev.target;
    if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '')) return;
    ev.preventDefault();
    keys.add(ev.key);
  }

  function onKeyUp(ev) {
    keys.delete(ev.key);
  }

  function onBlur() {
    keys.clear();
  }

  // Horizontal overscroll would otherwise trigger the browser's back-navigation
  // gesture. Neutralised here rather than by cancelling wheel events, which
  // would cancel their vertical scrolling too.
  const root = doc.documentElement;
  const prevOverscrollX = root.style.overscrollBehaviorX;
  root.style.overscrollBehaviorX = 'none';

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  win.addEventListener('touchmove', onTouchMove, { passive: true });
  win.addEventListener('touchend', onTouchEnd, { passive: true });
  win.addEventListener('touchcancel', onTouchCancel, { passive: true });
  element.addEventListener('pointerdown', onPointerDown);
  win.addEventListener('pointermove', onPointerMove, { passive: false });
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('wheel', onWheel, { passive: true });
  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', onBlur);

  return {
    /**
     * Advance the coast / held keys and read the rotation. Call once per frame.
     * @param {number} dt Seconds since the last frame.
     * @returns {number} Current rotation in radians (unbounded, signed).
     */
    update(dt) {
      const held = (keys.has('ArrowLeft') ? 1 : 0) + (keys.has('ArrowRight') ? -1 : 0);
      if (held !== 0) {
        yaw += held * KEY_RATE * dt;
        omega = 0;
      } else if (!tracking && omega !== 0) {
        yaw += omega * dt;
        omega *= Math.exp(-dt / COAST_TAU);
        if (Math.abs(omega) < COAST_MIN) omega = 0;
      }
      return yaw;
    },

    get yaw() {
      return yaw;
    },

    dispose() {
      root.style.overscrollBehaviorX = prevOverscrollX;
      element.removeEventListener('touchstart', onTouchStart);
      win.removeEventListener('touchmove', onTouchMove);
      win.removeEventListener('touchend', onTouchEnd);
      win.removeEventListener('touchcancel', onTouchCancel);
      element.removeEventListener('pointerdown', onPointerDown);
      win.removeEventListener('pointermove', onPointerMove);
      win.removeEventListener('pointerup', onPointerUp);
      win.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('wheel', onWheel);
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
    },
  };
}
