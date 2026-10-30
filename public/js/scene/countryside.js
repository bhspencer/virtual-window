// Everything outside the window, put together. The garden is `windowHeight` metres below the middle
// of the window, as it would be looking out of a ground-floor room.
import * as THREE from 'three';
import { createTerrain } from './terrain.js';
import { createGrass } from './grass.js';
import { createTrees } from './trees.js';
import { createFence, createFlowers, createFarm } from './props.js';

/** quality: 'low', 'medium' or 'high', scaling the grass, flowers and trees for the machine. */
export function createCountryside(quality) {
    const density = { low: 0.3, medium: 0.6, high: 1 }[quality] ?? 0.6;
    const group = new THREE.Group();
    group.name = 'countryside';
    const grass = createGrass(density);
    group.add(createTerrain(), grass, createTrees(density), createFence(), createFlowers(density), createFarm());
    return {
        group,
        setWindowHeight(height) {
            group.position.y = -height;
        },
        update(t) {
            grass.material.userData.time.value = t;
        }
    };
}
