#!/usr/bin/env bash
# Copy three.js and the MediaPipe wasm runtime out of node_modules, and fetch the face landmarker
# model. Everything is served from this origin, so the window keeps working with no network once set
# up -- it is meant to run unattended on a wall.
set -euo pipefail

cd "$(dirname "$0")/.."

for pkg in three @mediapipe/tasks-vision; do
    if [ ! -d "node_modules/$pkg" ]; then
        echo "Missing node_modules/$pkg -- run: npm install" >&2
        exit 1
    fi
done

# three.js: the core module, and the few add-ons used (each imports only "three").
three=node_modules/three
rm -rf public/vendor/three
mkdir -p public/vendor/three/addons
cp "$three/build/three.module.js" "$three/build/three.core.js" public/vendor/three/
for addon in objects/Sky.js math/SimplexNoise.js utils/BufferGeometryUtils.js; do
    mkdir -p "public/vendor/three/addons/$(dirname "$addon")"
    cp "$three/examples/jsm/$addon" "public/vendor/three/addons/$addon"
done
echo "Vendored three.js $(node -p 'require("./node_modules/three/package.json").version')"

# MediaPipe: the vision bundle and its wasm runtime.
mp=node_modules/@mediapipe/tasks-vision
rm -rf public/vendor/mediapipe
mkdir -p public/vendor/mediapipe
cp "$mp/vision_bundle.mjs" public/vendor/mediapipe/
cp -r "$mp/wasm" public/vendor/mediapipe/wasm
echo "Vendored MediaPipe tasks-vision $(node -p 'require("./node_modules/@mediapipe/tasks-vision/package.json").version')"

# The face landmarker: 478 landmarks, including the irises, which give the eyes' positions.
mkdir -p public/models
out=public/models/face_landmarker.task
if [ -s "$out" ]; then
    echo "Have the face landmarker model"
else
    echo "Fetching the face landmarker model…"
    curl -sSfL -o "$out" https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
fi
ls -lh public/models
