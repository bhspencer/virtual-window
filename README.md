# Virtual Window

A wall monitor that looks like a real window. The browser renders a countryside scene with three.js
and tracks the viewer's head with the webcam. The view is drawn from where their eyes actually are,
so it shifts as they move, the way the view through a window does. Step left and more of the right
side comes into view; step closer and the view widens; nearby things slide past distant ones.

Nothing is uploaded: face tracking runs in the browser (MediaPipe's face landmarker, in wasm), and
every asset is served from the app itself.

## How it works

- **The projection** (`public/js/window-projection.js`). The screen is treated as a window pane of
  its real, physical size. The camera sits at the viewer's eye, never turned, with an *off-axis*
  frustum whose edges pass exactly through the screen's edges (Kooima, "Generalized Perspective
  Projection"). The scene is in metres, behind the pane.
- **Where the eyes are** (`public/js/eye-position.js`, `head-tracker.js`):
  - **Position:** the face landmarker finds the eyes in each webcam frame. The midpoint of each eye's
    corners is used, because it doesn't move when you glance around.
  - **Distance:** worked out from how far apart the eyes appear, given the webcam's field of view and
    the viewer's interpupillary distance. It's corrected for a turned head, using the face's
    orientation.
  - **Smoothing:** a One Euro filter, steady when you're still, quick when you move.
  - **Losing the face:** the view glides back to a resting viewpoint.
- **The scene** (`public/js/scene/`), all generated in code, with no image or model files:
  - terrain from the garden to distant mountains, with patchwork fields and hedgerows in the middle
    distance;
  - instanced grass blades moving in the wind, wildflowers, a post-and-rail fence and a farm;
  - broadleaf trees and conifer woods;
  - three.js's physical sky, with drifting cumulus;
  - the sun placed for the real time, latitude, longitude and the direction the window faces, with
    shadows and haze to match;
  - stars at night.
- **The frame:** an optional reveal, the depth of the wall around the opening, whose inner sides show
  as you move, as a real window's do. Glazing bars are optional too.

## Running it

The webcam only works on a secure origin. `localhost` counts, so the simplest setup is to run the
server on the machine driving the monitor:

```bash
npm install
./scripts/vendor.sh     # copies three.js and MediaPipe into public/vendor, fetches the face model
./scripts/make-cert.sh  # a self-signed cert, for reaching it from another machine by IP
npm start               # https://localhost:8460/
```

Open it in Chrome or Edge on that machine, press **F** for fullscreen, open the settings (gear, or
**S**) and press **Start tracking**. Once the camera is allowed, tracking starts by itself on later
loads. With no camera, the mouse moves the viewpoint and the wheel moves it nearer or further.

## Setting it up

The illusion depends on the numbers matching the real world. In the settings:

1. **Screen:** the visible picture's width and height, in centimetres. Run it fullscreen, so the page
   fills that area.
2. **Webcam:** where its lens is, measured from the centre of the screen (usually straight up: half
   the screen height plus the bezel), and whether it's tilted down.
3. **Field of view:** sit facing the webcam at a measured distance, enter that distance, and press
   **Calibrate**. Or enter the camera's horizontal field of view from its specification.
4. **Interpupillary distance:** 63 mm is the adult average. If the view seems to zoom wrongly as you
   approach, adjust it.
5. **Mirrored:** if moving left moves the view the wrong way, tick *Picture arrives mirrored*.
6. **Place and time:** the window's height above the ground outside, which way it faces, and your
   latitude and longitude. The sun follows the real time, or a fixed hour.

**Show tracking readout** displays the eye position in centimetres, which is handy while
calibrating: walk to a measured spot and check it agrees.

Settings are kept in the browser's local storage on that machine.

## Tests

```bash
npm test
```

These cover the projection, the eye-position geometry and calibration, the smoothing filter, and the
sun's position.

## Layout

```
server.js                     HTTPS static server (port 8460)
public/index.html, style.css  the page and the settings panel
public/js/main.js             renderer, the eye's source, the loop, the panel
public/js/window-projection.js  the off-axis projection
public/js/eye-position.js     face landmarks -> eye position; calibration; One Euro filter
public/js/head-tracker.js     webcam and face landmarker
public/js/sun.js              the sun's position for a time and place
public/js/settings.js         the settings and their defaults
public/js/scene/              terrain, grass, trees, props, clouds, atmosphere, window frame
public/vendor/, public/models/  three.js, MediaPipe and the face model (scripts/vendor.sh)
test/                         node --test
```
