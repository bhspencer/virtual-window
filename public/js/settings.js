// The settings: what the window needs to know about the real screen, the webcam and the place, and
// how to draw. Kept in this browser's local storage, so a wall-mounted machine keeps its calibration.

/** Each setting: its group, label, unit, kind and default. Lengths are entered in centimetres. */
export const SETTINGS = [
    { key: 'screenWidth', group: 'Screen', label: 'Visible width', unit: 'cm', min: 10, max: 400, step: 0.1, value: 30, help: 'The whole display\'s lit area, not the bezel. When the browser isn\'t fullscreen, the window is just the part the page fills; fullscreen (F) is the most exact.' },
    { key: 'screenHeight', group: 'Screen', label: 'Visible height', unit: 'cm', min: 10, max: 300, step: 0.1, value: 20 },
    { key: 'screenLean', group: 'Screen', label: 'Leans back from upright by', unit: '°', min: 0, max: 60, step: 0.5, value: 0, help: 'A laptop\'s lid usually leans back 10–25°; a wall-mounted screen, 0. Wrong, and the ground seems to tilt.' },
    { key: 'cameraX', group: 'Webcam', label: 'Across from the screen\'s centre', unit: 'cm', min: -200, max: 200, step: 0.5, value: 0, help: 'Where the lens is, to the right (+) or left (−) of the middle of the screen.' },
    { key: 'cameraY', group: 'Webcam', label: 'Above the screen\'s centre', unit: 'cm', min: -200, max: 200, step: 0.5, value: 10, help: 'Usually half the screen height plus the bezel.' },
    { key: 'cameraZ', group: 'Webcam', label: 'In front of the screen', unit: 'cm', min: -20, max: 50, step: 0.5, value: 0 },
    { key: 'cameraFov', group: 'Webcam', label: 'Horizontal field of view', unit: '°', min: 30, max: 120, step: 0.1, value: 65, help: 'Set from the webcam\'s specification when it\'s a model we know; otherwise calibrate it above.' },
    { key: 'cameraFovSource', kind: 'hidden', value: 'default' },
    { key: 'cameraPitch', group: 'Webcam', label: 'Tilted down by', unit: '°', min: -45, max: 45, step: 0.5, value: 0 },
    { key: 'cameraMirrored', group: 'Webcam', label: 'Picture arrives mirrored', kind: 'checkbox', value: false, help: 'Tick if moving left moves the view the wrong way.' },
    { key: 'ipdAuto', group: 'Webcam', label: 'Measure the distance between my eyes', kind: 'checkbox', value: true, help: 'From the size of your irises, in the first few seconds of tracking.' },
    { key: 'ipd', group: 'Webcam', label: 'Distance between your eyes', unit: 'mm', min: 50, max: 80, step: 0.5, value: 63, help: 'Between the middles of your eyes; adults are mostly 58–70 mm.' },
    { key: 'steadiness', group: 'Tracking', label: 'Steadiness', min: 0.05, max: 3, step: 0.05, value: 0.6, help: 'Lower is steadier when you\'re still, but slower to follow.' },
    { key: 'responsiveness', group: 'Tracking', label: 'Responsiveness', min: 0, max: 10, step: 0.1, value: 2.5, help: 'Higher keeps up with quick movement.' },
    { key: 'trackerDelegate', group: 'Tracking', label: 'Face tracking runs on', kind: 'select', options: [['CPU', 'The processor (recommended)'], ['GPU', 'The graphics card']], value: 'CPU', help: 'On the graphics card it competes with the scene; applies when tracking next starts.' },
    { key: 'followDistance', group: 'Tracking', label: 'Follow my distance', kind: 'checkbox', value: true, help: 'Off: the view follows you side to side and up and down only, as if you were always at the distance below.' },
    { key: 'restingDistance', group: 'Tracking', label: 'Viewing distance', unit: 'cm', min: 30, max: 500, step: 1, value: 40, help: 'Where the view is from with nobody there (straight out from the screen), and always, when not following your distance.' },
    { key: 'scene', group: 'Place', label: 'The view', kind: 'select', options: [['countryside', 'Countryside'], ['sequoias', 'Giant sequoia grove']], value: 'countryside', help: 'Applies on reload. The grove faces a fixed way, so the afternoon sun lights the trunks from the left.', reload: true },
    { key: 'windowHeight', group: 'Place', label: 'Window above the ground outside', unit: 'm', min: 0.3, max: 30, step: 0.1, value: 1.5 },
    { key: 'facing', group: 'Place', label: 'Window faces (compass)', unit: '°', min: 0, max: 359, step: 1, value: 0, help: '0 north, 90 east, 180 south, 270 west. North (in the northern hemisphere) has the sun behind you, lighting the view; south looks into it.' },
    { key: 'latitude', group: 'Place', label: 'Latitude', unit: '°', min: -90, max: 90, step: 0.01, value: 38.96 },
    { key: 'longitude', group: 'Place', label: 'Longitude', unit: '°', min: -180, max: 180, step: 0.01, value: -77.36 },
    { key: 'clock', group: 'Time', label: 'Follow the real time', kind: 'checkbox', value: false },
    { key: 'hour', group: 'Time', label: 'Otherwise, the hour', unit: 'h', min: 0, max: 24, step: 0.25, value: 15 },
    { key: 'frame', group: 'Display', label: 'Window frame', kind: 'select', options: [['reveal', 'Reveal'], ['bars', 'Reveal and glazing bars'], ['none', 'None']], value: 'reveal' },
    { key: 'quality', group: 'Display', label: 'Detail', kind: 'select', options: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], value: 'high', help: 'Applies on reload.', reload: true },
    { key: 'shadows', group: 'Display', label: 'Shadows', kind: 'checkbox', value: true },
    { key: 'debug', group: 'Display', label: 'Show tracking readout', kind: 'checkbox', value: false }
];

// Only the settings changed from their defaults are stored, so a change of default reaches everyone who
// hasn't set that one themselves. (The first version stored them all, under another key.)
const KEY = 'virtual-window.settings.changed';

function load() {
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
        return {};
    }
}

/** The settings: current values by key, saved on every change; `onChange` hears of each. */
export class Settings {
    constructor() {
        const saved = load();
        this.values = {};
        for (const s of SETTINGS) this.values[s.key] = s.key in saved ? saved[s.key] : s.value;
        this.listeners = [];
    }

    get(key) {
        return this.values[key];
    }

    set(key, value) {
        this.values[key] = value;
        const changed = {};
        for (const s of SETTINGS) if (this.values[s.key] !== s.value) changed[s.key] = this.values[s.key];
        try {
            localStorage.setItem(KEY, JSON.stringify(changed));
        } catch {
            // Not kept past this page load; it still applies now.
        }
        for (const listener of this.listeners) listener(key, value);
    }

    onChange(listener) {
        this.listeners.push(listener);
    }

    resetAll() {
        for (const s of SETTINGS) this.set(s.key, s.value);
    }

    /** The screen's size in metres. */
    screen() {
        return { w: this.values.screenWidth / 100, h: this.values.screenHeight / 100 };
    }

    /** The webcam, as eyePoint() wants it. */
    camera() {
        const v = this.values;
        return {
            hfovDeg: v.cameraFov, ipd: v.ipd / 1000, pitchDeg: v.cameraPitch, mirrored: v.cameraMirrored,
            position: { x: v.cameraX / 100, y: v.cameraY / 100, z: v.cameraZ / 100 }
        };
    }
}
