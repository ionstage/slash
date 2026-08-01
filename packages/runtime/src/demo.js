/**
 * Standalone runtime demo page (M0): proves the viewer renders.
 * M1 replaces the placeholder content with the sample project player.
 */
import * as THREE from 'three';
import { createViewer } from './index.js';

const viewer = createViewer(document.getElementById('app'));

viewer.scene.add(new THREE.GridHelper(20, 20, '#4a4a6a', '#2a2a4a'));

const placeholder = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.3, 1.1, 8, 16),
  new THREE.MeshToonMaterial({ color: '#e8b04b' }),
);
placeholder.position.y = 0.85;
viewer.scene.add(placeholder);

viewer.onTick((dt) => {
  placeholder.rotation.y += dt * 0.5;
});
