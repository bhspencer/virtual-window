import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eyePoint, calibrateHfov, OneEuroFilter } from '../public/js/eye-position.js';

const close = (a, b, tol, label) => assert.ok(Math.abs(a - b) < tol, `${label}: ${a} vs ${b}`);
const W = 1280, H = 720, HFOV = 60, IPD = 0.063;
const f = (W / 2) / Math.tan(HFOV / 2 * Math.PI / 180);
const camera = { hfovDeg: HFOV, ipd: IPD, position: { x: 0, y: 0.2, z: 0 }, pitchDeg: 0, mirrored: false };

/** The eye centres a camera at the origin would see for an eye point at (x, y, z) in its own frame. */
function seen(x, y, z, mirrored = false) {
    const half = IPD / 2;
    const toU = (px) => (W / 2 + (mirrored ? 1 : -1) * px * f / z) / W;
    const toV = (py) => (H / 2 - py * f / z) / H;
    // The viewer's right eye is at their -x... as the viewer faces the screen, their right is the screen's +x.
    return { right: { x: toU(x + half), y: toV(y) }, left: { x: toU(x - half), y: toV(y) }, width: W, height: H };
}

test('straight ahead of the camera at 60 cm: found there, relative to where the camera is', () => {
    const p = eyePoint(seen(0, 0, 0.6), camera);
    close(p.x, 0, 1e-9, 'x'); close(p.y, 0.2, 1e-9, 'y'); close(p.z, 0.6, 1e-9, 'z');
});

test('off to one side, below, and further away: each comes back as it was', () => {
    const p = eyePoint(seen(0.15, -0.25, 1.1), camera);
    close(p.x, 0.15, 1e-9, 'x, the viewer\'s right'); close(p.y, 0.2 - 0.25, 1e-9, 'y'); close(p.z, 1.1, 1e-9, 'z');
});

test('a mirrored camera feed: still the viewer\'s right', () => {
    const p = eyePoint(seen(0.15, 0, 0.8, true), { ...camera, mirrored: true });
    close(p.x, 0.15, 1e-9, 'x');
});

test('a camera tilted down: what it sees straight ahead is lower and nearer than its axis', () => {
    const p = eyePoint(seen(0, 0, 0.6), { ...camera, pitchDeg: 10 });
    close(p.y, 0.2 - 0.6 * Math.sin(10 * Math.PI / 180), 1e-9, 'y');
    close(p.z, 0.6 * Math.cos(10 * Math.PI / 180), 1e-9, 'z');
});

test('a turned head: its eyes look closer together, which the face\'s orientation undoes', () => {
    const face = seen(0, 0, 0.6);
    const yaw = 30 * Math.PI / 180;
    // Turned 30 degrees: the eyes appear cos(30) as far apart.
    const mid = (face.left.x + face.right.x) / 2;
    const squeezed = { ...face, left: { ...face.left, x: mid + (face.left.x - mid) * Math.cos(yaw) }, right: { ...face.right, x: mid + (face.right.x - mid) * Math.cos(yaw) } };
    const matrix = [Math.cos(yaw), 0, -Math.sin(yaw), 0, 0, 1, 0, 0, Math.sin(yaw), 0, Math.cos(yaw), 0, 0, 0, 0, 1];
    close(eyePoint(squeezed, camera).z, 0.6 / Math.cos(yaw), 1e-9, 'without the matrix: thought further away');
    close(eyePoint({ ...squeezed, matrix }, camera).z, 0.6, 1e-9, 'with it: right');
});

test('calibrating the field of view from a measured distance finds the camera\'s', () => {
    close(calibrateHfov(seen(0, 0, 0.75), IPD, 0.75), HFOV, 1e-9, 'hfov');
});

test('the One Euro filter: steady at rest, follows a step, and passes the first value through', () => {
    const filter = new OneEuroFilter(1.0, 0.5);
    assert.equal(filter.filter(5, 0), 5);
    let v;
    for (let i = 1; i <= 120; i++) v = filter.filter(5 + (i % 2 ? 0.01 : -0.01), i / 60);
    close(v, 5, 0.005, 'jitter of 1 cm smoothed to well under that');
    for (let i = 121; i <= 300; i++) v = filter.filter(6, i / 60);
    close(v, 6, 0.01, 'reaches a new position');
});

import { eyeSpacingInIrises, IRIS_DIAMETER, median, knownWebcam, hfovFromDiagonal } from '../public/js/eye-position.js';

test('the irises as a ruler: eye spacing measured in iris widths, the same at any distance', () => {
    /** Landmarks for eyes `spacing` apart, irises IRIS_DIAMETER wide, at distance z. */
    const landmarks = (spacing, z) => {
        const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
        const at = (x) => 0.5 + x * f / z / W;
        for (const [side, sign] of [['right', 1], ['left', -1]]) {
            const cx = sign * spacing / 2;
            const corners = side === 'right' ? [33, 133] : [362, 263];
            points[corners[0]] = { x: at(cx - 0.012), y: 0.5 }; points[corners[1]] = { x: at(cx + 0.012), y: 0.5 };
            const iris = side === 'right' ? [469, 471] : [474, 476];
            points[iris[0]] = { x: at(cx + IRIS_DIAMETER / 2), y: 0.5 }; points[iris[1]] = { x: at(cx - IRIS_DIAMETER / 2), y: 0.5 };
        }
        return points;
    };
    for (const z of [0.4, 0.9, 2.0]) close(eyeSpacingInIrises(landmarks(0.061, z), W, H) * IRIS_DIAMETER, 0.061, 1e-9, `at ${z} m`);
    assert.equal(eyeSpacingInIrises(new Array(468).fill({ x: 0.5, y: 0.5 }), W, H), null, 'no iris landmarks');
});

test('median', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('known webcams by the name the browser reports, and their horizontal field of view', () => {
    assert.deepEqual(knownWebcam('HD Pro Webcam C920 (046d:082d)'), { model: 'c920', diagonalDeg: 78 });
    assert.equal(knownWebcam('Integrated Camera'), null);
    close(hfovFromDiagonal(78, 16 / 9), 70.42, 0.05, 'C920 at 16:9: its quoted 70.42 degrees');
    assert.ok(hfovFromDiagonal(78, 4 / 3) < hfovFromDiagonal(78, 16 / 9), '4:3 is cropped from the sides');
});

test('a blink: the distance from just before it is held until the eyes have reopened', async () => {
    const { BlinkGuard } = await import('../public/js/eye-position.js');
    const guard = new BlinkGuard();
    const frames = [];
    // Steady at 60 cm, eyes open; then a 150 ms blink during which the measured distance jumps.
    for (let i = 0; i < 30; i++) frames.push([0.3, 0.6]);
    frames.push([0.25, 0.58], [0.1, 0.52], [0.05, 0.5], [0.1, 0.53], [0.25, 0.58], [0.3, 0.6], [0.3, 0.6], [0.3, 0.6], [0.3, 0.6], [0.3, 0.6], [0.3, 0.6]);
    const out = frames.map(([open, d], i) => guard.distance(open, d, i / 30));
    // The first frame, lids barely moving, is within the usual variation and passes through.
    for (const d of out.slice(31, 37)) assert.equal(d, 0.6);
    assert.equal(out.at(-1), 0.6);
    // A squint that lasts: taken as the new usual, and followed again.
    const later = [];
    for (let i = 0; i < 40; i++) later.push(guard.distance(0.15, 0.7, 2 + i / 30));
    assert.equal(later.at(-1), 0.7);
});
