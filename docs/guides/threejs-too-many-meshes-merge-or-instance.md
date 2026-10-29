---
title: three.js too many meshes? Merge, instance or batch, chosen by what each one keeps
phrase: three.js too many meshes
description: How to cut the draw calls of a three.js scene made of thousands of separate meshes, and how to choose between mergeGeometries, InstancedMesh and BatchedMesh by what each keeps (moving one object, culling, picking); a coding agent finds the group that costs the draw calls with the paprika3d plugin's perf costs and counts each version on a fresh page with perf variants.
meta: three.js too many meshes: find the group costing the draw calls, then merge, instance or batch it. What each one keeps, counted in one perf call.
intent: too-many-meshes-merge-or-instance
queries:
  - "How can I optimise my THREE.JS rendering?"
  - "What is the recommended way to do sprite or mesh batching?"
  - "How to merge meshes from imported 3D Model (glb or gltf)?"
  - "Minimizing number of Three.js Draws"
  - "How to choose between InstancedMesh and BatchedMesh?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js too many meshes? Merge, instance or batch, chosen by what each one keeps

## Three ways to draw many meshes in fewer calls

Each visible mesh costs at least one draw call, one per material, and each draw call costs CPU time in the browser and the graphics driver. A scene of thousands of small meshes can spend its frame on draw calls while the GPU waits. three.js offers three ways to draw many meshes in one call, and they differ in what they need and in what they keep:

| | Needs | Keeps | Gives up |
|---|---|---|---|
| `InstancedMesh` | one geometry and one material for all | a matrix and a colour per instance, raycasts with `instanceId` | culling per object: one bounding sphere decides for all |
| `mergeGeometries` (`BufferGeometryUtils`) | one material (or one call per material group), compatible attributes | nothing per object: the result is one plain mesh | moving, hiding or picking one object, and culling per object |
| `BatchedMesh` | one material; the most instances, vertices and indices given up front | a matrix, visibility and culling per object, raycasts with `batchId` | the space it reserves, and one material for all |

So the choice follows from what the objects are: identical props are instances, a static set of different shapes that never moves alone can be merged, and different shapes that still move, hide or need culling one by one are a batch.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `perf` with `costs: true` lists the scene's draw calls and triangles by named group, so the group to fix is named before any code changes. `perf` with `variants` loads each version of the page on a fresh page in one call and reports its draw calls and triangles as drawn, which shows what each method saves and what it sends that it did not before.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A quarry of crates and rocks

400 crates that share one box and one material, and 300 rocks that share one material but each have their own shape. With no query string every crate and every rock is its own `Mesh`. `?crates=instanced` draws the crates as one `InstancedMesh`; `?rocks=merged` and `?rocks=batched` draw the rocks as one merged mesh or one `BatchedMesh`. The camera sees most of the crates and about half of the rocks.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Quarry</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ?crates=instanced draws the crates as one InstancedMesh; ?rocks=merged or ?rocks=batched draws the rocks
// as one merged mesh or one BatchedMesh. With no query, every crate and every rock is its own Mesh.
const params = new URLSearchParams(location.search);
const CRATES = params.get('crates'), ROCKS = params.get('rocks');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8c6d4);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
camera.position.set(-6, 9, 34);
camera.lookAt(-6, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x665544, 2.2));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x8a7f6a }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// A seeded random, so every load builds the same rocks.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const spot = new THREE.Object3D();

// 400 crates: one geometry, one material, so they can be instanced.
const box = new THREE.BoxGeometry(1, 1, 1);
const wood = new THREE.MeshStandardMaterial({ color: 0xa47c48 });
const crates = new THREE.Group();
crates.name = 'crates';
const crateSpots = [];
for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
  spot.position.set(-34 + i * 1.6, 0.5, -16 + j * 1.6);
  spot.updateMatrix();
  crateSpots.push(spot.matrix.clone());
}
if (CRATES === 'instanced') {
  const many = new THREE.InstancedMesh(box, wood, crateSpots.length);
  crateSpots.forEach((m, k) => many.setMatrixAt(k, m));
  crates.add(many);
} else {
  for (const m of crateSpots) { const crate = new THREE.Mesh(box, wood); crate.applyMatrix4(m); crates.add(crate); }
}
scene.add(crates);

// 300 rocks: one material, but each rock its own shape, so they cannot be instanced.
const stone = new THREE.MeshStandardMaterial({ color: 0x77736c, flatShading: true });
const rockShapes = [], rockSpots = [];
for (let k = 0; k < 300; k++) {
  const g = new THREE.IcosahedronGeometry(0.7, 1);
  const p = g.attributes.position;
  const [sx, sy, sz] = [0.8 + rand() * 0.4, 0.6 + rand() * 0.4, 0.8 + rand() * 0.4], bump = rand() * 100;
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
    const n = 0.85 + 0.3 * Math.abs(Math.sin(x * 12.9 + y * 78.2 + z * 37.7 + bump));   // the same for a corner shared by two faces
    p.setXYZ(v, x * sx * n, y * sy * n, z * sz * n);
  }
  g.computeVertexNormals();
  rockShapes.push(g);
  spot.position.set(4 + (k % 15) * 2.2 + rand(), 0.3, -24 + Math.floor(k / 15) * 2.4 + rand());
  spot.rotation.y = rand() * Math.PI * 2;
  spot.updateMatrix();
  rockSpots.push(spot.matrix.clone());
}
const rocks = new THREE.Group();
rocks.name = 'rocks';
if (ROCKS === 'merged') {
  // Bake each rock's place into its vertices, then join them into one geometry: one draw call, one bounding sphere.
  rocks.add(new THREE.Mesh(mergeGeometries(rockShapes.map((g, k) => g.clone().applyMatrix4(rockSpots[k]))), stone));
} else if (ROCKS === 'batched') {
  // One draw call, with each rock still placed, shown, hidden and culled on its own.
  const vertices = rockShapes.reduce((n, g) => n + g.attributes.position.count, 0);
  const batch = new THREE.BatchedMesh(rockShapes.length, vertices, 0, stone);
  rockShapes.forEach((g, k) => batch.setMatrixAt(batch.addInstance(batch.addGeometry(g)), rockSpots[k]));
  rocks.add(batch);
} else {
  rockShapes.forEach((g, k) => { const rock = new THREE.Mesh(g, stone); rock.applyMatrix4(rockSpots[k]); rocks.add(rock); });
}
scene.add(rocks);

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

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew the page in software (SwiftShader). Draw calls and triangles are counts and come out the same on any machine; the frame times beside them came from a software renderer on a loaded host and are not used here. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Find the group that costs the draw calls.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:36611/index.html in 0.4 s, paused at frame 0.

perf {"costs": true}

151.3 ms median frame (p95 1670.1 ms, 2 fps on average), 528 draw calls, 17818 triangles, 0 MB assets; over budget: frameMs 151.3 of 16.7 ms; desktop budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Costs by named group: the main scene's visible objects, each under its nearest named ancestor as `look` names it, counted, not timed, and with no frustum culling (the frame draws only what its camera sees, plus a shadow pass per casting light); `variants` with `hide` times a group. In all 28802 triangles, 0 casting shadows, 701 draw calls, 0 MB of textures (the first line's 17818 triangles and 528 draw calls are the frame as drawn, the camera's view plus the shadow pass):
  rocks: 24000 triangles, 0 casting shadows, 300 draw calls, 0 MB of textures
  crates: 4800 triangles, 0 casting shadows, 400 draw calls, 0 MB of textures
  ground: 2 triangles, 0 casting shadows, 1 draw calls, 0 MB of textures
```

The table counts every object, seen or not: 701 draw calls, 400 of them crates and 300 rocks. The first line is the frame as drawn: 528 draw calls and 17818 triangles, because three left out the meshes outside the camera's view. There is no shadow-casting light here, so the whole gap between the two is culling, though the reply's wording also allows for a shadow pass. Both groups are worth fixing, and they need different methods: the crates can be instanced, the rocks cannot, since no two rocks share a geometry.

**2. Count each version on a fresh page.** Each `query` variant loads the page with that query string and measures it against the unchanged page:

```text
perf {"variants": [{"label": "crates instanced", "query": "crates=instanced"}, {"label": "rocks merged", "query": "rocks=merged"}, {"label": "rocks batched", "query": "rocks=batched"}, {"label": "instanced and batched", "query": "crates=instanced&rocks=batched"}]}

baseline: 153.5 ms median (p95 249.1), work 144.1 ms, 528 draw calls, 17818 triangles; over budget: frameMs 153.5 of 16.7 ms; desktop budget
crates instanced: 774.4 ms median (p95 944.6), work 209.2 ms, 171 draw calls, 18322 triangles; +404% vs baseline; −68% draw calls, +3% triangles
rocks merged: 191.1 ms median (p95 1238.2), work 200.1 ms, 360 draw calls, 28298 triangles; within the noise of the baseline; −32% draw calls, +59% triangles
rocks batched: 132.1 ms median (p95 311.9), work 125 ms, 360 draw calls, 17818 triangles; within the noise of the baseline; −32% draw calls
instanced and batched: 160.1 ms median (p95 200.4), work 140 ms, 3 draw calls, 18322 triangles; within the noise of the baseline; −99% draw calls, +3% triangles
Host load 35.0 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

Read the two count columns, not the times:

- **Instancing the crates** takes the frame from 528 to 171 draw calls, and the triangles go up by 3%: the one `InstancedMesh` is in view, so all 400 crates are sent, the ones the camera does not see included.
- **Merging the rocks** saves the same draw calls as batching them (both reach 360), and sends 28298 triangles instead of 17818: the merged mesh has one bounding sphere, so every rock is drawn whenever any rock is in view.
- **Batching the rocks** keeps the triangles at 17818, the same as separate meshes, because `BatchedMesh` still culls each rock on its own.
- **Both together** draw the scene in 3 calls: ground, crates and rocks.

The times on this host go every which way, from +404% to within the noise, which is what a software renderer under load does; they say nothing about a GPU. On a machine with one, the same call gives the times that decide whether the draw calls saved are worth the extra triangles, and its noise line says which differences are real.

**3. See what the scene looks like to the tools afterwards.** On the instanced and merged version:

```text
look {}

On screen (358):
ground 43% [0, 259, 1279, 799] 120 × 120 units
rocks 9% [790, 296, 1279, 765] 48 × 33.4 units
crates* ×356 15% [0, 313, 760, 556]
```

`crates* ×356` is one instanced mesh with 356 of its instances on screen, each still told apart in `look`'s ID image. `rocks` is now one object, 48 by 33.4 units, where it was 167 before. The batched version lists `rocks` as one object too: `look` counts the instances of an `InstancedMesh` but not the objects inside a `BatchedMesh` or a merged mesh. A raycast in the page still tells batched rocks apart (`batchId` on the hit) and cannot tell merged ones apart at all.

## A glTF made of many meshes

A model exported with hundreds of parts loads as hundreds of meshes, one draw call per part and material. With the model in a named group, `perf` with `costs` gives its draw calls on one line. If the parts never move apart, merge them per material: collect each mesh's geometry with `applyMatrix4(mesh.matrixWorld)` so its place is baked in, group the geometries by material, and call `mergeGeometries` once per group. All geometries in one call must have the same attributes, all indexed or none; when one differs, the call returns null with the error the [mergeGeometries error page](/errors/mergegeometries-compatible-attributes) explains. If parts must still move (a door, a wheel), leave those out of the merge.

## The instancing switch of `perf` with `optimize: true`

`perf` with `optimize: true` tries an `instancing` switch that does the crates' job at run time: the page imports paprika3d's runtime layer, and the switch draws still meshes that share a geometry and material as one instanced mesh, keeping the originals in the scene. It was tried alone on this page, before the switch search moved from its own tool into `perf`, with that tool's `switches` option; `perf` takes no list of switches:

```text
optimize {"switches": ["instancing"]}

✗ instancing (gain): no gain — 179.3 → 139.5 ms, 528 → 528 calls
Kept nothing: 179.3 → 179.3 ms median, 528 → 528 calls; wrote <project>/game-runtime.json
```

The draw calls did not change, and the reason is this host: the layer groups meshes once they have stood still for a number of frames, and a software renderer drew too few frames in the measurement to reach the first grouping. On a machine with a GPU the switch has the frames it needs. Read its line for the calls before and after, and treat it as a measurement, not a promise.

## What paprika3d does not do

- It does not merge, instance or batch a scene's own meshes in its source. The agent writes the change; `perf` counts it.
- `look` does not list the objects inside a `BatchedMesh` or a merged mesh by name or count.
- The cost table counts before culling and the first line after it; neither times a group. `variants` with `hide` times one, on a machine where times mean something.
- It does not batch sprites. Each `THREE.Sprite` is its own draw call; many of them become one `Points` object or an `InstancedMesh` of planes, written by hand.

## Pitfalls

- **Merging is permanent until rebuilt.** One merged mesh cannot move, hide or recolour one of its parts; keep anything that changes out of it.
- **One instanced or merged mesh culls as a whole.** A field of instances that spans the level sends every instance every frame; the [InstancedMesh disappears guide](/guides/threejs-instancedmesh-disappears-frustum-culling) counts what splitting it by area saves.
- **Materials multiply draw calls.** A mesh with three materials is three calls, and two meshes with equal but separate material objects cannot share an instance or a batch; reuse one material object.
- **Shadows draw casters again.** Each shadow-casting light draws its casters once more, so a merged or instanced caster saves calls twice.
- **Name the groups.** The cost table and `hide` work by name; an unnamed mesh is counted under its nearest named ancestor.

## Without paprika3d

`renderer.info.render.calls` after a render gives the draw calls of that frame, and `renderer.info.render.triangles` its triangles; read them before and after each change. A `scene.traverse` that counts meshes by geometry and material shows which ones could be instanced. The three.js docs for `InstancedMesh`, `BatchedMesh` and `BufferGeometryUtils.mergeGeometries` give the constructors used above, and the `webgl_mesh_batch` example compares `BatchedMesh` with separate meshes in the page.
