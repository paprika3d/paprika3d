---
title: three.js third person camera that follows the player smoothly, stays out of walls, and orbits a moving player with OrbitControls
phrase: three.js third person camera
description: How to write a three.js third person follow camera (a point behind the player approached with frame-rate independent smoothing, pulled in front of walls with a ray), how to keep OrbitControls orbiting a player that walks, and how the paprika3d plugin's interact trace, look and test measure the lag in units and catch a camera behind a wall or one that falls behind.
meta: three.js third person camera: smooth follow behind the player, pulled in front of walls, and OrbitControls around a moving player.
intent: third-person-camera-follow
queries:
  - "Third-Person Camera"
  - "How to make the camera rotate around a moving object and follow the object?"
  - "Third Person Follow Camera with Orbit Controls"
  - "Forcing OrbitControls to navigate around a moving object (almost working)"
  - "Camera collision in third-person orbit controlls"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js third person camera that follows the player smoothly, stays out of walls, and orbits a moving player with OrbitControls

## A point behind the player, approached a little each frame

A third person camera has a place it wants to be: behind the player and above it, turned with the player's heading. Each frame it moves part of the way there and looks at the player's head. Moving part of the way is the smoothing: the camera trails a little when the player starts, turns or stops, which reads as weight instead of a camera bolted to the back of the player's head.

```js
const OFFSET = new THREE.Vector3(0, 2.5, 6);   // behind and above, in the player's own frame

function chase(dt) {
  head.copy(player.position).y += 1.4;
  goal.copy(OFFSET).applyAxisAngle(UP, player.rotation.y).add(player.position);
  camera.position.lerp(goal, 1 - Math.exp(-8 * dt));   // the same smoothing at any frame rate

  // a wall between the head and the camera: pull the camera in front of it
  const toCamera = camera.position.clone().sub(head);
  ray.set(head, toCamera.clone().normalize());
  ray.far = toCamera.length() + 0.3;
  const hit = ray.intersectObjects(obstacles)[0];
  if (hit) camera.position.copy(head).addScaledVector(ray.ray.direction, hit.distance - 0.3);

  camera.lookAt(head);
}
```

Three choices in it decide how the camera behaves:

- **The smoothing factor comes from the frame's time.** `camera.position.lerp(goal, 0.1)` closes a tenth of the gap per frame, so the camera trails twice as far on a 30 Hz screen as on a 60 Hz one and feels different on every machine. `1 - Math.exp(-rate * dt)` closes the same share of the gap per second at any frame rate. The lag while walking comes out at roughly the speed divided by the rate.
- **Walls pull the camera in along a ray from the player's head.** Cast from the head toward the camera and put the camera just in front of the first hit. Cast as far as the camera plus the margin, so the camera is held before it reaches the wall rather than pulled back after it has passed into it.
- **Update the camera after the player has moved this frame.** A camera placed from last frame's position trails by a frame on top of the smoothing, and with a physics step that does not run every frame, that extra frame comes and goes, which reads as jitter.

When the person should be able to turn the camera around the player with the mouse, OrbitControls does the turning, and the follow is one change: move the camera and the target by the player's step this frame, then `update()`:

```js
const step = player.position.clone().sub(lastPos);   // lastPos: the player's position before this frame's move
camera.position.add(step);
controls.target.add(step);
controls.update();
```

Moving the target alone makes the camera turn to watch the player walk away from it, because OrbitControls keeps the camera where it is and aims it at the new target.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `interact` holds keys and drags the mouse frame by frame, and with `trace` reads paths in `observe()` every frame and gives each one's first and last value, its peak and the frame of it; with `look: true` it adds `look`'s picture and its Subject line, which says how much of the player shows and what covers the rest. `expect` and `save` keep a play as a check, and `test` replays every saved check from a fresh reload.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A player, a wall and three pillars

W walks forward at 5 units a second, S walks back at half that, A and D turn. A wall stands 9 units behind the start and three pillars ahead. The page has both cameras: the chase camera by default, and OrbitControls following the player when `setState` sets `mode` to `orbit`. `observe()` returns the player, the camera, `lag` (how far the camera is from the point it is heading for) and `distance` (from the camera to the player's head).

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Follow camera</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#9fb4c8}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb4c8);
scene.fog = new THREE.Fog(0x9fb4c8, 25, 60);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 10, 4);
scene.add(sun);

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), mat(0x6f8f5f));
ground.name = 'ground';
scene.add(ground);

// What the camera must not pass through: a wall behind the start, and three pillars ahead.
const obstacles = [];
const block = (name, w, h, d, x, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(0xa0a4ab));
  m.name = name;
  m.position.set(x, h / 2, z);
  scene.add(m);
  obstacles.push(m);
};
block('wall', 12, 3, 0.4, 0, 9);
block('pillar_1', 1, 3, 1, -4, -4);
block('pillar_2', 1, 3, 1, 4, -8);
block('pillar_3', 1, 3, 1, -3, -13);

// The player: a group facing -z, with a nose so its heading shows.
const player = new THREE.Group();
player.name = 'player';
const part = (name, geo, color, y, z = 0) => {
  const m = new THREE.Mesh(geo, mat(color));
  m.name = name;
  m.position.set(0, y, z);
  player.add(m);
};
part('player_body', new THREE.CylinderGeometry(0.4, 0.4, 1.2, 24), 0xd9534f, 0.6);
part('player_head', new THREE.SphereGeometry(0.3, 24, 16), 0xf0d0b0, 1.45);
part('player_nose', new THREE.BoxGeometry(0.2, 0.2, 0.4), 0x333333, 1.45, -0.35);
scene.add(player);

const SPEED = 5, BACK = 2.5, TURN = 2;   // units and radians per second
const held = new Set();
addEventListener('keydown', (e) => held.add(e.code));
addEventListener('keyup', (e) => held.delete(e.code));

// Chase camera: a point behind and above the player, turned with it, approached with exponential smoothing,
// then pulled in front of anything between the player's head and the camera.
const OFFSET = new THREE.Vector3(0, 2.5, 6), UP = new THREE.Vector3(0, 1, 0);
const goal = new THREE.Vector3(), head = new THREE.Vector3(), ray = new THREE.Raycaster();
let lag = 0;
function chase(dt) {
  head.copy(player.position).y += 1.4;
  goal.copy(OFFSET).applyAxisAngle(UP, player.rotation.y).add(player.position);
  camera.position.lerp(goal, 1 - Math.exp(-8 * dt));   // the same smoothing at any frame rate
  lag = camera.position.distanceTo(goal);
  const toCamera = camera.position.clone().sub(head);
  ray.set(head, toCamera.clone().normalize());
  ray.far = toCamera.length() + 0.3;   // the margin too, so the camera is held before it reaches the wall, not after
  const hit = ray.intersectObjects(obstacles)[0];
  if (hit) camera.position.copy(head).addScaledVector(ray.ray.direction, hit.distance - 0.3);
  camera.lookAt(head);
}

// Orbit mode: OrbitControls turns the camera around the player, and the player's step this frame moves
// the camera and the target together, so the camera keeps its angle and distance as the player walks.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
const lastPos = new THREE.Vector3();
function orbit() {
  const step = player.position.clone().sub(lastPos);
  camera.position.add(step);
  controls.target.add(step);
  controls.update();
}

let mode = 'chase';
function setMode(m) {
  mode = m;
  controls.enabled = m === 'orbit';
  if (m === 'orbit') controls.target.copy(player.position).y += 1.4;
}

function place() {   // the camera straight at its goal, for a start or a set state
  head.copy(player.position).y += 1.4;
  camera.position.copy(OFFSET).applyAxisAngle(UP, player.rotation.y).add(player.position);
  camera.lookAt(head);
  lastPos.copy(player.position);
  if (mode === 'orbit') controls.target.copy(head);
}
place();

let last = 0;
renderer.setAnimationLoop((now) => {
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
  last = now;
  lastPos.copy(player.position);
  if (held.has('KeyA')) player.rotation.y += TURN * dt;
  if (held.has('KeyD')) player.rotation.y -= TURN * dt;
  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, player.rotation.y);
  if (held.has('KeyW')) player.position.addScaledVector(forward, SPEED * dt);
  if (held.has('KeyS')) player.position.addScaledVector(forward, -BACK * dt);
  if (mode === 'chase') chase(dt); else orbit();
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
  describe: () => ({ name: 'follow camera', keys: { KeyW: 'walk forward', KeyS: 'walk back', KeyA: 'turn left', KeyD: 'turn right' }, modes: ['chase', 'orbit'] }),
  observe: () => ({
    mode,
    player: { x: r(player.position.x), z: r(player.position.z), yaw: r(player.rotation.y) },
    camera: { x: r(camera.position.x), y: r(camera.position.y), z: r(camera.position.z) },
    lag: r(lag),
    distance: r(camera.position.distanceTo(head.copy(player.position).setY(player.position.y + 1.4))),
  }),
  setState: (s) => {
    if (s.mode) setMode(s.mode);
    if (s.player) {
      player.position.x = s.player.x ?? player.position.x;
      player.position.z = s.player.z ?? player.position.z;
      player.rotation.y = s.player.yaw ?? player.rotation.y;
    }
    place();
  },
};
</script>
</body></html>
```

## The lag, in units, frame by frame

The calls below were made on 2026-10-28. Run folder paths are left out and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:44661/index.html in 0.2 s, paused at frame 0.

interact {"steps": [{"key": "KeyW", "frames": 60}, {"wait": 40}], "trace": ["player.z", "camera.z", "lag", "distance"]}

{"changed":{"player":{"z":-4.92},"camera":{"z":1.09}}}
player.z: 0 → -4.92 at frame 60; first changed at frame 2
camera.z: 6 → 1.09 at frame 90; first changed at frame 2
lag: 0 → peak 0.58 at frame 33 → 0 at frame 96; first changed at frame 2
distance: 6.1 → peak 6.68 at frame 54 → 6.1 at frame 96; first changed at frame 2

interact {"steps": [{"key": "KeyD", "frames": 45}, {"wait": 30}], "trace": ["player.yaw", "camera.x", "lag"]}

{"changed":{"player":{"yaw":-1.5},"camera":{"x":-5.87,"y":2.48,"z":-4.49},"lag":0.12,"distance":5.98}}
player.yaw: 0 → -1.5 at frame 45; first changed at frame 1
camera.x: 0 → -5.87 at frame 75; first changed at frame 1
lag: 0 → peak 2.51 at frame 45 → 0.12 at frame 75; first changed at frame 1
```

Walking, the camera falls behind its point by up to 0.58 units, reached by frame 33 and held while the player keeps walking, and the distance to the player's head grows from 6.1 to 6.68. When the player stops at frame 60 the camera catches up, and both are back by frame 96. Turning is where the lag is large. The point behind the player swings around with the heading, and by the end of a 45-frame turn the camera is 2.51 units from it; 30 frames later it is within 0.12. Those numbers are what to tune: a larger rate than 8 shortens both, and a camera that should swing with the player at once needs a separate, faster rate for the turn.

## Backing toward the wall

The player starts 4 units in front of the wall, facing away from it, and walks back for 60 frames. The camera's point behind it is past the wall the whole time:

```text
interact {"steps": [{"state": {"player": {"x": 0, "z": 4, "yaw": 0}}}, {"key": "KeyS", "frames": 60}], "trace": ["player.z", "camera.z", "distance"], "look": true}

{"changed":{"player":{"z":6.5,"yaw":0},"camera":{"x":0,"y":1.79,"z":8.51},"lag":3.55,"distance":2.04}}
player.z: 4 → 6.5 at frame 60; first changed at frame 1
camera.z: 8.5 → 8.51 at frame 2; first changed at frame 2
distance: 4.58 → 2.04 at frame 60; first changed at frame 1
Subject: player takes 13% of the picture [490, 266, 789, 799], cut by its edge; 2 of its 3 named parts show; in view but covered: player_nose (behind player_head).
On screen (6):
ground 51% [0, 273, 1279, 799] 120 × 120 units
player_body 9.3% [490, 447, 789, 799]
player_head 4% [526, 266, 753, 490]
pillar_* ×3 2.9% [341, 170, 862, 366] 3 × 1 units
```

The camera stays at z 8.51, in front of the wall's face at 8.8, while the player comes toward it, so the distance to the head shrinks from 4.58 to 2.04 and the player grows to 13% of the picture. The Subject line says what a person would see: the player from close behind, its nose hidden by its own head, which is right for a back view.

## OrbitControls around a moving player

The same page in orbit mode: a drag of 200 pixels to the right, then W for 60 frames.

```text
interact {"steps": [{"state": {"mode": "orbit", "player": {"x": 0, "z": 0, "yaw": 0}}}, {"mouse": "down", "x": 640, "y": 400}, {"mouse": "move", "x": 740, "y": 400}, {"mouse": "move", "x": 840, "y": 400}, {"mouse": "up", "x": 840, "y": 400}, {"key": "KeyW", "frames": 60}], "trace": ["camera.x", "camera.z", "player.z", "distance"]}

{"changed":{"mode":"orbit","player":{"z":-5},"camera":{"x":-6,"y":2.5,"z":-5},"distance":6.1}}
mouse down at (640, 400): over player_head (Mesh, 5.8 units)
mouse move at (740, 400): over ground (Mesh, 14 units)
camera.x: 0 → -6 at frame 3; first changed at frame 2
camera.z: 6 → -5 at frame 64; first changed at frame 2
player.z: 0 → -5 at frame 64; first changed at frame 5
distance: 6.1 throughout the 64 frames
```

The drag turns the camera a quarter of the way round to the player's left side (`x` -6) by frame 3. The walk then carries camera and player together: the camera's `z` follows the player's from 0 to -5, its `x` stays at -6, and the distance holds at 6.1 for all 64 frames. The camera keeps the angle the person chose while the player walks.

## Fault 1: the camera goes behind the wall

The same page without the ray, the chase camera as most first versions have it:

```js
camera.position.lerp(goal, 1 - Math.exp(-8 * dt));
lag = camera.position.distanceTo(goal);
camera.lookAt(head);
```

```text
interact {"steps": [{"state": {"player": {"x": 0, "z": 4, "yaw": 0}}}, {"key": "KeyS", "frames": 60}], "trace": ["player.z", "camera.z", "distance"], "look": true}

{"changed":{"player":{"z":6.5},"camera":{"z":12.21},"lag":0.29,"distance":5.81}}
player.z: 4 → 6.5 at frame 60; first changed at frame 1
camera.z: 10 → 12.21 at frame 60; first changed at frame 1
distance: 6.1 → 5.81 at frame 37; first changed at frame 1
Subject: player drew no pixel; 0 of its 3 named parts show; in view but covered: player_body (behind wall), player_head (behind wall), player_nose (behind wall).
On screen (1):
wall 86% [0, 115, 1279, 799] 12 × 3 units, across the view
```

The camera ends at z 12.21, on the far side of a wall at 8.8 to 9.2, and the picture is 86% wall. The trace alone looks healthy, a steady distance and a small lag; the Subject line is what says the player cannot be seen, and names the wall as what covers each of its parts.

## Fault 2: the target follows and the camera stays

The orbit mode with the target moved to the player each frame and the camera left alone:

```js
controls.target.copy(player.position).y += 1.4;   // the target follows; the camera stays where it is
controls.update();
```

```text
interact {"steps": [{"state": {"mode": "orbit", "player": {"x": 0, "z": 0, "yaw": 0}}}, {"mouse": "down", "x": 640, "y": 400}, {"mouse": "move", "x": 740, "y": 400}, {"mouse": "move", "x": 840, "y": 400}, {"mouse": "up", "x": 840, "y": 400}, {"key": "KeyW", "frames": 60}], "trace": ["camera.x", "camera.z", "player.z", "distance"]}

{"changed":{"mode":"orbit","player":{"z":-5},"camera":{"x":-6,"z":0},"distance":7.89}}
camera.x: 0 → -6 at frame 3; first changed at frame 2
camera.z: 6 → 0 at frame 3; first changed at frame 2
player.z: 0 → -5 at frame 64; first changed at frame 5
distance: 6.1 → 7.89 at frame 64; first changed at frame 7
```

The drag works as before. Then `camera.z` stays at 0 while the player walks to -5, and the distance grows from 6.1 to 7.89: the camera stands still and turns its head to watch the player leave. This is the "almost working" of the question above: the orbit centre follows, and the camera does not.

## Keep both as checks

```text
interact {"steps": [{"state": {"player": {"x": 0, "z": 4, "yaw": 0}}}, {"key": "KeyS", "frames": 60}], "expect": {"camera.z": [0, 8.8]}, "save": "wall-behind"}

Expect: camera.z 8.51 ✓
Saved check "wall-behind" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

interact {"steps": [{"state": {"mode": "orbit", "player": {"x": 0, "z": 0, "yaw": 0}}}, {"mouse": "down", "x": 640, "y": 400}, {"mouse": "move", "x": 740, "y": 400}, {"mouse": "move", "x": 840, "y": 400}, {"mouse": "up", "x": 840, "y": 400}, {"key": "KeyW", "frames": 60}], "expect": {"distance": [6, 6.2]}, "save": "orbit-follow"}

Expect: distance 6.1 ✓
Saved check "orbit-follow" in game-tests.json (2 checks now); `test` reruns them all, each from a fresh reload.

test {}

✓ wall-behind
✓ orbit-follow
2 of 2 saved checks passed in 1.6 s
```

`test` on the page with fault 1, then on the page with fault 2:

```text
test {}

✗ wall-behind: camera.z 12.21, expected 0 to 8.8
✓ orbit-follow
1 of 2 saved checks passed in 2.2 s

test {}

✓ wall-behind
✗ orbit-follow: distance 7.89, expected 6 to 6.2
1 of 2 saved checks passed in 2.5 s
```

Each check names its own fault. In a Claude Code session the after-edit hook reruns both after every edit, so a change to the camera that lets it slip behind the wall again, or loses the orbit follow, is named at the edit.

## What to read in the replies

- The `lag` trace: its peak while walking and while turning, and the frame it settles. These are the camera's feel in numbers, and the values to tune the rate against.
- The `distance` trace: steady while the player walks means the camera keeps up. A distance that grows through a walk is a camera left behind.
- The Subject line of the picture `interact` adds: the share of the picture the player takes and what covers each part. "drew no pixel" with a wall named is a camera on the wrong side of it.
- `test`: one line per saved check, with the value it got and the range it wanted.

## Pitfalls

- **The camera inside the player.** With the player's back right against a wall, the ray pulls the camera into the head. Raise the camera as it pulls in, or fade the player's material when the distance is under a body's width.
- **A pulled-in camera with OrbitControls.** OrbitControls takes its distance from where the camera is, so a camera pulled in by a wall stays close after the wall is gone. Keep the distance the person chose in a variable of your own and pull in from it each frame.
- **Jitter from a fixed physics step.** A physics world stepped at a fixed rate moves the player on some frames and not others. Draw the player at a position interpolated between the last two steps, and follow that.
- **Smoothing the look target too.** A camera that also lerps the point it looks at makes the player drift off the centre of the screen while it walks. Smooth the position and look straight at the head, as the page does, unless the drift is wanted.
- **Damping in orbit mode.** With `enableDamping`, `update()` must run every frame, and the follow step must be added before it, so the drag's remaining motion and the follow combine.

## What paprika3d does not do

It does not write the camera or tune its rate: it plays the keys and drags, reads the values the page's own code produced, and says what the picture shows. `lag` and `distance` here are the page's own values in `observe()`. The plays run on a clock that steps 1/60 s a frame, so a camera smoothed with a fixed factor per frame looks right here and wrong on a slower screen; read the smoothing code for that. It does not judge whether the follow feels good to a player, and its mouse steps are Chrome's events, not a real mouse or a gamepad's stick.

## Without paprika3d

Log the distance from the camera to its goal and to the player's head each frame while you walk, turn and stop; the peaks are the lag. Draw the goal as a small sphere and the ray as a `THREE.ArrowHelper` to see when the wall test hits. A second camera looking down on the scene, drawn in a corner with `renderer.setScissor`, shows where the follow camera actually is when the main view goes grey with wall.
