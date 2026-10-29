---
title: three.js minimap and game HUD, a second camera in a corner and a health bar that updates
phrase: three.js minimap
description: How to put a minimap from a second, top-down camera in a corner of a three.js game, and a health bar and score in HTML over the canvas that follow the game's state, with the paprika3d plugin's look and feel showing the HUD on a desktop and a phone, a HUD that does not update when health changes, and a minimap that covers the health bar on a narrow screen.
meta: three.js minimap from a second camera, and an HTML health bar and score that update: checked with look and feel on desktop and phone.
intent: minimap-and-game-hud
queries:
  - "Position a Plane mesh on the upper right corner of the camera view always like a minimap HUD"
  - "How to controll minimap like games?Location and area"
  - "Sphere + Health Bar"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js minimap and game HUD, a second camera in a corner and a health bar that updates

## Two layers over the game

A game HUD is usually two layers drawn over the 3D view.

- **Text and bars in HTML.** Health, score, ammo and timers are `div`s positioned over the canvas. They stay sharp at any pixel ratio, take CSS, and cost the GPU nothing. Keep one function that writes every HUD element from the game's state, and call it wherever the state changes; a HUD that drifts from the state comes from a change that skipped it.
- **The minimap from a second camera.** An `OrthographicCamera` above the player, looking straight down, follows the player's position each frame. A `marker` on a layer that the minimap camera renders and the main camera does not (`marker.layers.set(1)`, `map.layers.enable(1)`) shows where the player is and which way the map is turned.

There are two common ways to put the second camera's picture on screen. One renders it after the main view into a corner with `renderer.setViewport` and `renderer.setScissor`, as the answer in "How to controll minimap like games?" describes. The other renders it into a `WebGLRenderTarget` and shows that texture on a plane in a HUD scene, drawn over the frame with an orthographic camera measured in pixels, as "Position a Plane mesh on the upper right corner" asks. The page below takes the second way, for a reason in the next paragraph. Three details make it work:

```js
renderer.setRenderTarget(mapTarget);   // the top-down view into the texture
renderer.render(scene, map);
renderer.setRenderTarget(null);        // back to the screen, or the game draws into the texture too
renderer.render(scene, camera);
renderer.autoClear = false;            // the HUD scene draws over the frame
renderer.clearDepth();                 // and is not hidden by the 3D scene's depth
renderer.render(hudScene, hudCamera);
renderer.autoClear = true;
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `look` returns the page's picture with the HUD in it, and its `HTML over the canvas` line lists the HTML over the picture: each element's box in page pixels, and how many overlap, are off-screen or are cut off by the screen edge. `feel` plays the input that changes the state and says whether the HUD's text changed, on which frame, beside the state that changed. `open` takes a phone's size and pixel ratio. A minimap drawn with `setViewport` and `setScissor` comes out wrong in `look` today: it redraws the frame's render calls without the viewport and scissor changes between them, and takes the minimap's camera for the game's, so its picture shows the minimap and not the game. A minimap drawn into a render target, as here, is redrawn as the page drew it.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A meadow with a HUD and a minimap

A player walks a meadow with the arrow keys. A coin to the right adds a point, and a patch of lava to the left takes 25 health. The health bar and score are HTML at the top left, and the minimap sits at the top right on a wide screen and at the bottom right, smaller, on a narrow one. `observe()` returns health, score and the player's place, and `setState` sets them.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Meadow</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;font:15px sans-serif}
canvas{display:block}
.panel{position:absolute;color:#fff;background:#000a;padding:6px 10px;border-radius:4px}
#health{top:16px;left:16px;width:220px}
#bar{height:10px;background:#511;border-radius:3px;margin-top:4px}
#fill{height:100%;width:100%;background:#e33;border-radius:3px}
#score{top:72px;left:16px}
</style></head>
<body>
<div class="panel" id="health"><span id="hp">HP 100</span><div id="bar"><div id="fill"></div></div></div>
<div class="panel" id="score">Score 0</div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc3e0);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5a40, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 4);
scene.add(sun);

const mat = (color) => new THREE.MeshStandardMaterial({ color });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat(0x6a9a4a));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const trees = new THREE.Group();
trees.name = 'trees';
for (const [x, z] of [[-6, -4], [-3, -9], [4, -7], [8, -2], [-9, 3], [6, 6], [-4, 8], [10, -9]]) {
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 12), mat(0x2f6b34));
  t.position.set(x, 1.2, z);
  trees.add(t);
}
scene.add(trees);
const player = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1, 0.7), mat(0x2f6fd0));
player.name = 'player';
player.position.y = 0.5;
const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24), mat(0xf2c230));
coin.name = 'coin';
coin.rotation.x = Math.PI / 2;
coin.position.set(2, 0.6, 0);
const lava = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 1.5), mat(0xd2481c));
lava.name = 'lava';
lava.position.set(-2, 0.03, 0);
scene.add(player, coin, lava);

// The minimap: a top-down orthographic camera drawn into a texture, shown on a plane in a HUD scene in the top right corner.
const map = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 100);
map.name = 'minimap';
map.up.set(0, 0, -1);
map.layers.enable(1);
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
marker.name = 'marker';
marker.layers.set(1);                    // on the minimap only: the main camera does not see layer 1
scene.add(marker);
const mapTarget = new THREE.WebGLRenderTarget(256, 256);
const hudScene = new THREE.Scene();
const hudCamera = new THREE.OrthographicCamera(0, innerWidth, innerHeight, 0, -1, 1);   // one unit is one CSS pixel, y up
const frame = new THREE.Mesh(new THREE.PlaneGeometry(204, 204), new THREE.MeshBasicMaterial({ color: 0xffffff }));
frame.name = 'minimap frame';
const minimap = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ map: mapTarget.texture }));
minimap.name = 'minimap';
hudScene.add(frame, minimap);

// Top right on a wide screen; bottom right and smaller on a narrow one, where the top holds the health bar.
function layout() {
  const w = innerWidth, h = innerHeight, size = w < 600 ? 140 : 200, x = w - 16 - size / 2, y = w < 600 ? 16 + size / 2 : h - 16 - size / 2;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hudCamera.right = w;
  hudCamera.top = h;
  hudCamera.updateProjectionMatrix();
  frame.scale.setScalar((size + 4) / 204);
  minimap.scale.setScalar(size / 200);
  frame.position.set(x, y, 0);
  minimap.position.set(x, y, 0.5);
}
layout();
addEventListener('resize', layout);

const game = { hp: 100, score: 0, onLava: false };
const hp = document.getElementById('hp'), fill = document.getElementById('fill'), score = document.getElementById('score');
function hud() {
  hp.textContent = `HP ${game.hp}`;
  fill.style.width = `${game.hp}%`;
  score.textContent = `Score ${game.score}`;
}

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - (last || t)) / 1000, 0.1);
  last = t;
  player.position.x += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * 4 * dt;
  player.position.z += ((keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0)) * 4 * dt;
  if (coin.visible && player.position.distanceTo(coin.position) < 0.8) { coin.visible = false; game.score++; hud(); }
  const onLava = Math.abs(player.position.x - lava.position.x) < 0.75 && Math.abs(player.position.z - lava.position.z) < 0.75;
  if (onLava && !game.onLava) { game.hp = Math.max(0, game.hp - 25); hud(); }
  game.onLava = onLava;

  camera.position.set(player.position.x, 6, player.position.z + 9);
  camera.lookAt(player.position.x, 0.5, player.position.z);
  map.position.set(player.position.x, 30, player.position.z);
  map.lookAt(player.position.x, 0, player.position.z);
  marker.position.set(player.position.x, 3, player.position.z);

  renderer.setRenderTarget(mapTarget);     // the top-down view into the texture
  renderer.render(scene, map);
  renderer.setRenderTarget(null);          // back to the screen
  renderer.render(scene, camera);
  renderer.autoClear = false;              // the HUD scene draws over the frame, not over a cleared screen
  renderer.clearDepth();                   // and is not hidden by the 3D scene's depth
  renderer.render(hudScene, hudCamera);
  renderer.autoClear = true;
});

window.__game = {
  subject: 'player',
  intentional: 'marker',                   // drawn on the minimap only, on purpose
  describe: () => ({ name: 'meadow', keys: { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'forward', ArrowDown: 'back' } }),
  observe: () => ({ hp: game.hp, score: game.score, player: { x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2) } }),
  setState: (s) => {
    if (s.hp !== undefined) game.hp = s.hp;
    if (s.score !== undefined) game.score = s.score;
    if (s.player) { player.position.x = s.player.x ?? player.position.x; player.position.z = s.player.z ?? player.position.z; }
    hud();
  },
};
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

## What look reads

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33849/index.html in 0.1 s, paused at frame 0.
{"name":"meadow","keys":{"ArrowLeft":"left","ArrowRight":"right","ArrowUp":"forward","ArrowDown":"back"}}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-28-08-658Z/look-1.png
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Known, intentional (window.__game.intentional): 1 line left out ("marker" 1).
HTML over the canvas: 2 (.panel via page), 0 overlap, 0 off-screen, 0 cut off: div#health "HP 100" [16, 16, 255, 58], div#score "Score 0" [16, 72, 87, 100].
On screen (9):
ground 86% [0, 79, 1279, 799] 60 × 60 units
trees ×5 3.1% [270, 119, 1188, 386]
lava 0.67% [432, 399, 555, 461] 1.5 × 1.5 units
player 0.46% [613, 356, 666, 444]
coin 0.19% [760, 370, 812, 416]
Never visible: none
```

The picture has the game, the two panels and the minimap in its top right corner, with the eight trees, the lava and the marker seen from above. The `HTML over the canvas` line lists the two panels with their boxes, and none overlaps another or runs off the screen. `On screen` is the main camera's view: five of the eight trees are in it, and the minimap, a plane in another scene, is not an object of the game's scene. The marker is drawn on the minimap and nowhere else, so the main camera never shows it, and `look` would list it under `Never visible`; the page sets `window.__game.intentional` to `'marker'` to tell `look` that is on purpose, and the `Known, intentional` line counts what it left out.

## What feel reads: the HUD answers each change

```text
feel {"steps": [{"key": "ArrowRight", "frames": 30}]}

Watched the steps' 30 frames and 45 frames after them, counted from the first step.
Moved during the steps: player 2 units, marker 2 units.
Removed: 1 objects there before the steps are gone.
HUD text: changed in one frame.
State: score 0 → 1, player.x 0 → 2.

feel {"steps": [{"key": "ArrowLeft", "frames": 30}]}

Watched the steps' 30 frames and 45 frames after them, counted from the first step.
Moved during the steps: player 2 units, marker 2 units.
HUD text: changed in one frame.
State: hp 100 → 75, player.x 0 → -2.
```

Walking right picks up the coin (the object removed) and the score goes from 0 to 1; walking left crosses the lava and health goes from 100 to 75. Each time the HUD's text changed with it, and the marker moved with the player, so the minimap follows.

## Bug 1: health changes and the HUD does not

The same page with the lava's damage written without the call to `hud()`:

```js
if (onLava && !game.onLava) game.hp = Math.max(0, game.hp - 25);
```

```text
feel {"steps": [{"key": "ArrowLeft", "frames": 30}]}

Watched the steps' 30 frames and 45 frames after them, counted from the first step.
Moved during the steps: player 2 units, marker 2 units.
HUD text: unchanged.
State: hp 100 → 75, player.x 0 → -2.
```

The state says the player lost 25 health, and the HUD text did not change: the bar still reads full until some other change, such as the next coin, rewrites it. A HUD written from the state in one function, called from every place the state changes (or once per frame, when the values differ from the last written ones), cannot fall behind. `feel` reads the HUD's text, so give a bar its number, as `HP 100` here, or a width change alone goes unseen by it.

## Bug 2: on a phone, the minimap covers the health bar

The same page with the minimap always 200 pixels wide at the top right, opened at a phone's size:

```text
open {"url": "index.html", "cwd": "<project>", "size": [390, 844], "dpr": 3}

Opened http://127.0.0.1:44599/index.html at 390 × 844, DPR 3 in 0.1 s, paused at frame 0.

look {}

Canvas: 390x844 buffer for 390x844 CSS at DPR 3 (renderer pixel ratio 1, capped below DPR 3); resize handler ran.
HTML over the canvas: 2 (.panel via page), 0 overlap, 0 off-screen, 0 cut off: div#health "HP 100" [16, 16, 255, 58], div#score "Score 0" [16, 72, 87, 100].
```

In the picture, the minimap's frame starts at x 172, inside the health panel, which runs to 255: the right third of the health bar is under the map. The line cannot say so, since it lists HTML and the minimap is drawn in the canvas; its box comes from the page's own numbers: a frame 204 pixels wide, centred at the screen's width less 116. The page's `layout()` moves the minimap to the bottom right at 140 pixels when the screen is narrower than 600, and the same `open` and `look` on it show the minimap in the bottom corner, clear of both panels. `layout()` also runs on resize, so turning a phone does not strand the minimap where the old width put it.

## What to read in the replies

- `look`, the picture: the HUD and the minimap as a player sees them. The minimap is in the picture and in no text line.
- `look`, `HTML over the canvas`: each HTML HUD element's box, and the counts that overlap, are off-screen or are cut off by the screen edge.
- `look`, `Known, intentional`: what `window.__game.intentional` left out, such as a minimap-only marker.
- `feel`, `HUD text` with `State`: a state change with `HUD text: unchanged` is a HUD that missed it.
- `open` with `size` and `dpr`: the same page at a phone's size, for the same `look`.

## What paprika3d does not do

It pictures a minimap drawn with `setViewport` and `setScissor` wrongly today, as said above; the page itself is fine, and the render-target way avoids the fault. Its text lines list HTML over the canvas and the main camera's objects, not what a second camera or a HUD scene draws, so a minimap's content and place are read from the picture. `feel` reads the HUD's text and the overlays' opacity, not a bar's width. A health bar that floats over a character is a label pinned to a point in the scene: [three.js HTML labels](/guides/threejs-html-labels-css2drenderer) covers placing one, with `CSS2DRenderer` or a sprite as the "Sphere + Health Bar" answers suggest. It does not design or write the HUD; the agent writes it and looks again.

## Without paprika3d

Log the state and the HUD's text together in each place the state changes, and compare. Open the page in the browser's device toolbar at a phone's size and in both orientations, and look at every corner. To check the minimap camera, render it full screen for a moment (`renderer.render(scene, map)` alone) and see what it covers.
