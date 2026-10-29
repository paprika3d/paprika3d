---
title: three.js terrain heightmap a character walks on, with its feet on the ground as drawn instead of sinking or floating
phrase: three.js terrain heightmap
description: How to make a three.js character or car walk on terrain built from a heightmap picture or noise (a height lookup from the same data as the mesh, or a ray down onto any mesh, such as one made in Blender), and how the paprika3d plugin's interact trace of the player's height and its gap to the mesh as drawn catches the two faults that make it sink or float: a mesh coarser than the picture, and hills raised by a displacementMap that the CPU never sees.
meta: three.js terrain heightmap: walk a character on hills from a picture, read the ground's height, and catch a player floating or buried.
intent: walk-on-terrain-heightmap
queries:
  - "WebGL - Textured terrain with heightmap"
  - "threejs, Keep object on surface of another object"
  - "Three.js Precision Terrain Collision"
  - "How to make character walk on custom terrain made in Blender?"
  - "How can I raycast onto a heightmap properly?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js terrain heightmap a character walks on, with its feet on the ground as drawn instead of sinking or floating

## The ground's height, from the data or from the mesh

A character stays on terrain when, every frame, its feet go to the ground's height under it. There are two ways to get that height:

- **A lookup in the data that built the terrain.** A heightmap picture or a noise function gives the height at any point: read the four pixels around the point and blend them (bilinear). No ray, no triangles, the same cost on any terrain size.
- **A ray straight down onto the mesh.** It works on any mesh, including one modelled in Blender with no heightmap behind it, and it returns the height of the triangle actually drawn.

Either way, the character's origin has to be at its feet, so that its `y` is the ground's height. The lookup has one trap: it must agree with the mesh as drawn. Two common setups break that agreement, and each one leaves the player floating or buried while the code reads correctly:

- **The mesh is coarser than the picture.** With fewer segments than the picture has pixels, the lookup follows detail the triangles do not have: on a hilltop the triangles cut under the feet, and in a hollow they rise over them.
- **The hills are raised on the GPU.** A `displacementMap` moves the vertices in the vertex shader. A raycaster sees the flat plane in memory, so a ray down returns 0 under every hill, and the player walks inside them.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `interact` holds keys frame by frame and, with `trace`, reads paths in the page's `observe()` every frame, so a walk across the map comes back as the player's height and its gap to the mesh, with their peaks and the frames they happen at. `eval` runs code in the page with `find` and `THREE` in scope, which scans the gap along a line. `look` pictures the page from the page's camera or any `camera` given, and its `at` lists what is drawn at a point, nearest first.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Hills from a 65-pixel picture

The heightmap is drawn on a canvas so the page needs no file: dark lowland and three white hills. `heightfield` from `fx.js`, which paprika3d's `open` tool writes into the project, turns it into a terrain 40 units wide and 6 high, with `heightAt(x, z)` for the lookup and `geometry(segments)` for the mesh. A capsule player with its origin at its feet walks with WASD or the arrow keys, and the camera follows it. `observe()` returns the player's position and `gap`: the player's height minus the height a ray down finds on the mesh as drawn.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Hills</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#cddbe6}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { heightfield } from './fx.js';   // written into the project by paprika3d's open tool

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcddbe6);
scene.fog = new THREE.Fog(0xcddbe6, 30, 70);
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(-10, 12, 6);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);

// The heightmap: a 65 × 65 picture, dark lowland and three white hills. A PNG from a terrain tool loads the same way:
// heightfield('height.png', ...).
const map = document.createElement('canvas');
map.width = map.height = 65;
const g = map.getContext('2d');
g.fillStyle = '#202020';
g.fillRect(0, 0, 65, 65);
for (const [x, y, r] of [[22, 32, 14], [45, 30, 18], [14, 52, 10]]) {
  const hill = g.createRadialGradient(x, y, 0, x, y, r);
  hill.addColorStop(0, 'rgba(255, 255, 255, 1)');
  hill.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = hill;
  g.fillRect(0, 0, 65, 65);
}

// 40 × 40 units, black at 0 and white 6 units up. heightAt(x, z) is the picture's height at any point, bilinear between
// pixels; geometry(64) puts a vertex on each of the 65 pixels, so the mesh drawn and the height read agree at every vertex.
const land = await heightfield(map, { size: 40, height: 6 });
const ground = land.geometry(64), pos = ground.attributes.position, colors = [], low = new THREE.Color(0x6f9a4a), high = new THREE.Color(0xa08a62), c = new THREE.Color();
for (let i = 0; i < pos.count; i++) colors.push(...c.lerpColors(low, high, pos.getY(i) / 6).toArray());   // grass low, earth high
ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const terrain = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
terrain.name = 'terrain';
scene.add(terrain);

// The player's origin is at its feet, so its y is the ground's height.
const player = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ color: 0xd0503c }));
player.name = 'player';
player.position.set(-16, land.heightAt(-16, 0), 0);
scene.add(player);

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
const SPEED = 4, dt = 1 / 60;

renderer.setAnimationLoop(() => {
  const dx = (keys.has('KeyD') || keys.has('ArrowRight')) - (keys.has('KeyA') || keys.has('ArrowLeft'));
  const dz = (keys.has('KeyS') || keys.has('ArrowDown')) - (keys.has('KeyW') || keys.has('ArrowUp'));
  player.position.x = THREE.MathUtils.clamp(player.position.x + dx * SPEED * dt, -19.5, 19.5);
  player.position.z = THREE.MathUtils.clamp(player.position.z + dz * SPEED * dt, -19.5, 19.5);
  player.position.y = land.heightAt(player.position.x, player.position.z);   // the ground under the feet, no ray
  camera.position.set(player.position.x, player.position.y + 7, player.position.z + 11);
  camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// gap: the player's height above the mesh as drawn, by a ray down, so a lookup that disagrees with the mesh shows as a number
const probe = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
const r = (n) => +n.toFixed(2);
window.__game = {
  subject: 'player',
  describe: () => ({ name: 'walk on hills', keys: { KeyD: 'east', KeyA: 'west', KeyW: 'north', KeyS: 'south' } }),
  observe: () => {
    probe.ray.origin.set(player.position.x, 50, player.position.z);
    const hit = probe.intersectObject(terrain)[0];
    return { player: { x: r(player.position.x), y: r(player.position.y), z: r(player.position.z) }, gap: hit ? r(player.position.y - hit.point.y) : null };
  },
  setState: (s) => {
    if (s.player) { player.position.x = s.player.x ?? player.position.x; player.position.z = s.player.z ?? player.position.z; }
  },
};
</script>
</body></html>
```

`gap` is the page's own measurement, a few lines in `observe()`, and it is what makes both faults below a number. A page with no lookup, one that sets the height from a ray alone, has nothing for it to compare; its check is the player's height, as in fault 2.

## Walk across the hills and read the gap

The calls below were made on 2026-10-28. Run folder paths are left out and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

Eight seconds east, across the first two hills:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:43001/index.html in 0.1 s, paused at frame 0.

interact {"steps": [{"key": "KeyD", "frames": 480}], "trace": ["player.y", "gap"]}

{"changed":{"player":{"x":16,"y":2.11}}}
player.y: 0.75 → peak 5.74 at frame 137 → 2.11 at frame 480; first changed at frame 6
gap: 0 throughout the 480 frames
```

The player climbs from the lowland at 0.75 to 5.74 on the first hilltop and ends at 2.11 on the far slope, and its feet never leave the mesh. That walk runs along z = 0, which is a row of vertices, so it tests the mesh's edges and nothing between them. Inside a cell the lookup blends four pixels, while the mesh is two flat triangles split on a diagonal, and they differ a little. `eval` scans a line through the middle of the cells, a frame per point:

```text
eval {"code": "const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0); let worst = 0, at = null; for (let x = -16; x <= 16; x += 0.25) { __game.setState({ player: { x, z: 0.3 } }); await new Promise(requestAnimationFrame); const p = find(\"player\").position; ray.set(new THREE.Vector3(p.x, 50, p.z), down); const d = p.y - ray.intersectObject(find(\"terrain\"))[0].point.y; if (Math.abs(d) > Math.abs(worst)) { worst = d; at = x; } } return { worst: +worst.toFixed(3), at };"}

{"worst":-0.027,"at":-7.25}
(the code awaited the paused clock, so the harness stepped it 129 frames, 2.15 s of game time, without drawing, until the code finished)
```

The worst point on the line is 0.027 units below the triangles, on the first hill's slope, a small fraction of the capsule's 0.4 radius. A mesh with a vertex on every pixel keeps the two in step everywhere.

## Keep the hilltop as a check

The first hilltop, set with a state step, with the height and the gap in range:

```text
interact {"steps": [{"state": {"player": {"x": -6.25, "z": 0.3}}}], "expect": {"player.y": [5, 6], "gap": [-0.05, 0.05]}, "save": "hilltop"}

{"changed":{"player":{"x":-6.25,"y":5.57,"z":0.3}}}
Expect: player.y 5.57 ✓ · gap 0 ✓
Saved check "hilltop" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

test {}

✓ hilltop
1 of 1 saved checks passed in 0.3 s
```

## Fault 1: a mesh coarser than the picture

The change: `land.geometry(16)`, a vertex every four pixels, with the lookup unchanged. The same walk:

```text
interact {"steps": [{"key": "KeyD", "frames": 480}], "trace": ["player.y", "gap"]}

{"changed":{"player":{"x":16,"y":2.11},"gap":0.01}}
player.y: 0.75 → peak 5.74 at frame 137 → 2.11 at frame 480; first changed at frame 6
gap: -0.1 → peak 0.5 at frame 145 → low -0.13 at frame 258 → 0.01 at frame 473; first changed at frame 2
```

The player's height is the same as on the working page, frame for frame, because the lookup did not change. A trace of `player.y` alone passes this fault. The gap shows it: the player stands 0.5 units above the triangles near the first hilltop and 0.13 inside them in the hollow after it. A camera beside the hilltop pictures it:

```text
interact {"steps": [{"state": {"player": {"x": -6.25, "z": 0.3}}}]}

{"changed":{"player":{"x":-6.25,"y":5.57,"z":0.3},"gap":0.5}}

look {"camera": {"position": [-3.5, 6.4, 3.2], "lookAt": [-6.25, 5.8, 0.3]}}

Subject: player takes 6.1% of the picture [551, 48, 727, 447]; 1 of its 1 named parts show.
On screen (2):
terrain 37% [0, 441, 1279, 799]
player 6.1% [551, 48, 727, 447]

test {}

✗ hilltop: gap 0.5, expected -0.05 to 0.05
0 of 1 saved checks passed in 0.3 s
```

In the picture the capsule hangs over a hill whose top is two broad triangles; on the working page, from the same camera, its base rests on the hill. Two fixes: build the mesh with a segment per pixel step (`geometry(64)` for a 65-pixel picture), or keep the coarse mesh and take the height from it, with a ray down or a lookup that interpolates the triangles. For a large heightmap, shrink the picture to the mesh's resolution and read heights from the small one.

## Fault 2: hills raised by a displacementMap

The change: the terrain is a flat `PlaneGeometry` with the picture as its material's `displacementMap`, and the player's height comes from a ray down onto that mesh:

```js
const flat = new THREE.PlaneGeometry(40, 40, 64, 64).rotateX(-Math.PI / 2);
const terrain = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ displacementMap: new THREE.CanvasTexture(map), displacementScale: 6 }));
// in the frame loop
ray.set(new THREE.Vector3(player.position.x, 50, player.position.z), down);
player.position.y = ray.intersectObject(terrain)[0]?.point.y ?? 0;
```

The page still draws the hills. The same walk, with `look`:

```text
interact {"steps": [{"key": "KeyD", "frames": 480}], "trace": ["player.y", "gap"], "look": true}

{"changed":{"player":{"x":16,"y":0},"gap":0}}
player.y: 0.75 → 0 at frame 1; first changed at frame 1
gap: 0.75 → 0 at frame 1; first changed at frame 1
Subject: player takes 0.53% of the picture [612, 348, 667, 461]; 1 of its 1 named parts show.
On screen (2):
terrain 57% [0, 156, 1074, 799] 40 × 40 units
player 0.53% [612, 348, 667, 461]
Never visible: none

look {"at": [[640, 420], [640, 360]]}

At (640, 420): terrain 14 m at [16.01, 0, -1.13]; behind it player, distance unknown (no ray hits it: its shader places its vertices); background beyond.
At (640, 360): terrain 16 m at [16.01, 0, -3.37]; behind it player, distance unknown (no ray hits it: its shader places its vertices); background beyond.

test {}

✗ hilltop: player.y 0, expected 5 to 6
0 of 1 saved checks passed in 0.5 s
```

The trace is the clear reading: a walk across two hills at a height of 0 throughout, after dropping from 0.75 on the first frame. The gap is 0 because the ray and the player agree with each other; both read the flat plane, which is why the saved check also tests the height.

Two of `look`'s lines here are wrong, and the reason is the same: `look` works out which object covers which pixel by drawing the scene again with its own materials, and that drawing does not apply the `displacementMap`. In its terrain the hills are flat, so `On screen` lists the player at 0.53% and `Never visible` says none. In the page's own picture, the player is buried under the hill and does not show. `at` gets the order right, terrain in front of the player at the player's place, but gives the terrain's height as 0 and blames the player's shader for moving vertices; the terrain's shader moved them.

The fix is to raise the mesh's vertices on the CPU (`heightfield`'s `geometry`, or a loop that sets each vertex's `y` from the picture) so the ray, the lookup and the picture agree. Keep the `displacementMap` for small detail that the feet do not need to follow.

## Noise terrain with field()

`field` from `fx.js` makes the same kind of terrain from seeded noise instead of a picture, and its `heightAt` follows the mesh's triangles once `geometry` has built the mesh, so a coarse mesh is safe there. Checked with a 16-segment mesh over a grid of points off the vertices:

```text
eval {"code": "const { field } = await import(\"./fx.js\"); const land = field(40, { seed: 3, height: 6, scale: 20 }); const mesh = new THREE.Mesh(land.geometry(16)); mesh.updateMatrixWorld(); const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)); let worst = 0; for (let x = -19; x <= 19; x += 0.37) for (let z = -19; z <= 19; z += 0.37) { ray.ray.origin.set(x, 50, z); worst = Math.max(worst, Math.abs(land.heightAt(x, z) - ray.intersectObject(mesh)[0].point.y)); } return { worst: +worst.toFixed(4) };"}

{"worst":0}
```

`heightfield` does not do this: its `heightAt` stays bilinear between the picture's pixels whatever mesh is built, which is fault 1.

## A terrain made in Blender

A sculpted terrain exported as a GLB has no heightmap, so the ray is the lookup: the `probe` in the page above, with its hit as the height (`player.position.y = probe.intersectObject(terrain)[0].point.y`). Cast it against the terrain mesh alone, not the whole scene. The page above casts from high in the sky, which suits a heightmap; on a mesh with overhangs or caves, cast from a little above the feet instead, so the ray finds the floor under the player and not the roof over it. The same `gap` and the same hilltop check apply once the page exposes them.

## What to read in the replies

- `player.y` that never changes on a walk across hills: the height comes from something flat, such as a ray onto a displaced plane.
- A `gap` peak and low: the lookup and the mesh disagree, by the amount shown, at the frame shown. A peak is floating, a low is sinking.
- A `player.y` trace identical to the working page's, with a `gap` that is not: the lookup is right and the mesh is not what it reads.

## Pitfalls

- **The origin at the model's centre** puts the feet half the model's height under the ground. Move the geometry up, as the capsule's `translate` does, or add the offset to the height.
- **A mirrored lookup** puts hills where there are none. Three's `PlaneGeometry` turned flat with `rotateX(-Math.PI / 2)` puts the picture's top row toward -z; a hand-written lookup that reads rows from +z walks the player over a mirrored map. The mesh is not mirrored, so the `gap` is the number that shows it.
- **A capsule on a steep slope** touches the uphill side before its centre, since its feet are one point. A player that looks sunk on slopes and right on flat ground wants a smaller radius or a little lift, not a different lookup.
- **Wall collision is a separate step.** Height keeps the feet on the ground; walls and boxes stop the player from walking through them, covered in [three.js collision detection](/guides/threejs-collision-detection-without-physics-engine). The follow camera on hilly ground can dip into a hill; the ray that pulls a camera in front of walls is in [three.js third person camera](/guides/threejs-third-person-camera-follow).

## What paprika3d does not do

It does not make the terrain or move the player: the page does, with `fx.js` or its own code, and paprika3d reports the heights and gaps the page exposes. `look`'s object list is wrong on a mesh raised by a `displacementMap`, as fault 2 shows, so on such a page read the `trace` and the picture itself, not `On screen`. It does not tilt a car to the slope; `normalAt(x, z)` on a `heightfield` or `field` gives the ground's normal for that, and a trace of the car's rotation would check it.

## Without paprika3d

Log the player's `y` and a ray down from above it onto the terrain on every frame while walking over a hill, and plot the difference; it should stay near zero on hilltops and in hollows. Without `fx.js`, the lookup is a few lines: draw the heightmap into a canvas, read it once with `getImageData`, and for a point find the four pixels around it and blend them by the point's position between them. This sketch is not run on this page:

```js
// heights: Float32Array of w × h pixel heights from a square picture, size: terrain width, top row toward -z
function heightAt(x, z) {
  const u = Math.min(w - 1, Math.max(0, (x / size + 0.5) * (w - 1)));
  const v = Math.min(h - 1, Math.max(0, (z / size + 0.5) * (h - 1)));
  const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, H = (i, j) => heights[Math.min(h - 1, j) * w + Math.min(w - 1, i)];
  return (H(i, j) * (1 - a) + H(i + 1, j) * a) * (1 - b) + (H(i, j + 1) * (1 - a) + H(i + 1, j + 1) * a) * b;
}
```

Build the mesh with `w - 1` by `h - 1` segments so a vertex sits on each pixel.
