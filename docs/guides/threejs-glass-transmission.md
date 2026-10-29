---
title: three.js glass transmission: why glass behind glass vanishes or goes black, and the extra render it costs
phrase: three.js glass transmission
description: How MeshPhysicalMaterial transmission draws glass in three.js r186 (a second render of every opaque object into a texture the glass samples), why a glass object behind another glass object disappears, why a bottle can turn near black, and how a coding agent checks each with the paprika3d plugin, reading every glass material with eval, sampling the drawn colours with look, and counting the extra draw calls with perf variants.
meta: three.js glass with transmission hides other glass, turns black or costs a second render? Check each case with real samples and draw calls.
intent: glass-transmission-black-or-slow
queries:
  - "MeshTransmissionMaterial: more realistic glas/epoxy/gelatin"
  - "Adding meshPhysicalMatreial to create a glass like semi transparent material drops the the performance"
  - "MeshTransmissionMaterial poor performances URGENT"
  - "MeshTransmissionMaterial turns black mesh gets subtracted"
  - "MeshPhysicalMaterial transmission / ior flickering"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js glass transmission: why glass behind glass vanishes or goes black, and the extra render it costs

## How three.js draws a transmission material

`MeshPhysicalMaterial` with `transmission` above 0 is glass that bends what is behind it. three.js cannot look behind a surface while drawing it, so in r186 `WebGLRenderer` does this every frame that a transmissive object is in view:

1. It renders the background and **every opaque object** a second time, into a texture the size of the canvas (times `renderer.transmissionResolutionScale`, 1 by default), multisampled and with mipmaps, so rough glass can sample a blurred level.
2. It draws the transmissive objects, each sampling that texture through its own thickness and index of refraction (`thickness`, `ior`), tinted by its `color`, with reflections from `scene.environment`.

Three things follow from that, and they cover most of the threads:

- **Glass behind glass vanishes.** Transparent and transmissive objects are not in the texture, so a pane in front of a glass bottle samples a picture with no bottle in it and draws that picture over the bottle. The drei material `MeshTransmissionMaterial` renders its own buffer in its own way, but the threads about meshes that "get subtracted" behind it describe the same effect.
- **The cost scales with the scene, not with the glass.** A small bottle in view makes every opaque mesh draw twice. Hiding the glass, or the pass, is the measurement.
- **Glass is the colour of what it refracts, times its own `color`.** A black `color`, a dark or unlit scene behind it, or a metal setting copied from another material all make it dark.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `eval` lists every transmissive material's settings in one call and changes them on the open page, `look` with `sample` reads the colour drawn at points, and `perf` with `variants` measures the page with named objects hidden or with code run first, each on a fresh page, and gives the draw call and triangle counts of each.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A shop window with a bottle behind it

A shelf with a blue box and a green glass bottle, behind a shop window made of the same glass settings, lit by a `RoomEnvironment`.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Shop window</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d2c8);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0.6, 1.3, 5);
camera.lookAt(0, 0.9, 0);

const shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x7a5236 }));
shelf.name = 'shelf';
shelf.position.set(0, 0.5, -0.4);
const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a6fd0 }));
box.name = 'box';
box.position.set(-0.8, 0.8, -0.6);

const glass = { transmission: 1, roughness: 0.05, thickness: 0.3, ior: 1.5 };
// A bottle on the shelf, glass with a green tint.
const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 48),
  new THREE.MeshPhysicalMaterial({ ...glass, color: 0x9be3b0 }));
bottle.name = 'bottle';
bottle.position.set(0.5, 0.95, -0.4);
// The shop window in front of the shelf: a flat pane of the same glass.
const pane = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 0.02), new THREE.MeshPhysicalMaterial({ ...glass }));
pane.name = 'pane';
pane.position.set(0, 1, 0.6);

scene.add(shelf, box, bottle, pane);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Colours, draw calls and triangles do not depend on the GPU; the milliseconds in the `perf` reply do, and this guide does not use them. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page and look.** The points sampled are the bottle's middle, `(751, 384)`, and the box's front, `(480, 410)`.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:39151/index.html in 6.9 s, paused at frame 0.

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-32-45-845Z/look-1.png
On screen (1):
pane 38% [239, 128, 1038, 643] 3.2 × 2 units
Never visible: shelf (3 units, in view, behind pane), box (0.5 units, in view, behind pane), bottle (0.8 units, in view, behind pane)

look {"sample": [[751, 384], [480, 410]]}

Colours (5 × 5 mean, in the page's pixels): (751, 384) #d3d1cc, (480, 410) #6fa9e6.
```

The picture shows the shelf and the blue box through the window, and no bottle: where it stands, the pixel is the pane's pale grey, `#d3d1cc`, while the box reads blue, `#6fa9e6`. The object list is wrong here in a way worth knowing: its ID image counts a transmission material as opaque, so it lists everything behind the pane as never visible, the box and shelf that the picture shows included. On a page with transmission glass, read the picture and the samples.

**2. Every glass material.**

```text
eval {"code": "const out = [];\nscene.traverse(o => {\n  const m = o.material;\n  if (o.isMesh && m.transmission > 0) out.push({ name: o.name, transmission: m.transmission, thickness: m.thickness, ior: m.ior, roughness: m.roughness, metalness: m.metalness, color: \"#\" + m.color.getHexString() });\n});\nreturn { glass: out, environment: !!scene.environment, transmissionResolutionScale: renderer.transmissionResolutionScale }"}

{"glass":[{"name":"bottle","transmission":1,"thickness":0.3,"ior":1.5,"roughness":0.05,"metalness":0,"color":"#9be3b0"},{"name":"pane","transmission":1,"thickness":0.3,"ior":1.5,"roughness":0.05,"metalness":0,"color":"#ffffff"}],"environment":true,"transmissionResolutionScale":1}
```

Two transmissive objects, the bottle behind the pane: the pane samples the opaque-only texture, which has the shelf and the box and no bottle.

**3. A flat pane does not need to refract.** A sheet of window glass shifts what is behind it by a fraction of its thickness, which nobody sees; blending it is enough. Without transmission and with `transparent` set, it is drawn after the transmissive bottle and blended over it:

```text
eval {"code": "const m = find(\"pane\").material;\nm.transmission = 0;\nm.transparent = true;\nm.opacity = 0.15;\nm.needsUpdate = true;\nreturn \"pane: no transmission, transparent at 0.15\""}

pane: no transmission, transparent at 0.15

look {"sample": [[751, 384], [480, 410]]}

On screen (3):
shelf 3.1% [311, 445, 981, 511] 3 × 1.2 units, across the view
bottle 1.5% [706, 302, 796, 471]
box 1.2% [440, 359, 557, 462]
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (751, 384) #a8caaa, (480, 410) #81b5e8.

look {"at": [[751, 384], [480, 410]]}

At (751, 384): pane 4.4 m at [0.52, 1.01, 0.61]; behind it bottle 5.19 m; background beyond.
At (480, 410): pane 4.57 m at [-0.59, 0.9, 0.61]; behind it box 5.56 m; background beyond.
```

The bottle's pixel is green now, `#a8caaa`, and the object list and `at` agree with the picture: the pane in front, the bottle and the box behind it.

**4. A black bottle.** One way glass goes dark, tried on the open page: its `color` set to black, as a material copied from a dark preset might have it.

```text
eval {"code": "find(\"bottle\").material.color.set(0x000000);\nreturn \"bottle colour black\""}

bottle colour black

look {"sample": [[751, 384], [480, 410]]}

Colours (5 × 5 mean, in the page's pixels): (751, 384) #2c2c2c, (480, 410) #81b5e8.
```

`#2c2c2c`: the light coming through is multiplied by the colour, so a black colour leaves the reflections of the environment and nothing else. The `eval` in step 2 shows `color`, `metalness` and whether `scene.environment` is set; those three, and what stands behind the glass, are what to read first when glass draws dark.

**5. Write the pane into the source, then measure what the bottle costs.**

```js
const pane = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 0.02),
  new THREE.MeshPhysicalMaterial({ roughness: 0.05, transparent: true, opacity: 0.15 })); // flat glass: blend, do not refract
```

```text
look {}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 5.6 s).
On screen (3):
shelf 3.1% [311, 445, 981, 511] 3 × 1.2 units, across the view
bottle 1.5% [706, 302, 796, 471]
box 1.2% [440, 359, 557, 462]

perf {"variants": [{"label": "bottle hidden", "hide": ["bottle"]}, {"label": "half-size transmission", "code": "renderer.transmissionResolutionScale = 0.5"}]}

baseline: 373.1 ms median (p95 491.4), work 371 ms, 6 draw calls, 252 triangles; over budget: frameMs 373.1 of 16.7 ms; desktop budget
bottle hidden: 185.3 ms median (p95 261.6), work 160.8 ms, 3 draw calls, 36 triangles; −50% vs baseline; −50% draw calls, −86% triangles
half-size transmission: 302.4 ms median (p95 386.8), work 294.7 ms, 6 draw calls, 252 triangles; −19% vs baseline
Host load 20.9 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

Read the counts. With the bottle in view the frame has 6 draw calls: the shelf and the box twice (once into the transmission texture, once on screen), then the bottle and the pane. With the bottle hidden it has 3, and the 252 triangles fall to 36, of which the bottle itself is most of the difference and the second copy of the shelf and box is the rest. In this scene of two opaque meshes the extra render is small; in a scene of 500 opaque meshes, one glass in view is 500 more draw calls. `transmissionResolutionScale` keeps the draw calls and shrinks the texture's pixels, which on a real GPU is the part of the cost that grows with screen size; this host cannot say how much that saves, since its frame times are a software renderer's.

## What paprika3d does not do

- **Its object list counts a transmission material as opaque.** In step 1 it listed the shelf, the box and the bottle as never visible behind the pane, while the picture showed two of them. In a separate run on the same page, `look` with `at` at the bottle's pixel answered `background.` with no pane or bottle named. Both read correctly once the pane was a plain transparent material. For transmission glass, trust the picture and `sample`.
- **It does not run on a phone.** Glass that is black or flickers on one Android device, from half-float or mipmap support, stays a question for that device.
- **The drei material was not run here.** `MeshTransmissionMaterial` has its own buffer and `samples` and `resolution` settings; `perf` with `variants` and `code` setting those is how to measure it on a React Three Fiber page, but the replies above are from three's own `MeshPhysicalMaterial`.
- **Frame times on this host mean nothing for a GPU.** The draw calls and triangles hold; the milliseconds do not.

## Pitfalls

- **Give glass something to reflect.** Without `scene.environment` the glass loses its reflections and highlights and reads as a flat tint or not at all; a `RoomEnvironment` through `PMREMGenerator`, as in the page, or an HDRI is enough.
- **Glass inside glass needs one of them blended.** A liquid inside a bottle, or a bottle in a display case, shows the inner one when the outer one is not transmissive; make the one that does not need to bend light `transparent`.
- **`thickness` is in the mesh's units.** A thickness of 0.3 on a model in centimetres is a sheet; on a model in metres it is a block.
- **Keep `metalness` at 0 on glass.** A metal reflects and does not let light through, and a material copied from a metal preset brings its `metalness` along.

## Without paprika3d

Toggle `mesh.visible` on each glass object in the browser console and watch whether objects behind it come back. Count draw calls with `renderer.info.render.calls` after a frame (with `renderer.info.autoReset` off and a `reset()` before), once with the glass visible and once hidden, to see the second render. `renderer.transmissionResolutionScale` can be changed live to compare the look at 1 and 0.5 on the target device.
