---
title: three.js mergeGeometries() failed: all geometries must have compatible attributes
phrase: all geometries must have compatible attributes
description: What the three.js error "BufferGeometryUtils: .mergeGeometries() failed with geometry at index N. All geometries must have compatible attributes" means, the checks in BufferGeometryUtils.js behind it, which built-in geometries are indexed and which are not, and how the paprika3d plugin's open, observe and eval replies show the merge returning null.
meta: three.js "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index 1. All geometries must have...": what triggers it and how to fix it.
intent: error-merge-geometries
message: THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index 1. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.
queries:
  - "Merge 2 geometries error All geometries must have compatible attributes"
  - "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index"
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index 1. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.

`mergeGeometries()` from the addons combines several geometries into one so they draw in a single call. It prints this console error and returns `null` when the geometry at the given position in the array is built differently from the first one. The word after `make sure` names the difference: `index` when one geometry has an index buffer and another has none, or a quoted attribute name such as `"uv"` or `"color"` when one geometry has an attribute the first lacks. The page usually fails a line later, when the `null` reaches a `Mesh`.

## Where three.js prints it

`mergeGeometries()` in `examples/jsm/utils/BufferGeometryUtils.js` (three r186) takes its reference from geometry 0, then compares every geometry in the array with it, index first and attribute names second:

```js
const isIndexed = geometries[ 0 ].index !== null;

const attributesUsed = new Set( Object.keys( geometries[ 0 ].attributes ) );

// ...

	// ensure that all geometries are indexed, or none

	if ( isIndexed !== ( geometry.index !== null ) ) {

		console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.' );
		return null;

	}

	// gather attributes, exit early if they're different

	for ( const name in geometry.attributes ) {

		if ( ! attributesUsed.has( name ) ) {

			console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure "' + name + '" attribute exists among all geometries, or in none of them.' );
			return null;

		}
```

A third check follows, for a geometry that has fewer attributes than the first, with its own wording: `Make sure all geometries have the same number of attributes.` The morph attributes and `morphTargetsRelative` must agree too. In r186 every one of these failures uses `console.error` directly and returns `null`; none of them throws.

## Why the geometries are not compatible

- **An indexed geometry next to a non-indexed one.** `BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `PlaneGeometry`, `ShapeGeometry` and `TubeGeometry` are built with an index. `ExtrudeGeometry` (and `TextGeometry`, which extends it) and the polyhedra such as `IcosahedronGeometry` are not, and neither is any geometry that went through `toNonIndexed()`. A sign, a letter or a gem merged with a box hits this case.
- **An attribute that some geometries have and others lack.** A geometry loaded from a file without texture coordinates has no `uv`, one with vertex colours has `color`, and `computeTangents()` adds `tangent`. The first geometry decides which names are expected, so the position in the array of the odd one out also decides which of the messages appears.
- **Meshes merged with their transforms but from different sources**, such as a glTF part that has `uv1` or skinning attributes next to a primitive that has neither.

## A page that reproduces it

A signpost is a cylinder for the post and an extruded arrow for the sign, merged into one mesh:

```js
const post = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 12).translate(0, 1.2, 0); // indexed
const sign = new THREE.ExtrudeGeometry(arrow, { depth: 0.06, bevelEnabled: false }).translate(0.2, 2, 0.06); // non-indexed
const geometry = mergeGeometries([post, sign]); // null
const signpost = new THREE.Mesh(geometry, material);
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. The calls were made on 2026-10-28 with the stable build, on a machine with no GPU; `<project>` replaces the run folder, and the replies keep the lines this section covers, as printed.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:35329/index.html in 3.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index 1. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.
Cannot read properties of null (reading 'morphAttributes') (index.html:26:18)

observe {}

{"entities":{},"harness":{"frame":101,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":1,"meshes":0,"lights":1,"cameras":0},"errors":["THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index 1. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.","Cannot read properties of null (reading 'morphAttributes') (index.html:26:18)"],"changed":null}}
```

`open` lists two errors in the order they happened. The first is three's, with index 1 pointing at the sign, the second entry in the array. The second is the crash it causes: `new THREE.Mesh(null, ...)` reads `geometry.morphAttributes` in its constructor, and line 26 of the page is that `new THREE.Mesh` call. That exception stops the module, so no mesh is added, `entities` is empty and the renderer never draws. A `look` on this page waits for a frame and reports that none came.

Which built-in geometries carry an index is easy to check in the page with `eval`:

```text
eval {"code": "const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)]); const g = { Box: new THREE.BoxGeometry(), Cylinder: new THREE.CylinderGeometry(), Sphere: new THREE.SphereGeometry(), Shape: new THREE.ShapeGeometry(s), Extrude: new THREE.ExtrudeGeometry(s), Icosahedron: new THREE.IcosahedronGeometry(), Tube: new THREE.TubeGeometry() }; return Object.entries(g).map(([k, v]) => k + (v.index ? \" indexed\" : \" non-indexed\"))"}

["Box indexed","Cylinder indexed","Sphere indexed","Shape indexed","Extrude non-indexed","Icosahedron non-indexed","Tube indexed"]
```

The replies name the position in the array, not the variable, so with a long list of parts the agent maps the number back to the array the page passed in.

## The fix

Bring every part to the same form before merging. Expanding the indexed parts with `toNonIndexed()` works whenever the attribute names already match; welding the non-indexed ones with `mergeVertices()` from the same addon keeps the index but changes vertex counts. The page below expands the geometries that have an index and leaves the rest as they are, which also avoids the warning `toNonIndexed()` prints for a geometry that is already non-indexed, and it stops with a clear error if the merge still returns `null`:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Signpost</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 5);
camera.lookAt(0, 1.2, 0);

// a post (indexed) and an arrow-shaped sign (ExtrudeGeometry: non-indexed), merged into one draw
const post = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 12).translate(0, 1.2, 0);
const arrow = new THREE.Shape([[-0.6, -0.2], [0.4, -0.2], [0.7, 0], [0.4, 0.2], [-0.6, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)));
const sign = new THREE.ExtrudeGeometry(arrow, { depth: 0.06, bevelEnabled: false }).translate(0.2, 2, 0.06);
// mergeGeometries() needs all indexed or none: expand the indexed ones, and stop on a null result
const parts = [post, sign].map(g => g.index ? g.toNonIndexed() : g);
const geometry = mergeGeometries(parts);
if (!geometry) throw new Error('signpost: mergeGeometries failed, see the console line above');

const signpost = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc8a060 }));
signpost.name = 'signpost';
scene.add(signpost);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

With both parts non-indexed, the merge succeeds and the signpost is one mesh drawn in one call:

```text
look {}

On screen (1):
signpost 2.1% [569, 190, 798, 604] 2.4 × 1.3 units
Never visible: none

eval {"code": "const g = find(\"signpost\").geometry; return { index: g.index, attributes: Object.keys(g.attributes), vertices: g.attributes.position.count }"}

{"index":null,"attributes":["position","normal","uv"],"vertices":192}
```

The merged geometry has no index and the three attributes both parts share. For the attribute form of the message, the same idea applies: delete the extra attribute from the parts that have it (`geometry.deleteAttribute('color')`) or add a matching one to the parts that lack it, before calling `mergeGeometries()`.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Merge 2 geometries error "All geometries must have compatible attributes"](https://discourse.threejs.org/t/merge-2-geometries-error-all-geometries-must-have-compatible-attributes/15729) (discourse.threejs.org, 2,278 views, 1 post)
