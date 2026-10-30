import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowFrustum, nearPlane } from '../public/js/window-projection.js';

const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} vs ${b}`);

test('centred in front of the window: a symmetric frustum through its edges', () => {
    const f = windowFrustum({ x: 0, y: 0, z: 0.6 }, 0.6, 0.34, 0.6);
    close(f.left, -0.3, 'left'); close(f.right, 0.3, 'right');
    close(f.bottom, -0.17, 'bottom'); close(f.top, 0.17, 'top');
});

test('moving right shifts the view to the left: more of the scene on the left side shows', () => {
    const f = windowFrustum({ x: 0.2, y: 0, z: 0.6 }, 0.6, 0.34, 0.6);
    close(f.left, -0.5, 'left reaches further');
    close(f.right, 0.1, 'right reaches less far');
});

test('moving up shows more of the ground; down shows more of the sky', () => {
    const up = windowFrustum({ x: 0, y: 0.1, z: 0.6 }, 0.6, 0.34, 0.6);
    assert.ok(up.bottom < -0.17 && up.top < 0.17, 'looking down through it from above');
});

test('stepping closer widens the view; stepping back narrows it', () => {
    const near = windowFrustum({ x: 0, y: 0, z: 0.3 }, 0.6, 0.34, 0.1);
    const far = windowFrustum({ x: 0, y: 0, z: 1.2 }, 0.6, 0.34, 0.1);
    assert.ok(near.right / 0.1 > far.right / 0.1, 'wider angle up close');
    close(near.right / 0.1, 0.3 / 0.3, 'the tangent of the half-angle is half-width over distance');
});

test('the frustum, scaled out to the pane, lands exactly on the pane edges wherever the eye is', () => {
    for (const eye of [{ x: 0.13, y: -0.07, z: 0.45 }, { x: -0.4, y: 0.3, z: 2.5 }]) {
        const near = nearPlane(eye);
        const f = windowFrustum(eye, 0.6, 0.34, near);
        const toPane = eye.z / near;
        close(eye.x + f.left * toPane, -0.3, 'left edge'); close(eye.x + f.right * toPane, 0.3, 'right edge');
        close(eye.y + f.bottom * toPane, -0.17, 'bottom edge'); close(eye.y + f.top * toPane, 0.17, 'top edge');
    }
});

test('the eye must be in front of the window', () => {
    assert.throws(() => windowFrustum({ x: 0, y: 0, z: 0 }, 0.6, 0.34, 0.1));
});
