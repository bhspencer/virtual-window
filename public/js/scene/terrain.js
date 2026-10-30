// The ground: a nearly flat garden just outside, rolling fields beyond, then wooded hills and, far
// off, mountains. Heights are in metres above the garden; the countryside group puts the garden
// below the window.
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { seededRandom, smoothstep } from './random.js';

const simplex = new SimplexNoise({ random: seededRandom(1234) });

function fbm(x, z, octaves) {
    let sum = 0, amplitude = 1, frequency = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += amplitude * simplex.noise(x * frequency, z * frequency);
        norm += amplitude;
        amplitude *= 0.5;
        frequency *= 2.03;
    }
    return sum / norm;
}

function ridged(x, z, octaves) {
    let sum = 0, amplitude = 1, frequency = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
        const n = 1 - Math.abs(simplex.noise(x * frequency, z * frequency));
        sum += amplitude * n * n;
        norm += amplitude;
        amplitude *= 0.5;
        frequency *= 2.1;
    }
    return sum / norm;
}

/** The ground's height (metres, relative to the garden) at a point; z < 0 is out of the window. */
export function groundHeight(x, z) {
    const d = Math.max(0, -z);
    let h = 0.18 * fbm(x / 25, z / 25, 3);
    h += smoothstep(25, 300, d) * 14 * fbm(x / 380 + 3.1, z / 380, 4);
    h += smoothstep(500, 2500, d) * 140 * (0.45 + 0.55 * fbm(x / 1600 + 7.3, z / 1600 - 2.2, 5));
    h += smoothstep(4000, 10000, d) * 750 * ridged(x / 5500 + 1.7, z / 5500 + 4.4, 6);
    return h;
}

/**
 * The terrain mesh: a wedge of ground fanning out from the window, its rows further apart the further
 * out they are, so detail goes where it can be seen.
 */
export function createTerrain() {
    const rows = 300, cols = 420;
    const nearZ = 0.5, farZ = 16000;
    const positions = new Float32Array(rows * cols * 3);
    const colors = new Float32Array(rows * cols * 3);
    const color = new THREE.Color();
    const grass = new THREE.Color(0x3d5a22), dryGrass = new THREE.Color(0x77753a), rock = new THREE.Color(0x6b6660), forest = new THREE.Color(0x1f3317);
    for (let r = 0; r < rows; r++) {
        const t = r / (rows - 1);
        const d = nearZ * Math.pow(farZ / nearZ, t);
        // Wide enough for the steepest view a close viewer gets through the window's edge.
        const halfWidth = 30 + d * 3;
        for (let c = 0; c < cols; c++) {
            const u = c / (cols - 1) * 2 - 1;
            const x = Math.sign(u) * Math.pow(Math.abs(u), 1.6) * halfWidth;
            const z = -d;
            const y = groundHeight(x, z);
            const i = (r * cols + c) * 3;
            positions[i] = x; positions[i + 1] = y; positions[i + 2] = z;
            // Colour: grass, drier on the high ground, forest on the hillsides, rock on the mountains.
            const slope = Math.min(1, Math.abs(groundHeight(x + 2, z) - y) + Math.abs(groundHeight(x, z - 2) - y));
            color.copy(grass).lerp(dryGrass, smoothstep(-0.3, 0.6, fbm(x / 60, z / 60, 2)) * 0.45);
            color.lerp(forest, smoothstep(600, 2500, d) * smoothstep(20, 120, y) * 0.85);
            color.lerp(rock, smoothstep(250, 700, y) * 0.8 + smoothstep(0.6, 1.0, slope) * 0.3);
            colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
        }
    }
    const indices = [];
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c, b = a + 1, e = a + cols, f = e + 1;
            // Counter-clockwise seen from above, so the ground faces up.
            indices.push(a, b, e, b, f, e);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
varying vec3 vGround;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    // Fields: a patchwork of crops in rotated plots, edged with hedgerows, across the middle distance.
    float dist = -vGround.z;
    float fieldBand = smoothstep(40.0, 120.0, dist) * (1.0 - smoothstep(1800.0, 3500.0, dist));
    mat2 rot = mat2(0.94, -0.34, 0.34, 0.94);
    vec2 p = rot * vGround.xz / vec2(150.0, 110.0);
    vec2 cell = floor(p);
    vec2 inCell = fract(p);
    float pick = hash21(cell);
    vec3 crop = pick < 0.35 ? vec3(0.07, 0.17, 0.03)
              : pick < 0.55 ? vec3(0.13, 0.24, 0.04)
              : pick < 0.72 ? vec3(0.45, 0.36, 0.12)
              : pick < 0.86 ? vec3(0.32, 0.30, 0.10)
              : vec3(0.15, 0.09, 0.05);
    // Rows in ploughed and crop fields.
    float rows = 0.5 + 0.5 * sin((inCell.x + hash21(cell + 7.0)) * 220.0);
    crop *= mix(1.0, 0.82 + 0.18 * rows, step(0.55, pick) * (1.0 - smoothstep(300.0, 900.0, dist)));
    float edge = min(min(inCell.x, 1.0 - inCell.x) * 150.0, min(inCell.y, 1.0 - inCell.y) * 110.0);
    float hedge = 1.0 - smoothstep(2.0, 5.0 + dist * 0.004, edge);
    vec3 fields = mix(crop, vec3(0.03, 0.07, 0.015), hedge);
    float hillside = smoothstep(18.0, 60.0, vGround.y + 1.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, fields, fieldBand * (1.0 - hillside) * 0.9);
    // Fine mottling up close, so the ground isn't flat colour between the grass blades.
    float mottle = vnoise(vGround.xz * 1.7) * 0.6 + vnoise(vGround.xz * 7.3) * 0.4;
    diffuseColor.rgb *= mix(0.75 + 0.5 * mottle, 1.0, smoothstep(30.0, 80.0, dist));
}`);
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
}
