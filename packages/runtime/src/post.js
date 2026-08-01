import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      color.rgb *= 1.0 - strength * smoothstep(0.35, 0.72, d);
      gl_FragColor = color;
    }`,
};

/**
 * Post-processing chain (bloom + vignette) from project.renderStyle.post.
 * `enabled` toggles per scene ("post": false); when disabled it renders
 * directly with no composer overhead.
 *
 * @param {ReturnType<import('./viewer.js').createViewer>} viewer
 * @param {{ bloom?: {strength?: number, threshold?: number}, vignette?: {strength?: number} }} config
 */
export function createPostPipeline(viewer, config) {
  const { renderer, scene, camera } = viewer;
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  if (config.bloom) {
    composer.addPass(
      new UnrealBloomPass(size, config.bloom.strength ?? 0.6, 0.4, config.bloom.threshold ?? 0.8),
    );
  }
  if (config.vignette) {
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.strength.value = config.vignette.strength ?? 0.35;
    composer.addPass(vignette);
  }
  composer.addPass(new OutputPass());

  let enabled = true;
  const offResize = viewer.onResize((w, h) => composer.setSize(w, h));

  return {
    render() {
      if (enabled) composer.render();
      else renderer.render(scene, camera);
    },
    setEnabled(on) {
      enabled = on;
    },
    dispose() {
      offResize();
      composer.dispose();
    },
  };
}
