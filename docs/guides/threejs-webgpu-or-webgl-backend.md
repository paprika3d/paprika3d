---
title: three.js WebGPU or WebGL backend, which one drew the page and what changes with the renderer
phrase: three.js webgpu or webgl
description: How to tell whether a three.js r186 WebGPURenderer page is drawing on WebGPU or on its WebGL 2 fallback, why the same scene looks different under WebGPURenderer and WebGLRenderer even on the fallback, and which custom shaders run on both backends, with the paprika3d plugin's open, look and eval replies.
meta: three.js WebGPU or WebGL: find which backend drew the page, why WebGPURenderer colours differ from WebGLRenderer, and what runs on both.
intent: webgpu-or-webgl-backend
queries:
  - "Currently, does Threejs fully support the webgpu API?"
  - "TSL and webgl2 vs webgpu"
  - "WebGPURenderer produces washed out colours compared to WebGL"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js WebGPU or WebGL backend, which one drew the page and what changes with the renderer

## Two renderers, and two backends for one of them

three.js r186 has two renderers. `WebGLRenderer`, imported from `three`, draws with WebGL 2. `WebGPURenderer`, imported from `three/webgpu`, draws with WebGPU when the browser hands it an adapter, and otherwise falls back to a WebGL 2 backend of its own and warns once. `forceWebGL: true` picks that fallback from the start. From `src/renderers/webgpu/WebGPURenderer.js`:

```js
if ( parameters.forceWebGL ) {

	BackendClass = WebGLBackend;

} else {

	BackendClass = WebGPUBackend;

	parameters.getFallback = () => {

		warn( 'WebGPURenderer: WebGPU is not available, running under WebGL2 backend.' );

		return new WebGLBackend( parameters );

	};

}
```

So "is my page on WebGPU or WebGL" is two questions: which renderer class the page creates, and which backend that class ended up with. They matter separately, because in the scene measured below the look changed with the renderer class, and showed up on `WebGPURenderer`'s WebGL 2 fallback as well.

Whether three.js supports every part of the WebGPU API, and which GPUs and browsers offer WebGPU, are questions for three's release notes and the browsers' own status pages. paprika3d does not answer them.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Which backend drew the page

`open` names the renderer class and its backend on its describe line, and passes on three's fallback warning:

```text
open {"url":"index.html","cwd":"<project>"}

GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
three.js warned: THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.
{"three":"186","renderer":"WebGPURenderer on its WebGL 2 backend (this browser has no WebGPU)","scenes":3,"entities":[]}
```

The machine these replies come from has no GPU, and its headless Chrome offers no WebGPU, so every capture on this page is the WebGL 2 backend. Nothing here shows the WebGPU backend drawing, and nothing here compares the speed of the two: frame times on SwiftShader say nothing of a real GPU.

In the page's own code the answer is `renderer.backend.isWebGPUBackend`, read after `await renderer.init()`. Read earlier, it is wrong on a machine without WebGPU, because the renderer starts with a WebGPU backend and swaps it during `init()`:

```text
eval {"code":"const r = new renderer.constructor();\nconst before = r.backend.isWebGPUBackend === true;\nawait r.init();\nconst after = r.backend.isWebGPUBackend === true;\nr.dispose();\nreturn { before, after }"}

{"before":true,"after":false}
warn: No available adapters.
warn: THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.
```

## The same scene under WebGLRenderer and WebGPURenderer

The test scene: three balls on a checker floor, a pale blue background colour, fog in the same colour, a room environment, a sun, and ACES tone mapping. First on `WebGLRenderer`, saved as a baseline with five colour samples:

```text
look {"save":"webgl"}

Saved as baseline webgl: <project>/paprika3d/baselines/webgl.png

look {"sample":[[400,420],[640,420],[880,420],[640,650],[640,80]]}

Colours (5 × 5 mean, in the page's pixels): (400, 420) #f97053, (640, 420) #a67b0a, (880, 420) #5db45a, (640, 650) #dacab0, (640, 80) #dfe7ef.
```

Then two lines changed, and the page reopened on `WebGPURenderer`:

```diff
-import * as THREE from 'three';
+import * as THREE from 'three/webgpu';

-const renderer = new THREE.WebGLRenderer({ antialias: true });
+const renderer = new THREE.WebGPURenderer({ antialias: true });
+await renderer.init(); // picks the backend: WebGPU if the browser gives an adapter, else WebGL 2
```

```text
look {"compare":"webgl"}

Compare: 37% of pixels differ from webgl (saved 2026-10-28, frame 1, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T11-09-54-876Z/look-1-diff.png

look {"sample":[[400,420],[640,420],[880,420],[640,650],[640,80]]}

Colours (5 × 5 mean, in the page's pixels): (400, 420) #f97053, (640, 420) #a67a0a, (880, 420) #5db45a, (640, 650) #dacab0, (640, 80) #d8dbde.
```

The balls and the near floor sample the same. The sky does not: `#dfe7ef` became a greyer `#d8dbde`, and the diff picture marks the whole sky and the distant floor where the fog is thick. That is the backend-independent part of WebGPURenderer: with tone mapping on, it draws the frame into a render target and tone maps all of it at the end, the clear colour from `scene.background` included. From `src/renderers/common/Renderer.js`, which both backends share:

```js
get needsFrameBufferTarget() {

	const useToneMapping = this.currentToneMapping !== NoToneMapping;
	const useColorSpace = this.currentColorSpace !== ColorManagement.workingColorSpace;

	return useToneMapping || useColorSpace;

}
```

`WebGLRenderer` clears to a colour background as it is, and tone maps inside each material's shader, before the fog is mixed in, in `meshphysical.glsl.js`:

```text
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
```

So under `WebGLRenderer` the background and the fog colour skip tone mapping, and under `WebGPURenderer` they go through it. With `renderer.toneMapping = THREE.NoToneMapping` in both versions, the comparison drops to a thin band of distant floor, which this page did not trace further, and the sky samples the same:

```text
look {"compare":"webgl-notm"}

Compare: 1.6% of pixels differ from webgl-notm (saved 2026-10-28, frame 1, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T11-10-34-246Z/look-1-diff.png

look {"sample":[[640,80],[640,265]]}

Colours (5 × 5 mean, in the page's pixels): (640, 80) #dfe7ef, (640, 265) #e6e8e9.
```

A pale background turning grey under ACES is one cause of a WebGPURenderer page looking washed out next to its WebGLRenderer version, and the one measured here. When moving a page across, keep tone mapping and pick the background colour again by sampling it under `WebGPURenderer`, or turn tone mapping off if the scene does not need it. `look` with `save` before the change and `compare` after it shows which parts moved.

## Custom shaders: GLSL or TSL

`WebGPURenderer` compiles node materials, written in TSL, for whichever backend it got. A GLSL `ShaderMaterial` written for `WebGLRenderer` does not run on it, the WebGL 2 fallback included. A box with one, added to the WebGPURenderer page:

```text
look {"sample":[[640,200]]}

glslBox 1.8% [571, 131, 708, 268] approximate (a sprite or its own shader: see the picture)
Colours (5 × 5 mean, in the page's pixels): (640, 200) #000000.
Page errors since the last call (1):
THREE.NodeBuilder: Material "ShaderMaterial" is not compatible.
```

The same box with `new THREE.MeshBasicNodeMaterial({ colorNode: vec3(0.1, 0.4, 0.9) })`, `vec3` from `three/tsl`:

```text
look {"sample":[[640,200]]}

glslBox 1.8% [571, 131, 708, 268]
Colours (5 × 5 mean, in the page's pixels): (640, 200) #79b8de.
```

The built-in materials (`MeshStandardMaterial` and the rest) needed no change between the two renderers.

## The page

`WebGPURenderer` with a label naming the backend it got, `?webgl` in the address to force the fallback on a machine that has WebGPU, built-in materials, and one TSL material:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Which backend</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}
#backend{position:absolute;left:16px;top:16px;padding:6px 10px;background:#fff;color:#111;font:14px sans-serif;border-radius:4px}</style></head>
<body>
<div id="backend">starting</div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/webgpu":"./node_modules/three/build/three.webgpu.js","three/tsl":"./node_modules/three/build/three.tsl.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ?webgl runs the WebGL 2 backend even where WebGPU exists, to try the fallback on your own machine
const forceWebGL = new URLSearchParams(location.search).has('webgl');
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
await renderer.init(); // the backend is chosen here: WebGPU if the browser gives an adapter, else WebGL 2
document.getElementById('backend').textContent = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // WebGPURenderer applies it to the whole frame, the background colour too
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ef);
scene.fog = new THREE.Fog(0xdfe7ef, 10, 25);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5d4f, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 5, 4);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 7);
camera.lookAt(0, 0.6, 0);

const canvas = document.createElement('canvas');
canvas.width = canvas.height = 64;
const ctx = canvas.getContext('2d');
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
  ctx.fillStyle = (x + y) % 2 ? '#d9c7a3' : '#8a6f4d';
  ctx.fillRect(x * 8, y * 8, 8, 8);
}
const checker = new THREE.CanvasTexture(canvas);
checker.colorSpace = THREE.SRGBColorSpace;
checker.magFilter = THREE.NearestFilter;
checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
checker.repeat.set(5, 5);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: checker }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// built-in materials run on both backends unchanged
[['red', 0xc0392b, 0, 0.5], ['gold', 0xd4a017, 1, 0.3], ['green', 0x2e7d32, 0, 0.9]].forEach(([name, hex, metalness, roughness], i) => {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 24), new THREE.MeshStandardMaterial({ color: hex, metalness, roughness }));
  ball.name = name;
  ball.position.set((i - 1) * 1.8, 0.6, 0);
  scene.add(ball);
});

// a custom look in TSL, which compiles for either backend; a GLSL ShaderMaterial does not run here
const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshBasicNodeMaterial({ colorNode: vec3(0.1, 0.4, 0.9) }));
box.name = 'box';
box.position.set(0, 1.9, 0);
scene.add(box);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

On this machine the label reads `WebGL 2`, which `look` lists over the canvas, and `eval` reads the same answer and the whole-frame pass from the renderer:

```text
look {"sample":[[640,200],[640,80]]}

HTML over the canvas: 1 (div via page), 0 overlap, 0 off-screen, 0 cut off: div#backend "WebGL 2" [16, 16, 93, 43].
On screen (5):
floor 62% [0, 241, 1279, 799] 40 × 40 units
red 2.7% [268, 308, 456, 491]
green 2.7% [823, 308, 1011, 491]
gold 2.6% [548, 308, 731, 491]
box 1.8% [571, 131, 708, 268]
Colours (5 × 5 mean, in the page's pixels): (640, 200) #79b8de, (640, 80) #d8dbde.

eval {"code":"return { label: document.getElementById(\"backend\").textContent, webgpu: renderer.backend.isWebGPUBackend === true, toneMapping: renderer.toneMapping, needsFrameBufferTarget: renderer.needsFrameBufferTarget }"}

{"label":"WebGL 2","webgpu":false,"toneMapping":4,"needsFrameBufferTarget":true}
```

## Pitfalls

- **Rendering before `init()`.** The backend is chosen inside `init()`; await it before the first frame and before reading `renderer.backend`.
- **One import for the renderer's world.** Take `THREE` from `three/webgpu` on a WebGPURenderer page, and TSL functions from `three/tsl`, both mapped to the same three folder. Mapping them to different versions loads three twice; the [multiple instances page](/errors/multiple-instances-of-three-js) covers that warning.
- **Testing the fallback.** A machine with WebGPU never takes the fallback on its own; `forceWebGL: true` (the page's `?webgl`) runs it there. On this host the two paths are the same one.

## Without paprika3d

Log `renderer.backend.isWebGPUBackend` after `init()`, and read the console for three's fallback warning. To compare the two renderers, render the same scene with each, read pixels back from both canvases, and compare them, or put the two screenshots side by side. `chrome://gpu` lists whether WebGPU is enabled in that browser.

## Where people ask about it

- [Currently, does Threejs fully support the webgpu API?](https://discourse.threejs.org/t/currently-does-threejs-fully-support-the-webgpu-api/52592) (discourse.threejs.org, 18,438 views)
- [TSL and webgl2 vs webgpu](https://discourse.threejs.org/t/tsl-and-webgl2-vs-webgpu/87974) (discourse.threejs.org, 336 views)
- [WebGPURenderer produces washed out colours compared to WebGL](https://github.com/mrdoob/three.js/issues/26233) (GitHub, 14 comments)
- [WebGPU - Hardware Requirements?](https://discourse.threejs.org/t/webgpu-hardware-requirements/70165) (discourse.threejs.org, 1,773 views) and [R3F WebGPU, WebGL2 Fallback, Tree Shaking](https://discourse.threejs.org/t/r3f-webgpu-webgl2-fallback-tree-shaking/87188) (discourse.threejs.org, 403 views), which this page does not answer
