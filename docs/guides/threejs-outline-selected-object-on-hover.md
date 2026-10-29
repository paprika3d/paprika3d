---
title: three.js outline selected object on hover with OutlinePass, around the whole model, and what the pass draws
phrase: three.js outline selected object on hover
description: How to outline the hovered or selected object in three.js with OutlinePass so the outline goes around the whole glTF model and not the one part the ray met, and how a coding agent checks it with the paprika3d plugin, hovering named parts with interact on an exact frame, zooming on the outline with look, and counting the extra draw calls and triangles the pass adds with perf variants.
meta: three.js outline on hover goes around one part of the model? Select the model, not the mesh, and count what OutlinePass draws.
intent: outline-hover-selected-object
queries:
  - "How to render full outlines as a post process - tutorial"
  - "[SOLVED] Outline Pass Individual Geometry rather than whole scene"
  - "On hover of a 3d model | highlight"
  - "OutlinePass for child meshes"
  - "Ideas why r116 may cause outline pass to affect performance?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js outline selected object on hover with OutlinePass, around the whole model, and what the pass draws

## What OutlinePass outlines

`OutlinePass` from `three/addons/postprocessing/OutlinePass.js` draws an edge around every object in its `selectedObjects` array, after the scene is rendered. Each frame it walks each selected object and all its descendants and collects their meshes and sprites; points and lines are hidden while it works and are never outlined. So the array decides everything:

- **Put the model's root in it** (the `Group` or `gltf.scene` node for one product) and the outline goes around the whole model, all its parts at once.
- **Put the mesh a raycast returned in it** and the outline goes around that one mesh. A glTF from a modelling tool is many meshes under a few named nodes, so a hover handler that writes `selectedObjects = [hit.object]` outlines the seat of a chair, or the shade of a lamp, and never the product.
- **Empty the array** when the pointer leaves, or the last thing hovered keeps its outline.

The pass costs nothing while the array is empty. With anything selected, r186's `OutlinePass.render` draws the whole scene two more times, once for depth with the selected objects hidden and once for a mask with the others hidden, then runs its edge detection and blur on full-screen quads. That is the price the performance threads ask about: it grows with the size of the scene, not with the size of the outlined object.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `interact` with `hover` moves the mouse onto each named object's centre on an exact frame and returns what the page's state did there, so a hover handler is tested by name, not by guessed coordinates; with `look: true` the reply has the picture with the outline on. `look` with `zoom` enlarges the outline, which is a few pixels wide. `perf` with `variants` measures the page with something selected against the page with nothing selected, and its draw call and triangle counts are what the pass adds.

The walk from the mesh up to its product is the same fix as for a click. The [click on object guide](/guides/threejs-click-on-object-raycaster) shows it on clicks, with the names the ray returns; this page is about the outline, the hover and the pass.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A showroom with a hover outline

Three products, each a group of named parts, an `EffectComposer` with a `RenderPass`, an `OutlinePass` and the `OutputPass`, and a `pointermove` handler that outlines what the pointer is over. `window.__game.observe()` reports what is hovered and what the pass holds, so each `interact` reply says it. The handler has the bug: it selects the mesh the ray met.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Showroom</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e4dc);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.4, 7);
camera.lookAt(0, 0.7, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 6, 4);
scene.add(sun);

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
const part = (name, geometry, material, x, y, z) => {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(x, y, z);
  return m;
};
const floor = part('floor', new THREE.PlaneGeometry(14, 10), mat(0xb8a890), 0, 0, 0);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Three products, each a group of parts, as a glTF from a modelling tool arrives.
const chair = new THREE.Group();
chair.name = 'chair';
const wood = mat(0x8a5a32);
chair.add(part('chair_seat', new THREE.BoxGeometry(0.9, 0.1, 0.9), mat(0x2f5f8a), 0, 0.9, 0));
chair.add(part('chair_back', new THREE.BoxGeometry(0.9, 0.9, 0.08), wood, 0, 1.4, -0.41));
for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]])
  chair.add(part('chair_leg', new THREE.CylinderGeometry(0.04, 0.04, 0.85), wood, x, 0.43, z));
chair.position.set(-2.2, 0, 0);

const table = new THREE.Group();
table.name = 'table';
table.add(part('table_top', new THREE.CylinderGeometry(0.9, 0.9, 0.08, 48), mat(0xd8cdb8), 0, 1.0, 0));
table.add(part('table_stem', new THREE.CylinderGeometry(0.08, 0.08, 0.95), mat(0x333333), 0, 0.5, 0));
table.add(part('table_foot', new THREE.CylinderGeometry(0.45, 0.5, 0.06, 48), mat(0x333333), 0, 0.03, 0));

const lamp = new THREE.Group();
lamp.name = 'lamp';
lamp.add(part('lamp_base', new THREE.CylinderGeometry(0.25, 0.3, 0.1, 32), mat(0x222222), 0, 0.05, 0));
lamp.add(part('lamp_pole', new THREE.CylinderGeometry(0.03, 0.03, 1.6), mat(0x222222), 0, 0.85, 0));
lamp.add(part('lamp_shade', new THREE.ConeGeometry(0.45, 0.5, 32, 1, true), mat(0xf0e0b0), 0, 1.8, 0));
lamp.position.set(2.2, 0, 0);

scene.add(chair, table, lamp);
const products = [chair, table, lamp];

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const outlinePass = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
outlinePass.visibleEdgeColor.set(0xff6a00);
outlinePass.edgeStrength = 6;
outlinePass.edgeThickness = 2;
composer.addPass(outlinePass);
composer.addPass(new OutputPass());
window.outlinePass = outlinePass;

// Hover: outline what the pointer is over.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(products, true)[0];
  hovered = hit ? hit.object : null;
  outlinePass.selectedObjects = hovered ? [hovered] : [];
});

window.__game = {
  observe: () => ({ hovered: hovered?.name ?? null, outlined: outlinePass.selectedObjects.map(o => o.name) }),
};

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => composer.render());
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). The hover diffs, the pictures and the draw call and triangle counts do not depend on the GPU; the frame times in the `perf` reply do, and this guide does not use them. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page, then hover two parts.** `hover` takes the names `look` lists on screen. On a page drawn through a composer, a short wait first lets the page draw frames of its own.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:39651/index.html in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["floor","chair","table","lamp"]}

interact {"steps": [{"wait": 2}], "hover": ["chair_back", "lamp_shade"], "look": true}

{"after":{"hovered":null,"outlined":[]},"changed":{},"hover":[{"name":"chair_back","at":[353,298],"changed":{"hovered":"chair_back","outlined":["chair_back"]}},{"name":"lamp_shade","at":[944,255],"changed":{"hovered":"lamp_shade","outlined":["lamp_shade"]}}]}
Picture: <project>/paprika3d/runs/2026-10-28T10-14-28-453Z/look-3.png
On screen (13):
floor 52% [0, 361, 1279, 799] 14 × 10 units
chair_back 1.4% [289, 240, 416, 356] 0.9 × 0.9 units
table_top 1.2% [517, 334, 762, 393] 1.8 × 1.8 units
lamp_shade 0.52% [880, 216, 1008, 293]
chair_seat 0.49% [258, 356, 417, 393]
lamp_base 0.21% [888, 467, 969, 501]
lamp_pole 0.15% [925, 294, 946, 477] 1.6 × 0.06 units
chair_leg ×4 0.44% [268, 374, 417, 506] 0.85 × 0.08 units
```

The mouse went to `(353, 298)` on the chair's back and then to `(944, 255)` on the lamp's shade, and each time the state names what the pass holds: `chair_back`, then `lamp_shade`. Neither is a product. The page would put the same names in a tooltip or a "selected" panel.

**2. The outline, enlarged.** `zoom` takes a box in the page's pixels; this one holds the lamp, which the pointer is still over.

```text
look {"zoom": [860, 200, 1030, 510]}

Picture: <project>/paprika3d/runs/2026-10-28T10-14-28-453Z/look-4-zoom.png ([860, 200, 1030, 510] at 2.58×) of the live page at frame 8, not a saved picture or sheet
```

The glow runs around the shade's rim and its point, and stops there: the pole and the base have no edge at all. On a real glTF the effect is the same, an outline on a cushion or a door handle while the shopper is pointing at the sofa or the car.

**3. Select the product, not the part.** The handler walks up from the mesh to the product it belongs to:

```js
renderer.domElement.addEventListener('pointermove', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  let o = raycaster.intersectObjects(products, true)[0]?.object;
  while (o && !products.includes(o)) o = o.parent; // up from the part to its product
  hovered = o ?? null;
  outlinePass.selectedObjects = hovered ? [hovered] : [];
});
```

The next call reloads the page by itself and hovers the same two parts:

```text
interact {"steps": [{"wait": 2}], "hover": ["chair_back", "lamp_shade"], "look": true}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
{"after":{"hovered":null,"outlined":[]},"changed":{},"hover":[{"name":"chair_back","at":[353,298],"changed":{"hovered":"chair","outlined":["chair"]}},{"name":"lamp_shade","at":[944,255],"changed":{"hovered":"lamp","outlined":["lamp"]}}]}

look {"zoom": [860, 200, 1030, 510]}

Picture: <project>/paprika3d/runs/2026-10-28T10-14-28-453Z/look-8-zoom.png ([860, 200, 1030, 510] at 2.58×) of the live page at frame 8, not a saved picture or sheet
```

The same two points now select `chair` and `lamp`, and the zoom shows the edge along the shade, down both sides of the pole and around the base. The pass did the rest by itself: it was given one group and outlined the three meshes under it.

**4. The pointer leaves.** A move to empty wall above the products:

```text
interact {"steps": [{"mouse": "move", "x": 640, "y": 120}]}

{"changed":{"hovered":null,"outlined":[]}}
```

The array is emptied, so the outline goes and the pass stops drawing. A handler that assigns the array on a hit and never on a miss, or that pushes onto it, fails this step: the reply keeps a name in `outlined`.

**5. What the pass draws while something is outlined.** `perf` runs each variant on a fresh page against the baseline, with nothing hovered. The first variant selects the chair from code, the second also turns the pass off, and the third replaces the outline with an emissive tint on the chair's own materials, cloned so nothing else changes colour.

```text
perf {"variants": [{"label": "chair outlined", "code": "outlinePass.selectedObjects = [scene.getObjectByName(\"chair\")]"}, {"label": "chair outlined, pass off", "code": "outlinePass.selectedObjects = [scene.getObjectByName(\"chair\")];\noutlinePass.enabled = false"}, {"label": "emissive highlight instead", "code": "outlinePass.enabled = false;\nscene.getObjectByName(\"chair\").traverse(o => {\n  if (!o.isMesh) return;\n  o.material = o.material.clone();\n  o.material.emissive.set(0x663300);\n})"}]}

baseline: 144.7 ms median (p95 290.6), work 410.8 ms, 14 draw calls, 1339 triangles; over budget: frameMs 144.7 of 16.7 ms; desktop budget
chair outlined: 670.1 ms median (p95 982.5), work 814.6 ms, 34 draw calls, 2684 triangles; +363% vs baseline; +143% draw calls, +100% triangles
chair outlined, pass off: 174.2 ms median (p95 306.1), work 174.9 ms, 14 draw calls, 1339 triangles; within the noise of the baseline
emissive highlight instead: 197.8 ms median (p95 259.2), work 204.2 ms, 14 draw calls, 1339 triangles; within the noise of the baseline
Host load 40.1 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

Read the counts, not the milliseconds: on this software renderer, on a shared host, the times say nothing about a graphics card, as the reply's last line says. The counts hold anywhere. With the chair outlined the frame has 34 draw calls instead of 14 and 2,684 triangles instead of 1,339: the scene's triangles twice over, which is the two extra scene renders, and a handful of full-screen passes on top. An outline on a scene of 200,000 triangles costs another scene's worth twice, for as long as the pointer rests on something. The emissive tint costs no extra draw call at all, which is why many shops use it for hover and keep the outline for a click.

## What paprika3d does not do

- **`hover` takes a drawn mesh's name, not a group's.** It aims at the object's box in the ID image, where meshes are named; `hover: ["chair"]` on this page answers `not on screen in the ID image` although the chair is in plain view. Use a part's name from the `On screen` list, as above.
- **`hover` aims at the centre of the box.** For a part with a hole in the middle (the four legs listed as one entry, a ring, a frame) the centre can be empty floor; give an `interact` mouse step with exact `x` and `y` instead.
- **No line reports the outline.** The page's own state and the pictures carry the evidence; paprika3d does not know what the pass holds unless `observe()` says so, or an `eval` reads `outlinePass.selectedObjects`.
- **It does not judge the outline's look.** Edge colour, thickness and glow are choices it pictures and does not grade.
- **Frame times on this host mean nothing for a GPU.** On a machine with a graphics card, the same `perf` call gives times worth comparing.

## Pitfalls

- **Keep a reference to the pass.** The `perf` and `eval` code above reaches `outlinePass` because the page sets `window.outlinePass`; an outline pass kept in a closure cannot be read or toggled from outside.
- **Resize the composer with the renderer.** `composer.setSize` passes the size on to `OutlinePass`; a resize handler that sets the renderer's size alone leaves the outline drawn at the old resolution.
- **The edge colour goes through the tone mapping after it.** The pass sits before `OutputPass`, so a saturated colour at a high `edgeStrength` is tone mapped with the scene and comes out paler: the zooms above show `0xff6a00` at `edgeStrength` 6 as a pale orange glow.
- **Hidden parts get `hiddenEdgeColor`.** The part of an outlined object behind something else is drawn in that colour, dark by default; set it to the visible colour to show the whole silhouette through walls, or to black to hide it.
- **An InstancedMesh is outlined whole.** The pass outlines meshes, and one `InstancedMesh` is one mesh with every instance in it; outlining one instance takes a separate mesh for it.

## Without paprika3d

Dispatch `pointermove` events at computed screen points from a test, or move the mouse in a browser, and log `outlinePass.selectedObjects.map(o => o.name)` from the console. To count what the pass draws, set `renderer.info.autoReset = false`, call `renderer.info.reset()` before `composer.render()` and read `renderer.info.render.calls` and `triangles` after it, once with an empty array and once with something selected. The three.js examples include `webgl_postprocessing_outline`, which outlines the hovered object with this pass.
