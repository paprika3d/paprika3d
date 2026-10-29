---
title: Get the three.js bounding box and triangle count of a mesh or GLB model, and check it is watertight
phrase: three.js bounding box and triangle count
description: How to get a three.js object's bounding box, size and triangle count, the one-line way with Box3 and from a coding agent with the paprika3d plugin, which adds whether each mesh is closed (watertight), its volume and genus, a four-side picture with its size, and a GLB file's triangles read from the file without loading it.
meta: Get a three.js mesh or GLB model's bounding box and triangle count, and check it is watertight, with Box3 and the paprika3d tools.
intent: threejs-mesh-size-triangles
queries:
  - "Any way to get a bounding box from a three.js Object3D?"
  - "Find object dimensions in three.js"
  - "How can we get number of triangles, vertices, faces of GLB model"
  - "How to detect if imported STL is watertight?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Get the three.js bounding box and triangle count of a mesh or GLB model, and check it is watertight

## The one-line answer

three.js answers the size question itself. `new THREE.Box3().setFromObject(object)` walks the object and its children and returns the box around them in world space, axis-aligned; `getSize` and `getCenter` give its dimensions and middle. Triangles are a count on each geometry: the index count divided by three when the geometry has an index, the position count divided by three when it does not. Both run in the browser console or in the page, and neither needs any tool.

Three questions are left after that. A rotated object's box from `setFromObject` can be larger than the object, unless you pass `true` as its second argument. A count of triangles says nothing about whether the surface is closed, which 3D printing, boolean operations and volume all need. And counting a GLB model's triangles this way means loading it into a page first.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Its `eval` tool runs code in the page with `THREE`, `scene`, `find(name)` and `stats(target)` in scope; `stats` reports each mesh's vertices, triangles, world size, and whether its surface is closed, with the volume and genus of a closed one. `look` with `target` pictures one object from four sides with its size, and `model_audit` reads a .glb, .gltf or USD file's triangles, materials and textures from the file itself.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with four kinds of mesh

A group named `parts` holds a closed box, a pipe with open ends lying on its side, a ring turned 45 degrees, and a box with one triangle missing, built the way a broken STL export arrives: unindexed, with a hole where a face should be.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Parts</title>
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
scene.background = new THREE.Color(0x1e2228);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(1.5, 4, 11);
camera.lookAt(1.5, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 6, 4);
scene.add(sun);

const mat = (color) => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });
const parts = new THREE.Group();
parts.name = 'parts';

const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(0xb08850));
crate.name = 'crate';
crate.position.x = -3;

// A pipe with open ends, lying on its side.
const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2, 24, 1, true), mat(0x8090a0));
pipe.name = 'pipe';
pipe.rotation.z = Math.PI / 2;

// A ring turned 45 degrees about y: one hole through it.
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.2, 16, 48), mat(0xd0a040));
ring.name = 'ring';
ring.position.x = 3;
ring.rotation.y = Math.PI / 4;

// A box with one triangle missing, as a broken STL export arrives: unindexed, one face half open.
const broken = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
broken.setAttribute('position', new THREE.Float32BufferAttribute(broken.attributes.position.array.slice(0, -9), 3));
broken.computeVertexNormals();
const shell = new THREE.Mesh(broken, mat(0x60a070));
shell.name = 'shell';
shell.position.x = 6;

parts.add(crate, pipe, ring, shell);
scene.add(parts);

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

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); sizes and counts do not depend on the renderer. Run folder paths are shortened to `<project>`.

**1. Open the page.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:42917/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["parts"]}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-50-17-203Z
```

(The reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out here.)

**2. The box around a group, with `Box3`.** This is the line to use in your own code:

```text
eval {"code": "const box = new THREE.Box3().setFromObject(find('parts')); return { size: box.getSize(new THREE.Vector3()).toArray(), center: box.getCenter(new THREE.Vector3()).toArray(), min: box.min.toArray(), max: box.max.toArray() }"}

{"size":[10,1.6,1.414],"center":[1.5,0,0],"min":[-3.5,-0.8,-0.707],"max":[6.5,0.8,0.707]}
```

The group spans 10 units in x. Its depth of 1.414 comes from the turned ring, and is more than the ring really takes up.

**3. Loose and precise boxes.** By default `setFromObject` turns each geometry's own box into world space and boxes that, which grows for a rotated mesh. With `true` as the second argument it boxes the vertices themselves:

```text
eval {"code": "const ring = find('ring'); return { loose: new THREE.Box3().setFromObject(ring).getSize(new THREE.Vector3()).toArray(), precise: new THREE.Box3().setFromObject(ring, true).getSize(new THREE.Vector3()).toArray() }"}

{"loose":[1.414,1.6,1.414],"precise":[1.249,1.6,1.249]}
```

The precise box is slower, since it visits every vertex, and is the true answer for a turned or tilted object.

**4. Count triangles and vertices by hand.**

```text
eval {"code": "const out = {}; find('parts').traverse(o => { if (o.isMesh) { const g = o.geometry; out[o.name] = { vertices: g.attributes.position.count, triangles: (g.index ? g.index.count : g.attributes.position.count) / 3 }; } }); return out"}

{"crate":{"vertices":24,"triangles":12},"pipe":{"vertices":50,"triangles":48},"ring":{"vertices":833,"triangles":1536},"shell":{"vertices":33,"triangles":11}}
```

The crate has 24 vertices for 8 corners: three.js primitives split vertices at each hard edge, so each face has its own normals and texture coordinates. A vertex count from a geometry is a count of what the GPU receives, not of the shape's corners.

**5. Ask which meshes are closed.** `stats` welds vertices that share a position before it looks at the edges, so those split seams do not count as holes:

```text
eval {"code": "return stats('parts')"}

total  4 meshes  940 v  1,607 tri
crate  24 v  12 tri  closed  vol 1  genus 0  size 1×1×1  [position, normal, uv]
pipe  50 v  48 tri  open (48 edges)  size 2×0.6×0.6  [position, normal, uv]
ring  833 v  1,536 tri  closed  vol 0.46  genus 1  size 1.414×1.6×1.414  [position, normal, uv]
shell  33 v  11 tri  open (3 edges)  size 1×1×1  [position, normal, uv]
```

- `closed` means every edge is shared by two triangles: the surface is watertight. `open (3 edges)` on the shell is the missing triangle's three edges; on the pipe, the 48 open edges are its two rims of 24 segments each.
- `vol` is the enclosed volume, given for a closed surface and left out for an open one. The crate's is 1, as a unit cube's should be.
- `genus` is the number of holes through the shape: 0 for the crate, 1 for the ring. A shape meant to be solid with a genus above 0 has a tunnel through it.
- `size` is the world box of each mesh's own box, like the loose `Box3` above, so the turned ring reads 1.414 across, not 1.249.

**6. Picture one object from every side.** `look` with `target` frames the object alone from the front, right, top and a three-quarter angle, and states its size and centre:

```text
look {"target": "ring"}

Picture: <project>/paprika3d/runs/2026-10-28T05-50-17-203Z/look-1-views.png (front, right, top, three-quarter)
ring: size 1.414 × 1.6 × 1.414, centre [3, 0, 0]
```

**7. A GLB file's triangles, without loading it.** `model_audit` reads the file's JSON and image headers and needs no page. Here it reads a duck model (CC BY 4.0, "Duck" by AIUM2 on Sketchfab, optimized for the web by paprika3d) in the project's `models/` folder:

```text
model_audit {"cwd": "<project>", "path": "models/duck.glb"}

models/duck.glb · 384 KB · 19,148 triangles · 1 material · textures: 1024×1024 webp, 1024×1024 webp, 1024×1024 webp, 1024×1024 webp, 1024×1024 webp · Draco no, meshopt yes, KTX2 no
site: passes
```

The file is compressed with meshopt; `model_audit` reads Draco and meshopt files the same way, with no decoder. Without `path` it reports every model file in the project. Vertex counts, sizes and closed edges need the model loaded in a page, where `stats` gives them.

## What paprika3d does not do

- It does not repair an open mesh. `stats` names how many edges are open; closing them is a modelling step.
- `stats` and `look` `target` give the loose box for a rotated mesh. Use `setFromObject(object, true)` in `eval` for the tight one.
- `stats` ignores geometry groups and draw ranges, and measures skinned and morphed meshes in their rest pose.

## Pitfalls

- **Update matrices before measuring.** `setFromObject` reads world matrices; for an object you just moved outside the render loop, call `object.updateWorldMatrix(true, true)` first.
- **Know the units.** A model exported in centimetres measures 100 times too large in a scene in metres, and the box is the quick check.
- **Non-indexed is not broken.** An STL loads unindexed, with every triangle's corners separate; a check that does not weld by position reports every edge as open.
- **Count after compression is undone.** A Draco or meshopt file's triangle count is the count after decoding; the file size says nothing about it.

## Without paprika3d

`Box3.setFromObject`, the index and position counts, and `renderer.info.render.triangles` (the triangles of the last frame drawn) need nothing beyond three.js. For watertightness, weld the vertices with `mergeVertices` from `three/addons/utils/BufferGeometryUtils.js` (after deleting the normal and uv attributes, so positions alone decide), then count how many triangles share each edge: every edge used exactly twice means a closed surface. For a model file, the glTF Transform command line's `inspect` lists each mesh's vertices and primitives, and Blender's statistics overlay shows the triangles of an imported model.
