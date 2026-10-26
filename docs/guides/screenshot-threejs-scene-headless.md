---
title: Screenshot a three.js scene headless from a coding agent
phrase: screenshot a three.js scene headless
description: How a coding agent takes a screenshot of a three.js or WebGL canvas in headless Chrome, gets the list of objects on screen with it, and pictures one object from four sides, using the paprika3d plugin's open and look tools.
intent: screenshot-threejs-headless
queries:
  - "Three.js: How can I make a 2D SnapShot of a Scene as a JPG Image?"
  - "Headless puppeteer screenshot not rendering WebGL canvas"
  - "How capture canvas image in three js"
  - "Headless rendering functional, how to take screenshot?"
  - "Three.js canvas.toDataURL sometimes blank"
author: paprika3d agent
date: 2026-10-14
review: weekly
---
# Screenshot a three.js scene headless from a coding agent

## The problem

A coding agent that writes a three.js page wants to see what it drew before it reports the work as done. The page is a single `<canvas>`, so the agent needs a browser that runs WebGL with no window, a way to wait until the scene has rendered, and a picture it can open. A raw picture also leaves questions open: which of the objects in the scene are in it, and how large each one is.

This guide uses paprika3d, a Claude Code plugin that opens three.js, React Three Fiber and WebGL pages in its own headless Chrome. Its `look` tool saves a screenshot, saves an ID image with one colour per object, and lists the named objects on screen with their share of the image and their pixel box.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

Install three.js into the project folder, since the page below loads it through an import map:

```bash
npm install three
```

## The page

Any three.js page works as it is. The one change that pays off is a `name` on each mesh, because `look` reports objects by name. This page draws a floor, a crate and a spinning torus knot:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Viewer</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20232a);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4, 3, 6);
camera.lookAt(0, 0.5, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 2);
scene.add(sun);

// Name every mesh: the harness reports what is on screen by name.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x556070 }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xc08040 }));
crate.name = 'crate';
crate.position.set(-1.2, 0.5, 0);
scene.add(crate);

const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.18, 128, 16), new THREE.MeshStandardMaterial({ color: 0x40a0e0 }));
knot.name = 'knot';
knot.position.set(1.2, 0.9, 0);
scene.add(knot);

renderer.setAnimationLoop((time) => {
  knot.rotation.y = time / 1000;   // performance time: the harness fakes it, so every run draws the same frame
  renderer.render(scene, camera);
});
</script>
</body></html>
```

Save it as `index.html` in the project folder.

## The tool calls, in order

These are the calls an agent makes, each followed by the reply paprika3d gave when this page was run through it on 2026-10-14. Run folder paths are shortened to `<project>`.

**1. Open the page.** The `open` tool serves the folder, loads the page in headless Chrome and pauses its clock at frame 0. The `entities` list is every named object in the scene.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:59037/index.html, paused at frame 0.
{"three":"186","scenes":1,"entities":["floor","crate","knot"],"hasConvention":false}
Procedural geometry: import { geo, scatter } from "./geo.js" (see the skill's geometry reference).
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-14T07-47-59-715Z
```

**2. Take the screenshot.** `look` with no arguments pictures the page as the game's own camera sees it.

```text
look {}

Picture: <project>/paprika3d/runs/2026-10-14T07-47-59-715Z/look-1.png
ID image: <project>/paprika3d/runs/2026-10-14T07-47-59-715Z/look-1-ids.png
On screen (3):
floor 51.7% [0, 279, 1279, 799]
knot 4.1% [653, 257, 895, 492]
crate 2.2% [435, 299, 605, 459]
Never visible: none
```

The picture is a PNG at the page's viewport, 1280 px by 800 px. Each line under `On screen` is an object's name, the share of the image it covers, and its box in pixels as left, top, right, bottom.

**3. Picture one object from every side.** With `target`, `look` draws that object alone from the front, the right, the top and a three-quarter angle, framed to its size, in one picture. It also gives the object's size and centre in world units.

```text
look {"target": "knot"}

Picture: <project>/paprika3d/runs/2026-10-14T07-47-59-715Z/look-2-views.png (front, right, top, three-quarter)
knot: size 1.884 × 1.768 × 1.355, centre [1.124, 0.9, 0.026]
```

**4. Look from another camera.** `camera` moves the camera that draws the scene for this one picture and puts it back afterwards. This is a top-down view:

```text
look {"camera": {"position": [0, 8, 0.01], "lookAt": [0, 0, 0]}}

Picture: <project>/paprika3d/runs/2026-10-14T07-47-59-715Z/look-3.png
ID image: <project>/paprika3d/runs/2026-10-14T07-47-59-715Z/look-3-ids.png
On screen (3):
floor 89.9% [36, 0, 1243, 799]
knot 2.4% [682, 319, 910, 471]
crate 2.0% [405, 331, 555, 468]
Never visible: none
```

**5. Move time forward, then look again.** The clock stays paused until something steps it, so an animation is pictured at an exact frame. `clock` steps it:

```text
clock {"step": 60}

Clock at 61.017 s, frame 61.

look {}

Picture: <project>/paprika3d/runs/2026-10-14T07-47-59-715Z/look-4.png
ID image: <project>/paprika3d/runs/2026-10-14T07-47-59-715Z/look-4-ids.png
On screen (3):
floor 52.3% [0, 279, 1279, 799]
knot 3.1% [675, 252, 878, 482]
crate 2.2% [435, 299, 605, 459]
Never visible: none
```

The knot has turned, so its box and share changed; the crate did not move, and its line is the same.

**6. Check phone, tablet, laptop and desktop sizes.** `open` takes `size` ([width, height] in CSS pixels), `dpr` (the device pixel ratio), `reducedMotion` (the page gets `prefers-reduced-motion: reduce`) and `network` (`fast-4g`, `slow-4g` or `3g`, Chrome DevTools' presets: it also times a first visit on that network, with no cache, and says when the first scene frame came and which bytes came before it). `look` with `viewports` pictures the page at several sizes in one labelled grid, each on a fresh reload: `phone` is 390 × 844 at DPR 3, `tablet` 820 × 1180 at 2, `laptop` 1440 × 900 at 2 and `desktop` 1920 × 1080 at 1, or give `[width, height, dpr]`.

```text
look {"viewports": ["phone", "tablet", "laptop", "desktop"]}
```

Each cell gets a line with the subject's share of the picture, the number of objects on screen and its Canvas line.

**7. Check a scroll-driven page.** `interact` with `{ "scroll": { "progress": 0.5 } }` (or a pixel offset, or `{ "to": "#section" }`) scrolls the window and steps its frames. Its reply says where the page is, as in `Scroll: 1600 of 3200 px (50%)`, plus the progress of Lenis, ScrollTrigger or drei `ScrollControls` when it finds them. `look` with `scroll` pictures the page at several stops in one labelled grid, each on a fresh reload:

```text
look {"scroll": [0, 0.25, 0.5, 0.75, 1]}
```

Each cell gets a line with the camera's position, the direction it looks along and the objects on screen. CSS scroll-driven animations (`animation-timeline: scroll()`) follow the scroll, not the paused clock.

## What to read in the reply

- `On screen (N)`: if an object the page should draw is missing from this list, it drew no pixel.
- `Never visible`: named objects that no look has seen yet, with their size and whether they are behind the camera or in view. An object in view that draws no pixel is usually far too small for the scene, hidden behind something, or not drawn at all. The guide on finding an invisible three.js model covers this line.
- `Canvas`: the drawing buffer's size for the canvas's CSS size at the page's DPR, the renderer's pixel ratio, and whether a resize handler ran when the page shrank. A buffer smaller than CSS size × DPR draws a blurry picture on that screen; a page whose resize handler did not run keeps its first size when a phone turns. Boxes stay in CSS pixels at any DPR.
- `Behind the canvas` (shown for a transparent canvas: a WebGL context with alpha, a clear alpha under 1 and no scene background): the share of the canvas where the scene draws nothing and the page shows through, the page background there, and for each text behind the canvas the share of its box the scene leaves uncovered.
- `HTML labels` (shown when a CSS2DRenderer or drei `Html` places elements over the canvas): how many, how many overlap another, how many are off-screen, and each label's box in picture pixels.
- `Picture`: open the PNG to judge colour, lighting and composition, which the list does not describe.
- `Errors so far` and `Failed to load` lines in the reply to opening the page (step 1): a page with console errors or a model that returned 404 shows them there.
- `Dev server`, `Canvas: 0 px tall on the page` and `Page text outside the canvas` lines in the reply to opening the page (step 1): what a dev command printed as an error or warning after its URL (a server-side `window is not defined` behind a black page), a canvas with no height and the element above it that has none, and the headings and words a crawler reads.

## Pitfalls

- **Unnamed meshes** are listed by their type (`Mesh`), which tells the agent little. Give each mesh a `name`.
- **Time.** The page runs on a fake clock that steps 1/60 s per frame. An animation driven by `requestAnimationFrame` time or `performance.now` is reproducible; one driven by a separate real-time source is not.
- **A page that never renders.** `open` waits for a three.js renderer or `window.__game`; after 10 s with neither, it returns an error with the page's console errors.
- **Pictures go in the project.** Runs are written under `paprika3d/` in the project folder; add that folder to `.gitignore`.

## Without paprika3d

A headless browser script can take the same picture. With Puppeteer or Playwright, open the page, wait for the first frames to render, and call `page.screenshot()`. Two things to know when doing it by hand:

- Reading the canvas back with `canvas.toDataURL()` after the frame has been presented returns a blank image unless the renderer was made with `preserveDrawingBuffer: true`, or the read happens right after `renderer.render()` in the same task.
- Headless Chrome needs WebGL enabled. On a machine with no GPU, such as many CI runners, it falls back to the SwiftShader software renderer, which recent Chrome versions turn on with flags such as `--use-angle=swiftshader` and `--enable-unsafe-swiftshader`.

A script like this gives the pixels. Listing which objects are in the picture, or picturing one object from four sides, takes extra code in the page that reads the scene graph.
