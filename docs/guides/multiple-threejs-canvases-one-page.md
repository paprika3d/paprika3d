---
title: Multiple three.js canvases on one page: a renderer per widget, one shared canvas, or a scene in a modal
phrase: multiple three.js canvases on one page
description: How to put several three.js scenes on one page, a WebGLRenderer per card or one renderer that draws each card's scene into its box with setViewport and setScissor, and a viewer in a modal; with the paprika3d plugin's eval counting canvases, observe's renderer counts, interact's record filming the shared canvas with its y axis upside down and then fixed, and a modal canvas left 0 by 0.
meta: Multiple three.js canvases on one page: count the WebGL contexts, share one renderer with scissors, and size a viewer that opens in a modal.
intent: multiple-canvases-one-page
queries:
  - "Multiple canvases"
  - "Multiple Canvases with individual models and different rotations"
  - "Scroll Animation with multiple canvases"
  - "How to display a three.js scene in a modal popup"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Multiple three.js canvases on one page: a renderer per widget, one shared canvas, or a scene in a modal

## Two ways to lay out several scenes

**A renderer per widget.** Each card gets its own `WebGLRenderer`, canvas and scene. It is the least code, and each widget sizes and resizes on its own. Each renderer is also its own WebGL context, and contexts are a limited resource: Chrome keeps 16 active per page and drops the oldest past that, with the warning [the WebGL context lost guide](/guides/threejs-webgl-context-lost) is about. Nothing is shared between contexts, so six cards showing the same model compile its shaders and upload its geometry and textures six times.

**One renderer for the page.** One canvas covers the page, and each frame the code draws each card's scene into that card's box with `setViewport` and `setScissor`. One context, shared geometries, materials and textures, no limit on the number of cards. three.js's manual teaches this in its article on multiple canvases and multiple scenes, and drei's `<View>` does the same for React Three Fiber. The cost is a few lines that are easy to get wrong, the commonest being the y axis: the page counts y down from the top, and WebGL's viewport counts it up from the bottom.

A third case comes up in the same threads: one viewer inside a modal, made while the modal was hidden.

paprika3d is a Claude Code plugin and MCP server that opens a page in its own headless Chrome. `eval` runs code in the page, so it can count the canvases; `observe` reports the renderer's counts; `look` returns the picture with the objects on screen; and `interact` with `record` films the page in real time from Chrome's own screen output. Each of them reads a page with several scenes a little differently, and this guide says how.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Six cards, six renderers

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); none of what follows depends on frame times. Run folder paths are shortened to `<project>`, the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out, and replies are cut to the lines discussed, with nothing reworded.

A grid of six product cards, each card making its own renderer in a loop, opened, counted and looked at:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:46435/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: 1 h1, 0 h2, 7 words
{"three":"186","scenes":6,"entities":["cube"]}

eval {"code": "return { canvases: document.querySelectorAll('canvas').length }"}

{"canvases":6}

look {}

Canvas: 276x200 buffer for 276x200 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
On screen (1):
cube 19% [122, 141, 232, 245]
Never visible: none

observe {}

{"entities":{"cube":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":6,"triangles":2708,"textures":1,"geometries":1,"programs":2},"scene":{"objects":12,"meshes":6,"lights":6,"cameras":0},"errors":[],"changed":null}}
```

Six canvases, so six contexts. The picture shows all six cards drawn. The lists are where several renderers show: `open` found 6 scenes, but `entities`, the Canvas line and `On screen` describe the first renderer, the cube's card. In `observe`, `calls` and `triangles` add up every render call of the frame, across all six renderers, while `geometries`, `textures` and `programs` are the first renderer's own. That split is itself the sign of a page with one renderer per widget.

## One renderer for the page

The same six cards, drawn by one renderer into one canvas behind the page. Each card's view area is left transparent so the canvas shows through it, and the frame skips cards that are off screen:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Shapes</title>
<style>
body{margin:0;font:15px system-ui;color:#222}
h1{margin:24px 24px 8px;font-size:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;padding:16px 24px}
.card{border:2px solid #d6d2ca;border-radius:10px}
.view{height:200px}
.label{background:#fff;padding:8px 10px;border-radius:0 0 8px 8px}
#c{position:fixed;inset:0;width:100%;height:100%;display:block;z-index:-1}
</style></head>
<body>
<h1>Shapes</h1>
<div class="grid" id="grid"></div>
<canvas id="c"></canvas>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const products = [
  ['cube', new THREE.BoxGeometry(1, 1, 1), 0xd9534f],
  ['ball', new THREE.SphereGeometry(0.6, 32, 16), 0x5bc0de],
  ['ring', new THREE.TorusGeometry(0.5, 0.18, 16, 48), 0xf0ad4e],
  ['cone', new THREE.ConeGeometry(0.6, 1.1, 32), 0x5cb85c],
  ['gem', new THREE.OctahedronGeometry(0.7), 0x9b59b6],
  ['can', new THREE.CylinderGeometry(0.45, 0.45, 1.1, 32), 0x34495e],
];

// One renderer, so one WebGL context, for the whole page: a canvas behind it that draws into each card's view.
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setScissorTest(true);
renderer.setClearColor(0xf2f0ec); // the page's own background colour

const grid = document.getElementById('grid');
const views = products.map(([name, geometry, color]) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="view"></div><div class="label">${name}</div>`;
  grid.appendChild(card);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8e6e1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
  mesh.name = name;
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  camera.position.set(0, 0.6, 3.2);
  camera.lookAt(0, 0, 0);
  return { el: card.querySelector('.view'), scene, camera, mesh };
});

function frame(t) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
  renderer.setScissor(0, 0, w, h);
  renderer.clear();
  for (const v of views) {
    const r = v.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue; // this card is off screen
    const y = h - r.bottom; // WebGL counts y up from the canvas's bottom edge, the page counts down from the top
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.setScissor(r.left, y, r.width, r.height);
    v.camera.aspect = r.width / r.height;
    v.camera.updateProjectionMatrix();
    v.mesh.rotation.y = t / 1000;
    renderer.render(v.scene, v.camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
</body></html>
```

The first version of this page had `const y = r.top;`, the page's own coordinate, in place of the line marked with the comment.

```text
eval {"code": "return { canvases: document.querySelectorAll('canvas').length }"}

{"canvases":1}

look {}

Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames).
On screen (1):
cube 18% [420, 223, 906, 644]
Never visible: none
```

One canvas. `look`'s picture shows the can's scene alone, in one rectangle, and the `On screen` box for the cube does not match any card. `look` draws the frame's render calls again for its picture, and the viewport and scissor are whatever the last call left them as, so a frame drawn into six rectangles comes out as one. For this layout, use `look` for its lines about the canvas and read the picture from `record`, which films what Chrome put on the screen:

```text
interact {"steps": [{"wait": 30}], "record": true}

Recorded 0.55 s in real time: <project>/paprika3d/runs/2026-10-28T10-40-00-977Z/clip-1.gif (GIF, 26 KB, 480 × 300, 11 frames from 11 screencast frames, each shown for its real time); four moments of it: <project>/paprika3d/runs/2026-10-28T10-40-00-977Z/clip-1.png.
```

From 0.1 s on, the four moments show the cards of the first row empty and their four products in a row below the grid, while the gem and the can sit high in their cards, over the line between the two rows. Each product is drawn mirrored top to bottom about the middle of the window: `r.top` measures from the top, and WebGL reads it from the bottom. (The first moment still shows what the `look` picture left on the canvas.) With the line marked in the listing, the next call reloads the page by itself:

```text
interact {"steps": [{"wait": 30}], "record": true}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Recorded 0.54 s in real time: <project>/paprika3d/runs/2026-10-28T10-40-00-977Z/clip-2.gif (GIF, 24 KB, 480 × 300, 11 frames from 11 screencast frames, each shown for its real time); four moments of it: <project>/paprika3d/runs/2026-10-28T10-40-00-977Z/clip-2.png.
```

All four moments show each product inside its own card, turning. The `resize handler did not run` line in the `look` above reads this page wrongly: there is no window resize handler because the frame checks the canvas's size itself on every frame and calls `setSize` when it changed.

## A scene in a modal

A "View in 3D" button opens a modal whose viewer was made at load, while the modal was `display: none`. Opened, the button clicked, and the canvas measured before any `look`:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:42807/index.html in 0.4 s, paused at frame 0.
Canvas: 0 px tall on the page (div#modal has no height), so the scene does not show.
{"three":"186","scenes":1,"entities":["lamp"]}

interact {"steps": [{"mouse": "click", "x": 80, "y": 105}, {"wait": 5}]}

{"after":null,"changed":{}}

eval {"code": "const c = renderer.domElement; return { css: [c.clientWidth, c.clientHeight], buffer: [c.width, c.height], viewer: [c.parentElement.clientWidth, c.parentElement.clientHeight] }"}

{"css":[0,0],"buffer":[0,0],"viewer":[1024,640]}
```

At load the Canvas line is expected, since the modal is closed. After the click the viewer is 1024 by 640 and the canvas is still 0 by 0: `setSize` ran once, at load, when the viewer had no size. The fix is to size the renderer and camera when the modal opens, one call to the page's own `resize()` in the click handler:

```text
interact {"steps": [{"mouse": "click", "x": 80, "y": 105}, {"wait": 5}]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.2 s).

eval {"code": "const c = renderer.domElement; return { css: [c.clientWidth, c.clientHeight], buffer: [c.width, c.height], viewer: [c.parentElement.clientWidth, c.parentElement.clientHeight] }"}

{"css":[1024,640],"buffer":[1024,640],"viewer":[1024,640]}

look {}

Canvas: 1024x640 buffer for 1024x640 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
On screen (1):
lamp 8.6% [473, 287, 806, 580]
```

Measure before you look on a page like this. `look` checks the page's resize handling by changing the page's size, which runs the page's own `resize` listener; on the unfixed page that sized the canvas, and a `look` after the click showed the lamp as if nothing were wrong.

## What paprika3d does not do

- **With several renderers, most lines read the first.** `entities`, `On screen`, the Canvas line and the memory counts in `observe` come from the first renderer the page made; the picture and the frame's `calls` and `triangles` cover them all.
- **With one renderer drawn into rectangles, `look`'s picture shows one of them,** as above. `interact` with `record` shows the page as Chrome drew it. drei's `<View>` draws with scissors on one canvas too, so the same holds for it.
- **It does not reach a phone's context limit.** The harness runs desktop Chrome; the context lost guide covers watching contexts and memory add up.
- **It does not change the layout.** The agent picks the approach and writes it.

## Pitfalls

- **WebGL's y counts up from the bottom.** For a box from `getBoundingClientRect()`, the viewport's y is the canvas's height minus `r.bottom`.
- **Turn the scissor test on.** Without `setScissorTest(true)`, each scene's background clears the whole canvas, and the last card is the one left.
- **Clear once per frame, then draw each view.** The frame clears the whole canvas with the scissor set to all of it, then narrows the scissor per card.
- **Keep the shared canvas fixed to the window.** The boxes come from `getBoundingClientRect()`, which is relative to the window; a fixed canvas lets the cards scroll while each frame redraws them where they now are.
- **Share what you can.** In one renderer a geometry, a material or a texture used by several scenes is uploaded once.
- **A viewer made while hidden has no size.** Size it when it is shown, or watch its element with a `ResizeObserver`.

## Without paprika3d

`document.querySelectorAll('canvas').length` in the console counts the canvases, and so the contexts if each has a renderer. For a shared canvas, scroll the page in a browser and watch each product stay in its card. three.js's manual article on multiple canvases and multiple scenes walks through the scissor layout, including a version where each element gets its own small canvas filled from one offscreen renderer.
