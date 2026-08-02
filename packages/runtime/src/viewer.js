import * as THREE from 'three';

/**
 * Creates a Three.js viewport bound to a container element: renderer, scene,
 * camera, resize handling and a render loop. Used by the runtime player and
 * embedded by the editor as its viewport.
 *
 * Default lights live in `defaultLights` so scenes that author their own
 * lighting can switch them off. A render override (post-processing
 * composer) can replace the plain render call.
 *
 * @param {HTMLElement} container
 * @param {{ background?: string, maxPixelRatio?: number }} [options]
 */
export function createViewer(container, options = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.maxPixelRatio ?? 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background ?? '#1a1a2e');

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 1, 0);

  const defaultLights = new THREE.Group();
  defaultLights.name = 'defaultLights';
  defaultLights.add(new THREE.AmbientLight('#8890b0', 0.8));
  const sun = new THREE.DirectionalLight('#fff4e0', 2);
  sun.position.set(5, 10, 5);
  defaultLights.add(sun);
  scene.add(defaultLights);

  /** @type {Set<(w: number, h: number) => void>} */
  const resizeListeners = new Set();

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const fn of resizeListeners) fn(w, h);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  /** @type {Set<(dt: number) => void>} */
  const tickers = new Set();
  /** @type {(() => void) | null} */
  let renderOverride = null;
  // Manual info reset so stats readers see a whole frame's totals even
  // when a post-processing composer issues multiple internal renders.
  renderer.info.autoReset = false;
  const clock = new THREE.Clock();

  // One frame: advance every ticker by dt, then render.
  function frame(dt) {
    for (const tick of tickers) tick(dt); // reads last frame's renderer.info
    renderer.info.reset();
    if (renderOverride) renderOverride();
    else renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(() => frame(clock.getDelta()));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clock.stop();
    else clock.start();
  });

  return {
    renderer,
    scene,
    camera,
    defaultLights,
    /** Register a per-frame callback; returns an unsubscribe function. */
    onTick(fn) {
      tickers.add(fn);
      return () => tickers.delete(fn);
    },
    /** Register a resize callback (w, h in CSS pixels); returns unsubscribe. */
    onResize(fn) {
      resizeListeners.add(fn);
      return () => resizeListeners.delete(fn);
    },
    /** Replace the plain render call (post-processing composer). Pass null to restore. */
    setRenderOverride(fn) {
      renderOverride = fn;
    },
    /**
     * Run a single frame with an explicit dt (seconds), bypassing the
     * requestAnimationFrame loop. For deterministic tests/tooling — e.g.
     * driving playback when the tab is backgrounded and rAF is throttled.
     */
    step(dt) {
      frame(dt);
    },
    dispose() {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
