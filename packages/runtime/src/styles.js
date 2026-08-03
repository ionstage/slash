import * as THREE from 'three';

/**
 * Render styles: converts imported/primitive materials to the project's
 * style preset. Applied per object at scene assembly, so every asset (glTF
 * or primitive) gets the same look.
 */

let toonGradient = null;
function gradientMap() {
  if (!toonGradient) {
    // 3-step ramp = the "realistic toon" default: shadow / mid / light.
    toonGradient = new THREE.DataTexture(new Uint8Array([96, 176, 255]), 3, 1, THREE.RedFormat);
    toonGradient.minFilter = THREE.NearestFilter;
    toonGradient.magFilter = THREE.NearestFilter;
    toonGradient.needsUpdate = true;
  }
  return toonGradient;
}

/**
 * @param {import('three').Object3D} object
 * @param {'toon'|'realistic'|'illustration'|'lowpoly'} [style]
 */
export function applyStyle(object, style = 'toon') {
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.material = convertMaterial(node.material, style);
  });
  return object;
}

function convertMaterial(material, style) {
  if (Array.isArray(material)) return material.map((m) => convertMaterial(m, style));
  const base = {
    color: material.color?.clone() ?? new THREE.Color('#888888'),
    map: material.map ?? null,
    transparent: material.transparent ?? false,
    opacity: material.opacity ?? 1,
  };
  switch (style) {
    case 'toon':
    case 'illustration': {
      if (material.isMeshToonMaterial) {
        material.gradientMap = gradientMap();
        material.needsUpdate = true;
        return material;
      }
      return new THREE.MeshToonMaterial({ ...base, gradientMap: gradientMap() });
    }
    case 'lowpoly':
      return new THREE.MeshStandardMaterial({
        ...base,
        flatShading: true,
        roughness: 0.9,
        metalness: 0,
      });
    case 'realistic':
      if (material.isMeshStandardMaterial) return material;
      return new THREE.MeshStandardMaterial({ ...base, roughness: 0.8, metalness: 0 });
    default:
      return material;
  }
}
