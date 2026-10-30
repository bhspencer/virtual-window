// The virtual window: renders the countryside as seen through the screen from wherever the viewer's
// eyes are, tracked by the webcam (or, with no camera, steered by the mouse).
import * as THREE from 'three';
import { Settings, SETTINGS } from './settings.js';
import { applyWindowProjection } from './window-projection.js';
import { HeadTracker } from './head-tracker.js';
import { calibrateHfov } from './eye-position.js';
import { solarPosition, sunDirection } from './sun.js';
import { Atmosphere } from './scene/atmosphere.js';
import { createCountryside } from './scene/countryside.js';
import { createWindowFrame } from './scene/window-frame.js';

const settings = new Settings();
const $ = (id) => document.getElementById(id);

// --- The renderer and the scene -------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = settings.get('shadows');
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
// Its projection is set every frame by applyWindowProjection; never call updateProjectionMatrix().
const camera = new THREE.PerspectiveCamera();
const atmosphere = new Atmosphere(scene, renderer);
const countryside = createCountryside(settings.get('quality'));
countryside.setWindowHeight(settings.get('windowHeight'));
scene.add(countryside.group);
let windowFrame = null;

function rebuildFrame() {
    if (windowFrame) scene.remove(windowFrame);
    const { w, h } = settings.screen();
    windowFrame = createWindowFrame(settings.get('frame'), w, h);
    scene.add(windowFrame);
}
rebuildFrame();

function placeSun() {
    let date = new Date();
    if (!settings.get('clock')) {
        date = new Date();
        const hour = settings.get('hour');
        date.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    }
    const position = solarPosition(date, settings.get('latitude'), settings.get('longitude'));
    atmosphere.setSun(sunDirection(position, settings.get('facing')));
}
placeSun();
setInterval(placeSun, 20000);

window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight, false));

// --- Saying what's wrong, rather than showing black ---------------------------------------------------

let noticeTimer = null;
function notice(text, { lasting = false } = {}) {
    const el = $('notice');
    el.textContent = text;
    el.hidden = !text;
    clearTimeout(noticeTimer);
    if (text && !lasting) noticeTimer = setTimeout(() => { el.hidden = true; }, 12000);
}
// A graphics card under strain can make the browser drop the scene's context: say so, and let three.js
// bring it back.
renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    notice('The graphics card dropped the 3D view. Recovering… If this keeps happening, lower Detail in the settings.', { lasting: true });
});
renderer.domElement.addEventListener('webglcontextrestored', () => notice(''));
window.addEventListener('error', (e) => notice(`Something went wrong: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => notice(`Something went wrong: ${e.reason?.message ?? e.reason}`));

// --- Where the eye is -----------------------------------------------------------------------------

const tracker = new HeadTracker(settings);
const resting = () => ({ x: 0, y: 0, z: settings.get('restingDistance') / 100 });
let eye = resting();
let following = false;
let mouseEye = null;
let mouseDistance = null;

/** Where the view should be from now: the tracked eye, the mouse, or the resting viewpoint. */
function targetEye(now) {
    const latest = tracker.latest;
    if (tracker.running && latest && now - latest.at < 1200) return { eye: latest.eye, tracked: true };
    if (!tracker.running && mouseEye) return { eye: mouseEye, tracked: false };
    return { eye: resting(), tracked: false };
}

let lostAt = null;
function updateEye(now, dt) {
    const target = targetEye(now);
    if (target.tracked && following) {
        eye = { ...target.eye };
        lostAt = null;
        return;
    }
    if (!target.tracked && tracker.running && lostAt === null) {
        lostAt = now;
        tracker.resetSmoothing();
    }
    // Glide to it: on finding a face, on losing one, and following the mouse.
    const k = 1 - Math.exp(-dt / (target.tracked ? 0.25 : mouseEye && !tracker.running ? 0.08 : 0.9));
    for (const axis of ['x', 'y', 'z']) eye[axis] += (target.eye[axis] - eye[axis]) * k;
    const gap = Math.hypot(target.eye.x - eye.x, target.eye.y - eye.y, target.eye.z - eye.z);
    following = target.tracked && gap < 0.01;
}

// Without a camera: the pointer's position over the window moves the eye across a metre-wide space;
// the wheel moves it nearer or further.
window.addEventListener('pointermove', (e) => {
    if (tracker.running || !$('panel').hidden) return;
    if (mouseDistance === null) mouseDistance = settings.get('restingDistance') / 100;
    mouseEye = { x: (e.clientX / window.innerWidth - 0.5) * 1.0, y: -(e.clientY / window.innerHeight - 0.5) * 0.6, z: mouseDistance };
});
window.addEventListener('wheel', (e) => {
    if (tracker.running || !mouseEye) return;
    mouseDistance = Math.min(5, Math.max(0.25, mouseDistance * Math.exp(e.deltaY * 0.001)));
    mouseEye.z = mouseDistance;
}, { passive: true });

// --- The loop -------------------------------------------------------------------------------------

const clock = new THREE.Timer();
let frames = 0, fps = 0, fpsSince = performance.now();

function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    clock.update(now);
    const dt = Math.min(0.1, clock.getDelta());
    const t = clock.getElapsed();
    updateEye(now, dt);
    // Never draw from nowhere: a bad position would leave the window black.
    if (![eye.x, eye.y, eye.z].every(Number.isFinite)) eye = resting();
    const { w, h } = settings.screen();
    applyWindowProjection(camera, { x: eye.x, y: eye.y, z: Math.max(0.05, eye.z) }, w, h, 40000);
    countryside.update(t);
    atmosphere.update(dt);
    renderer.render(scene, camera);

    frames++;
    if (now - fpsSince > 1000) {
        fps = frames * 1000 / (now - fpsSince);
        frames = 0;
        fpsSince = now;
        showReadout();
    }
    if (!$('preview').hidden) drawPreview();
}
requestAnimationFrame(frame);

// --- The panel ------------------------------------------------------------------------------------

function buildForm() {
    const form = $('settings-form');
    form.innerHTML = '';
    const groups = new Map();
    for (const s of SETTINGS) {
        if (s.kind === 'hidden') continue;
        if (!groups.has(s.group)) {
            const fieldset = document.createElement('fieldset');
            fieldset.innerHTML = `<legend>${s.group}</legend>`;
            groups.set(s.group, fieldset);
            form.append(fieldset);
        }
        const label = document.createElement('label');
        const value = settings.get(s.key);
        let input;
        if (s.kind === 'checkbox') {
            label.className = 'checkbox';
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = value;
            input.addEventListener('change', () => settings.set(s.key, input.checked));
        } else if (s.kind === 'select') {
            input = document.createElement('select');
            for (const [v, text] of s.options) input.append(new Option(text, v, false, v === value));
            input.addEventListener('change', () => settings.set(s.key, input.value));
        } else {
            input = document.createElement('input');
            Object.assign(input, { type: 'number', min: s.min, max: s.max, step: s.step, value });
            input.addEventListener('change', () => {
                const v = Number(input.value);
                if (Number.isFinite(v)) settings.set(s.key, Math.min(s.max, Math.max(s.min, v)));
                input.value = settings.get(s.key);
                // Entered by hand: not to be overridden by the automatic values.
                if (s.key === 'cameraFov') settings.set('cameraFovSource', 'entered');
                if (s.key === 'ipd' && settings.get('ipdAuto')) {
                    settings.set('ipdAuto', false);
                    buildForm();
                }
            });
        }
        input.dataset.key = s.key;
        const text = document.createElement('span');
        text.textContent = s.label;
        label.append(text);
        if (s.unit) {
            const wrap = document.createElement('span');
            wrap.className = 'number';
            const unit = document.createElement('span');
            unit.className = 'unit';
            unit.textContent = s.unit;
            wrap.append(input, unit);
            label.append(wrap);
        } else {
            label.append(input);
        }
        if (s.help) {
            const help = document.createElement('span');
            help.className = 'help';
            help.textContent = s.help;
            label.append(help);
        }
        groups.get(s.group).append(label);
    }
}
buildForm();

settings.onChange((key, value) => {
    if (key === 'windowHeight') countryside.setWindowHeight(value);
    if (['frame', 'screenWidth', 'screenHeight'].includes(key)) rebuildFrame();
    if (['clock', 'hour', 'latitude', 'longitude', 'facing'].includes(key)) placeSun();
    if (key === 'shadows') {
        renderer.shadowMap.enabled = value;
        scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
    if (key === 'restingDistance') mouseDistance = null;
    if (key === 'debug') showReadout();
    // Set by the tracker (the webcam's field of view, the measured eye spacing): show the new value.
    const field = document.querySelector(`#settings-form [data-key="${key}"]`);
    if (field && document.activeElement !== field) {
        if (field.type === 'checkbox') field.checked = value;
        else field.value = value;
    }
    const setting = SETTINGS.find((s) => s.key === key);
    if (setting?.reload) $('status').textContent = 'Reload the page for the new detail level.';
});

function openPanel(open) {
    $('panel').hidden = !open;
    $('open-settings').hidden = open;
    $('preview').hidden = !open || !tracker.running;
}
$('open-settings').addEventListener('click', () => openPanel(true));
$('close-settings').addEventListener('click', () => openPanel(false));
$('reset').addEventListener('click', () => {
    if (!confirm('Put every setting back to its default?')) return;
    settings.resetAll();
    buildForm();
});

async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
}
$('fullscreen').addEventListener('click', () => toggleFullscreen());
window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 's' || e.key === 'S') openPanel($('panel').hidden);
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    if (e.key === 'Escape') openPanel(false);
});

// Hides the cursor and the gear while nobody is using the mouse: it's a window, not a web page.
let idleTimer = null;
function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
}
window.addEventListener('pointermove', wake);
wake();

// --- Tracking -------------------------------------------------------------------------------------

async function startTracking() {
    $('status').textContent = 'Starting the webcam and the face tracker…';
    try {
        await tracker.start();
        mouseEye = null;
        $('toggle-tracking').textContent = 'Stop tracking';
        $('status').textContent = 'Tracking. Move your head: the view should shift as a real window\'s would.';
        $('preview').hidden = $('panel').hidden;
        keepAwake();
    } catch (e) {
        console.error(e);
        $('status').textContent = `Couldn't start tracking: ${e.message}. Move the mouse to look around instead.`;
    }
}

$('toggle-tracking').addEventListener('click', () => {
    if (tracker.running) {
        tracker.stop();
        $('toggle-tracking').textContent = 'Start tracking';
        $('status').textContent = 'Not tracking: move the mouse to look around.';
        $('preview').hidden = true;
    } else {
        startTracking();
    }
});

$('calibrate').addEventListener('click', () => {
    const latest = tracker.latest;
    if (!tracker.running || !latest || performance.now() - latest.at > 500) {
        $('calibration-result').textContent = 'Start tracking and face the webcam first.';
        return;
    }
    const distance = Number($('calibration-distance').value) / 100;
    const hfov = calibrateHfov(latest.face, settings.get('ipd') / 1000, distance);
    if (!(hfov > 20 && hfov < 150)) {
        $('calibration-result').textContent = `That gives ${hfov.toFixed(1)}°, which can't be right: check the distance.`;
        return;
    }
    settings.set('cameraFov', Math.round(hfov * 10) / 10);
    settings.set('cameraFovSource', 'measured');
    buildForm();
    $('calibration-result').textContent = `Field of view set to ${settings.get('cameraFov')}°.`;
});

// The screen shouldn't sleep while it's being a window.
async function keepAwake() {
    try {
        await navigator.wakeLock?.request('screen');
    } catch {
        // Not offered here; the display's own settings decide.
    }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && tracker.running) keepAwake(); });

// Permission granted once, the webcam starts by itself on later loads.
navigator.permissions?.query({ name: 'camera' }).then((p) => { if (p.state === 'granted') startTracking(); }).catch(() => {});

// --- Readout and preview --------------------------------------------------------------------------

/** The panel's live account of tracking: where you are, the webcam, the eye spacing. */
function showTrackingDetails() {
    const details = $('tracking-details');
    if (!tracker.running) {
        details.textContent = '';
        return;
    }
    const lines = [];
    const latest = tracker.latest;
    if (latest && performance.now() - latest.at < 1200) {
        lines.push(`You're about ${Math.round(latest.eye.z * 100)} cm from the screen, ${Math.round(Math.abs(latest.eye.x) * 100)} cm ${latest.eye.x < 0 ? 'left' : 'right'} of its centre.`);
    } else {
        lines.push('No face in view.');
    }
    const camera = tracker.camera;
    if (camera?.known) lines.push(`${camera.label}: field of view ${camera.known.hfov}°, from its specification.`);
    else if (camera) lines.push(`${camera.label}: not a model we know; its field of view is ${settings.get('cameraFov')}°${settings.get('cameraFovSource') === 'measured' ? ', calibrated' : settings.get('cameraFovSource') === 'entered' ? ', as entered' : '. Calibrate it below for the right distances'}.`);
    if (settings.get('ipdAuto')) {
        const progress = tracker.spacingProgress;
        lines.push(progress < 1 ? `Measuring the distance between your eyes: look at the camera… ${Math.round(progress * 100)}%` : `Your eyes are ${settings.get('ipd')} mm apart, measured.`);
    }
    details.textContent = lines.join(' ');
}

function showReadout() {
    showTrackingDetails();
    const readout = $('readout');
    readout.hidden = !settings.get('debug');
    if (readout.hidden) return;
    const cm = (v) => (v * 100).toFixed(1).padStart(6);
    const latest = tracker.latest;
    readout.textContent = [
        `eye    x ${cm(eye.x)}  y ${cm(eye.y)}  z ${cm(eye.z)} cm`,
        latest ? `raw    x ${cm(latest.raw.x)}  y ${cm(latest.raw.y)}  z ${cm(latest.raw.z)} cm` : 'raw    (no face)',
        `source ${tracker.running ? (latest && performance.now() - latest.at < 1200 ? 'webcam' : 'webcam, no face') : mouseEye ? 'mouse' : 'resting'}`,
        `render ${fps.toFixed(0)} fps   tracker ${tracker.detectionsPerSecond} fps`
    ].join('\n');
}

function drawPreview() {
    const canvas = $('preview');
    const g = canvas.getContext('2d');
    const video = tracker.video;
    if (video.readyState < 2) return;
    g.drawImage(video, 0, 0, canvas.width, canvas.height);
    const latest = tracker.latest;
    if (!latest || performance.now() - latest.at > 500) return;
    g.fillStyle = '#8fc1ff';
    for (const p of [latest.face.left, latest.face.right]) {
        g.beginPath();
        g.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
        g.fill();
    }
}
