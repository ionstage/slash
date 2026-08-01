/**
 * Editor shell (M0): panel layout with the runtime's viewer embedded as the
 * viewport. Project open/save, hierarchy and inspector arrive in M2.
 */
import * as THREE from 'three';
import { createViewer } from '@slash/runtime';

const viewer = createViewer(document.getElementById('viewport'));

viewer.scene.add(new THREE.GridHelper(20, 20, '#4a4a6a', '#2a2a4a'));
viewer.scene.add(new THREE.AxesHelper(1.5));
