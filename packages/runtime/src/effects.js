import * as THREE from 'three';
import { sampleTrack } from './tracks.js';

/**
 * Preset-driven particle effects (THREE.Points, one draw call each).
 * Particles live in an emission box and wrap around its edges, so a small
 * count fills the volume continuously. Intensity tracks scale opacity over
 * scene progress; events toggle whole effects via setEffect.
 */

const PRESETS = {
  rain: { count: 1200, size: 0.05, color: '#9fb8d8', opacity: 0.45 },
  snow: { count: 500, size: 0.07, color: '#e8ecf5', opacity: 0.8 },
  sparks: { count: 150, size: 0.06, color: '#ffb84d', opacity: 0.9 },
  fireflies: { count: 60, size: 0.09, color: '#ffd27f', opacity: 0.85 },
};

/**
 * @param {any} def Effect definition from the scene schema.
 */
export function createEffect(def) {
  const preset = PRESETS[def.preset];
  const count = def.count ?? preset.count;
  const area = def.area ?? [20, 10, 20];
  const center = def.position ?? [0, area[1] / 2, 0];
  const baseOpacity = preset.opacity;

  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = center[0] + (Math.random() - 0.5) * area[0];
    positions[i * 3 + 1] = center[1] + (Math.random() - 0.5) * area[1];
    positions[i * 3 + 2] = center[2] + (Math.random() - 0.5) * area[2];
    seeds[i] = Math.random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: def.size ?? preset.size,
    color: def.color ?? preset.color,
    transparent: true,
    opacity: baseOpacity,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.visible = def.enabled !== false;
  points.frustumCulled = false;

  const yMin = center[1] - area[1] / 2;
  const yMax = center[1] + area[1] / 2;
  let time = 0;

  function move(i, dt) {
    const x = i * 3;
    switch (def.preset) {
      case 'rain':
        positions[x + 1] -= 11 * dt;
        positions[x] += 1.5 * dt;
        if (positions[x + 1] < yMin) positions[x + 1] = yMax;
        break;
      case 'snow':
        positions[x + 1] -= 0.8 * dt;
        positions[x] += Math.sin(time * 0.8 + seeds[i]) * 0.4 * dt;
        positions[x + 2] += Math.cos(time * 0.6 + seeds[i]) * 0.4 * dt;
        if (positions[x + 1] < yMin) positions[x + 1] = yMax;
        break;
      case 'sparks':
        positions[x + 1] += (1.2 + Math.sin(seeds[i]) * 0.6) * dt;
        positions[x] += Math.sin(time * 3 + seeds[i]) * 0.3 * dt;
        if (positions[x + 1] > yMax) positions[x + 1] = yMin;
        break;
      case 'fireflies':
        positions[x] += Math.sin(time * 0.5 + seeds[i]) * 0.25 * dt;
        positions[x + 1] += Math.cos(time * 0.4 + seeds[i] * 2) * 0.15 * dt;
        positions[x + 2] += Math.sin(time * 0.3 + seeds[i] * 3) * 0.25 * dt;
        break;
    }
  }

  return {
    id: def.id,
    object: points,

    /** @param {number} dt frame delta @param {number} t scene progress */
    update(dt, t) {
      if (!points.visible || dt === 0) return;
      time += dt;
      for (let i = 0; i < count; i++) move(i, dt);
      geometry.attributes.position.needsUpdate = true;
      let intensity = def.tracks?.intensity ? sampleTrack(def.tracks.intensity, t) : 1;
      if (def.preset === 'fireflies' || def.preset === 'sparks') {
        intensity *= 0.75 + 0.25 * Math.sin(time * 4); // gentle flicker
      }
      material.opacity = baseOpacity * Math.min(1, Math.max(0, intensity));
    },

    setEnabled(enabled) {
      points.visible = enabled;
    },
  };
}
