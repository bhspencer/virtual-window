// The sky, the light and the air: a physical sky model with drifting clouds, the sun as a
// shadow-casting light, sky light from above, haze that thickens with distance, and stars at night
// -- all following where the sun is.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { seededRandom, smoothstep } from './random.js';
import { createClouds, driftClouds, lightClouds } from './clouds.js';

function createStars() {
    const random = seededRandom(88);
    const positions = [];
    for (let i = 0; i < 2500; i++) {
        const u = random(), a = random() * Math.PI * 2;
        const y = 0.05 + u * 0.95;
        const r = Math.sqrt(1 - y * y);
        positions.push(Math.cos(a) * r * 14000, y * 14000, Math.sin(a) * r * 14000);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    return new THREE.Points(geometry, material);
}

export class Atmosphere {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;

        this.sky = new Sky();
        this.sky.scale.setScalar(30000);
        const u = this.sky.material.uniforms;
        // Clear country air: a blue sky, not much haze. The sky model's own cloud layer thins out
        // towards the horizon, which is most of what a window shows, so the clouds are billboards
        // (clouds.js) instead.
        u.turbidity.value = 2.2;
        u.rayleigh.value = 2.4;
        u.mieCoefficient.value = 0.0025;
        u.mieDirectionalG.value = 0.8;
        u.cloudCoverage.value = 0;
        scene.add(this.sky);

        this.clouds = createClouds();
        scene.add(this.clouds);

        this.stars = createStars();
        scene.add(this.stars);

        this.sun = new THREE.DirectionalLight(0xffffff, 3);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        const s = this.sun.shadow.camera;
        s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 300;
        this.sun.shadow.bias = -0.0004;
        this.sun.shadow.normalBias = 0.03;
        // Shadows fall where they show: the garden and the near field.
        this.sunTarget = new THREE.Object3D();
        this.sunTarget.position.set(0, -1.5, -30);
        this.sun.target = this.sunTarget;
        scene.add(this.sun, this.sunTarget);

        this.skyLight = new THREE.HemisphereLight(0xbfd8ff, 0x4a5a2a, 0.8);
        scene.add(this.skyLight);

        scene.fog = new THREE.FogExp2(0xb8c8d8, 0.00011);

        // Light reflected from the sky, for materials' ambient and specular light: the sky rendered into
        // an environment map, redone when the sun has moved.
        this.pmrem = new THREE.PMREMGenerator(renderer);
        this.envScene = new THREE.Scene();
        this.envSky = new Sky();
        this.envSky.scale.setScalar(100);
        this.envSky.material.uniforms = THREE.UniformsUtils.clone(this.sky.material.uniforms);
        this.envSky.material.uniforms.cloudCoverage.value = 0;
        this.envScene.add(this.envSky);
        this.envTarget = null;
        this.envElevation = null;
    }

    get uniforms() {
        return this.sky.material.uniforms;
    }

    /**
     * Puts the sun at `direction` (a unit vector in the scene; see sun.js) and sets the light, sky,
     * haze, exposure and stars to suit.
     */
    setSun(direction) {
        const d = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
        const elevation = Math.asin(d.y) * 180 / Math.PI;
        this.uniforms.sunPosition.value.copy(d);
        this.envSky.material.uniforms.sunPosition.value.copy(d);
        this.sun.position.copy(this.sunTarget.position).addScaledVector(d, 150);

        // Daylight fades through dusk; the sun's light reddens as it nears the horizon.
        const day = smoothstep(-4, 8, elevation);
        const low = 1 - smoothstep(2, 25, elevation);
        this.sun.intensity = 3.2 * smoothstep(-1, 6, elevation);
        this.sun.color.setRGB(1, 1 - low * 0.35, 1 - low * 0.62);
        this.skyLight.intensity = 0.15 + 0.85 * day;
        this.skyLight.color.setRGB(0.55 + 0.2 * day, 0.68 + 0.17 * day, 0.85 + 0.15 * day).multiplyScalar(0.4 + 0.6 * day);
        this.skyLight.groundColor.setRGB(0.22, 0.26, 0.14).multiplyScalar(0.3 + 0.7 * day);

        // Haze: the colour of the horizon sky, warm at sunrise and sunset, dark at night.
        const haze = new THREE.Color(0.62, 0.71, 0.82).lerp(new THREE.Color(0.85, 0.62, 0.45), low * 0.6);
        this.scene.fog.color.copy(haze).multiplyScalar(0.06 + 0.94 * day);

        this.stars.material.opacity = 1 - smoothstep(-12, -3, elevation);
        // Unlit, so brighter than white: tone mapping at this exposure would otherwise grey them.
        const cloudLight = new THREE.Color(1, 1, 1).lerp(new THREE.Color(1, 0.72, 0.55), low * 0.7).multiplyScalar(2.6 * (0.08 + 0.92 * day));
        lightClouds(this.clouds, cloudLight, 0.35 + 0.65 * day);
        this.renderer.toneMappingExposure = 0.42 + 0.25 * (1 - day);

        if (this.envElevation === null || Math.abs(this.envElevation - elevation) > 1) {
            this.envElevation = elevation;
            if (this.envTarget) this.envTarget.dispose();
            this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
            this.scene.environment = this.envTarget.texture;
            // The sky model's radiance is far brighter than the scene's other light: a little goes a long way.
            this.scene.environmentIntensity = 0.03 + 0.07 * day;
        }
    }

    /** Moves the clouds on; dt in seconds. */
    update(dt) {
        driftClouds(this.clouds, dt);
    }
}
