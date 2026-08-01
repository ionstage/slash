/**
 * Scroll input driver: converts wheel and touch input into a damped scroll
 * position measured in viewport heights ("units"), the currency of the
 * Story Progress system. The page never actually scrolls — input is virtual
 * so the same driver works on desktop and mobile and can later be swapped
 * for an auto-play driver (Playback Mode) without touching the player.
 *
 * @param {HTMLElement} element Element receiving input (and measuring viewport height).
 * @param {{ totalUnits: number }} options
 */
export function createScrollDriver(element, { totalUnits }) {
  const DAMPING = 7; // higher = snappier catch-up to the target
  const TOUCH_MULTIPLIER = 1.6;
  const FLICK_DECAY = 3;

  let target = 0;
  let current = 0;
  let flickVelocity = 0; // units/second after a touch flick

  const viewportHeight = () => element.clientHeight || window.innerHeight;
  const clamp = (v) => Math.min(totalUnits, Math.max(0, v));

  function onWheel(e) {
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    target = clamp(target + px / viewportHeight());
    flickVelocity = 0;
  }

  let lastTouchY = null;
  let lastTouchTime = 0;
  let touchVelocity = 0;

  function onTouchStart(e) {
    lastTouchY = e.touches[0].clientY;
    lastTouchTime = performance.now();
    touchVelocity = 0;
    flickVelocity = 0;
  }

  function onTouchMove(e) {
    if (lastTouchY === null) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const now = performance.now();
    const deltaUnits = ((lastTouchY - y) * TOUCH_MULTIPLIER) / viewportHeight();
    target = clamp(target + deltaUnits);
    const dt = (now - lastTouchTime) / 1000;
    if (dt > 0) touchVelocity = deltaUnits / dt;
    lastTouchY = y;
    lastTouchTime = now;
  }

  function onTouchEnd() {
    lastTouchY = null;
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
