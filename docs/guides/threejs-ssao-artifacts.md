---
title: three.js SSAO artifacts: glass that darkens like a solid box, halos on the wall, and what the pass costs
phrase: three.js ssao artifacts
description: Why a screen-space ambient occlusion pass in three.js r186 (SSAOPass, SAOPass or GTAOPass) darkens around a transparent object as if it were solid and leaves what stands inside it without contact shadow, why a large radius draws halos on a wall behind an object, and how a coding agent checks both with the paprika3d plugin, switching the pass to show its AO buffer with eval, sampling that buffer with look, and counting what the pass draws with perf variants.
meta: three.js SSAO darkens around glass, draws halos or costs too much? Read the AO buffer itself, then leave the glass out with a layer.
intent: ssao-gtao-artifacts
queries:
  - "Make Pass (SSAO) not affect transparent objects"
  - "Adding SSAO pass to a scene in threejs"
  - "Are SAOPass and SSAO Pass the only AO options available? Examples inside"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js SSAO artifacts: glass that darkens like a solid box, halos on the wall, and what the pass costs

## What an ambient occlusion pass sees

three.js ships three screen-space ambient occlusion passes in `three/addons/postprocessing/`: `SSAOPass`, `SAOPass` and `GTAOPass`. They work the same way at the start:

1. They draw the scene a second time, through the camera given to their constructor, with an override material that writes normals and depth. Every mesh that camera sees goes in. `SSAOPass` and `GTAOPass` hide points and lines for that render; nothing else is left out, and the mesh's own material, its `transparent`, `opacity` and `depthWrite` included, is not used.
2. A full-screen pass compares each pixel's depth with the depth around it within `radius`, a distance in the scene's units, and darkens where nearby surfaces close over it. `GTAOPass` then denoises that and multiplies it into the picture.

Two artifacts follow from step 1:

- **A transparent object occludes as if it were solid.** A glass display case is a box in the depth buffer. The pass darkens the floor along its base, and whatever stands inside is hidden from the pass by the case's front face, so it gets no contact shadow and seems to float.
- **A large radius draws halos.** Depth is all the pass has, so an object standing some way in front of a wall darkens the wall around its outline once `radius` reaches across the gap.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `eval` runs code on the open page, here switching the pass to draw its AO buffer in place of the picture, `look` with `sample` reads the colour at points in whatever is drawn, and `perf` with `variants` measures the page with code run first, each on a fresh page, and gives the draw calls and triangles of each.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A gallery with a glass case

A statue on a plinth, and a blue vase under a glass case at `opacity` 0.15, with a `GTAOPass` at `radius` 0.25 between the `RenderPass` and the `OutputPass`. The pass is on `window.aoPass`, so `eval` can reach it.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Gallery</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe6e2da);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 50);
camera.position.set(2.5, 2.2, 5);
camera.lookAt(0, 0.6, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a948a, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(3, 6, 4);
scene.add(sun);

const white = new THREE.MeshStandardMaterial({ color: 0xf0ece4 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), white);
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), white);
wall.name = 'wall';
wall.position.set(0, 2.5, -1.5);
const plinth = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), white);
plinth.name = 'plinth';
plinth.position.set(-1.2, 0.5, -0.6);
const statue = new THREE.Mesh(new THREE.TorusKnotGeometry(0.28, 0.1, 128, 16), new THREE.MeshStandardMaterial({ color: 0xc8a060, metalness: 0.2, roughness: 0.5 }));
statue.name = 'statue';
statue.position.set(-1.2, 1.42, -0.6);
// A glass display case over a vase.
const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.6, 32), new THREE.MeshStandardMaterial({ color: 0x3a6ea8 }));
vase.name = 'vase';
vase.position.set(0.9, 0.3, 0.2);
const case_ = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9),
  new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false }));
case_.name = 'case';
case_.position.set(0.9, 0.6, 0.2);
scene.add(floor, wall, plinth, statue, vase, case_);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const aoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
aoPass.updateGtaoMaterial({ radius: 0.25 });
composer.addPass(aoPass);
composer.addPass(new OutputPass());
window.aoPass = aoPass;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => composer.render());
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Colours, draw calls and triangles do not depend on the GPU; the milliseconds in the `perf` reply do, and this guide does not use them. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page and look.** `interact` steps two frames first, so the composer has drawn before the picture. The points sampled are the floor at the front edge of the case's base, `(740, 556)`, and the floor at the vase's foot, `(771, 541)`.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:39359/index.html in 0.3 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["floor","wall","plinth","statue","vase","case"]}

interact {"steps": [{"wait": 2}], "look": true}

Picture: <project>/paprika3d/runs/2026-10-28T10-42-40-582Z/look-1.png
On screen (5):
floor 46% [0, 348, 1279, 799] 12 × 12 units
wall 44% [133, 0, 1279, 506] 12 × 5 units, across the view
plinth 3% [421, 290, 621, 470]
statue 1.3% [457, 167, 591, 307]
vase 0.63% [738, 420, 804, 539]
Never visible: none
Not found by the ID image (their own vertex shader places them, or they are see-through; see the picture): case

look {"sample": [[740, 556], [771, 541]]}

Colours (5 × 5 mean, in the page's pixels): (740, 556) #c9c7c4, (771, 541) #c1c6ca.
```

The object list leaves the case out and says why: its ID image does not draw see-through objects. The case is on screen in the picture all the same, and so is a grey line along its base.

**2. What is see-through, and what the pass draws.**

```text
eval {"code": "const seeThrough = [];\nscene.traverse(o => { if (o.isMesh && o.material.transparent) seeThrough.push({ name: o.name, opacity: o.material.opacity, depthWrite: o.material.depthWrite, layers: o.layers.mask }); });\nreturn { seeThrough, aoCameraLayers: aoPass.camera.layers.mask, radius: aoPass.gtaoMaterial.uniforms.radius.value, output: aoPass.output, blendIntensity: aoPass.blendIntensity }"}

{"seeThrough":[{"name":"case","opacity":0.15,"depthWrite":false,"layers":1}],"aoCameraLayers":1,"radius":0.25,"output":0,"blendIntensity":1}
```

One transparent mesh, the case, on the default layer (mask 1 is layer 0), and the pass's camera has the same mask, so the pass draws the case into its depth and normals. `depthWrite: false` keeps the case out of the main render's depth buffer and does nothing for the pass, which draws with its own material.

**3. Show the AO buffer.** `GTAOPass` has an `output` setting, and 5 is `GTAOPass.OUTPUT.Denoise`: the denoised AO buffer, drawn in place of the picture. Two points on the open wall, `(560, 150)` and `(1000, 200)`, and one beside the statue, `(650, 220)`, join the two from step 1.

```text
eval {"code": "aoPass.output = 5; // GTAOPass.OUTPUT.Denoise: the AO buffer itself, white where nothing occludes\nreturn \"showing the AO buffer\""}

showing the AO buffer

interact {"steps": [{"wait": 1}]}

look {"sample": [[740, 556], [771, 541], [560, 150], [650, 220], [1000, 200]]}

Picture: <project>/paprika3d/runs/2026-10-28T10-42-40-582Z/look-3.png
Colours (5 × 5 mean, in the page's pixels): (740, 556) #d5d5d5, (771, 541) #e2e2e2, (560, 150) #e2e2e2, (650, 220) #e2e2e2, (1000, 200) #e2e2e2.
```

The open wall reads `#e2e2e2`, which is what no occlusion comes out as after this page's tone mapping. The front edge of the case's base reads darker, `#d5d5d5`: the floor there is occluded by a box that is not there. The vase's foot reads `#e2e2e2`, no occlusion at all, and the picture shows why: the buffer has a solid box where the case stands and no vase.

**4. Leave the glass out of the pass, on the open page.** The case goes on layer 1, the main camera draws layers 0 and 1, and the pass gets a copy of the camera that sees layer 0.

```text
eval {"code": "find(\"case\").layers.set(1);\ncamera.layers.enable(1);\nconst aoCamera = camera.clone();\naoCamera.layers.set(0);\naoPass.camera = aoCamera;\nreturn \"case on layer 1; the AO pass sees layer 0\""}

case on layer 1; the AO pass sees layer 0

interact {"steps": [{"wait": 1}]}

look {"sample": [[740, 556], [771, 541], [560, 150], [650, 220], [1000, 200]]}

Picture: <project>/paprika3d/runs/2026-10-28T10-42-40-582Z/look-4.png
Colours (5 × 5 mean, in the page's pixels): (740, 556) #e2e2e2, (771, 541) #dddddd, (560, 150) #e2e2e2, (650, 220) #e2e2e2, (1000, 200) #e2e2e2.
```

The edge of the base is back to `#e2e2e2`, and the vase's foot is darker, `#dddddd`: the box is gone from the buffer, and the vase stands in it with a soft ring at its foot.

**5. A radius that reaches the wall.** The statue stands 0.9 units in front of the wall. With `radius` at 1.5 the pass reaches across that gap:

```text
eval {"code": "aoPass.updateGtaoMaterial({ radius: 1.5 });\nreturn \"radius 1.5\""}

radius 1.5

interact {"steps": [{"wait": 1}]}

look {"sample": [[740, 556], [771, 541], [560, 150], [650, 220], [1000, 200]]}

Picture: <project>/paprika3d/runs/2026-10-28T10-42-40-582Z/look-5.png
Colours (5 × 5 mean, in the page's pixels): (740, 556) #e2e2e2, (771, 541) #dddddd, (560, 150) #dddddd, (650, 220) #dedede, (1000, 200) #e2e2e2.
```

The two points on the wall above and beside the statue darken to `#dddddd` and `#dedede`, while the far wall stays `#e2e2e2`: in the picture it is an arc of shade on the wall around the statue, which touches nothing there. Keep `radius` near the size of the contact you want shaded; 0.25 in this scene of metre-sized objects.

**6. Write the layer into the source.** A camera that follows the main one each frame keeps working when the camera moves or the window resizes:

```js
const GLASS = 1; // see-through things: drawn, but left out of the AO pass's depth and normals
case_.layers.set(GLASS);
camera.layers.enable(GLASS);

const aoCamera = camera.clone();
const aoPass = new GTAOPass(scene, aoCamera, innerWidth, innerHeight);

renderer.setAnimationLoop(() => {
  aoCamera.copy(camera); // follow the main camera, then drop the glass layer
  aoCamera.layers.set(0);
  composer.render();
});
```

```text
look {"sample": [[740, 556], [771, 541]]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.4 s).
Picture: <project>/paprika3d/runs/2026-10-28T10-42-40-582Z/look-6.png
Colours (5 × 5 mean, in the page's pixels): (740, 556) #d9d8d5, (771, 541) #b9bcc0.
```

Against step 1, the edge of the case's base is lighter (`#c9c7c4` to `#d9d8d5`) and the vase's foot darker (`#c1c6ca` to `#b9bcc0`). `SSAOPass` and `SAOPass` also take the camera in their constructor and draw their buffers through it, so the same camera works for them; the replies here are from `GTAOPass`.

**7. What the pass costs.**

```text
perf {"variants": [{"label": "AO off", "code": "aoPass.enabled = false"}]}

baseline: 2921.5 ms median (p95 2921.5), work 2160.7 ms, 16 draw calls, 8497 triangles; over budget: frameMs 2921.5 of 16.7 ms; desktop budget
AO off: 145.5 ms median (p95 187.8), work 200.4 ms, 7 draw calls, 4253 triangles; −95% vs baseline; −56% draw calls, −50% triangles
Host load 34.0 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

Read the counts. The pass adds 9 draw calls to the 7: the five meshes its camera sees, drawn again for depth and normals, then four full-screen draws (the AO, the denoise, a copy of the picture and the blend). The triangles double for the same reason. Every mesh added to the scene is drawn twice while the pass is on, and the full-screen draws cost in proportion to the pixels, which on a real GPU is where most of the time goes on a large screen; this host's milliseconds cannot say how much.

## What paprika3d does not do

- **Its object list does not see see-through objects.** It named the case as not found by its ID image; the case's effect on the AO came from the AO buffer and the samples.
- **It has no ambient occlusion report.** The buffer was shown by setting the pass's own `output` in `eval`, which needs the pass reachable from the page, as `window.aoPass` is here.
- **The zero-size texture error did not show here.** A pass created from a container that has no size yet gets render targets of zero pixels; on open the harness ran the page's resize handler (the `Canvas` line says so), which resized the pass through `composer.setSize`, so this page never hit it.
- **Other AO passes were not run.** The replies are from three's `GTAOPass`; the `postprocessing` library's AO and N8AO have their own settings.
- **Frame times on this host mean nothing for a GPU.** The draw calls and triangles hold; the milliseconds do not.

## Pitfalls

- **Layers belong to each object, not to its parent.** A loaded model's glass is a child mesh; set the layer on each one, for example `model.traverse(o => { if (o.material?.transparent) o.layers.set(GLASS); })`.
- **A raycaster tests layers too.** After the case moves to layer 1, `raycaster.layers.enable(1)` is what keeps clicks hitting it.
- **Soften the AO with `blendIntensity`** (1 by default on `GTAOPass`) rather than shrinking `radius` until the contact shadows go.
- **Keep the pass between the `RenderPass` and the `OutputPass`**, as in the page, so the AO darkens the scene's colour before tone mapping.
- **Resize the composer, not the pass.** `composer.setSize` resizes every pass in it, the AO pass's buffers included.

## Without paprika3d

Put the pass on `window`, then set `aoPass.output = 5` in the browser console to see the buffer, and hide a transparent object (`visible = false`) to see whether the dark line along it goes. Count draw calls with `renderer.info.render.calls` after a frame (with `renderer.info.autoReset` off and a `reset()` before), once with `aoPass.enabled` true and once false.
