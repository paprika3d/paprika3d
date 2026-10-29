---
title: Text in three.js, TextGeometry, a canvas sprite or HTML, what each costs and how to update it
phrase: text in three.js
description: The ways to put text in a three.js scene (TextGeometry, a canvas texture on a sprite or plane, HTML over the canvas, an SDF text package), what each costs in triangles, draw calls and texture memory, and how each one updates when the text changes, with the two update bugs that leak geometry or freeze a label, measured with the paprika3d plugin's perf costs, look, interact and eval.
meta: Text in three.js: TextGeometry, a canvas texture sprite or HTML, their triangles and texture memory, and updating text without leaks.
intent: text-in-threejs-which-method
queries:
  - "Dynamically create 2D text in three.js"
  - "three.js 2D Text sprite labels"
  - "What is the performant way to update text in TextGeometry?"
  - "What is the best way to display text"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Text in three.js, TextGeometry, a canvas sprite or HTML, what each costs and how to update it

## The ways, and what each one is

three.js has no text primitive. Text in a scene is one of these:

- **`TextGeometry`**: the letters as an extruded mesh, made from a typeface JSON font with `FontLoader`. It has depth, takes the scene's light and shadows, and hides behind other meshes. Each letter is many triangles, and a new string is a new geometry. How to centre it, align its lines and load its font: [three.js 3D text](/guides/threejs-3d-text-textgeometry).
- **A canvas texture**: the text drawn with the 2D canvas API (`fillText`, any CSS font) into a `CanvasTexture`, shown on a `THREE.Sprite`, which always faces the camera, or on a plane, which stays where it is put. Two triangles and one texture; a new string is a redraw of the same canvas and one flag, `texture.needsUpdate = true`. Its sharpness is the canvas's pixel count against the pixels it covers on screen.
- **HTML over the canvas**: an element the browser draws, sharp at any pixel ratio and in any CSS font, updated with `textContent`. It is never behind a mesh. Placed at a fixed spot it is a HUD; placed over an object each frame it is a label, which `CSS2DRenderer` does: [three.js HTML labels](/guides/threejs-html-labels-css2drenderer).
- **SDF text**, from a package such as troika-three-text: glyphs drawn from a signed distance field on quads, sharp at any distance, loading TTF or WOFF fonts. It was not measured for this guide.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `perf` with `costs` lists each named object's triangles, draw calls and texture memory, counted rather than timed. `look` lists the HTML over the canvas with its text and box, and each named mesh or sprite with its box. `interact` presses keys on a paused clock, `observe` returns the page's own state, and `eval` reads anything else, such as a texture's upload count.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## One score, three labels

The page shows one score three ways: a `TextGeometry` on the left, a canvas texture on a sprite on the right, and an HTML box in the corner. Space adds a point and updates all three. `window.__game.observe` returns the score and `renderer.info.memory`, the count of geometries and textures held on the GPU.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Score</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block}
#score{position:fixed;top:16px;left:16px;padding:8px 14px;font:bold 24px sans-serif;color:#fff;background:rgba(0,0,0,.5);border-radius:6px}</style></head>
<body>
<div id="score">SCORE 0</div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3442);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 7);
camera.lookAt(0, 1.4, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 5);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x4a5a3a }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xb07a3c }));
crate.name = 'crate';
crate.position.set(0, 0.5, 0);
scene.add(floor, crate);

let score = 0;

// 1. Text as geometry: letters with depth, lit like the scene; a new string is a new geometry.
const font = await new FontLoader().loadAsync('https://cdn.jsdelivr.net/npm/three@0.184.0/examples/fonts/helvetiker_bold.typeface.json');
const score3d = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xf2c14e }));
score3d.name = 'score3d';
score3d.position.set(-1.6, 2.6, 0);
function set3d(text) {
  score3d.geometry.dispose();   // the old string's buffers stay on the GPU until disposed
  score3d.geometry = new TextGeometry(text, { font, size: 0.4, depth: 0.08, curveSegments: 4 }).center();
}

// 2. Text on a canvas, shown on a sprite that always faces the camera; a new string is a redraw of the same canvas.
const board = document.createElement('canvas');
board.width = 512;
board.height = 128;
const pen = board.getContext('2d');
const boardTex = new THREE.CanvasTexture(board);
boardTex.colorSpace = THREE.SRGBColorSpace;
const scoreSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: boardTex }));
scoreSprite.name = 'scoreSprite';
scoreSprite.scale.set(2, 0.5, 1);   // the canvas's 4:1 aspect
scoreSprite.position.set(1.6, 2.6, 0);
function setSprite(text) {
  pen.clearRect(0, 0, board.width, board.height);
  pen.fillStyle = 'rgba(0,0,0,0.5)';
  pen.fillRect(0, 0, board.width, board.height);
  pen.font = 'bold 72px sans-serif';
  pen.fillStyle = '#ffffff';
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  pen.fillText(text, board.width / 2, board.height / 2);
  boardTex.needsUpdate = true;   // without it the GPU keeps the first upload
}

// 3. Text in HTML over the canvas: the browser draws it, sharp at any pixel ratio; it is never behind a mesh.
const hud = document.getElementById('score');

function show() {
  const text = `SCORE ${score}`;
  set3d(text);
  setSprite(text);
  hud.textContent = text;
}
show();
scene.add(score3d, scoreSprite);

addEventListener('keydown', (e) => { if (e.code === 'Space') { score++; show(); } });
renderer.setAnimationLoop(() => renderer.render(scene, camera));

window.__game = {
  subject: 'crate',
  describe: () => ({ name: 'score', keys: { Space: 'score a point' } }),
  observe: () => ({ score, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
};
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

## What each label costs

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:46469/index.html in 0.2 s, paused at frame 0.
{"name":"score","keys":{"Space":"score a point"}}

look {}

HTML over the canvas: 1 (div via page), 0 overlap, 0 off-screen, 0 cut off: div#score "SCORE 0" [16, 16, 148, 59].
On screen (4):
floor 50% [0, 388, 1279, 799] 30 × 30 units
crate 1.8% [575, 439, 704, 584]
scoreSprite 1.5% [714, 220, 963, 282] approximate (a sprite or its own shader: see the picture)
score3d 0.82% [291, 225, 589, 278] 2.39 × 0.428 units, across the view

perf {"costs": true}

Costs by named group: the main scene's visible objects, each under its nearest named ancestor as `look` names it, counted, not timed, and with no frustum culling (the frame draws only what its camera sees, plus a shadow pass per casting light); `variants` with `hide` times a group. In all 1520 triangles, 0 casting shadows, 4 draw calls, 0.33 MB of textures:
  score3d: 1504 triangles, 0 casting shadows, 1 draw calls, 0 MB of textures
  crate: 12 triangles, 0 casting shadows, 1 draw calls, 0 MB of textures
  floor: 2 triangles, 0 casting shadows, 1 draw calls, 0 MB of textures
  scoreSprite: 2 triangles, 0 casting shadows, 1 draw calls, 0.33 MB of textures
```

`perf` also times frames, and its first lines are those times; on this machine they describe SwiftShader, so they are cut here, with its line on memory and long tasks. The counts do not depend on the machine. The 3D text "SCORE 0" is 1504 triangles in one draw call, over a hundred times the crate's 12, and holds no texture. The sprite is 2 triangles in one draw call and holds the scene's whole 0.33 MB of textures, its 512 by 128 canvas. The HTML box is in neither list: the browser draws it outside WebGL, and `look` lists it on its own line with its text and box. A scene with a few labels can carry any of the three; a scene with hundreds of labels counts the triangles of `TextGeometry`, or a texture per sprite, which is where one shared canvas atlas, instancing or SDF text come in.

The sprite's box runs from x 714 to 963 at a pixel ratio of 1, so each screen pixel across it reads about two canvas pixels, and the text is sharp. On a phone at a pixel ratio of 3 the same box covers three times the device pixels across, more than the canvas has, and the texture is stretched over them. Size the canvas from the label's box on screen and `renderer.getPixelRatio()`.

## Updating the text without rebuilding

Ten presses of Space, then the label's texture and the HTML text:

```js
const map = scene.getObjectByName("scoreSprite").material.map;
return { canvas: map.image.width + " x " + map.image.height, version: map.version, hud: document.getElementById("score").textContent };
```

```text
interact {"steps": [{"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}]}

{"changed":{"score":10,"geometries":4,"textures":2}}

eval (the code above)

{"canvas":"512 x 128","version":12,"hud":"SCORE 10"}
```

After ten new strings the GPU holds 4 geometries (the floor, the crate, the sprite's quad and the current text) and 2 textures, as before the first press. A texture's `version` goes up by one each time `needsUpdate` is set, and the renderer uploads the canvas again when it changes: 12 is the constructor's flag, the first `show()` and the ten presses. For a score, a timer or a name tag the canvas redraw is the update to use: the canvas and the texture stay, and the work is one `fillText` and one upload. A `TextGeometry` cannot change its string; each change builds a new one, so it suits text that changes seldom.

## Bug 1: a new TextGeometry each time, the old one never disposed

The same page without `score3d.geometry.dispose()` in `set3d`:

```text
observe {}

{"score":0,"geometries":0,"textures":0,"harness":{"frame":0,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":6,"meshes":3,"lights":2,"cameras":0},"errors":[],"changed":null}}

interact {"steps": [{"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}]}

{"changed":{"score":10,"geometries":13,"textures":2}}
```

13 geometries against 4: three.js keeps a geometry's buffers on the GPU until `dispose()`, even after the mesh points at a new one, so the strings it replaced stayed behind. The page looks the same; the count grows with every point scored. `geometry.dispose()` before the swap keeps it flat.

## Bug 2: the canvas redrawn, the sprite frozen

The same page without `boardTex.needsUpdate = true` in `setSprite`:

```text
interact {"steps": [{"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}, {"key": "Space"}]}

{"changed":{"score":10,"geometries":4,"textures":2}}

eval (the code above)

{"canvas":"512 x 128","version":1,"hud":"SCORE 10"}

look {"zoom": [700, 210, 980, 290]}

Picture: <project>/paprika3d/runs/2026-10-28T10-57-45-303Z/look-1-zoom.png ([700, 210, 980, 290] at 4×) of the live page at frame 10, not a saved picture or sheet
```

The score is 10 and the HTML says so, but the texture's `version` is still 1, the constructor's, so the canvas went to the GPU once. The zoomed picture of the sprite reads "SCORE 1", not "SCORE 0": the page was paused before its first frame, the first press redrew the canvas before anything was drawn, and that first frame uploaded it. Every redraw after that stayed in the canvas. Set `needsUpdate` after each redraw.

## Fonts for each way

`TextGeometry` takes a typeface JSON (a font converted with facetype.js, or one of the files in three's repository), or a `.ttf` through `TTFLoader` in `three/addons/loaders/TTFLoader.js`, which in r186 imports opentype.js from a CDN. A canvas and HTML take any CSS font. A canvas draws with the font loaded at the moment of `fillText`, so with a web font, wait for `document.fonts.load('bold 72px "Your Font"')` before the first draw, or the fallback font is drawn and stays until the next redraw.

## What to read in the replies

- `perf` with `costs`: each label's triangles, draw calls and MB of textures, and the totals; skip the frame times on a machine with no GPU.
- `look`: `HTML over the canvas:` with each element's text, box and overlaps, and each sprite or mesh in `On screen` with its box in page pixels. A sprite's box is marked approximate; the picture shows its pixels.
- `interact` followed by `observe`'s fields: a geometry or texture count that climbs with each update is a leak.
- `eval` reading `material.map.version`: a number that does not move after a redraw is a texture never uploaded again.

## What paprika3d does not do

It does not choose the method; it counts what each costs in this scene and shows how each draws. Its frame times on a machine with no GPU say nothing about the cost of text on a visitor's GPU; on a machine with one, `perf` with `variants` and `hide` times the frame with each label hidden. It did not measure SDF text packages here. It does not judge whether a label is readable to a person; the zoomed picture is for the agent to look at.

## Without paprika3d

Log `renderer.info.render.triangles`, `renderer.info.render.calls` and `renderer.info.memory` before and after adding a label, and again after a number of updates: a memory count that grows with each update is a leak. Log `texture.version` after a redraw. Use the browser's Elements panel for HTML labels and its Performance panel on the device the page is for.
