/**
 * Scroll input driver: converts wheel and touch input into a damped scroll
 * position measured in viewport heights ("units"), the currency of the
 * Story Progress system. The page never actually scrolls — input is virtual
 * so the same driver works on desktop and mobile and can later be swapped
 * for an auto-play driver (Playback Mode) without touching the player.
 *
 * Total length is dynamic (branching extends the story path), so the owner
 * supplies it via `getTotalUnits`. Horizontal swipes (viewpoint switching)
 * are detected here and reported through `onSwipe`.
 *
 * @param {HTMLElement} element Element receiving input (and measuring viewport height).
 * @param {{ getTotalUnits: () => number, onSwipe?: (direction: 1 | -1) => void }} options
 */
export function createScrollDriver(element, { getTotalUnits, onSwipe }) {
  const DAMPING = 7; // higher = snappier catch-up to the target
  const TOUCH_MULTIPLIER = 1.6;
  const FLICK_DECAY = 3;
  const SWIPE_MIN_PX = 60;

  let target = 0;
  let current = 0;
  let flickVelocity = 0; // units/second after a touch flick

  const viewportHeight = () => element.clientHeight || window.innerHeight;
  const clamp = (v) => Math.min(getTotalUnits(), Math.max(0, v));

  function onWheel(e) {
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    target = clamp(target + px / viewportHeight());
    flickVelocity = 0;
  }

  let lastTouchY = null;
  let lastTouchTime = 0;
  let touchVelocity = 0;
  let touchStart = null; // [x, y] for swipe detection

  function onTouchStart(e) {
    lastTouchY = e.touches[0].clientY;
    touchStart = [e.touches[0].clientX, e.touches[0].clientY];
    lastTouchTime = performance.now();
    touchVelocity = 0;
    flickVelocity = 0;
  }

  function onTouchMove(e) {
    if (lastTouchY === null) return;
    e.preventDefault();
    const touch = e.touches[0];
    // A dominantly-horizontal gesture is a viewpoint swipe, not a scroll.
    const horizontal =
      touchStart && Math.abs(touch.clientX - touchStart[0]) > Math.abs(touch.clientY - touchStart[1]);
    const y = touch.clientY;
    const now = performance.now();
    if (!horizontal) {
      const deltaUnits = ((lastTouchY - y) * TOUCH_MULTIPLIER) / viewportHeight();
      target = clamp(target + deltaUnits);
      const dt = (now - lastTouchTime) / 1000;
      if (dt > 0) touchVelocity = deltaUnits / dt;
    }
    lastTouchY = y;
    lastTouchTime = now;
  }

  function onTouchEnd(e) {
    if (touchStart && onSwipe) {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart[0];
      const dy = touch.clientY - touchStart[1];
      if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onSwipe(dx < 0 ? 1 : -1); // swipe left = next viewpoint
        lastTouchY = null;
        touchStart = null;
        return;
      }
    }
    lastTouchY = null;
    touchStart = null;
    flickVelocity = touchVelocity;
  }

  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchmove', onTouchMove, { passive: false });
  element.addEventListener('touchend', onTouchEnd, { passive: true });

  return {
    /**
     * Advance the damped position. Call once per frame.
     * @param {number} dt Seconds since last frame.
     * @returns {number} Current position in units.
     */
    update(dt) {
      if (Math.abs(flickVelocity) > 0.01) {
        target = clamp(target + flickVelocity * dt);
        flickVelocity *= Math.exp(-FLICK_DECAY * dt);
      }
      current += (target - current) * Math.min(1, dt * DAMPING);
      return current;
    },

    /** Advance by du units (Playback Mode's auto-play). */
    advance(du) {
      target = clamp(target + du);
    },

    /** Jump instantly (scene changes, editor scrubbing). */
    jumpTo(units) {
      target = current = clamp(units);
      flickVelocity = 0;
    },

    get position() {
      return current;
    },

    dispose() {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
    },
  };
}
