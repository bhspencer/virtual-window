// The geometry of looking through a window.
//
// The world is in metres. The screen is the window pane: a rectangle in the plane z = 0, centred on
// the origin, w wide and h high, with +x to the right and +y up as the viewer sees it, and +z
// towards the viewer. The countryside lies behind it, at z < 0.
//
// The camera sits at the viewer's eye and looks straight through the pane (down -z, never turned),
// and its frustum is fitted to the pane's edges: an off-axis projection. Whatever is drawn is then
// exactly what the eye would see through a window the size and shape of the screen, from where it
// is -- move left and more of the scene to the right comes into view, step closer and the view
// widens. See Kooima, "Generalized Perspective Projection" (2009); with the pane fixed in the plane
// z = 0 it reduces to the simple case below.

/**
 * The frustum, at distance `near` from the eye, whose edges pass through the pane's edges. The eye
 * must be in front of the pane (z > 0).
 */
export function windowFrustum(eye, w, h, near) {
    if (!(eye.z > 0)) throw new Error('The eye must be in front of the window (z > 0)');
    const s = near / eye.z;
    return {
        left: (-w / 2 - eye.x) * s,
        right: (w / 2 - eye.x) * s,
        bottom: (-h / 2 - eye.y) * s,
        top: (h / 2 - eye.y) * s
    };
}

/**
 * The near plane to use: just short of the pane. Nothing in front of the pane is drawn (it would be
 * in the room), and starting the depth range there rather than a few centimetres from the eye keeps
 * the depth buffer precise out to the distant hills.
 */
export function nearPlane(eye) {
    return eye.z * 0.98;
}

/**
 * Points a three.js camera through the window from the eye: it sits at the eye, unturned, with the
 * off-axis projection. The camera's projection is set here, so its updateProjectionMatrix() must not
 * be called afterwards (it would put back a symmetric frustum).
 */
export function applyWindowProjection(camera, eye, w, h, far) {
    const near = nearPlane(eye);
    const f = windowFrustum(eye, w, h, near);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.quaternion.identity();
    camera.near = near;
    camera.far = far;
    camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld(true);
}
