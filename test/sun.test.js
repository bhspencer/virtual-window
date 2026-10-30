import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solarPosition, sunDirection } from '../public/js/sun.js';

const close = (a, b, tol, label) => assert.ok(Math.abs(a - b) < tol, `${label}: ${a} vs ${b}`);

test('the summer solstice at noon in Reston: high in the south', () => {
    // Solar noon in Reston (77.36 W) is about 17:12 UTC in late June.
    const p = solarPosition(new Date('2026-06-21T17:12:00Z'), 38.96, -77.36);
    close(p.elevation, 90 - 38.96 + 23.44, 0.6, 'elevation, 90 - latitude + tilt');
    close(p.azimuth, 180, 2, 'due south');
});

test('the equinox: rises in the east, sets in the west', () => {
    const morning = solarPosition(new Date('2026-03-20T11:30:00Z'), 38.96, -77.36);
    const evening = solarPosition(new Date('2026-03-20T23:10:00Z'), 38.96, -77.36);
    close(morning.azimuth, 90, 6, 'rising, east'); close(morning.elevation, 0, 5, 'near the horizon');
    close(evening.azimuth, 270, 6, 'setting, west'); close(evening.elevation, 0, 5, 'near the horizon');
});

test('through a south-facing window: the noon sun is straight out; an east sun is to the left', () => {
    const noon = sunDirection({ elevation: 30, azimuth: 180 }, 180);
    close(noon.x, 0, 1e-9, 'x'); assert.ok(noon.z < 0, 'out of the window');
    const east = sunDirection({ elevation: 0, azimuth: 90 }, 180);
    close(east.x, -1, 1e-9, 'east is to the left, looking south');
});
