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
    const distance = f * camera.ipd / separation;

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
        z: camera.position.z + z
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
