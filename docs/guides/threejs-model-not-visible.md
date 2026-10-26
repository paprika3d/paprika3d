---
title: Find out why a three.js model is not visible
phrase: three.js model is not visible
description: A three.js object that never shows up is usually at the wrong scale, behind the camera, or never loaded. How a coding agent finds which, with the paprika3d plugin's look, eval and open replies.
intent: threejs-object-not-visible
queries:
  - "Three.JS OBJ Model not showing"
  - "React-Three-Fiber (R3F): GLTF loader loading issue. Why can't I see my model?"
  - "Why is the LittlestTokyo.glb model so small?"
  - "Three JS FBX Loader: model not visible in the scene No errors in the console"
  - "THREE.GLTFLoader: No DRACOLoader instance provided"
author: paprika3d agent
date: 2026-10-14
review: weekly
---
# Find out why a three.js model is not visible

## The problem

The page loads, there is no error, and the model is not there. In three.js this has a short list of usual causes:

- **Scale.** A model exported in centimetres or millimetres, or scaled twice, is far too small for the scene. It is drawn, but it covers a pixel or two.
- **Framing.** The object is behind the camera, outside its view, or beyond its far plane.
- **Loading.** The file returned 404, the loader is missing a decoder (a Draco-compressed glTF needs a `DRACOLoader`), or the load callback never added the result to the scene.
- **Drawing.** The material is transparent, the object is hidden behind another one, or `visible` is false.

Checking these by hand means logging bounding boxes, moving the camera, and reading the network tab. This guide shows how a coding agent gets the answer from tool replies, using paprika3d, a Claude Code plugin that opens three.js pages in its own headless Chrome and reports, after each look, the named objects that drew no pixel.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with two of the mistakes

The car below is scaled down twice, as a model exported in centimetres often is, and the lamp sits behind the camera. Every mesh has a `name`, since the replies refer to objects by name.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Parking lot</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e8);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 4, 10);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x6b8f5e }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Two common mistakes, one per object.
const car = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 2), new THREE.MeshStandardMaterial({ color: 0xd04040 }));
car.name = 'car';
car.scale.setScalar(0.01);          // a model exported in centimetres, scaled down twice
car.position.set(0, 0.7, 0);
scene.add(car);

const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3), new THREE.MeshStandardMaterial({ color: 0x333333 }));
lamp.name = 'lamp';
lamp.position.set(0, 1.5, 14);      // placed at +z, behind a camera that looks toward -z
scene.add(lamp);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

## The tool calls, in order

Each call is followed by the reply paprika3d gave for this page on 2026-10-14. Run folder paths are shortened to `<project>`.

**1. Open it.** The `entities` list confirms that all three objects are in the scene graph, so this is not a loading problem.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:61064/index.html, paused at frame 0.
{"three":"186","scenes":1,"entities":["ground","car","lamp"],"hasConvention":false}
Procedural geometry: import { geo, scatter } from "./geo.js" (see the skill's geometry reference).
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-14T07-50-50-163Z
```

**2. Look.** `look` saves a screenshot and lists what drew pixels and what did not.

```text
look {}

Picture: <project>/paprika3d/runs/2026-10-14T07-50-50-163Z/look-1.png
ID image: <project>/paprika3d/runs/2026-10-14T07-50-50-163Z/look-1-ids.png
On screen (2):
ground 68.0% [0, 241, 1279, 799]
car 0.0% [638, 346, 641, 347]
Never visible: lamp (3 units, behind the camera)
```

Two answers are already here. The car is on screen at 0.0% of the image, in a box 3 pixels wide: it is drawn, at a size nobody would notice in the picture. The lamp drew nothing, and the reply says why: it is behind the camera. Its size, 3 units, rules out a scale problem for it.

**3. Measure the small one.** `eval` runs JavaScript in the page with `scene`, `camera`, `renderer`, `find(name)` and `stats(target)` in scope. `stats` gives each mesh's triangles, whether it is closed, and its world size:

```text
eval {"code": "return stats(\"car\")"}

total  1 meshes  24 v  12 tri
car  24 v  12 tri  closed  vol 0  genus 0  size 0.04×0.014×0.02  [position, normal, uv]
```

The car is 0.04 units long on a ground 20 units wide. Its scale is the cause:

```text
eval {"code": "const c = find(\"car\"); return { scale: c.scale.toArray(), world: c.getWorldPosition(c.position.clone()).toArray(), camera: camera.position.toArray() }"}

{"scale":[0.01,0.01,0.01],"world":[0,0.7,0],"camera":[0,4,10]}
```

**4. Try the fix in the page, then look again.** A change made through `eval` lasts until the page reloads, so the agent can test a fix before it edits the source:

```text
eval {"code": "find(\"car\").scale.setScalar(1); find(\"lamp\").position.z = -4; return \"tried\""}

tried

look {}

Picture: <project>/paprika3d/runs/2026-10-14T07-50-50-163Z/look-2.png
ID image: <project>/paprika3d/runs/2026-10-14T07-50-50-163Z/look-2-ids.png
On screen (3):
ground 62.4% [0, 241, 1279, 799]
car 5.5% [456, 272, 823, 431]
lamp 0.3% [630, 125, 649, 271]
Never visible: none
```

Both objects are on screen now. The agent writes the same two changes into `index.html` (remove the `setScalar(0.01)` line, move the lamp to `z = -4`) and reopens the page with `open` to confirm.

## When the model never loaded

A missing file shows up in the `open` reply. This page loads `models/car.glb` with `GLTFLoader`, and the file is not there:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
new GLTFLoader().load('models/car.glb', (gltf) => { gltf.scene.name = 'car'; scene.add(gltf.scene); });
```

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:61282/index.html, paused at frame 0.
{"three":"186","scenes":1,"entities":[],"hasConvention":false}
Procedural geometry: import { geo, scatter } from "./geo.js" (see the skill's geometry reference).
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found)
HttpError: fetch for "http://127.0.0.1:61282/models/car.glb" responded with 404: Not Found
Failed to load: car.glb (404)
Next: `look` to see it, then `interact` for each interaction the request names.
```

The `Failed to load` line names the file and its status, and `entities` is empty because nothing was added to the scene. A Draco-compressed model loaded without a `DRACOLoader` logs `THREE.GLTFLoader: No DRACOLoader instance provided.` as a console error, which appears in the same `Errors so far` block, or in the `errors` list of the next `observe` if it arrives after the page opened.

## What to read in the replies

- `open`: `entities` (what is in the scene graph), `Errors so far`, `Loaded` and `Failed to load`.
- `look`, `On screen`: a share of 0.0% with a box a few pixels wide means the object is drawn far too small.
- `look`, `Never visible`: each named object that drew no pixel, its largest dimension in world units, and where it is. `behind the camera` is a framing problem. `in view` with a small size is a scale problem. `in view` with a normal size means it is hidden behind something, transparent, or not drawn.
- `eval` with `stats`: the world size of each mesh, to compare against the scene.

## Pitfalls

- **Name the model.** A glTF scene's meshes keep the names from the file; give the root you add a `name` too, so the replies point at it.
- **Compare sizes, not just positions.** A model at the right position and the wrong scale looks like a missing model in a screenshot. The size in the reply is in world units, the same units as the camera position.
- **Edits through `eval` vanish on reload.** Write the fix into the source, then open the page again.

## Without paprika3d

The same checks work by hand in the browser console, once the scene is reachable (for example `window.scene = scene` in the page):

- `new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())` gives the object's world size.
- To test framing, build a `THREE.Frustum` from `camera.projectionMatrix` multiplied by `camera.matrixWorldInverse` and call `frustum.intersectsObject(mesh)`. A point in front of the camera has a negative z in camera space: `obj.getWorldPosition(v).applyMatrix4(camera.matrixWorldInverse).z < 0`.
- The browser's network panel shows a model or texture that returned 404.
- `THREE.BoxHelper` or `THREE.AxesHelper` added to the scene makes a small or distant object easier to spot in the picture.
