// The lawn just outside: tens of thousands of individual blades, each its own height, lean and colour,
// moving in a gusting wind. It is the nearest thing in the scene, so it shows the most parallax.
import * as THREE from 'three';
import { groundHeight } from './terrain.js';
import { seededRandom } from './random.js';

function bladeGeometry() {
    // A tapered strip, five segments high, curving slightly; 1 m tall before scaling.
    const segments = 5;
    const positions = [], uvs = [], indices = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const halfWidth = 0.012 * (1 - t * 0.9);
        const bend = t * t * 0.18;
        positions.push(-halfWidth, t, bend, halfWidth, t, bend);
        uvs.push(0, t, 1, t);
        if (i < segments) {
            const a = i * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    // Lit as if the blade faced up, the usual trick: thin blades lit by their true normals flicker dark.
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geometry.setIndex(indices);
    return geometry;
}

/**
 * The grass, as one instanced mesh. `density` scales the blade count, for slower machines. Its
 * material's `userData.time` uniform drives the wind.
 */
export function createGrass(density = 1) {
    const random = seededRandom(42);
    const count = Math.round(110000 * density);
    const mesh = new THREE.InstancedMesh(bladeGeometry(), null, count);
    const time = { value: 0 };
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
    material.userData.time = time;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vBladeHeight;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
{
    vec3 root = instanceMatrix[3].xyz;
    float h = uv.y;
    // Gusts roll across the lawn; each blade adds a flutter of its own.
    float gust = sin(uTime * 0.9 - root.x * 0.08 + root.z * 0.11) * 0.5 + 0.5;
    gust = gust * gust;
    float flutter = sin(uTime * 3.1 + root.x * 1.7 + root.z * 2.3) * 0.25;
    float sway = (0.35 * gust + flutter * (0.3 + gust)) * h * h;
    transformed.x += sway * 0.28;
    transformed.z += sway * 0.12;
    vBladeHeight = h;
}`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vBladeHeight;')
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.35, 1.15, vBladeHeight);');
    };
    mesh.material = material;

    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const color = new THREE.Color();
    const greens = [0x4f7a2a, 0x5e8a30, 0x6b9436, 0x41672a, 0x7d8f3a, 0x8a8a45].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
        // Densest right outside, thinning out to 40 m; spread wider further out, as the view widens.
        const d = 0.6 + Math.pow(random(), 2.2) * 40;
        const x = (random() * 2 - 1) * (4 + d * 1.6);
        const z = -d;
        position.set(x, groundHeight(x, z) - 0.02, z);
        euler.set((random() - 0.5) * 0.35, random() * Math.PI * 2, (random() - 0.5) * 0.35);
        quaternion.setFromEuler(euler);
        const height = 0.12 + random() * 0.22 + (random() < 0.06 ? 0.25 : 0);
        const width = 0.8 + random() * 0.8;
        scale.set(width, height, width);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
        color.copy(greens[Math.floor(random() * greens.length)]).multiplyScalar(0.8 + random() * 0.4);
        mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'grass';
    return mesh;
}
