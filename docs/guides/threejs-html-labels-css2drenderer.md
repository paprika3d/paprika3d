---
title: three.js HTML labels over a model with CSS2DRenderer, and why they land wrong, drift or show through
phrase: three.js html labels
description: How to put HTML labels, tooltips and markers on a three.js model with CSS2DRenderer, and how to find why a label sits in the wrong place, drifts off its object after a resize, or shows through the model it should hide behind, shown with the paprika3d plugin's look, look at and interact resize replies.
meta: three.js HTML labels over a model with CSS2DRenderer, and why labels land in the wrong place, drift on resize or show through.
intent: html-labels-over-canvas
queries:
  - "How to implement text labels for a viewer application?"
  - "Using the THREE.js CSS2DRenderer to position HTML elements from the top left"
  - "Threejs Tooltip"
  - "Adding a marker to 3D model"
  - "Hide labels that go behind a gltf?"
  - "Real occlusion with HTML elements"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js HTML labels over a model with CSS2DRenderer, and why they land wrong, drift or show through

## How CSS2DRenderer places a label

A label made in HTML stays sharp, takes CSS, holds links and buttons, and costs the GPU nothing. three.js ships `CSS2DRenderer` in `three/addons/renderers/CSS2DRenderer.js` to pin one to a point in the scene:

1. Wrap a `div` in a `CSS2DObject` and add it to the scene, or to the mesh it names, at the point it should follow (its anchor).
2. Make a `CSS2DRenderer`, give it the canvas's size, and put its element exactly over the canvas: in the same positioned container, at `top: 0` and `left: 0`, with `pointer-events: none` so drags still reach the canvas.
3. Each frame, after `renderer.render(scene, camera)`, call `labelRenderer.render(scene, camera)`. It projects each anchor with the camera and moves the `div` there with a CSS transform, centred on the anchor by default.
4. In the resize handler, call `labelRenderer.setSize` with the same size as the WebGL renderer.

```js
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(width(), height());
Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
viewer.appendChild(labelRenderer.domElement);   // the canvas's own container, not document.body
const label = new CSS2DObject(div);
label.position.set(-0.7, 0, 0.6);               // the anchor, a little off the surface it names
```

Each failure in the threads comes from one of these steps:

- **Placed wrong.** The label layer is not over the canvas: appended to `document.body` while the canvas sits beside a sidebar or under a header, or left without `position: absolute` so it lands below the canvas. Every label is then off by the canvas's offset.
- **Drifting.** The resize handler sizes the WebGL renderer and the camera but not the label layer, which keeps spreading the anchors over the old size.
- **Showing through.** `CSS2DRenderer` hides a label whose anchor is behind the camera or past its near or far plane, and does nothing about a model in front of it. A marker on the back of a product shows through the product, because the HTML sits over the whole canvas.

The label setup is the page's own code. paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome and shows a coding agent where the labels ended up. Each `look` has an `HTML over the canvas` line: every label `CSS2DRenderer` placed, with its box in page pixels, how many overlap another and how many are off-screen or cut off by the screen edge. The same reply's `On screen` list gives each object's box in the same pixels, so a label that left its object is two boxes that do not meet. `look` with `at` at a label's anchor says which objects are drawn at that pixel, nearest first, and how far each is from the camera: the occlusion check, done on what the page drew. `interact` with a `resize` step changes the page's size and, with `look` set, shows in the same reply whether each label followed.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A boombox with four labels

A product viewer: a sidebar on the left and the viewer filling the rest. The boombox has a woofer and a tweeter on the front, a handle on top and a bass port on the back, each with a label. The page hides a label each frame when the model is between the camera and its anchor. `window.__game.observe()` returns the labels shown, so `interact` can say when that list changes.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Boombox</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;font:15px sans-serif}
body{display:flex}
aside{width:300px;flex:none;padding:16px;box-sizing:border-box;background:#eef0f3}
#viewer{position:relative;flex:1;min-width:0}
canvas{display:block}
.label{background:#1b1f27;color:#fff;padding:4px 8px;border-radius:4px;font:14px sans-serif;white-space:nowrap}
</style></head>
<body>
<aside><h3>Boombox</h3><p>Two drivers, a bass port at the back and a carry handle.</p></aside>
<main id="viewer"></main>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const viewer = document.getElementById('viewer');
const width = () => viewer.clientWidth, height = () => viewer.clientHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width(), height());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
viewer.appendChild(renderer.domElement);

// The label layer: a second renderer whose element lies exactly over the canvas, inside the same positioned container.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(width(), height());
Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
viewer.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8dde4);
const camera = new THREE.PerspectiveCamera(40, width() / height(), 0.1, 100);
camera.position.set(2.6, 1.6, 5.2);
camera.lookAt(0, 0.1, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 4);
scene.add(sun);

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 1), mat(0x2f6f8f));
body.name = 'body';
const woofer = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 40), mat(0x222222));
woofer.name = 'woofer';
woofer.rotation.x = Math.PI / 2;
woofer.position.set(-0.7, 0, 0.5);
const tweeter = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 32), mat(0x333333));
tweeter.name = 'tweeter';
tweeter.rotation.x = Math.PI / 2;
tweeter.position.set(0.8, 0.2, 0.5);
const handle = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 12, 40, Math.PI), mat(0x999999));
handle.name = 'handle';
handle.position.y = 0.8;
const port = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 32), mat(0x111111));
port.name = 'port';
port.rotation.x = Math.PI / 2;
port.position.set(0.6, -0.3, -0.5);
scene.add(body, woofer, tweeter, handle, port);
const solid = [body, woofer, tweeter, handle, port];

// One label per feature, anchored a little off the surface it names. The port is on the back.
const labels = [];
for (const [text, x, y, z] of [['Woofer', -0.7, 0, 0.6], ['Tweeter', 0.8, 0.2, 0.6], ['Handle', 0, 1.85, 0], ['Bass port', 0.6, -0.3, -0.55]]) {
  const div = document.createElement('div');
  div.className = 'label';
  div.textContent = text;
  const label = new CSS2DObject(div);
  label.name = text;
  label.position.set(x, y, z);
  scene.add(label);
  labels.push(label);
}

// CSS2DRenderer draws every label on top of the canvas. Hide one when the model is between the camera and its anchor.
const ray = new THREE.Raycaster(), anchor = new THREE.Vector3(), dir = new THREE.Vector3();
function hideLabelsBehindModel() {
  for (const label of labels) {
    label.getWorldPosition(anchor);
    const distance = anchor.distanceTo(camera.position);
    ray.set(camera.position, dir.subVectors(anchor, camera.position).normalize());
    const hit = ray.intersectObjects(solid)[0];
    label.visible = !hit || hit.distance > distance;
  }
}

addEventListener('resize', () => {
  renderer.setSize(width(), height());
  labelRenderer.setSize(width(), height());
  camera.aspect = width() / height();
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  hideLabelsBehindModel();
  labelRenderer.render(scene, camera);
});

window.__game = {
  describe: () => ({ name: 'boombox', labels: labels.map((l) => l.name) }),
  observe: () => ({ shown: labels.filter((l) => l.visible).map((l) => l.name) }),
};
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33269/index.html in 0.1 s, paused at frame 0.
{"name":"boombox","labels":["Woofer","Tweeter","Handle","Bass port"]}

look {}

HTML over the canvas: 3 (.label via CSS2DRenderer), 0 overlap, 0 off-screen, 0 cut off: div.label "Woofer" [590, 417, 650, 440], div.label "Tweeter" [853, 415, 918, 438], div.label "Handle" [760, 53, 819, 76].
On screen (4):
body 20% [506, 248, 1095, 645]
woofer 2.9% [551, 333, 711, 515]
handle 2.1% [633, 80, 968, 285] 1.96 × 0.98 units, across the view
tweeter 1.1% [841, 370, 943, 475]
Never visible: port (0.4 units, in view, behind tweeter)
```

Boxes are `[left, top, right, bottom]` in page pixels. Each label's box falls inside its object's: the Woofer label inside the woofer, the Tweeter label inside the tweeter, the Handle label just above the handle's arc, where its anchor was put. Three labels show, not four: the Bass port label is hidden, and `Never visible` says the port itself is drawn nowhere, being in view but behind the front of the model.

## The occlusion check, from the anchor's side

To hide a label behind the model, the page compares two distances: the anchor's distance from the camera, and the distance of the nearest surface drawn on the line to it. `eval` gives the first and the anchor's page pixel; `look` with `at` gives the second at that pixel.

```text
eval {"code": "const r = renderer.domElement.getBoundingClientRect(); return scene.children.filter((o) => o.isCSS2DObject).map((l) => { const p = l.getWorldPosition(new THREE.Vector3()); const distance = +p.distanceTo(camera.position).toFixed(2); p.project(camera); return { label: l.name, pixel: [Math.round(r.left + (p.x + 1) / 2 * r.width), Math.round(r.top + (1 - p.y) / 2 * r.height)], distance, visible: l.visible }; })"}

[{"label":"Woofer","pixel":[621,429],"distance":5.88,"visible":true},{"label":"Tweeter","pixel":[886,427],"distance":5.13,"visible":true},{"label":"Handle","pixel":[790,65],"distance":5.82,"visible":true},{"label":"Bass port","pixel":[926,458],"distance":6.38,"visible":false}]

look {"at": [[926, 458], [886, 427]]}

At (926, 458): tweeter 5.16 m at [0.98, 0.06, 0.55]; behind it body 5.21 m; then port 6.27 m; background beyond.
At (886, 427): tweeter 5.19 m at [0.78, 0.18, 0.55]; behind it body 5.25 m; background beyond.
```

The Bass port anchor is 6.38 from the camera, and at its pixel the first thing drawn is the tweeter at 5.16, with the body behind it and the port itself further back: the label belongs behind the model, and the page hid it. The Tweeter anchor is 5.13 away and the nearest surface at its pixel is 5.19, so the anchor is in front of the tweeter and the label shows. `at` reads what the page's shaders drew, so it agrees with the picture even where a raycast against geometry would not (a part a shader moves or cuts away).

## Bug 1: the label layer is not over the canvas

The same page with the label layer appended to the page instead of the viewer:

```js
document.body.appendChild(labelRenderer.domElement);
```

```text
look {}

HTML over the canvas: 3 (.label via CSS2DRenderer), 0 overlap, 0 off-screen, 0 cut off: div.label "Woofer" [290, 417, 350, 440], div.label "Tweeter" [553, 415, 618, 438], div.label "Handle" [460, 53, 519, 76].
On screen (4):
body 20% [506, 248, 1095, 645]
woofer 2.9% [551, 333, 711, 515]
handle 2.1% [633, 80, 968, 285] 1.96 × 0.98 units, across the view
tweeter 1.1% [841, 370, 943, 475]

eval {"code": "const c = renderer.domElement.getBoundingClientRect(), l = document.querySelector(\".label\").parentElement.getBoundingClientRect(); return { canvas: [c.left, c.top], labelLayer: [l.left, l.top] }"}

{"canvas":[300,0],"labelLayer":[0,0]}
```

Every label moved left by the same amount, and none is over its object any more: the Woofer label starts left of the canvas, over the sidebar, and the Tweeter label sits inside the woofer's box, where a visitor would read it as naming the woofer. The `eval` says why: the canvas starts after the sidebar and the label layer at the page's corner, so every transform is measured from the wrong origin. The shift is the canvas's offset, across or down, whatever pushed it there. Put the layer in the canvas's container, which needs `position: relative` (or any position other than static) so `top: 0` and `left: 0` mean its corner.

## Bug 2: the labels drift after a resize

The same page with `labelRenderer.setSize` left out of the resize handler, after the window narrows to 900 by 700:

```text
interact {"steps": [{"resize": [900, 700]}], "look": true}

Canvas: 600x700 buffer for 600x700 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
HTML over the canvas: 3 (.label via CSS2DRenderer), 0 overlap, 0 off-screen, 1 cut off: div.label "Woofer" [518, 417, 578, 440], div.label "Tweeter" [894, 415, 959, 438] cut off by the screen edge, div.label "Handle" [760, 53, 819, 76].
On screen (4):
body 29% [351, 217, 867, 564]
woofer 2.6% [391, 291, 531, 451]
handle 3% [463, 70, 755, 249] 1.96 × 0.98 units, across the view
tweeter 1.5% [645, 324, 734, 415]
```

The model moved with the new size and the labels did not: the Tweeter label is past the right edge of the window (`cut off by the screen edge`), far from the tweeter's box, the Handle label hangs in empty space right of the handle, and the Woofer label has slid off the woofer's corner. The label layer still holds the old 980 by 800 size and spreads the anchors over it. The fixed page, with its two `setSize` calls, after the same step:

```text
interact {"steps": [{"resize": [900, 700]}], "look": true}

Canvas: 600x700 buffer for 600x700 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
HTML over the canvas: 3 (.label via CSS2DRenderer), 0 overlap, 0 off-screen, 0 cut off: div.label "Woofer" [422, 363, 481, 386], div.label "Tweeter" [651, 362, 716, 385], div.label "Handle" [570, 45, 629, 68].
On screen (4):
body 29% [351, 217, 867, 564]
woofer 4.2% [391, 291, 531, 451]
handle 3% [463, 70, 755, 249] 1.96 × 0.98 units, across the view
tweeter 1.5% [645, 324, 734, 415]
```

Each label is back inside its object's box. A layout fault can look like drift too. Before the viewer had `min-width: 0`, the flex container would not narrow below the canvas's width, and the same step on the page with both `setSize` calls gave:

```text
interact {"steps": [{"resize": [900, 700]}], "look": true}

Canvas: 980x700 buffer for 980x700 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
HTML over the canvas: 3 (.label via CSS2DRenderer), 0 overlap, 0 off-screen, 1 cut off: div.label "Woofer" [612, 363, 671, 386], div.label "Tweeter" [841, 362, 906, 385] cut off by the screen edge, div.label "Handle" [760, 45, 819, 68].
```

Here the labels followed the model, and the Tweeter label is cut off because the canvas itself kept its old width and ran past the window's right edge. The `Canvas` line tells the two apart: a buffer still as wide as before the resize is a layout fault, and a buffer that changed with labels left behind is the label layer's size.

## Bug 3: a label shows through the model

The same page without the call to `hideLabelsBehindModel()` in the loop:

```text
look {}

HTML over the canvas: 4 (.label via CSS2DRenderer), 0 overlap, 0 off-screen, 0 cut off: div.label "Woofer" [590, 417, 650, 440], div.label "Tweeter" [853, 415, 918, 438], div.label "Handle" [760, 53, 819, 76], div.label "Bass port" [889, 446, 963, 469].
On screen (4):
tweeter 1.1% [841, 370, 943, 475]
Never visible: port (0.4 units, in view, behind tweeter)

look {"at": [[926, 458], [886, 427]]}

At (926, 458): tweeter 5.16 m at [0.98, 0.06, 0.55]; behind it body 5.21 m; then port 6.27 m; background beyond.
At (886, 427): tweeter 5.19 m at [0.78, 0.18, 0.55]; behind it body 5.25 m; background beyond.
```

Four labels now, and the Bass port label sits on the front of the tweeter, over a port the same reply says is never visible and the `at` line puts behind two surfaces. A visitor reads it as naming a part on the front. The fix is the function in the page: for each label, cast a ray from the camera to the anchor, and hide the label when the first hit is nearer than the anchor. Setting `label.visible = false` makes `CSS2DRenderer` hide its element, and the `HTML over the canvas` count drops to the labels still shown.

The raycast tests geometry, so it can disagree with what is drawn, for example on a part a shader moves or discards. When the page's choice and `look` with `at` disagree at an anchor's pixel, trust the pixel and change the check.

## What to read in the replies

- `look`, the `HTML over the canvas` line: each label's box in page pixels and what placed it (`via CSS2DRenderer`, `via drei Html`, or `via page` for the page's own elements over the canvas, such as hand-projected divs), and the counts of labels that overlap another, are off-screen (hidden by their renderer or outside the canvas) and are cut off by the screen edge.
- `look`, `On screen`: each object's box in the same pixels. A label belongs inside or beside its object's box.
- `look` with `at`: the objects drawn at a pixel, nearest first, each with its distance from the camera. Compare with the anchor's own distance.
- `interact` with a `resize` step and `look` set: the same two lists after the resize, in one reply.

## Pitfalls

- **Anchor off the surface.** An anchor exactly on a face, or inside a thin part, is hidden by that part's own surface. Put it a little outside, along the face's normal; the Handle anchor sits above the handle's arc.
- **Anchor the label's corner, not its middle.** `CSS2DObject` centres the element on the anchor; `label.center.set(0.5, 1)` puts the bottom middle there instead, for a pin that points down at its spot.
- **Clicks on labels.** With `pointer-events: none` on the layer, set `pointer-events: auto` on the labels that should take clicks, or the click falls through to the canvas.
- **Raycast a short list.** The occlusion check runs every frame for every label; test the model's meshes, not `scene.children`, which holds the labels themselves.
- **Many labels.** A dense set of markers overlaps on a small screen; the `overlap` count in the line says how many collide at the size pictured.

## What paprika3d does not do

It does not write the label code, place labels, or hide them: the `CSS2DRenderer` setup and the occlusion test are the page's, and the agent changes them. It finds the label that is misplaced, drifting or shown through the model, and the object it should belong to. It judges boxes, not text: a label that names the wrong part but sits in the right place looks fine to it. Labels drawn into the canvas as sprites or text meshes are not in the `HTML over the canvas` line; they are in `On screen` like any other object.

## Without paprika3d

Give the label layer a translucent background colour while you work, so its box shows over the canvas and an offset is visible at once. Log `renderer.domElement.getBoundingClientRect()` beside `labelRenderer.domElement.getBoundingClientRect()`; the two must match. For occlusion, draw a small sphere at each anchor and look at it from where the visitor stands: if the sphere is hidden, the label should be too. For React Three Fiber, drei's `<Html>` has an `occlude` option that hides the element behind other objects.
