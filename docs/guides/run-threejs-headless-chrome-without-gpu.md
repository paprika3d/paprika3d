---
title: Run three.js in headless Chrome without a GPU, and know what drew the frame
phrase: three.js in headless chrome without a gpu
description: How a coding agent runs a three.js page in headless Chrome on a machine with no GPU, with the paprika3d plugin: WebGL 2 on the SwiftShader software renderer, the GPU line that names the renderer, what the context supports, and which results a software renderer can and cannot be trusted for.
meta: Run three.js in headless Chrome without a GPU: what SwiftShader renders, which results to trust, and how to tell which renderer drew the frame.
intent: threejs-headless-chrome-webgl
queries:
  - "Rendering WebGL image in headless chrome without a GPU"
  - "Headless rendering"
  - "Running threejs on headless chromium using gpu"
  - "Swiftshader is going away, what to do?"
  - "How to enable WebGL in Headless Chrome >= 96 within selenium-docker project to run Chrome inside a docker container without XVFB"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Run three.js in headless Chrome without a GPU, and know what drew the frame

## Where headless WebGL goes wrong

A three.js page needs a WebGL 2 context. On a laptop, Chrome gets one from the GPU. On a build server, a container or a cloud machine there is often no GPU at all, and headless Chrome then has two outcomes: it draws WebGL in software with SwiftShader, a CPU implementation of the GPU's work, or it refuses to create the context and three.js logs "Error creating WebGL context". Which one you get depends on the Chrome version and its flags. Chrome has been turning off its automatic fallback to SwiftShader for WebGL, and asks for the switch `--enable-unsafe-swiftshader` to keep it; on the machine that captured this guide, Chrome 156 headless still created a SwiftShader context with or without that switch.

Even when the page draws, a test written for it needs to know what drew it. A software renderer gives the same picture as a GPU, slower by a large factor, so a frame time measured on it says nothing about the player's machine.

paprika3d is a Claude Code plugin and MCP server that runs three.js pages in its own headless Chrome. It uses the Chrome already installed on the machine (its usual install path, PATH, or Playwright's or Puppeteer's cache, or the path in `PAPRIKA3D_CHROME`), downloads nothing, and on Linux starts it with `--no-sandbox` and `--enable-unsafe-swiftshader`. Every reply that times a frame, and the reply of `open`, carries a `GPU` line naming the renderer, with a note when it is a software one.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later. No GPU is needed.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with a heavier shader

A turntable with a vase in a clearcoat `MeshPhysicalMaterial`, lit by a shadow-casting spot light: more shader work than a plain material, to show the software renderer runs all of it.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Turntable</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2230);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(0, 2.2, 6);
camera.lookAt(0, 0.8, 0);
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x302820, 1.2));
const key = new THREE.SpotLight(0xffffff, 60, 20, Math.PI / 6, 0.4);
key.position.set(3, 6, 3);
key.castShadow = true;
scene.add(key);

const stand = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.2, 64), new THREE.MeshStandardMaterial({ color: 0x3a3f4a }));
stand.name = 'stand';
stand.position.y = 0.1;
stand.receiveShadow = true;
scene.add(stand);

// A physical material with clearcoat: a heavier shader than the standard one.
const vase = new THREE.Mesh(
  new THREE.LatheGeometry([[0, 0], [0.5, 0], [0.7, 0.4], [0.45, 1.2], [0.3, 1.5], [0.4, 1.7]].map(([x, y]) => new THREE.Vector2(x, y)), 64),
  new THREE.MeshPhysicalMaterial({ color: 0x2f7fd0, roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide }));
vase.name = 'vase';
vase.position.y = 0.2;
vase.castShadow = true;
scene.add(vase);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop((t) => {
  vase.rotation.y = t / 2000;
  renderer.render(scene, camera);
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, running Chrome 156 headless. Run folder paths are shortened to `<project>`.

**1. Open the page and read the GPU line.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33243/index.html in 0.1 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["stand","vase"]}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-42-18-435Z
```

(The reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out here.)

The `GPU` line is the WebGL renderer string. `ANGLE (Google, Vulkan ... SwiftShader driver)` means Chrome's ANGLE layer runs WebGL on SwiftShader's Vulkan implementation, on the CPU. On a machine whose GPU Chrome uses, the same line names that GPU and has no note.

**2. Ask the context what it supports.** `eval` runs code in the page with `renderer` in scope, so the WebGL context is one call away:

```text
eval {"code": "const gl = renderer.getContext(); const dbg = gl.getExtension('WEBGL_debug_renderer_info'); return { webgl2: gl instanceof WebGL2RenderingContext, vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL), maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxSamples: gl.getParameter(gl.MAX_SAMPLES), floatColorBuffer: !!gl.getExtension('EXT_color_buffer_float') }"}

{"webgl2":true,"vendor":"Google Inc. (Google)","renderer":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)","maxTextureSize":8192,"maxSamples":4,"floatColorBuffer":true}
```

SwiftShader gives a full WebGL 2 context: multisampling (`maxSamples` 4, so `antialias: true` works), float render targets (which post-processing and some shadow setups use), and textures up to 8192 pixels on a side.

**3. Look at it.** The picture is drawn by the same software renderer, and `look` lists what is in it:

```text
look {}

Picture: <project>/paprika3d/runs/2026-10-28T05-42-18-435Z/look-1.png
Pixels: brightness 14%, colour saturation 45%, 0% near black, 0% blown out.
Hues: blue 97% of the frame; over the objects (15.6% of it): blue 79%, grey 21%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
On screen (2):
stand 9.7% [335, 440, 944, 672] 3.4 × 3.4 units
vase 5.9% [515, 197, 764, 531]
Never visible: none
```

**4. Read a pixel back.** A frame rendered and read in the same call returns the vase's colour from the centre of the canvas, so pixels are there to test against:

```text
eval {"code": "const gl = renderer.getContext(); const px = new Uint8Array(4); renderer.render(scene, camera); gl.readPixels(640, 400, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return Array.from(px)"}

[0,74,151,255]
```

**5. What a frame time means here.** `perf` measures the frame and says in its first line that this one is no signal:

```text
perf {}

67.9 ms median frame (p95 84.8 ms, 14 fps on average), 3 draw calls, 1536 triangles, 0 MB assets; over budget: frameMs 67.9 of 16.7 ms; desktop budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Work per frame: 77 ms a frame that drew (the median of 8), 0.4 ms of it the frame's code; 76.42 ms a frame on average over 8 stepped, the slowest 83.2 ms; paused frames, each timed from its step to the end of its GPU work, with no wait for the display.
Load to first frame: 0.1 s.
Host load 10.7 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Textures 0 MB on the GPU (largest 0 px), 3 shader programs, pixel ratio 1, heap 18.77 MB, 58 long tasks, 0 frames over 3× the median (GC-like pauses); noise between two samples 4.1 ms.
```

The draw calls, triangles and the `0.4 ms of it the frame's code` part are about the page and hold on any machine. The milliseconds of drawing are the CPU doing the GPU's work, and would be a small fraction of that on a GPU.

## What a software renderer can and cannot tell you

Trust on SwiftShader: whether the page creates a context and draws, what is on screen and at what size, console errors and failed loads, game state after inputs on the paused clock, draw call and triangle counts, and pictures. paprika3d's clock is paused and stepped at 1/60 s per frame whatever the renderer's speed, so a slow renderer changes how long a call takes, not the game's state after it.

Do not trust on SwiftShader: frame times, frames per second and anything tuned by them (`perf` with `optimize: true`, a pixel ratio chosen by frame rate). Run those on the machine with the GPU the page will be judged on, and read its `GPU` line first.

Expect calls to be slower: the first frames of a large scene take seconds in software, and `look` with `sheet` reloads and replays the page for each cell.

A `WebGPURenderer` page has no WebGPU in this headless Chrome: paprika3d passes no WebGPU flag, since headless Linux cannot present a WebGPU canvas, so three.js runs such a page on its WebGL 2 backend here.

## What paprika3d does not do

- It does not install Chrome, a GPU driver or anything in a container. It uses the Chrome on the machine and the renderer that Chrome picks.
- It does not set up a GPU for Docker or a CI runner, or pass one into a container. paprika3d's own benchmarks run natively on macOS with a real GPU.
- It does not make a software frame time into a GPU one. It names the renderer so the agent knows which numbers to skip.

## Pitfalls

- **three.js needs WebGL 2.** Current three.js releases dropped WebGL 1, so a browser with a WebGL 1 context and no WebGL 2 fails where an older three.js version ran. Check `webgl2` as in step 2.
- **Containers often run Chrome as root**, where its sandbox does not start; `--no-sandbox` is the usual fix, and paprika3d adds it on Linux.
- **Name the renderer in every result you keep.** A frame time from SwiftShader and one from a GPU look alike in a log.
- **Pictures from two renderers can differ by a few pixels** at edges and in shading, so compare pictures taken on the same renderer.

## Without paprika3d

With Puppeteer or Playwright on a machine with no GPU, launch Chrome with `--use-angle=swiftshader` and `--enable-unsafe-swiftshader` to ask for SwiftShader explicitly; Chrome's current headless mode needs no Xvfb. Then read `UNMASKED_RENDERER_WEBGL` from the `WEBGL_debug_renderer_info` extension, as in step 2, to confirm which renderer the page got. Using a real GPU inside a container takes the vendor's container runtime and driver on the host (for NVIDIA, the NVIDIA Container Toolkit), and the same renderer string then says whether Chrome picked it up.
