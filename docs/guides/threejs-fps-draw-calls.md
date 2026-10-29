---
title: Measure three.js draw calls and FPS, and find what costs the frame
phrase: three.js draw calls and fps
description: How a coding agent measures a three.js page's frame time, FPS, draw calls and triangles with the paprika3d plugin's perf tool, splits them by named group, times a change such as instancing or a lower pixel ratio in one call, and checks which GPU the page drew on.
meta: Measure three.js draw calls and FPS, see which named group costs the frame, and time a fix like instancing or a lower pixel ratio in one call.
intent: threejs-fps-draw-calls
queries:
  - "Three.js Possibly Not Using GPU?"
  - "Where can I see the number of draw calls per frame?"
  - "Debugging low FPS in Three.js"
  - "How to log the FPS in the console?"
  - "Changing pixelRatio based on fps , good or bad idea?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Measure three.js draw calls and FPS, and find what costs the frame

## What a slow frame is made of

A three.js frame costs time in a few places: the JavaScript that updates the scene, one draw call per visible mesh and material (and more in each shadow-casting light's shadow pass), the triangles those calls send, and the pixels the GPU shades, which grow with the square of the pixel ratio. An FPS counter says the frame is slow. It does not say which of these is the cause, and the usual way to find out is to comment things out, reload and watch the counter again.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Its `perf` tool measures the open page's median and p95 frame time, draw calls, triangles and asset size against a budget, lists the costs by named group, and times changes to the page (objects hidden, a pixel ratio, a query string the page reads) against the unchanged page in the same call. `open` and `perf` also name the GPU the page drew on.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with too many draw calls

A warehouse floor with 900 crates, each its own `Mesh` sharing one geometry and one material, a shadow-casting sun, and one dense statue. With `?instanced` in the URL, the page draws the crates as one `InstancedMesh` instead.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Warehouse</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// ?instanced draws the crates as one InstancedMesh instead of 900 meshes.
const INSTANCED = new URLSearchParams(location.search).has('instanced');

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202630);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 14, 26);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10, 20, 10);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x556070 }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// 900 crates sharing one geometry and one material.
const box = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const wood = new THREE.MeshStandardMaterial({ color: 0xb08850 });
const crates = new THREE.Group();
crates.name = 'crates';
const spot = new THREE.Object3D();
const many = INSTANCED ? new THREE.InstancedMesh(box, wood, 900) : null;
for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) {
  spot.position.set(i - 14.5, 0.4, j - 14.5);
  spot.updateMatrix();
  if (many) { many.setMatrixAt(i * 30 + j, spot.matrix); continue; }
  const crate = new THREE.Mesh(box, wood);   // one draw call each, and one more in the shadow pass
  crate.position.copy(spot.position);
  crate.castShadow = true;
  crates.add(crate);
}
if (many) { many.castShadow = true; crates.add(many); }
scene.add(crates);

// One dense statue: one draw call, many triangles.
const statue = new THREE.Mesh(new THREE.TorusKnotGeometry(2, 0.6, 256, 32), new THREE.MeshStandardMaterial({ color: 0xd0d0e0 }));
statue.name = 'statue';
statue.position.set(0, 5, 0);
statue.castShadow = true;
scene.add(statue);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop((t) => {
  statue.rotation.y = t / 1000;
  renderer.render(scene, camera);
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew the page in software (SwiftShader). Every reply says so, and its frame times are hundreds of milliseconds that say nothing about a real GPU. Draw calls, triangles and the cost table are counts, and they do not depend on the GPU. Run folder paths are shortened to `<project>`.

**1. Open the page and check the GPU.** The `GPU` line answers "is three.js using the GPU at all": it is the WebGL renderer string, and it says when that renderer is a software one.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:38479/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["floor","crates","statue"]}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-11-11-816Z
```

On a machine with a GPU the same line names that GPU and has no software note.

**2. Read the draw calls of one frame.** `observe` returns the renderer's counts for the last frame in `harness.renderer`:

```text
observe {}

{"entities":{"floor":{"type":"Mesh","position":[0,0,0]},"crates":{"type":"Group","position":[0,0,0]},"statue":{"type":"Mesh","position":[0,5,0]}},"harness":{"frame":1,"renderer":{"calls":1797,"triangles":54298,"textures":3,"geometries":3,"programs":3},"scene":{"objects":905,"meshes":902,"lights":2,"cameras":0},"errors":[],"changed":null}}
```

1797 draw calls for 902 meshes: the sun's shadow pass draws the shadow casters a second time.

**3. Measure the frame and list its costs.** `perf` with `costs: true` adds the scene's content by named group:

```text
perf {"costs": true}

248.3 ms median frame (p95 273 ms, 4 fps on average), 1797 draw calls, 54298 triangles, 0 MB assets; over budget: frameMs 248.3 of 16.7 ms; desktop budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Work per frame: 245.4 ms a frame that drew (the median of 5), 2.2 ms of it the frame's code; 245.84 ms a frame on average over 5 stepped, the slowest 248.2 ms; paused frames, each timed from its step to the end of its GPU work, with no wait for the display.
Load to first frame: 0.1 s.
Host load 15.4 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Textures 0 MB on the GPU (largest 0 px), 2 shader programs, pixel ratio 1, heap 45.68 MB, 18 long tasks, 0 frames over 3× the median (GC-like pauses); noise between two samples 9.4 ms.
Costs by named group: the main scene's visible objects, each under its nearest named ancestor as `look` names it, counted, not timed, and with no frustum culling (the frame draws only what its camera sees, plus a shadow pass per casting light); `variants` with `hide` times a group. In all 27186 triangles, 27184 casting shadows, 902 draw calls, 0 MB of textures (the first line's 54298 triangles and 1797 draw calls are the frame as drawn, the camera's view plus the shadow pass):
  statue: 16384 triangles, 16384 casting shadows, 1 draw calls, 0 MB of textures
  crates: 10800 triangles, 10800 casting shadows, 900 draw calls, 0 MB of textures
  floor: 2 triangles, 0 casting shadows, 1 draw calls, 0 MB of textures
```

The table splits the two kinds of cost. The statue has most of the triangles in one draw call; the crates have fewer triangles in 900 draw calls. The second line separates the frame's own JavaScript (2.2 ms here) from the whole frame, so a slow update loop shows up apart from slow drawing.

**4. Time the candidate fixes in one call.** Each entry in `variants` is measured on a fresh page against the unchanged one: here the crates hidden, the instanced version through its query string, and half the pixel ratio.

```text
perf {"variants": [{"label": "no crates", "hide": ["crates"]}, {"label": "instanced", "query": "instanced"}, {"label": "half resolution", "pixelRatio": 0.5}]}

baseline: 261.8 ms median (p95 271), work 259 ms, 1797 draw calls, 54298 triangles; over budget: frameMs 261.8 of 16.7 ms; desktop budget
no crates: 104.2 ms median (p95 120.3), work 100.6 ms, 3 draw calls, 32770 triangles; −60% vs baseline; −100% draw calls, −40% triangles
instanced: 264.7 ms median (p95 268.6), work 262.2 ms, 5 draw calls, 54370 triangles; +1% vs baseline; −100% draw calls
half resolution: 112.6 ms median (p95 130.9), work 109.3 ms, 1797 draw calls, 54298 triangles; −57% vs baseline
Work: the median of the frames that drew, of paused frames, each timed from its step to the end of its GPU work, with no wait for the display.
Noise between two samples of the baseline: 0.3 ms. Load to first frame: 0.1 s.
Host load 18.2 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
The page is reloaded as it was.
```

The counts hold on any machine: instancing takes the frame from 1797 draw calls to 5 with the same crates on screen. The times show why this machine cannot judge that change. A software renderer spends its time shading pixels, so halving the pixel ratio cut its frame by more than half while 1792 fewer draw calls changed nothing. On a GPU, each draw call costs CPU time in the browser and the driver, and the same call with the same variants gives the frame times that decide it. Run `perf` where the page will be judged, and read the `GPU` line first.

## Budgets

`perf` judges the frame against the `desktop` budget unless `budget` names another: 16.7 ms a frame, 5 MB of assets, 200,000 triangles and textures up to 2048 px. `budget: "mobile"` uses a phone's limits (3 MB of assets, 100,000 triangles, 1024 px textures) and `budget: "quest"` a Quest's (13.9 ms a frame, 10 MB, 300,000 triangles). These two are limits, not devices: the frame still runs on the machine's own GPU, and the reply adds a line saying that GPU work (shadows, post-processing, a high pixel ratio) costs more on the phone or headset than it shows. Draw calls and triangles are guides in the verdict: past their limit while the frame time is within budget, the reply names them and says they cost nothing while the frame time is in budget.

## Pixel ratio by frame rate: `perf` with `optimize: true`

Lowering the pixel ratio while frames run long, and raising it again when there is time, is the `resolution` switch of the `@paprika3d/three-runtime` layer. `perf` with `optimize: true` measures the page, tries the layer's switches one at a time (`resolution`, `defaults`, `instancing`, `lod`, `dispose`), keeps the ones that help without changing the picture, and writes them to `game-runtime.json`, which the page's `install()` call reads. The page has to import that layer first; the first such call puts `three-runtime.js` in the project and says how. This guide shows no reply of it: on the machine that captured it, frame time is no signal, which is why `perf` ends its first line with "do not optimize for it". Use `perf` variants to see a change's effect, and `optimize: true` on a machine with a GPU.

## What to read in the replies

- The `GPU` line, in `open` and `perf`: which renderer drew the frame, and whether it is a software one.
- `perf`'s first line: median and p95 frame time, FPS, draw calls, triangles, assets and the verdict against the budget.
- `Work per frame`: how much of the frame is the page's own JavaScript.
- `Costs by named group`: which named object holds the triangles and the draw calls. It counts everything visible, before frustum culling; the first line is the frame as drawn, including the shadow pass.
- Each variant's change against the baseline, and the noise between two samples of the baseline: a change smaller than the noise is no change.

## Pitfalls

- **Name your groups.** The cost table and `hide` work by name; an unnamed mesh is counted under its nearest named ancestor.
- **Shadows double the casters' draw calls.** Every mesh with `castShadow` is drawn again for each shadow-casting light.
- **One InstancedMesh draws as one call**, but it is culled as a whole: three.js draws all its instances when any part of its bounds is in view.
- **A frame time measured on a laptop on battery, a busy host or a software renderer is not the frame time on the player's machine.** The `Host load` line and the `GPU` line say which one you have.

## Without paprika3d

In the page, `renderer.info.render.calls` and `renderer.info.render.triangles` hold the counts for the last `render()` call; with a post-processing composer that renders several passes a frame, set `renderer.info.autoReset = false` and call `renderer.info.reset()` once per frame to count the whole frame. For FPS, `stats.js` (`three/addons/libs/stats.module.js`) draws a counter in the page, and logging the time between `requestAnimationFrame` callbacks gives the frame time in the console. The browser's performance panel records a frame and shows the JavaScript, rendering and GPU time in it. To see the GPU name, read `UNMASKED_RENDERER_WEBGL` from the `WEBGL_debug_renderer_info` extension of a WebGL context.
