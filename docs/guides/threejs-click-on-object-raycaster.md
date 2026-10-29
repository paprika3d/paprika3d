---
title: three.js click on object with a Raycaster, and why the click hits the wrong one
phrase: three.js click on object
description: How to click an object in three.js with a Raycaster and read the clicked point's 3D coordinate, and how to find why a click hits nothing or the neighbour (a canvas offset from the page's corner, a glTF whose child mesh is what the ray meets, a hidden mesh in front), shown with the paprika3d plugin's look and interact replies.
meta: three.js click on object with a Raycaster: pointer coordinates from the canvas, and why a click hits the wrong object or a hidden mesh.
intent: threejs-click-object-raycast
queries:
  - "Click event on object"
  - "Get mouse clicked point's 3D coordinate in three.js"
  - "Clicking on gltf models"
  - "How to click an object in THREE.js"
  - "Three.js Raycast off from mouse position"
  - "Detect certain gltf model part with Raycaster"
  - "Best way to do Instanced Mesh picking in 2024?"
  - "Raycaster with InstancedMesh"
  - "Raycast Highlight with InstancedMesh"
  - "Highlighting an instance in InstancedMesh"
  - "InstancedMesh how to use raycast for every instance?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js click on object with a Raycaster, and why the click hits the wrong one

## How a click finds an object

A three.js scene is drawn into one `<canvas>`, so the browser's click event knows the pixel and nothing about the meshes. To find the object under the pointer, the page casts a ray from the camera through that pixel and asks which meshes it crosses:

1. Turn the pointer position into normalized device coordinates: -1 to 1 across the canvas from left to right, and -1 to 1 from bottom to top. Measure from the canvas, with `renderer.domElement.getBoundingClientRect()`, not from the window.
2. `raycaster.setFromCamera(pointer, camera)` points the ray.
3. `raycaster.intersectObjects(list)` returns the hits, nearest first. Each hit has `object` (the mesh the ray met), `point` (where on its surface, in world coordinates), `distance` (from the camera), `face` and `uv`.

```js
const rect = renderer.domElement.getBoundingClientRect();
pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
raycaster.setFromCamera(pointer, camera);
const hit = raycaster.intersectObjects(clickable)[0];
// hit.object is the mesh, hit.point the clicked point in 3D, hit.distance how far it is from the camera
```

When this goes wrong, it goes wrong in a few known ways, each the subject of a long forum thread:

- **The pointer is measured from the window.** Code copied from the three.js examples divides by `innerWidth` and `innerHeight`, which is right for a canvas that fills the window. Put the canvas beside a sidebar or under a header and every ray is aimed off by that offset.
- **The model is a group.** A loaded glTF is a `Group`, often several levels deep, and the ray meets one of its meshes, so `hit.object === model` is false and `hit.object.name` is a part's name.
- **Something hidden is in the way.** The Raycaster tests every mesh it is given, drawn or not: a mesh with `visible = false` still catches the ray.
- **The matrices are not updated yet.** `setFromCamera` and the mesh tests read `matrixWorld`, which `renderer.render` updates. A raycast before the first frame, or right after moving an object in code, uses the old matrices.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Two of its replies give a coding agent the other side of each click. `look` with `at` lists what the page's own shaders draw at a pixel, nearest first, with the distance and the world point. Each mouse step of `interact` names the object under the pointer, from paprika3d's own raycast measured from the canvas, and the same reply holds what the click changed in the page's state. When the page's pick disagrees with those two, the bug is in the click handler, and the replies show which way it is off.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with three clickable products

A shop page: a sidebar on the left and the canvas filling the rest. Three products stand in a row, a crate, a ball and a lamp; the lamp is a group of two meshes, as a loaded glTF would be. A click selects a product and highlights it. `window.__game.observe()` returns what was selected, the point the ray met and its distance, so the `interact` reply can say what each click changed.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Picker</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;font:15px sans-serif}
body{display:flex}
aside{width:320px;flex:none;padding:16px;box-sizing:border-box;background:#eee}
canvas{display:block}
</style></head>
<body>
<aside><h3>Shop</h3><p>Click a product to select it.</p><p id="picked">Nothing selected</p></aside>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// The canvas fills the page right of the 320 px sidebar, so it does not start at the page's left edge.
const width = () => innerWidth - 320, height = () => innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width(), height());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202630);
const camera = new THREE.PerspectiveCamera(45, width() / height(), 0.1, 100);
camera.position.set(0, 2.5, 8);
camera.lookAt(0, 0.6, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.5));

const mat = (color) => new THREE.MeshStandardMaterial({ color });
const floor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 4), mat(0x506070));
floor.name = 'floor';
floor.position.y = -0.05;
scene.add(floor);

const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat(0xb07040));
crate.name = 'crate';
crate.position.set(-2.4, 0.6, 0);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 16), mat(0x40a0e0));
ball.name = 'ball';
ball.position.set(0, 0.7, 0);
// The lamp is built the way a loaded glTF arrives: a named group whose meshes are its children.
const lamp = new THREE.Group();
lamp.name = 'lamp';
lamp.position.set(2.4, 0, 0);
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.4, 1.2, 24), mat(0x707070));
base.name = 'lamp_base';
base.position.y = 0.6;
const shade = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 24, 1, true), mat(0xe0d060));
shade.name = 'lamp_shade';
shade.material.side = THREE.DoubleSide;
shade.position.y = 1.4;
lamp.add(base, shade);
scene.add(crate, ball, lamp);
const clickable = [crate, ball, lamp];

// The click: pointer position in the canvas, as -1..1 both ways (y up), then a ray from the camera through it.
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
let selected = null, point = null, distance = null, clicks = 0;
renderer.domElement.addEventListener('click', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickable)[0];   // recursive by default: the lamp's meshes are tested too
  let o = hit?.object;
  while (o && !clickable.includes(o)) o = o.parent;        // from the mesh the ray met up to the object that was added
  select(o ?? null, hit);
});

function select(o, hit) {
  if (selected) scene.getObjectByName(selected).traverse((m) => m.material?.emissive.set(0x000000));
  o?.traverse((m) => m.material?.emissive.set(0x553300));
  selected = o ? o.name : null;
  point = hit ? hit.point.toArray().map((n) => +n.toFixed(2)) : null;   // where on the surface the ray met it
  distance = hit ? +hit.distance.toFixed(2) : null;
  clicks++;
  document.getElementById('picked').textContent = selected ? 'Selected: ' + selected : 'Nothing selected';
}

addEventListener('resize', () => {
  renderer.setSize(width(), height());
  camera.aspect = width() / height();
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));

window.__game = {
  describe: () => ({ name: 'picker', mouse: 'click a product to select it', products: clickable.map((o) => o.name) }),
  observe: () => ({ selected, point, distance, clicks }),
  setState: (s) => { ({ selected = selected, point = point, distance = distance, clicks = clicks } = s); },
};
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:34767/index.html in 0.1 s, paused at frame 0.
{"name":"picker","mouse":"click a product to select it","products":["crate","ball","lamp"]}

look {}

Canvas: 960x800 buffer for 960x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
On screen (5):
floor 16% [320, 411, 1279, 570] 9 × 4 units, across the view
crate 3.9% [414, 320, 605, 489]
ball 2.8% [718, 306, 881, 470]
lamp_base 1.1% [1030, 359, 1125, 481]
lamp_shade 1% [1013, 264, 1160, 361]
```

The boxes are in page pixels, the coordinates mouse steps take, so they say where to click. Here are clicks on the right edge of the crate, the middle of the ball, the lamp's shade and the empty sky above the lamp:

```text
interact {"steps": [{"mouse": "click", "x": 590, "y": 400}]}

{"changed":{"selected":"crate","point":[-1.8,0.59,-0.05],"distance":8.47,"clicks":1}}
mouse click at (590, 400): over crate (Mesh, 8.5 units)

interact {"steps": [{"mouse": "click", "x": 800, "y": 388}]}

{"changed":{"selected":"ball","point":[0,0.86,0.68],"distance":7.5,"clicks":2}}
mouse click at (800, 388): over ball (Mesh, 7.5 units)

interact {"steps": [{"mouse": "click", "x": 1086, "y": 312}]}

{"changed":{"selected":"lamp","point":[2.3,1.39,0.28],"distance":8.13,"clicks":3}}
mouse click at (1086, 312): over lamp_shade (Mesh, 8.1 units)

interact {"steps": [{"mouse": "click", "x": 1200, "y": 200}]}

{"changed":{"selected":null,"point":null,"distance":null,"clicks":4}}
mouse click at (1200, 200): over nothing in the scene
```

Each reply has two halves. The first line is the page's answer: what its click handler stored. The `over` line is paprika3d's answer: the named object under that pixel and its distance from the camera. On this page they agree every time. The lamp shows the one expected difference: paprika3d names the mesh the pointer is over (`lamp_shade`), and the page walked up from that mesh to the product it belongs to (`lamp`).

## The clicked point's 3D coordinate

`hit.point` is the world position where the ray met the surface, and `hit.distance` is how far that is from the camera. The page keeps both. `look` with `at` reports the same two things for a pixel, found from what the shaders drew there rather than from a raycast:

```text
look {"at": [[800, 388], [590, 400], [1086, 312]]}

At (800, 388): ball 7.5 m at [0, 0.85, 0.68]; background beyond.
At (590, 400): crate 8.49 m at [-1.8, 0.58, -0.07]; background beyond.
At (1086, 312): lamp_shade 8.12 m at [2.3, 1.39, 0.29]; background beyond.
```

The page stored `[0, 0.86, 0.68]` for the ball and `look` reads `[0, 0.85, 0.68]`, the same point to within the rounding of one pixel's depth. The `m` is the scene's own unit; three.js does not fix one. To place something where the user clicked (a marker, a decal, a move order), copy `hit.point`. To stand it on the surface, use `hit.face.normal`, which is in the mesh's local space: `hit.face.normal.clone().transformDirection(hit.object.matrixWorld)` turns it into a world direction. To pick a spot on open ground where no mesh is, intersect the ray with a `THREE.Plane` through `raycaster.ray.intersectPlane(plane, target)`.

## Bug 1: the pointer measured from the window

The same page, with the two pointer lines from the examples in place of the canvas-relative ones:

```js
pointer.x = (e.clientX / innerWidth) * 2 - 1;
pointer.y = -(e.clientY / innerHeight) * 2 + 1;
```

```text
interact {"steps": [{"mouse": "click", "x": 590, "y": 400}]}

{"changed":{"selected":"ball","point":[-0.29,0.75,0.63],"distance":7.58,"clicks":1}}
mouse click at (590, 400): over crate (Mesh, 8.5 units)

interact {"steps": [{"mouse": "click", "x": 800, "y": 388}]}

{"changed":{"selected":null,"point":null,"distance":null,"clicks":2}}
mouse click at (800, 388): over ball (Mesh, 7.5 units)

look {"at": [[590, 400], [800, 388]]}

At (590, 400): crate 8.49 m at [-1.8, 0.58, -0.07]; background beyond.
At (800, 388): ball 7.5 m at [0, 0.85, 0.68]; background beyond.
```

The pointer was over the crate and the page selected the ball; the pointer was over the ball and the page selected nothing. `look` agrees with the `over` lines about what is drawn under both pixels, so the scene is fine and the ray is aimed wrong. One `eval` shows why:

```text
eval {"code": "const r = renderer.domElement.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, innerWidth }"}

{"left":320,"top":0,"width":960,"height":800,"innerWidth":1280}
```

The canvas starts after the sidebar and is narrower than the window. Measured from the window's left edge across the window's width, every click lands further right in the canvas than the pointer: the crate's edge becomes a ray through the ball, and the middle of the ball a ray through the gap between the ball and the lamp. Here the vertical half is right, because the canvas starts at the top of the page; under a header, clicks would drift down the same way. The fix is the two lines in the page above, measured from `getBoundingClientRect()`, which also stays right when the page scrolls or the canvas is scaled by CSS.

## Bug 2: the click finds a part of the glTF, not the model

The same page without the line that walks up the parents:

```js
let o = hit?.object;   // the mesh the ray met, used as it is
select(o ?? null, hit);
```

```text
interact {"steps": [{"mouse": "click", "x": 1086, "y": 312}]}

{"changed":{"selected":"lamp_shade","point":[2.3,1.39,0.28],"distance":8.13,"clicks":1}}
mouse click at (1086, 312): over lamp_shade (Mesh, 8.1 units)

interact {"steps": [{"mouse": "click", "x": 1078, "y": 440}]}

{"changed":{"selected":"lamp_base","point":[2.3,0.33,0.3],"distance":8.32,"clicks":2}}
mouse click at (1078, 440): over lamp_base (Mesh, 8.3 units)
```

Both halves agree here, and they are right: the ray met `lamp_shade`, then `lamp_base`. The bug is what the page does with it. A shop that opens the product named in `selected` gets two names it has never heard of, and code that compares `hit.object === lamp` never matches. A glTF from a modelling tool is worse than this lamp: its meshes sit under nodes named after the tool's objects, a few levels below `gltf.scene`.

The fix is the loop in the page: from `hit.object`, go up `parent` until you reach one of the objects you made clickable. Another way is to mark the model's root (`model.userData.product = 'lamp'`) and walk up to the first object that has the mark. When you want the part instead (which drawer of a cabinet, which key of a keyboard), use `hit.object` as it comes, and read the names the glTF gave its nodes from the `On screen` list of `look`, which names each drawn mesh.

## Bug 3: a hidden mesh catches the ray

The same page with a hover outline around the ball, hidden until the pointer is over it, and the raycast run against the whole scene:

```js
const outline = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
outline.name = "ball_outline";
outline.position.copy(ball.position);
outline.visible = false;   // shown on hover
scene.add(outline);
// ...
const hit = raycaster.intersectObjects(scene.children)[0];
```

```text
look {}

Hidden by the game (visible false on it or a parent): ball_outline

interact {"steps": [{"mouse": "click", "x": 800, "y": 388}]}

{"changed":{"point":[0,0.88,0.78],"distance":7.4,"clicks":1}}
mouse click at (800, 388): over ball (Mesh, 7.5 units)

observe {}

{"selected":null,"point":[0,0.88,0.78],"distance":7.4,"clicks":1, ...}

look {"at": [[800, 388]]}

At (800, 388): ball 7.5 m at [0, 0.85, 0.68]; background beyond.
```

`selected` is missing from `changed` because it stayed `null`, as `observe` confirms, yet the page's ray hit something: it stored a point and a distance. The pointer is over the ball at 7.5, and the page's hit is at 7.4, nearer than anything drawn at that pixel. `look` names the hidden mesh in its `Hidden by the game` line, and the outline is larger than the ball, so it is the first surface the ray crosses. The walk up the parents found no product above it and the click selected nothing.

Raycast the list of clickable objects, as the page above does, and a hidden helper outside that list is never tested. To raycast a whole scene, skip a hit whose object or any parent has `visible` false, or move helpers to another layer (`outline.layers.set(1)`, with `camera.layers.enable(1)` so they are still drawn), since a Raycaster tests layer 0 unless its own `layers` say otherwise.

## Keep the click as a check

`interact` with `expect` and `save` keeps a play in `game-tests.json`, and `test` replays every saved check from a fresh reload. The first attempt to save a lamp click did not pass:

```text
interact {"steps": [{"mouse": "click", "x": 1086, "y": 312}], "expect": {"selected": "lamp"}, "save": "click-lamp"}

{"changed":{"clicks":1}}
Expect: selected null ✗ expected "lamp"
Not saved: an Expect entry failed, and a saved check must pass when it is saved.
```

A saved check plays from a fresh reload at frame 0, and this click came before the page had drawn a frame, so `renderer.render` had not yet updated `matrixWorld` on the camera or the meshes, and the ray started from the scene's origin. That is the fourth item of the list at the top, and the reason the mouse step has no `over` line here either. A real visitor rarely clicks that early, so the check waits one frame first:

```text
interact {"steps": [{"wait": 1}, {"mouse": "click", "x": 1086, "y": 312}], "expect": {"selected": "lamp"}, "save": "click-lamp"}

{"changed":{"selected":"lamp","point":[2.3,1.39,0.28],"distance":8.13,"clicks":1}}
mouse click at (1086, 312): over lamp_shade (Mesh, 8.1 units)
Expect: selected "lamp" ✓
Saved check "click-lamp" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

interact {"steps": [{"wait": 1}, {"mouse": "click", "x": 800, "y": 388}], "expect": {"selected": "ball", "point.1": [0.8, 0.9]}, "save": "click-ball"}

{"changed":{"selected":"ball","point":[0,0.86,0.68],"distance":7.5,"clicks":1}}
mouse click at (800, 388): over ball (Mesh, 7.5 units)
Expect: selected "ball" ✓ · point.1 0.86 ✓
Saved check "click-ball" in game-tests.json (2 checks now); `test` reruns them all, each from a fresh reload.

test {}

✓ click-lamp
✓ click-ball
2 of 2 saved checks passed in 0.4 s
```

`test` on the page with bug 2, then on the page with bug 1:

```text
test {}

✗ click-lamp: selected "lamp_shade", expected "lamp"
✓ click-ball
1 of 2 saved checks passed in 0.4 s

test {}

✗ click-lamp: selected null, expected "lamp"
✗ click-ball: selected null, expected "ball"; point.1 nothing, expected 0.8 to 0.9
0 of 2 saved checks passed in 0.4 s
```

The page in this guide has `setState` in its `window.__game` beside `observe`; `test` calls it on each reload before the steps.

## How do I raycast an InstancedMesh and highlight the instance I clicked?

An `InstancedMesh` draws many copies of one mesh as one object, so a hit's `object` is the whole `InstancedMesh`, whichever copy the ray met. The hit's `instanceId` says which copy it was, and `setColorAt(instanceId, colour)` followed by `instanceColor.needsUpdate = true` highlights that copy alone. This page draws 24 crates as one `InstancedMesh` and can move them apart, as a layout change or an animation would:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crates</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202630);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 9, 11);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.5));

const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), new THREE.MeshStandardMaterial({ color: 0x506070 }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// 24 crates in one draw call: one InstancedMesh, each crate a matrix and a colour.
const COLS = 6, ROWS = 4, WOOD = new THREE.Color(0xb07040), PICKED = new THREE.Color(0xffd040);
const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial(), COLS * ROWS);
crates.name = 'crates';
const m = new THREE.Matrix4();
function layout(gap) {
  for (let i = 0; i < crates.count; i++) {
    m.makeTranslation((i % COLS - (COLS - 1) / 2) * gap, 0.4, (Math.floor(i / COLS) - (ROWS - 1) / 2) * gap);
    crates.setMatrixAt(i, m);
  }
  crates.instanceMatrix.needsUpdate = true;
}
layout(1.2);
for (let i = 0; i < crates.count; i++) crates.setColorAt(i, WOOD);
scene.add(crates);

// The click: the hit's instanceId says which crate.
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
let picked = null, clicks = 0;
renderer.domElement.addEventListener('click', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(crates)[0];
  if (picked !== null) crates.setColorAt(picked, WOOD);
  picked = hit ? hit.instanceId : null;
  if (picked !== null) crates.setColorAt(picked, PICKED);
  crates.instanceColor.needsUpdate = true;
  clicks++;
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));

window.__game = {
  describe: () => ({ name: 'crates', mouse: 'click a crate to pick it', actions: ['spread'] }),
  observe: () => ({ picked, clicks }),
  setState: (s) => { ({ picked = picked, clicks = clicks } = s); },
  act: ({ action }) => { if (action === 'spread') layout(2.4); }, // the crates move apart
};
</script>
</body></html>
```

These replies were captured on 2026-10-28 on the same host as above, cut to the lines this section discusses. `look` lists the 24 crates on one line (`crates* ×24`), so an `eval` turns four crates' positions into page pixels to click:

```text
eval {"code": "const c = find(\"crates\"), m = new THREE.Matrix4(), v = new THREE.Vector3(), r = renderer.domElement.getBoundingClientRect(), out = {};\nfor (const i of [0, 5, 18, 23]) { c.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(c.matrixWorld).project(camera); out[i] = [Math.round(r.left + (v.x + 1) / 2 * r.width), Math.round(r.top + (1 - v.y) / 2 * r.height)]; }\nreturn out;\n"}

{"0":[451,309],"5":[829,309],"18":[409,464],"23":[871,464]}

interact {"steps": [{"mouse": "click", "x": 829, "y": 309}]}

{"changed":{"picked":5,"clicks":1}}
mouse click at (829, 309): over crates (Mesh, 15.2 units)

look {"at": [[829, 309]]}

At (829, 309): crates[5] 15.2 m at [2.92, 0.66, -1.4]; behind it floor 16.4 m; background beyond.

look {"sample": [[829, 300], [451, 300]]}

Colours (5 × 5 mean, in the page's pixels): (829, 300) #d6af35, (451, 300) #935d35.
```

The page stored instance 5. The `over` line names the object the ray met, the whole `crates` mesh, while `look` with `at` names the copy drawn at that pixel, `crates[5]`, which is the number to compare with the page's `picked`. The two samples are the picked crate in the highlight colour and crate 0 still in wood.

Now a trap that a working pick falls into later. An `InstancedMesh` keeps one bounding sphere around all its instances, computed the first time something needs it (the first frame's culling, or the first raycast) and then kept. The Raycaster tests that sphere before any instance, and moving instances with `setMatrixAt` does not update it:

```text
interact {"steps": [{"action": "spread"}]}

{"after":{"picked":5,"clicks":1},"changed":{}}

eval {"code": "const c = find(\"crates\"), m = new THREE.Matrix4(), v = new THREE.Vector3(), r = renderer.domElement.getBoundingClientRect(), out = {};\nfor (const i of [0, 5, 18, 23]) { c.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(c.matrixWorld).project(camera); out[i] = [Math.round(r.left + (v.x + 1) / 2 * r.width), Math.round(r.top + (1 - v.y) / 2 * r.height)]; }\nreturn out;\n"}

{"0":[294,251],"5":[986,251],"18":[121,570],"23":[1159,570]}

interact {"steps": [{"mouse": "click", "x": 1159, "y": 570}]}

{"changed":{"picked":null,"clicks":2}}
mouse click at (1159, 570): over floor (Mesh, 13.4 units)

look {"at": [[1159, 570]]}

At (1159, 570): crates, distance unknown (no ray hits it: its shader places its vertices); behind it floor 13.4 m; background beyond.
```

Crate 23 is drawn at that pixel, and the click picks nothing: the ray misses the old sphere, so no crate is tested. The `over` line misses it too, since paprika3d's own raycast asks the same mesh. `look` with `at` sees the crates drawn there and no ray that meets them, and says so; its guess at the reason, a shader that places the vertices, is not the cause here. When `at` names an `InstancedMesh` with no ray hitting it, recompute the sphere before suspecting a shader:

```text
eval {"code": "const c = find(\"crates\"); c.computeBoundingSphere(); return +c.boundingSphere.radius.toFixed(2)"}

9.18

interact {"steps": [{"mouse": "click", "x": 1159, "y": 570}]}

{"changed":{"picked":23,"clicks":3}}
mouse click at (1159, 570): over crates (Mesh, 12.2 units)

look {"at": [[1159, 570]]}

At (1159, 570): crates[23] 12.2 m at [5.73, 0.8, 3.95]; behind it floor 13.4 m; background beyond.
```

In the page, call `crates.computeBoundingSphere()` after `layout()` sets `instanceMatrix.needsUpdate`, every time the instances move. The same sphere decides whether the whole `InstancedMesh` is drawn at all: once the stale sphere leaves the view, every crate vanishes at once, the moved ones included. For copies that move every frame, recompute it after each move; it reads every instance's matrix, so for many thousands of copies a sphere set once by hand around everywhere they can go (`crates.boundingSphere = new THREE.Sphere(centre, radius)`) costs less. In React Three Fiber, a pointer event on an `<instancedMesh>` carries the same number as `e.instanceId`.

## What to read in the replies

- `interact`, the `changed` line: what the page's own click handler stored. A key missing from it kept its value.
- `interact`, the `over` line on each mouse step: the named object under the pointer and its distance, from a ray measured from the canvas. An unnamed mesh with no named parent shows as `an unnamed Mesh`.
- `look` with `at`: what the shaders drew at the pixel, nearest first, with the distance and the world point of the first. A part that a shader discards is skipped and named.
- `look`, `On screen`: each drawn mesh with its box in page pixels, the coordinates for mouse steps.
- `look`, `Hidden by the game`: named objects with `visible` false, which a raycast still meets.

## Pitfalls

- **Name what you click.** `selected`, the `over` line and `look` all speak in names. Set `gltf.scene.name` when a model loads.
- **Listen on the canvas, not the window,** so a click on the sidebar or a button over the canvas does not reach the raycast at all.
- **Call `camera.updateMatrixWorld()`** before a raycast you run in code right after moving the camera, and do not raycast before the first frame.
- **A click is not a drag.** With OrbitControls, a drag to turn the camera ends with a click event too. Compare the `pointerdown` and `pointerup` positions and ignore the click when they differ by more than a few pixels.
- **Raycasting is per mesh, per triangle.** On a large scene, raycast a short list of clickable objects, or a simple invisible proxy kept out of the drawn scene, rather than `scene.children`.

## What paprika3d does not do

It does not write or fix the click handler: it reports what the page stored and what is under the pointer, and the agent changes the code. It does not decide which objects should be clickable. Its mouse and touch steps are events Chrome sends to the page; they do not test a real touch screen, a pen or a trackpad. The `over` line is paprika3d's own raycast against the meshes' geometry, so a part that a shader moves or discards can differ from what is drawn; `look` with `at` reads the drawn pixels for that case.

## Without paprika3d

Log the hit in the handler, `console.log(hit?.object.name, hit?.point)`, and compare it with what is under the cursor. A small sphere moved to `hit.point` on each click shows where the page thinks the click landed: if the dot appears away from the cursor, the pointer coordinates are off, and if it appears on an object you cannot see, something hidden is in the way. `scene.add(new THREE.ArrowHelper(hit.face.normal.clone().transformDirection(hit.object.matrixWorld), hit.point, 0.5))` draws the surface normal at that point. Logging `renderer.domElement.getBoundingClientRect()` next to `innerWidth` and `innerHeight` shows an offset canvas at once.
