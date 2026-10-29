---
title: three.js BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed
phrase: buffergeometry is already non-indexed
description: What the three.js warning "BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed" means, why toNonIndexed() then returns the same geometry instead of a copy, which built-in geometries have no index, and how the paprika3d plugin's open, look and eval replies catch two meshes sharing one geometry.
meta: three.js "THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed": what triggers it and how to fix it.
intent: error-tononindexed
message: THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.
queries:
  - "BufferGeometry.toNonIndexed() warns about `BufferGeometry is already non-indexed`"
  - "THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.

three.js prints this warning when `toNonIndexed()` is called on a geometry that has no index buffer. On its own it is harmless: the geometry already stores three vertices per triangle, which is what the call is for. The part that causes bugs is the return value. On an indexed geometry, `toNonIndexed()` builds and returns a new geometry; on a non-indexed one it returns the very same object, so code that treats the result as its own copy and changes it is changing the original, and every other mesh built from it.

## Where three.js prints it

`BufferGeometry.toNonIndexed()` in `src/core/BufferGeometry.js` (three r186) checks for an index before doing any work:

```js
if ( this.index === null ) {

	warn( 'BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.' );
	return this;

}

const geometry2 = new BufferGeometry();

const indices = this.index.array;
```

`warn()` adds the `THREE.` prefix and calls `console.warn`. After the check, the method creates `geometry2`, copies every attribute out through the index, and returns that new object. The early `return this` is the case this page is about.

## Why the geometry already has no index

- **Polyhedra and extrusions.** `IcosahedronGeometry`, `OctahedronGeometry`, `TetrahedronGeometry`, `DodecahedronGeometry` and any `PolyhedronGeometry`, plus `ExtrudeGeometry` and `TextGeometry`, are created without an index. Low-poly tutorials call `toNonIndexed()` to give each face its own vertices for flat colours, and the call is redundant on these shapes.
- **A geometry that was already converted.** Calling `toNonIndexed()` a second time, for example in a helper that runs on every part of a model, warns on the second call.
- **Loaded models without indices.** Some glTF, STL and OBJ files store triangles as separate vertices; `STLLoader` and `OBJLoader` always produce non-indexed geometry.
- **A merge preparation step** that converts every part before `mergeGeometries()`, including parts that never had an index.

## A page that reproduces it

The page makes two flat-shaded planets with face colours from one icosahedron. Each planet calls `toNonIndexed()` on the shared base, expecting its own copy to colour:

```js
const base = new THREE.IcosahedronGeometry(1, 2);

function planet(name, palette, x) {
  const geometry = base.toNonIndexed(); // base has no index: this returns base itself
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); // the second planet replaces the first's colours
  // ...
}
planet('earth', [0x2f7d32, 0x1e5aa8, 0x3c8f3f], -1.5);
planet('mars', [0xb5482c, 0x8a3320, 0xc9663d], 1.5);
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. What follows ran on 2026-10-28 with the stable build, on a machine with no GPU; the run folder reads `<project>`, and the replies were trimmed to the lines explained here, each one unaltered.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:36155/index.html in 0.3 s, paused at frame 0.
three.js warned: THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed. (×2)
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["earth","mars"]}

look {}

Hues: grey 88%, red 8% of the frame; over the objects (12.9% of it): red 61%, orange 32%, grey 7%.
On screen (2):
earth 6.4% [272, 258, 567, 541]
mars 6.4% [712, 258, 1007, 541]
Never visible: none

eval {"code": "const e = find(\"earth\"), m = find(\"mars\"); return { shared: e.geometry === m.geometry, index: e.geometry.index, earthFace0: \"#\" + new THREE.Color().fromArray(e.geometry.attributes.color.array).getHexString() }"}

{"shared":true,"index":null,"earthFace0":"#b5482c"}
```

The warning fires during setup, once per planet, and `open` folds the two into one `three.js warned:` line marked `(×2)`. `look` finds both planets on screen, and its hue line is the visible symptom: over the objects there is red and orange and no green or blue, so the earth is drawn in the mars palette. The `eval` confirms why: both meshes hold the same geometry object, it has no index, and the earth's first face has the mars colour `#b5482c`. The warning alone would not lead to this; it is a sign that the code expected a copy where three gave back the original. `observe` does not list warnings, so its `harness.errors` stays empty here.

## The fix

Convert when there is an index, and clone otherwise. The `clone()` gives each planet its own attributes, and the warning goes away because `toNonIndexed()` is no longer called on a geometry without an index:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Planets</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d14);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const base = new THREE.IcosahedronGeometry(1, 2);

// one low-poly planet per palette: a separate copy of the base, coloured face by face
function planet(name, palette, x) {
  // IcosahedronGeometry has no index, and toNonIndexed() would hand back base itself: clone it instead
  const geometry = base.index ? base.toNonIndexed() : base.clone();
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < colors.length / 9; f++) {
    c.set(palette[f % palette.length]);
    for (let v = 0; v < 3; v++) c.toArray(colors, f * 9 + v * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
  mesh.name = name;
  mesh.position.x = x;
  scene.add(mesh);
}
planet('earth', [0x2f7d32, 0x1e5aa8, 0x3c8f3f], -1.5);
planet('mars', [0xb5482c, 0x8a3320, 0xc9663d], 1.5);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The page opens with no `three.js warned:` line, and each planet keeps its own colours:

```text
look {}

Hues: grey 88% of the frame; over the objects (12.9% of it): green 32%, red 30%, orange 16%, blue 15%.
On screen (2):
earth 6.4% [272, 258, 567, 541]
mars 6.4% [712, 258, 1007, 541]
Never visible: none

eval {"code": "const e = find(\"earth\"), m = find(\"mars\"); return { shared: e.geometry === m.geometry, index: e.geometry.index, earthFace0: \"#\" + new THREE.Color().fromArray(e.geometry.attributes.color.array).getHexString() }"}

{"shared":false,"index":null,"earthFace0":"#2f7d32"}
```

Green and blue now appear over the objects next to the red and orange, and the earth's first face is its own `#2f7d32`. When one mesh is built from one geometry and nothing else uses it, the warning can also be silenced by dropping the `toNonIndexed()` call: the geometry is already in the form it would produce.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [BufferGeometry.toNonIndexed() warns about `BufferGeometry is already non-indexed`](https://discourse.threejs.org/t/buffergeometry-tononindexed-warns-about-buffergeometry-is-already-non-indexed/53497) (discourse.threejs.org, 798 views, 2 posts)
