---
title: three.js isometric camera with an OrthographicCamera that fits any screen, keeps the scene off the near plane and puts the mouse on the right tile
phrase: three.js isometric camera
description: How to set up a three.js isometric or top-down view with an OrthographicCamera (the diagonal for true isometric or 2:1 tiles, a frustum that fits a wide screen and a portrait phone, near and far around the scene's depth, setFromCamera for the mouse), and three faults caught in the paprika3d plugin's replies: a phone that cuts the town's sides, a near plane that slices the front corner, and the perspective unproject recipe that puts the mouse on the wrong tile.
meta: three.js isometric camera: OrthographicCamera on the diagonal, a frustum for any aspect, near and far, and mouse to tile with setFromCamera.
intent: isometric-top-down-camera
queries:
  - "Setting up a 2D view in Three.js"
  - "Isometric view using PerspectiveCamera"
  - "Mouse position to world position in isometric view"
  - "Responsive Isometric/Orthographic Camera"
  - "R3F orthographic camera clips objects in isometric view, is this a frustum issue?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js isometric camera with an OrthographicCamera that fits any screen, keeps the scene off the near plane and puts the mouse on the right tile

## Four numbers decide an isometric view

An isometric view is an `OrthographicCamera` looking down a diagonal. Every ray it casts is parallel, so a building is the same size at the back of the map as at the front and parallel edges stay parallel. A `PerspectiveCamera` cannot do that: a narrow field of view from far away comes close, but its edges still converge and the sizes still change with distance. Use the orthographic camera.

The setup is four decisions, and each one has a fault of its own:

- **The direction.** A camera at `(d, d, d)` looking at the centre is true isometric: the three axes at equal angles, each square tile a diamond wider than it is tall. Lower the camera to get the 2:1 diamonds of pixel-art games (measured below).
- **The frustum.** `left`, `right`, `top` and `bottom` are in world units, not pixels, and they must follow the screen's aspect. A frustum that keeps a fixed height fits a laptop and cuts the sides off a portrait phone.
- **The distance, with `near` and `far`.** The camera's distance does not change the picture's scale, which tempts people to place it close. Anything nearer than `near` or farther than `far` is cut away, so the whole scene's depth from the camera has to sit between them.
- **The mouse.** `raycaster.setFromCamera(ndc, camera)` knows an orthographic camera. The recipe written for a perspective camera (unproject a point, cast from `camera.position` toward it) does not, and its error grows toward the screen's edges.

A top-down view is the same camera straight above the centre, and a 2D view is the same camera with the frustum set in pixel units (`left` 0, `right` `innerWidth`, `top` `innerHeight`, `bottom` 0, updated on resize). The frustum, depth and mouse checks below apply to all three.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `look` lists every named object on screen with its box in CSS pixels and names the ones never drawn. `eval` runs code in the page with `find` and `THREE` in scope, which reads the camera's frustum and the scene's depth. `interact` moves and clicks the mouse as a person would and names the object under each step; with `trace` it follows the page's own pick in `observe()`, so a pick that disagrees with what the pointer is over shows as two different names.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A town on 12 × 12 tiles

A ground of 1-unit tiles centred on the origin, five named buildings in a `town` group, and a white tile that follows the mouse. `observe()` returns the building under the mouse (`hover`), the tile under it (`tile`, column and row from 0 to 11) and the building last clicked (`selected`); `setState` clears the selection, which a saved check needs.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isometric town</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#d8e4ea}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8e4ea);
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6a4a, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-4, 10, 6);
scene.add(sun);

// The town: a 12 × 12 ground of 1-unit tiles centred on the origin, and its buildings.
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
const town = new THREE.Group();
town.name = 'town';
scene.add(town);
const ground = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 12), mat(0x86a860));
ground.name = 'ground';
ground.position.y = -0.2;
town.add(ground);
const building = (name, x, z, w, h, color) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat(color));
  m.name = name;
  m.position.set(x, h / 2, z);
  town.add(m);
  return m;
};
building('tower', -3.5, -3.5, 1.4, 5, 0xb8b0a0);
building('town_hall', 0, 0, 2.6, 2, 0xd8c8a8);
building('shop', 3.5, -2.5, 1.8, 1.4, 0xc87850);
building('house_left', -3.5, 3.5, 1.6, 1.6, 0xe0d8c8);
building('house_front', 3.5, 3.5, 1.6, 1.6, 0xa8b8d0);
// the tile under the mouse
const cursor = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
cursor.name = 'cursor';
cursor.position.y = 0.01;
cursor.visible = false;
scene.add(cursor);

// Isometric: an orthographic camera looking down the (1, 1, 1) diagonal at the town's centre. Its distance does not
// change the size on screen, so it sits far enough back that the whole town is in front of the near plane, and the far
// plane is past the town's back corner.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 60);
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);

// The frustum: the town needs 9 units each side of the centre across the screen and 8.5 up and down. Keep both in
// view at any aspect: a wide screen is limited by the height, a tall phone by the width.
const NEED_X = 9, NEED_Y = 8.5;
function fit() {
  const aspect = innerWidth / innerHeight;
  const half = Math.max(NEED_Y, NEED_X / aspect);
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.updateProjectionMatrix();
}
fit();
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); fit(); });

// The mouse to the ground. setFromCamera knows the camera is orthographic: every ray is parallel to the view direction,
// starting from the mouse's point on the near plane.
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
const pickables = town.children.filter((o) => o !== ground);
let hover = null, selected = null, tile = null;
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  hover = raycaster.intersectObjects(pickables)[0]?.object.name ?? null;
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    const i = Math.floor(hit.x + 6), j = Math.floor(hit.z + 6);
    tile = i >= 0 && i < 12 && j >= 0 && j < 12 ? [i, j] : null;
    cursor.visible = !!tile;
    if (tile) cursor.position.set(i - 5.5, 0.01, j - 5.5);
  }
}
renderer.domElement.addEventListener('pointermove', pick);
renderer.domElement.addEventListener('click', (e) => { pick(e); selected = hover; });

renderer.setAnimationLoop(() => renderer.render(scene, camera));

window.__game = {
  subject: 'town',
  describe: () => ({ name: 'isometric town', camera: 'orthographic' }),
  observe: () => ({ hover, tile: tile && tile.join(', '), selected }),
  setState: (s) => { if ('selected' in s) selected = s.selected; },
};
</script>
</body></html>
```

`NEED_X` and `NEED_Y` are the half-width and half-height the town takes on screen from this direction, margin included. `Math.max(NEED_Y, NEED_X / aspect)` is the whole responsive rule: on a wide screen the height is the tight side and the width has room to spare, and on a portrait phone the width is the tight side, so the half-height grows until the width fits.

## Read the frustum and the scene's depth

The calls below were made on 2026-10-28. Run folder paths are left out and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41731/index.html in 0.2 s, paused at frame 0.

look {}

Subject: town takes 20% of the picture [241, 47, 1038, 645]; 6 of its 6 named parts show.
On screen (6):
ground 13% [241, 197, 1038, 645] 12 × 12 units
town_hall 2.1% [553, 273, 725, 445]
tower 2% [593, 47, 686, 282] 5 × 1.4 units
shop 1% [780, 331, 899, 453]
house_front 0.96% [587, 443, 692, 564]
house_left 0.96% [354, 308, 459, 429]
Never visible: none
Hidden by the game (visible false on it or a parent): cursor

eval {"code": "const c = camera; return { left: +c.left.toFixed(2), right: +c.right.toFixed(2), top: c.top, bottom: c.bottom, near: c.near, far: c.far, zoom: c.zoom };"}

{"left":-13.6,"right":13.6,"top":8.5,"bottom":-8.5,"near":1,"far":60,"zoom":1}

eval {"code": "const b = new THREE.Box3().setFromObject(find(\"town\")), v = new THREE.Vector3(), d = []; for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(camera.matrixWorldInverse); d.push(-v.z); } return { near: camera.near, far: camera.far, nearest: +Math.min(...d).toFixed(2), farthest: +Math.max(...d).toFixed(2) };"}

{"near":1,"far":60,"nearest":24.83,"farthest":41.8}
```

The town's box (from 47 to 645 down the page) sits inside the 800-pixel-tall picture, and the frustum reads back as the rule gives at 1280 × 800: a half-height of 8.5 and a half-width of 13.6. The second `eval` is the near and far check: it moves the eight corners of the town's bounding box into the camera's space and reports how far in front of the camera they lie. All of the town is between 24.83 and 41.8 units away, inside `near` 1 and `far` 60. The box's corners reach a little past the buildings, so the check errs on the safe side.

## The mouse on the right tile

To aim the mouse at a building or a tile, `eval` projects their points to screen pixels:

```text
eval {"code": "const px = (p) => { p.project(camera); return [Math.round((p.x + 1) / 2 * innerWidth), Math.round((1 - p.y) / 2 * innerHeight)]; }, out = {}; for (const n of [\"shop\", \"house_left\"]) { const b = new THREE.Box3().setFromObject(find(n)); out[n] = px(b.getCenter(new THREE.Vector3()).setY(b.max.y)); } for (const [i, j] of [[11, 0], [0, 11], [11, 11]]) out[\"tile \" + i + \", \" + j] = px(new THREE.Vector3(i - 5.5, 0, j - 5.5)); return out;"}

{"shop":[840,365],"house_left":[407,339],"tile 11, 0":[1006,400],"tile 0, 11":[274,400],"tile 11, 11":[640,611]}

interact {"steps": [{"mouse": "move", "x": 1006, "y": 400}, {"mouse": "move", "x": 274, "y": 400}, {"mouse": "move", "x": 640, "y": 611}, {"mouse": "move", "x": 840, "y": 365}, {"mouse": "click", "x": 407, "y": 339}], "trace": ["tile", "hover", "selected"]}

{"changed":{"hover":"house_left","tile":"0, 7","selected":"house_left"}}
mouse move at (1006, 400): over ground (Mesh, 34.6 units)
mouse move at (840, 365): over shop (Mesh, 33.3 units)
mouse click at (407, 339): over house_left (Mesh, 33.7 units)
tile: null until frame 1, "11, 0" until frame 2, "0, 11" until frame 3, "11, 11" until frame 4, "8, 2" until frame 5, then "0, 7"
hover: null until frame 4, "shop" until frame 5, then "house_left"
selected: null until frame 5, then "house_left"
```

Each move lands on the tile it was aimed at: the right corner's 11, 0, the left corner's 0, 11 and the front corner's 11, 11. The `over` lines are what the pointer is over in the drawn picture, and the page's `hover` names the same buildings. The click selects `house_left`, and its tile, 0, 7, is the ground behind the house's roof, where the parallel ray meets the ground plane. A game that walks a unit to the clicked tile wants that tile; one that selects buildings wants `hover`.

`look` with `at` lists everything along the ray at each point, nearest first, with each hit's world position, as a second opinion on the page's pick:

```text
look {"at": [[1006, 400], [274, 400], [640, 611], [840, 365], [407, 339]]}

At (1006, 400): ground 34.6 m at [5.52, 0, -5.49]; background beyond.
At (274, 400): ground 34.6 m at [-5.48, 0, 5.51]; background beyond.
At (640, 611): ground 28.3 m at [5.51, 0, 5.5]; background beyond.
At (840, 365): shop 33.3 m at [3.51, 1.4, -2.51]; behind it ground 35.7 m; background beyond.
At (407, 339): house_left 33.7 m at [-3.47, 1.6, 3.52]; behind it cursor 36.4 m; then ground 36.5 m; background beyond.
```

The click is kept as a check, from a cleared selection:

```text
interact {"steps": [{"state": {"selected": null}}, {"mouse": "move", "x": 274, "y": 400}, {"mouse": "click", "x": 407, "y": 339}], "expect": {"selected": "house_left", "tile": "0, 7"}, "save": "click-house"}

{"changed":{"hover":"house_left","tile":"0, 7","selected":"house_left"}}
mouse move at (274, 400): over ground (Mesh, 34.6 units)
mouse click at (407, 339): over house_left (Mesh, 33.7 units)
Expect: selected "house_left" ✓ · tile "0, 7" ✓
Saved check "click-house" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

test {}

✓ click-house
1 of 1 saved checks passed in 0.2 s
```

## Fault 1: a frustum with a fixed height cuts the phone's sides

The change: `const half = NEED_Y;` in `fit()`, so the width follows the aspect but the height never grows. It looks right on every landscape screen. A second `open` with `size` and `dpr` loads the page at a phone's size:

```text
open {"url": "index.html", "cwd": "<project>", "size": [390, 844], "dpr": 3}

look {}

Subject: town takes 50% of the picture [0, 49, 389, 681], cut by its edge; 6 of its 6 named parts show.
On screen (6):
ground 31% [0, 207, 389, 681] 12 × 12 units
town_hall 7.4% [104, 289, 286, 470]
tower 6.8% [146, 49, 243, 298] 5 × 1.4 units
house_front 3.3% [139, 467, 250, 595]
shop 1.2% [343, 358, 389, 469]
house_left 0.11% [0, 354, 5, 424]

eval {"code": "const c = camera; return { left: +c.left.toFixed(2), right: +c.right.toFixed(2), top: c.top, bottom: c.bottom, near: c.near, far: c.far, zoom: c.zoom };"}

{"left":-3.93,"right":3.93,"top":8.5,"bottom":-8.5,"near":1,"far":60,"zoom":1}
```

The Subject line says the town is cut by the picture's edge. `house_left` is 5 pixels wide against the left edge and the shop's box ends at 389, the last pixel column; the frustum is 3.93 units each side, where the town needs 9. The working page at the same size:

```text
look {}

Subject: town takes 13% of the picture [11, 260, 378, 534]; 6 of its 6 named parts show.
On screen (6):
ground 8.7% [11, 329, 378, 534] 12 × 12 units
town_hall 1.4% [155, 364, 234, 442]
tower 1.3% [174, 260, 216, 367] 5 × 1.4 units
shop 0.68% [260, 391, 314, 446]
house_left 0.64% [63, 380, 112, 435]
house_front 0.63% [171, 442, 219, 497]

eval {"code": "const c = camera; return { left: +c.left.toFixed(2), right: +c.right.toFixed(2), top: c.top, bottom: c.bottom, near: c.near, far: c.far, zoom: c.zoom };"}

{"left":-9,"right":9,"top":19.477,"bottom":-19.477,"near":1,"far":60,"zoom":1}
```

The whole town fits, at 13% of a tall picture. That is the price of fitting the width on a portrait phone: the town is small, with sky above and below. A phone game that wants the town bigger lets the player pan, or starts zoomed in on the part that matters, rather than cutting the edge by accident. [three.js responsive canvas](/guides/threejs-responsive-canvas-resize) covers the resize handler itself and the same check with a perspective camera; `look` with `viewports` pictures phone to desktop in one call.

## Fault 2: the camera close enough that the near plane slices the front

The change: `camera.position.set(3, 3, 3)`, the same direction from closer. On an orthographic camera the picture's scale does not change with distance, so the view looks the same, apart from the front:

```text
look {}

Subject: town takes 19% of the picture [241, 47, 1038, 561]; 6 of its 6 named parts show.
On screen (6):
ground 12% [241, 197, 1038, 561] 12 × 12 units
town_hall 2.1% [553, 273, 725, 449]
tower 2% [593, 47, 686, 282] 5 × 1.4 units
shop 1% [780, 331, 899, 453]
house_left 0.96% [354, 308, 459, 429]
house_front 0.013% [587, 443, 692, 539]
Never visible: none

eval {"code": "const b = new THREE.Box3().setFromObject(find(\"town\")), v = new THREE.Vector3(), d = []; for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(camera.matrixWorldInverse); d.push(-v.z); } return { near: camera.near, far: camera.far, nearest: +Math.min(...d).toFixed(2), farthest: +Math.max(...d).toFixed(2) };"}

{"near":1,"far":60,"nearest":-4.62,"farthest":12.36}
```

`house_front` falls from 0.96% of the picture to 0.013%, and the ground's box now ends at 561 instead of 645: the near plane cut a straight line across the ground's front corner and took the house with it, leaving two slivers of its walls. `look` still counts the slivers as on screen, so `Never visible` says none; the share is what changed. The depth check gives the cause in one line: the nearest corner is 4.62 units behind the camera, with `near` at 1.

Two fixes, both in the camera's setup: move the camera back along the same direction until `nearest` is past `near` (as the working page does at `(20, 20, 20)`), or give the orthographic camera a negative `near`, which it accepts because nothing is divided by depth. The second, tried with `eval` on the faulty page:

```text
eval {"code": "camera.near = -20; camera.updateProjectionMatrix(); return camera.near"}

-20

look {}

house_front 0.96% [587, 443, 692, 564]
Never visible: none
```

Then check `far` against `farthest` the same way. Past the slice, `look`'s wording for the planes is wrong, and the replies below show it. On the working page, the camera moved closer still so the whole house is in front of the near plane, then put back with `far` at 30, which is less than `farthest`:

```text
eval {"code": "camera.position.set(2, 2, 2); camera.lookAt(0, 0, 0); return 1"}

look {}

Subject: town takes 16% of the picture [241, 47, 1038, 504]; 5 of its 6 named parts show; in view but covered: house_front (behind ground).
Never visible: house_front (1.6 units, in view, behind ground)

eval {"code": "camera.position.set(20, 20, 20); camera.lookAt(0, 0, 0); camera.far = 30; camera.updateProjectionMatrix(); return 1"}

look {}

Subject: town takes 2.1% of the picture [508, 462, 771, 645]; 2 of its 6 named parts show.
On screen (2):
ground 1.4% [508, 554, 771, 645] 12 × 12 units
house_front 0.76% [587, 462, 692, 564]
Never visible: none
Left the view (an earlier look saw them): town: 4 parts (behind the camera)
```

Nothing covers `house_front` in the first: the near plane removed it, and `look` blames the ground behind it. The four parts in the second are in front of the camera, past `far`, and `look` calls them behind the camera. Both are `look` faults; until they are fixed, read a part that is "behind" something with nothing in front of it, or "behind the camera" on a camera facing it, as a near or far plane, and run the depth `eval`.

## Fault 3: the perspective unproject recipe

The change: the page builds its ray the way a perspective camera's recipe does.

```js
const v = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera);
raycaster.set(camera.position, v.sub(camera.position).normalize());
```

The same moves and click, aimed from the same `eval` points:

```text
interact {"steps": [{"mouse": "move", "x": 1006, "y": 400}, {"mouse": "move", "x": 274, "y": 400}, {"mouse": "move", "x": 640, "y": 611}, {"mouse": "move", "x": 840, "y": 365}, {"mouse": "click", "x": 407, "y": 339}], "trace": ["tile", "hover", "selected"]}

{"changed":{"tile":"1, 7"}}
mouse move at (1006, 400): over ground (Mesh, 34.6 units)
mouse move at (840, 365): over shop (Mesh, 33.3 units)
mouse click at (407, 339): over house_left (Mesh, 33.7 units)
tile: null until frame 1, "10, 1" until frame 2, "1, 10" until frame 3, "9, 9" until frame 4, "7, 2" until frame 5, then "1, 7"
hover: null until frame 2, "house_left" until frame 3, "house_front" until frame 4, "shop" until frame 5, then null
selected: null throughout the 5 frames

test {}

✗ click-house: selected null, expected "house_left"; tile "1, 7", expected "0, 7"
0 of 1 saved checks passed in 0.2 s
```

Every tile is pulled toward the middle of the town: 10, 1 for 11, 0, then 1, 10 for 0, 11, and 9, 9 for 11, 11. The pointer over bare ground at the left corner makes the page report `house_left`, the front corner reports `house_front`, and the click on `house_left` selects nothing. The ray starts at the camera and fans out as a perspective camera's would, while the picture was drawn with parallel rays; the two agree at the screen's centre, which is why a quick test click in the middle passes. `setFromCamera` starts each ray on the near plane under the mouse and points it along the view direction, which matches the picture.

## Top-down and 2:1 tiles

A top-down view needs no new code: the camera straight above the centre, the frustum and the pick unchanged. `eval` moves the camera for a look, until the next reload:

```text
eval {"code": "camera.position.set(0, 30, 0); camera.lookAt(0, 0, 0); return camera.up.toArray();"}

[0,1,0]

look {}

Subject: town takes 31% of the picture [358, 118, 921, 682]; 6 of its 6 named parts show.
On screen (6):
ground 27% [358, 118, 921, 682] 12 × 12 units
town_hall 1.5% [579, 339, 700, 460]
shop 0.71% [762, 240, 846, 324]
house_left 0.56% [438, 527, 512, 602]
house_front 0.56% [767, 527, 841, 602]
tower 0.42% [442, 203, 507, 267] 5 × 1.4 units
```

With the default `up` of (0, 1, 0), three.js still turns the camera to look straight down, with -z toward the top of the screen: the tower, at -3.5 on z, is near the top. Set `camera.up` before `lookAt` to choose another side as the top.

The tile shape depends on the camera's height over the same diagonal. `eval` measures one tile's diamond in pixels at two heights:

```text
eval {"code": "const tile = (y) => { camera.position.set(20, y, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); const [l, r, t, b] = [[-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5], [0.5, 0.5]].map(([x, z]) => new THREE.Vector3(x, 0, z).project(camera)); return { width: +((r.x - l.x) / 2 * innerWidth).toFixed(1), height: +((t.y - b.y) / 2 * innerHeight).toFixed(1) }; }; return { \"y 20\": tile(20), \"y 16.33\": tile(16.33) };"}

{"y 20":{"width":66.6,"height":38.4},"y 16.33":{"width":66.6,"height":33.3}}
```

At `(20, 20, 20)` a tile is 66.6 by 38.4 pixels, true isometric. At a height of 16.33 it is 66.6 by 33.3, the 2:1 diamond that pixel-art tiles are drawn for. The width does not change, because the camera's distance and height do not scale an orthographic picture.

## What to read in the replies

- The Subject line's `cut by its edge` at a phone's size, and boxes that start at 0 or end at the last pixel column: a frustum that does not follow the aspect.
- An object whose share drops to a sliver with nothing in front of it, or a straight cut across the ground: the near or far plane. The depth `eval` gives `nearest` and `farthest` to set them from.
- The page's `hover` and `tile` in the trace against the `over` lines and `look` `at`: two different names at the same point is a pick that does not match the picture. Aim at the corners of the scene, where the error is largest, not the middle.

## Pitfalls

- **`camera.zoom` scales the frustum.** With OrbitControls or a zoom of your own, `zoom` divides `left`, `right`, `top` and `bottom`, so read it with them; the limits for it are in [three.js OrbitControls limit zoom](/guides/threejs-orbitcontrols-limit-zoom-rotation).
- **Measure the pointer from the canvas, not the window.** The pick above uses the canvas's `getBoundingClientRect()`. A canvas offset from the page's corner with the pointer read from the window is a separate fault, covered in [three.js click on object](/guides/threejs-click-on-object-raycaster).
- **OrbitControls on an isometric camera** turns it off the diagonal. Set `enableRotate = false` to keep the angle and leave pan and zoom on.
- **A ground that is not flat** needs `raycaster.intersectObject(ground)` instead of the plane, or a plane at the ground's height, or the tile lands behind the hill.
- **A resize handler that calls `renderer.setSize` without `fit()`** keeps the first aspect and stretches the picture; the frustum has to follow every resize.

## What paprika3d does not do

It does not pick the frustum's size, the camera's direction or the tile shape: it reports what the page's camera shows at each size and where the page's pick lands, and the designer chooses. Its mouse steps are the events Chrome sends at the pixel given; a phone's touch on the same page is an `interact` `touch` step, not shown here. Its depth check is the `eval` above, run by the agent: `look` has no line of its own for the near or far plane, and names a part they cut away as covered or behind the camera, as shown in fault 2.

## Without paprika3d

Log `camera.left`, `camera.right`, `camera.top` and `camera.bottom` after each resize and open the page in the browser's device toolbar at a portrait phone size; the scene's corners should be inside the screen. For the near and far planes, add a `THREE.CameraHelper(camera)` seen from a second camera, or log the scene's bounding box corners in camera space as the depth `eval` does. For the pick, draw a small marker at the ray's ground hit on every `pointermove` and move the mouse to the four corners of the map: the marker should sit under the pointer at each.
