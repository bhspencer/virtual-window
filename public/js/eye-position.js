// From face landmarks in a webcam frame to where the viewer's eyes are, in the window's coordinates
// (metres; see window-projection.js): the eye point the view is rendered from.

/** Face landmarker indices: the corners of each eye. Their midpoints don't move as the gaze does. */
export const EYE_CORNERS = { right: [33, 133], left: [362, 263] };

/**
 * The viewer's eye point -- midway between their eyes -- in window coordinates.
 *
 * `face`: the two eye centres in normalized image coordinates (0..1, as the landmarker gives them),
 * the image size in pixels, and optionally the face's 4x4 transformation matrix (column-major), used
 * to undo the foreshortening of a turned head.
 *
 * `camera`: where the webcam is and how it sees. hfovDeg: its horizontal field of view. ipd: the
 * distance between the viewer's eyes, in metres. position: the lens, in window coordinates (above
 * the top edge, typically). pitchDeg: how far it is tilted down. mirrored: whether the frames arrive
 * flipped left to right (some cameras and drivers do this).
 */
export function eyePoint(face, camera) {
    const { right, left, width, height, matrix } = face;
    const f = (width / 2) / Math.tan((camera.hfovDeg * Math.PI / 180) / 2);
    const du = (left.x - right.x) * width;
    const dv = (left.y - right.y) * height;
    // A head turned away shows its eyes closer together. The face's left-right axis, projected onto the
    // image, has length sqrt(R00^2 + R10^2); dividing by it gives the separation face-on.
    const facing = matrix ? Math.max(0.5, Math.hypot(matrix[0], matrix[1])) : 1;
    const separation = Math.hypot(du, dv) / facing;
    // Held through a blink (BlinkGuard), when the eye corners can't be trusted for distance.
    const distance = face.distance ?? f * camera.ipd / separation;

    const u = (left.x + right.x) / 2 * width;
    const v = (left.y + right.y) / 2 * height;
    // The camera faces the viewer: its image's right is the viewer's left (unless mirrored), and image
    // rows run downwards.
    const xCam = (camera.mirrored ? 1 : -1) * (u - width / 2) / f * distance;
    const yCam = -(v - height / 2) / f * distance;
    // Tilted down by the pitch: its optical axis runs towards the viewer and down.
    const p = (camera.pitchDeg ?? 0) * Math.PI / 180;
    const y = yCam * Math.cos(p) - distance * Math.sin(p);
    const z = yCam * Math.sin(p) + distance * Math.cos(p);
    return {
        x: camera.position.x + xCam,
        y: camera.position.y + y,
        z: camera.position.z + z,
        /** From the camera, along its axis: what a blink's hold keeps. */
        distance
    };
}

/**
 * The camera's field of view, from the viewer sitting at a measured distance from it: the eyes'
 * separation in the image at a known distance fixes the focal length.
 */
export function calibrateHfov(face, ipd, measuredDistance) {
    const { right, left, width, height, matrix } = face;
    const facing = matrix ? Math.max(0.5, Math.hypot(matrix[0], matrix[1])) : 1;
    const separation = Math.hypot((left.x - right.x) * width, (left.y - right.y) * height) / facing;
    const f = separation * measuredDistance / ipd;
    return 2 * Math.atan((width / 2) / f) * 180 / Math.PI;
}

/**
 * The One Euro filter (Casiez, Roussel & Vogel, CHI 2012): smooths a noisy signal hard while it is
 * still, and lightly while it moves fast, so the view is steady when the viewer is and doesn't lag
 * when they move. minCutoff (Hz): smoothing at rest, lower is steadier. beta: how quickly smoothing
 * eases with speed.
 */
export class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.5, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.reset();
    }

    reset() {
        this.x = null;
        this.dx = 0;
        this.t = null;
    }

    static alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }

    /** The filtered value of x, measured at time t (seconds). */
    filter(x, t) {
        if (this.x === null) {
            this.x = x;
            this.t = t;
            return x;
        }
        const dt = Math.max(1e-3, t - this.t);
        this.t = t;
        const dx = (x - this.x) / dt;
        this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (dx - this.dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        this.x += OneEuroFilter.alpha(cutoff, dt) * (x - this.x);
        return this.x;
    }
}

/** Face landmarker indices: the middle of each upper and lower eyelid. */
export const EYELIDS = { right: [159, 145], left: [386, 374] };

/** How open the eyes are: the eyelids' gap over the eye's width, averaged over both eyes. */
export function eyeOpenness(landmarks, width, height) {
    const gap = (a, b) => Math.hypot((landmarks[a].x - landmarks[b].x) * width, (landmarks[a].y - landmarks[b].y) * height);
    const right = gap(...EYELIDS.right) / gap(...EYE_CORNERS.right);
    const left = gap(...EYELIDS.left) / gap(...EYE_CORNERS.left);
    return (right + left) / 2;
}

/**
 * Holds the distance steady through a blink. A blink moves the eye-corner landmarks the distance is
 * measured from, which would make the view zoom for a moment. The eyes count as closing when they're
 * well under their usual openness (learnt as tracking goes); from then until a moment after they
 * reopen, the distance is the one from just before the blink began. Squinting for longer than a blink
 * becomes the new usual.
 */
export class BlinkGuard {
    constructor({ closing = 0.75, lead = 0.12, after = 0.15, longest = 0.6 } = {}) {
        Object.assign(this, { closing, lead, after, longest });
        this.reset();
    }

    reset() {
        this.usual = null;
        this.history = [];
        this.closedSince = null;
        this.holdUntil = -Infinity;
        this.held = null;
    }

    /**
     * Given the eyes' openness and the measured distance at time t (seconds): the distance to use,
     * the measured one or the one held through a blink.
     */
    distance(openness, measured, t) {
        if (this.usual === null) this.usual = openness;
        const closed = openness < this.usual * this.closing;
        if (closed) {
            if (this.closedSince === null) {
                this.closedSince = t;
                // The lids start moving before they cross the line: hold from a little earlier.
                const before = this.history.filter((h) => h.t <= t - this.lead);
                this.held = (before.at(-1) ?? this.history[0])?.distance ?? measured;
            }
            if (t - this.closedSince > this.longest) {
                // Not a blink: they're just narrower now.
                this.usual = openness;
                this.closedSince = null;
                this.holdUntil = -Infinity;
                return measured;
            }
            this.holdUntil = t + this.after;
        } else {
            this.closedSince = null;
            this.usual += (openness - this.usual) * 0.02;
        }
        if (t < this.holdUntil) return this.held;
        this.history.push({ t, distance: measured });
        while (this.history.length && this.history[0].t < t - 1) this.history.shift();
        return measured;
    }

    get blinking() {
        return this.closedSince !== null;
    }
}

/** Face landmarker indices: each iris's centre and four points on its rim (right, top, left, bottom). */
export const IRISES = { right: [468, 469, 470, 471, 472], left: [473, 474, 475, 476, 477] };

/**
 * The human iris's visible diameter, in metres: about 11.7 mm, and remarkably consistent between
 * adults (far more so than the distance between the eyes), which is why MediaPipe's own iris depth
 * estimate relies on it.
 */
export const IRIS_DIAMETER = 0.0117;

/**
 * The ratio of the eyes' separation to an iris's width, both measured across the image: the same at
 * any distance and with any camera, so with the iris's known size it measures this viewer's eye
 * spacing without a tape measure. Null if the landmarks have no irises.
 */
export function eyeSpacingInIrises(landmarks, width, height) {
    if (!landmarks || landmarks.length < 478) return null;
    const px = (i) => ({ x: landmarks[i].x * width, y: landmarks[i].y * height });
    const across = (a, b) => Math.hypot(px(a).x - px(b).x, px(a).y - px(b).y);
    const irisWidth = (across(IRISES.right[1], IRISES.right[3]) + across(IRISES.left[1], IRISES.left[3])) / 2;
    const centre = ([a, b]) => ({ x: (px(a).x + px(b).x) / 2, y: (px(a).y + px(b).y) / 2 });
    const r = centre(EYE_CORNERS.right), l = centre(EYE_CORNERS.left);
    return irisWidth > 0 ? Math.hypot(r.x - l.x, r.y - l.y) / irisWidth : null;
}

/** The median of some numbers. */
export function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Published diagonal fields of view of common webcams, by a piece of the name the browser reports for
 * them. Most quote the diagonal; the horizontal follows from the picture's shape (hfovFromDiagonal).
 */
export const WEBCAM_DIAGONAL_FOV = [
    ['c920', 78], ['c922', 78], ['c925e', 78], ['c930', 90], ['c270', 55], ['c310', 60], ['c505', 60],
    ['c615', 78], ['brio 4k', 90], ['brio 500', 90], ['brio 300', 70], ['brio 100', 58], ['brio', 90],
    ['streamcam', 78], ['mx brio', 90], ['kiyo pro', 103], ['kiyo', 81.6], ['lifecam hd-3000', 68.5],
    ['lifecam studio', 75], ['lifecam cinema', 73], ['insta360 link', 79.5], ['emeet c960', 90]
];

/** The webcam's published diagonal field of view, if its name is one we know; else null. */
export function knownWebcam(label) {
    const name = (label ?? '').toLowerCase();
    const found = WEBCAM_DIAGONAL_FOV.find(([part]) => name.includes(part));
    return found ? { model: found[0], diagonalDeg: found[1] } : null;
}

/**
 * The horizontal field of view of a picture `aspect` wide (width / height), from the camera's
 * diagonal field of view. Webcam sensors are 16:9; a narrower picture is cropped from its sides.
 */
export function hfovFromDiagonal(diagonalDeg, aspect) {
    const sensor = 16 / 9;
    const halfDiagonal = Math.tan(diagonalDeg * Math.PI / 360);
    const halfWidth = halfDiagonal * sensor / Math.hypot(sensor, 1) * Math.min(1, aspect / sensor);
    return 2 * Math.atan(halfWidth) * 180 / Math.PI;
}
