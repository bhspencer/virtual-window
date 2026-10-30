import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pictureRect, pageOnDisplay } from '../public/js/view-rect.js';

const display = { w: 0.30, h: 0.20, pxW: 1500, pxH: 1000 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('fullscreen: the pane is the whole display', () => {
    const r = pictureRect(display, { left: 0, top: 0, width: 1500, height: 1000 });
    near(r.cx, 0); near(r.cy, 0); near(r.w, 0.30); near(r.h, 0.20);
});

test('under the browser\'s toolbar: a shorter pane, lower than the display\'s centre', () => {
    const r = pictureRect(display, { left: 0, top: 100, width: 1500, height: 900 });
    near(r.w, 0.30); near(r.h, 0.18); near(r.cx, 0); near(r.cy, -0.01);
});

test('a guessed position never puts the pane off the display', () => {
    const r = pictureRect(display, { left: 1400, top: -50, width: 600, height: 500 });
    near(r.cx, 0.15 - 0.06); near(r.cy, 0.10 - 0.05);
});

test('the page is found under the browser window\'s top bar', () => {
    const win = { screen: { width: 1500, height: 1000 }, innerWidth: 1500, innerHeight: 880, outerWidth: 1500, outerHeight: 960, screenX: 0, screenY: 40, document: {} };
    assert.deepEqual(pageOnDisplay(win), { left: 0, top: 120, width: 1500, height: 880 });
});
