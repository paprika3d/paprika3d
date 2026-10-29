---
title: Test a three.js game with Claude Code
phrase: test a three.js game with claude code
description: How Claude Code tests a three.js game with the paprika3d plugin. It opens the game in headless Chrome on a paused clock, looks at it, presses keys on exact frames and reads the state back as JSON through window.__game.
meta: Test a three.js game with Claude Code: send keys and clicks on a paused clock, read the game state after each step, and save checks that rerun.
intent: test-threejs-game-input
queries:
  - "test three.js game claude code"
  - "How to use Playwright to simulate the click event on a canvas element?"
  - "Three.js application automation using cypress"
  - "Can somebody tell me how to test my 3D model in puppeteer to see how well it works?"
  - "How to write unit tests for three.js?"
  - "How to solve different FPS in requestAnimationFrame on different browsers?"
author: paprika3d agent
date: 2026-10-16
review: weekly
---
# Test a three.js game with Claude Code

## The problem

Claude Code can write a three.js game in one go, but the game is a single `<canvas>`. From the outside it is a picture: Claude Code has no way to see it, press its keys or read its score unless something runs the page for it. Animation frames also follow the display's refresh rate and the machine's load, so a key held for "half a second" moves the player a different distance on each run, and a test written that way gives a different answer each time.

paprika3d is a Claude Code plugin and MCP server that runs the game in its own headless Chrome on a paused clock, where each frame is 1/60 s of game time. With it installed, Claude Code tests a game in a short loop of tool calls: `open` loads the page, `look` pictures it and lists the objects on screen, `interact` presses keys on exact frames, and `observe` reads the game's state as JSON.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

Chrome is found at its usual install path on macOS and Linux, on PATH, or in Playwright's or Puppeteer's cache; anywhere else, set `PAPRIKA3D_CHROME` to the Chrome executable. Then ask Claude Code for the game, or to test a game you already have, in your own words. The plugin's skill has Claude Code open and play the page as it builds. The rest of this guide shows the calls it makes and what comes back.

## The game

Keys work on any page, since paprika3d sends them as real browser events. To get the state back as JSON, the game exposes `window.__game` with `describe()`, `observe()`, `act(input)` and `setState(partial)`, as described on the convention page. Three habits make a game testable:

- State lives in plain variables, apart from the meshes that draw it.
- Real key events and `act({ key, down })` go through the same function.
- Each frame advances the game by its elapsed time, capped at 0.1 s, so the paused clock decides how far the game moves.

This page moves a ball with the arrow keys and jumps on Space:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Jumper</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// Game state lives in plain variables, apart from the meshes that draw it.
const SPEED = 3, JUMP = 6, GRAVITY = 18;   // units per second, units per second, units per second squared
const held = new Set();
let x = 0, y = 0, vy = 0, jumps = 0;

function step(dt) {
  x += ((held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)) * SPEED * dt;
  vy -= GRAVITY * dt;
  y = Math.max(0, y + vy * dt);
  if (y === 0) vy = Math.max(0, vy);
}

// One input path for real keys and for the harness.
function act({ key, down = true }) {
  if (key === ' ' && down && y === 0) { vy = JUMP; jumps++; }   // one-shot: acts on keydown, and only on the floor
  if (down) held.add(key); else held.delete(key);
}
addEventListener('keydown', e => act({ key: e.key }));
addEventListener('keyup', e => act({ key: e.key, down: false }));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x182030);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 9);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 2), new THREE.MeshStandardMaterial({ color: 0x4a6a4a }));
floor.name = 'floor';
floor.position.y = -0.6;
scene.add(floor);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshStandardMaterial({ color: 0xff8030 }));
ball.name = 'ball';
scene.add(ball);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

let last = null;
renderer.setAnimationLoop((now) => {
  step(last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1));   // never more than 0.1 s a frame
  last = now;
  ball.position.set(x, y, 0);
  renderer.render(scene, camera);
});

const round = (n) => +n.toFixed(3);
window.__game = {
  describe: () => ({ name: 'jumper', units: 'world units, y up', keys: { ArrowRight: 'hold to move right', ArrowLeft: 'hold to move left', ' ': 'jump' } }),
  observe: () => ({ x: round(x), y: round(y), vy: round(vy), jumps }),
  act,
  setState: (s) => { ({ x = x, y = y, vy = vy, jumps = jumps } = s); },
};
</script>
</body></html>
```

Save it as `index.html` in the project folder.

## The tool calls, in order

Each call is followed by the reply paprika3d gave for this page on 2026-10-16. Run folder paths are shortened to `<project>`.

**1. Open the game.** The `open` tool serves the folder, loads the page and pauses its clock at frame 0. With `window.__game` present, the reply carries the game's own `describe()`.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:32969/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"name":"jumper","units":"world units, y up","keys":{"ArrowRight":"hold to move right","ArrowLeft":"hold to move left"," ":"jump"},"hasConvention":true}
Procedural geometry: import { geo, scatter } from "./geo.js" (see the skill's geometry reference).
Effects: import { stage, tex, place, sfx, burst, shake, uv } from "./fx.js" (lights and camera, canvas textures, placement, sound, particles; seeded, no files).
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-16T23-20-52-829Z
```

Open once. After Claude Code edits the game, the next tool call reloads the page by itself.

**2. Look at it.** `look` saves a screenshot and lists every named object on screen with its share of the picture and its box in pixels.

```text
look {}

Picture: <project>/paprika3d/runs/2026-10-16T23-20-52-829Z/look-1.png
Pixels: brightness 13%, colour saturation 50%, 0% near black, 0% blown out.
Hues: blue 91%, green 9%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1, no cap); resize handler ran.
On screen (2):
floor 8.7% [0, 614, 1279, 689]
ball 0.71% [592, 542, 687, 639]
Never visible: none
```

**3. Read the starting state.** `observe` returns `observe()` plus a `harness` block: the frame, renderer counts, console errors since the last observe, and what changed.

```text
observe {}

{"x":0,"y":0,"vy":0,"jumps":0,"harness":{"frame":1,"renderer":{"calls":2,"triangles":972,"textures":1,"geometries":2,"programs":2},"scene":{"objects":3,"meshes":2,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

**4. Hold a key for a set number of frames.** Each step advances `frames` frames (default 1). Holding ArrowRight for 30 frames is half a second of game time, at 3 units per second:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 30}, {"key": "ArrowRight", "down": false}]}

{"changed":{"x":1.5}}
```

The reply holds what changed and its new value. The ball moved 1.5 units, as the speed says it should.

**5. Jump, stop at the top, and look in the same call.** A key goes down on one frame and up on the next; `wait` steps frames with no input. With a jump speed of 6 and gravity of 18, the ball stops rising a third of a second after the jump, which is where these steps end. `look: true` adds the picture after the steps to the reply:

```text
interact {"steps": [{"key": " "}, {"key": " ", "down": false}, {"wait": 18}], "look": true}

{"changed":{"y":0.95,"jumps":1}}
Picture: <project>/paprika3d/runs/2026-10-16T23-20-52-829Z/look-2.png
Pixels: brightness 14%, colour saturation 50%, 0% near black, 0% blown out; 2% of the picture changed since the last look.
Hues: blue 90%, green 9%.
On screen (2):
floor 8.8% [0, 614, 1279, 689]
ball 0.71% [735, 452, 831, 547]
Never visible: none
```

The state says the ball is up and to the right, and the ball's box moved up and to the right in the picture, so the game draws what its state says.

**6. Test a rule by hand: no jump in mid-air.** Press Space again at the top of the jump and let the ball fall:

```text
interact {"steps": [{"key": " "}, {"key": " ", "down": false}, {"wait": 40}]}

{"changed":{"y":0}}
```

`jumps` is not in the reply, so it is still 1: the second press was ignored, and the ball landed. Sending the same steps after a reload gives the same values on the same frames, since the clock and `Math.random` are under the harness's control.

## What to read in the reply

- `changed` in an `interact` reply: the values the steps moved, with their new values. A key press that changes nothing is a dead control, and the reply then shows the whole state instead.
- `On screen` in a `look` reply: if the ball's box does not move when its state does, the game is drawing something other than its state.
- `harness.errors` in an `observe` reply: console errors since the last observe. A game that throws on an input shows it here.
- `harness.frame`: the frame count, to confirm how much game time the steps covered.

## Pitfalls

- **One-shot controls act on keydown.** A key can go down and up within one frame, so a jump or a shot that waits for a held key across frames may never fire.
- **Release held keys.** A key sent with no `down: false` step stays held for the following calls.
- **Never read real time.** A game that moves by `Date.now()` deltas read outside the animation frame, or by a fixed amount per frame with no cap, gives different results at a different frame rate. The clock paprika3d installs fakes `requestAnimationFrame`, `performance.now`, `Date` and timers.
- **Randomness.** Use `Math.random`; paprika3d seeds it, so the same steps see the same game.

## Without paprika3d

A browser test can drive the same game. With Playwright or Puppeteer, `page.keyboard.down('ArrowRight')` and `page.keyboard.up('ArrowRight')` send real key events, and `page.evaluate(() => window.__game.observe())` reads the state. To make the result repeatable, the test also needs control of time: Playwright's `page.clock` API can install a fake clock and advance it, or the game can expose a `step(dt)` function the test calls directly with a fixed 1/60 s. For logic alone, keeping the rules in a module with no three.js imports lets a unit test runner such as Vitest call `step` and `act` with no browser at all.
