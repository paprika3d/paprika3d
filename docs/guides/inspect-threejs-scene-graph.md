---
title: Inspect a three.js scene graph and live values from a coding agent
phrase: inspect a three.js scene graph
description: How a coding agent inspects a three.js scene graph from outside the page with the paprika3d plugin: the object tree, world positions, materials, camera and renderer counts read with eval, live values changed and stepped on a paused clock, and the object under a pixel from look.
meta: Inspect a three.js scene graph from a coding agent: the object tree, world positions, materials and renderer counts, read and changed live with paprika3d.
intent: inspect-threejs-scene-graph
queries:
  - "Three.js Developer Tools"
  - "[SOLVED] How to inspect example variables in developer console?"
  - "Explain how to use the extension in the README file"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Inspect a three.js scene graph and live values from a coding agent

## Why the console shows nothing

A three.js page written as an ES module keeps `scene`, `camera` and `renderer` in module scope. Typing `scene` in the browser console gives a `ReferenceError`, because nothing in the module put it on `window`. The three.js developer tools extension shows the scene graph in a browser panel, for a person at the browser. A coding agent works from text: it needs the same tree, positions and values as a reply it can read.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome and finds the page's renderer and scene by itself, with no change to the page. Its `eval` tool runs JavaScript in the page with `scene`, `camera`, `renderer`, `find(name)` and `stats(target)` in scope (and `THREE`, on a page that loads three through an import map), and returns what the code returns. `observe` lists the scene's named objects and the renderer's counts as JSON, and `look` names the object under any pixel.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with a nested scene

A rover made of named parts two levels deep: a body, a mast group holding a pole and a head, and a group of four wheels. Every variable is in module scope. The rover's speed is kept on `rover.userData`, and its heading in a plain `let`, to show the difference.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Rover</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// Everything here is module scope: none of it is on window.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8b48a);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4, 3, 6);
camera.lookAt(0, 0.6, 0);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a4a30, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 8, 3);
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0xb5835a }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// A rover: a group with named parts, nested two levels deep.
const paint = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.3, roughness: 0.5 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x222222 });
const rover = new THREE.Group();
rover.name = 'rover';
const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1.2), paint);
body.name = 'body';
body.position.y = 0.6;
const mast = new THREE.Group();
mast.name = 'mast';
mast.position.set(0.6, 0.85, 0);
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8), paint);
pole.position.y = 0.4;
const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), paint);
head.name = 'head';
head.position.y = 0.9;
mast.add(pole, head);
const wheels = new THREE.Group();
wheels.name = 'wheels';
for (const [x, z] of [[-0.7, 0.7], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]]) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24).rotateX(Math.PI / 2), rubber);
  wheel.name = `wheel ${x < 0 ? 'rear' : 'front'} ${z > 0 ? 'left' : 'right'}`;
  wheel.position.set(x, 0.3, z);
  wheels.add(wheel);
}
rover.add(body, mast, wheels);
rover.userData.speed = 0.4;   // units per second, kept on the object so it can be read and set from outside
scene.add(rover);

let heading = 0;              // a module variable: nothing outside this script can reach it
let last = null;
renderer.setAnimationLoop((now) => {
  const dt = last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1);
  last = now;
  heading += 0.3 * dt;
  mast.rotation.y = Math.sin(heading) * 0.8;
  rover.position.x += rover.userData.speed * dt;
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
</script>
</body></html>
```

## The tool calls, in order

Each call is followed by the reply paprika3d gave for this page on 2026-10-28. Run folder paths are shortened to `<project>`. The machine that captured them has no GPU, which the `GPU` line in the `open` reply says; none of the values below depend on it.

**1. Open the page.** `entities` lists the named objects at the top of the scene.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:36481/index.html in 0.1 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["ground","rover"]}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-15-13-181Z
```

**2. Read the scene as JSON.** On a page with no `window.__game`, `observe` falls back to those named objects, with the renderer's counts and the scene's totals:

```text
observe {}

{"entities":{"ground":{"type":"Mesh","position":[0,0,0]},"rover":{"type":"Group","position":[0,0,0]}},"harness":{"frame":0,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":13,"meshes":8,"lights":2,"cameras":0},"errors":[],"changed":null}}
```

**3. Print the whole tree.** `scene` is in scope in `eval`, so a short walk prints every object with its type, name and geometry:

```text
eval {"code": "const lines = []; const walk = (o, d) => { lines.push(`${'  '.repeat(d)}${o.type} ${o.name || '(no name)'}${o.isMesh ? ' ' + o.geometry.type : ''}`); o.children.forEach(c => walk(c, d + 1)); }; walk(scene, 0); return lines.join('\\n')"}

Scene (no name)
  HemisphereLight (no name)
  DirectionalLight (no name)
  Mesh ground PlaneGeometry
  Group rover
    Mesh body BoxGeometry
    Group mast
      Mesh (no name) CylinderGeometry
      Mesh head BoxGeometry
    Group wheels
      Mesh wheel rear left CylinderGeometry
      Mesh wheel front left CylinderGeometry
      Mesh wheel rear right CylinderGeometry
      Mesh wheel front right CylinderGeometry
```

**4. Read one object.** `find(name)` returns the object with that name at any depth. Its local position is relative to its parent; `getWorldPosition` gives where it is in the scene:

```text
eval {"code": "const h = find('head'); return { parent: h.parent.name, local: h.position.toArray(), world: h.getWorldPosition(new THREE.Vector3()).toArray(), material: { color: '#' + h.material.color.getHexString(), metalness: h.material.metalness, roughness: h.material.roughness } }"}

{"parent":"mast","local":[0,0.9,0],"world":[0.607,1.75,0],"material":{"color":"#e8e8e8","metalness":0.3,"roughness":0.5}}
```

**5. Read the camera and the renderer.**

```text
eval {"code": "return { camera: { position: camera.position.toArray(), fov: camera.fov, near: camera.near, far: camera.far }, render: renderer.info.render, memory: renderer.info.memory }"}

{"camera":{"position":[4,3,6],"fov":45,"near":0.1,"far":100},"render":{"frame":1,"calls":8,"triangles":538,"points":0,"lines":0},"memory":{"geometries":8,"textures":1}}
```

**6. Module variables stay out of reach.** `eval` reaches what the renderer draws, not the script's own variables. `heading` is a `let` in the module, and `speed` lives on the rover:

```text
eval {"code": "return { heading: typeof heading, speed: find('rover').userData.speed }"}

{"heading":"undefined","speed":0.4}
```

A value you want to read or tune from outside belongs on an object in the scene (`userData`), on `window`, or in the page's `window.__game.observe()`.

**7. Change a value and let time run.** The page runs on a paused clock. Code in `eval` that awaits a timer steps the clock until the timer fires, so a second of game time passes in one call:

```text
eval {"code": "const rover = find('rover'); rover.userData.speed = 2; const before = rover.position.x; await new Promise(r => setTimeout(r, 1000)); return { before, after: rover.position.x }"}

{"before":0.007,"after":2.04}
(the code awaited the paused clock, so the harness stepped it 61 frames, 1.02 s of game time, without drawing, until the code finished)
```

`observe` then reports what moved since the last time it was called:

```text
observe {}

{"entities":{"ground":{"type":"Mesh","position":[0,0,0]},"rover":{"type":"Group","position":[2.04,0,0]}},"harness":{"frame":62,"renderer":{"calls":8,"triangles":538,"textures":1,"geometries":8,"programs":1},"scene":{"objects":13,"meshes":8,"lights":2,"cameras":0},"errors":[],"changed":{"entities":{"rover":{"position":[[0,0,0],[2.04,0,0]]}},"harness":{"renderer":{"calls":[0,8],"triangles":[0,538],"textures":[0,1],"geometries":[0,8],"programs":[0,1]}}}}}
```

A change made through `eval` lasts until the page reloads. To keep it, write it into the source.

**8. Measure a subtree.** `stats(name)` reports each mesh under the named object: vertices, triangles, whether it is closed, its volume, its genus and its world size.

```text
eval {"code": "return stats('wheels')"}

total  4 meshes  592 v  384 tri
wheel rear left  148 v  96 tri  closed  vol 0.056  genus 0  size 0.6×0.6×0.2  [position, normal, uv]
wheel front left  148 v  96 tri  closed  vol 0.056  genus 0  size 0.6×0.6×0.2  [position, normal, uv]
wheel rear right  148 v  96 tri  closed  vol 0.056  genus 0  size 0.6×0.6×0.2  [position, normal, uv]
wheel front right  148 v  96 tri  closed  vol 0.056  genus 0  size 0.6×0.6×0.2  [position, normal, uv]
```

**9. Ask what is under a pixel.** `look` with `at` lists the objects drawn at each point, nearest first, with the distance from the camera and the point hit in world space. It returns text and no picture:

```text
look {"at": [[640, 400], [100, 700]]}

At (640, 400): body 6.84 m at [0.4, 0.84, 0.6]; behind it wheel rear right 8.37 m; then ground 9.49 m; background beyond.
At (100, 700): ground 5.83 m at [-0.6, 0, 4.05]; background beyond.
```

`look` with `target` pictures one object alone from the front, right, top and a three-quarter angle, and gives its size and centre:

```text
look {"target": "rover"}

Picture: <project>/paprika3d/runs/2026-10-28T05-15-13-181Z/look-1-views.png (front, right, top, three-quarter)
rover: size 2 × 1.85 × 1.6, centre [2.04, 0.925, 0]
```

## What to read in the replies

- `open`, `entities`: the named objects at the top of the scene, at frame 0.
- `observe`: named objects with their type and position, `harness.renderer` (draw calls, triangles, textures, geometries and shader programs of the last frame), `harness.scene` (object, mesh, light and camera totals), `errors`, and `changed` since the last `observe`.
- `eval`: whatever the code returns, as JSON or text. Replies are capped at 2,048 characters; the full text is saved in the run folder.
- `look` `at`: the object under a pixel, its distance and the world point.

## Pitfalls

- **Name what you want to find.** `find`, `observe`, `look` and `stats` work by name. An unnamed mesh appears as `(Mesh)` or under its nearest named parent.
- **Keep tunable values reachable.** A module `let` cannot be read from outside the module; `userData`, `window` or `window.__game` can.
- **Use `getWorldPosition` for where a child is.** `position` is relative to the parent; the head above sits at y 0.9 in its group and at y 1.75 in the world.
- **Return plain values.** `eval` returns JSON, so return arrays and numbers (`position.toArray()`) rather than whole three.js objects.
- **paprika3d reads the page; it is not an editor.** It has no panel or tree view, and nothing it changes through `eval` survives a reload.

## Without paprika3d

In the page, `window.scene = scene` (and the same for `camera` and `renderer`) makes them reachable from the browser console; remove it before shipping if you prefer not to expose them. `scene.traverse((o) => console.log(o.type, o.name))` prints the tree, and `scene.getObjectByName(name)` is what `find` does. `renderer.info` holds the draw calls, triangles and GPU memory counts. The three.js developer tools extension works through a hook three.js keeps for it: when a `__THREE_DEVTOOLS__` event target exists on the page, each new `Scene` and `WebGLRenderer` sends it an `observe` event with the object, which a panel can then list.
