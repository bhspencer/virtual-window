// The webcam and the face landmarker: finds the viewer's face in each new frame and works out where
// their eyes are (eye-position.js), smoothed.
import { FaceLandmarker, FilesetResolver } from '../vendor/mediapipe/vision_bundle.mjs';
import { EYE_CORNERS, eyePoint, OneEuroFilter } from './eye-position.js';

export class HeadTracker {
    /** settings: the Settings, for the webcam's calibration and the smoothing. */
    constructor(settings) {
        this.settings = settings;
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
        this.filters = { x: new OneEuroFilter(), y: new OneEuroFilter(), z: new OneEuroFilter() };
        /** The latest: eye (smoothed), face (for drawing), and when it was seen (ms, performance.now). */
        this.latest = null;
        this.running = false;
        this.detectionsPerSecond = 0;
    }

    async start() {
        if (this.running) return;
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false
        });
        this.video.srcObject = stream;
        await this.video.play();
        if (!this.landmarker) {
            const files = await FilesetResolver.forVisionTasks('vendor/mediapipe/wasm');
            const options = (delegate) => ({
                baseOptions: { modelAssetPath: 'models/face_landmarker.task', delegate },
                runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true
            });
            try {
                this.landmarker = await FaceLandmarker.createFromOptions(files, options('GPU'));
            } catch (e) {
                console.warn('The GPU face landmarker failed; using the CPU', e);
                this.landmarker = await FaceLandmarker.createFromOptions(files, options('CPU'));
            }
        }
        this.running = true;
        this.loop();
    }

    stop() {
        this.running = false;
        for (const track of this.video.srcObject?.getTracks() ?? []) track.stop();
        this.video.srcObject = null;
        this.latest = null;
    }

    loop() {
        if (!this.running) return;
        const next = () => this.loop();
        // Only when there's a new frame: detecting the same one twice wastes the time it takes.
        if ('requestVideoFrameCallback' in this.video) this.video.requestVideoFrameCallback(() => { this.detect(); next(); });
        else requestAnimationFrame(() => { this.detect(); next(); });
    }

    detect() {
        const now = performance.now();
        if (this.video.readyState < 2) return;
        const result = this.landmarker.detectForVideo(this.video, now);
        this.countDetection(now);
        const landmarks = result.faceLandmarks?.[0];
        if (!landmarks) return;
        const centre = ([a, b]) => ({ x: (landmarks[a].x + landmarks[b].x) / 2, y: (landmarks[a].y + landmarks[b].y) / 2 });
        const face = {
            right: centre(EYE_CORNERS.right), left: centre(EYE_CORNERS.left),
            width: this.video.videoWidth, height: this.video.videoHeight,
            matrix: result.facialTransformationMatrixes?.[0]?.data
        };
        const raw = eyePoint(face, this.settings.camera());
        if (!(raw.z > 0.05 && raw.z < 10)) return;
        const t = now / 1000;
        const steady = this.settings.get('steadiness'), quick = this.settings.get('responsiveness');
        const eye = {};
        for (const axis of ['x', 'y', 'z']) {
            const filter = this.filters[axis];
            filter.minCutoff = steady;
            filter.beta = quick;
            eye[axis] = filter.filter(raw[axis], t);
        }
        this.latest = { eye, raw, face, landmarks, at: now };
    }

    countDetection(now) {
        this.detections = (this.detections ?? []).filter((t) => now - t < 1000);
        this.detections.push(now);
        this.detectionsPerSecond = this.detections.length;
    }

    /** Starts the smoothing afresh, as when the viewer has been away. */
    resetSmoothing() {
        for (const filter of Object.values(this.filters)) filter.reset();
    }
}
