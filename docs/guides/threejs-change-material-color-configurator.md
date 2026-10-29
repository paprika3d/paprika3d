---
title: three.js change material color at run time, from a configurator's swatch menu, and check every option
phrase: three.js change material color
description: How a three.js product configurator changes one part's colour or material from an HTML menu of swatches (find the part, give it its own material, set the colour as sRGB, swap materials on the meshes), and how a coding agent checks every option with the paprika3d plugin's eval, interact and look replies, including three faults those replies catch.
meta: three.js change material color at run time from a configurator's swatches, and check every option renders the colour it names.
intent: product-configurator-change-material
queries:
  - "Changing material(s) of a mesh in runtime"
  - "Is it possible to create a dynamic product configurator?"
  - "Set color to object"
  - "Create a menu for changing colors object in scene"
  - "How to build a product configurator à 'Tesla Design Studio' for a own product?"
  - "Ring model change color"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js change material color at run time, from a configurator's swatch menu, and check every option

## How a configurator changes one part

A product configurator is a model, a menu of options, and a few lines that change a material when an option is picked. Four things decide whether those lines change the right part, and change it to the colour on the button:

1. **Find the part by its name.** `model.getObjectByName('seat')` finds a node in a loaded glTF. A named glTF node is often a `Group` whose children are the meshes (a node whose mesh has several primitives always is), and a `Group` has no material. Change the material on each mesh under it with `traverse`.
2. **Give the part a material of its own.** `GLTFLoader` hands every mesh that uses the same glTF material the same three.js material object. A model exported with one white material on the seat and the frame has one `MeshStandardMaterial` on both, and changing its colour changes both. Clone it once when the model loads and put the copy on the part.
3. **Set the colour as the button shows it.** `material.color.set('#b5543a')` reads a CSS hex string (or a hex number) as sRGB and converts it, so the part is drawn in the colour the swatch shows, before lighting. `color.setRGB(r, g, b)` reads its three numbers as linear unless you pass `THREE.SRGBColorSpace` as a fourth argument.
4. **Swap whole materials on the meshes.** For a finish that is more than a colour (wood, leather, metal), build each option's material once and assign it to each mesh: `mesh.material = oak`. Reusing the built materials keeps the menu from compiling a new shader or leaking a material on every click.

```js
const seat = model.getObjectByName('seat'), frame = model.getObjectByName('frame');
const seatMat = seat.getObjectByName('seat_cushion').material.clone();   // its own copy
seat.traverse((o) => { if (o.isMesh) o.material = seatMat; });

function setSeat(hex) { seatMat.color.set(hex); }                                         // '#b5543a', read as sRGB
function setFrame(mat) { frame.traverse((o) => { if (o.isMesh) o.material = mat; }); }    // on each mesh

menu.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b?.dataset.seat) setSeat(SEAT[b.dataset.seat]);
  if (b?.dataset.frame) setFrame(FRAME[b.dataset.frame]);
});
```

Each of those four can go wrong without an error in the console: the wrong part changes too, the colour is paler than the button, or nothing changes while the menu says it did. paprika3d is a Claude Code plugin and MCP server that opens the page in its own headless Chrome. For a configurator, its replies give a coding agent the parts and materials of the model as the page holds them (`eval` with `find`), the result of clicking the page's own swatch buttons with a picture in the same reply (`interact` with `look: true`), the drawn colour at a point (`look` with `sample`), and every option side by side in one grid (`look` with `sheet`).

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A chair with two menus

A chair with a seat in four fabric colours and a frame in three finishes. It is built the way a glTF exported from a modelling tool arrives: a `chair` group with a `seat` group and a `frame` group, the meshes as their children, and one material named `white` on every part, because the default product is white all over. The menu is HTML over the canvas. `window.__game` gives the chosen options to `observe()` and sets them through `setState`, which lets `interact` say what a click changed and lets each cell of a `sheet` start from an option.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Chair configurator</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;font:14px sans-serif;background:#e9e6e1}
canvas{display:block}
#menu{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:28px;padding:12px 18px;background:#fff;border-radius:10px}
#menu div{display:flex;gap:8px;align-items:center}
button{width:34px;height:34px;border-radius:50%;border:2px solid #ccc;cursor:pointer}
button.on{border-color:#222}
</style></head>
<body>
<div id="menu">
  <div>Seat
    <button data-seat="chalk" style="background:#ece8e0" title="Chalk"></button>
    <button data-seat="rust" style="background:#b5543a" title="Rust"></button>
    <button data-seat="sage" style="background:#8a9a7a" title="Sage"></button>
    <button data-seat="navy" style="background:#2a3a5a" title="Navy"></button>
  </div>
  <div>Frame
    <button data-frame="white" style="background:#ece8e0" title="White"></button>
    <button data-frame="oak" style="background:#b98a56" title="Oak"></button>
    <button data-frame="black" style="background:#222222" title="Black"></button>
  </div>
</div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;   // made for product colours: swatches stay close to their hex
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc4beb4);
scene.fog = new THREE.Fog(0xc4beb4, 6, 20);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50);
camera.position.set(2.2, 1.7, 3.0);
camera.lookAt(0, 0.55, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(3, 5, 4);
scene.add(sun);

// The chair, built the way a glTF from a modelling tool arrives: named groups whose children are the meshes,
// and one material, "white", on every part, because the default product is white all over.
const white = new THREE.MeshStandardMaterial({ name: 'white', color: '#ece8e0', roughness: 0.8 });
const part = (name, w, h, d, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
  m.name = name;
  m.position.set(x, y, z);
  return m;
};
const chair = new THREE.Group(); chair.name = 'chair';
const seat = new THREE.Group(); seat.name = 'seat';
seat.add(part('seat_cushion', 0.9, 0.14, 0.8, 0, 0.53, 0.02), part('back_cushion', 0.78, 0.6, 0.12, 0, 0.95, -0.33));
const frame = new THREE.Group(); frame.name = 'frame';
for (const [n, x, z] of [['leg_fl', 0.4, 0.36], ['leg_fr', -0.4, 0.36], ['leg_bl', 0.4, -0.36], ['leg_br', -0.4, -0.36]])
  frame.add(part(n, 0.06, 0.42, 0.06, x, 0.21, z));
frame.add(part('rail', 0.94, 0.06, 0.84, 0, 0.42, 0), part('post_l', 0.06, 0.9, 0.06, 0.43, 0.87, -0.4),
  part('post_r', 0.06, 0.9, 0.06, -0.43, 0.87, -0.4), part('back_rail', 0.88, 0.06, 0.04, 0, 1.28, -0.4));
chair.add(seat, frame);
scene.add(chair);
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: '#b3ada2' }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// The options. The seat changes colour; the frame changes material.
const SEAT = { chalk: '#ece8e0', rust: '#b5543a', sage: '#8a9a7a', navy: '#2a3a5a' };
const FRAME = {
  white,
  oak: new THREE.MeshStandardMaterial({ name: 'oak', color: '#b98a56', roughness: 0.6 }),
  black: new THREE.MeshStandardMaterial({ name: 'black', color: '#222222', roughness: 0.4 }),
};
// The seat shares "white" with the frame, so give the seat its own copy before changing its colour.
const seatMat = white.clone();
seatMat.name = 'seat_fabric';
seat.traverse((o) => { if (o.isMesh) o.material = seatMat; });

const chosen = { seat: 'chalk', frame: 'white' };
function setSeat(name) {
  seatMat.color.set(SEAT[name]);           // a CSS hex string is read as sRGB
  chosen.seat = name;
  mark();
}
function setFrame(name) {
  frame.traverse((o) => { if (o.isMesh) o.material = FRAME[name]; });   // on each mesh, not on the group
  chosen.frame = name;
  mark();
}
function mark() {
  for (const b of document.querySelectorAll('button'))
    b.classList.toggle('on', b.dataset.seat === chosen.seat || b.dataset.frame === chosen.frame);
}
document.getElementById('menu').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b?.dataset.seat) setSeat(b.dataset.seat);
  if (b?.dataset.frame) setFrame(b.dataset.frame);
});
mark();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));

window.__game = {
  subject: 'chair',
  describe: () => ({ name: 'chair configurator', mouse: 'click a swatch', seat: Object.keys(SEAT), frame: Object.keys(FRAME) }),
  observe: () => ({ ...chosen }),
  setState: (s) => { if (s.seat) setSeat(s.seat); if (s.frame) setFrame(s.frame); },
};
</script>
</body></html>
```

## The tool calls, in order

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); the one timed line, under the sheet, says nothing about a real GPU.

### 1. Open the page and list the parts

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41787/index.html in 0.1 s, paused at frame 0.
{"name":"chair configurator","mouse":"click a swatch","seat":["chalk","rust","sage","navy"],"frame":["white","oak","black"]}

look {}

HTML over the canvas: 1 (div via page), 0 overlap, 0 off-screen, 0 cut off: div#menu "Seat Frame" [426, 718, 853, 775].
Subject: chair takes 11% of the picture [434, 126, 851, 649]; 10 of its 10 named parts show.
Stands out: subject brightness 72% against 65% around it, colour 7% against 10%, edge contrast 0.063. It blends in: the eye has nothing to land on. Light it brighter or darker than its surroundings, or give it a colour the background lacks (references/lighting.md).
On screen (11):
back_cushion 4.3% [592, 150, 822, 369]
seat_cushion 4% [436, 338, 828, 499]
leg_fl 0.36% [664, 520, 695, 649] 0.42 × 0.06 units

eval {"code": "const rows = [];\nfind('chair').traverse((o) => rows.push([o.name, o.type, o.material?.name ?? null, o.material?.uuid.slice(0, 8) ?? null]));\nreturn rows;"}

[["chair","Group",null,null],["seat","Group",null,null],["seat_cushion","Mesh","seat_fabric","a6c3fcdf"],["back_cushion","Mesh","seat_fabric","a6c3fcdf"],["frame","Group",null,null],["leg_fl","Mesh","white","3b8fb94e"],["leg_fr","Mesh","white","3b8fb94e"],["leg_bl","Mesh","white","3b8fb94e"],["leg_br","Mesh","white","3b8fb94e"],["rail","Mesh","white","3b8fb94e"],["post_l","Mesh","white","3b8fb94e"],["post_r","Mesh","white","3b8fb94e"],["back_rail","Mesh","white","3b8fb94e"]]
```

The `HTML over the canvas` line gives the menu's box in page pixels, and the swatch centres along its middle row are where the clicks below go. The `eval` reply is the table a configurator is written from: which names are groups and which are meshes, and which meshes hold the same material object (the same short id). Here the two cushions share `seat_fabric`, the copy the page made, and every frame part shares `white`. On a model you did not build, run the same three lines on the loaded root before writing any option code. The `Stands out` line is about the default white chair on a pale floor; the coloured options below do not get it.

### 2. Try an option before writing it

`eval` changes the open page and nothing else, so a new option can be tried before it goes into the source. A dark leather for the seat:

```text
eval {"code": "const leather = new THREE.MeshStandardMaterial({ name: 'leather', color: '#5a3424', roughness: 0.35 });\nfind('seat').traverse((o) => { if (o.isMesh) o.material = leather; });\nreturn [find('seat_cushion').material.name, find('leg_fl').material.name];"}

["leather","white"]

look {"sample": [[630, 400], [700, 260], [680, 590]]}

Colours (5 × 5 mean, in the page's pixels): (630, 400) #4a2004, (700, 260) #401b02, (680, 590) #b5b1a9.
```

The seat took the leather and the front leg kept `white`. The change vanishes at the next reload.

### 3. Click the page's own swatches

`interact` clicks the real buttons, so the menu's own listener runs, and `look: true` adds the picture after the click:

```text
interact {"steps": [{"mouse": "click", "x": 540, "y": 747}], "look": true}

{"changed":{"seat":"rust"}}
Pixels: brightness 62%, colour saturation 16%, 0% near black, 2% blown out; 9% of the picture changed since the last look.
Hues: grey 91%, orange 8% of the frame; over the objects but floor (11% of it): orange 73%, grey 27%.

interact {"steps": [{"mouse": "click", "x": 776, "y": 747}]}

{"changed":{"frame":"oak"}}

look {"sample": [[630, 400], [700, 260], [680, 590], [540, 747]]}

Colours (5 × 5 mean, in the page's pixels): (630, 400) #a33f1b, (700, 260) #8b3411, (680, 590) #8a5f26, (540, 747) #b5543a.
```

The rust click changed `seat` and nothing else in the state, and the picture says the chair's hue went from grey to orange over the objects. The samples are the seat's top, the back cushion, the front leg and the rust button itself. A lit surface is never exactly its swatch's hex: the seat top facing the light and the back cushion facing away are two shades of the same rust, both darker than the button's `#b5543a`. What to compare is one option against another at the same point, as the faults below do.

### 4. Every option in one picture

`look` with `sheet` reloads the page for each cell, sets it up with `state` (through `setState`) and pictures them all in one grid:

```text
look {"sheet": [{"label": "chalk, white", "state": {"seat": "chalk", "frame": "white"}}, {"label": "rust, oak", "state": {"seat": "rust", "frame": "oak"}}, {"label": "sage, black", "state": {"seat": "sage", "frame": "black"}}, {"label": "navy, oak", "state": {"seat": "navy", "frame": "oak"}}, {"label": "rust, black", "state": {"seat": "rust", "frame": "black"}}, {"label": "navy, white", "state": {"seat": "navy", "frame": "white"}}]}

Picture: <project>/paprika3d/runs/2026-10-28T06-44-58-137Z/look-10-sheet.png (6 moments, left to right, top to bottom: chalk, white | rust, oak | sage, black | navy, oak | rust, black | navy, white); the game is reloaded at its first frame
chalk, white: subject chair 11%; on screen: floor, back_cushion, seat_cushion, rail, post_l, back_rail, leg_fl, leg_fr, … 3 more; pixels: brightness 66%, colour saturation 10%, 0% near black, 2% blown out. Pale: little colour.
sage, black: subject chair 11%; on screen: floor, back_cushion, seat_cushion, rail, post_l, back_rail, leg_fl, leg_fr, … 3 more; pixels: brightness 61%, colour saturation 12%, 3% near black, 2% blown out
This sheet took 4 s (about 1 s a cell) on a software renderer.
```

The grid shows each seat colour on its frame and the menu's ring on the chosen buttons, since `setState` runs the same `setSeat` and `setFrame` as a click. Twelve combinations do not fit one sheet; two sheets cover them. A cell can also take `steps` instead of `state`, which is how the first fault below shows up.

## Fault 1: the seat colour recolours the frame

The same page without the clone, as code that reads the material the model came with:

```js
const seatMat = seat.getObjectByName('seat_cushion').material;   // the material the seat came with
```

```text
interact {"steps": [{"mouse": "click", "x": 540, "y": 747}], "look": true}

{"changed":{"seat":"rust"}}
Pixels: brightness 61%, colour saturation 19%, 0% near black, 2% blown out; 13% of the picture changed since the last look.
Hues: grey 88%, orange 12% of the frame; over the objects but floor (11% of it): orange 100%.

look {"sample": [[630, 400], [680, 590]]}

Colours (5 × 5 mean, in the page's pixels): (630, 400) #a33f1b, (680, 590) #8a3311.

eval {"code": "const rows = [];\nfind('chair').traverse((o) => rows.push([o.name, o.type, o.material?.name ?? null, o.material?.uuid.slice(0, 8) ?? null]));\nreturn rows;"}

[["chair","Group",null,null],["seat","Group",null,null],["seat_cushion","Mesh","white","3b8fb94e"],["back_cushion","Mesh","white","3b8fb94e"],["frame","Group",null,null],["leg_fl","Mesh","white","3b8fb94e"],["leg_fr","Mesh","white","3b8fb94e"],["leg_bl","Mesh","white","3b8fb94e"],["leg_br","Mesh","white","3b8fb94e"],["rail","Mesh","white","3b8fb94e"],["post_l","Mesh","white","3b8fb94e"],["post_r","Mesh","white","3b8fb94e"],["back_rail","Mesh","white","3b8fb94e"]]
```

A seat click turned the whole object orange, where the working page had a quarter of it grey, and the leg samples as rust. The `eval` table says why: every mesh holds the one `white` material. Whether a customer sees it depends on the order of the clicks, because a frame click puts a different material on the frame meshes. A sheet whose cells click the buttons with `steps` shows the orders side by side:

```text
look {"sheet": [{"label": "click rust", "steps": [{"mouse": "click", "x": 540, "y": 747}]}, {"label": "click oak, then rust", "steps": [{"mouse": "click", "x": 776, "y": 747}, {"mouse": "click", "x": 540, "y": 747}]}, {"label": "click rust, then oak", "steps": [{"mouse": "click", "x": 540, "y": 747}, {"mouse": "click", "x": 776, "y": 747}]}, {"label": "click rust, oak, then white", "steps": [{"mouse": "click", "x": 540, "y": 747}, {"mouse": "click", "x": 776, "y": 747}, {"mouse": "click", "x": 734, "y": 747}]}]}

Picture: <project>/paprika3d/runs/2026-10-28T06-45-48-571Z/look-5-sheet.png (4 moments, left to right, top to bottom: click rust | click oak, then rust | click rust, then oak | click rust, oak, then white); the game is reloaded at its first frame
```

In the picture, the first cell has a rust frame, the second and third an oak one, and the last a rust frame again although the white frame button is ringed: `FRAME.white` is the shared material, which now holds rust. A tester who picks a frame first never sees the fault. The fix is the clone in the page above, made once when the model loads.

## Fault 2: the material set on the group

The same page with the frame option written against the group:

```js
function setFrame(name) {
  frame.material = FRAME[name];
  chosen.frame = name;
  mark();
}
```

```text
interact {"steps": [{"mouse": "click", "x": 776, "y": 747}], "look": true}

{"changed":{"frame":"oak"}}
Pixels: brightness 66%, colour saturation 10%, 0% near black, 2% blown out; 0% of the picture changed since the last look. Pale: little colour.

look {"sample": [[680, 590]]}

Colours (5 × 5 mean, in the page's pixels): (680, 590) #b5b1a9.

eval {"code": "const f = find('frame');\nreturn { type: f.type, onGroup: f.material?.name, onLeg: find('leg_fl').material.name };"}

{"type":"Group","onGroup":"oak","onLeg":"white"}
```

The state and the menu say oak; the picture did not change at all, and the leg samples the same grey as before the click. No error is thrown, because JavaScript lets any object take a new property: the `Group` now has a `material` that nothing draws, and the meshes under it still hold `white`. This is the usual cause behind "I set the material and nothing happens" on a loaded glTF. The fix is the `traverse` in the page above.

## Fault 3: the swatch colour read as linear

The same page with the hex split into three numbers, as a colour picker's 0 to 1 output or an older tutorial gives them:

```js
const [r, g, b] = SEAT[name].slice(1).match(/../g).map((h) => parseInt(h, 16) / 255);
seatMat.color.setRGB(r, g, b);
```

```text
interact {"steps": [{"mouse": "click", "x": 540, "y": 747}]}

{"changed":{"seat":"rust"}}

look {"sample": [[630, 400], [700, 260], [540, 747]]}

Colours (5 × 5 mean, in the page's pixels): (630, 400) #c6886f, (700, 260) #a87059, (540, 747) #b5543a.

eval {"code": "return find('seat_cushion').material.color.getHexString();"}

db9b83
```

The seat top draws `#c6886f` where the working page drew `#a33f1b` at the same point, under the same light: a washed-out pink beside the rust button. `getHexString()` returns the material's colour in sRGB, and it reads `db9b83`, not the button's `b5543a`, so the colour was wrong before any light touched it. `seatMat.color.set(SEAT[name])` fixes it, as does passing `THREE.SRGBColorSpace` to `setRGB`. The same rule covers texture options: a fabric photo used as `map` needs `texture.colorSpace = THREE.SRGBColorSpace`, which the guide on washed-out colours covers.

## Pitfalls

- **Name the parts in the modelling tool.** The menu, `getObjectByName` and every reply above speak in node names. `GLTFLoader` changes some of them on the way in: spaces become underscores, dots are dropped (`Seat.001` arrives as `Seat001`), and the meshes of a node with several primitives are named after the glTF mesh with `_1`, `_2` added. Look the names up on the loaded model, as step 1 does.
- **Adding a texture to a material that had none needs `material.needsUpdate = true`.** A colour change does not; a new `map`, `normalMap` or a changed `transparent` does, because the shader is rebuilt.
- **Build option materials once.** A `new MeshStandardMaterial` per click leaks GPU memory unless the old one is disposed; a table of prepared materials, as `FRAME` is here, does not.
- **Keep the state where the menu reads it.** The ring on the buttons, the order summary and the share link should come from one `chosen` object, which is also what `observe()` returns for checks.
- **A lit colour is not the swatch colour.** The light, the tone mapping and the angle of each face change it. `NeutralToneMapping` keeps product colours closer to their hex than ACES does, which mutes saturated colours.

## What paprika3d does not do

It does not write the configurator or its menu: the agent writes the code, and the replies show what the code did. It does not decide whether a drawn colour matches a physical fabric sample; `look` with `sample` reads the pixels the page drew under the page's own lights, which a real screen and a real room change again. Its mouse steps are events Chrome sends to the page, not a real finger on a phone. It reads no material libraries or product catalogues: every option above was written into the page by hand.

## Without paprika3d

In the browser console, `scene.getObjectByName('seat').traverse(o => console.log(o.name, o.type, o.material?.uuid))` prints the same table as step 1; two meshes with one uuid share a material. `console.log(mesh.material.color.getHexString())` after a click shows whether the colour is the swatch's hex. To check every option by eye, click each swatch and screenshot the canvas, or loop over the options in code with `renderer.render` and `renderer.domElement.toDataURL()` after each, keeping `preserveDrawingBuffer: true` on the renderer or reading the canvas in the same task as the render. The three.js editor at threejs.org/editor opens a GLB and shows its node tree and each node's material in the sidebar.
