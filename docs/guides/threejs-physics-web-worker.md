---
title: three.js physics in a web worker, without jitter between the step and the render
phrase: three.js physics in a web worker
description: Physics that stutters a three.js frame can run in a web worker, but a worker on its own timer brings jitter and runs that do not repeat. How the paprika3d plugin's game-state library runs Rapier in a worker on the page's clock, one step per 1/60 s tick, and how a coding agent checks it with interact and perf.
meta: three.js physics in a web worker: step Rapier off the main thread without jitter between the physics step and the render.
intent: physics-off-main-thread
queries:
  - "Web workers in 3D web applications"
  - "Web worker still janks main thread"
  - "Web worker physics demo"
  - "Using Three.js, and Rapier physics: Why does this object have a jitter on moving?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js physics in a web worker, without jitter between the step and the render

## What a worker fixes, and what it breaks

A physics step runs in JavaScript. On the main thread it shares the frame with input handling, your game code and three.js's render calls, so a pile of bodies that takes long to step makes every frame late. Moving the step into a web worker frees the main thread, and that is why the forum threads reach for one. The usual first version then brings two new problems:

- **Two clocks.** The worker steps on its own `setInterval` and posts positions whenever a step is done; the page draws on `requestAnimationFrame`. Some frames get two new steps, some none, and some draw a body moved by one step beside a camera moved by another. That is the jitter in "why does this object have a jitter on moving".
- **Runs that do not repeat.** A key press lands on whatever step the worker is on when the message arrives, so the same inputs give a different game each time. A test cannot replay it, and a bug cannot be reproduced.

The fix is one clock: the page owns time, and the worker steps when the page asks and at no other time. Each frame the page adds its elapsed time, runs one tick per 1/60 s owed, sends that tick's inputs to the worker as one step, and draws the state from the step that came back. The worker is given inputs and nothing else, so the same inputs give the same steps.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock that steps one frame at a time. Its `threejs-game` skill ships game-state, a small library that does the above: state in typed arrays, Rapier (its deterministic build) in a worker, a `loop()` that runs one tick per 1/60 s of game time and never reads time otherwise, and a generated `window.__game` the plugin's tools read. `interact` plays the same keys twice and shows whether the state comes out the same, and `perf` measures the game with the worker and without it in one call.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

game-state ships inside the plugin, not on npm. The skill has the agent copy its two files next to the game's entry file; `physics-worker.js` holds Rapier and is the larger of the two, since it is a whole physics engine compiled to WebAssembly:

```bash
cp ${CLAUDE_PLUGIN_ROOT}/state/dist/game-state.js .
cp ${CLAUDE_PLUGIN_ROOT}/state/dist/physics-worker.js .
```

## A pile in a worker, with game-state

800 boxes fall into a bin and a ball pushed with the arrow keys ploughs into them. The state is declared once in its shape; `physics()` binds bodies to it; `tick` is the rules for one tick and `render` draws whatever the state holds after it.

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Pile</title>
<style>html,body{margin:0;overflow:hidden;background:#1d2128}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
// copied next to this file from the plugin's state/dist/; game-state.js loads physics-worker.js from beside itself
import { createState, list, matrices, physics, loop } from './game-state.js';

const N = 800, HALF = 0.25, BIN = 6;
const state = createState({
  ball: { x: 0, y: 1, z: 8, vx: 0, vy: 0, vz: 0 },
  boxes: list(N, { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }),
  walls: list(5, { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 }),
  held: { left: false, right: false, up: false, down: false },
  ticks: 0,
});
// boxes stacked in a grid, nudged by state.random() (never Math.random) so the pile tumbles the same way every run
for (let i = 0; i < N; i++) {
  const per = 16, layer = Math.floor(i / (per * per)), k = i % (per * per);
  state.boxes.push({ x: -BIN + 1 + (k % per) * 0.65 + (state.random() - 0.5) * 0.2, y: 2 + layer * 0.8,
    z: -BIN + 1 + Math.floor(k / per) * 0.65 + (state.random() - 0.5) * 0.2 });
}
state.walls.push({ x: 0, y: -0.5, z: 0, w: 40, h: 1, d: 40 });   // floor (wider than the drawn one, so nothing falls off)
for (const s of [1, -1]) state.walls.push({ x: s * (BIN + 0.5), y: 1, z: 0, w: 1, h: 2, d: 2 * BIN });
state.walls.push({ x: 0, y: 1, z: -(BIN + 0.5), w: 2 * BIN + 2, h: 2, d: 1 });

// Rapier runs in a worker; each body follows its item's x/y/z (and q, v) in the state
const world = await physics(state, {
  ball: { shape: 'sphere', size: [1.2] },
  boxes: { size: [2 * HALF] },
  walls: { size: w => [w.w, w.h, w.d], type: 'fixed' },
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 14, 20); camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
const floor = new THREE.Mesh(new THREE.BoxGeometry(2 * BIN + 2, 1, 2 * BIN + 2), new THREE.MeshStandardMaterial({ color: 0x3a3f48 }));
floor.position.y = -0.5; floor.name = 'floor'; scene.add(floor);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), new THREE.MeshStandardMaterial({ color: 0x4aa3ff }));
ball.name = 'ball'; scene.add(ball);
const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(2 * HALF, 2 * HALF, 2 * HALF), new THREE.MeshStandardMaterial({ color: 0xff9933 }), N);
boxes.name = 'boxes'; boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(boxes);

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
// one tick is 1/60 s of game time; it reads only the state, the world and the inputs
function tick(inputs) {
  for (const i of inputs) if (KEYS[i.key]) state.held[KEYS[i.key]] = i.down !== false;
  const h = state.held, push = 0.4;
  world.impulse(state.ball, { x: (h.right - h.left) * push, y: 0, z: (h.down - h.up) * push });
  state.ticks++;
}
// render draws the state after the tick: the meshes never show a half-finished step
function render() {
  ball.position.set(state.ball.x, state.ball.y, state.ball.z);
  boxes.count = matrices(state.boxes, boxes.instanceMatrix.array);
  boxes.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
loop({ state, physics: world, tick, render, describe: () => ({ name: 'pile', keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] }) });
</script>
</body></html>
```

The calls in this guide were made on 2026-10-28 on a shared Linux server with no GPU, so Chrome drew in software (SwiftShader). Run folder paths are shortened to `<project>`, and replies after the first are cut to the lines this guide discusses, with nothing reworded.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:36461/index.html in 0.1 s, paused at frame 0.
Page text outside the canvas: none
{"name":"pile","keys":["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]}

interact {"steps": [{"key": "ArrowUp", "frames": 60}, {"wait": 60}], "trace": ["ball.z", "ticks"]}

{"after":{"ball":{"x":0.11,"y":0.6,"z":4.35,"vx":0,"vy":0,"vz":0},"boxes":"(cut)","walls":[{"x":0,"y":-0.5,"z":0,"w":40,"h":1,"d":40},{"x":6.5,"y":1,"z":0,"w":1,"h":2,"d":12},{"x":-6.5,"y":1,"z":0,"w":1,"h":2,"d":12},{"x":0,"y":1,"z":-6.5,"w":14,"h":2,"d":1}],"held":{"left":false,"right":false,"up":false,"down":false},"ticks":120},"changed":["ball.x","ball.y","ball.z","boxes","ticks"],"truncated":true,"cut":["boxes (48258 bytes)"]}
ball.z: 8 → low 4.3 at frame 62 → 4.35 at frame 90; first changed at frame 2
ticks: 0 → 120 at frame 120; first changed at frame 2
```

`ticks` counts the game's ticks, and it reads 120 after 120 frames: one physics step per frame, in step with the page. The ball rolled into the pile, stopped at `z` 4.3 and was pushed back a little by the boxes. The tool cut the 800 boxes out of the `after` line itself.

Opened again and played with the same steps, it gives the same numbers:

```text
open {"url": "index.html", "cwd": "<project>"}
interact {"steps": [{"key": "ArrowUp", "frames": 60}, {"wait": 60}], "trace": ["ball.z", "ticks"]}

{"after":{"ball":{"x":0.11,"y":0.6,"z":4.35,"vx":0,"vy":0,"vz":0},"boxes":"(cut)","walls":[{"x":0,"y":-0.5,"z":0,"w":40,"h":1,"d":40},{"x":6.5,"y":1,"z":0,"w":1,"h":2,"d":12},{"x":-6.5,"y":1,"z":0,"w":1,"h":2,"d":12},{"x":0,"y":1,"z":-6.5,"w":14,"h":2,"d":1}],"held":{"left":false,"right":false,"up":false,"down":false},"ticks":120},"changed":["ball.x","ball.y","ball.z","boxes","ticks"],"truncated":true,"cut":["boxes (48258 bytes)"]}
ball.z: 8 → low 4.3 at frame 62 → 4.35 at frame 90; first changed at frame 2
ticks: 0 → 120 at frame 120; first changed at frame 2
```

Under the plugin, each frame waits for the worker's reply before the clock moves on, so the step is never late. In a browser the page keeps drawing; when a reply is late, the tick waits, the time stays owed and the inputs go with the next step, so physics still steps once per tick, in order.

## A worker on its own timer

Take the ball page from the last section of this guide and move its physics, as is, into a worker that keeps its own time (`sim.js`: that page's step function plus this):

```js
onmessage = (e) => Object.assign(held, e.data);           // the page sends the keys it sees
let last = performance.now();
setInterval(() => {                                       // the worker's own clock, not the page's frames
  const now = performance.now();
  let owed = Math.min((now - last) / 1000, 0.1); last = now;
  while (owed >= STEP - 1e-4) { step(); owed -= STEP; }
  postMessage({ pos, ticks });                            // whenever it is done, whatever frame the page is on
}, 1000 / 60);
```

The page draws the last positions that arrived. The same keys:

```text
interact {"steps": [{"key": "ArrowUp", "frames": 60}, {"wait": 60}], "trace": ["ball.z", "ticks"]}

{"changed":{"ticks":1}}
ball.z: 4 throughout the 120 frames
ticks: 0 throughout the 120 frames
```

The page ran 120 frames and the physics none of them: the plugin stepped the frames faster than real time, and the worker's replies, which arrive as messages, landed after the call was over. That is the two-clock problem pushed to its end. In a browser the page and the worker drift by a step here and there instead, which shows up as jitter and as runs that do not repeat; there is no frame number at which "the ball has moved" is true, so no check on it can pass twice.

## Measure with the worker and without it: `perf`

game-state runs the same handler in the page when the URL has `?worker=0`, so one `perf` call measures both, the variant on a fresh page with `query` set:

```text
perf {"variants": [{"label": "physics in the page", "query": "worker=0"}]}

baseline: 70.5 ms median (p95 84.6), work 68.3 ms, 3 draw calls, 10572 triangles; over budget: frameMs 70.5 of 16.7 ms; desktop budget
physics in the page: 101.1 ms median (p95 136.2), work 104.9 ms, 3 draw calls, 10572 triangles; +43% vs baseline
Work: the median of the frames that drew, of paused frames, each timed from its step to the end of its GPU work, with no wait for the display.
Noise between two samples of the baseline: 2.8 ms. Load to first frame: 0.2 s.
Host load 28.4 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

Read this with care. On this machine Chrome draws in software and three other agents shared the processor, so most of each frame is the software renderer. Two separate `perf` calls a minute later, one per version, read the same work for both (cut to that line):

```text
open {"url": "index.html", "cwd": "<project>"}
perf {}

Work per frame: 68.6 ms a frame that drew (the median of 8), 67.2 ms of it the frame's code; 72.02 ms a frame on average over 8 stepped, the slowest 90.1 ms; paused frames, each timed from its step to the end of its GPU work, with no wait for the display.

open {"url": "index.html?worker=0", "cwd": "<project>"}
perf {}

Work per frame: 68.6 ms a frame that drew (the median of 8), 1.1 ms of it the frame's code; 72.44 ms a frame on average over 8 stepped, the slowest 91.6 ms; paused frames, each timed from its step to the end of its GPU work, with no wait for the display.
```

Do not read "the frame's code" as main-thread time on a worker game: under the plugin a frame waits for the worker's reply before it ends, and that wait is counted in it. None of these numbers settles the question on this host, so this guide makes no claim from them. The plugin's README reports, from its own benchmark (a game of about 2000 tumbling crates, two runs a side):

```text
game-state: about 5 times less main-thread time on a physics-heavy game
```

Measure your own game on a machine with a GPU before deciding; the reply above is no measure of one.

## Without a worker: one fixed step on the main thread

Jitter often has nothing to do with workers. It comes from stepping physics by the frame's elapsed time, or on a timer, and drawing in between. A physics step of fixed size inside the animation frame, followed by the render, fixes it on the main thread; move the step to a worker when it is too slow to share the frame. This page does that with a hand-written step for 300 balls and a ball you push, and needs nothing but three:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Balls</title>
<style>html,body{margin:0;overflow:hidden;background:#1d2128}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// Physics on the main thread, stepped in fixed ticks of 1/60 s inside the animation frame, then drawn.
const N = 300, R = 0.25, BIN = 5, STEP = 1 / 60, G = -9.8;
const pos = new Float32Array((N + 1) * 3), vel = new Float32Array((N + 1) * 3); // body 0 is the ball you push
const rad = (i) => (i === 0 ? 0.6 : R);
let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; // seeded, so every run starts the same
pos.set([0, 0.6, 4]);
for (let i = 1; i <= N; i++) pos.set([(random() - 0.5) * 2 * (BIN - 1), 1 + random() * 6, (random() - 0.5) * 2 * (BIN - 1)], i * 3);
const held = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
let ticks = 0;

function step() {
  vel[0] += ((held.ArrowRight - held.ArrowLeft) * 12) * STEP;
  vel[2] += ((held.ArrowDown - held.ArrowUp) * 12) * STEP;
  for (let i = 0; i <= N; i++) {
    const o = i * 3, r = rad(i);
    vel[o + 1] += G * STEP;
    for (let k = 0; k < 3; k++) pos[o + k] += vel[o + k] * STEP;
    if (pos[o + 1] < r) { pos[o + 1] = r; vel[o + 1] *= -0.3; vel[o] *= 0.98; vel[o + 2] *= 0.98; }
    for (const k of [0, 2]) if (Math.abs(pos[o + k]) > BIN - r) { pos[o + k] = Math.sign(pos[o + k]) * (BIN - r); vel[o + k] *= -0.5; }
  }
  for (let i = 0; i <= N; i++) for (let j = i + 1; j <= N; j++) { // every pair: the cost that grows with N
    const a = i * 3, b = j * 3, dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
    const d2 = dx * dx + dy * dy + dz * dz, min = rad(i) + rad(j);
    if (d2 >= min * min || d2 === 0) continue;
    const d = Math.sqrt(d2), push = (min - d) / 2, nx = dx / d, ny = dy / d, nz = dz / d;
    pos[a] -= nx * push; pos[a + 1] -= ny * push; pos[a + 2] -= nz * push;
    pos[b] += nx * push; pos[b + 1] += ny * push; pos[b + 2] += nz * push;
    const rel = (vel[b] - vel[a]) * nx + (vel[b + 1] - vel[a + 1]) * ny + (vel[b + 2] - vel[a + 2]) * nz;
    if (rel < 0) { const imp = -rel * 0.6; vel[a] -= nx * imp; vel[a + 1] -= ny * imp; vel[a + 2] -= nz * imp; vel[b] += nx * imp; vel[b + 1] += ny * imp; vel[b + 2] += nz * imp; }
  }
  ticks++;
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 10, 14); camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
const floor = new THREE.Mesh(new THREE.BoxGeometry(2 * BIN, 0.2, 2 * BIN), new THREE.MeshStandardMaterial({ color: 0x3a3f48 }));
floor.position.y = -0.1; floor.name = 'floor'; scene.add(floor);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), new THREE.MeshStandardMaterial({ color: 0x4aa3ff }));
ball.name = 'ball'; scene.add(ball);
const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(R, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff9933 }), N);
balls.name = 'balls'; balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(balls);
const m = new THREE.Matrix4();

function render() {
  ball.position.fromArray(pos, 0);
  for (let i = 1; i <= N; i++) balls.setMatrixAt(i - 1, m.makeTranslation(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  balls.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

// The fixed step: add the frame's elapsed time (at most 0.1 s) and run one tick per 1/60 s owed, then draw once.
let last = null, owed = 0;
function frame(now) {
  requestAnimationFrame(frame);
  owed = Math.min(owed + (last === null ? STEP : (now - last) / 1000), 0.1); last = now;
  while (owed >= STEP - 1e-4) { step(); owed -= STEP; }
  render();
}
requestAnimationFrame(frame);

addEventListener('keydown', (e) => { if (e.key in held) held[e.key] = true; });
addEventListener('keyup', (e) => { if (e.key in held) held[e.key] = false; });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
const r2 = (v) => Math.round(v * 100) / 100;
window.__game = {
  describe: () => ({ name: 'balls', keys: Object.keys(held), physics: 'main thread' }),
  observe: () => ({ ball: { x: r2(pos[0]), z: r2(pos[2]) }, first: { x: r2(pos[3]), y: r2(pos[4]), z: r2(pos[5]) }, ticks }),
  act: () => {},
  setState: () => {},
};
</script>
</body></html>
```

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:36461/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"name":"balls","keys":["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"],"physics":"main thread"}

interact {"steps": [{"key": "ArrowUp", "frames": 60}, {"wait": 60}], "trace": ["ball.z", "ticks"]}

{"changed":{"ball":{"x":-0.65,"z":3.37},"first":{"x":-4.47,"y":0.25,"z":1.84},"ticks":120}}
ball.z: 4 → low 2.52 at frame 45 → 3.37 at frame 120; first changed at frame 2
ticks: 0 → 120 at frame 120; first changed at frame 1
```

A second `open` and the same `interact` gave the same line, value for value. The worker version above keeps that property: game-state's `loop()` is this accumulator, with the step sent to the worker and its reply waited for, instead of run in place.

## What to read in the replies

- `interact` with `trace`: one line per path with its first value, its low or peak and the frame of each. A tick counter that reaches the number of frames played means one physics step per frame; one that stays at 0 means the physics is not on the page's clock.
- The same `interact` after a fresh `open`: the same `after` or `changed` values mean the game repeats. game-state's ticks, `state.random()` and a worker that is given inputs and nothing else are what make it do so.
- `perf` with a `variants` entry: the variant's frame and work beside the baseline's, with the noise between two samples. On a software renderer or a busy machine, the noise and the renderer are most of it.

## What paprika3d does not do

- It does not interpolate. game-state draws the state of the last tick; on a display faster than 60 Hz, some frames have no new tick and draw the same positions again. Interpolating between the last two ticks is code in your `render`.
- It does not make the physics cheaper. The worker moves the step off the main thread; the step costs what it costs, and a step longer than a tick still slows the game down.
- `perf` here measures frames and the work in them; this guide does not show a main-thread time per frame from it, and on a machine with no GPU its frame times are the software renderer's.
- game-state's physics is Rapier, and its worker carries its own copy of it. It does not run cannon-es, ammo.js or a Rapier you installed; `templates/rapier.ts` in the skill uses the project's own Rapier, on the main thread.

## Pitfalls

- **Send inputs, not positions.** A worker that receives positions from the page, or posts positions on its own schedule, is on a second clock. Send the tick's inputs and get the step's results back.
- **Never read time in the game's rules.** A tick is 1/60 s; read no `performance.now()` or `Date` in `tick`, and use `state.random()` instead of `Math.random`.
- **Cap the time a frame can owe.** After a tab switch the page owes seconds; game-state caps it at 0.1 s, and the fixed-step page above does the same, so the game does not run a hundred ticks at once.
- **Move the camera in `render`, from the state.** A camera that follows a body must read the same tick's position the body's mesh does, or the two shake against each other.
- **Copy both files.** `game-state.js` loads `physics-worker.js` from beside itself, so a game that calls `physics()` needs both in the same folder.

## Without paprika3d

The same design works by hand: a worker with Rapier, cannon-es or ammo.js that steps on a message from the page and never on a timer, a fixed-step accumulator in the animation frame, and a `Float32Array` of positions sent back each step with its buffer transferred (or a `SharedArrayBuffer`, which needs the page served cross-origin isolated). In React Three Fiber, use-cannon runs cannon-es in a worker, and react-three-rapier steps Rapier on the main thread with a fixed `timeStep` and interpolates between steps. To check that a run repeats, log the state after a fixed number of frames with fixed inputs and compare two runs; to see the main thread, record a trace in the browser's performance panel and look at the main thread's tasks with the worker and without it.
