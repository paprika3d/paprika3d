---
title: three.js Computed radius is NaN: find the NaN in the position attribute
phrase: computed radius is nan
description: What three.js means by "THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN", the line of BufferGeometry.js that prints it, why a position attribute holds NaN, how to fix the geometry, and how a coding agent finds the bad vertex with the paprika3d plugin's look, observe and eval replies.
meta: three.js "THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The 'position' attribute is likely to...": what triggers it and how to fix it.
intent: error-computed-radius-nan
message: THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.
queries:
  - "THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN"
  - "Computed radius is NaN. The position attribute is likely to have NaN values"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.

three.js prints this console error when it measures a geometry whose vertex positions include a value that is not a number. The geometry still draws, but three cannot cull it or raycast against it, and the vertex with the NaN is drawn nowhere, so part of a line or mesh goes missing. The fix is always in the code that filled the position array.

## Where three.js prints it

`BufferGeometry.computeBoundingSphere()` in `src/core/BufferGeometry.js` (three r186) finds the centre of the geometry's bounding box, then takes the largest distance from that centre to any vertex. One NaN coordinate makes the box's centre NaN, every distance NaN, and so the radius:

```js
this.boundingSphere.radius = Math.sqrt( maxRadiusSq );

if ( isNaN( this.boundingSphere.radius ) ) {

	error( 'BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.', this );

}
```

`error()` is three's logger in `src/utils.js`, which adds the `THREE.` prefix and calls `console.error`. three calls `computeBoundingSphere()` itself the first time it needs the sphere: when the renderer tests the object against the camera's view (frustum culling, on the first frame that draws it) and when a `Raycaster` tests it. `computeBoundingBox()` checks the same thing and prints its own line, `Computed min/max have NaN values`, so the two errors often arrive together.

## Why a position holds NaN

- **A read past the end of an array.** A `Float32Array` stores `undefined` as NaN, so `points[i] = data[i + 1]` on the last index writes NaN without any error.
- **A division by zero.** Normalising a zero-length vector, or dividing by a count that is 0 for an empty segment, gives NaN (0 / 0) or Infinity, and Infinity minus Infinity in the next step is NaN.
- **Text or missing fields parsed as numbers.** `parseFloat("")` and `Number(undefined)` are NaN, which a CSV or JSON loader passes straight into the array.
- **An attribute with the wrong item size.** A position attribute built with `itemSize` 2 for 3D points, or a buffer whose length is not a multiple of 3, reads past the data it was given.
- **A geometry edited after a morph or animation step** that produced NaN, such as a spring that divided by a zero distance.

## A page that reproduces it

This page draws a line through five heights and averages each height with the next one. The loop reads `heights[5]`, which is `undefined`, so the last vertex's y is NaN:

```js
const heights = [0, 1.2, 0.4, 1.8, 0.6];
const points = new Float32Array(heights.length * 3);
for (let i = 0; i < heights.length; i++) {
  points[i * 3] = i * 2 - 4;
  points[i * 3 + 1] = (heights[i] + heights[i + 1]) / 2; // heights[5] is undefined: the last y is NaN
  points[i * 3 + 2] = 0;
}
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. The calls below were made on 2026-10-28 with the stable build, on a machine with no GPU; run folder paths are shortened to `<project>` and the replies are cut to the lines this page discusses, with nothing reworded.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41287/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["path"]}

look {}

On screen (1):
path 0.1% [216, 274, 1279, 338] 8 × 0 units, across the view
Never visible: none
Page errors since the last call (2):
THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values. [object BufferGeometry]
THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values. [object BufferGeometry]
```

`open` stops at frame 0, before the first draw, so it has nothing to report yet. `look` draws a frame, which is when the renderer first culls the line and computes its sphere, and its reply ends with both errors. `observe` lists them too, under `harness.errors`, so an agent that reads state and takes no picture still sees them. The `8 × 0 units` is the size `look` measured from the vertices it could read: the line is flat because its last point never drew.

To find the vertex, `eval` runs code in the page with `find(name)` in scope:

```text
eval {"code": "const a = find(\"path\").geometry.attributes.position.array; return [...a].flatMap((v, i) => Number.isNaN(v) ? [i] : [])"}

[13]
errors: THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values. [object BufferGeometry]
```

Index 13 is the y of vertex 4 (13 = 4 × 3 + 1), the fifth and last point: the loop's last pass, the one that read `heights[5]`.

## The fix

Stop the loop from reading past the end, here by holding the last height instead of averaging it with a missing one. A check before the geometry is built turns the next NaN into an error that names the index, instead of a missing vertex:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Path</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 8);
camera.lookAt(0, 0, 0);

const heights = [0, 1.2, 0.4, 1.8, 0.6];
const points = new Float32Array(heights.length * 3);
for (let i = 0; i < heights.length; i++) {
  const next = heights[Math.min(i + 1, heights.length - 1)]; // the last point keeps its own height
  points[i * 3] = i * 2 - 4;
  points[i * 3 + 1] = (heights[i] + next) / 2;
  points[i * 3 + 2] = 0;
}
const bad = points.findIndex(v => !Number.isFinite(v));
if (bad >= 0) throw new Error(`path: position ${bad} (vertex ${Math.floor(bad / 3)}) is ${points[bad]}`);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
const path = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffcc33 }));
path.name = 'path';
scene.add(path);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

With the fix, `look` lists `path` with no `Page errors` line, and `observe`'s `harness.errors` is empty. The same check works for any generated geometry: `Number.isFinite` is false for NaN and for both infinities, which break a bounding sphere the same way.

If the geometry comes from a file, the NaN is in the file or its loader: the agent can run the same `eval` on each mesh's `geometry.attributes.position.array` to name the mesh, then look at the exporter or the parser that produced it. After editing the position array in place, call `computeBoundingSphere()` again: three computes the sphere once and does not notice the edit.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Extrude geometry fails with "Computed radius is NaN"](https://discourse.threejs.org/t/extrude-geometry-fails-with-computed-radius-is-nan/11657) (discourse.threejs.org, 4,504 views, 7 posts)
- [Computed radius is NaN](https://discourse.threejs.org/t/computed-radius-is-nan/9047) (discourse.threejs.org, 4,306 views, 2 posts)
- [Mesh / Model into Canon Convex/Trimesh](https://discourse.threejs.org/t/mesh-model-into-canon-convex-trimesh/38813) (discourse.threejs.org, 2,991 views, 14 posts)
- [CameraHelper gives error](https://discourse.threejs.org/t/camerahelper-gives-error/2296) (discourse.threejs.org, 2,138 views, 1 post)
- ["Computed radius is NaN." Can you help me debug this issue?](https://discourse.threejs.org/t/computed-radius-is-nan-can-you-help-me-debug-this-issue/59711) (discourse.threejs.org, 1,711 views, 2 posts)
