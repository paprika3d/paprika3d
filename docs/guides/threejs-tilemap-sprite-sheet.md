---
title: three.js tilemap and sprite sheet, without lines at the tile edges, frames at the right speed and tile collision
phrase: three.js tilemap
description: How to draw a 2D tile map and an animated sprite sheet in three.js from one texture atlas, why lines of the wrong colour appear along the tile edges and how nearest filtering removes them, how to pick a sheet's frames by time, and how to collide with tiles from the map, measured with the paprika3d plugin's look zoom, sample and sheet and interact trace.
meta: three.js tilemap and sprite sheet from one atlas: no lines at tile edges, frames by time, tile collision, checked with look and trace.
intent: tilemap-and-sprite-sheet-2d
queries:
  - "How to draw a tilemap in three.js?"
  - "Creating tilemap using spritesheet on 3D plane?"
  - "How to create collision between Player & a simple 2d image texture of a tilemap on plane?"
  - "Positioning sprite sheet correctly on to PlaneGeometry"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js tilemap and sprite sheet, without lines at the tile edges, frames at the right speed and tile collision

## One atlas, one mesh, one frame at a time

A tile map in three.js is a texture atlas and one mesh. The atlas holds every tile side by side in one image. The mesh has one quad per cell of the map, and each quad's texture coordinates point at its tile's cell in the atlas: in an atlas of four tiles in a row, tile `k` runs from `u = k / 4` to `u = (k + 1) / 4`. The whole map is one geometry, one material and one draw call, however many tiles it has. For an atlas with several rows, `v` counts from the bottom of the image, since three.js flips images as it uploads them by default, so the top row is the one nearest `v = 1`.

A sprite sheet is the same idea for one quad: `texture.repeat.set(1 / 4, 1)` shows a quarter of the sheet, and `texture.offset.x = frame / 4` picks which quarter. Pick the frame from time, not from the number of frames drawn, so the animation runs at the same speed on every display.

Two settings make pixel art work. three.js filters a texture linearly by default and makes mipmaps for it, so a pixel on the edge of a tile blends with the texel beside it in the atlas, which belongs to another tile, and a map shown smaller than its texels averages neighbouring tiles together. Both draw lines of the wrong colour along the tile edges. Set `magFilter` and `minFilter` to `THREE.NearestFilter` and `generateMipmaps` to `false`, on the atlas and on the sheet.

Collision comes from the map, not the picture: the same strings that choose each tile's cell say which tiles are solid, and the player's next position is tested against them before it moves. This is the answer to the thread that asks how to collide with "a simple 2d image texture of a tilemap": the image shows the map, and the map decides.

`open` puts `fx.js` in the project; its `tex` builders paint tiles in code (noise for grass, water and sand, bricks for stone), and the atlas below is four of them drawn into one canvas, so the page loads no image file. paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `look` with `zoom` enlarges a box of the page, and with `sample` gives the colour at points in it, which is how a line along a tile edge becomes a number. `look` with `sheet` puts moments of play side by side in one picture. `interact` with `trace` reads values from `window.__game.observe()` every frame: the sprite's frame name and where the player stopped.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A tile map with a walking hero

A 16 by 10 map of grass, water, sand and stone, drawn by an orthographic camera at 64 CSS pixels a tile. The hero walks with the arrow keys, animates at eight frames a second while it moves, and stops at water and stone. `observe()` returns the hero's place and the name of the frame shown.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Tiles</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { tex } from './fx.js';

const TILE = 16, PX = 64;   // 16-pixel tiles drawn 64 CSS pixels wide
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-innerWidth / 2 / PX, innerWidth / 2 / PX, innerHeight / 2 / PX, -innerHeight / 2 / PX, -10, 10);

// The atlas: four 16-pixel tiles in one row, painted in code. 0 grass, 1 water, 2 sand, 3 stone.
const atlas = document.createElement('canvas');
atlas.width = TILE * 4;
atlas.height = TILE;
const g = atlas.getContext('2d');
g.drawImage(tex.noise({ size: TILE, scale: 4, colors: ['#3f7d32', '#6cab4c'], seed: 1 }).image, 0, 0);
g.drawImage(tex.noise({ size: TILE, scale: 2, colors: ['#1d4f9c', '#3f7fd8'], seed: 2 }).image, TILE, 0);
g.drawImage(tex.noise({ size: TILE, scale: 4, colors: ['#d8c27a', '#efdca0'], seed: 3 }).image, TILE * 2, 0);
g.drawImage(tex.bricks({ size: TILE, rows: 2, cols: 2, brick: '#8a8a8a', mortar: '#4a4a4a', seed: 4 }).image, TILE * 3, 0);
const atlasTex = new THREE.CanvasTexture(atlas);
atlasTex.colorSpace = THREE.SRGBColorSpace;
atlasTex.magFilter = atlasTex.minFilter = THREE.NearestFilter;   // read one texel, never a blend with the tile next to it
atlasTex.generateMipmaps = false;                                // mipmaps would average neighbouring tiles

const MAP = [
  'rrrrrrrrrrrrrrrr',
  'rggggggggggggggr',
  'rggggggggwwwwggr',
  'rggsssgggwwwwggr',
  'rggsssgggwwwwggr',
  'rggggggggggggggr',
  'rggggggggggggggr',
  'rggggsssssgggggr',
  'rggggggggggggggr',
  'rrrrrrrrrrrrrrrr',
];
const KIND = { g: 0, w: 1, s: 2, r: 3 };
const W = MAP[0].length, H = MAP.length;

// One mesh for the whole map: a quad per tile, its UVs the tile's cell in the atlas.
const pos = [], uv = [], index = [];
MAP.forEach((row, j) => [...row].forEach((c, i) => {
  const x = i - W / 2, y = H / 2 - j - 1, k = KIND[c], n = pos.length / 3;
  const u0 = k / 4, u1 = (k + 1) / 4;
  pos.push(x, y, 0, x + 1, y, 0, x + 1, y + 1, 0, x, y + 1, 0);
  uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
  index.push(n, n + 1, n + 2, n, n + 2, n + 3);
}));
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
geometry.setIndex(index);
const tiles = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: atlasTex }));
tiles.name = 'tiles';
scene.add(tiles);

// The hero's sheet: four 16-pixel walk frames in one row, painted in code.
const sheet = document.createElement('canvas');
sheet.width = TILE * 4;
sheet.height = TILE;
const s = sheet.getContext('2d');
for (let f = 0; f < 4; f++) {
  const x = f * TILE, stride = [0, 2, 0, -2][f];
  s.fillStyle = '#f2c9a0'; s.fillRect(x + 6, 1, 4, 4);                   // head
  s.fillStyle = '#c0392b'; s.fillRect(x + 5, 5, 6, 6);                   // shirt
  s.fillStyle = '#2c3e70'; s.fillRect(x + 5 + stride, 11, 2, 5); s.fillRect(x + 9 - stride, 11, 2, 5);   // legs
}
const heroTex = new THREE.CanvasTexture(sheet);
heroTex.colorSpace = THREE.SRGBColorSpace;
heroTex.magFilter = heroTex.minFilter = THREE.NearestFilter;
heroTex.generateMipmaps = false;
heroTex.repeat.set(1 / 4, 1);                                            // one frame of four across
const hero = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: heroTex, transparent: true }));
hero.name = 'hero';
hero.position.set(-1.5, 1.5, 0.1);
scene.add(hero);

// Collision against the map, not the picture: a tile is solid when the map says water or stone.
const solid = (x, y) => { const c = MAP[Math.floor(H / 2 - y)]?.[Math.floor(x + W / 2)]; return c === undefined || c === 'w' || c === 'r'; };
const HALF = 0.4;
const free = (x, y) => !solid(x - HALF, y - HALF) && !solid(x + HALF, y - HALF) && !solid(x - HALF, y + HALF) && !solid(x + HALF, y + HALF);

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
let last = 0, walked = 0, frame = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - (last || t)) / 1000, 0.1);
  last = t;
  const dx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), dy = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  const was = hero.position.clone();
  if (free(hero.position.x + dx * 3 * dt, hero.position.y)) hero.position.x += dx * 3 * dt;
  if (free(hero.position.x, hero.position.y + dy * 3 * dt)) hero.position.y += dy * 3 * dt;
  const moved = !hero.position.equals(was);
  walked = moved ? walked + dt : 0;
  frame = Math.floor(walked * 8) % 4;                                   // 8 frames a second while moving, frame 0 standing
  heroTex.offset.x = frame / 4;
  renderer.render(scene, camera);
});

window.__game = {
  subject: 'hero',
  describe: () => ({ name: 'tiles', keys: { ArrowRight: 'walk right', ArrowLeft: 'walk left', ArrowUp: 'walk up', ArrowDown: 'walk down' } }),
  observe: () => ({ hero: { x: +hero.position.x.toFixed(2), y: +hero.position.y.toFixed(2), frame: `walk${frame}` } }),
  setState: (st) => { if (st.hero) { hero.position.x = st.hero.x ?? hero.position.x; hero.position.y = st.hero.y ?? hero.position.y; } },
};
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times, and the colours are as this Chrome drew them.

## The line along the tile edge

The map's centre column of grass meets more grass at x 640 in the page: pixel 639 is the last column of the left tile. First the page with the two filter lines and the two mipmap lines taken out, so three.js uses its defaults:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:38441/index.html in 0.1 s, paused at frame 0.

look {}

On screen (2):
tiles 64% [128, 80, 1151, 719] 16 × 10 units
hero 0.4% [512, 272, 575, 335] 1 × 1 units

look {"zoom": [600, 400, 680, 480], "sample": [[620, 430], [639, 430], [660, 430]]}

Picture: <project>/paprika3d/runs/2026-10-28T10-35-13-820Z/look-2-zoom.png ([600, 400, 680, 480] at 4×) of the live page at frame 1, not a saved picture or sheet
Colours (5 × 5 mean, in the page's pixels): (620, 430) #53923e, (639, 430) #4a866a, (660, 430) #5d9c44.
```

Inside the two tiles the colour is green with little blue (`3e` and `44`). At the edge it is `#4a866a`: the blue channel has risen to `6a`, and the zoomed picture shows a thin blue-green line down the seam, between two grass tiles. The blue is the water tile, which sits next to grass in the atlas. The zoom also shows the grass blurred: linear filtering smooths 16-pixel art drawn four times its size. The same calls on the page as written, with nearest filtering and no mipmaps:

```text
look {"zoom": [600, 400, 680, 480], "sample": [[620, 430], [639, 430], [660, 430]]}

Picture: <project>/paprika3d/runs/2026-10-28T10-35-07-555Z/look-2-zoom.png ([600, 400, 680, 480] at 4×) of the live page at frame 1, not a saved picture or sheet
Colours (5 × 5 mean, in the page's pixels): (620, 430) #53923e, (639, 430) #53913d, (660, 430) #5e9d44.
```

The edge is the same green as the tile, and the zoom shows square texels with no line. A camera that scrolls stands between pixels most of the time, so the same check with the camera moved half a pixel, in `eval`:

```text
eval {"code": "camera.position.x = 0.5 / 64; camera.updateMatrixWorld(); return camera.position.x"}

0.008

look {"zoom": [600, 400, 680, 480], "sample": [[620, 430], [639, 430], [660, 430]]}

Colours (5 × 5 mean, in the page's pixels): (620, 430) #54933e, (639, 430) #56943f, (660, 430) #5f9e45.
```

Still no blue at the edge. A map drawn smoothly (painted art rather than pixel art) needs linear filtering, and then the cure is in the atlas: pad each tile with a copy of its own edge pixels, so what the filter blends in at the edge is the same tile. A map zoomed far out needs mipmaps, which average tiles together across a padding too; a `DataArrayTexture` with one layer per tile keeps every tile's mipmaps to itself.

## The hero's frames and the water's edge

```text
interact {"steps": [{"key": "ArrowRight", "frames": 60}], "trace": ["hero.x", "hero.frame"]}

{"changed":{"hero":{"x":0.6}}}
Motion (hero): travelled 2.1 units, it stopped at frame 42 and did not move again.
hero.x: -1.5 → 0.6 at frame 42; first changed at frame 1
hero.frame: "walk0" until frame 8, "walk1" until frame 16, "walk2" until frame 23, "walk3" until frame 31, "walk0" until frame 38, "walk1" until frame 43, then "walk0"
```

The frame changes every seven or eight frames of the 60 a second, eight times a second, and loops back to `walk0` after `walk3`. The hero stopped at x 0.6: the water starts at x 1, and the hero's collision box is 0.8 wide, so its front edge is at the water. From frame 43 it stands on `walk0`, because the page animates on movement and not on the key, which is still held. To see the four poses together, `sheet` reloads the page for each moment and holds the key for a number of frames:

```text
look {"sheet": [{"label": "walk0", "steps": [{"key": "ArrowRight", "down": true}], "frames": 1}, {"label": "walk1", "steps": [{"key": "ArrowRight", "down": true}], "frames": 9}, {"label": "walk2", "steps": [{"key": "ArrowRight", "down": true}], "frames": 17}, {"label": "walk3", "steps": [{"key": "ArrowRight", "down": true}], "frames": 24}]}

Picture: <project>/paprika3d/runs/2026-10-28T10-35-07-555Z/look-7-sheet.png (4 moments, left to right, top to bottom: walk0 | walk1 | walk2 | walk3); the game is reloaded at its first frame
```

The picture shows the hero in four places along the walk with four leg positions, one per frame of the sheet. A wrong `repeat` or `offset` shows here as a sliver of two frames, or the whole sheet squeezed into the quad.

## Bug: the frames run as fast as the screen

The same page with the frame advanced once per drawn frame:

```js
frame = moved ? (frame + 1) % 4 : 0;
```

```text
interact {"steps": [{"key": "ArrowRight", "frames": 60}], "trace": ["hero.x", "hero.frame"]}

{"changed":{"hero":{"x":0.6}}}
Motion (hero): travelled 2.1 units, it stopped at frame 43 and did not move again.
hero.x: -1.5 → 0.6 at frame 43; first changed at frame 2
hero.frame: "walk0" until frame 2, "walk1" until frame 3, "walk2" until frame 4, "walk3" until frame 5, "walk0" until frame 6, "walk1" until frame 7, "walk2" until frame 8, "walk3" until frame 9, … (43 changes)
```

A new frame on every drawn frame: 60 a second here, faster on a faster display, and a blur of legs either way. The page as written counts the time spent walking and takes `Math.floor(walked * 8) % 4`.

## What to read in the replies

- `look` with `zoom` and `sample`: the colour at the last pixel of a tile beside the colour inside it. A channel that moves toward a neighbouring tile's colour at the edge is a line from the atlas.
- `look` with `sheet`: moments of the animation in one picture, each from a fresh reload.
- `interact` with `trace` on a frame name: the runs, frame by frame. Runs of one frame each are an animation tied to the frame rate.
- `interact`, the `Motion` line and `trace` on a position: where the player stopped against a solid tile, and on which frame.

## What paprika3d does not do

It does not write the map, the atlas or the UV arithmetic; those are the page's. No reply line names a line along a tile edge by itself: the agent zooms and samples where the seams are. Its colours are as this Chrome drew them on SwiftShader, and a GPU can round a coordinate on a tile's exact edge another way, so check a scrolling map on the devices it is for. It reads no map editor's files.

## Without paprika3d

Fill each tile of a test atlas with one flat colour and a one-pixel border of a loud colour such as magenta: any magenta on screen is a tile reading past its cell. Draw the map at a scale that is not a whole number and scroll it slowly, which shows lines that a whole-number scale hides. Log the frame index with the time each frame to check the animation's rate.
