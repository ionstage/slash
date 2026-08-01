import * as THREE from 'three';

/**
 * Render styles: converts imported/primitive materials to the project's
 * style preset and adds inverted-hull toon outlines. Applied per object at
 * scene assembly, so every asset (glTF or primitive) gets the same look.
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
 * @param {{enabled?: boolean, color?: string, thickness?: number}} [outline]
 */
export function applyStyle(object, style = 'toon', outline = {}) {
  const outlined = [];
  object.traverse((node) => {
    if (!node.isMesh || node.userData.slashOutline) return;
    node.material = convertMaterial(node.material, style);
    if (outline.enabled && (style === 'toon' || style === 'illustration')) outlined.push(node);
  });
  for (const mesh of outlined) addOutline(mesh, outline);
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
      return new THREE.MeshStandardMaterial({ ...base, flatShading: true, roughness: 0.9, metalness: 0 });
    case 'realistic':
      if (material.isMeshStandardMaterial) return material;
      return new THREE.MeshStandardMaterial({ ...base, roughness: 0.8, metalness: 0 });
    default:
      return material;
  }
}

/**
 * Inverted-hull outline: a slightly scaled back-face copy as a child mesh.
 * Skipped for skinned meshes (the hull would not follow bones) and for
 * very large meshes like stages, where an outline reads as a glitch.
 */
function addOutline(mesh, { color = '#000000', thickness = 0.02 }) {
  if (mesh.isSkinnedMesh) return;
  mesh.geometry.computeBoundingSphere();
  if ((mesh.geometry.boundingSphere?.radius ?? 0) > 8) return;
  const hull = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
  );
  hull.scale.setScalar(1 + thickness);
  hull.userData.slashOutline = true;
  mesh.add(hull);
}
