/**
 * Scroll input driver — the application owns scrolling outright.
 *
 * Nothing in the runtime scrolls natively. The document has no scroll range,
 * no scrollbar and no spacer; the browser is never asked to move anything and
 * never gets the chance to (`touch-action: none`, `overflow: hidden`). This
 * driver reads the raw inputs — touch, mouse/pen drag, wheel, keys — and
 * integrates them into the story position itself. Every job the browser used to
 * do (gesture-to-distance, momentum after a flick, clamping at the ends,
 * stopping a coast on contact) is implemented in this module, which is what
 * makes the feel ours to tune rather than the platform's to vary.
 *
 * Position is `units` — viewport heights — the currency of the Story Progress
 * system, and now a number this module owns rather than a reading taken off the
 * document. Two consequences worth knowing:
 *
 *   - Resizing the viewport preserves the story position exactly, because units
 *     are viewport-relative where a native `scrollTop` was absolute pixels.
 *   - Story length is dynamic (branching extends the path) and may shrink under
 *     the viewer; the position is simply re-clamped to `[0, getTotalUnits()]`.
 *
 * ## The integrator
 *
 * With no finger on the glass, one mechanism moves the position: it eases
 * toward a `target` with time constant `tau`.
 *
 *     position += (target - position) * (1 - exp(-dt / tau))
 *
 * Exponential easing toward a fixed target *is* exponential velocity decay, so
 * that single line does both of the jobs the browser used to: it smooths a
 * discrete wheel click (short tau) and it coasts a flick to rest (long tau,
 * with the target thrown `v * tau` ahead so the coast begins at exactly the
 * release velocity). `swipe.js` decays its rotation with the same shape, so
 * both axes settle alike and one gesture cannot feel like two systems.
 *
 * Impulses of the same kind accumulate — a second wheel click extends the
 * first. A different kind takes over: an impulse with a different `tau` rebases
 * the target onto the current position, so a wheel click during a flick coast
 * cancels the coast instead of inheriting its distant target.
 *
 * While a finger is down the position is not integrated at all — it tracks the
 * finger 1:1. That is also why a touch stops a coast dead: contact sets the
 * target to the current position, before the drag has moved a pixel. The rule
 * is `spec.md` ("touching the world stops its inertia"), and it used to be the
 * browser's to honour.
 *
 * ## One gesture, two axes
 *
 * This driver takes only the vertical component of a gesture; `swipe.js` reads
 * the same events and takes only the horizontal one. Neither consults the
 * other and neither can suspend the other, so a diagonal drag scrolls and turns
 * at once — decomposition rather than classification, structurally rather than
 * by agreement. Owning the scroll axis makes that stronger than it was under
 * native scrolling: the browser can no longer claim a gesture midway and change
 * which events arrive.
 *
 * @param {HTMLElement} element Canvas host (the same element `swipe.js` gets).
 * @param {{ getTotalUnits: () => number }} options
 */
export function createScrollDriver(element, { getTotalUnits }) {
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;

  const WOBBLE_PX = 8; // vertical travel ignored at the start of a drag
  const STALE_MS = 90; // a pause before release kills the throw
  // Kinds of impulse, and how long each takes to settle (seconds). The kind is
  // what decides accumulate-vs-take-over; the time constant is its feel.
  // (`drag` is absent on purpose: under the finger nothing is integrated.)
  const TAU = {
    wheel: 0.12, // a wheel click, smoothed
    page: 0.3, // a page/home/end jump, glided
    key: 0.14, // trailing a held arrow key
    flick: 0.55, // the coast after a throw
  };
  const FLICK_MAX = 8; // units/s cap on a flick
  const KEY_RATE = 1.2; // units/s while an arrow key is held
  const PAGE_UNITS = 0.9; // units per PageUp/PageDown/space
  const SETTLE_PX = 0.5; // remaining travel below which an ease is finished
  const LINE_PX = 16; // px per line for deltaMode 1 wheels

  const viewportHeight = () => win.innerHeight || element.clientHeight || 1;
  const totalUnits = () => Math.max(getTotalUnits(), 0);
  const clampUnits = (u) => Math.min(Math.max(u, 0), totalUnits());

  let position = 0;
  let target = 0;
  let mode = 'wheel'; // which kind of impulse owns the current ease
  /** @type {number | null} */
  let dragId = null; // pointerId / touch identifier of the live gesture
  let tracking = false; // past the wobble deadband
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0; // px/s, smoothed over recent moves
  /** @type {Set<string>} */
  const keys = new Set();

  /**
   * Feed the integrator. An impulse of the kind already running accumulates
   * onto its target; a new kind rebases onto the current position and takes
   * over, so a wheel click during a coast cancels the coast rather than
   * inheriting its distant target.
   */
  function impulse(deltaUnits, kind) {
    if (kind !== mode) {
      mode = kind;
      target = position;
    }
    target = clampUnits(target + deltaUnits);
  }

  function jumpTarget(units, kind) {
    mode = kind;
    target = clampUnits(units);
  }

  // --- one gesture, whatever kind of pointing device produced it ---

  function beginDrag(id, y, t) {
    if (dragId !== null) return; // one gesture at a time (ignore extra fingers)
    dragId = id;
    tracking = false;
    startY = lastY = y;
    lastT = t;
    velocity = 0;
    mode = 'drag';
    target = position; // contact stops a coast, before the drag moves at all
  }

  /** @returns {boolean} whether this move produced scrolling. */
  function moveDrag(id, y, t) {
    if (id !== dragId) return false;

    if (!tracking) {
      const totalY = y - startY;
      if (Math.abs(totalY) < WOBBLE_PX) return false;
      // Start scrolling from where the deadband was crossed, not from this
      // event, so exactly WOBBLE_PX is ever spent — however coarse the
      // browser's move events are.
      tracking = true;
      lastY = startY + Math.sign(totalY) * WOBBLE_PX;
    }

    const dy = y - lastY;
    const dt = Math.max((t - lastT) / 1000, 1e-4);
    // Dragging the world up pulls the story forward: the finger travels with
    // the content, so a negative dy advances the position.
    position = clampUnits(position - dy / viewportHeight());
    target = position;
    velocity = velocity * 0.6 + (dy / dt) * 0.4;
    lastY = y;
    lastT = t;
    return true;
  }

  function endDrag(id, t, throwable = true) {
    if (id !== dragId) return;
    if (tracking && throwable) {
      // A finger held still before release means "stop here", not "throw".
      const stale = t - lastT > STALE_MS;
      const flick = stale ? 0 : -velocity / viewportHeight();
      const v = Math.max(-FLICK_MAX, Math.min(FLICK_MAX, flick));
      // Thrown `v * tau` ahead, the ease leaves the target at exactly the
      // release velocity and decays from there.
      jumpTarget(position + v * TAU.flick, 'flick');
    }
    dragId = null;
    tracking = false;
  }

  // --- touch ---

  function findTouch(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }

  function onTouchStart(ev) {
    // A fresh single-finger contact always takes over, so a gesture whose end
    // was somehow missed can never wedge the axis (see `swipe.js`).
    if (ev.touches.length === 1) dragId = null;
    const t = ev.changedTouches[0];
    if (t) beginDrag(t.identifier, t.clientY, ev.timeStamp);
  }

  function onTouchMove(ev) {
    const t = findTouch(ev.touches, dragId);
    if (t) moveDrag(t.identifier, t.clientY, ev.timeStamp);
  }

  function onTouchEnd(ev) {
    const t = findTouch(ev.changedTouches, dragId);
    if (t) endDrag(t.identifier, ev.timeStamp);
  }

  function onTouchCancel(ev) {
    const t = findTouch(ev.changedTouches, dragId);
    if (t) endDrag(t.identifier, ev.timeStamp, false);
  }

  // --- mouse / pen: a drag grabs the world here too, as it does for rotation ---

  function onPointerDown(ev) {
    if (ev.pointerType === 'touch') return; // fingers come in as touch events
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    beginDrag(ev.pointerId, ev.clientY, ev.timeStamp);
  }

  function onPointerMove(ev) {
    if (ev.pointerType === 'touch') return;
    // Suppress text selection only once the drag is actually scrolling.
    if (moveDrag(ev.pointerId, ev.clientY, ev.timeStamp)) ev.preventDefault();
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
    // ctrl+wheel is the browser's zoom, which is left alone: it is a real
    // accessibility affordance and there is no scrolling of ours to protect.
    if (ev.ctrlKey) return;
    // Otherwise cancelled, because the vertical component is now ours to spend
    // — under native scrolling this had to stay passive so the browser could
    // scroll with it. `swipe.js` still reads the same event's `deltaX`.
    if (ev.cancelable) ev.preventDefault();
    const px =
      ev.deltaMode === 1
        ? ev.deltaY * LINE_PX
        : ev.deltaMode === 2
          ? ev.deltaY * viewportHeight()
          : ev.deltaY;
    if (px === 0) return;
    impulse(px / viewportHeight(), 'wheel');
  }

  function onKeyDown(ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const el = ev.target;
    if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '')) return;

    switch (ev.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        keys.add(ev.key); // held keys move at a rate, from update()
        break;
      case 'PageDown':
        impulse(PAGE_UNITS, 'page');
        break;
      case 'PageUp':
        impulse(-PAGE_UNITS, 'page');
        break;
      case ' ':
        impulse(ev.shiftKey ? -PAGE_UNITS : PAGE_UNITS, 'page');
        break;
      case 'Home':
        jumpTarget(0, 'page');
        break;
      case 'End':
        jumpTarget(totalUnits(), 'page');
        break;
      default:
        return;
    }
    ev.preventDefault();
  }

  function onKeyUp(ev) {
    keys.delete(ev.key);
  }

  function onBlur() {
    keys.clear();
  }

  // --- take the page out of the browser's hands (restored on dispose) ---

  const html = doc.documentElement;
  const body = doc.body;
  const canvases = [...element.querySelectorAll('canvas')];
  const prev = {
    htmlOverflow: html.style.overflow,
    htmlOverscrollY: html.style.overscrollBehaviorY,
    bodyOverflow: body.style.overflow,
    bodyHeight: body.style.height,
    elTouch: element.style.touchAction,
    canvasTouch: canvases.map((c) => c.style.touchAction),
  };
  html.style.overflow = 'hidden';
  // Vertical chaining and pull-to-refresh would otherwise survive `overflow:
  // hidden` on some engines. `swipe.js` owns the X longhand; the two never
  // touch the same property, so either can be disposed without stranding the
  // other's value.
  html.style.overscrollBehaviorY = 'none';
  body.style.overflow = 'hidden';
  body.style.height = '100%';
  // No native panning on either axis: both are read from the events below.
  element.style.touchAction = 'none';
  for (const c of canvases) c.style.touchAction = 'none';

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  win.addEventListener('touchmove', onTouchMove, { passive: true });
  win.addEventListener('touchend', onTouchEnd, { passive: true });
  win.addEventListener('touchcancel', onTouchCancel, { passive: true });
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
     * Advance the drag/coast and read the story position. Call once per frame.
     * @param {number} dt Seconds since the last frame.
     * @returns {number} Current position in units (viewport heights).
     */
    update(dt) {
      const held = (keys.has('ArrowDown') ? 1 : 0) + (keys.has('ArrowUp') ? -1 : 0);
      if (held !== 0) impulse(held * KEY_RATE * dt, 'key');

      if (mode !== 'drag') {
        position += (target - position) * (1 - Math.exp(-dt / TAU[mode]));
        // An exponential ease is asymptotic, so it is cut off once the travel
        // left is under half a pixel — invisible, and it stops the world being
        // re-derived from a number that is still creeping.
        if (Math.abs(target - position) < SETTLE_PX / viewportHeight()) position = target;
      }
      // The story can grow or shrink underneath an in-flight gesture.
      position = clampUnits(position);
      target = clampUnits(target);
      return position;
    },

    /** Jump instantly (load-gating). */
    jumpTo(units) {
      position = target = clampUnits(units);
      velocity = 0;
      mode = 'wheel';
    },

    get position() {
      return position;
    },

    dispose() {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehaviorY = prev.htmlOverscrollY;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      element.style.touchAction = prev.elTouch;
      canvases.forEach((c, i) => (c.style.touchAction = prev.canvasTouch[i]));
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
