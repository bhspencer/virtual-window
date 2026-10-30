// Textures drawn at load time, so the app needs no image files.
import * as THREE from 'three';
import { seededRandom } from './random.js';

function canvasTexture(size, draw, { srgb = true, repeat = false } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(canvas);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
}

/** A cluster of leaves on transparency: the card a tree's crown is built from. */
export function leafClusterTexture(seed, hue) {
    const random = seededRandom(seed);
    return canvasTexture(256, (g, s) => {
        for (let i = 0; i < 170; i++) {
            const r = Math.sqrt(random()) * s * 0.44;
            const a = random() * Math.PI * 2;
            const x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r;
            const light = 22 + random() * 26 + (1 - r / (s * 0.44)) * 8;
            g.fillStyle = `hsl(${hue + random() * 18 - 9}, ${45 + random() * 20}%, ${light}%)`;
            g.save();
            g.translate(x, y);
            g.rotate(random() * Math.PI * 2);
            g.beginPath();
            g.ellipse(0, 0, 6 + random() * 6, 3 + random() * 3, 0, 0, Math.PI * 2);
            g.fill();
            g.restore();
        }
    });
}

/** Bark: vertical streaks and knots in browns and greys. */
export function barkTexture() {
    const random = seededRandom(77);
    return canvasTexture(128, (g, s) => {
        g.fillStyle = '#4a3b2c';
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < 260; i++) {
            const x = random() * s, w = 1 + random() * 3;
            g.fillStyle = `hsla(30, ${15 + random() * 15}%, ${16 + random() * 22}%, 0.7)`;
            g.fillRect(x, random() * s, w, 10 + random() * 50);
        }
    }, { repeat: true });
}

/** Weathered wood, for the fence: grain running along its length. */
export function woodTexture() {
    const random = seededRandom(99);
    return canvasTexture(128, (g, s) => {
        g.fillStyle = '#8a7559';
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < 90; i++) {
            const y = random() * s;
            g.strokeStyle = `hsla(32, 18%, ${32 + random() * 30}%, 0.5)`;
            g.lineWidth = 0.5 + random() * 1.5;
            g.beginPath();
            g.moveTo(0, y);
            g.bezierCurveTo(s * 0.3, y + random() * 4 - 2, s * 0.6, y + random() * 4 - 2, s, y);
            g.stroke();
        }
    }, { repeat: true });
}

/** A cloud: overlapping soft puffs, brightest on top, on transparency. */

/**
 * A cumulus cloud: a flat base and billowing top, built from overlapping soft puffs, lit from above
 * and shaded underneath, on transparency.
 */
export function cloudTexture(seed) {
    const random = seededRandom(seed);
    return canvasTexture(512, (g, s) => {
        const base = s * 0.7;
        for (let i = 0; i < 70; i++) {
            const x = s * (0.12 + random() * 0.76);
            const height = Math.sin(((x / s) - 0.1) / 0.8 * Math.PI);
            const r = s * (0.05 + random() * 0.09) * (0.6 + height * 0.6);
            const y = base - r * 0.6 - random() * height * s * 0.28;
            const gradient = g.createRadialGradient(x, y - r * 0.35, r * 0.1, x, y, r);
            gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
            gradient.addColorStop(0.55, 'rgba(236,239,245,0.75)');
            gradient.addColorStop(1, 'rgba(200,206,218,0)');
            g.fillStyle = gradient;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
        }
        // Shaded underneath, flat-bottomed, as cumulus are.
        const shade = g.createLinearGradient(0, base - s * 0.2, 0, base);
        shade.addColorStop(0, 'rgba(150,160,180,0)');
        shade.addColorStop(1, 'rgba(150,160,180,0.55)');
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = shade;
        g.fillRect(0, 0, s, s);
        g.globalCompositeOperation = 'destination-out';
        g.fillRect(0, base, s, s - base);
    });
}
