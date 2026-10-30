// The window's own frame, at the screen's edges. A reveal -- the depth of the wall around the opening,
// painted -- whose inner sides come into view as the viewer moves, the way a real window's do; and
// optionally glazing bars across the pane. Built for the screen's size; rebuilt when it changes.
import * as THREE from 'three';

/**
 * style: 'none', 'reveal', or 'bars' (a reveal and glazing bars dividing the pane in four). w, h: the
 * screen's size in metres.
 */
export function createWindowFrame(style, w, h) {
    const group = new THREE.Group();
    group.name = 'window frame';
    if (style === 'none') return group;
    const depth = 0.14;
    // Lit as the inside of a room is, by soft light rather than the sun.
    const paint = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.75, emissive: 0x3a3833, fog: false });
    const side = (width, height, x, y, rotateY, rotateX) => {
        const plane = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(plane, paint);
        mesh.rotation.set(rotateX, rotateY, 0);
        mesh.position.set(x, y, -depth / 2);
        group.add(mesh);
    };
    // The four inner faces of the opening, facing inwards.
    side(depth, h, -w / 2, 0, Math.PI / 2, 0);
    side(depth, h, w / 2, 0, -Math.PI / 2, 0);
    side(w, depth, 0, h / 2, 0, Math.PI / 2);
    side(w, depth, 0, -h / 2, 0, -Math.PI / 2);
    if (style !== 'bars') return group;
    // A sash frame just inside the reveal, and glazing bars dividing the pane in four.
    const rail = 0.03;
    const frame = (x, y, width, height) => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.045), paint);
        box.position.set(x, y, -depth + 0.03);
        group.add(box);
    };
    frame(0, h / 2 - rail / 2, w, rail);
    frame(0, -h / 2 + rail / 2, w, rail);
    frame(-w / 2 + rail / 2, 0, rail, h);
    frame(w / 2 - rail / 2, 0, rail, h);
    frame(0, 0, 0.022, h);
    frame(0, 0, w, 0.022);
    return group;
}
