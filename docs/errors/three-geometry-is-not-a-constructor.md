---
title: three.js THREE.Geometry is not a constructor? Rebuild it as a BufferGeometry
phrase: three.geometry is not a constructor
description: Why code from an older three.js tutorial throws "THREE.Geometry is not a constructor" on a current release, what r125 removed, how vertices and Face3 faces map onto a BufferGeometry's position attribute and index, and how the paprika3d plugin's open and eval replies name the line and measure the replacement.
meta: three.js "THREE.Geometry is not a constructor": Geometry left the core in r125. Rebuild vertices and faces as a BufferGeometry, checked with stats.
intent: error-three-geometry-not-a-constructor
message: Uncaught TypeError: THREE.Geometry is not a constructor
queries:
  - "THREE.Geometry is not a constructor"
  - "THREE.Geometry() is out of date any new one?"
  - "Why THREE.Geometry() not working?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Uncaught TypeError: THREE.Geometry is not a constructor

The browser throws this when code calls `new THREE.Geometry()` on a three.js release that no longer has the class. three.js prints nothing of its own: `THREE.Geometry` is `undefined`, and `new` on `undefined` is a TypeError. The code is almost always older than the library it runs on, from a tutorial, a forum answer, or a coding agent that learned three.js from them. The fix is to describe the same shape as a `BufferGeometry`, which every built-in geometry has been since then.

## What changed in three.js

Up to r124 the core exported two geometry classes. `Geometry` held an array of `Vector3` corners in `geometry.vertices` and an array of `Face3` triangles in `geometry.faces`, easy to write by hand and slow to draw, since three converted it to buffers behind the scenes. `BufferGeometry` holds typed arrays that go to the GPU as they are. r125 took `Geometry` out of `src/Three.js`:

```js
// src/Three.js, three r124
export { BufferGeometry } from './core/BufferGeometry.js';
export { Geometry } from './core/Geometry.js';
export { Face3 } from './core/Face3.js';

// src/Three.js, three r125
export { BufferGeometry } from './core/BufferGeometry.js';
export { Face3 } from './core/Face3.js';
```

The r125 package kept a copy in `examples/jsm/deprecated/Geometry.js` for code that needed time to move. That folder is gone by r147, and `Face3` left the core along the way, so on r186 neither name exists anywhere in the package. From r125 on, `BoxGeometry`, `SphereGeometry` and the rest are `BufferGeometry` subclasses as well, which is why `box.geometry.vertices` reads `undefined` in old code that edits a primitive's corners.

## Why the code still asks for it

- **A tutorial or answer older than r125.** Hand-built shapes with `vertices.push` and `faces.push` fill older material, and the code reads as plain enough to copy unchanged.
- **A coding agent trained on that material.** An agent asked for a custom mesh may write `THREE.Geometry` against r186, the version drift that also lies behind the request for an [llms.txt for three.js](https://github.com/mrdoob/three.js/issues/31933).
- **A helper library from the same years.** Old text, terrain or merge helpers create a `Geometry` inside them, so the error points into their file, not yours.

## A page that reproduces it

A house whose walls are a `BoxGeometry` and whose roof is built the old way:

```js
const geometry = new THREE.Geometry();
geometry.vertices.push(
  new THREE.Vector3(-1.1, 0, -1.1), new THREE.Vector3(1.1, 0, -1.1),
  new THREE.Vector3(1.1, 0, 1.1), new THREE.Vector3(-1.1, 0, 1.1),
  new THREE.Vector3(0, 1, 0),
);
geometry.faces.push(
  new THREE.Face3(0, 4, 1), new THREE.Face3(1, 4, 2), new THREE.Face3(2, 4, 3), new THREE.Face3(3, 4, 0),
  new THREE.Face3(0, 1, 2), new THREE.Face3(0, 2, 3),
);
geometry.computeFaceNormals();
const roof = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xa8432f }));
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in a headless Chrome of its own, on a clock paused at frame 0. The replies below came from the stable build on 2026-10-28, on a host with no GPU. The run folder shows as `<project>`, and the replies are cut to the lines this page explains, none reworded.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:42017/index.html in 3.1 s, paused at frame 0.
index.html:29 uses THREE.Geometry, removed in r125: use BufferGeometry
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["walls"]}
Errors so far:
THREE.Geometry is not a constructor (index.html:29:18)

look {}

look: the game has not drawn a three.js scene after 5 s of stepping frames; if it is still loading or building, step it with `interact` { steps: [{ wait: frames }] } and look again
```

The `uses THREE.Geometry` line comes from `open` reading the project's source before the page runs: it names the file and line, the release that removed the class and what replaces it. The error line agrees on the line. `look` shows the cost: the page threw before it reached `setAnimationLoop`, so not even the walls were drawn, though they were already in the scene. The source check does not name `Face3` or `computeFaceNormals`; both go away with the rewrite below.

## Try the replacement before editing

`eval` runs code in the open page with `THREE` and a `stats` helper in scope, so the `BufferGeometry` version of the roof can be built and measured first:

```text
eval {"code":"const v = [-1.1, 0, -1.1, 1.1, 0, -1.1, 1.1, 0, 1.1, -1.1, 0, 1.1, 0, 1, 0];\nconst g = new THREE.BufferGeometry();\ng.setAttribute(\"position\", new THREE.Float32BufferAttribute(v, 3));\ng.setIndex([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 1, 2, 0, 2, 3]);\nconst flat = g.toNonIndexed();\nflat.computeVertexNormals();\nconst roof = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color: 0xa8432f }));\nroof.position.y = 1.2;\nroof.name = \"roof\";\nscene.add(roof);\nreturn stats(\"roof\")"}

total  1 meshes  18 v  6 tri
roof  18 v  6 tri  closed  vol 1.613  genus 0  size 2.2×1×2.2  [position, normal]
```

The numbers check the translation: 6 triangles, one per `Face3`; a closed surface with no holes (genus 0), so every face made it across; the 2.2 by 2.2 base and height 1 of the old corners; and a volume of 1.613, a third of base times height. The 18 vertices are the 6 triangles with their corners unshared, which `toNonIndexed()` does so that `computeVertexNormals()` gives each face its own flat normal, as `computeFaceNormals()` did.

## The fix

Each `Vector3` in `vertices` becomes three numbers in a `position` attribute, and each `Face3(a, b, c)` becomes three entries in the index, in the same order. Keep the corner order counter-clockwise as seen from outside, as it was for `Face3`, or the face is culled from that side. For lines and points, `new THREE.BufferGeometry().setFromPoints(points)` takes the `Vector3` array as it is. The page with the roof rewritten:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>House</title>
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
scene.background = new THREE.Color(0x9fc4e8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 4);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(3.5, 2.5, 4.5);
camera.lookAt(0, 0.9, 0);

const walls = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }));
walls.position.y = 0.6;
walls.name = 'walls';
scene.add(walls);

// the roof: five corners, six triangles, as a BufferGeometry
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -1.1, 0, -1.1, 1.1, 0, -1.1,
  1.1, 0, 1.1, -1.1, 0, 1.1,
  0, 1, 0,
], 3));
geometry.setIndex([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 1, 2, 0, 2, 3]);
const faceted = geometry.toNonIndexed(); // one normal per face, as computeFaceNormals gave
faceted.computeVertexNormals();
const roof = new THREE.Mesh(faceted, new THREE.MeshStandardMaterial({ color: 0xa8432f }));
roof.position.y = 1.2;
roof.name = 'roof';
scene.add(roof);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:35661/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["walls","roof"]}

look {}

On screen (2):
walls 8.7% [402, 355, 864, 649]
roof 6.2% [376, 183, 886, 427]
Never visible: none

eval {"code":"return stats(\"roof\")"}

total  1 meshes  18 v  6 tri
roof  18 v  6 tri  closed  vol 1.613  genus 0  size 2.2×1×2.2  [position, normal]
```

`open` no longer names a line, both meshes draw, and the roof in the source measures as the one tried in `eval`. For a shape with many faces, `geo.js`, which `open` writes into the project, builds procedural geometry as `BufferGeometry` directly (the skill's geometry reference lists it). paprika3d does not convert old code: it names the line, and the agent writes the replacement.

## Where people ask about it

These threads quote the message or ask the question; each count was read on 2026-10-28.

- [THREE.Geometry is not a constructor](https://stackoverflow.com/questions/68000359/three-geometry-is-not-a-constructor) (Stack Overflow, 23,612 views)
- [THREE.Geometry() is out of date any new one?](https://discourse.threejs.org/t/three-geometry-is-out-of-date-any-new-one/39816) (discourse.threejs.org, 6,227 views, 7 posts)
- [Why THREE.Geometry() not working?](https://discourse.threejs.org/t/why-three-geometry-not-working/50757) (discourse.threejs.org, 651 views, 5 posts)
