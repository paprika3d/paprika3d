---
title: three.js collision detection without a physics engine, so the player stops at walls and slides along them
phrase: three.js collision detection
description: How to stop a three.js player at walls and keep it inside the play area with Box3 and no physics engine, moving one axis at a time so it slides along a wall, and three faults the paprika3d plugin's interact trace, expect and test catch on a real page, a player that walks through a wall, one that jumps across the room when it slides, and one that sticks.
meta: three.js collision detection without a physics engine: Box3 walls, slide along them, and catch the player walking through.
intent: collision-without-physics-engine
queries:
  - "How to detect collision in three.js?"
  - "How to detect collision between two objects in JavaScript with Three.js?"
  - "Three.js - Accurate ray casting for collision detection"
  - "To avoid passing of object through ground"
  - "How do I simply prevent my player from moving beyond my playing area?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js collision detection without a physics engine, so the player stops at walls and slides along them

## Boxes, one axis at a time

A game with walls, crates and a play area does not need a physics engine to keep the player out of them. Give each obstacle an axis-aligned box in world space, give the player one, and after every move ask whether the player's box overlaps any wall's box. three.js has the box: `THREE.Box3`, with `setFromObject` to fit one around a mesh and `intersectsBox` to test two.

The move is where most collision code goes wrong. Move along x, resolve, then move along z and resolve again:

```js
function moveAxis(axis, d) {
  if (!d) return;
  const p = player.position;
  p[axis] += d;
  const b = playerBox(p.x, p.z);
  for (const c of colliders) {
    if (!overlaps(b, c)) continue;
    p[axis] = d > 0 ? c.min[axis] - half : c.max[axis] + half;   // against the face it ran into
    b.copy(playerBox(p.x, p.z));
  }
}
moveAxis('x', dir.x);
moveAxis('z', dir.y);
```

Three choices in it decide whether the player stops where the wall is drawn:

- **The boxes are in world space, built after the world matrices exist.** `Box3.setFromObject` reads the mesh's world matrix. three.js computes world matrices when it renders, so a box built before the first frame for a wall inside a moved group is where the wall would be if the group had not moved. Call `scene.updateMatrixWorld()` first.
- **Touching is not overlapping.** A player pushed against a wall's face touches it, and `intersectsBox` counts touching as an overlap. The next move along the wall then finds an overlap and pushes the player out along the other axis. Test overlap strictly, as `overlaps` below does.
- **Each axis is resolved on its own.** Undoing the whole step when the new position overlaps is shorter to write, and it stops the player dead on any wall it meets at an angle. Resolving x and z apart lets the part of the move along the wall go on, which is sliding.

The play area is the same problem: four walls around it, or a clamp of the position to the area's bounds less the player's half width.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `interact` plays keys frame by frame and returns what changed in the page's state; with `trace` it reads paths in `observe()` every frame and gives each one's first and last value, its peak or low and the frame it changed, and its Motion line says when the player stopped under a held key. `expect` and `save` keep a play as a check in `game-tests.json`, and `test` replays every saved check from a fresh reload. `eval` runs code in the page, with `find` and `THREE` in scope.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A room with four walls and a crate

The player is a green box 1 unit wide that the arrow keys move at 4 units a second. The room's walls and a crate sit in a group named `level`, placed 1 unit left of the origin, as a loaded level often is. `window.__game.observe()` returns the player's position and `setState` places it, so a play can start next to a wall.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Room</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#1b1e24}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1e24);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 14, 10);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.5));

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), mat(0x3a4250));
floor.name = 'floor';
const grid = new THREE.GridHelper(12, 12, 0x56607a, 0x56607a);
grid.name = 'grid';
grid.position.y = 0.01;
scene.add(floor, grid);

// The level: walls and a crate in one group, placed 1 unit left of the origin, as a loaded level often is.
const level = new THREE.Group();
level.name = 'level';
level.position.x = -1;
const box = (name, w, d, x, z, color = 0x8a96a8) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), mat(color));
  m.name = name;
  m.position.set(x, 0.6, z);
  level.add(m);
  return m;
};
const walls = [
  box('wall_east', 0.4, 12.4, 6, 0), box('wall_west', 0.4, 12.4, -4, 0),
  box('wall_north', 9.6, 0.4, 1, -6), box('wall_south', 9.6, 0.4, 1, 6),
  box('crate', 2, 2, 1, -2.5, 0xb07a3c),
];
scene.add(level);

const player = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x4caf50));
player.name = 'player';
player.position.y = 0.5;
scene.add(player);

// The colliders: each wall's box in world space, so the level's own position is in it. setFromObject reads the
// wall's world matrix, which three.js first computes at the first render: update it now, before any frame.
scene.updateMatrixWorld();
const colliders = walls.map((w) => new THREE.Box3().setFromObject(w));
const half = 0.5, speed = 4;   // the player is 1 unit wide; speed in units per second
const playerBox = (x, z) => new THREE.Box3(new THREE.Vector3(x - half, 0, z - half), new THREE.Vector3(x + half, 1, z + half));
// Overlap on the floor plan, strictly: a player resting against a wall's face touches it, and Box3.intersectsBox
// counts touching as overlap, which would push it out along the other axis as soon as it slides.
const overlaps = (a, b) => a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z;

// One axis at a time: move, and if the box now overlaps a wall, put it against that wall's face.
// Moving x and z apart is what lets the player slide along a wall it runs into at an angle.
function moveAxis(axis, d) {
  if (!d) return;
  const p = player.position;
  p[axis] += d;
  const b = playerBox(p.x, p.z);
  for (const c of colliders) {
    if (!overlaps(b, c)) continue;
    p[axis] = d > 0 ? c.min[axis] - half : c.max[axis] + half;
    b.copy(playerBox(p.x, p.z));
  }
}

const held = new Set();
const KEYS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
addEventListener('keydown', (e) => { if (KEYS[e.code]) held.add(e.code); });
addEventListener('keyup', (e) => held.delete(e.code));

let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;   // seconds since the last frame, never more than 0.1
  last = t;
  const dir = new THREE.Vector2();
  for (const k of held) dir.add(new THREE.Vector2(...KEYS[k]));
  if (dir.lengthSq()) dir.normalize().multiplyScalar(speed * dt);
  moveAxis('x', dir.x);
  moveAxis('z', dir.y);
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const r = (n) => +n.toFixed(2);
window.__game = {
  subject: 'player',
  describe: () => ({ name: 'room', keys: { ArrowRight: 'move east', ArrowLeft: 'move west', ArrowUp: 'move north', ArrowDown: 'move south' } }),
  observe: () => ({ player: { x: r(player.position.x), z: r(player.position.z) } }),
  setState: (s) => { if (s.player) { player.position.x = s.player.x ?? player.position.x; player.position.z = s.player.z ?? player.position.z; } },
};
</script>
</body></html>
```

The east wall is 0.4 units thick at x 5 in the world (6 in the group, less the group's 1), so its west face is at x 4.8 and a player 1 unit wide should stop with its centre at 4.3.

## Walk into the wall, then slide along it

The calls below were made on 2026-10-28. Run folder paths are left out and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:35371/index.html in 0.2 s, paused at frame 0.

interact {"steps": [{"key": "ArrowRight", "frames": 90}], "trace": ["player.x"]}

{"changed":{"player":{"x":4.3}}}
Motion (player): travelled 4.3 units, it stopped at frame 66 and did not move again.
player.x: 0 → 4.3 at frame 66; first changed at frame 2

eval {"code": "const b = new THREE.Box3().setFromObject(find(\"wall_east\")); return { min: b.min.toArray(), max: b.max.toArray() };"}

{"min":[4.8,0,-6.2],"max":[5.2,1.2,6.2]}
```

Held for 90 frames, the right arrow takes the player to 4.3 and no farther, and the Motion line says it stopped at frame 66 under a key still held. The `eval` reads the wall's box from the live scene: its west face is at 4.8, half a player's width from where the player stopped.

The slide starts the player at x 3.5 and holds right and up together:

```text
interact {"steps": [{"state": {"player": {"x": 3.5, "z": 0}}}, {"key": "ArrowRight", "down": true, "frames": 0}, {"key": "ArrowUp", "frames": 60}, {"key": "ArrowRight", "down": false}], "trace": ["player.x", "player.z"]}

{"changed":{"player":{"z":-2.83}}}
Motion (player): travelled 3.16 units (2.94 from start to end), its direction of travel turned 45° left.
player.x: 3.5 → 4.3 at frame 17; first changed at frame 1
player.z: 0 → -2.83 at frame 60; first changed at frame 1
```

`x` reaches the wall at frame 17 and stays at 4.3, while `z` keeps falling to -2.83 at frame 60: the player runs north along the wall. The Motion line names the turn, from diagonal to straight up the wall.

## Fault 1: the player walks through the wall

The same page without the `scene.updateMatrixWorld()` line before the colliders are built:

```js
const colliders = walls.map((w) => new THREE.Box3().setFromObject(w));   // before any frame has drawn
```

```text
interact {"steps": [{"key": "ArrowRight", "frames": 90}], "trace": ["player.x"]}

{"changed":{"player":{"x":5.3}}}
player.x: 0 → 5.3 at frame 81; first changed at frame 2
```

The player stops at 5.3, so its box runs from 4.8 to 5.8: it has gone through the whole wall, which spans 4.8 to 5.2, and stopped against nothing a player can see, 1 unit past where it should. One unit is the group's offset. `eval` builds the same box the page built, in a group moved by -1, before and after updating the group's world matrix:

```text
eval {"code": "const box = (o) => new THREE.Box3().setFromObject(o).min.x; const group = new THREE.Group(); group.position.x = -1; const wall = find(\"wall_east\").clone(); group.add(wall); const early = box(wall); group.updateMatrixWorld(); return { drawn: box(find(\"wall_east\")), early, after: box(wall) };"}

{"drawn":4.8,"early":5.8,"after":4.8}
```

Before the update the box's face is at 5.8, as if the group were at the origin; after it, 4.8, where the wall is drawn. `setFromObject` updates the mesh's own world matrix from its parent's, and the parent's had not been computed yet. Any collider built at load from a mesh inside a moved, turned or scaled group has this fault; so does one built before a loaded model is scaled. Update the world matrices first, or rebuild the box after the object moves.

## Fault 2: the player jumps across the room when it slides

The same page with the strict test swapped for three.js's own:

```js
if (!b.intersectsBox(c)) continue;
```

```text
interact {"steps": [{"state": {"player": {"x": 3.5, "z": 0}}}, {"key": "ArrowRight", "down": true, "frames": 0}, {"key": "ArrowUp", "frames": 60}, {"key": "ArrowRight", "down": false}], "trace": ["player.x", "player.z"]}

{"changed":{"player":{"x":-5.3,"z":6.7}}}
Motion (player): travelled 18.1 units (11.1 from start to end), its direction of travel turned 90° right.
player.x: 3.5 → peak 4.3 at frame 17 → -5.3 at frame 18; first changed at frame 1
player.z: 0 → low -0.75 at frame 16 → 6.7 at frame 17; first changed at frame 1
```

Walking straight into the wall still stops at 4.3; the fault shows once the player slides. At frame 17 the player rests against the east wall, its face exactly on the wall's. The next move north finds the player's box "intersecting" the east wall, which it touches, and resolves that overlap along z, the axis it is moving on: it puts the player past the east wall's south end, and `z` jumps from -0.75 to 6.7 in one frame. There it touches the south wall too, and the next x move puts it past that wall's west end, at -5.3. In two frames the player has left the room by its south-west corner, and the Motion line counts 18.1 units of travel where 60 frames at 4 units a second make 4. A trace shows a jump like this as a peak or low followed by a new value one frame later.

## Fault 3: the player sticks to the wall

The same page moving both axes at once and undoing the whole step on any overlap, the shortest answer to "how do I stop at a wall":

```js
function move(dx, dz) {
  const p = player.position;
  p.x += dx; p.z += dz;
  const b = playerBox(p.x, p.z);
  if (colliders.some((c) => overlaps(b, c))) { p.x -= dx; p.z -= dz; }
}
```

```text
interact {"steps": [{"key": "ArrowRight", "frames": 90}], "trace": ["player.x"]}

{"changed":{"player":{"x":4.27}}}
Motion (player): travelled 4.27 units, it stopped at frame 65 and did not move again.
player.x: 0 → 4.27 at frame 65; first changed at frame 2

interact {"steps": [{"state": {"player": {"x": 3.5, "z": 0}}}, {"key": "ArrowRight", "down": true, "frames": 0}, {"key": "ArrowUp", "frames": 60}, {"key": "ArrowRight", "down": false}], "trace": ["player.x", "player.z"]}

{"changed":{"player":{"x":4.25,"z":-0.75}}}
Motion (player): travelled 1.07 units, it stopped at frame 16 and did not move again.
player.x: 3.5 → 4.25 at frame 16; first changed at frame 1
player.z: 0 → -0.75 at frame 16; first changed at frame 1
```

Two things differ from the page at the top. The player stops at 4.27, short of the wall by less than one frame's step, since the step that would have overlapped is undone whole; a fast player stops a visible gap away. And on the diagonal both values freeze at frame 16, though the up arrow is held to frame 60: the player sticks to the wall instead of running along it. Resolving one axis at a time, and putting the player against the face rather than back where it was, fixes both.

## Keep the walls as checks

`expect` and `save` keep each play in `game-tests.json` once its values hold:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 90}], "expect": {"player.x": [4.29, 4.31]}, "save": "east-wall"}

{"changed":{"player":{"x":4.3}}}
Motion (player): travelled 4.3 units, it stopped at frame 66 and did not move again.
Expect: player.x 4.3 ✓
Saved check "east-wall" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

interact {"steps": [{"state": {"player": {"x": 3.5, "z": 0}}}, {"key": "ArrowRight", "down": true, "frames": 0}, {"key": "ArrowUp", "frames": 60}, {"key": "ArrowRight", "down": false}], "expect": {"player.x": [4.29, 4.31], "player.z": [-2.9, -2.7]}, "save": "slide-north"}

{"changed":{"player":{"x":4.3,"z":-2.83}}}
Expect: player.x 4.3 ✓ · player.z -2.83 ✓
Saved check "slide-north" in game-tests.json (2 checks now); `test` reruns them all, each from a fresh reload.

test {}

✓ east-wall
✓ slide-north
2 of 2 saved checks passed in 1.0 s
```

`test` on each faulty page, in the order above:

```text
test {}

✗ east-wall: player.x 5.3, expected 4.29 to 4.31
✗ slide-north: player.x 5.3, expected 4.29 to 4.31
0 of 2 saved checks passed in 0.9 s

test {}

✓ east-wall
✗ slide-north: player.x -5.3, expected 4.29 to 4.31; player.z 6.7, expected -2.9 to -2.7
1 of 2 saved checks passed in 0.7 s

test {}

✗ east-wall: player.x 4.27, expected 4.29 to 4.31
✗ slide-north: player.x 4.25, expected 4.29 to 4.31; player.z -0.75, expected -2.9 to -2.7
0 of 2 saved checks passed in 0.8 s
```

The straight walk alone passes fault 2, which is why the slide is a check of its own. In a Claude Code session the after-edit hook reruns both after each edit and speaks when one starts or stops failing, so a later change to the level or the movement code that lets the player through a wall is named at the edit that did it.

## What to read in the replies

- The trace line of the axis that hits the wall: its last value is where the player stopped. Compare it with the wall's face from `eval` less half the player's width.
- A trace line with a peak or low and a different value one frame later: a jump, which collision code that pushes along the wrong axis makes.
- The Motion line: "stopped at frame N" with the key still held is a wall; a stop on a diagonal while the other axis still has room is a stick.
- `test`, one line per saved check, with the value it got and the range it wanted.

## Pitfalls

- **Fast or small things pass through thin walls.** A move larger than the wall plus the player in one frame lands on the far side with no overlap ever seen. Cap the speed, split a long move into steps no larger than the thinnest wall, or cast a ray along the move.
- **A ray from the centre misses corners.** A raycast in the direction of travel catches a wall dead ahead and misses one the player's edge clips. Boxes cover the player's whole footprint; use rays for bullets, line of sight and the ground under a player on uneven terrain.
- **Axis-aligned boxes grow around turned meshes.** `setFromObject` on a wall turned 45° gives a box larger than the wall, and the player stops in the air near its corners. Keep walls axis-aligned, split a turned wall into smaller boxes, or test against an oriented box (`OBB` in `three/addons/math/OBB.js`).
- **Rebuild the boxes of anything that moves.** A door that opens or a crate that is pushed keeps its old box until `setFromObject` runs again.
- **Name the walls.** `look` and the `over` line of mouse steps speak in names, and a box list built from named meshes is easy to read back in `eval`.

## What paprika3d does not do

It does not write or fix collision code, and it has no collision detection of its own to add to a page: it plays the keys, reads the positions the page's own code produced, and keeps the play as a check. A check covers the plays saved; a wall no play walks into is not tested. Its clock steps 1/60 s a frame, so a fault that appears at another frame rate does not show in these plays. When the game wants pushing, stacking, rolling or falling, a physics engine is the answer: the `threejs-game` skill has a Rapier template, and [three.js physics in a web worker](/guides/threejs-physics-web-worker) runs one off the main thread.

## Without paprika3d

Draw the boxes: `scene.add(new THREE.Box3Helper(box, 0xff0000))` for each collider shows at once whether the boxes sit where the walls are drawn. Log the player's position each frame while you hold a key into a wall, and again on a diagonal; a value that stops on both axes is a stick, and one that changes by more than a frame's step is a jump. A small test page that places the player against each wall with code and moves it one step answers the same questions without a keyboard.
