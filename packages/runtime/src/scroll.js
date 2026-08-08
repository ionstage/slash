/**
 * Scroll input driver — native browser scrolling.
 *
 * The document scrolls for real. The canvas host (`element`, pinned
 * `position: fixed` by the page CSS) stays in the viewport while a tall,
 * invisible spacer appended to the body gives the document its scroll height.
 * Story progress is then *read* rather than computed:
 *
 *     units = scrollTop / viewportHeight
 *
 * measured in viewport heights, the currency of the Story Progress system.
 *
 * **The browser owns the feel of this axis, deliberately.** Gesture-to-distance,
 * momentum after a flick, the rubber-band at the ends, stopping a coast on
 * contact, keyboard paging, the scrollbar, and whatever the viewer's
 * accessibility and input settings do to a native scroller are all the
 * platform's, not ours. The runtime previously integrated all of that itself;
 * that was reversed. What we buy back is everything a real scroller comes with
 * for free — including the conventions a viewer already has configured — at the
 * cost of the feel varying between engines. Nothing in this module tries to
 * re-take any of it: there is no damping, no target, no velocity.
 *
 * The spacer is `(totalUnits + 1)` viewport-heights tall: the extra height is
 * eaten by the viewport itself, so the maximum scroll position is exactly
 * `totalUnits` and the end of the world is reached at the bottom of the
 * document. It is resized from `getTotalUnits` and the live viewport height
 * every frame — both are cheap to compare, and on mobile the viewport height
 * genuinely changes mid-scroll as the browser toolbar collapses.
 *
 * ## One gesture, two axes
 *
 * This driver takes nothing but the scroll position the browser reports;
 * `swipe.js` reads the raw events and takes only their horizontal component.
 * A diagonal drag therefore scrolls natively *and* turns the view, because the
 * host is `touch-action: pan-y` — the browser is given the vertical axis and
 * keeps sending `touchmove` for the horizontal one. That is why `swipe.js`
 * reads fingers from touch events rather than pointer events: an engine that
 * claims a gesture for scrolling fires `pointercancel`, but touch events keep
 * arriving regardless.
 *
 * @param {HTMLElement} element Canvas host (pinned; the same element
 *   `swipe.js` gets).
 * @param {{ getTotalUnits: () => number }} options
 */
export function createScrollDriver(element, { getTotalUnits }) {
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;
  const scroller = doc.scrollingElement ?? doc.documentElement;

  const viewportHeight = () => win.innerHeight || element.clientHeight || 1;
  const positionUnits = () => scroller.scrollTop / viewportHeight();

  // --- flip the document into native-scroll mode (restored on dispose) ---
  const html = doc.documentElement;
  const body = doc.body;
  const canvases = [...element.querySelectorAll('canvas')];
  const prev = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyHeight: body.style.height,
    elTouch: element.style.touchAction,
    canvasTouch: canvases.map((c) => c.style.touchAction),
  };
  html.style.overflow = 'visible';
  body.style.overflow = 'visible';
  body.style.height = 'auto';
  // Vertical drags scroll the page natively; horizontal drags stay ours, and
  // `pan-y` is what keeps `touchmove` flowing to `swipe.js` throughout.
  element.style.touchAction = 'pan-y';
  for (const c of canvases) c.style.touchAction = 'pan-y';

  const spacer = doc.createElement('div');
  spacer.dataset.slashScrollSpacer = '';
  spacer.style.cssText = 'position:relative;width:1px;pointer-events:none;visibility:hidden;';
  body.appendChild(spacer);

  // Resize the spacer only when the story length or the viewport height
  // changes (both cheap to compare). Called every frame from update().
  let lastUnits = -1;
  let lastVh = -1;
  function syncSpacer() {
    const total = Math.max(getTotalUnits(), 0);
    const vh = viewportHeight();
    if (total === lastUnits && vh === lastVh) return;
    lastUnits = total;
    lastVh = vh;
    spacer.style.height = `${(total + 1) * vh}px`;
  }
  syncSpacer();

  return {
    /**
     * Read the current scroll position. Call once per frame. (`dt` is accepted
     * and ignored — this driver integrates nothing, it only reads.)
     * @returns {number} Current position in units (viewport heights).
     */
    update() {
      syncSpacer();
      return positionUnits();
    },

    /** Jump instantly (load-gating). */
    jumpTo(units) {
      syncSpacer();
      win.scrollTo(0, units * viewportHeight());
    },

    get position() {
      return positionUnits();
    },

    dispose() {
      spacer.remove();
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      element.style.touchAction = prev.elTouch;
      canvases.forEach((c, i) => (c.style.touchAction = prev.canvasTouch[i]));
    },
  };
}
