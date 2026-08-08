/**
 * Scroll input driver — N0: native browser scrolling.
 *
 * The document scrolls for real. The canvas host (`element`, pinned
 * `position: fixed` by the page CSS) stays in the viewport while a tall,
 * invisible spacer appended to the body gives the document its scroll
 * height. Story progress is read directly from the scroll position:
 *
 *     units = scrollTop / viewportHeight
 *
 * measured in viewport heights, the currency of the Story Progress system.
 * Browser momentum provides the feel — there is no virtual damping. The
 * spacer is `(totalUnits + 1)` viewport-heights tall: the extra height is
 * eaten by the viewport itself, so the maximum scroll position is exactly
 * `totalUnits` and the final section reaches t = 1 at the bottom.
 *
 * Total length is dynamic (branching extends the path); the spacer is
 * resized from `getTotalUnits` every frame. Growth only ever appends height
 * *below* the current position, so it never moves the user's scroll.
 *
 * The driver is self-contained: it flips the document into a scrollable
 * state (overriding the page's `overflow: hidden` / `touch-action: none`)
 * and restores those styles on dispose.
 *
 * @param {HTMLElement} element Canvas host (pinned).
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
  // Vertical panning stays the browser's, so the scroll feel is native.
  // Horizontal travel is the swipe driver's (`swipe.js`), which reads it from
  // touch events so a gesture can turn the view *while* this scrolls.
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
    const total = getTotalUnits();
    const vh = viewportHeight();
    if (total === lastUnits && vh === lastVh) return;
    lastUnits = total;
    lastVh = vh;
    spacer.style.height = `${(total + 1) * vh}px`;
  }
  syncSpacer();

  return {
    /**
     * Read the current scroll position. Call once per frame.
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
