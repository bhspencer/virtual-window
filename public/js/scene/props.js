// The things that make it a particular place: a post-and-rail fence across the garden, wildflowers
// in the meadow beyond it, and a farmhouse with a barn in the middle distance.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { seededRandom } from './random.js';
import { woodTexture } from './textures.js';

/** A post-and-rail fence along z, following the ground, posts every 2.4 m, slightly askew. */
export function createFence(z = -8.5, from = -45, to = 45) {
    const random = seededRandom(5);
    const parts = [];
    const spacing = 2.4;
    let previous = null;
    for (let x = from; x <= to; x += spacing) {
        const zz = z + Math.sin(x * 0.07) * 0.6;
        const y = groundHeight(x, zz);
        const post = new THREE.BoxGeometry(0.11, 1.25, 0.11);
        post.rotateZ((random() - 0.5) * 0.05);
        post.rotateY((random() - 0.5) * 0.3);
        post.translate(x, y + 0.55, zz);
        parts.push(post);
        if (previous) {
            for (const height of [0.45, 0.95]) {
                const a = new THREE.Vector3(previous.x, previous.y + height, previous.z), b = new THREE.Vector3(x, y + height, zz);
                const length = a.distanceTo(b);
                const rail = new THREE.BoxGeometry(length + 0.12, 0.09, 0.045);
                rail.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
                rail.rotateZ(Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)));
                rail.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2 + 0.07);
                parts.push(rail);
            }
        }
        previous = { x, y, z: zz };
    }
    const texture = woodTexture();
    const material = new THREE.MeshStandardMaterial({ map: texture, color: 0xb8ab98, roughness: 0.9 });
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'fence';
    return mesh;
}

/** Wildflowers through the meadow beyond the fence: dots of white, yellow and violet. */
export function createFlowers(density = 1) {
    const random = seededRandom(31);
    const count = Math.round(9000 * density);
    const geometry = new THREE.IcosahedronGeometry(0.035, 0);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const colors = [0xf4f1e6, 0xf4f1e6, 0xf2d43a, 0xe9c22b, 0x9b7fd1, 0xd8556b].map((c) => new THREE.Color(c));
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
        const d = 9.5 + Math.pow(random(), 1.5) * 70;
        const x = (random() * 2 - 1) * (10 + d * 1.6);
        // In drifts, as wildflowers grow.
        if (Math.sin(x * 0.21) + Math.sin(d * 0.17 + 2) < 0.3 && random() < 0.8) continue;
        const z = -d;
        matrix.makeTranslation(x, groundHeight(x, z) + 0.22 + random() * 0.15, z);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, colors[Math.floor(random() * colors.length)]);
    }
    mesh.name = 'flowers';
    return mesh;
}

function gabledBuilding(width, depth, wallHeight, roofHeight, wallColor, roofColor) {
    const walls = new THREE.BoxGeometry(width, wallHeight, depth);
    walls.translate(0, wallHeight / 2, 0);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-width / 2 - 0.4, 0);
    roofShape.lineTo(width / 2 + 0.4, 0);
    roofShape.lineTo(0, roofHeight);
    roofShape.closePath();
    const roof = new THREE.ExtrudeGeometry(roofShape, { depth: depth + 0.8, bevelEnabled: false });
    roof.translate(0, wallHeight, -depth / 2 - 0.4);
    const group = new THREE.Group();
    const wallMesh = new THREE.Mesh(walls, new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 }));
    const roofMesh = new THREE.Mesh(roof, new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 }));
    for (const m of [wallMesh, roofMesh]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
    return group;
}

/** A white farmhouse and a red barn, in the fields off to the left. */
export function createFarm() {
    const group = new THREE.Group();
    group.name = 'farm';
    const place = (building, x, z, turn) => {
        building.position.set(x, groundHeight(x, z) - 0.2, z);
        building.rotation.y = turn;
        group.add(building);
    };
    place(gabledBuilding(11, 8, 5.5, 3.5, 0xe8e4da, 0x4d4a48), -95, -230, 0.35);
    place(gabledBuilding(16, 10, 6, 5, 0x8c2f24, 0x5a5654), -118, -262, 0.25);
    return group;
}
