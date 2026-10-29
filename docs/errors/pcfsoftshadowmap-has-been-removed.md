---
title: three.js PCFSoftShadowMap has been removed. Using PCFShadowMap instead: soft shadows in r186
phrase: pcfsoftshadowmap has been removed
description: Why three.js r186 prints "THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.", the line in WebGLShadowMap.js that switches the type at the first shadow render, how PCFShadowMap and shadow.radius give soft shadows now, and why the paprika3d look reply misses the warning while an eval catches it.
meta: three.js "THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead": what triggers it and how to fix it.
intent: error-pcfsoftshadowmap-removed
message: THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.
queries:
  - "THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."
  - "Shadow Pixelation Issue in Three.js 0.182.0"
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.

three.js prints this warning when `renderer.shadowMap.type` is `THREE.PCFSoftShadowMap`, a setting found in years of examples and tutorials. In r186 the constant still exists, so old code keeps running, but the renderer has no separate soft filter any more: it switches the type to `PCFShadowMap` the first time it draws shadows and says so once. Shadows still draw. How soft they look is now set per light with `shadow.radius`, which is why shadows can look harder or more pixelated after an upgrade.

## Where three.js prints it

`WebGLShadowMap.render()` in `src/renderers/webgl/WebGLShadowMap.js` (three r186) runs before each frame's main render when shadows are on. After its early exits it checks the type:

```js
this.render = function ( lights, scene, camera ) {

	if ( scope.enabled === false ) return;
	if ( scope.autoUpdate === false && scope.needsUpdate === false ) return;

	if ( lights.length === 0 ) return;

	if ( this.type === PCFSoftShadowMap ) {

		warn( 'WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.' );
		this.type = PCFShadowMap;

	}
```

`warn()` in `src/utils.js` puts `THREE.` in front and calls `console.warn`. Three conditions have to hold before the check is reached: `shadowMap.enabled` is `true`, the shadow map is due for an update, and at least one light casts shadows. Because the next line overwrites the type, the warning is printed once per renderer, at the first frame with a shadow-casting light. `src/constants.js` keeps `export const PCFSoftShadowMap = 2` with a note that it is deprecated since r186 and to use `PCFShadowMap` instead. `WebGPURenderer` has the same check in `src/renderers/common/Renderer.js` and prints its own version of the line.

## Why the code still asks for it

- **Code copied from older examples.** `renderer.shadowMap.type = THREE.PCFSoftShadowMap` was the usual line for soft shadows for a long time, so it is in many tutorials, starter templates and answers.
- **A framework or wrapper that sets it.** A scene library or component that turns soft shadows on for you may still set the old type; the warning appears without that line being in your code.
- **An upgrade that skipped the release notes.** A project moved to a newer three.js keeps its settings, and the change shows as a console line and a different shadow edge.

In r186 the PCF filter takes five samples on a Vogel disk with hardware comparison, so `PCFShadowMap` is soft already, and its spread is `shadow.radius` texels of the shadow map (1 by default). A shadow that looks blocky after the switch can usually be smoothed with a larger radius, a larger `shadow.mapSize`, or a tighter shadow camera around the area that needs shadows.

## A page that reproduces it

A box casting a shadow onto the ground, with the old type:

```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 5, 2);
sun.castShadow = true;
// ... a ground plane that receives shadows and a box that casts one ...
```

paprika3d is a Claude Code plugin and MCP server that serves a three.js page to a headless Chrome of its own and stops its clock at frame 0. These are real replies from the stable build on 2026-10-28, on a host with no GPU; the run folder shows as `<project>` and the replies are shortened to what this page explains.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:34441/index.html in 0.4 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["ground","box"]}

eval {"code":"renderer.render(scene, camera); return renderer.info.memory"}

{"geometries":2,"textures":3}
warn: THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.
```

Setting the type prints nothing; the check runs when shadows are first drawn, which is after `open` has replied. The `eval` draws the first frame before its code runs, and lists the warning from that frame.

Called in the other order, `look` and then `eval`, the same page gave no warning anywhere:

```text
look {}

On screen (2):
ground 59% [0, 291, 1279, 799] 8 × 8 units
box 3.6% [544, 225, 735, 425]
Never visible: none

eval {"code":"return [renderer.shadowMap.type, THREE.PCFShadowMap, THREE.PCFSoftShadowMap]"}

[1,1,2]
```

`look` drew the first frame, so the warning was printed during it, and its reply lists console errors and not warnings. By the time of the `eval` the type had already been switched: `renderer.shadowMap.type` is 1, the value of `PCFShadowMap`, though the page set 2. That reading is a way to spot the old setting after the fact.

## The fix

Set `PCFShadowMap` and tune the softness on each light, with `shadow.radius` for the width of the soft edge and `shadow.mapSize` for its detail. For wide, very soft shadows, `VSMShadowMap` with `shadow.radius` and `shadow.blurSamples` is the other filter r186 keeps:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Shadows</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 5);
camera.lookAt(0, 0, 0);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // the soft filter in r186; radius sets the softness
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 5, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.radius = 4;
scene.add(sun, new THREE.HemisphereLight(0xbfd4ff, 0x404040, 1));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x8a9a7b }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.name = 'ground';
const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd9643a }));
box.position.y = 0.5;
box.castShadow = true;
box.name = 'box';
scene.add(ground, box);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The fixed page's replies have no warning:

```text
open {"url":"fixed.html","cwd":"<project>"}

Opened http://127.0.0.1:43019/fixed.html in 0.8 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["ground","box"]}

eval {"code":"return renderer.info.memory"}

{"geometries":2,"textures":3}
```

The fixed page also turns on ACES tone mapping, which `look` had asked for in a `Lighting` line on the first page; that change is separate from the shadow type. If a library sets the old type, set `renderer.shadowMap.type` again after it has run, or update the library.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Shadow Pixelation Issue in Three.js 0.182.0](https://discourse.threejs.org/t/shadow-pixelation-issue-in-three-js-0-182-0/88746) (discourse.threejs.org, 749 views, 10 posts)
- [After migration from version 0.92.0 to 0.130.0 object materials looks different!](https://discourse.threejs.org/t/after-migration-from-version-0-92-0-to-0-130-0-object-materials-looks-different/28885) (discourse.threejs.org, 581 views, 5 posts)
