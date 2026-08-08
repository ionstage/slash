/**
 * Horizontal swipe input driver — turntable rotation.
 *
 * The second input axis, alongside native vertical scroll (`scroll.js`). A
 * horizontal drag turns the world: the driver accumulates a single scalar
 * `yaw` (radians), which `world-map.js` turns into a camera orbit around the
 * look-at point at unchanged height. This module owns *only* the gesture and
 * its feel; it knows nothing about the world.
 *
 * The two axes never mix:
 *
 *   - The canvas host is `touch-action: pan-y` (set by `scroll.js`), so the
 *     browser keeps vertical touch panning for itself — a vertical drag scrolls
 *     natively and never reaches us (it arrives as `pointercancel`).
 *   - A gesture only becomes a rotation once it has travelled `AXIS_LOCK_PX`
 *     and is more horizontal than vertical; a mostly-vertical drag is released
 *     back to the page.
 *   - Wheel events are consumed only when `|deltaX| > |deltaY|`, so vertical
 *     wheel/trackpad scrolling stays entirely native.
 *   - Nothing here writes scroll position, and `yaw` cannot move anything
 *     vertically (see `orbit` in `world-map.js`).
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
  const AXIS_LOCK_PX = 8; // travel before a drag is judged horizontal
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
  let pointerId = null;
  let rotating = false; // true once the gesture is judged horizontal
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0; // px/s, smoothed over recent moves
  /** @type {Set<string>} */
  const keys = new Set();

  function onPointerDown(ev) {
    if (pointerId !== null) return; // one gesture at a time (ignore extra fingers)
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    pointerId = ev.pointerId;
    rotating = false;
    startX = lastX = ev.clientX;
    startY = ev.clientY;
    lastT = ev.timeStamp;
    velocity = 0;
  }

  function onPointerMove(ev) {
    if (ev.pointerId !== pointerId) return;

    if (!rotating) {
      const totalX = ev.clientX - startX;
      const totalY = ev.clientY - startY;
      if (Math.abs(totalX) < AXIS_LOCK_PX) return; // still inside the dead zone
      if (Math.abs(totalX) <= Math.abs(totalY)) {
        pointerId = null; // a vertical drag: it belongs to the page
        return;
      }
      // Lock in and rotate from the point where the threshold was crossed, not
      // from this event — so exactly AXIS_LOCK_PX is ever spent deciding,
      // however coarse the browser's move events are.
      rotating = true;
      omega = 0; // grabbing stops the coast
      lastX = startX + Math.sign(totalX) * AXIS_LOCK_PX;
    }

    const dx = ev.clientX - lastX;
    const dt = Math.max((ev.timeStamp - lastT) / 1000, 1e-4);
    // Drag right pushes the world right, which walks the camera left (negative
    // yaw) — the pivot is between them. See `orbit` in world-map.js.
    yaw -= dx * radiansPerPixel();
    velocity = velocity * 0.6 + (dx / dt) * 0.4;
    lastX = ev.clientX;
    lastT = ev.timeStamp;
    ev.preventDefault(); // suppress mouse text-selection during the drag
  }

  function onPointerUp(ev) {
    if (ev.pointerId !== pointerId) return;
    if (rotating) {
      // A finger held still before release means "stop here", not "throw".
      const stale = ev.timeStamp - lastT > STALE_MS;
      const flick = stale ? 0 : -velocity * radiansPerPixel();
      omega = Math.max(-COAST_MAX, Math.min(COAST_MAX, flick));
    }
    pointerId = null;
    rotating = false;
  }

  function onPointerCancel(ev) {
    if (ev.pointerId !== pointerId) return;
    pointerId = null; // the browser took the gesture (native vertical scroll)
    rotating = false;
  }

  function onWheel(ev) {
    if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return; // vertical: leave it native
    ev.preventDefault();
    const px = ev.deltaMode === 1 ? ev.deltaX * LINE_PX : ev.deltaX;
    // Wheel deltas are the negation of finger travel, so this matches the drag.
    // Trackpads emit their own momentum tail; no extra coast.
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

  element.addEventListener('pointerdown', onPointerDown);
  win.addEventListener('pointermove', onPointerMove, { passive: false });
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('wheel', onWheel, { passive: false });
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
      } else if (!rotating && omega !== 0) {
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
