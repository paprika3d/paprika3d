---
title: Unit test a three.js app in a real browser, with checks that rerun after every edit
phrase: unit test a three.js app
description: How a coding agent unit tests a three.js app with the paprika3d plugin: the rules kept in plain functions, each behaviour played in real headless Chrome with interact, checked with expect, saved to game-tests.json, and rerun from a fresh reload by test and after every edit, so a refactor that breaks a rule shows up as one failing line.
meta: Unit test a three.js app in a real browser: plain functions for the rules, saved interaction checks for behaviour, rerun after every edit.
intent: unit-test-threejs-app
queries:
  - "How to write unit tests for three.js?"
  - "How does everyone unit test their code?"
  - "How To Unit Test THREE.JS"
  - "Unit testing a ThreeJS application with Jest"
  - "Error creating WebGL context. @react-three/test-renderer"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Unit test a three.js app in a real browser, with checks that rerun after every edit

## Why three.js tests break under a test runner

A unit test runner such as Jest or Vitest runs in Node, usually with jsdom standing in for the browser. jsdom has no WebGL, so `new THREE.WebGLRenderer()` throws "Error creating WebGL context" and the test never reaches the code it meant to test. The common ways out each give something up. Mocking the renderer tests the mock. A WebGL package for Node offers WebGL 1, which current three.js no longer runs on. Testing the math alone (vectors, a bounding box) leaves out the part that breaks in practice: an input that reaches the rules, and a scene that draws what the rules say.

Two layers answer this. Keep the rules (movement, collisions, scoring) in plain functions and data with no three.js in them, and any runner can test them in Node. Then test the app as a whole, input to state, in a real browser.

paprika3d is a Claude Code plugin and MCP server that does the second layer in its own headless Chrome, on a paused clock where each frame is 1/60 s. Its `interact` tool plays keys, clicks and touches, and its `expect` input checks the state after them; `save` keeps the call as a named check in `game-tests.json`. The `test` tool reruns every saved check from a fresh reload at frame 0, and in Claude Code a hook reruns them after each batch of edits.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The app

A small vault puzzle on a grid: the player steps one tile per arrow key, a column of walls blocks the way, and each coin is worth 10. The rules are a state object and one `act` function; the three.js part draws the state and nothing else. The page exposes `window.__game` (`describe`, `observe`, `act`, `setState`), the convention paprika3d reads the state through.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Vault</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// The rules: plain data and functions, no three.js in them.
const WALLS = ['2,0', '2,1', '2,-1'];
const START = { player: { x: 0, z: 0 }, coins: [{ x: 1, z: 1 }, { x: 4, z: 0 }], score: 0, moves: 0 };
let state = structuredClone(START);
const DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function act({ key, down = true }) {
  const d = DIRS[key];
  if (!d || !down) return;
  const x = state.player.x + d[0], z = state.player.z + d[1];
  if (WALLS.includes(`${x},${z}`)) return;           // a wall: no move
  state.player = { x, z };
  state.moves++;
  const hit = state.coins.findIndex(c => c.x === x && c.z === z);
  if (hit >= 0) { state.coins.splice(hit, 1); state.score += 10; }
}
addEventListener('keydown', e => act({ key: e.key }));

// The view: draws whatever the state says.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14181f);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(1.5, 7, 6);
camera.lookAt(1.5, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2.5));
const floor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x2c3440 }));
floor.name = 'floor';
floor.position.set(1.5, -0.6, 0);
scene.add(floor);
const walls = new THREE.Group();
walls.name = 'walls';
for (const w of WALLS) {
  const [x, z] = w.split(',').map(Number);
  const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x7a5a40 }));
  block.position.set(x, 0, z);
  walls.add(block);
}
scene.add(walls);
const player = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.MeshStandardMaterial({ color: 0x40c0ff }));
player.name = 'player';
scene.add(player);
const coins = new THREE.Group();
coins.name = 'coins';
scene.add(coins);
const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24).rotateX(Math.PI / 2);
const gold = new THREE.MeshStandardMaterial({ color: 0xffc030, roughness: 0.4 });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  player.position.set(state.player.x, 0, state.player.z);
  while (coins.children.length > state.coins.length) coins.remove(coins.children[0]);
  while (coins.children.length < state.coins.length) coins.add(new THREE.Mesh(coinGeo, gold));
  state.coins.forEach((c, i) => coins.children[i].position.set(c.x, 0, c.z));
  renderer.render(scene, camera);
});

window.__game = {
  describe: () => ({ name: 'vault', units: 'tiles, x right, z toward the camera', keys: { ArrowRight: 'step right', ArrowLeft: 'step left', ArrowUp: 'step away', ArrowDown: 'step toward the camera' }, rules: 'walls block a step; a coin is worth 10' }),
  observe: () => structuredClone(state),
  act,
  setState: (s) => { state = { ...state, ...structuredClone(s) }; },
};
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); the checks read state, which does not depend on the renderer. Run folder paths are shortened to `<project>`.

**1. Open the app.** With `window.__game` present, the reply carries `describe()`, rules included:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:46013/index.html in 0.1 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"name":"vault","units":"tiles, x right, z toward the camera","keys":{"ArrowRight":"step right","ArrowLeft":"step left","ArrowUp":"step away","ArrowDown":"step toward the camera"},"rules":"walls block a step; a coin is worth 10"}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-45-14-665Z
```

(The reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out here.)

**2. Write each behaviour as a check.** A call with `save` plays its steps from a fresh reload, checks `expect` against `observe()` after them, and keeps the call when every entry holds, and not otherwise. Keys in `expect` are dotted paths into the state, so `coins.length` and `coins.0.x` reach into the list.

A coin picked up on the second step:

```text
interact {"steps": [{"key": "ArrowDown"}, {"key": "ArrowRight"}], "expect": {"player.x": 1, "player.z": 1, "score": 10, "coins.length": 1}, "save": "coin-pickup"}

{"changed":{"player":{"x":1,"z":1},"coins":[{"x":4,"z":0}],"score":10,"moves":2}}
Expect: player.x 1 ✓ · player.z 1 ✓ · score 10 ✓ · coins.length 1 ✓
Saved check "coin-pickup" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.
```

The wall stops the second step to the right, and a blocked step does not count as a move:

```text
interact {"steps": [{"key": "ArrowRight"}, {"key": "ArrowRight"}], "expect": {"player.x": 1, "moves": 1}, "save": "wall-blocks"}

{"changed":{"player":{"x":1},"moves":1}}
Expect: player.x 1 ✓ · moves 1 ✓
Saved check "wall-blocks" in game-tests.json (2 checks now); `test` reruns them all, each from a fresh reload.
```

A check can start from a set-up moment instead of walking there. A `state` step at the start calls `setState`, here putting the player beside the far coin, and becomes the check's setup:

```text
interact {"steps": [{"state": {"player": {"x": 3, "z": 0}}}, {"key": "ArrowRight"}], "expect": {"player.x": 4, "score": 10, "coins.0.x": 1}, "save": "far-coin"}

{"changed":{"player":{"x":4},"coins":[{"x":1,"z":1}],"score":10,"moves":1}}
Expect: player.x 4 ✓ · score 10 ✓ · coins.0.x 1 ✓
Saved check "far-coin" in game-tests.json (3 checks now); `test` reruns them all, each from a fresh reload.
```

**3. Run them all.**

```text
test {}

✓ coin-pickup
✓ wall-blocks
✓ far-coin
3 of 3 saved checks passed in 0.5 s
```

**4. Break a rule in a refactor.** The walls move into a `Set`, and the lookup key is built with a space where the stored keys have a comma:

```diff
-const WALLS = ['2,0', '2,1', '2,-1'];
+const WALLS = new Set(['2,0', '2,1', '2,-1']);
-  if (WALLS.includes(`${x},${z}`)) return;           // a wall: no move
+  if (WALLS.has([x, z].join(" "))) return;           // a wall: no move
```

The page still loads with no error, and the walls still draw, since the drawing code loops over the same set. `test` names the rule that broke and the values it got:

```text
test {}

✓ coin-pickup
✗ wall-blocks: player.x 2, expected 1; moves 2, expected 1
✓ far-coin
2 of 3 saved checks passed in 0.5 s
```

A picture of the page at this point shows nothing wrong. All three walls are on screen, and the `Surface` line is about the plain floor, not about a rule:

```text
look {}

Picture: <project>/paprika3d/runs/2026-10-28T05-45-14-665Z/look-1.png
Pixels: brightness 11%, colour saturation 42%, 0% near black, 0% blown out. Dark: a viewer sees little.
Hues: grey 60%, blue 36% of the frame; over the objects (41.2% of it): blue 87%, orange 9%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Surface: "floor" covers 37% with almost no detail (0.07 of 255): it reads as flat colour. Unless the user asked for flat colour, add texture, normal detail or lighting variation.
On screen (7):
floor 37% [135, 237, 1144, 737] 8 × 6 units
walls ×3 3.4% [640, 256, 762, 563]
player 0.54% [440, 358, 524, 441]
coins ×2 0.49% [550, 376, 934, 507]
Never visible: none
```

**5. Fix it and rerun.** With the comma back in the key:

```text
test {}

✓ coin-pickup
✓ wall-blocks
✓ far-coin
3 of 3 saved checks passed in 0.5 s
```

## The saved file

`game-tests.json` sits in the project folder, beside the page, and holds each check's setup, steps and expectations. The `wall-blocks` entry:

```json
{
  "id": "wall-blocks",
  "title": "wall-blocks",
  "state": {},
  "actions": [
    { "key": "ArrowRight" },
    { "key": "ArrowRight" }
  ],
  "frames": 0,
  "expect": [
    { "path": "player.x", "op": "==", "value": 1 },
    { "path": "moves", "op": "==", "value": 1 }
  ]
}
```

Commit it with the code. Write checks with `interact` rather than by hand: a call with `save` is not kept unless it passes, so every check in the file passed once.

## What `expect` takes

- A number, string or boolean: equal.
- `[min, max]`: a range, for values that settle near a number (`"player.y": [1.9, 2.1]`). Two numbers in a list are always a range.
- A list of other values: one of them (`["idle", "walk"]`).
- `null`: the path exists.

A check that has to wait for something uses an `until` step, which steps one frame at a time until the state holds and says the frame.

## After each edit

In Claude Code, the plugin's after-edit hook reruns the saved checks after each batch of edits and stays silent unless one starts or stops failing. An agent that breaks `wall-blocks` while working on something else hears about it in the same turn, without calling `test`.

## What paprika3d does not do

- It is not a Jest or Vitest runner, and paprika3d documents no command for running the checks in a CI pipeline. They run through the MCP server, in an agent session.
- It checks state through `window.__game.observe()`, not pixels. Whether the scene draws the state is a `look` question (the objects on screen, their boxes), and picture comparison is `look` with `save` and `compare`.
- It does not test the rules apart from the page. Pure functions are still faster to test with a Node runner.

## Pitfalls

- **Rules inside the render loop are hard to test anywhere.** Keep them in functions that take the state and an input, and let the loop draw.
- **Make `observe()` plain JSON.** Return numbers, strings, lists and objects, not three.js vectors or meshes.
- **Let `setState` set what a check needs.** A check that starts from a set-up moment is shorter and breaks when its own rule breaks, not when the walk to it changes.
- **One input path.** Real key events and `act({ key })` should go through the same function, so a check that sends keys tests what a player does.

## Without paprika3d

For the rules alone, import the pure functions into Vitest or Jest and call them; they need no browser. For a React Three Fiber scene graph, `@react-three/test-renderer` renders the component tree without WebGL and lets a test read the objects it created and fire events on them, though not draw them. For a whole app in a real browser, a Playwright or Puppeteer test can open the page, send `page.keyboard.press('ArrowRight')`, and read `window.__game.observe()` with `page.evaluate`; give it a fixed time step or a fake clock, as the page's frame timing otherwise varies with the machine.
