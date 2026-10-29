---
title: Find out why a three.js model is not visible
phrase: three.js model is not visible
description: A three.js object that never shows up is usually at the wrong scale, behind the camera, or never loaded. How a coding agent finds which, with the paprika3d plugin's look, eval and open replies.
meta: Find out why a three.js model is not visible: wrong scale, behind the camera, or never loaded. How a coding agent finds which, with paprika3d.
intent: threejs-object-not-visible
queries:
  - "Three.JS OBJ Model not showing"
  - "React-Three-Fiber (R3F): GLTF loader loading issue. Why can't I see my model?"
  - "Why is the LittlestTokyo.glb model so small?"
  - "Three JS FBX Loader: model not visible in the scene No errors in the console"
  - "THREE.GLTFLoader: No DRACOLoader instance provided"
  - "Three JS not rendering anything at all. It's all a black screen"
  - "Three.js code not working in browsers"
  - "Trying to make a GLB/GLTF appear"
  - "three.js - how to limit the zooming so that object does not break due to camera"
  - "Three.js - Things disappear when zooming out"
  - "Moving the camera model will shake if the coordinates are large"
  - "shaderMaterial: render-order with logarithmicDepthBuffer is wrong"
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

## Why is my three.js scene a black screen with nothing rendered?

A first scene that shows nothing but black, with no error in the console, is the same question asked of the whole page, and the same replies answer it. This is the scene part of a first page as the forum threads post it, and as an agent often writes it; the renderer and the import map are the parking-lot page's:

```js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);

const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x44aa88 }));
cube.name = 'cube';
scene.add(cube);

renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
});
```

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); nothing here depends on it. They are cut to the lines this section discusses, with nothing reworded.

```text
look {}

Pixels: brightness 0%, colour saturation 0%, 100% near black, 0% blown out. Mostly black: a blank or unlit frame? Pale: little colour.
On screen (0):
Never visible: cube (1.01 units, in view)
In view but no pixel: too small for the scene (check its size against the scene), hidden behind something, or not drawn.

eval {"code": "const lights = []; scene.traverse(o => { if (o.isLight) lights.push(o.type); }); return { camera: camera.position.toArray(), cube: find(\"cube\").position.toArray(), lights }"}

{"camera":[0,0,0],"cube":[0,0,0],"lights":[]}
```

The page has two faults, and the frame hides both. A new camera and a new mesh both start at the origin, so the camera is inside the cube, where every face points away from it and is culled. The `Never visible` hint does not name this case: the cube is "in view" because the camera is inside its box, and it is the positions from `eval` that show it. The second fault waits behind the first:

```text
eval {"code": "camera.position.set(0, 1, 3); camera.lookAt(0, 0, 0); return \"moved\""}

moved

look {}

Pixels: brightness 0%, colour saturation 0%, 100% near black, 0% blown out; 0% of the picture changed since the last look. Mostly black: a blank or unlit frame? Pale: little colour.
Hues: grey 100% of the frame; over the objects (7% of it): grey 100%.
On screen (1):
cube 7% [504, 274, 777, 554]
```

The cube now covers 7% of the frame, and 0% of the picture changed: it is drawn black on a black background. A `MeshStandardMaterial` shows the light that reaches it and nothing more, and the scene has none (`lights: []`). A `MeshBasicMaterial` ignores lights, which is why tutorials that start with one show a colour here.

```text
eval {"code": "scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3)); return \"lit\""}

lit

look {}

Pixels: brightness 3%, colour saturation 4%, 93% near black, 0% blown out; 8% of the picture changed since the last look. Mostly black: the objects cover 7% of the frame.
Hues: grey 93%, green 7% of the frame; over the objects (7% of it): green 100%.
```

The `Pixels` line changed its note from "a blank or unlit frame?" to "the objects cover 7% of the frame", its way of saying a dark background with a lit object in it. The fix in the source is the two changes tried here: a camera position set back from the scene, and a light.

A black page can also be a script that never ran. Without the import map, the same page stops at its first line, and `open` says so in place of the usual reply:

```text
open {"url": "index.html", "cwd": "<project>"}

game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:35385/index.html
Failed to resolve module specifier "three". Relative references must start with either "/", "./", or "../".
```

A canvas with no height is the third way to a blank page with no error; `open` names it on its own line, and [the responsive canvas guide](/guides/threejs-responsive-canvas-resize) shows that reply and its fix.

## Why do three.js objects disappear when zooming in or out?

A camera draws what lies between its near and far planes and nothing else, the third and fourth arguments of `PerspectiveCamera`. Zoom out until an object is further away than `far`, and it vanishes whole; move in closer than `near`, and the faces nearest the camera are cut open. This harbour page has a far plane of 100 and a lighthouse further out than that:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Harbour</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d0f0);
// far = 100 leaves out the lighthouse at z = -150
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 6, 20);
camera.lookAt(0, 4, -100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x335577, 2));

const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x2f6f9f }));
sea.name = 'sea';
sea.rotation.x = -Math.PI / 2;
scene.add(sea);

const boat = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 2), new THREE.MeshStandardMaterial({ color: 0xc8553d }));
boat.name = 'boat';
boat.position.set(-4, 1, 0);
scene.add(boat);

const lighthouse = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 30), new THREE.MeshStandardMaterial({ color: 0xf2efe6 }));
lighthouse.name = 'lighthouse';
lighthouse.position.set(10, 15, -150);
scene.add(lighthouse);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

```text
look {}

World's edge: 6% of the picture is background below the horizon, in [0, 386, 1279, 436], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.
On screen (2):
sea 43% [0, 437, 1279, 799] 400 × 400 units
boat 2.8% [325, 549, 598, 654] 6 × 2 units, across the view
Never visible: lighthouse (30 units, behind the camera)

eval {"code": "const l = find(\"lighthouse\"); return { near: camera.near, far: camera.far, lighthouse: +camera.position.distanceTo(l.position).toFixed(1) }"}

{"near":0.1,"far":100,"lighthouse":170.5}
```

Read the `Never visible` line with care here: the lighthouse is in front of the camera, 170.5 units away, and `look` reports it as "behind the camera". Today `look` gives the same label to an object behind the camera and one beyond the far plane, so when a named object is "behind the camera" in a picture that faces it, compare its distance with `camera.far` as the `eval` above does. The `World's edge` line has the same blind spot: the sea is 400 units across, and the sky band under the horizon is where the far plane cut it, not where it ends.

To see the "disappears when I zoom out" thread's fault, `look` with `cameras` pictures the same moment from several distances in one call, as `OrbitControls` would place the camera when zooming out:

```text
look {"cameras": [{"position": [-4, 8, 30], "lookAt": [-4, 1, 0], "label": "close"}, {"position": [-4, 30, 80], "lookAt": [-4, 1, 0], "label": "zoomed out"}, {"position": [-4, 50, 120], "lookAt": [-4, 1, 0], "label": "further"}]}

close: on screen: sea, boat; world's edge 9% of the picture; pixels: brightness 47%, colour saturation 58%, 0% near black, 0% blown out
zoomed out: on screen: sea, boat; world's edge 34% of the picture; pixels: brightness 53%, colour saturation 53%, 0% near black, 0% blown out
further: on screen: sea; world's edge 58% of the picture; pixels: brightness 62%, colour saturation 45%, 0% near black, 0% blown out
```

At the third distance the boat is gone and most of the sea is cut away. The fix is a far plane that covers the furthest the camera can be from the furthest thing it should see, tried in the page first; the camera labels are kept, so the second call names them:

```text
eval {"code": "camera.far = 1000; camera.updateProjectionMatrix(); return \"far 1000\""}

far 1000

look {}

World's edge: 3% of the picture is background below the horizon, in [0, 386, 1279, 408], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.
On screen (3):
sea 46% [0, 409, 1279, 799] 400 × 400 units
boat 2.8% [325, 549, 598, 654] 6 × 2 units, across the view
lighthouse 0.53% [670, 262, 710, 416] 30 × 8 units
Never visible: none

look {"cameras": ["close", "zoomed out", "further"]}

close: on screen: sea, boat, lighthouse; world's edge 4% of the picture; pixels: brightness 45%, colour saturation 60%, 0% near black, 0% blown out
zoomed out: on screen: sea, lighthouse, boat; world's edge 12% of the picture; pixels: brightness 43%, colour saturation 62%, 0% near black, 0% blown out
further: on screen: sea, lighthouse, boat; world's edge 18% of the picture; pixels: brightness 43%, colour saturation 61%, 0% near black, 0% blown out
```

Changing `near` or `far` takes `camera.updateProjectionMatrix()` to apply, which is the line most often left out. The other half of the fix is a limit on the zoom: `OrbitControls` takes `minDistance` and `maxDistance`, so the camera can never come closer than the near plane allows or go further than the far plane reaches. A `scene.fog` that ends before `far` hides the edge where things are cut.

A far plane cannot simply be made huge, because the depth buffer's precision is spread between `near` and `far` and most of it sits close to `near`. Pushing `near` down is what costs precision: faces a little apart in the distance start to flicker through each other. `look`'s `Surfaces` line names such pairs with the gap the depth buffer needs at their distance, and [the z-fighting guide](/guides/threejs-z-fighting-flicker) shows that gap growing as `near` shrinks. For a scene that needs both (a city, a planet), `logarithmicDepthBuffer: true` on the renderer spreads the precision out; a custom `ShaderMaterial` then needs three's `logdepthbuf` shader chunks to write the same depth as the built-in materials, which is what the render-order thread runs into. Vertices that shake at large coordinates are a different limit, the precision of 32-bit floats far from the origin, which no near or far value changes and none of these replies measures; the usual fix keeps the camera near the origin and moves the world instead.

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
