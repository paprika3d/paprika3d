---
title: ChatGPT three.js code not working? Run it, and read which lines are out of date
phrase: chatgpt three.js code not working
description: Why three.js code from ChatGPT, Copilot or another AI code generator throws, silently does nothing or draws a black scene, and how a coding agent runs it with the paprika3d plugin's open tool, which names each removed three.js API by file and line, sees the result with look, tries a fix with eval, and keeps each working feature as a check that names the next change that breaks it.
meta: ChatGPT or Copilot three.js code not working? Run it, see which lines use removed three.js API, and check the scene it draws before you trust it.
intent: chatgpt-copilot-threejs-code-does-not-work
queries:
  - "Amazing, I use `Github Copilot` to write `Three.js` code"
  - "Three.js AI code generator"
  - "AI - trustworthy or not?"
  - "Using ChatGPT AI and Three.JS to Help Code 3D Games"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# ChatGPT three.js code not working? Run it, and read which lines are out of date

## Why generated three.js code breaks

A language model writes three.js the way the examples it learned from were written, and three.js removes API often: `THREE.Geometry` went in r125, the `examples/js` scripts in r148, `outputEncoding` and `sRGBEncoding` in r162, `physicallyCorrectLights` in r160, and since r155 light intensities are in physical units. An answer can mix code from several of those eras. It reads well, and it fails in one of three ways:

- **It throws.** A removed class is `undefined`, so `new THREE.Geometry()` stops the whole module, and the page stays black. This one at least leaves an error to paste back into the chat.
- **It runs, and a line does nothing.** Setting a property three.js no longer has is not an error. `renderer.outputEncoding = THREE.sRGBEncoding` sets a property nobody reads, and nothing in the console says so.
- **It runs and draws, wrongly.** A value tuned for an older default, such as a light intensity of 1, now gives a scene too dark to see. There is no error at all; you find it by looking.

The model that wrote the code never saw the page. paprika3d is a Claude Code plugin and MCP server that gives a coding agent the page: `open` runs it in its own headless Chrome and reports the console errors and each use of removed three.js API by file and line, `look` returns the picture with the objects on screen, and `eval` tries a change in the running page. The same tools work for code the agent wrote itself and for code you paste in from a chat.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

In VS Code with Copilot's agent mode, Cursor or another MCP client, register the npm package as a stdio server instead (`npx -y paprika3d serve`); the tools are the same, and the skill and hooks are Claude Code's.

## The code as it came back

Asked for "a blue planet in space with stars and orbit controls", an AI answer of the kind the threads quote. It loads three r186 through an import map, the release `npm install three` gives today, and uses API from three earlier eras:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Planet</title>
<style>html,body{margin:0;overflow:hidden;background:#000}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// Planet
const planet = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.MeshStandardMaterial({ color: 0x3366ff, roughness: 0.6 })
);
planet.name = 'planet';
scene.add(planet);

// Stars
const starGeometry = new THREE.Geometry();
for (let i = 0; i < 2000; i++) {
  starGeometry.vertices.push(new THREE.Vector3(
    (Math.random() - 0.5) * 200,
    (Math.random() - 0.5) * 200,
    (Math.random() - 0.5) * 200
  ));
}
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 }));
stars.name = 'stars';
scene.add(stars);

// Light
const light = new THREE.PointLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

function animate() {
  requestAnimationFrame(animate);
  planet.rotation.y += 0.005;
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); none of what follows depends on frame times. Run folder paths are shortened to `<project>`, the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out, and the second `look` in step 3 is cut to the lines that changed, with nothing reworded.

**1. Open it.** One call gives the error and every line that uses removed API, each with what replaced it:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:46347/index.html in 3.6 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
The page took 3.6 s to its first frame; expected on this software renderer, nothing to do.
index.html:31 uses THREE.Geometry, removed in r125: use BufferGeometry
index.html:16 uses outputEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:16 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:17 uses physicallyCorrectLights, deprecated in r150 and removed in r160: use nothing: lights are physically correct by default since r155
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["planet"]}
Errors so far:
THREE.Geometry is not a constructor (index.html:31:22)
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-07-27-456Z

look {}

look: the game has not drawn a three.js scene after 5 s of stepping frames; if it is still loading or building, step it with `interact` { steps: [{ wait: frames }] } and look again
```

The console has one error, the one a person would paste back into the chat. The four lines above it are the rest of the answer's problems, read from the source: two of them throw nothing and would have stayed. `entities` lists the planet and not the stars, because the module stopped at line 31, before the stars were made.

**2. Fix the four lines and look again.** The stars become a `BufferGeometry` with a `position` attribute, and the two renderer lines go: r186 already outputs sRGB and uses physical lights. `open` now reports no error and no stale line, and the planet is on screen:

```text
look {"sample": [[640, 400], [600, 330]]}

Picture: <project>/paprika3d/runs/2026-10-28T10-08-00-626Z/look-1.png
Pixels: brightness 0%, colour saturation 5%, 100% near black, 0% blown out. Mostly black: a blank or unlit frame?
Hues: grey 100% of the frame; over the objects (6.4% of it): grey 100%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Lighting: no tone mapping (renderer.toneMapping is NoToneMapping): bright colours clip to white; ACESFilmicToneMapping, AgXToneMapping or NeutralToneMapping avoid it, and ACES also mutes saturated colours, which a bright stylised look may not want.
On screen (2):
planet 6.1% [499, 259, 780, 540]
stars 0.26% [0, 4, 1277, 784]
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (640, 400) #000002, (600, 330) #000002.
```

The planet covers 6.1% of the frame and its pixels are `#000002`: drawn, and black. This is the third kind of failure, the one with no error and no stale line, and the picture is what shows it.

**3. Find why, and try the fix in the page.** `eval` reads the light the answer made:

```text
eval {"code": "const light = scene.children.find(o => o.isPointLight);\nreturn { intensity: light.intensity, decay: light.decay, distance: +light.position.distanceTo(find('planet').position).toFixed(2) }"}

{"intensity":1,"decay":2,"distance":17.32}
```

Since r155 a point light's intensity is in candela and falls off with the square of the distance (`decay` 2), so 1 candela at 17.32 units lights almost nothing; under the old units the same number was a working light. Trying a value takes one call, and the change lasts until the page reloads:

```text
eval {"code": "scene.children.find(o => o.isPointLight).intensity = 300;\nawait new Promise(r => requestAnimationFrame(r));\nreturn 'ok'"}

ok
(the code awaited the paused clock, so the harness stepped it 1 frames, 0.02 s of game time, without drawing, until the code finished)

look {"sample": [[640, 400], [600, 330]]}

Pixels: brightness 1%, colour saturation 4%, 95% near black, 0% blown out; 5% of the picture changed since the last look. Mostly black: the objects cover 6.4% of the frame.
Hues: grey 96% of the frame; over the objects (6.4% of it): blue 65%, grey 35%.
Colours (5 × 5 mean, in the page's pixels): (640, 400) #192e75, (600, 330) #182e79.
```

The planet is blue, and the "mostly black" line now gives the reason as the space around it, which is the scene asked for. The `Lighting:` line about tone mapping stays open; whether to add tone mapping is a choice about the look, not a fault in the answer.

## The page, fixed

The same page with the four lines fixed, the light at the value tried above, and a small `window.__game` object so its state can be read and checked:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Planet</title>
<style>html,body{margin:0;overflow:hidden;background:#000}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// Planet
const planet = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.MeshStandardMaterial({ color: 0x3366ff, roughness: 0.6 })
);
planet.name = 'planet';
scene.add(planet);

// Stars
const positions = new Float32Array(2000 * 3);
for (let i = 0; i < positions.length; i++) positions[i] = (Math.random() - 0.5) * 200;
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 }));
stars.name = 'stars';
scene.add(stars);

// Light
const light = new THREE.PointLight(0xffffff, 300); // candela since r155: 1 is a faint glow at this distance
light.position.set(10, 10, 10);
scene.add(light);

function animate() {
  requestAnimationFrame(animate);
  planet.rotation.y += 0.005;
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.__game = {
  describe: () => ({ name: 'planet', units: 'world units', mouse: 'drag to orbit, wheel to zoom' }),
  observe: () => ({ cameraDistance: +camera.position.length().toFixed(2), planetTurn: +planet.rotation.y.toFixed(3) }),
  setState: ({ planetTurn }) => { if (planetTurn !== undefined) planet.rotation.y = planetTurn; },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
</body></html>
```

## Keep it working through the next answer

The "AI keeps breaking my scene" complaint comes after the first answer works: each later request comes back as a rewrite, and a rewrite can drop something that worked. `interact` with `save` keeps a feature as a check once it passes. Zooming out with the wheel and the planet turning, each in one call:

```text
interact {"steps": [{"wheel": 400, "x": 640, "y": 400}, {"wait": 10}], "expect": {"cameraDistance": [5.5, 50]}, "save": "zoom-out"}

{"changed":{"cameraDistance":6.14,"planetTurn":0.06}}
wheel at (640, 400): over planet (Mesh, 4 units)
Expect: cameraDistance 6.14 ✓
Saved check "zoom-out" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

interact {"steps": [{"wait": 60}], "expect": {"planetTurn": [0.2, 1]}, "save": "planet-turns"}

{"changed":{"planetTurn":0.305}}
Expect: planetTurn 0.305 ✓
Saved check "planet-turns" in game-tests.json (2 checks now); `test` reruns them all, each from a fresh reload.
```

The next request is "make the camera slowly circle the planet", and the answer adds four lines to the loop that set the camera's position every frame at a fixed radius:

```diff
+let angle = 0;
 function animate() {
   requestAnimationFrame(animate);
   planet.rotation.y += 0.005;
+  angle += 0.002;
+  camera.position.x = Math.sin(angle) * 5;
+  camera.position.z = Math.cos(angle) * 5;
+  camera.lookAt(0, 0, 0);
```

The camera circles, and the page looks right. The saved checks say what else changed:

```text
test {}

✗ zoom-out: cameraDistance 5, expected 5.5 to 50
✓ planet-turns
1 of 2 saved checks passed in 1.8 s
```

The new lines put the camera back at radius 5 every frame, so the wheel no longer zooms. In Claude Code the after-edit hook runs these checks by itself after each batch of edits and speaks when one starts failing, so the agent hears about the zoom at the edit that broke it, not from you later. A check needs `observe` to report the value it tests and `setState` to exist, which is what the small `window.__game` object above is for.

## What paprika3d does not do

- **It does not make the model write current three.js.** It runs the code and reports what happened; the fix is still written by the agent or by you.
- **The stale-API lines are a fixed list.** They name `THREE.Geometry`, `examples/js`, `outputEncoding` and `sRGBEncoding`, `physicallyCorrectLights`, `useLegacyLights`, React Three Fiber 8's per-element prop types (removed in 9), an `EffectComposer` with no `OutputPass`, and a project whose three.js is older than the current release. Other changes between releases, like the light units in step 3, have no line of their own; the picture and `eval` are how they show.
- **It works where the files are.** paprika3d is a local MCP server for an agent working in a project folder. A chat in a browser tab does not run it, so code from a chat goes into a file in a project, where an agent with the tools can open it.
- **It does not judge the code.** Whether the answer is well structured, secure or licensed correctly is for reading, not for running.

## Without paprika3d

Put the answer in an `index.html`, serve the folder over HTTP (`npx vite` or any static server; a page opened as a file cannot import modules), and keep the browser's console open while it loads. Before trusting an answer, check its imports against the three.js release you installed: each release's removals are listed on the three.js migration guide in the project's GitHub wiki, and searching the answer for `Geometry(`, `examples/js`, `Encoding` and `physicallyCorrectLights` finds the commonest ones. State your release in the prompt ("three.js r186, ES modules, an import map") and ask for no API removed before it. When the page runs with no error and shows nothing, look at it before reading more code: a black object, an object off screen and an object that never loaded are three different fixes.
