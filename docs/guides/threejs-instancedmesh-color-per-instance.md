---
title: three.js InstancedMesh color per instance, and why setColorAt changes nothing
phrase: three.js instancedmesh color per instance
description: How to give each instance of a three.js InstancedMesh its own colour with setColorAt, and the three faults behind "setColorAt doesn't work" (vertexColors on the material, a mesh made with no room, a change never uploaded), each told apart by one eval call and checked against the drawn pixels with the paprika3d plugin's look sample.
meta: three.js InstancedMesh color per instance with setColorAt, and the three reasons it shows black, nothing or the old colour, told apart in one call.
intent: instancedmesh-per-instance-color
queries:
  - "How to change texture/color per object instance in InstancedMesh"
  - "Many meshes with the same geometry and material, can I change their colors?"
  - "InstancedMesh.setColorAt doesn't works"
  - "Dynamic color meshStandardMaterial in instancedMesh"
  - "InstancedMesh color doesn't work when initial count is 0"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js InstancedMesh color per instance, and why setColorAt changes nothing

## How an instance gets its colour

An `InstancedMesh` draws many copies of one geometry with one material in one draw call. Each copy has its own matrix in `instanceMatrix`, and it can have its own colour in a second attribute, `instanceColor`. That attribute does not exist until the first `setColorAt(i, color)` call creates it, sized for the mesh's capacity: the third argument of the constructor, fixed for the life of the mesh. The shader multiplies each instance's colour into the material's colour, so a white `material.color` shows the instance colours as they are and any other colour tints them all.

Three things go wrong often enough to fill the threads:

1. **`vertexColors: true` on the material.** It is the switch for a `color` attribute on the geometry, not for instance colours. On a geometry with no such attribute every instance draws black.
2. **A mesh made with no room.** `new THREE.InstancedMesh(geometry, material, 0)`, with the plan of raising `count` later, gives a matrix buffer and a colour buffer with no slots. `setMatrixAt` and `setColorAt` write nowhere, raising `count` adds no room, and nothing draws.
3. **A change never uploaded.** Colours set before the first frame upload with it. A colour changed after that stays on the CPU until `mesh.instanceColor.needsUpdate = true`, the same rule as `instanceMatrix.needsUpdate` for positions.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. No reply line names these three faults. What the tools give is the two readings that tell them apart: `eval` returns the mesh's capacity, the colour buffer's size, its upload version and its first value, and `look` with `sample` returns the colour drawn at a point on the page. A colour buffer that holds one colour while the pixel shows another is fault 3; an empty buffer is fault 2; black pixels over a full buffer with `vertexColors` on is fault 1.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A shelf of jars

64 jars in four colours, one `InstancedMesh`. With no query string the page draws them correctly. `?bug=vertexcolors`, `?bug=empty` and `?bug=noupdate` each switch on one of the three faults; in the last, every jar is meant to turn grey on the second frame, as a "sold out" state would.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Shelf</title>
<style>html,body{margin:0;overflow:hidden;background:#1b1e24}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// ?bug=vertexcolors, ?bug=empty or ?bug=noupdate shows one of the three faults; no query draws it right.
const BUG = new URLSearchParams(location.search).get('bug');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1e24);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 16);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));

// 64 jars on a shelf: one geometry, one material, one draw call.
const COUNT = 64;
const jarMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, vertexColors: BUG === 'vertexcolors' });
const jars = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 24, 16), jarMaterial, BUG === 'empty' ? 0 : COUNT);
jars.name = 'jars';
scene.add(jars);

const palette = [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d];
const place = new THREE.Object3D(), color = new THREE.Color();
function fill(n) {
  jars.count = n;
  for (let i = 0; i < n; i++) {
    place.position.set((i % 16) - 7.5, 1.5 - Math.floor(i / 16), 0);
    place.updateMatrix();
    jars.setMatrixAt(i, place.matrix);
    jars.setColorAt(i, color.setHex(palette[i % 4]));
  }
  jars.instanceMatrix.needsUpdate = true;
  if (jars.instanceColor) jars.instanceColor.needsUpdate = true;
}
// The 'empty' bug: made with count 0, filled later (as a loader that does not know the count yet would).
fill(COUNT);

// One frame in, every jar turns grey to mark it sold out; the 'noupdate' bug forgets to upload the change.
let frame = 0;
renderer.setAnimationLoop(() => {
  if (++frame === 2 && BUG === 'noupdate') {
    for (let i = 0; i < COUNT; i++) jars.setColorAt(i, color.set(0x777777));
  }
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

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew the page in software (SwiftShader); instance colours are drawn the same way on a GPU, and nothing below depends on timing. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The four sample points are the centres of the first four jars, read off the box `look` gives for `jars`.

**1. The correct page.** `look` with `sample` reads the drawn colour at each point, so "is each jar its own colour" is four hex values rather than a judgement of a picture:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:34715/index.html in 0.2 s, paused at frame 0.

look {"sample": [[121, 296], [190, 296], [259, 296], [328, 296]]}

Hues: blue 82%, orange 6%, cyan 6%, red 6% of the frame; over the objects (23.8% of it): cyan 25%, orange 25%, blue 25%, red 25%.
On screen (64):
jars* ×64 24% [86, 262, 1193, 537]
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (121, 296) #95212a, (190, 296) #9e683c, (259, 296) #17645b, (328, 296) #294d64.
```

`jars* ×64` is one object drawn 64 times, and the `Hues` line splits the jars into four equal colours. The sampled colours are darker than the palette's hex values because the jars are shaded by the light; what matters is that the four differ.

**2. Fault 1: every jar black.** The same calls on `index.html?bug=vertexcolors`, then the `eval` that reads everything the three faults depend on:

```text
look {"sample": [[121, 296], [190, 296], [259, 296], [328, 296]]}

Hues: blue 76%, grey 24% of the frame; over the objects (23.8% of it): grey 100%.
On screen (64):
jars* ×64 24% [86, 262, 1193, 537]
Colours (5 × 5 mean, in the page's pixels): (121, 296) #000000, (190, 296) #000000, (259, 296) #000000, (328, 296) #000000.

eval {"code": "const m = find(\"jars\");\nreturn { count: m.count, capacity: m.instanceMatrix.count, instanceColor: m.instanceColor && { slots: m.instanceColor.count, version: m.instanceColor.version, first: [...m.instanceColor.array.slice(0, 3)].map(v => +v.toFixed(3)) }, vertexColors: m.material.vertexColors, geometryHasColor: !!m.geometry.attributes.color }"}

{"count":64,"capacity":64,"instanceColor":{"slots":64,"version":1,"first":[0.791,0.041,0.061]},"vertexColors":true,"geometryHasColor":false}
```

The colour buffer is full and right (the first jar's red, in linear values), and the pixels are `#000000`. `vertexColors: true` with `geometryHasColor: false` is the cause: the shader multiplies in a vertex colour the geometry does not have. Try the fix on the live page before editing the source; a material switch needs `needsUpdate` so three builds its shader again, and a frame has to draw before `look` can see it:

```text
eval {"code": "const m = find(\"jars\");\nm.material.vertexColors = false;\nm.material.needsUpdate = true;"}

interact {"steps": [{"wait": 1}]}

look {"sample": [[121, 296], [190, 296], [259, 296], [328, 296]]}

Colours (5 × 5 mean, in the page's pixels): (121, 296) #95212a, (190, 296) #9e683c, (259, 296) #17645b, (328, 296) #294d64.
```

The four colours match step 1.

**3. Fault 2: nothing draws.** On `index.html?bug=empty`:

```text
look {"sample": [[121, 296], [190, 296], [259, 296], [328, 296]]}

On screen (0):
Never visible: jars (null units, in view)
In view but no pixel: too small for the scene (check its size against the scene), hidden behind something, or not drawn.
Colours (5 × 5 mean, in the page's pixels): (121, 296) #1b1e24, (190, 296) #1b1e24, (259, 296) #1b1e24, (328, 296) #1b1e24.

eval {"code": "const m = find(\"jars\");\nreturn { count: m.count, capacity: m.instanceMatrix.count, instanceColor: m.instanceColor && { slots: m.instanceColor.count, version: m.instanceColor.version, first: [...m.instanceColor.array.slice(0, 3)].map(v => +v.toFixed(3)) }, vertexColors: m.material.vertexColors, geometryHasColor: !!m.geometry.attributes.color }"}

{"count":64,"capacity":0,"instanceColor":{"slots":0,"version":1,"first":[]},"vertexColors":false,"geometryHasColor":false}
```

`Never visible` names the mesh, and the samples are the background colour. The `eval` says why: `count` is 64 but `capacity` is 0, and the colour buffer has 0 slots. Raising `count` asks for 64 instances from buffers that hold none. The fix is in the constructor: make the mesh with the most instances it will ever draw, and lower `count` to show fewer. There is no `eval` fix short of building a new mesh, so this one goes straight into the source.

**4. Fault 3: the change never shows.** On `index.html?bug=noupdate`, the page turns every jar grey on its second frame. The `wait` step's `draw` switch makes `interact` draw each of the five frames, as a browser would; without it a step draws its last frame alone, and the first upload would already carry the grey.

```text
interact {"steps": [{"wait": 5, "draw": true}]}

look {"sample": [[121, 296], [190, 296], [259, 296], [328, 296]]}

Colours (5 × 5 mean, in the page's pixels): (121, 296) #95212a, (190, 296) #9e683c, (259, 296) #17645b, (328, 296) #294d64.

eval {"code": "const m = find(\"jars\");\nreturn { count: m.count, capacity: m.instanceMatrix.count, instanceColor: m.instanceColor && { slots: m.instanceColor.count, version: m.instanceColor.version, first: [...m.instanceColor.array.slice(0, 3)].map(v => +v.toFixed(3)) }, vertexColors: m.material.vertexColors, geometryHasColor: !!m.geometry.attributes.color }"}

{"count":64,"capacity":64,"instanceColor":{"slots":64,"version":1,"first":[0.184,0.184,0.184]},"vertexColors":false,"geometryHasColor":false}
```

The buffer holds grey (0x777777 is 0.184 in linear) and the pixels are still the four colours: the array changed and its `version` did not, so the renderer never sent it again. Setting the flag bumps the version, and the next drawn frame uploads it:

```text
eval {"code": "find(\"jars\").instanceColor.needsUpdate = true;\nreturn find(\"jars\").instanceColor.version"}

2

interact {"steps": [{"wait": 1}], "look": true}

Hues: blue 76%, grey 24% of the frame; over the objects (23.8% of it): grey 100%.

look {"sample": [[121, 296], [190, 296], [259, 296], [328, 296]]}

Colours (5 × 5 mean, in the page's pixels): (121, 296) #4b4b4b, (190, 296) #4b4b4b, (259, 296) #4b4b4b, (328, 296) #4b4b4b.
```

## What the eval tells apart

| What you see | What the `eval` returns | The fix |
|---|---|---|
| Every instance black | `vertexColors: true`, `geometryHasColor: false`, a full colour buffer | `vertexColors: false` on the material |
| Nothing drawn | `capacity` 0 or below `count`, colour `slots` the same | the largest count in the constructor, then lower `count` |
| The old colours after a change | the buffer's `first` value is the new colour, `version` unchanged | `instanceColor.needsUpdate = true` after the change |
| Colours all tinted one way | a full buffer and a non-white `material.color` | a white material colour |
| Every instance white | `instanceColor: null` | `setColorAt` was never called |

The last two rows were not reproduced on this page; they follow from the multiply in the shader and from `setColorAt` being what creates the buffer.

## What paprika3d does not do

- No reply line flags an instance colour fault. `look`'s pixel lines describe the picture (here, `grey 100%` over the objects) and leave the cause to the `eval`.
- `instances` in `fx.js` builds a named `InstancedMesh` from placed points and sets no colours; call `setColorAt` on the mesh it returns.
- It does not give instances different textures. One `InstancedMesh` has one material; a texture per instance takes an atlas and a per-instance offset attribute read in the shader, or a different mesh per texture, written by hand.
- It does not change the page. The `eval` changes vanish on reload; the agent writes the fix into the source and looks again.

## Pitfalls

- **Set colours before the first frame when you can.** A colour set then uploads with the first frame, with no flag needed.
- **Every later change needs the flag.** After a loop of `setColorAt` calls, set `instanceColor.needsUpdate = true` once, not per instance.
- **`count` is not capacity.** `count` says how many to draw this frame; the constructor's number is how many fit.
- **Colours are linear inside.** A `Color` set from a hex value is converted from sRGB, which is why the buffer holds 0.184 for 0x777777; compare buffer values with linear numbers, or read the pixels with `sample`.
- **Read the pixels after a frame draws.** A change made in `eval` shows in `look` after an `interact` step has drawn a frame, as in steps 2 and 4.
- **Picking an instance.** A `Raycaster` hit on an `InstancedMesh` has an `instanceId`, which is the index to pass to `setColorAt` for a hover or click highlight; the [click on object guide](/guides/threejs-click-on-object-raycaster) covers the ray itself.

## Without paprika3d

In the browser console, `mesh.instanceColor` (null or an `InstancedBufferAttribute`), `mesh.instanceMatrix.count`, `mesh.count` and `mesh.material.vertexColors` give the same readout as the `eval` above. To read a drawn colour, render once and call `gl.readPixels` on the WebGL context at a point, or take a screenshot and use a colour picker. The three.js docs for `InstancedMesh` list `setColorAt`, `instanceColor` and the `needsUpdate` rule, and the `webgl_instancing_raycast` example changes an instance's colour when the pointer is over it.
