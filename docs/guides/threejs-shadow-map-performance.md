---
title: three.js shadow map performance: count the shadow passes, then draw static shadows once
phrase: three.js shadow map performance
description: What three.js shadows cost per frame (a depth pass per casting light, six for a point light, and the map's pixels), and how a coding agent counts the shadow draw calls with the paprika3d plugin's open and perf, prices each change (maps drawn once, lamps without shadows, a smaller map) on a fresh page with perf variants, and checks with look that a static scene's picture did not change.
meta: three.js shadow map performance: count each light's shadow passes, draw static shadow maps once, and check the picture stays the same.
intent: shadow-map-cost
queries:
  - "How to render shadow map one time"
  - "How to Optimize Shadow Rendering in Three.js for Better Performance?"
  - "Three.js multiple spotlight performance"
  - "Many lights, nearly everything static: Shadows?"
  - "Shadowmap halves my fps"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js shadow map performance: count the shadow passes, then draw static shadows once

## What a shadow costs each frame

Before three.js draws the camera's view, it draws the scene again from each light that casts a shadow, into that light's depth map. A directional or spot light draws its casters once. A point light draws them six times, once per face of a cube around it. Every one of those draws is another draw call, so a scene of 40 casters under five casting lights can send several times the draw calls the camera's view needs. Then the GPU fills each map, whose cost grows with `shadow.mapSize` squared, and every lit pixel on screen samples every map.

By default all of it happens every frame, whether anything moved or not. For a scene that stands still, `renderer.shadowMap.autoUpdate = false` keeps the maps from the last time they were drawn, and setting `renderer.shadowMap.needsUpdate = true` draws them once more when something does move. Each light also has its own pair, `light.shadow.autoUpdate` and `light.shadow.needsUpdate`, so static lamps can keep their maps while a sun that follows the player stays live.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `open` adds a `Lights` line when a scene has more than a few casting lights. `perf` with `costs: true` gives the frame's draw calls beside the scene's objects, so the shadow passes show as the gap, and `perf` with `variants` runs each change on a fresh page and reports its draw calls and triangles. `observe` reads the renderer's counts on the live page, and `look` says what share of the picture changed since the last look.

This guide is about the cost of shadows that work. For shadows that do not show, see [three.js shadows not showing](/guides/threejs-shadows-not-showing).

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A night street

40 houses that cast and receive shadows, a moon (a directional light with a 2048 px map) and four street lamps, each a point light that casts with a 512 px map. Nothing in the scene moves.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Night street</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141a26);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 14, 30);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0x8899bb, 0x222222, 0.6));

// The moon: one directional light with a 2048 px shadow map over the whole street.
const moon = new THREE.DirectionalLight(0xbbccff, 1.2);
moon.name = 'moon';
moon.position.set(-15, 30, 10);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
scene.add(moon);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x3a3a40 }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 40 houses along both sides of the street; nothing in the scene ever moves.
const houses = new THREE.Group();
houses.name = 'houses';
const wall = new THREE.MeshStandardMaterial({ color: 0x9a8f80 });
for (let i = 0; i < 20; i++) for (const side of [-1, 1]) {
  const h = 3 + ((i * 7) % 5);
  const house = new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 3, 4, 4, 4), wall);
  house.position.set(-24 + i * 2.6, h / 2, side * 7);
  house.castShadow = house.receiveShadow = true;
  houses.add(house);
}
scene.add(houses);

// Four street lamps, each a point light that casts: a point light renders its shadow map six times, once per cube face.
const lamps = new THREE.Group();
lamps.name = 'lamps';
for (let k = 0; k < 4; k++) {
  const lamp = new THREE.PointLight(0xffc477, 40, 18);
  lamp.position.set(-18 + k * 12, 4, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamps.add(lamp);
}
scene.add(lamps);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew the page in software (SwiftShader). Draw calls and triangles are counts, the same on any machine. The times in the replies, and the `Lights:` line's share of the frame, come from a software renderer on a loaded host and are not used here. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page.** The `Lights:` line counts the lights that cost something per pixel and the ones that cast:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:38557/index.html in 0.3 s, paused at frame 0.
Lights: 4 point, 1 directional lights, 5 casting shadows (2048 maps): every lit material pays for each one; `perf` measures what they cost.
{"three":"186","scenes":1,"entities":["moon","ground","houses","lamps"]}
```

The map size it gives is the largest of the five.

**2. Compare the frame with the scene.** `perf` with `costs: true`:

```text
perf {"costs": true}

792.1 ms median frame (p95 944.6 ms, 1 fps on average), 234 draw calls, 44738 triangles, 0 MB assets; over budget: frameMs 792.1 of 16.7 ms; desktop budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Lights: 4 point, 1 directional lights, 5 casting shadows (2048 maps); the shadows cost 525.3 ms of a 792.1 ms frame. Light with a few real lights and make decorative lamps emissive materials; each shadow-casting point light draws the scene 6 more times.
Costs by named group: the main scene's visible objects, each under its nearest named ancestor as `look` names it, counted, not timed, and with no frustum culling (the frame draws only what its camera sees, plus a shadow pass per casting light); `variants` with `hide` times a group. In all 7682 triangles, 7680 casting shadows, 41 draw calls, 0 MB of textures (the first line's 44738 triangles and 234 draw calls are the frame as drawn, the camera's view plus the shadow pass):
  houses: 7680 triangles, 7680 casting shadows, 40 draw calls, 0 MB of textures
  ground: 2 triangles, 0 casting shadows, 1 draw calls, 0 MB of textures
```

The scene is 41 objects and 7682 triangles. The frame is 234 draw calls and 44738 triangles: the camera's view plus the shadow passes. The `Lights:` line measured the shadows by turning them off on a fresh page; its milliseconds belong to this host's software renderer, and its advice about point lights is the part that carries over.

**3. Price each change.** Each variant's `code` runs with `renderer` and `scene` on a fresh page:

```text
perf {"variants": [{"label": "shadow maps drawn once", "code": "renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;"}, {"label": "lamps cast no shadow", "code": "scene.getObjectByName(\"lamps\").children.forEach(l => { l.castShadow = false; })"}, {"label": "moon map 1024", "code": "const m = scene.getObjectByName(\"moon\"); m.shadow.mapSize.set(1024, 1024); m.shadow.map?.dispose(); m.shadow.map = null;"}]}

baseline: 751.2 ms median (p95 1207.8), work 1269.9 ms, 234 draw calls, 44738 triangles; over budget: frameMs 751.2 of 16.7 ms; desktop budget
shadow maps drawn once: 934.5 ms median (p95 1061.5), work 1074.4 ms, 38 draw calls, 7106 triangles; within the noise of the baseline; −84% draw calls, −84% triangles
lamps cast no shadow: 591 ms median (p95 631.4), work 491.9 ms, 78 draw calls, 14786 triangles; within the noise of the baseline; −67% draw calls, −67% triangles
moon map 1024: 1231.2 ms median (p95 1231.2), work 875 ms, 234 draw calls, 44738 triangles; within the noise of the baseline
Host load 28.5 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

The counts split the 234 draw calls:

- **Shadow maps drawn once** leaves 38: the camera's view alone. Every shadow draw call is gone from the frames after the first.
- **Lamps without shadows** leaves 78, so the four point lights' cube maps were 156 of the 234 calls, and the moon's one pass the other 40.
- **A smaller moon map** changes no count. Its saving is the GPU's work filling and sampling fewer pixels, which a frame time measured on a GPU shows and a count does not.

The times on this host go both ways within a noise of hundreds of milliseconds; they decide nothing. Lamps that must keep their shadows can keep them without the per-frame passes, since each light has its own switch:

```text
perf {"variants": [{"label": "lamp maps drawn once", "code": "scene.getObjectByName(\"lamps\").children.forEach(l => { l.shadow.autoUpdate = false; l.shadow.needsUpdate = true; })"}]}

baseline: 770.5 ms median (p95 1123.6), work 1195 ms, 234 draw calls, 44738 triangles; over budget: frameMs 770.5 of 16.7 ms; desktop budget
lamp maps drawn once: 643.7 ms median (p95 655.7), work 625.5 ms, 78 draw calls, 14786 triangles; within the noise of the baseline; −67% draw calls, −67% triangles
```

The same 78 draw calls as turning the lamps' shadows off, with the lamps' shadows still in the picture.

**4. Check the picture did not change.** On the live page: draw two frames, read the counts, look, switch the maps to drawn-once, draw three more frames, and read and look again.

```text
interact {"steps": [{"wait": 2, "draw": true}]}

observe {}

{"entities":{"moon":{"type":"DirectionalLight","position":[-15,30,10]},"ground":{"type":"Mesh","position":[0,0,0]},"houses":{"type":"Group","position":[0,0,0]},"lamps":{"type":"Group","position":[0,0,0]}},"harness":{"frame":2,"renderer":{"calls":234,"triangles":44738,"textures":7,"geometries":41,"programs":3},"scene":{"objects":49,"meshes":41,"lights":6,"cameras":0},"errors":[],"changed":null}}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-27-47-835Z/look-1.png

eval {"code": "renderer.shadowMap.autoUpdate = false;\nrenderer.shadowMap.needsUpdate = true;   // draw the maps once more, then keep them"}

interact {"steps": [{"wait": 3, "draw": true}]}

observe {}

{"entities":{"moon":{"type":"DirectionalLight","position":[-15,30,10]},"ground":{"type":"Mesh","position":[0,0,0]},"houses":{"type":"Group","position":[0,0,0]},"lamps":{"type":"Group","position":[0,0,0]}},"harness":{"frame":5,"renderer":{"calls":38,"triangles":7106,"textures":7,"geometries":41,"programs":4},"scene":{"objects":49,"meshes":41,"lights":6,"cameras":0},"errors":[],"changed":{"harness":{"renderer":{"calls":[234,38],"triangles":[44738,7106],"programs":[3,4]}}}}}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-27-47-835Z/look-2.png
Pixels: brightness 11%, colour saturation 46%, 2% near black, 0% blown out; 0% of the picture changed since the last look. Dark: a viewer sees little.
```

`changed` gives the draw calls going from 234 to 38, and `look` says 0% of the picture changed: the kept maps draw the same shadows. In the source, the two lines go after the scene is built, and `renderer.shadowMap.needsUpdate = true` goes wherever something that casts or receives moves.

## Choosing a fix

| Situation | Fix |
|---|---|
| Nothing moves, or moves rarely | `renderer.shadowMap.autoUpdate = false`, with `needsUpdate = true` on the frames that change |
| Static lamps and a moving player | `light.shadow.autoUpdate = false` on the lamps; the light that follows the player stays live |
| Decorative lights | no `castShadow`, or an emissive material and no light at all |
| Many casters that are too small to matter | `castShadow = false` on them; the cost table's `casting shadows` column finds them |
| A sharp shadow over a large area | a tighter shadow camera before a larger map |

## What paprika3d does not do

- It does not time a shadow pass on this host, or on any machine without a GPU; the counts above hold everywhere, and the times mean something on a GPU alone.
- It does not bake shadows or light into textures. Lightmaps for a static scene are made in a modelling tool and loaded as an `aoMap` or `lightMap`, outside paprika3d.
- The cost table counts casters before culling. A light's shadow camera or a point light's range leaves some casters out of its pass, which the first line's draw calls include and the table does not.
- It does not change the page. The `eval` above vanishes on reload; the agent writes the lines into the source.

## Pitfalls

- **A moved caster with autoUpdate off keeps its old shadow.** Set `needsUpdate = true` on the renderer or the light for the frame it moves, or the shadow stays where it was.
- **The first frame draws the maps.** With `autoUpdate` false from the start, set `needsUpdate = true` once, after the scene is built, or the maps stay empty.
- **Point lights cost six passes.** A spot light pointed down covers a street lamp's pool in one pass, which is why the `Lights:` line singles point lights out.
- **Lights cost without shadows too.** Every lit material computes every light for every pixel; the `Lights:` line counts them for that reason.
- **The map size squares.** Halving `mapSize` is a quarter of the pixels to fill; a tighter shadow camera keeps the same sharpness at the smaller size, as the [shadows not showing guide](/guides/threejs-shadows-not-showing) explains.

## Without paprika3d

`renderer.info.render.calls` read after a frame with shadows on and again with `renderer.shadowMap.autoUpdate = false` gives the same draw call split as step 3, and `renderer.info.render.triangles` the triangles. The browser's performance panel shows the frame's GPU time on a machine with a GPU, which is where a smaller map's saving shows. The three.js docs for `WebGLRenderer.shadowMap` and `LightShadow` list `autoUpdate`, `needsUpdate`, `mapSize` and the shadow camera.
