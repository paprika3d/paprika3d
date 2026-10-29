---
title: three.js shadows not showing? Check four switches, then the shadow camera
phrase: three.js shadows not showing
description: Why three.js shadows do not render, or render in a small square around the origin and nowhere else, and how a coding agent reads the four shadow switches in one eval call and gets the casters outside a directional light's shadow camera named, with its extent, from the paprika3d plugin's look reply.
meta: three.js shadows not showing? Check the four shadow switches, then whether the object sits inside the light's shadow camera.
intent: threejs-shadows-not-showing
queries:
  - "ThreeJS shadow not rendering"
  - "Directional light not showing shadows"
  - "Three.js - Why shadow only show in a small area"
  - "Shadows are cut off"
  - "React-fiber-three cast shadows not working"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js shadows not showing? Check four switches, then the shadow camera

## Why a shadow does not show

A three.js shadow needs four switches on, and all four are off by default:

1. `renderer.shadowMap.enabled = true` on the renderer. In React Three Fiber this is the `shadows` prop on `<Canvas>`.
2. `light.castShadow = true` on a `DirectionalLight`, `SpotLight` or `PointLight`. Ambient and hemisphere lights never cast.
3. `mesh.castShadow = true` on each mesh that throws a shadow. On a loaded glTF model this is each child mesh, not the root group, so traverse the model and set it on every mesh.
4. `mesh.receiveShadow = true` on each mesh the shadow falls on, usually the ground.

With all four on, a `DirectionalLight` still draws shadows inside its shadow camera and nowhere else: an orthographic box that by default spans 10 × 10 units around the light's target. A caster outside that box throws no shadow, and a shadow that crosses its edge is cut off with a straight line. This is the thread about a shadow that shows in a small area: the scene is bigger than ten units and the shadow camera was never sized to it.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Every `look` reply checks each shadow-casting light against the meshes on screen and names the casters that fall outside its shadow camera, with the edge each one is past and the camera's extent, position and direction. The four switches have no line of their own; `eval` reads them all in one call.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A courtyard with missing shadows

A statue, a bench and three trees on a 40-unit floor, lit by a sun that casts. Every switch is set except one: the bench never got `castShadow`. The sun's shadow camera is left at its default size.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Courtyard</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;                  // switch 1: the renderer draws shadow maps
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8cc);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 13, 23);
camera.lookAt(1, 0, 3);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1));

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.name = 'sun';
sun.position.set(10, 20, 10);
sun.castShadow = true;                              // switch 2: this light casts
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0xb8b0a0 }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;                         // switch 3: this mesh shows shadows
scene.add(floor);

const stone = new THREE.MeshStandardMaterial({ color: 0x8a8f99 });
const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 4, 24), stone);
statue.name = 'statue';
statue.position.set(0, 2, 0);
statue.castShadow = true;                           // switch 4: this mesh casts
scene.add(statue);

const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 1), stone);
bench.name = 'bench';
bench.position.set(-3.5, 0.4, 3);
scene.add(bench);

const trees = new THREE.Group();
trees.name = 'trees';
const leaves = new THREE.MeshStandardMaterial({ color: 0x3f7a3a });
for (const [name, x, z] of [['oak', -7, 5], ['pine', 13, 5], ['fir', 6, 11.5]]) {
  const tree = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 16), leaves);
  tree.name = name;
  tree.position.set(x, 2.5, z);
  tree.castShadow = true;
  trees.add(tree);
}
scene.add(trees);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew the page in software (SwiftShader); shadow maps are drawn the same way on a GPU. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page and look.** In the picture the statue has a shadow and the three trees and the bench have none. The reply says why for the trees:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:39419/index.html in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["sun","floor","statue","bench","trees"]}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T06-09-22-787Z/look-1.png
Lighting: shadow light "sun": 3 shadow casters on screen are outside its shadow camera (no shadow): oak (past its +z edge), pine (past its +x edge), fir (past its +x edge). It covers 10 × 10 units across, from 0.5 to 500 units in front of (10, 20, 10) along (-0.4, -0.8, -0.4). Widen light.shadow.camera, move the light and its target with the player, or stage().fit(object) from fx.js.
On screen (6):
floor 69% [0, 146, 1279, 799] 40 × 40 units
fir 2.7% [833, 418, 999, 693]
oak 1.6% [264, 271, 393, 490]
pine 1.6% [1032, 253, 1163, 464]
statue 0.86% [570, 214, 634, 363]
bench 0.49% [415, 369, 532, 415] 3 × 1 units, across the view
Never visible: none
```

The line names the light, the three casters and the side each one falls out on, and gives the numbers to change: the box is 10 × 10 units, which is the default, while the floor is 40 × 40.

**2. Read the four switches.** The bench is inside the shadow camera and still has no shadow, and no line names it. One `eval` reads every switch in the scene:

```text
eval {"code": "const lights = [], meshes = [];\nscene.traverse((o) => {\n  if (o.isLight && 'castShadow' in o) lights.push(`${o.name || o.type}: cast ${o.castShadow}`);\n  if (o.isMesh) meshes.push(`${o.name}: cast ${o.castShadow}, receive ${o.receiveShadow}`);\n});\nreturn { shadowMap: renderer.shadowMap.enabled, lights, meshes }"}

{"shadowMap":true,"lights":["HemisphereLight: cast false","sun: cast true"],"meshes":["floor: cast false, receive true","statue: cast true, receive false","bench: cast false, receive false","oak: cast true, receive false","pine: cast true, receive false","fir: cast true, receive false"]}
```

`bench: cast false` is the missing switch. On a page where no shadow shows at all, this same call is the first one to make: a `false` for `shadowMap`, for the sun, or for the floor's `receive` explains it.

**3. Try the wider camera in the page.** `eval` changes the live scene without touching the source. A shadow camera changed after the first frame needs `updateProjectionMatrix()`; set before the first render, three applies it by itself.

```text
look {"zoom": [780, 300, 1180, 700]}

Picture: <project>/paprika3d/runs/2026-10-28T06-09-22-787Z/look-2-zoom.png ([780, 300, 1180, 700] at 2×) of the live page at frame 1, not a saved picture or sheet

eval {"code": "const sun = find('sun'), cam = sun.shadow.camera;\nObject.assign(cam, { left: -16, right: 16, top: 16, bottom: -16 });\ncam.updateProjectionMatrix();\nreturn { left: cam.left, right: cam.right, mapSize: sun.shadow.mapSize.x }"}

{"left":-16,"right":16,"mapSize":512}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T06-09-22-787Z/look-3.png
Pixels, Hues, Stands out: as the last look; 1% of the picture changed since it.
On screen (6):
floor 69% [0, 146, 1279, 799] 40 × 40 units
```

The zoom before the change is fir and pine enlarged with bare floor around them; after it, the `Lighting:` line is gone and both trees throw shadows. The reply also shows the cost of the wider box: the shadow map is still 512 pixels on a side, now spread over 32 units instead of 10, so each shadow pixel covers about three times the ground and the edges blur. A sharper shadow takes a bigger map, and three makes a new one when the old one is dropped:

```text
eval {"code": "const sun = find('sun');\nsun.shadow.mapSize.set(2048, 2048);\nsun.shadow.map?.dispose();\nsun.shadow.map = null;   // three makes a new map at the new size on the next render\nfind('bench').castShadow = true;\nreturn sun.shadow.mapSize.x"}

2048
```

**4. Write the fix and look again.** The lines that go into the source, after `sun.castShadow = true` and the bench:

```js
// The shadow camera covers the courtyard, and the map has the pixels to cover it sharply.
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
sun.shadow.mapSize.set(2048, 2048);
bench.castShadow = true;
```

The next `look` after the edit reloads the page and says which fault line the edit closed:

```text
look {}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Picture: <project>/paprika3d/runs/2026-10-28T06-09-50-203Z/look-2.png
Closed since the last look: Lighting: shadow light "sun": 3 shadow casters on screen are outside its shadow camera (no shadow): oak (past its +z edge), pine (past its +x edge), fir (past its +x edge). It covers 10 × 10 units across, from 0.5 to 500 units in front of (10, 20, 10) along (-0.4, -0.8, -0.4). Widen light.shadow.camera, move the light and its target with the player, or stage().fit(object) from fx.js.
```

`near` and `far` are tightened in the same edit. The default far plane of 500 units spreads the depth map's precision over far more depth than a courtyard needs, which shows as shadow acne, stripes on lit surfaces; a range that just holds the scene keeps the depth values close together.

**5. Count what casts.** `perf` with `costs` lists each named group's triangles and how many of them cast shadows. Its frame times on this machine come from a software renderer, as its first line says, and are not used here; the counts are the same on any machine:

```text
perf {"costs": true}

294.3 ms median frame (p95 756.4 ms, 3 fps on average), 11 draw calls, 410 triangles, 0 MB assets; over budget: frameMs 294.3 of 16.7 ms; desktop budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Costs by named group: the main scene's visible objects, each under its nearest named ancestor as `look` names it, counted, not timed, and with no frustum culling (the frame draws only what its camera sees, plus a shadow pass per casting light); `variants` with `hide` times a group. In all 206 triangles, 204 casting shadows, 6 draw calls, 0 MB of textures (the first line's 410 triangles and 11 draw calls are the frame as drawn, the camera's view plus the shadow pass):
  statue: 96 triangles, 96 casting shadows, 1 draw calls, 0 MB of textures
  oak: 32 triangles, 32 casting shadows, 1 draw calls, 0 MB of textures
  pine: 32 triangles, 32 casting shadows, 1 draw calls, 0 MB of textures
  fir: 32 triangles, 32 casting shadows, 1 draw calls, 0 MB of textures
  bench: 12 triangles, 12 casting shadows, 1 draw calls, 0 MB of textures
  floor: 2 triangles, 0 casting shadows, 1 draw calls, 0 MB of textures
```

Six meshes drawn by the camera and five more in the sun's shadow pass make the 11 draw calls. In a large scene this table is where a forgotten `castShadow` on thousands of small props shows up.

## What the line checks, and what it leaves out

The shadow caster line looks at each light with `castShadow` that has one shadow camera (directional and spot lights; a point light's shadow is a cube of six). It counts a mesh with `castShadow` when it is on screen and its whole bounding box falls outside the shadow camera, past one of its four sides or beyond its far plane. A caster partly inside gets a shadow cut at the edge, and the line does not count it; `zoom` on its box shows the cut. Casters farther from the view than the shadow camera can reach are also left out, so a shadow camera that follows the player and leaves distant scenery unshadowed, as it should, raises no line.

No line checks the four switches: a `false` there can be on purpose, such as a floor that should not darken. `eval` reads them.

## In React Three Fiber

The same four switches are props: `<Canvas shadows>`, `<directionalLight castShadow>`, `<mesh castShadow>` and `<mesh receiveShadow>`. The shadow camera is set with dashed props, `shadow-camera-left={-16}` and so on, and `shadow-mapSize={[2048, 2048]}`. For a model from `useGLTF`, set `castShadow` on its meshes with `scene.traverse` before rendering `<primitive object={scene} />`. `look` and `eval` read the scene React Three Fiber built, so the replies above read the same for an R3F page.

## Pitfalls

- **Move the target with the light.** A `DirectionalLight` points at `light.target`, which stays at the origin unless it is added to the scene and moved. A light moved to follow a player without its target keeps its shadow camera pointed at the origin.
- **A bigger box needs a bigger map.** Widening the shadow camera without raising `shadow.mapSize` trades a missing shadow for a blurry one.
- **Shadow acne and peter-panning** (stripes on lit faces, a shadow detached from its caster) are bias settings: tune `shadow.bias` and `shadow.normalBias` in small steps after the camera is sized.
- **`stage()` from `fx.js` sizes the camera for you.** The line's own advice: `fit(object)` sets the key light's shadow camera to the object's bounds.
- **paprika3d reports; it does not change the page.** It does not edit the light or the source. The agent makes the change and looks again.

## Without paprika3d

`new THREE.CameraHelper(light.shadow.camera)` added to the scene draws the shadow camera's box as lines, so a caster outside it can be seen in the page; call `helper.update()` after changing the camera. Logging `renderer.shadowMap.enabled` and a `scene.traverse` of each mesh's `castShadow` and `receiveShadow` gives the same readout as the `eval` above. The three.js manual's shadows page covers the shadow camera, map size and bias in full.
