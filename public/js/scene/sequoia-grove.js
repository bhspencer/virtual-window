// A grove of giant sequoias, as in a Sierra Nevada forest in late afternoon: a few huge fluted red
// trunks close by, a crowd of firs and pines behind them whose crowns are mostly above the window,
// bright young leaves in the undergrowth, and mist lying low between the trees, lit from behind by
// the sun.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from './random.js';
import { leafClusterTexture } from './textures.js';

// --- Textures ---------------------------------------------------------------------------------------

function canvas(width, height, draw) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    draw(c.getContext('2d'), width, height);
    return c;
}

function texture(c, { srgb = true, repeat = true } = {}) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
}

/** A wavy vertical line from (x, y0) down `length`, drawn again either side so the texture tiles. */
function strand(g, w, h, x, y0, length, wobble, phase) {
    for (const dx of [-w, 0, w]) {
        for (const dy of [-h, 0, h]) {
            g.beginPath();
            for (let y = 0; y <= length; y += 8) {
                const px = x + dx + Math.sin((y0 + y) * 0.013 + phase) * wobble + Math.sin((y0 + y) * 0.051 + phase * 2) * wobble * 0.3;
                if (y === 0) g.moveTo(px, y0 + dy + y);
                else g.lineTo(px, y0 + dy + y);
            }
            g.stroke();
        }
    }
}

/**
 * Sequoia bark: long fibrous ridges in cinnamon and rust, split by deep dark furrows, with a little
 * lime-green lichen. Returns the colour and a matching bump map (ridges high, furrows low).
 */
function sequoiaBark() {
    const w = 512, h = 1024;
    const strokes = [];
    const random = seededRandom(1907);
    for (let i = 0; i < 700; i++) {
        strokes.push({
            x: random() * w, y: random() * h, length: 150 + random() * 800, width: 2 + random() * 9,
            wobble: 3 + random() * 9, phase: random() * 10,
            hue: 10 + random() * 14, sat: 38 + random() * 22, light: 28 + random() * 26, height: 0.55 + random() * 0.45
        });
    }
    const furrows = [];
    for (let i = 0; i < 38; i++) {
        furrows.push({ x: random() * w, y: random() * h, length: 300 + random() * 900, width: 3 + random() * 7, wobble: 4 + random() * 10, phase: random() * 10, light: 6 + random() * 8 });
    }
    const lichen = [];
    for (let i = 0; i < 90; i++) lichen.push({ x: random() * w, y: random() * h, r: 0.8 + random() * 2.2 });

    const draw = (g, colour) => {
        g.fillStyle = colour ? 'hsl(16, 48%, 32%)' : '#555';
        g.fillRect(0, 0, w, h);
        g.lineCap = 'round';
        for (const s of strokes) {
            g.lineWidth = s.width;
            g.strokeStyle = colour ? `hsla(${s.hue}, ${s.sat}%, ${s.light}%, 0.75)` : `rgba(${255 * s.height | 0}, ${255 * s.height | 0}, ${255 * s.height | 0}, 0.7)`;
            strand(g, w, h, s.x, s.y, s.length, s.wobble, s.phase);
        }
        for (const f of furrows) {
            g.lineWidth = f.width;
            g.strokeStyle = colour ? `hsla(12, 40%, ${f.light}%, 0.9)` : 'rgba(0, 0, 0, 0.95)';
            strand(g, w, h, f.x, f.y, f.length, f.wobble, f.phase);
        }
        if (colour) {
            for (const l of lichen) {
                g.fillStyle = 'hsla(80, 60%, 45%, 0.8)';
                g.beginPath();
                g.ellipse(l.x, l.y, l.r, l.r * 2.5, 0, 0, Math.PI * 2);
                g.fill();
            }
        }
    };
    return {
        map: texture(canvas(w, h, (g) => draw(g, true))),
        bump: texture(canvas(w, h, (g) => draw(g, false)), { srgb: false })
    };
}

/** Fir and pine bark: dark grey-brown plates. */
function firBark() {
    const random = seededRandom(311);
    return texture(canvas(128, 256, (g, w, h) => {
        g.fillStyle = 'hsl(25, 14%, 30%)';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 260; i++) {
            g.fillStyle = `hsla(${20 + random() * 15}, ${8 + random() * 14}%, ${16 + random() * 28}%, 0.8)`;
            g.fillRect(random() * w, random() * h, 3 + random() * 10, 6 + random() * 24);
        }
    }));
}

/** A spray of needles along a twig, on transparency: what a conifer's branches are made of. */
function needleSpray(seed) {
    const random = seededRandom(seed);
    return texture(canvas(256, 128, (g, w, h) => {
        g.lineCap = 'round';
        for (let twig = 0; twig < 5; twig++) {
            const y0 = h / 2 + (twig - 2) * 14 * random();
            const x0 = twig === 0 ? 0 : random() * w * 0.5;
            const angle = twig === 0 ? 0 : (random() - 0.5) * 0.9;
            const length = twig === 0 ? w : w * (0.3 + random() * 0.4);
            for (let s = 0; s < length; s += 2.2) {
                const x = x0 + Math.cos(angle) * s, y = y0 + Math.sin(angle) * s;
                const reach = (1 - (x / w) * 0.6) * (h * 0.3) * (0.6 + random() * 0.4) * (twig === 0 ? 1 : 0.6);
                for (const side of [-1, 1]) {
                    g.strokeStyle = `hsl(${128 + random() * 25}, ${30 + random() * 25}%, ${12 + random() * 20}%)`;
                    g.lineWidth = 1.2 + random();
                    g.beginPath();
                    g.moveTo(x, y);
                    g.lineTo(x + reach * 0.45, y + side * reach * (0.7 + random() * 0.3));
                    g.stroke();
                }
            }
        }
    }), { repeat: false });
}

/** The forest floor: needles, cones and fallen bark on dark earth, with patches of green. */
function forestFloor() {
    const random = seededRandom(52);
    return texture(canvas(512, 512, (g, s) => {
        g.fillStyle = 'hsl(28, 26%, 16%)';
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < 30; i++) {
            const x = random() * s, y = random() * s, r = 20 + random() * 60;
            const gradient = g.createRadialGradient(x, y, 0, x, y, r);
            const green = random() < 0.4;
            gradient.addColorStop(0, green ? 'hsla(90, 35%, 22%, 0.55)' : 'hsla(25, 30%, 26%, 0.5)');
            gradient.addColorStop(1, 'hsla(25, 30%, 20%, 0)');
            g.fillStyle = gradient;
            g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        g.lineCap = 'round';
        for (let i = 0; i < 5000; i++) {
            const x = random() * s, y = random() * s, a = random() * Math.PI, l = 4 + random() * 12;
            g.strokeStyle = `hsla(${22 + random() * 20}, ${25 + random() * 30}%, ${14 + random() * 34}%, 0.8)`;
            g.lineWidth = 0.6 + random() * 1.2;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
            g.stroke();
        }
    }));
}

/** A soft blob of mist. */
function mistTexture() {
    return texture(canvas(256, 128, (g, w, h) => {
        const random = seededRandom(5);
        for (let i = 0; i < 14; i++) {
            const x = w * (0.2 + random() * 0.6), y = h * (0.45 + random() * 0.2), r = h * (0.25 + random() * 0.25);
            const gradient = g.createRadialGradient(x, y, 0, x, y, r);
            gradient.addColorStop(0, 'rgba(255,255,255,0.22)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gradient;
            g.fillRect(0, 0, w, h);
        }
    }), { repeat: false });
}

// --- Trees ------------------------------------------------------------------------------------------

/**
 * A sequoia's trunk: flared and buttressed at the foot, deeply fluted all the way up, tapering slowly.
 * Its base is at y = 0. The bark texture's tile is `tile` metres across and twice that high.
 */
function sequoiaTrunk(random, radius, height, tile = 1.1) {
    const radial = 56, rows = 70;
    const around = Math.max(1, Math.round(2 * Math.PI * radius / tile));
    const lobes = [5 + Math.floor(random() * 3), 11 + Math.floor(random() * 4), 23];
    const phases = lobes.map(() => random() * Math.PI * 2);
    const positions = [], uvs = [], indices = [];
    for (let j = 0; j <= rows; j++) {
        const y = -0.5 + height * Math.pow(j / rows, 1.7);
        const flare = 1 + 0.6 * Math.exp(-y / 1.6);
        const r0 = radius * flare * (1 - 0.5 * y / height);
        for (let i = 0; i <= radial; i++) {
            const a = (i / radial) * Math.PI * 2;
            const buttress = 0.13 * Math.exp(-Math.max(0, y) / 2.2) * Math.max(0, Math.sin(lobes[0] * a + phases[0]));
            const flutes = 1 + 0.045 * Math.sin(lobes[1] * a + phases[1] + y * 0.04) + 0.025 * Math.sin(lobes[2] * a + phases[2] - y * 0.03);
            const r = r0 * (flutes + buttress);
            positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
            uvs.push((i / radial) * around, y / (tile * 2));
        }
    }
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < radial; i++) {
            const a = j * (radial + 1) + i, b = a + radial + 1;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/** A tapered trunk, base at y = 0. */
function trunk(r0, r1, height) {
    const geometry = new THREE.CylinderGeometry(r1, r0, height, 9, 6, true);
    geometry.translate(0, height / 2 - 0.3, 0);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * height / 2.5);
    return geometry;
}

/**
 * A conifer's branches: tiers of needle sprays radiating from the trunk and drooping, wide at the
 * bottom of the crown and narrowing to the top. From `start` up to `height`, `spread` metres at
 * the widest.
 */
function coniferBranches(random, start, height, spread, tierGap) {
    const cards = [];
    for (let y = start; y < height; y += tierGap * (0.8 + random() * 0.4)) {
        const along = (y - start) / (height - start);
        const length = spread * Math.pow(1 - along, 0.9) * (0.75 + random() * 0.5) + 0.3;
        const count = Math.max(3, Math.round(4 + length * 1.6));
        const turn = random() * Math.PI * 2;
        for (let k = 0; k < count; k++) {
            const a = turn + (k / count) * Math.PI * 2 + (random() - 0.5) * 0.5;
            const card = new THREE.PlaneGeometry(length, length * 0.5);
            card.translate(length / 2, 0, 0);
            card.rotateX(-Math.PI / 2 + (random() - 0.5) * 0.5);
            card.rotateZ(-0.25 - random() * 0.35);
            card.rotateY(-a);
            card.translate(0, y, 0);
            // Lit as part of a cone, not as flat cards.
            const normals = card.getAttribute('normal');
            const out = new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)).normalize();
            for (let n = 0; n < normals.count; n++) normals.setXYZ(n, out.x, out.y, out.z);
            cards.push(card);
        }
    }
    return mergeGeometries(cards);
}

/** Leaf cards in a dome: a young broadleaf shrub (dogwood, hazel) of the undergrowth, 1 m high. */
function shrub(random) {
    const cards = [];
    for (let i = 0; i < 40; i++) {
        const u = random(), a = random() * Math.PI * 2, r = Math.sqrt(random());
        const at = new THREE.Vector3(Math.cos(a) * r * 0.6, 0.1 + u * 0.7, Math.sin(a) * r * 0.6);
        const size = 0.22 + random() * 0.16;
        const card = new THREE.PlaneGeometry(size, size);
        card.rotateX(random() * Math.PI);
        card.rotateY(random() * Math.PI * 2);
        card.translate(at.x, at.y, at.z);
        const normals = card.getAttribute('normal');
        const out = new THREE.Vector3(at.x, at.y * 0.6 + 0.4, at.z).normalize();
        for (let n = 0; n < normals.count; n++) normals.setXYZ(n, out.x, out.y, out.z);
        cards.push(card);
    }
    return mergeGeometries(cards);
}

/** Instances of one geometry at the given matrices. */
function instanced(geometry, material, matrices, { cast = true, receive = true } = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    return mesh;
}

const place = (x, y, z, scale = 1, turn = 0, sy = scale) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(scale, sy, scale));

// --- The grove --------------------------------------------------------------------------------------

/**
 * The giant sequoias, as the photograph has them: one huge trunk just right of centre, one at the
 * right edge, a pair on the left, and more further back. [x, z, radius] in metres; the window looks
 * down -z.
 */
const SEQUOIAS = [
    [0.6, -13, 1.35], [6.4, -11, 1.25], [-5.6, -15, 1.0], [-3.0, -27, 0.95],
    [-1.2, -44, 1.2], [9, -40, 1.1], [-12, -36, 1.3], [16, -24, 1.2], [3.5, -70, 1.4], [-20, -60, 1.3]
];

export function createSequoiaGrove(quality) {
    const density = { low: 0.35, medium: 0.65, high: 1 }[quality] ?? 0.65;
    const random = seededRandom(1890);
    const group = new THREE.Group();
    group.name = 'sequoia grove';

    // The ground: gently uneven, littered.
    const floorTexture = forestFloor();
    floorTexture.repeat.set(90, 90);
    const ground = new THREE.PlaneGeometry(400, 400, 160, 160);
    ground.rotateX(-Math.PI / 2);
    const gp = ground.getAttribute('position');
    for (let i = 0; i < gp.count; i++) {
        const x = gp.getX(i), z = gp.getZ(i);
        gp.setY(i, 0.25 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.4 * Math.sin(x * 0.05 + z * 0.07));
    }
    ground.computeVertexNormals();
    const floor = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 1 }));
    floor.receiveShadow = true;
    group.add(floor);

    // The sequoias, each its own shape.
    const bark = sequoiaBark();
    const sequoiaMaterial = new THREE.MeshStandardMaterial({ map: bark.map, bumpMap: bark.bump, bumpScale: 6, roughness: 0.95, color: 0xffffff });
    const sprayA = needleSpray(17), sprayB = needleSpray(23);
    const foliage = (map, tint) => new THREE.MeshStandardMaterial({ map, color: tint, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
    const sequoiaFoliage = foliage(sprayB, 0xb8d0a0);
    for (const [x, z, radius] of SEQUOIAS) {
        const height = 70 + random() * 15;
        const mesh = new THREE.Mesh(sequoiaTrunk(random, radius, height), sequoiaMaterial);
        mesh.position.set(x, 0, z);
        mesh.rotation.y = random() * Math.PI * 2;
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        const crown = new THREE.Mesh(coniferBranches(random, height * 0.55, height, 7, 1.4), sequoiaFoliage);
        crown.position.copy(mesh.position);
        crown.castShadow = true;
        group.add(crown);
    }
    const clear = (x, z, gap) => SEQUOIAS.every(([sx, sz, r]) => Math.hypot(x - sx, z - sz) > r * 1.8 + gap);

    // Tall firs and pines: straight dark trunks, crowns high above. Three shapes, instanced.
    const firMaterial = new THREE.MeshStandardMaterial({ map: firBark(), roughness: 1 });
    const firFoliage = foliage(sprayA, 0x9fb894);
    const tallShapes = [0, 1, 2].map(() => {
        const height = 38 + random() * 12;
        return { trunk: trunk(0.42, 0.06, height), branches: coniferBranches(random, height * (0.4 + random() * 0.15), height, 3.2, 1.0), matrices: [] };
    });
    // Young firs, branched almost to the ground, in the gaps.
    const youngShapes = [0, 1].map(() => {
        const height = 9 + random() * 5;
        return { trunk: trunk(0.14, 0.02, height), branches: coniferBranches(random, 0.6, height, 2.6, 0.45), matrices: [] };
    });
    const tallCount = Math.round(520 * density), youngCount = Math.round(110 * density);
    for (let n = 0, tries = 0; n < tallCount && tries < tallCount * 20; tries++) {
        const x = (random() - 0.5) * 260, z = -4 - Math.pow(random(), 0.8) * 190;
        // Few right in front: the near view is the sequoias'.
        if (z > -9 && Math.abs(x) < 8) continue;
        if (!clear(x, z, 1)) continue;
        const s = 0.6 + random() * 0.8;
        tallShapes[n % 3].matrices.push(place(x, 0, z, s, random() * Math.PI * 2, 0.8 + random() * 0.4));
        n++;
    }
    for (let n = 0, tries = 0; n < youngCount && tries < youngCount * 20; tries++) {
        const x = (random() - 0.5) * 120, z = -12 - random() * 75;
        if ((z > -22 && Math.abs(x) < 4) || !clear(x, z, 2)) continue;
        youngShapes[n % 2].matrices.push(place(x, 0, z, 0.6 + random() * 0.7, random() * Math.PI * 2));
        n++;
    }
    // Only one tall shape's crowns cast shadows: a canopy that blocked the sun everywhere would leave
    // the grove in shade, where a real one lets it through in gaps, dappled.
    [...tallShapes, ...youngShapes].forEach((shape, i) => {
        group.add(instanced(shape.trunk, firMaterial, shape.matrices));
        group.add(instanced(shape.branches, firFoliage, shape.matrices, { cast: i === 0 || i >= tallShapes.length }));
    });

    // The undergrowth: bright young leaves in drifts, thick on the left and in sunny gaps.
    const leafMaterial = new THREE.MeshStandardMaterial({ map: leafClusterTexture(61, 92), color: 0xf0ffb0, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
    const shrubs = [shrub(random), shrub(random), shrub(random)];
    const shrubMatrices = [[], [], []];
    const drift = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.25 + 1.3) * Math.cos(z * 0.2) + (x < -1 ? 0.35 : 0);
    const shrubCount = Math.round(1100 * density);
    for (let n = 0, tries = 0; n < shrubCount && tries < shrubCount * 10; tries++) {
        const x = (random() - 0.5) * 70, z = -5 - Math.pow(random(), 1.3) * 65;
        if (random() > drift(x, z) || !clear(x, z, 0.3)) continue;
        const s = 0.5 + random() * 0.9;
        shrubMatrices[n % 3].push(place(x, -0.1, z, s, random() * Math.PI * 2, s * (0.7 + random() * 0.6)));
        n++;
    }
    shrubs.forEach((geometry, i) => group.add(instanced(geometry, leafMaterial, shrubMatrices[i], { cast: false })));

    // Mist lying low between the trees, drifting slowly.
    const mistMap = mistTexture();
    const mist = [];
    for (let i = 0; i < Math.round(60 * density) + 10; i++) {
        const material = new THREE.SpriteMaterial({ map: mistMap, color: 0xdfe8ef, transparent: true, depthWrite: false, opacity: 0.3 + random() * 0.4 });
        const sprite = new THREE.Sprite(material);
        const width = 6 + random() * 12;
        sprite.scale.set(width, width * (0.25 + random() * 0.15), 1);
        sprite.position.set((random() - 0.5) * 60, 0.6 + random() * 1.4, -8 - random() * 55);
        sprite.userData = { x: sprite.position.x, speed: 0.04 + random() * 0.08, phase: random() * 100, opacity: material.opacity };
        group.add(sprite);
        mist.push(sprite);
    }

    return {
        group,
        /** How this scene wants the air and light: thick with the haze of a forest, shaded by the canopy. */
        look: { facing: 335, fogDensity: 0.009, skyLight: 0.35, environment: 0.45, exposure: 1.8, sunTarget: new THREE.Vector3(0, -1.5, -20) },
        setWindowHeight(height) {
            group.position.y = -height;
        },
        update(t) {
            for (const sprite of mist) {
                const u = sprite.userData;
                sprite.position.x = u.x + Math.sin(t * u.speed + u.phase) * 3;
                sprite.material.opacity = u.opacity * (0.75 + 0.25 * Math.sin(t * 0.07 + u.phase));
            }
        }
    };
}
