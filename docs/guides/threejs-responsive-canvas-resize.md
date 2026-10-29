---
title: three.js responsive canvas that resizes without stretching and keeps the scene in frame on a phone
phrase: three.js responsive canvas
description: The resize handler a three.js canvas needs (setSize, camera.aspect, updateProjectionMatrix, a capped setPixelRatio and a camera distance that fits a portrait screen), and the faults it prevents shown in the paprika3d plugin's replies: a phone that shows one product of three, a landscape turn that stretches the picture, a canvas sized by CSS alone, and a canvas with no height.
meta: three.js responsive canvas: resize without stretching, cap the pixel ratio, and keep the scene in frame on a phone.
intent: responsive-canvas-mobile
queries:
  - "How to resize canvas without resizing renderer or scaling contents?"
  - "Three.js Full Screen Issue"
  - "Keeping an object scaled based on the bounds of the canvas (really battling to explain this one)"
  - "Resize canvas with different aspect ratio"
  - "React + Three.js canvas does not resize correctly when making the browser window smaller"
  - "Responsiveness Problem On Mobile Phone After Landscape"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js responsive canvas that resizes without stretching and keeps the scene in frame on a phone

## The resize handler

A three.js canvas has two sizes. Its CSS size is how much of the page it covers. Its drawing buffer is how many pixels the renderer draws into. The camera has a third number, its aspect ratio, which decides how wide a slice of the scene each frame shows. When the window changes, all three must follow, or the browser stretches an old picture over the new space. This handler keeps them together and also keeps a row of objects in the frame on a tall phone screen:

```js
const fit = { width: 7.4, height: 2.6 }; // what must stay in the frame, in scene units

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.position.set(0, 0, Math.max(fit.height / 2 / tanHalf, fit.width / 2 / (tanHalf * camera.aspect)) + 0.8);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
```

What each line is for:

- **`renderer.setPixelRatio`** makes the buffer larger than the CSS size on a high-density screen, so edges stay sharp. A phone reports a `devicePixelRatio` of 3, which means nine buffer pixels for every CSS pixel; a cap at 2 keeps most of the sharpness for less than half the pixels to fill. Call it before `setSize`, which reads it.
- **`renderer.setSize(w, h)`** sets the buffer to `w × h` times the pixel ratio, and the canvas's CSS width and height to `w × h`. Pass `false` as a third argument when your CSS sizes the canvas and the renderer should leave its style alone.
- **`camera.aspect = w / h`** and **`camera.updateProjectionMatrix()`** go together. The camera reads `aspect` and `fov` when the projection matrix is rebuilt and at no other time, so setting one without the other changes nothing on screen.
- **The camera distance.** A `PerspectiveCamera`'s `fov` is vertical. A wider window shows more of the scene at the sides, and a narrower one shows less, so a scene framed on a laptop loses its sides on a portrait phone. The distance above is the larger of two: far enough to see `fit.height` with the vertical angle, and far enough to see `fit.width` with the horizontal angle, which shrinks with the aspect. The `+ 0.8` is half the depth of the nearest object, since the fit is measured at its front face.

In React Three Fiber, `<Canvas>` does the first four lines itself: it follows its parent element's size, updates the default camera's aspect, and takes `dpr={[1, 2]}` for the capped pixel ratio. The distance for a portrait screen is still yours to set, in a component that reads `size` from `useThree`. The parent element still needs a height, as the last fault below shows.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `look` with `viewports` pictures the page at a phone, tablet, laptop and desktop size in one grid, each on a fresh reload, and gives each cell a line with the objects on screen and whether the canvas buffer matches its CSS size. `open` with `size` and `dpr` sets the page size for every later call. A `resize` step of `interact` changes the size of the page that is already running, which is what a window drag or a phone turned on its side does, and returns what changed in the page's state. A plain `look` also checks the canvas once per page load, by shrinking the page for a moment, and reports whether a resize handler ran.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with a row of products

A product page: a heading over a canvas that fills the window, and three products in a row, a crate, a ball and a cone, in a group named `row`. `window.__game.subject` names the row so `look` reports its share of each picture, and `observe()` returns the page size, the buffer size, the camera's aspect and its distance, so an `interact` reply says which of them a resize changed.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Three products</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;font:16px sans-serif;background:#1d2128;color:#fff}
#app{position:fixed;inset:0}
canvas{display:block}
h1{position:absolute;left:20px;top:12px;margin:0;font-size:24px}
</style></head>
<body>
<div id="app"></div>
<h1>Three products</h1>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 3));

// A row of three products, 6.6 units from the crate's left side to the cone's right side.
const row = new THREE.Group();
row.name = 'row';
const mat = (color) => new THREE.MeshStandardMaterial({ color });
const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat(0xb07040));
crate.name = 'crate';
crate.position.x = -2.5;
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 16), mat(0x40a0e0));
ball.name = 'ball';
const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 32), mat(0xe0c040));
cone.name = 'cone';
cone.position.x = 2.5;
row.add(crate, ball, cone);
scene.add(row);

// What must stay in the frame at every size: the row's width and height, with a margin.
const fit = { width: 7.4, height: 2.6 };

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // sharp on a phone, without drawing 9 pixels per CSS pixel
  renderer.setSize(w, h);                                // the drawing buffer and the canvas's CSS size
  camera.aspect = w / h;                                 // or the picture stretches to the new shape
  // Back the camera off until the row fits both ways: the vertical fov sets the height it sees,
  // and the aspect sets the width, so a portrait phone needs the camera further away.
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.position.set(0, 0, Math.max(fit.height / 2 / tanHalf, fit.width / 2 / (tanHalf * camera.aspect)) + 0.8);
  camera.updateProjectionMatrix();                       // aspect and fov are read only here
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));

window.__game = {
  subject: 'row',
  describe: () => ({ name: 'three products', resize: 'the row stays in the frame at every size' }),
  observe: () => ({
    size: [innerWidth, innerHeight],
    buffer: [renderer.domElement.width, renderer.domElement.height],
    aspect: +camera.aspect.toFixed(3),
    cameraZ: +camera.position.z.toFixed(2),
  }),
};
</script>
</body></html>
```

## Every size in one call

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:44313/index.html in 0.3 s, paused at frame 0.

look {"viewports": ["phone", "tablet", "laptop", "desktop"]}

Picture: <project>/paprika3d/runs/2026-10-28T06-45-29-352Z/look-5-viewports.png (4 viewports, left to right, top to bottom, each on a fresh reload); the game is reloaded at its own size and first frame
phone 390x844@3: subject row 5.5%, 3 on screen. Canvas: 780x1688 buffer for 390x844 CSS at DPR 3 (renderer pixel ratio 2, capped below DPR 3); resize handler ran.
tablet 820x1180@2: subject row 8.2%, 3 on screen. Canvas: 1640x2360 buffer for 820x1180 CSS at DPR 2 (renderer pixel ratio 2); resize handler ran.
laptop 1440x900@2: subject row 19%, 3 on screen. Canvas: 2880x1800 buffer for 1440x900 CSS at DPR 2 (renderer pixel ratio 2); resize handler ran.
desktop 1920x1080@1: subject row 21%, 3 on screen. Canvas: 1920x1080 buffer for 1920x1080 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
```

All three products are on screen at every size. The row takes a smaller share of the phone's picture because the phone is narrow and the row is wide: the camera backed off until the row fit across. Each buffer is the CSS size times the pixel ratio, and the phone's ratio is held at 2 by the cap. A design that wants the products larger on a phone has to change the layout there (stack them, or show one at a time), since the camera alone cannot make a wide row fill a tall screen.

## Fault 1: the phone shows one product of three

The same page with the handler from the three.js examples, which updates the aspect but keeps the camera where it was placed for a desktop screen, and sets no pixel ratio:

```js
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.position.set(0, 0, 8);
  camera.updateProjectionMatrix();
}
```

```text
look {"viewports": ["phone", "tablet", "laptop", "desktop"]}

phone 390x844@3: subject row 16%, 1 on screen; not on screen here: crate, cone. Canvas: 390x844 buffer for 390x844 CSS at DPR 3 (renderer pixel ratio 1, capped below DPR 3); resize handler ran.
tablet 820x1180@2: subject row 15%, 3 on screen. Canvas: 820x1180 buffer for 820x1180 CSS at DPR 2 (renderer pixel ratio 1, capped below DPR 2); resize handler ran.
laptop 1440x900@2: subject row 15%, 3 on screen. Canvas: 1440x900 buffer for 1440x900 CSS at DPR 2 (renderer pixel ratio 1, capped below DPR 2); resize handler ran.
desktop 1920x1080@1: subject row 13%, 3 on screen. Canvas: 1920x1080 buffer for 1920x1080 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
```

The phone cell names what it lost: the crate and the cone, the two ends of the row. The picture is not stretched (the aspect is right), it is cropped, because at this distance a portrait screen's horizontal angle covers the ball and nothing beside it. In the grid's picture the tablet cell has the crate and the cone cut off at its edges; its line counts them as on screen, since part of each is drawn, so read the picture as well as the count. The camera distance from the handler at the top fixes both cells.

The same replies show the second half of this fault. On the phone the buffer is `390x844` for a screen of the same CSS size at a pixel ratio of 3, so each buffer pixel is drawn three CSS pixels wide on the phone's glass and every edge is soft. The tablet and laptop cells have the same gap at 2. `renderer.setPixelRatio` closes it. Without a cap the phone gets the full ratio:

```text
open {"url": "uncapped.html", "cwd": "<project>", "size": [390, 844], "dpr": 3}

Opened http://127.0.0.1:36703/uncapped.html at 390 × 844, DPR 3 in 0.1 s, paused at frame 0.

look {}

Canvas: 1170x2532 buffer for 390x844 CSS at DPR 3 (renderer pixel ratio 3, no cap); resize handler ran.
```

That buffer has more than twice the pixels of the `780x1688` one the capped page draws, and a phone's GPU fills each of them every frame. `open` with `size` and `dpr` kept this page at the phone's size for the `look` after it, as it would for any later call until the next `open`.

## Fault 2: a landscape turn stretches the picture

A handler that resizes the renderer and forgets the camera:

```js
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
}
camera.aspect = app.clientWidth / app.clientHeight;   // set once, at load
```

The page loads on a portrait phone, then the phone turns:

```text
open {"url": "stretch.html", "cwd": "<project>", "size": [390, 844], "dpr": 3}

Opened http://127.0.0.1:37279/stretch.html at 390 × 844, DPR 3 in 0.1 s, paused at frame 0.

look {}

Canvas: 780x1688 buffer for 390x844 CSS at DPR 3 (renderer pixel ratio 2, capped below DPR 3); resize handler ran.
On screen (1):
ball 16% [64, 291, 325, 552]
Never visible: crate (1.6 units, outside the view), cone (1.8 units, outside the view)

interact {"steps": [{"resize": [844, 390]}], "look": true}

{"changed":{"size":[844,390],"buffer":[1688,780]}}
Canvas: 1688x780 buffer for 844x390 CSS at DPR 3 (renderer pixel ratio 2, capped below DPR 3); resize handler ran.
On screen (1):
ball 16% [139, 135, 704, 255]
Never visible: crate (1.6 units, outside the view), cone (1.8 units, outside the view)
```

The buffer followed the turn, so the Canvas line is clean. The state says what did not: `aspect` and `cameraZ` are missing from `changed`, so they kept their portrait values. The ball shows the result. In portrait its box is 261 by 261 page pixels, a circle; after the turn it is 565 wide and 120 tall, an oval, because a picture drawn for a tall view is spread over a wide one. The crate and the cone stay outside the view, since the horizontal angle is still the portrait one. The same two calls on the page with the full handler:

```text
open {"url": "index.html", "cwd": "<project>", "size": [390, 844], "dpr": 3}

look {}

On screen (3):
crate 2.3% [21, 380, 111, 463]
ball 2% [149, 376, 240, 467]
cone 1.2% [282, 377, 362, 469]

interact {"steps": [{"resize": [844, 390]}], "look": true}

{"changed":{"size":[844,390],"buffer":[1688,780],"aspect":2.164,"cameraZ":5.5}}
Canvas: 1688x780 buffer for 844x390 CSS at DPR 3 (renderer pixel ratio 2, capped below DPR 3); resize handler ran.
Subject: row takes 25% of the picture [46, 104, 757, 297]; 3 of its 3 named parts show.
On screen (3):
crate 13% [46, 104, 277, 286]
ball 7.5% [333, 106, 510, 283]
cone 5.1% [585, 108, 757, 297]
```

Now `aspect` and `cameraZ` change with the size, the ball's box is 177 by 177, and the row grows from 5.5% of the picture to 25% because a wide screen lets the camera come closer. The `resize` step keeps the page's pixel ratio, as turning a phone does. A grid of `viewports` would not have caught this fault: each of its cells is a fresh reload at its size, and this page sets the aspect correctly at load. The bug shows when the size changes on a page that is already running, which is what the `resize` step does.

## Fault 3: no handler, the canvas sized by CSS

A page that sizes the canvas with CSS (`width: 100%; height: 100%`), calls `renderer.setSize(w, h, false)` once at load, and has no resize listener. It looks right at every size it is loaded at. A plain `look` shrinks the page for a moment to test it:

```text
open {"url": "nohandler.html", "cwd": "<project>"}

interact {"steps": [{"resize": [844, 390]}], "look": true}

{"changed":{"size":[844,390]}}
Canvas: 1280x800 buffer for 844x390 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames). The buffer is not CSS size × pixel ratio, so the browser stretches it: call renderer.setSize when the canvas's size changes.
On screen (3):
crate 8.9% [45, 128, 266, 261]
ball 5.9% [330, 127, 513, 262]
cone 3.9% [592, 128, 764, 270]
```

The CSS shrank the canvas and nothing told the renderer, so the old `1280x800` buffer is squeezed into `844x390`. The ball is 183 by 135: two thirds of its width and half its height, the same factors as the page's. This is the "Three.js Full Screen Issue" thread: a canvas that fills its box with CSS but draws at the size it had at load. The fix is the listener from the top of this guide. When the canvas lives in a panel that changes size without the window changing (a sidebar that folds), listen with a `ResizeObserver` on the panel instead of the window's `resize` event.

## Fault 4: a canvas with no height

A page whose container is `#app { height: 100% }` while `html` and `body` have no height, and whose code measures the container before the canvas is in it, as many tutorials do:

```js
renderer.setSize(app.clientWidth, app.clientHeight);   // clientHeight is 0 here
app.appendChild(renderer.domElement);
```

```text
open {"url": "noheight.html", "cwd": "<project>"}

Opened http://127.0.0.1:36703/noheight.html in 0.1 s, paused at frame 0.
Canvas: 0 px tall on the page (html has no height), so the scene does not show.

look {}

Canvas: 1280x0 buffer for 1280x0 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran. The canvas is 0 px tall, so nothing shows: give it (or its container) a size, then call renderer.setSize.
```

A percentage height is a share of the parent's height, and here no parent up to `html` has one, so the container is 0 px tall and the renderer is told to draw 0 rows. The page shows its background, no scene and no error. `open` says so before any picture, and names the outermost element without a height. Give `html, body` a height of 100% (or the container a fixed position, as the page above does), and measure the container after the canvas is in it. In React Three Fiber, the same blank page comes from a `<Canvas>` inside a `div` with no height.

## What to read in the replies

- `look` with `viewports`, each cell's line: the subject's share, the count on screen, `not on screen here` with the names another cell shows, and the cell's Canvas line.
- The `Canvas` line in any `look`: buffer against CSS size, the device pixel ratio, the renderer's ratio and whether it is capped, whether a resize handler ran, and a sentence when the browser stretches the buffer or the canvas has no height.
- The `changed` line after a `resize` step: which values of `observe()` the resize changed. A value you expect to change that is missing from it did not.
- `On screen` boxes in page pixels: an object whose box changes shape across a resize is drawn stretched.
- `open`'s line for a canvas that is 0 px tall on the page, with the outermost element that has no height.

## Pitfalls

- **Debounced handlers.** A handler that waits for the resize to stop shows a stretched picture during a drag, and the `look` Canvas line says it did not run. A handler that just sets sizes is cheap; run it on every event.
- **Mobile browser bars.** On a phone, `innerHeight` changes as the address bar slides away while scrolling. A canvas sized to `100vh` in CSS is taller than the visible area while the bar shows; size from the element (`clientHeight`) or use the `dvh` unit.
- **`orientationchange`.** Sizes read inside an `orientationchange` handler can still be the old ones. The window `resize` event comes after the new size is set; use that.
- **An `OrthographicCamera`** has no `aspect`: set `left`, `right`, `top` and `bottom` from the new size, then `updateProjectionMatrix()`.
- **Render targets and post-processing** have their own sizes. An `EffectComposer` needs `composer.setSize(w, h)` and `composer.setPixelRatio` in the same handler, or its passes draw at the old size.

## What paprika3d does not do

It does not write the resize handler or choose a layout for a phone; it reports the sizes, what is on screen and whether the handler ran, and the agent changes the code. The `viewports` presets are sizes and pixel ratios in one desktop Chrome, not a phone: they do not test a phone's GPU, its browser bars, a notch, or touch scrolling. A cell that shows part of an object counts it as on screen, so a cropped object is found in the picture or in the boxes of a plain `look` at that size, not in the count.

## Without paprika3d

Resize the browser window by hand and drag it narrow and tall; the browser's device toolbar has phone sizes and a pixel ratio setting. Log `renderer.domElement.width`, `renderer.domElement.clientWidth`, `renderer.getPixelRatio()` and `camera.aspect` in the handler: the buffer width should be the CSS width times the ratio, and the aspect the CSS width over the CSS height. A sphere in the scene shows stretching at a glance, since it stops being round. For a canvas that does not show, check `renderer.domElement.getBoundingClientRect().height` and walk up its parents to the first one with a height of 0.
