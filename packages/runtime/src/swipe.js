/**
 * Horizontal swipe input driver — a detented turntable.
 *
 * The second input axis, alongside the vertical scroll axis (`scroll.js`, which
 * is the browser's native scrolling). A horizontal drag turns the world: the
 * driver accumulates a single scalar `yaw` (radians), which `world-map.js`
 * turns into a camera orbit around the look-at point at unchanged height. This
 * module owns *only* the gesture and its feel; it knows nothing about the world.
 *
 * **The axes are independent, not exclusive.** One gesture can do both: a
 * diagonal swipe scrolls by its vertical component and turns by its horizontal
 * one, at the same time. Only the decomposition is separate — the horizontal
 * component never moves the world vertically (`yaw` reaches nothing but the
 * camera orbit) and the vertical component is never read here at all.
 *
 * **A horizontal drag turns the view even while the page is scrolling.** The
 * canvas host is `touch-action: pan-y`, so the browser takes the vertical axis
 * and keeps dispatching `touchmove` for the horizontal one. Fingers are
 * therefore read from touch events rather than pointer events: an engine that
 * commits a gesture to native scrolling fires `pointercancel`, but touch events
 * keep arriving regardless, so the horizontal axis cannot be taken away
 * mid-gesture. Mouse and pen stay on pointer events, which nothing claims.
 *
 * Gating is against noise only, never against the vertical axis:
 *
 *   - A drag ignores its first `WOBBLE_PX` of horizontal travel, so the hand
 *     wobble in a vertical scroll does not slowly spin the world. Exactly that
 *     much is ever ignored, whatever the browser's move-event granularity.
 *   - The wheel listener only reads `deltaX` and never cancels the event, so a
 *     diagonal trackpad gesture rotates while the browser scrolls with the
 *     same event.
 *
 * ## Snapping: the view rests on configured angles
 *
 * Rotation is *continuous under the finger* and *discrete at rest*. The drag
 * tracks 1:1 ("grab the world and spin it"), and when the gesture ends the view
 * settles onto the nearest configured step — the angles an author has composed
 * the stage to be seen from. Steps are **absolute angles**, and the intervals
 * between them may be **irregular**: an author can put a step on the front, one
 * just off to the left, and one round the back, without the gaps matching.
 *
 * Settling and coasting are the same motion, not two:
 *
 *     landing = yaw + omega * COAST_TAU     // where a free coast would stop
 *     target  = nearest configured step to `landing`
 *     yaw    += (target - yaw) * (1 - exp(-dt / COAST_TAU))
 *
 * An exponential ease toward a fixed target *is* exponential velocity decay, so
 * with `target` at the free landing point this is exactly the old free coast;
 * snapping only nudges where that same curve terminates. A flick therefore
 * carries past intervening steps in proportion to how hard it was thrown, and a
 * gentle release settles back to the step it is nearest — one mechanism, no
 * mode change. With no steps configured the landing point is used unsnapped and
 * rotation is free, exactly as before.
 *
 * The search runs modulo a full turn but returns an *absolute* angle, so
 * settling never unwinds accumulated turns: at 725° with a step at 0°, the view
 * lands on 720°, not 0°.
 *
 * Inputs: touch/pen/mouse drag, trackpad horizontal wheel, ← / → keys. When
 * steps are configured, an arrow key moves to the adjacent step (auto-repeat
 * walks along them); otherwise it turns at a constant rate while held.
 *
 * @param {HTMLElement} element Canvas host (the same element `scroll.js` gets).
 * @param {{ degreesPerWidth?: number, steps?: number[] }} [options]
 *   `degreesPerWidth`: degrees the world turns per full-viewport-width drag —
 *   the swipe-feel knob, as `travelPerUnit` is the scroll-feel knob.
 *   `steps`: absolute angles in degrees the view comes to rest on. Intervals
 *   need not be regular. Omitted or empty means free rotation.
 */
export function createSwipeDriver(element, { degreesPerWidth = 180, steps } = {}) {
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;

  const DEG = Math.PI / 180;
  const TURN = Math.PI * 2;
  const WOBBLE_PX = 8; // horizontal travel ignored at the start of a drag
  const WHEEL_NOISE_PX = 1; // per-event horizontal deadband for wheels
  const COAST_TAU = 0.22; // s, e-folding time of the coast/settle
  const COAST_MAX = 12; // rad/s cap on a flick
  const SETTLE_RAD = 0.0005; // ~0.03°: remaining travel below which it is done
  const STALE_MS = 90; // a pause before release kills the throw
  const KEY_RATE = 1.1; // rad/s while an arrow key is held (free rotation only)
  const WHEEL_IDLE_S = 0.12; // quiet time that ends a wheel gesture
  const LINE_PX = 16; // px per line for deltaMode 1 wheels
  const NUDGE = 1e-6; // strictly-beyond tolerance when walking to a neighbour

  // Configured rest angles, normalized into [0, 2π) and deduplicated. Order is
  // irrelevant to the search; sorting only makes tie-breaks deterministic.
  const rests = [...new Set((steps ?? []).map((d) => (((d % 360) + 360) % 360) * DEG))].sort(
    (a, b) => a - b,
  );
  const snapping = rests.length > 0;

  // A drag across the full viewport width turns the world by
  // `degreesPerWidth`, so the gesture feels the same on every screen size.
  const radiansPerPixel = () =>
    (degreesPerWidth * DEG) / (element.clientWidth || win.innerWidth || 1);

  let yaw = 0;
  let mode = 'idle'; // 'idle' | 'drag' | 'settle'
  let target = 0; // absolute angle the settle is easing toward
  /** @type {number | null} */
  let dragId = null; // pointerId / touch identifier of the live gesture
  let tracking = false; // past the wobble deadband
  let startX = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0; // px/s, smoothed over recent moves
  let wheelIdle = -1; // seconds since the last wheel event (<0 = no gesture)
  /** @type {Set<string>} */
  const keys = new Set();

  // --- resting angles ---

  /**
   * The configured step nearest `angle`, as an absolute angle. Candidates are
   * taken from the turn `angle` falls in and its two neighbours, which is
   * enough to cover every step within half a turn either way — so the result is
   * always within half a turn of `angle` and accumulated turns are preserved.
   * With nothing configured the angle is its own rest position (free rotation).
   */
  function snapTo(angle) {
    if (!snapping) return angle;
    const turn = Math.floor(angle / TURN) * TURN;
    let best = angle;
    let bestDistance = Infinity;
    for (const rest of rests) {
      for (let k = -1; k <= 1; k++) {
        const candidate = turn + k * TURN + rest;
        const distance = Math.abs(candidate - angle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    return best;
  }

  /**
   * The next configured step strictly beyond `from` in `direction` (+1/−1) —
   * how an arrow key walks along irregular steps one at a time.
   */
  function neighbourOf(from, direction) {
    if (!snapping) return from;
    const turn = Math.floor(from / TURN) * TURN;
    let best = from;
    let bestGap = Infinity;
    for (const rest of rests) {
      for (let k = -1; k <= 1; k++) {
        const candidate = turn + k * TURN + rest;
        const gap = (candidate - from) * direction;
        if (gap > NUDGE && gap < bestGap) {
          bestGap = gap;
          best = candidate;
        }
      }
    }
    return best;
  }

  /**
   * Hand the axis to the settle integrator, aimed at where a free coast would
   * have stopped — snapped to the nearest step if any are configured.
   */
  function settleAt(landing) {
    target = snapTo(landing);
    mode = 'settle';
    wheelIdle = -1;
  }

  // --- one gesture, whatever kind of pointing device produced it ---

  function beginDrag(id, x, t) {
    if (dragId !== null) return; // one gesture at a time (ignore extra fingers)
    dragId = id;
    tracking = false;
    startX = lastX = x;
    lastT = t;
    velocity = 0;
    // Contact alone does not stop a settle: a finger put down to scroll
    // vertically must not freeze the view part-way between steps. Only actual
    // horizontal travel takes the axis over (see `moveDrag`).
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
      mode = 'drag'; // grabbing takes over from a coast or settle
      wheelIdle = -1;
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
    // A gesture that never crossed the deadband was somebody else's — a
    // vertical scroll, most likely — so it must not drag the view to a step.
    if (tracking) {
      // A finger held still before release means "stop here", not "throw"; so
      // does a cancelled gesture. Either way the view still settles onto a
      // step, just from where it stands rather than from a projected coast.
      const stale = !throwable || t - lastT > STALE_MS;
      const flick = stale ? 0 : -velocity * radiansPerPixel();
      const omega = Math.max(-COAST_MAX, Math.min(COAST_MAX, flick));
      settleAt(yaw + omega * COAST_TAU);
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
    // The event is never cancelled — the browser scrolls with its deltaY while
    // this listener spends its deltaX.
    yaw += px * radiansPerPixel();
    // A wheel gesture has no release event, so its end is inferred from a pause
    // in the stream (trackpads emit their own momentum tail, which is spent
    // free-running before the view settles onto a step).
    mode = 'idle';
    wheelIdle = snapping ? 0 : -1;
  }

  function onKeyDown(ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const el = ev.target;
    if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '')) return;
    ev.preventDefault();
    if (snapping) {
      // One press, one step. Aim from wherever the axis is already headed, so
      // held auto-repeat walks step by step instead of restarting each time.
      const direction = ev.key === 'ArrowLeft' ? 1 : -1;
      settleAt(neighbourOf(mode === 'settle' ? target : yaw, direction));
    } else {
      keys.add(ev.key);
    }
  }

  function onKeyUp(ev) {
    keys.delete(ev.key);
  }

  function onBlur() {
    keys.clear();
  }

  // Horizontal overscroll would otherwise trigger the browser's back-navigation
  // gesture. This driver owns the X longhand; the scroll axis is the browser's
  // own and needs no counterpart, so nothing here strands another driver's
  // value on dispose.
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
     * Advance the settle / held keys and read the rotation. Call once per frame.
     * @param {number} dt Seconds since the last frame.
     * @returns {number} Current rotation in radians (unbounded, signed).
     */
    update(dt) {
      const held = (keys.has('ArrowLeft') ? 1 : 0) + (keys.has('ArrowRight') ? -1 : 0);
      if (held !== 0) {
        // Free rotation only: with steps configured, keys move step-wise from
        // keydown and never reach this path.
        yaw += held * KEY_RATE * dt;
        mode = 'idle';
        return yaw;
      }

      if (mode === 'drag') return yaw; // under the finger, nothing is integrated

      if (wheelIdle >= 0) {
        wheelIdle += dt;
        if (wheelIdle >= WHEEL_IDLE_S) settleAt(yaw);
      }

      if (mode === 'settle') {
        yaw += (target - yaw) * (1 - Math.exp(-dt / COAST_TAU));
        // An exponential ease is asymptotic, so it is cut off once the travel
        // left is imperceptible — which is also what lands the view *exactly*
        // on the step rather than forever approaching it.
        if (Math.abs(target - yaw) < SETTLE_RAD) {
          yaw = target;
          mode = 'idle';
        }
      }
      return yaw;
    },

    get yaw() {
      return yaw;
    },

    /** The angle being settled onto, or null when the view is at rest. */
    get target() {
      return mode === 'settle' ? target : null;
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
