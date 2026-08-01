import * as THREE from 'three';

/**
 * Creates a Three.js viewport bound to a container element: renderer, scene,
 * camera, resize handling and a render loop. Used by the runtime player and
 * embedded by the editor as its viewport.
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

  scene.add(new THREE.AmbientLight('#8890b0', 0.8));
  const sun = new THREE.DirectionalLight('#fff4e0', 2);
  sun.position.set(5, 10, 5);
  scene.add(sun);

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  /** @type {Set<(dt: number) => void>} */
  const tickers = new Set();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    for (const tick of tickers) tick(dt);
    renderer.render(scene, camera);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clock.stop();
    else clock.start();
  });

  return {
    renderer,
    scene,
    camera,
    /** Register a per-frame callback; returns an unsubscribe function. */
    onTick(fn) {
      tickers.add(fn);
      return () => tickers.delete(fn);
    },
    dispose() {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
