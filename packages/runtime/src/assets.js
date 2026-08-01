import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneWithSkeleton } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Asset instantiation: turns asset-index entries into Three.js objects.
 * Templates are loaded once per asset id and cloned per instance, so many
 * scenes and actors can share one loaded model (Asset Reuse in the spec).
 *
 * DRACO is intentionally not wired yet: it needs external wasm decoder
 * files. Meshopt-compressed glTF works out of the box.
 *
 * @param {{ assets: Array<any> }} assetIndex
 * @param {(source: string) => string} resolveAsset Maps an asset `source`
 *   path (relative to assets/) to a fetchable URL. The player passes a
 *   baseUrl-based default; the editor preview passes blob URLs for
 *   in-memory files.
 */
export function createAssetLibrary(assetIndex, resolveAsset) {
  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const byId = new Map(assetIndex.assets.map((a) => [a.id, a]));
  /** @type {Map<string, Promise<{object: import('three').Object3D, clips: import('three').AnimationClip[]}>>} */
  const templates = new Map();

  function loadTemplate(def) {
    if (def.kind === 'primitive') {
      return Promise.resolve({ object: buildPrimitive(def.primitive), clips: [] });
    }
    return gltfLoader
      .loadAsync(resolveAsset(def.source))
      .then((gltf) => ({ object: gltf.scene, clips: gltf.animations }));
  }

  return {
    /** @param {string} id @returns asset-index entry */
    definition: (id) => byId.get(id),

    /**
     * Get a fresh instance of the asset (template is loaded on first use).
     * @param {string} id
     */
    async instantiate(id) {
      const def = byId.get(id);
      if (!def) throw new Error(`Unknown asset "${id}"`);
      if (!templates.has(id)) templates.set(id, loadTemplate(def));
      const { object, clips } = await templates.get(id);
      return { object: cloneWithSkeleton(object), clips };
    },
  };
}

/**
 * Placeholder geometry for `kind: "primitive"` assets. Standing shapes
 * (box, capsule, cylinder) get their origin at the feet so `position` puts
 * them on the ground; spheres stay centered (they usually hang or float);
 * planes are horizontal ground with their surface at y=0.
 *
 * @param {{ shape: string, size?: number[], color?: string }} def
 */
function buildPrimitive(def) {
  const [w, h, d] = def.size ?? [1, 1, 1];
  let geometry;
  switch (def.shape) {
    case 'box':
      geometry = new THREE.BoxGeometry(w, h, d);
      geometry.translate(0, h / 2, 0);
      break;
    case 'capsule': {
      const radius = w / 2;
      geometry = new THREE.CapsuleGeometry(radius, Math.max(0.01, h - 2 * radius), 8, 16);
      geometry.translate(0, h / 2, 0);
      break;
    }
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(w / 2, w / 2, h, 24);
      geometry.translate(0, h / 2, 0);
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(w / 2, 24, 16);
      break;
    case 'plane':
      geometry = new THREE.BoxGeometry(w, 0.1, d);
      geometry.translate(0, -0.05, 0);
      break;
    default:
      throw new Error(`Unknown primitive shape "${def.shape}"`);
  }
  return new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color: def.color ?? '#888888' }));
}
