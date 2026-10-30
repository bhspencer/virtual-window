// Clouds: fair-weather cumulus, as billboards a few kilometres off and a kilometre or two up, drifting
// slowly across. A window mostly shows the sky's lowest few degrees, where distant clouds sit.
import * as THREE from 'three';
import { seededRandom } from './random.js';
import { cloudTexture } from './textures.js';

export function createClouds() {
    const random = seededRandom(19);
    const textures = [3, 4, 5, 6, 7].map(cloudTexture);
    const group = new THREE.Group();
    group.name = 'clouds';
    for (let i = 0; i < 55; i++) {
        const material = new THREE.SpriteMaterial({
            map: textures[i % textures.length], transparent: true, depthWrite: false, fog: false, opacity: 0.8 + random() * 0.2
        });
        const sprite = new THREE.Sprite(material);
        const d = 4000 + random() * 14000;
        sprite.position.set((random() * 2 - 1) * d * 1.6, 1500 + random() * 1600, -d);
        const size = 1200 + random() * 1800;
        sprite.scale.set(size, size, 1);
        sprite.userData.speed = 3 + random() * 4;
        // Haze softens the far ones into the sky.
        sprite.userData.opacity = material.opacity * (1 - (d - 4000) / 14000 * 0.55);
        material.opacity = sprite.userData.opacity;
        group.add(sprite);
    }
    return group;
}

/** Drifts the clouds; dt in seconds. Each wraps round once it has crossed the view. */
export function driftClouds(clouds, dt) {
    for (const sprite of clouds.children) {
        sprite.position.x += sprite.userData.speed * dt;
        const limit = -sprite.position.z * 1.7;
        if (sprite.position.x > limit) sprite.position.x = -limit;
    }
}

/** Lights the clouds for the time of day: white by day, warm at sunrise and sunset, faint at night. */
export function lightClouds(clouds, color, visibility) {
    for (const sprite of clouds.children) {
        sprite.material.color.copy(color);
        sprite.material.opacity = sprite.userData.opacity * visibility;
    }
}
