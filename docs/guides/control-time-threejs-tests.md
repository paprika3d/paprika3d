---
title: Control time in three.js tests, and keep movement frame-rate independent
phrase: control time in three.js tests
description: How a coding agent controls time when it tests a three.js page with the paprika3d plugin: a paused clock stepped 1/60 s a frame with requestAnimationFrame, performance.now, Date and timers faked, seeded Math.random, an animation's start and end frames read with trace and until, and a real-time play that shows a per-frame mover falling behind.
meta: Control time in three.js tests: a paused clock stepped 1/60 s a frame, seeded randomness, and frame-rate independent movement, checked with paprika3d.
intent: threejs-deterministic-time
queries:
  - "Limiting framerate in Three.js to increase performance, requestAnimationFrame?"
  - "How to solve different FPS in requestAnimationFrame on different browsers?"
  - "unit tests for animated mesh using '@react-three/test-renderer'"
  - "Issues with screen's FrameRates on different devices (Low-end and high-end)"
  - "Animated website model is moving too fast on 120hz 166hz monitors"
  - "How do I handle lag in my scene?"
  - "Cannon, world.step and delta time"
  - "What's the best simple way to handle the update pattern?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Control time in three.js tests, and keep movement frame-rate independent

## Where time gets into a three.js page

A three.js page reads time in several places: the timestamp `requestAnimationFrame` passes to the loop, `performance.now()` or `Date.now()` for durations, `setTimeout` and `setInterval` for things that happen later, and `Math.random()` for anything scattered. Each one changes between runs. `requestAnimationFrame` fires at the display's refresh rate when the machine keeps up, and less often when it does not, so a 60 Hz laptop, a high-refresh gaming monitor and a phone under load each run a different number of frames in the same second.

That makes two separate problems. The page has to move by the time that passed, not by the number of frames, or it runs at a different speed on each device. And a test of the page has to control every one of those time sources, or the same steps give a different state on each run.

paprika3d is a Claude Code plugin and MCP server that runs the page in its own headless Chrome on a paused clock. It replaces `requestAnimationFrame`, `performance.now`, `Date` and the timers with a clock that moves when a tool steps it and not otherwise, 1/60 s a frame, and it seeds `Math.random`. The `interact` tool steps that clock: `wait` for a number of frames, `until` to step until the state holds, and `trace` to read values every frame of the steps.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with every kind of time

Two boxes move at one unit per second, written two ways: `perFrame` adds a fixed step each frame, which assumes 60 frames a second, and `perSecond` adds speed times the elapsed time `dt`, capped at 0.1 s so a long pause does not teleport it. A door starts to swing when `perSecond` reaches 3 and takes 1.5 s, timed by the clock. A `setInterval` drops a sphere every 2 s at a random x. `window.__game.observe()` returns all of it, with the frame count and the page's own clock in seconds.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Drift</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4, 5, 12);
camera.lookAt(4, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x203040, 2.5));
const ground = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x2a3a2a }));
ground.name = 'ground';
ground.position.set(4, -0.6, 0);
scene.add(ground);
const box = (name, color, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color }));
  m.name = name; m.position.z = z; scene.add(m); return m;
};
const perFrame = box('perFrame', 0xff6040, -1.5);   // moves a fixed step each frame
const perSecond = box('perSecond', 0x40c0ff, 0);    // moves by elapsed time
const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 1.6), new THREE.MeshStandardMaterial({ color: 0xc0a060 }));
door.name = 'door';
door.geometry.translate(0, 0, 0.8);                 // hinge on one edge
door.position.set(9, 0.4, 1.5);
scene.add(door);
const drops = new THREE.Group();
drops.name = 'drops';
scene.add(drops);

const SPEED = 1;            // units per second
const state = { perFrame: 0, perSecond: 0, door: 0, drops: [], frames: 0 };
let opened = null;          // the time the door started to open, in seconds

// A timer, not a frame count: a drop every 2 s at a random x.
setInterval(() => {
  const x = +(Math.random() * 8).toFixed(3);
  state.drops.push(x);
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  d.position.set(x, 0, 1.5);
  drops.add(d);
}, 2000);

let last = null;
renderer.setAnimationLoop((now) => {
  const dt = last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1);   // seconds, capped at 0.1
  last = now;
  state.frames++;
  state.perFrame += SPEED / 60;          // assumes 60 frames a second
  state.perSecond += SPEED * dt;         // uses the time that passed
  if (opened === null && state.perSecond >= 3) opened = now / 1000;
  if (opened !== null) {
    const t = Math.min((now / 1000 - opened) / 1.5, 1);             // a 1.5 s swing
    state.door = 90 * (1 - (1 - t) ** 3);                           // ease out, degrees
  }
  perFrame.position.x = state.perFrame;
  perSecond.position.x = state.perSecond;
  door.rotation.y = -THREE.MathUtils.degToRad(state.door);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const r3 = (n) => +n.toFixed(3);
window.__game = {
  describe: () => ({ name: 'drift', units: 'world units and seconds; door in degrees', keys: {} }),
  observe: () => ({ perFrame: r3(state.perFrame), perSecond: r3(state.perSecond), door: r3(state.door), drops: [...state.drops], frames: state.frames, seconds: r3(performance.now() / 1000) }),
  act: () => {},
  setState: (s) => Object.assign(state, s),
};
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Every result on the paused clock is a count of frames and does not depend on the machine; the last call plays in real time and does, as it says. Run folder paths are shortened to `<project>`.

**1. Open the page.** It loads paused at frame 0.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:45561/index.html in 0.1 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"name":"drift","units":"world units and seconds; door in degrees","keys":{}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-48-05-358Z
```

(The reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out here.)

**2. Read the clock at frame 0.** The page's `performance.now()` reads 60 s at frame 0 on purpose, past any start-up code, so the page's own time starts at the same value on every load:

```text
observe {}

{"perFrame":0,"perSecond":0,"door":0,"drops":[],"frames":0,"seconds":60,"harness":{"frame":0,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":6,"meshes":4,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

**3. Step one second.** Sixty frames move the page's clock by exactly one second, and both boxes by exactly one unit:

```text
interact {"steps": [{"wait": 60}]}

{"changed":{"perFrame":1,"perSecond":1,"frames":60,"seconds":61}}
```

On this clock the two ways of writing the movement agree, because every frame is 1/60 s. A per-frame mover passes every test on a paused clock; the next sections show where it parts from the other.

**4. Find the frames an animation starts and ends on.** `until` steps one frame at a time until the door reads 90 degrees, and `trace` reads the two values every frame of the steps:

```text
interact {"steps": [{"until": {"door": 90}, "max": 300}], "trace": ["perSecond", "door"]}

{"changed":{"perFrame":4.5,"perSecond":4.5,"door":90,"drops":[5.14,1.387],"frames":270,"seconds":64.5}}
until: door == 90 held at frame 210
perSecond: 1 → 4.5 at frame 210; first changed at frame 1
door: 0 → 90 at frame 210; first changed at frame 122
```

Frames here count from the start of the call. The door first moved on frame 122 and was fully open on frame 210, 90 frames later: the 1.5 s swing the code asks for, read as a count rather than a stopwatch. Both drops arrived in the meantime, at random x positions.

**5. Reload and replay.** A second `open` reloads the page to frame 0, and the same kind of step runs to the second drop:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:45561/index.html in 0.1 s, paused at frame 0.
An open is needed only for a fresh frame 0: after an edit, the next tool call reloads by itself.
Page text outside the canvas: none
describe(): unchanged since the last open
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-48-05-678Z
```

```text
interact {"steps": [{"until": {"drops.length": 2}}]}

{"changed":{"perFrame":4.017,"perSecond":4.017,"door":86.667,"drops":[5.14,1.387],"frames":241,"seconds":64.017}}
until: drops.length == 2 held at frame 241
```

The second drop came on frame 241 of the fresh load, and `Math.random()` gave the same two positions, 5.14 and 1.387, as on the first load. A test can assert on a random layout because the layout is the same on every run.

**6. Play in real time.** `record: true` plays the steps against the real clock, as a browser would, keeps a GIF in the run folder, and reports the real frame intervals:

```text
interact {"steps": [{"wait": 120}], "record": true}

{"changed":{"perFrame":5.233,"perSecond":6.022,"door":90,"drops":[5.14,1.387,3.132],"frames":314,"seconds":66.022}}
Recorded 2.05 s in real time: <project>/paprika3d/runs/2026-10-28T05-48-05-678Z/clip-1.gif (GIF, 34 KB, 480 × 300, 33 frames from 33 screencast frames, each shown for its real time); four moments of it: <project>/paprika3d/runs/2026-10-28T05-48-05-678Z/clip-1.png.
Frames: 73 game frames at a 60 Hz pace, 26.5 ms apart (median), p95 30.5 ms, max 61.5 ms; 2 took over two ticks (33 ms). A frame slower than 16.7 ms reads as its own time here, not as the 33 ms a 60 Hz screen would hold it. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
The clock is paused again where the play ended.
```

This machine draws in software, so it ran 73 frames in about two seconds instead of 120. `perSecond` moved by the time that passed (from 4.017 to 6.022) and `perFrame` by the frames that ran (from 4.017 to 5.233), so the per-frame box fell behind. The size of the gap depends on how slow the machine was during the play, and differs from run to run; on a machine that keeps up with 60 Hz the two stay together. Treat this as a look at real-time behaviour, not as a test: the test is the paused-clock result plus code that uses `dt`.

## Why does my three.js game run too fast at 120 Hz, or jump a different height at another frame rate?

The steps above test movement on the paused clock, where every frame is 1/60 s. A real display hands the page frames of other lengths: half of 1/60 s on a 120 Hz monitor, longer ones on a slow phone, uneven ones under load. What the page does with a frame's length decides whether its game looks the same everywhere. This page makes three boxes jump at once, each turning frames into motion by a different rule: `perFrame` moves one 1/60 s step of the jump per frame, `perSecond` moves by the frame's own `dt`, and `fixed` runs whole 1/60 s steps, as many as the elapsed time allows, and carries the rest to the next frame. All three use the same integration, the semi-implicit Euler step common in games:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Jumps</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e8);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2.5));

const GRAVITY = 20, JUMP = 8, STEP = 1 / 60;
// Three jumpers, one rule each for turning frames into motion.
const jumpers = ['perFrame', 'perSecond', 'fixed'].map((name, i) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: [0xe05040, 0x40a0e0, 0x50b060][i] }));
  mesh.name = name;
  mesh.position.x = (i - 1) * 1.5;
  scene.add(mesh);
  return { name, mesh, y: 0, v: 0, peak: 0, start: 0, air: 0 };
});
let now = 0, last = null, acc = 0;

// One step of a jump: semi-implicit Euler, the usual game integration.
function move(j, dt) {
  if (j.y === 0 && j.v === 0) return;
  j.v -= GRAVITY * dt;
  j.y = Math.max(0, j.y + j.v * dt);
  j.peak = Math.max(j.peak, j.y);
  if (j.y === 0 && j.v < 0) { j.v = 0; j.air = +(now - j.start).toFixed(3); }
}

addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  for (const j of jumpers) Object.assign(j, { v: JUMP, peak: 0, start: now, air: 0 });
});

renderer.setAnimationLoop((t) => {
  const dt = last === null ? 0 : Math.min((t - last) / 1000, 0.1);
  last = t;
  now += dt;
  const [perFrame, perSecond, fixed] = jumpers;
  move(perFrame, STEP);             // assumes every frame is 1/60 s
  move(perSecond, dt);              // the time this frame took
  acc += dt;                        // fixed: whole 1/60 s steps, as many as the time allows
  while (acc >= STEP - 1e-9) { move(fixed, STEP); acc -= STEP; }
  for (const j of jumpers) j.mesh.position.y = 0.3 + j.y;
  renderer.render(scene, camera);
});

window.__game = {
  describe: () => ({ name: 'jumps', keys: { Space: 'all three jump' } }),
  observe: () => Object.fromEntries(jumpers.map((j) => [j.name, { y: +j.y.toFixed(3), peak: +j.peak.toFixed(3), air: j.air }])),
  setState: () => {},
};
</script>
</body></html>
```

These replies were captured on 2026-10-28 on the same host; the second one plays in real time and depends on it, as it says. On the paused clock the three agree to the frame:

```text
interact {"steps":[{"wait":1},{"key":"Space"},{"wait":60}],"trace":["perFrame.y","perSecond.y","fixed.y"]}

{"changed":{"perFrame":{"peak":1.533,"air":0.8},"perSecond":{"peak":1.533,"air":0.8},"fixed":{"peak":1.533,"air":0.8}}}
perFrame.y: 0 → peak 1.533 at frame 24 → 0 at frame 48; first changed at frame 2
perSecond.y: 0 → peak 1.533 at frame 24 → 0 at frame 48; first changed at frame 2
fixed.y: 0 → peak 1.533 at frame 24 → 0 at frame 48; first changed at frame 2
```

`{ clock: { timescale: 2 } }` before a real-time play (`record: true`) makes each frame carry twice its real time, so the page meets what a display or a machine giving it half as many, longer frames would give it. This is not a replay of a slower screen: the real frames come as fast as this machine draws them, and the page sees each as twice that.

```text
interact {"steps":[{"clock":{"timescale":2}},{"key":"Space"},{"wait":60}],"trace":["perFrame.y","perSecond.y","fixed.y"],"record":true}

{"changed":{"perFrame":{"air":1.446},"perSecond":{"peak":1.481,"air":0.78},"fixed":{"air":0.804}}}
perFrame.y: 0 → peak 1.533 at frame 24 → 0 at frame 48; first changed at frame 2
perSecond.y: 0 → peak 1.481 at frame 14 → 0 at frame 27; first changed at frame 2
fixed.y: 0 → peak 1.533 at frame 15 → 0 at frame 28; first changed at frame 3
Frames: 68 game frames at a 60 Hz pace, 15.2 ms apart (median), p95 15.9 ms, max 18.1 ms. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

The real frames came 15.2 ms apart, so the page saw frames of about twice that, and the three jumps parted:

- **`perFrame`** reached the same height, 1.533, and took 1.446 s of the page's time to land instead of 0.8: its jump plays at the frame rate, in slow motion here. On a 120 Hz screen the same rule moves 1/60 s of the arc while half that time passes, so the jump runs twice as fast. This is the "moving too fast on 120 Hz monitors" thread.
- **`perSecond`** landed on time, 0.78 s, at a lower peak: 1.481 instead of 1.533. A longer step changes where Euler integration puts the top of the arc, so a jump tuned to clear a ledge at 60 Hz falls short at half the frame rate and goes higher at 120 Hz. This is the "jumps a different height" complaint.
- **`fixed`** reached 1.533, the paused clock's height, and landed in 0.804 s. Its arc is the same sequence of 1/60 s steps at any frame rate; `air` is read on the frame it lands on, so it carries that frame's slack.

The real-time numbers differ from run to run, since they depend on how evenly this machine delivered frames during the play; across the runs made for this section, `fixed` peaked at 1.533 every time, while `perSecond`'s peak and `perFrame`'s airtime moved with the frames. The test is still the paused clock plus code that uses time; this play is a way to see the difference.

The accumulator is a few lines, as in the page above. Drawing the fixed-step state as it is can look uneven when frames and steps do not line up; the usual answer keeps the previous step's position and draws `prev + (cur - prev) * (acc / STEP)` between the two. game-state's `loop()` runs the same accumulator for a game that keeps its state there, one 1/60 s tick per 1/60 s elapsed, as [the physics guide](/guides/threejs-physics-web-worker) shows, and cannon-es's `world.step(1 / 60, dt, 3)` runs one inside the physics world. With `{ clock: { timescale: 0.5 } }` the same play gives each frame half its real time, the 120 Hz direction; on this host its frames came unevenly in the run made for it, so this guide shows the slow direction.

## What paprika3d does not do

- It does not cap a page's frame rate. Limiting the frame rate is the page's job (below).
- It steps the paused clock at 1/60 s a frame and nothing else, so it does not replay a page as a slower or faster display would. A per-frame mover passes on the paused clock; reading the code for a fixed step per frame is the check.
- `record` paces real-time play at 60 Hz, so it can show a page on a machine slower than that, never one faster.

## Pitfalls

- **Move by `dt`, not by frames.** Take `dt` from the timestamp the animation loop receives, or from three.js's `Clock` or `Timer`, and multiply every speed by it.
- **Cap `dt`.** A tab in the background, a breakpoint or a slow first frame produces a huge `dt`. Never more than 0.1 s of game time in one frame keeps objects from passing through walls.
- **Use timers or elapsed time for durations**, not frame counts: "after 120 frames" is two seconds at 60 Hz and one second at 120 Hz.
- **Keep randomness on `Math.random`.** paprika3d seeds it, so a test sees the same layout. A page that brings its own random generator should seed it from `Math.random()` once.
- **Physics wants a fixed step.** For collisions and anything that must match between runs, step the simulation in fixed slices (an accumulator that runs `step(1 / 60)` as many times as the elapsed time allows) and draw in between.

## Without paprika3d

To limit the frame rate in a plain page, keep the animation loop running and skip drawing until the target interval has passed since the last drawn frame, measured from the loop's timestamp. In a unit test runner, fake timers (`vi.useFakeTimers()` in Vitest, `jest.useFakeTimers()` in Jest) control `setTimeout`, `setInterval` and `Date`, and `requestAnimationFrame` can be replaced by a function the test calls with chosen timestamps. For React Three Fiber, `@react-three/test-renderer` has `advanceFrames(frames, delta)`, which runs `useFrame` callbacks a given number of times with a chosen `delta`, so a test can run the same component with a long and a short `delta` and compare where it ends up.
