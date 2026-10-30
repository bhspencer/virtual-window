// Trees: broadleaf ones (an oak-like shape: a trunk, a few limbs, a rounded crown of leaf clusters)
// and conifers, each kind built once and instanced across the landscape.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { seededRandom } from './random.js';
import { barkTexture, leafClusterTexture } from './textures.js';

/** A tapered cylinder from a to b, as a limb. */
function limb(a, b, r0, r1) {
    const direction = new THREE.Vector3().subVectors(b, a);
    const geometry = new THREE.CylinderGeometry(r1, r0, direction.length(), 7, 1, true);
    geometry.translate(0, direction.length() / 2, 0);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    geometry.translate(a.x, a.y, a.z);
    return geometry;
}

/**
 * Leaf cards scattered through an ellipsoid crown, each facing a random way, with normals pointing
 * out from the crown's centre so the crown is lit as a rounded mass rather than as flat cards.
 */
function crown(random, center, radii, cards, cardSize) {
    const geometries = [];
    for (let i = 0; i < cards; i++) {
        const u = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.cbrt(random()) * 0.9 + 0.1;
        const dir = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a));
        const at = new THREE.Vector3(dir.x * radii.x * r, dir.y * radii.y * r, dir.z * radii.z * r).add(center);
        const size = cardSize * (0.7 + random() * 0.6);
        const card = new THREE.PlaneGeometry(size, size);
        card.rotateX(random() * Math.PI);
        card.rotateY(random() * Math.PI * 2);
        card.translate(at.x, at.y, at.z);
        const normals = card.getAttribute('normal');
        const outward = dir.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, 0.3, 0)).normalize();
        for (let n = 0; n < normals.count; n++) normals.setXYZ(n, outward.x, outward.y, outward.z);
        geometries.push(card);
    }
    return mergeGeometries(geometries);
}

function broadleaf(seed) {
    const random = seededRandom(seed);
    const wood = [limb(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, 3.2, 0), 0.38, 0.26)];
    const leaves = [];
    const limbs = 5;
    for (let i = 0; i < limbs; i++) {
        const a = (i / limbs) * Math.PI * 2 + random() * 0.8;
        const start = new THREE.Vector3(0, 2.6 + random() * 0.8, 0);
        const end = new THREE.Vector3(Math.cos(a) * (2 + random() * 1.5), 5 + random() * 2.5, Math.sin(a) * (2 + random() * 1.5));
        wood.push(limb(start, end, 0.2, 0.09));
        leaves.push(crown(random, end, new THREE.Vector3(2.6, 2.0, 2.6), 26, 2.1));
    }
    leaves.push(crown(random, new THREE.Vector3(0, 7.2, 0), new THREE.Vector3(3.2, 2.4, 3.2), 40, 2.3));
    return { wood: mergeGeometries(wood), leaves: mergeGeometries(leaves) };
}

function conifer(seed) {
    const random = seededRandom(seed);
    const wood = limb(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, 9, 0), 0.22, 0.05);
    const tiers = [];
    for (let i = 0; i < 7; i++) {
        const t = i / 7;
        const radius = 2.4 * (1 - t) + 0.3;
        const tier = new THREE.ConeGeometry(radius, 2.6, 9, 1, true);
        tier.translate(0, 2.2 + t * 7.2, 0);
        tier.rotateY(random() * Math.PI);
        tiers.push(tier);
    }
    return { wood, leaves: mergeGeometries(tiers) };
}

/** Places instances of one kind of tree; `spots` are {x, z, scale, turn}. */
function plant(kind, spots, materials) {
    const group = new THREE.Group();
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3();
    for (const [part, material] of [['wood', materials.wood], ['leaves', materials.leaves]]) {
        const mesh = new THREE.InstancedMesh(kind[part], material, spots.length);
        spots.forEach((s, i) => {
            position.set(s.x, groundHeight(s.x, s.z), s.z);
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.turn);
            scale.setScalar(s.scale);
            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(i, matrix);
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
    }
    return group;
}

/** All the trees: a couple of big ones near the window, more across the fields, forest on the hills. */
export function createTrees(density = 1) {
    const random = seededRandom(7);
    const bark = barkTexture();
    bark.repeat.set(2, 3);
    const wood = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 });
    const leafMaterial = (seed, hue) => new THREE.MeshStandardMaterial({
        map: leafClusterTexture(seed, hue), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8
    });
    const oakLeaves = [leafMaterial(11, 95), leafMaterial(12, 82)];
    const pineLeaves = new THREE.MeshStandardMaterial({ color: 0x1d3a1f, roughness: 0.9, flatShading: true });
    const group = new THREE.Group();
    group.name = 'trees';

    // Near: a big tree off to each side, framing the view.
    const near = [{ x: -9, z: -17, scale: 1.25, turn: 0.4 }, { x: 13, z: -31, scale: 1.05, turn: 2.2 }, { x: -24, z: -48, scale: 0.95, turn: 1.1 }];
    // Fields: scattered, and along hedgerow lines, thinning with distance.
    const fields = [[], []];
    const count = Math.round(260 * density);
    for (let i = 0; i < count; i++) {
        const d = 60 + Math.pow(random(), 1.6) * 1700;
        const x = (random() * 2 - 1) * (40 + d * 1.8);
        if (Math.abs(x) < 25 && d < 150) continue;
        fields[i % 2].push({ x, z: -d, scale: 0.7 + random() * 0.6, turn: random() * Math.PI * 2 });
    }
    // Hills: conifer woods, in patches.
    const forest = [];
    const pines = Math.round(2600 * density);
    for (let i = 0; i < pines; i++) {
        const d = 700 + Math.pow(random(), 0.8) * 3600;
        const x = (random() * 2 - 1) * (100 + d * 1.6);
        const patch = Math.sin(x / 420) + Math.sin(-d / 330 + 1.3);
        if (patch < 0.2) continue;
        forest.push({ x, z: -d, scale: 1.1 + random() * 0.9, turn: random() * Math.PI * 2 });
    }

    const oaks = [broadleaf(101), broadleaf(202)];
    group.add(plant(oaks[0], [near[0], near[2], ...fields[0]], { wood, leaves: oakLeaves[0] }));
    group.add(plant(oaks[1], [near[1], ...fields[1]], { wood, leaves: oakLeaves[1] }));
    const pine = plant(conifer(303), forest, { wood, leaves: pineLeaves });
    pine.children.forEach((m) => { m.castShadow = false; });
    group.add(pine);
    return group;
}
