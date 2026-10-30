// The webcam and the face landmarker: finds the viewer's face in each new frame and works out where
// their eyes are (eye-position.js), smoothed.
import { FaceLandmarker, FilesetResolver } from '../vendor/mediapipe/vision_bundle.mjs';
import { EYE_CORNERS, eyePoint, eyeOpenness, BlinkGuard, OneEuroFilter, eyeSpacingInIrises, IRIS_DIAMETER, median, knownWebcam, hfovFromDiagonal } from './eye-position.js';

/** Frames of a face seen square-on to measure the eye spacing from: about five seconds' worth. */
const SPACING_SAMPLES = 90;

export class HeadTracker {
    /** settings: the Settings, for the webcam's calibration and the smoothing. */
    constructor(settings) {
        this.settings = settings;
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
        this.filters = { x: new OneEuroFilter(), y: new OneEuroFilter(), z: new OneEuroFilter() };
        this.blinks = new BlinkGuard();
        /** The latest: eye (smoothed), face (for drawing), and when it was seen (ms, performance.now). */
        this.latest = null;
        this.running = false;
        this.detectionsPerSecond = 0;
        /** The webcam: its name, and if it's one we know, its model and field of view. */
        this.camera = null;
        this.spacingSamples = [];
    }

    async start() {
        if (this.running) return;
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false
        });
        this.video.srcObject = stream;
        await this.video.play();
        this.identifyCamera(stream.getVideoTracks()[0]);
        this.spacingSamples = [];
        const delegate = this.settings.get('trackerDelegate');
        if (this.landmarker && this.delegate !== delegate) {
            this.landmarker.close();
            this.landmarker = null;
        }
        if (!this.landmarker) {
            this.delegate = delegate;
            const files = await FilesetResolver.forVisionTasks('vendor/mediapipe/wasm');
            const options = (delegate) => ({
                baseOptions: { modelAssetPath: 'models/face_landmarker.task', delegate },
                runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true
            });
            // On the CPU by default: on the GPU it competes with the scene for the graphics card, which on
            // a modest one can make the browser drop the scene's context (a black window).
            try {
                this.landmarker = await FaceLandmarker.createFromOptions(files, options(delegate));
            } catch (e) {
                if (delegate === 'CPU') throw e;
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
        const camera = this.settings.camera();
        const measured = eyePoint(face, camera);
        if (![measured.x, measured.y, measured.z].every(Number.isFinite) || !(measured.distance > 0.05 && measured.distance < 10)) return;
        const t = now / 1000;
        const openness = eyeOpenness(landmarks, face.width, face.height);
        const distance = this.blinks.distance(openness, measured.distance, t);
        const raw = distance === measured.distance ? measured : eyePoint({ ...face, distance }, camera);
        if (!this.blinks.blinking) this.measureEyeSpacing(landmarks, face);
        const steady = this.settings.get('steadiness'), quick = this.settings.get('responsiveness');
        const eye = {};
        for (const axis of ['x', 'y', 'z']) {
            const filter = this.filters[axis];
            // Distance comes from a few pixels' difference, so it's the noisiest: smoothed twice as hard
            // at rest. A real step nearer or further is quick enough to get through.
            filter.minCutoff = axis === 'z' ? steady / 2 : steady;
            filter.beta = quick;
            eye[axis] = filter.filter(raw[axis], t);
        }
        this.latest = { eye, raw, face, landmarks, at: now };
    }

    /**
     * Sets the webcam's field of view from its published specification, if it's a model we know and
     * the field of view hasn't been measured or entered by hand.
     */
    identifyCamera(track) {
        const { width, height } = track?.getSettings() ?? {};
        const known = knownWebcam(track?.label);
        this.camera = { label: track?.label || 'Webcam', width, height, known: null };
        if (!known || !width || !height) return;
        const hfov = Math.round(hfovFromDiagonal(known.diagonalDeg, width / height) * 10) / 10;
        this.camera.known = { ...known, hfov };
        if (this.settings.get('cameraFovSource') !== 'measured' && this.settings.get('cameraFovSource') !== 'entered') {
            this.settings.set('cameraFov', hfov);
            this.settings.set('cameraFovSource', 'specification');
        }
    }

    /**
     * Measures the viewer's eye spacing with their irises as the ruler (eye-position.js), from frames
     * where they face the camera square-on, and sets it once there are enough: no tape measure needed.
     */
    measureEyeSpacing(landmarks, face) {
        if (!this.settings.get('ipdAuto') || this.spacingSamples.length >= SPACING_SAMPLES) return;
        const squareOn = !face.matrix || Math.hypot(face.matrix[0], face.matrix[1]) > 0.97;
        const ratio = squareOn ? eyeSpacingInIrises(landmarks, face.width, face.height) : null;
        if (!(ratio > 3 && ratio < 8)) return;
        this.spacingSamples.push(ratio);
        if (this.spacingSamples.length === SPACING_SAMPLES) {
            const mm = Math.round(median(this.spacingSamples) * IRIS_DIAMETER * 2000) / 2;
            if (mm >= 50 && mm <= 80) this.settings.set('ipd', mm);
        }
    }

    /** How far the eye spacing measurement has got, 0 to 1. */
    get spacingProgress() {
        return this.spacingSamples.length / SPACING_SAMPLES;
    }

    countDetection(now) {
        this.detections = (this.detections ?? []).filter((t) => now - t < 1000);
        this.detections.push(now);
        this.detectionsPerSecond = this.detections.length;
    }

    /** Starts the smoothing afresh, as when the viewer has been away. */
    resetSmoothing() {
        for (const filter of Object.values(this.filters)) filter.reset();
        this.blinks.reset();
    }
}
