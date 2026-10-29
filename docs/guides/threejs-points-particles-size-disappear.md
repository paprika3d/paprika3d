---
title: three.js Points particles: size by distance, why they disappear, and how many to draw
phrase: three.js points particles
description: How three.js sizes a Points particle on screen (sizeAttenuation, the pixel ratio, the canvas height and the distance), why a moving particle system vanishes as a whole when the camera turns (its bounding sphere from the first frame), and what the paprika3d plugin's look, eval and perf show about each, including what perf's counts leave out for points.
meta: three.js Points particles: the size formula, why a moving particle cloud vanishes when the camera turns, and how to measure the count.
intent: points-particles-size-count
queries:
  - "Rendering a large number of colored particles using three.js and the canvas renderer"
  - "Scaling particles based on camera distance"
  - "PointsMaterial. How Do I Prevent Vanishing Points On Zoom Out?"
  - "Scale X and Y in Points shader"
  - "GPU-driven particle system"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js Points particles: size by distance, why they disappear, and how many to draw

## How big a point is on screen

A `THREE.Points` object draws one square sprite per vertex, all in one draw call. Its `PointsMaterial` has a `size`, and what that size means depends on `sizeAttenuation`:

- **`sizeAttenuation: true`** (the default): `size` is in world units. Under a perspective camera the shader draws each point `size × pixelRatio × (canvas height / 2) / depth` pixels wide, where depth is the point's distance in front of the camera. A point twice as far is half as wide.
- **`sizeAttenuation: false`**: `size` is in CSS pixels (times the pixel ratio), the same at every distance.

The GPU clamps the result to the range of point sizes it supports, which a page reads from `gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)`. A point is always square; scaling X and Y apart, or drawing round points, is done in the fragment shader or with a `map` texture whose corners are clear.

## Why a particle system vanishes

Points are culled like meshes: three tests the geometry's bounding sphere against the camera's view and skips the whole object when it is outside. The sphere is computed once, the first time it is needed, from the positions at that moment. A particle system that writes new positions every frame (sparks rising from a fire, snow falling, a trail) keeps the sphere of its first frame. When the particles start at the emitter, that sphere is a small ball around the emitter, and the whole system disappears as soon as the camera turns so that the emitter is out of view. The fix for particles that move every frame is `points.frustumCulled = false`, which is what `burst` in paprika3d's `fx.js` sets on its pool; for a cloud that changes rarely, `geometry.computeBoundingSphere()` after each change keeps culling.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `look` with `cameras` pictures the page from several places in one call, which shows both the size change and a vanishing system; `eval` reads the material's size settings, the GPU's point size range and the bounding sphere beside the particles' real positions.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A campfire with rising sparks

3000 sparks start at a fire and rise for 180 frames, their positions written on the CPU every frame. The page turns frustum culling off for them. `?bug=culled` leaves culling on, `?fixed` gives the sparks a size in pixels instead of world units, and `?n=` sets their number.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Campfire</title>
<style>html,body{margin:0;overflow:hidden;background:#07080c}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// ?n= sets the number of sparks (3000 by default); ?fixed draws each spark 3 pixels wide at any distance;
// ?bug=culled leaves frustum culling on, with the bounding sphere three computed on the first frame.
const params = new URLSearchParams(location.search);
const N = Number(params.get('n') ?? 3000), FIXED = params.has('fixed'), CULLED = params.get('bug') === 'culled';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080c);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 8, 34);
camera.lookAt(0, 10, 0);
scene.add(new THREE.HemisphereLight(0x8090b0, 0x201810, 1));

const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x2b2a26 }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const fire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.5, 12), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
fire.name = 'fire';
fire.position.y = 1.25;
scene.add(fire);

// A pool of sparks that start at the fire and rise for 180 frames, then start again.
const LIFE = 180;
const positions = new Float32Array(N * 3);
const sparks = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
  // sizeAttenuation (on by default): size is in world units, so a spark shrinks with distance; off, size is in pixels.
  new THREE.PointsMaterial({ color: 0xffb347, ...(FIXED ? { size: 3, sizeAttenuation: false } : { size: 0.35 }) }));
sparks.name = 'sparks';
sparks.frustumCulled = CULLED;   // the sparks' bounds move every frame, so the correct page turns culling off
scene.add(sparks);

let frame = 0;
renderer.setAnimationLoop(() => {
  frame++;
  for (let i = 0; i < N; i++) {
    const start = (i * 7919) % LIFE, age = frame < start ? 0 : (frame - start) % LIFE;   // not yet started: at the fire
    const a = i * 2.39996, r = 0.3 + age * 0.03;
    positions.set([Math.cos(a) * r, 2 + age * 0.22, Math.sin(a) * r], i * 3);
  }
  sparks.geometry.attributes.position.needsUpdate = true;
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew the page in software (SwiftShader). Culling and point sizes are worked out the same way on a GPU; the point size range is this renderer's, and the frame times in the last reply are not used. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. The vanishing sparks.** Open the culled version and look once, which draws the first frame while every spark is still at the fire. Then run 200 frames so the column fills, and picture it from the page's camera and from the same spot looking up the column:

```text
open {"url": "index.html?bug=culled", "cwd": "<project>"}

Opened http://127.0.0.1:40335/index.html?bug=culled in 0.2 s, paused at frame 0.

look {}

On screen (3):
ground 27% [0, 559, 1279, 799] 60 × 60 units
fire 0.22% [609, 592, 670, 662]
sparks 0.016% [629, 595, 649, 606]

interact {"steps": [{"wait": 200}]}

look {"cameras": [{"label": "the fire", "position": [0, 8, 34], "lookAt": [0, 10, 0]}, {"label": "up the column", "position": [0, 8, 34], "lookAt": [0, 36, 0]}]}

Picture: <project>/paprika3d/runs/2026-10-28T10-34-24-838Z/look-3-cameras.png (2 cameras, left to right, top to bottom, at frame 201, no reload; the game's own camera is not moved)
the fire: on screen: ground, sparks, fire; world's edge 16% of the picture; pixels: brightness 5%, colour saturation 42%, 97% near black, 0% blown out. Mostly black: a blank or unlit frame?
up the column: on screen: nothing; pixels: brightness 3%, colour saturation 42%, 100% near black, 0% blown out. Mostly black: a blank or unlit frame?
```

On the first frame the sparks are a small patch at the fire. After 200 frames the left picture shows a column of sparks rising out of the frame, and the right one, looking up that column, shows nothing at all: `on screen: nothing`. The sparks are there, and three never drew them.

**2. Read the sphere and the sparks.**

```text
eval {"code": "const s = find(\"sparks\"), g = s.geometry, p = g.attributes.position;\nlet top = 0; for (let i = 1; i < p.array.length; i += 3) top = Math.max(top, p.array[i]);\nconst b = g.boundingSphere;\nreturn { frustumCulled: s.frustumCulled, sphere: b && { center: b.center.toArray().map(v => +v.toFixed(1)), radius: +b.radius.toFixed(1) }, highestSpark: +top.toFixed(1) }"}

{"frustumCulled":true,"sphere":{"center":[0,2.1,0],"radius":0.3},"highestSpark":41.4}
```

A sphere 0.3 units across at the fire, for sparks that reach 41.4 units up. The camera looking up the column does not see the fire, so it does not see the sphere, and three skips all 3000 sparks.

**3. Turn culling off on the live page and look again.**

```text
eval {"code": "find(\"sparks\").frustumCulled = false;"}

interact {"steps": [{"wait": 1}]}

look {"cameras": [{"label": "the fire", "position": [0, 8, 34], "lookAt": [0, 10, 0]}, {"label": "up the column", "position": [0, 8, 34], "lookAt": [0, 36, 0]}]}

up the column: on screen: sparks; pixels: brightness 5%, colour saturation 42%, 97% near black, 0% blown out. Mostly black: the objects cover 2.1% of the frame.
```

**4. Size by distance.** The correct page, after 200 frames, from 34 and from 300 units away, with an `eval` that works out each spark's width in pixels by the formula above and reads the renderer's point size range:

```text
interact {"steps": [{"wait": 200}]}

look {"cameras": [{"label": "34 units away", "position": [0, 8, 34], "lookAt": [0, 10, 0]}, {"label": "300 units away", "position": [0, 20, 300], "lookAt": [0, 20, 0]}]}

300 units away: on screen: ground, sparks, fire; pixels: brightness 3%, colour saturation 42%, 100% near black, 0% blown out. Mostly black: the objects cover 0.29% of the frame.

eval {"code": "const m = find(\"sparks\").material, gl = renderer.getContext(), h = renderer.domElement.clientHeight;\nconst px = (d) => +(m.sizeAttenuation ? m.size * renderer.getPixelRatio() * (h / 2) / d : m.size * renderer.getPixelRatio()).toFixed(2);\nreturn { size: m.size, sizeAttenuation: m.sizeAttenuation, pixelsAt34: px(34), pixelsAt300: px(300), pointSizeRange: [...gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)] }"}

{"size":0.35,"sizeAttenuation":true,"pixelsAt34":4.12,"pixelsAt300":0.47,"pointSizeRange":[1,1023]}
```

At 34 units a spark is about four pixels wide; at 300 units the formula asks for less than half a pixel. This renderer's smallest point is one pixel, so the far sparks are drawn at one pixel and the column thins to a lattice of single dots. On another GPU the same `eval` reads its own range. The same calls on `?fixed`:

```text
300 units away: on screen: sparks, ground, fire; pixels: brightness 3%, colour saturation 42%, 100% near black, 0% blown out. Mostly black: the objects cover 0.38% of the frame.

{"size":3,"sizeAttenuation":false,"pixelsAt34":3,"pixelsAt300":3,"pointSizeRange":[1,1023]}
```

Three pixels at both distances: the far column is solid where the attenuated one was dotted. Constant pixel size is right for sparks, stars and data points that must stay readable; attenuation is right for particles that should look like objects in the world, such as dust or snow close to the camera.

**5. How many sparks.** `perf` with `query` variants loads the page with 30000 and 300000 sparks:

```text
perf {"variants": [{"label": "30000 sparks", "query": "n=30000"}, {"label": "300000 sparks", "query": "n=300000"}]}

baseline: 29.1 ms median (p95 64.4), work 48.8 ms, 3 draw calls, 72 triangles; over budget: frameMs 29.1 of 16.7 ms; desktop budget
30000 sparks: 77.6 ms median (p95 103.2), work 115.6 ms, 3 draw calls, 72 triangles; +167% vs baseline
300000 sparks: 426.4 ms median (p95 443.3), work 5150.1 ms, 3 draw calls, 72 triangles; +1365% vs baseline
Host load 17.5 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

The draw calls and triangles do not move: a `Points` object is one draw call at any count, and it has no triangles, so these counts see none of the sparks. What a count costs is the JavaScript that writes the positions each frame, the vertices, and the pixels the points cover, and of those this reply measures the time alone. The times here are a software renderer's on a loaded host; on the machine the page targets, the same call gives the count at which the frame leaves its budget. A system whose positions are worked out in the vertex shader from a start time and a velocity, instead of written from JavaScript, moves that cost to the GPU.

## What paprika3d does not do

- `perf`'s counts and its cost table count no points: a `Points` object shows as one draw call and zero triangles whatever its size.
- No line names a culled particle system. `look` with `cameras` shows it gone from some views, as in step 1, and the `eval` in step 2 says why.
- It does not write particle shaders. `burst` in `fx.js` is a seeded pool of soft round dots with culling off, updated on the CPU; anything else is the page's own code.
- For a burst on an event (a hit, a pickup), `feel` reports the particles a `Points` pool shows after the steps that cause it; this guide's page has no such event.

## Pitfalls

- **The first frame decides the sphere.** A pool that starts at the emitter has the smallest sphere it will ever have on its first frame.
- **Points are squares.** A round particle needs a `map` with clear corners and `transparent: true`, or `alphaTest`; additive blending and `depthWrite: false` keep overlapping sprites from cutting each other.
- **The pixel ratio scales the size.** On a phone at a pixel ratio of 3 an attenuated point covers nine times the pixels of the same point at a ratio of 1.
- **An orthographic camera ignores `sizeAttenuation`.** The shader applies the distance under a perspective projection and skips it under an orthographic one.
- **A colour per point** is a `color` attribute on the geometry with `vertexColors: true` on the material, still in the one draw call.
- **Upload what you change.** After writing positions, set `geometry.attributes.position.needsUpdate = true`, as the page does every frame.

## Without paprika3d

`points.geometry.boundingSphere` in the console, beside the largest coordinates in the position array, gives the comparison of step 2. A `THREE.Box3Helper` around `points.geometry.boundingBox` (after `computeBoundingBox()`) shows the culling volume in the scene. `renderer.getContext().getParameter(gl.ALIASED_POINT_SIZE_RANGE)` gives the point size range, and the `points.glsl.js` chunk in three's source holds the size formula. The three.js docs for `PointsMaterial` describe `size` and `sizeAttenuation`, and the `webgl_points_sprites` and `webgl_buffergeometry_points` examples draw many points with and without a texture.
