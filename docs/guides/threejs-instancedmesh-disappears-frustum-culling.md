---
title: three.js InstancedMesh disappears when the camera moves? Check its bounding sphere
phrase: three.js instancedmesh disappears
description: Why a three.js InstancedMesh vanishes when the camera turns, or draws instances behind the camera, and how a coding agent finds the stale bounding sphere with the paprika3d plugin's look and eval, fixes it with computeBoundingSphere, and counts what splitting the mesh into chunks saves with perf.
meta: three.js InstancedMesh disappears when the camera turns: one bounding sphere culls every instance. Find a stale one and recompute it.
intent: instancedmesh-disappears-frustum-culling
queries:
  - "How to do frustum culling with instancedMesh?"
  - "[SOLVED] Camera Rendering Instanced Objects Behind Camera"
  - "Instance mesh culling"
  - "Ideas on performing fast per-instance frustum culling on InstancedMesh"
  - "Problems with instanced mesh not displaying anything"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js InstancedMesh disappears when the camera moves? Check its bounding sphere

## One sphere for every instance

three.js decides whether to draw a mesh by testing its bounding sphere against the camera's view. An `InstancedMesh` is one object with one sphere, so the test is all or nothing: when the sphere is in view every instance is drawn, including the ones behind the camera, and when it is out of view none is. That one rule explains both kinds of thread.

- **Everything vanishes at some camera angles.** The sphere is computed the first time the renderer tests the mesh, from the instance matrices at that moment, and never again by itself. `setMatrixAt` does not touch it. Instances placed after the first frame (positions from a fetch, a level loaded later) or moved far from where they started leave a sphere that no longer covers them. A sphere computed while every matrix was still the identity sits at the origin with the size of one instance, so the whole set draws when the camera faces the origin and vanishes when it turns away.
- **Instances behind the camera are still drawn.** With a correct sphere around a large field, the sphere is almost always in view, so the frame sends every instance to the GPU and lets it clip the ones off screen.

The fix for the first is one call after the matrices change: `mesh.computeBoundingSphere()`. `frustumCulled = false` also stops the vanishing, by never culling at all. The second has no switch in `InstancedMesh`: split the set into several meshes by area, each with its own sphere, or use a `BatchedMesh`, which tests each of its objects on its own (`perObjectFrustumCulled`, on by default).

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Its `look` names a named mesh that never drew a pixel, and a `cameras` grid shows the angles at which it draws; `eval` puts the sphere beside the span of the instances; `perf` counts the triangles a frame sends, so the cost of drawing instances off screen is a number.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A forest whose positions arrive late

900 trees on a grid 200 units across, one `InstancedMesh`. The positions are set on the second frame, as they would be after a fetch, so the mesh has already drawn once with every instance at the origin. The page recomputes the sphere after placing them; `?bug=stale` leaves that line out, and `?chunks` builds the forest as 16 meshes, one per area. The camera, named `walker`, stands at the forest's edge looking along it, away from the origin.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Forest</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// ?bug=stale places the trees without recomputing the bounding sphere; ?chunks splits the forest into 16 meshes.
const params = new URLSearchParams(location.search);
const STALE = params.get('bug') === 'stale', CHUNKS = params.has('chunks');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e0);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 400);
camera.name = 'walker';
camera.position.set(90, 5, 108);
camera.lookAt(90, 2, 60);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 2));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x6b8f4e }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// 900 trees on a 30 x 30 grid, 200 units across: one InstancedMesh, or 16 by area with ?chunks.
const cone = new THREE.ConeGeometry(1.5, 6, 16).translate(0, 3, 0);
const leaves = new THREE.MeshStandardMaterial({ color: 0x2f5d34 });
const forest = new THREE.Group();
forest.name = 'forest';
scene.add(forest);
const meshes = new Map();
const meshFor = (x, z) => {
  const cell = (v) => Math.min(3, Math.floor((v + 100) / 50));
  const key = CHUNKS ? `${cell(x)},${cell(z)}` : 'all';
  if (!meshes.has(key)) meshes.set(key, []);
  return meshes.get(key);
};
for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) {
  const x = -100 + i * 200 / 29, z = -100 + j * 200 / 29;
  meshFor(x, z).push([x, z]);
}
const spot = new THREE.Object3D();
const built = [...meshes.values()].map(points => {
  const m = new THREE.InstancedMesh(cone, leaves, points.length);
  m.name = 'trees';
  forest.add(m);
  return { m, points };
});

// The positions arrive after the first frame, as from a fetch: the meshes have drawn once with every instance at the origin.
function place() {
  for (const { m, points } of built) {
    points.forEach(([x, z], k) => { spot.position.set(x, 0, z); spot.updateMatrix(); m.setMatrixAt(k, spot.matrix); });
    m.instanceMatrix.needsUpdate = true;
    if (!STALE) m.computeBoundingSphere();   // the line the stale version leaves out
  }
}

let frame = 0;
renderer.setAnimationLoop(() => {
  if (++frame === 2) place();
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

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew the page in software (SwiftShader). Culling happens before anything reaches the GPU, so the pictures and counts below are the same on a machine with one; the frame times in the `perf` reply are not used. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the stale page and draw a few frames.** `open` pauses at frame 0, before the trees are placed. `interact` runs three frames and draws each one (the `wait` step's `draw` switch), as a browser would, so the first frame's sphere is the one the page keeps:

```text
open {"url": "index.html?bug=stale", "cwd": "<project>"}

Opened http://127.0.0.1:40893/index.html?bug=stale in 0.2 s, paused at frame 0.

interact {"steps": [{"wait": 3, "draw": true}]}

{"after":null,"changed":{}}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-15-49-703Z/look-1.png
On screen (1):
ground 50% [0, 366, 1279, 799] 220 × 220 units
Never visible: trees (203 units, in view, behind ground)
In view but no pixel: too small for the scene (check its size against the scene), hidden behind something, or not drawn.
```

The picture is bare ground. `Never visible` names `trees`, gives its size from the instances' real positions, and says it is in view. Its guess, `behind ground`, is not the cause here: the last of the three reasons on the next line, not drawn, is. `look` measures where the instances are; three culls by a sphere that says something else.

**2. Turn the camera.** A `cameras` grid pictures the page from other places without moving the page's own camera:

```text
look {"cameras": [{"label": "toward the origin", "position": [90, 5, 108], "lookAt": [0, 2, 0]}, {"label": "the walker", "position": [90, 5, 108], "lookAt": [90, 2, 60]}]}

Picture: <project>/paprika3d/runs/2026-10-28T10-15-49-703Z/look-3-cameras.png (2 cameras, left to right, top to bottom, at frame 3, no reload; the game's own camera is not moved)
toward the origin: on screen: ground, trees* ×371; pixels: brightness 49%, colour saturation 41%, 0% near black, 0% blown out
the walker: on screen: ground; world's edge 6% of the picture; pixels: brightness 57%, colour saturation 38%, 0% near black, 0% blown out
```

From the same spot, facing the origin shows 371 trees and facing along the forest shows none. A set that comes and goes as a whole with the camera's direction, and comes back when the origin is in view, is the stale sphere's signature.

**3. Put the sphere beside the instances.** `eval` reads the sphere and the span of the instance positions from their matrices:

```text
eval {"code": "const m = find(\"trees\");\nconst box = new THREE.Box3(), p = new THREE.Vector3(), mat = new THREE.Matrix4();\nfor (let i = 0; i < m.count; i++) { m.getMatrixAt(i, mat); box.expandByPoint(p.setFromMatrixPosition(mat)); }\nconst s = m.boundingSphere;\nreturn { instances: m.count, frustumCulled: m.frustumCulled, sphere: s && { center: s.center.toArray().map(Math.round), radius: +s.radius.toFixed(1) }, instancesFrom: box.min.toArray().map(Math.round), instancesTo: box.max.toArray().map(Math.round) }"}

{"instances":900,"frustumCulled":true,"sphere":{"center":[0,3,0],"radius":3.4},"instancesFrom":[-100,0,-100],"instancesTo":[100,0,100]}
```

A sphere 3.4 units across the origin for instances spread from -100 to 100 is the whole answer. A `sphere` of `null` would mean the mesh has not been tested yet, which is no fault; `frustumCulled: false` would rule culling out.

**4. Try the fix on the live page.** Recompute the sphere, draw a frame, and look again:

```text
eval {"code": "find(\"trees\").computeBoundingSphere();\nconst s = find(\"trees\").boundingSphere;\nreturn { center: s.center.toArray().map(Math.round), radius: +s.radius.toFixed(1) }"}

{"center":[-48,3,-2],"radius":183}

interact {"steps": [{"wait": 1}]}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-15-49-703Z/look-4.png
Pixels: brightness 48%, colour saturation 42%, 0% near black, 0% blown out; 42% of the picture changed since the last look.
On screen (214):
ground 17% [0, 366, 1279, 799] 220 × 220 units
trees* ×213 39% [0, 239, 1279, 799]
Never visible: none
```

213 trees are on screen from the walker's view. In the source the fix is the line the stale version leaves out: `computeBoundingSphere()` after every batch of `setMatrixAt` calls that moves instances, next to `instanceMatrix.needsUpdate = true`. The new sphere is larger than the forest needs (three builds it by merging one sphere per instance), which costs nothing but a little culling.

**5. Count what the frame sends.** With the sphere right, the forest is one object in view, so every frame draws all 900 trees, the ones behind the walker included. `perf` with a `query` variant loads the 16-chunk version on a fresh page and compares the counts:

```text
perf {"variants": [{"label": "16 chunks", "query": "chunks"}]}

baseline: 167.4 ms median (p95 248.2), work 967.3 ms, 2 draw calls, 28802 triangles; over budget: frameMs 167.4 of 16.7 ms; desktop budget
16 chunks: 137.8 ms median (p95 460.8), work 600.4 ms, 12 draw calls, 19810 triangles; −18% vs baseline; +500% draw calls, −31% triangles
Host load 36.6 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

The counts are the result. The single mesh sends every tree in one draw call, 28802 triangles with the ground's two. The chunked version sends 19810 triangles in 12 draw calls: the ground and the 11 chunks whose spheres touch the view. The frame times come from a software renderer on a loaded host and decide nothing. On a GPU, whether 31% fewer triangles is worth ten more draw calls depends on the triangles per instance: a few thousand trees of a few dozen triangles each, as here, rarely need it; a crowd of detailed characters may. Run the same call on the machine that will play the page.

## Which fix to use

| Situation | Fix |
|---|---|
| Instances placed or moved after the first frame | `computeBoundingSphere()` after the matrices change |
| Instances that move every frame (a flock, particles as meshes) | `frustumCulled = false`, or a sphere computed once to cover their whole range |
| A large field where most instances are off screen | several meshes by area, each with its own sphere |
| Many objects that should each be culled | `BatchedMesh`, which culls per object by default |

## What paprika3d does not do

- No line names a stale bounding sphere. `Never visible` names a named mesh that drew nothing while in view, and its guess at a reason can be wrong, as in step 1; the `eval` in step 3 is the check.
- `Never visible` lists meshes by their own name. An unnamed `InstancedMesh` inside a named group is left out of that line, though `On screen` counts it under the group's name; name the mesh itself.
- It does not cull for you or split a mesh into chunks. The page does that in its own code.
- `perf`'s cost table (`costs: true`) counts every visible object with no frustum culling, so it lists all 900 trees either way; the first line and the variant lines are the frame as drawn.

## Pitfalls

- **Raycasts use the same sphere.** `InstancedMesh.raycast` tests the bounding sphere before any instance, so a stale sphere makes clicks miss the instances it does not cover.
- **The bounding box has the same rule.** `computeBoundingBox()` is the box's version; code that reads `mesh.boundingBox` after moving instances needs it.
- **`count` changes the sphere too.** The sphere covers the first `count` instances when it is computed; raising `count` later adds instances it does not cover.
- **Draw a frame before you look.** A paused page shows its last drawn frame, so an `eval` change shows after an `interact` step draws one.

## Without paprika3d

In the console, `mesh.boundingSphere` beside a loop over `getMatrixAt` gives the same comparison as step 3. A `THREE.Box3Helper` of `mesh.boundingBox`, or a wireframe sphere placed at `mesh.boundingSphere.center` with its radius, shows the culling volume in the scene. The three.js docs for `InstancedMesh` say the sphere may need recomputing after `setMatrixAt`, and the `webgl_mesh_batch` example shows a `BatchedMesh` with per-object culling.
