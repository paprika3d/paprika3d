---
title: Visual regression test a three.js scene at an exact frame, with a saved baseline and a pixel diff
phrase: visual regression test a three.js scene
description: How a coding agent visual regression tests a three.js or WebGL scene with the paprika3d plugin: a picture saved as a baseline at an exact frame of a paused, seeded clock, compared after each edit with the share of pixels that differ, a diff picture and a grid of regions, and why a seeded random layout can still move when the edit creates fewer objects.
meta: Visual regression test a three.js scene: capture the same frame every time, save a baseline, and compare the pixels after a change.
intent: visual-regression-webgl
queries:
  - "E2E tests broken."
  - "[Question]: React: Flaky screenshots (pixel shift)"
  - "Visual Regression Testing with ImageMagick & using SSIM Metric"
  - "Is there a way to test webGL renderings with Webdriver?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Visual regression test a three.js scene at an exact frame, with a saved baseline and a pixel diff

## Why WebGL screenshots differ between runs

A visual regression test takes a picture, keeps it as the baseline, and compares later pictures against it. On a three.js page the later picture differs even when nothing changed, for reasons that have nothing to do with the code: the animation was at another moment when the picture was taken, `Math.random()` scattered things elsewhere, the first frames were still loading, or another GPU or driver shaded the edges a little differently. Tests then either fail at random or get a tolerance so loose that real changes pass.

paprika3d is a Claude Code plugin and MCP server that runs the page in its own headless Chrome on a paused clock, stepped 1/60 s a frame, with `Math.random` seeded. A picture taken at frame 90 is the same picture on every load, on the same machine. `look` with `save` keeps a picture as a named baseline, with the frame and page size it was taken at; `look` with `compare` reloads the page, steps it to that frame, and replies with the share of pixels that differ and a picture of the differences in red. `reference` with `compare: true` puts the baseline and the page side by side and splits the difference into a grid of regions.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A scene that moves and scatters

A windmill whose sails turn one radian a second, and fourteen trees placed with `Math.random()`: the two things that make screenshots of a scene differ from run to run.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Mill</title>
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
scene.background = new THREE.Color(0x9cc4e4);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(6, 5, 10);
camera.lookAt(0, 1.5, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.8));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.8);
sun.position.set(5, 10, 4);
scene.add(sun);

const field = new THREE.Mesh(new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6a9a48 }));
field.name = 'field';
scene.add(field);

const mill = new THREE.Group();
mill.name = 'mill';
const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 3, 24), new THREE.MeshStandardMaterial({ color: 0xe8dcc8 }));
tower.position.y = 1.5;
const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1, 24), new THREE.MeshStandardMaterial({ color: 0xa04030 }));
roof.name = 'roof';
roof.position.y = 3.5;
const sails = new THREE.Group();
sails.name = 'sails';
sails.position.set(0, 3, 0.9);
for (let i = 0; i < 4; i++) {
  const sail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.05), new THREE.MeshStandardMaterial({ color: 0xf4f0e8 }));
  sail.geometry.translate(0, 0.95, 0);
  sail.rotation.z = (i * Math.PI) / 2;
  sails.add(sail);
}
mill.add(tower, roof, sails);
scene.add(mill);

// Trees scattered at random: the same layout on every load under a seeded Math.random.
const trees = new THREE.Group();
trees.name = 'trees';
for (let i = 0; i < 14; i++) {
  const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
  const tree = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0x2f5a2a }));
  tree.position.set(Math.cos(a) * r, 0.7, Math.sin(a) * r);
  trees.add(tree);
}
scene.add(trees);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop((t) => {
  sails.rotation.z = t / 1000;   // one radian a second
  renderer.render(scene, camera);
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Baselines taken there compare against pictures taken there; see the last section. Run folder paths are shortened to `<project>`.

**1. Open the page and step to the moment to keep.** The page loads paused at frame 0; 90 frames is 1.5 s of the sails turning.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41485/index.html in 0.1 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["field","mill","trees"]}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-52-04-864Z
```

(The reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out here.)

```text
interact {"steps": [{"wait": 90}]}

{"after":null,"changed":{}}
```

The page has no `window.__game`, so there is no state to report; the clock is now at frame 90.

**2. Save the baseline.**

```text
look {"save": "mill-1_5s"}

Saved as baseline mill-1_5s: <project>/paprika3d/baselines/mill-1_5s.png
Picture: <project>/paprika3d/runs/2026-10-28T05-52-04-864Z/look-1.png
Pixels: brightness 65%, colour saturation 44%, 0% near black, 0% blown out.
Hues: green 49%, blue 46% of the frame; over the objects (53.5% of it): green 91%, grey 8%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Surface: "field" covers 45% with almost no detail (0 of 255): it reads as flat colour. Unless the user asked for flat colour, add texture, normal detail or lighting variation.
World's edge: 33% of the picture is background below the horizon, in [0, 111, 1279, 483], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.
On screen (19):
field 45% [0, 349, 1279, 799] 18 × 18 units
mill 2.8% [564, 292, 716, 542]
trees ×12 4.1% [253, 306, 1279, 751]
roof 0.45% [562, 199, 710, 294]
sails ×4 1.4% [475, 126, 747, 449] 1.8 × 0.3 units
Never visible: none
```

The picture is kept as `paprika3d/baselines/mill-1_5s.png` in the project, with a `.json` beside it holding the frame (90), the page size and the pixel ratio.

**3. Compare with nothing changed.** `compare` takes the picture again at the baseline's frame, reloading and stepping there when the page is at another frame:

```text
look {"compare": "mill-1_5s"}

Compare: 0% of pixels differ from mill-1_5s (saved 2026-10-28, frame 90, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T05-52-04-864Z/look-2-diff.png
Picture: <project>/paprika3d/runs/2026-10-28T05-52-04-864Z/look-2.png
Pixels, Hues: as the last look; 0% of the picture changed since it.
Surface: the same line as the last look, still open.
World's edge: 33% of the picture is background below the horizon, in [0, 111, 1279, 483], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.
On screen (19):
field 45% [0, 349, 1279, 799] 18 × 18 units
mill 2.8% [564, 292, 716, 542]
trees ×12 4.1% [253, 306, 1279, 751]
roof 0.45% [562, 199, 710, 294]
sails ×4 1.4% [475, 126, 747, 449] 1.8 × 0.3 units
Never visible: none
```

No pixel differs. The sails are at the same angle because the clock is at the same frame, and the trees are in the same places because `Math.random` gave the same numbers.

**4. A small change: the roof a shade more orange.**

```diff
-const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1, 24), new THREE.MeshStandardMaterial({ color: 0xa04030 }));
+const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1, 24), new THREE.MeshStandardMaterial({ color: 0xa04a30 }));
```

```text
look {"compare": "mill-1_5s"}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Compare: 0.44% of pixels differ from mill-1_5s (saved 2026-10-28, frame 90, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T05-52-04-864Z/look-3-diff.png
Picture: <project>/paprika3d/runs/2026-10-28T05-52-04-864Z/look-3.png
Pixels, Hues: as the last look; 0% of the picture changed since it.
Surface: the same line as the last look, still open.
World's edge: 33% of the picture is background below the horizon, in [0, 111, 1279, 483], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.
On screen (19):
field 45% [0, 349, 1279, 799] 18 × 18 units
mill 2.8% [564, 292, 716, 542]
trees ×12 4.1% [253, 306, 1279, 751]
roof 0.45% [562, 199, 710, 294]
sails ×4 1.4% [475, 126, 747, 449] 1.8 × 0.3 units
Never visible: none
```

0.44% of the pixels differ: about the roof's share of the picture. A pixel counts as different when one of its colour channels moved by more than 8 of 255: edge noise stays below that, and this change of shade is above it.

**5. A change that moved more than it should: three sails instead of four.** (The roof is back to its first colour.)

```diff
-for (let i = 0; i < 4; i++) {
+for (let i = 0; i < 3; i++) {
-  sail.rotation.z = (i * Math.PI) / 2;
+  sail.rotation.z = (i * Math.PI * 2) / 3;
```

```text
look {"compare": "mill-1_5s"}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Compare: 8.5% of pixels differ from mill-1_5s (saved 2026-10-28, frame 90, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T05-52-04-864Z/look-4-diff.png
Picture: <project>/paprika3d/runs/2026-10-28T05-52-04-864Z/look-4.png
Pixels, Hues: as the last look; 10% of the picture changed since it.
Surfaces out of view: two unnamed ConeGeometrys in "trees" share a face plane (y = 0.00) over 0.5 × 0.65 units, on faces turned away from this camera: they flicker when seen from below. Look from there; move one at least 0.00024 units off the plane or remove the hidden face, unless that side is never seen. (1 more pairs out of view)
Surface: "field" covers 45% with almost no detail (0 of 255): it reads as flat colour. Unless the user asked for flat colour, add texture, normal detail or lighting variation.
World's edge: 33% of the picture is background below the horizon, in [0, 111, 1279, 483], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.
On screen (18):
field 45% [0, 349, 1279, 799] 18 × 18 units
mill 2.9% [564, 292, 716, 542]
trees ×12 4.1% [0, 333, 1033, 731]
roof 0.48% [562, 199, 710, 294]
sails ×3 1.1% [498, 161, 747, 438] 1.8 × 0.3 units
Never visible: none
```

8.5% of the picture differs, far more than the sails cover, and the `trees` line has a new box: the trees moved. The `Surfaces out of view` line is new too, about two trees whose bases now overlap.

**6. Where the difference is.** `reference` with `compare: true` reads a baseline by name and splits the difference into regions:

```text
reference {"cwd": "<project>", "file": "mill-1_5s", "compare": true, "cells": 4}

baseline mill-1_5s is 1280 × 800 px.
Shown: the picture, the page's look (1280 × 800) and their differences in red, each 480 px tall.
8% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 4% 0% 0% / 2% 24% 3% 1% / 3% 17% 21% 14% / 0% 13% 15% 13%. Most different: upper-middle centre-left (24%).
```

The difference is spread over the lower half of the picture, where the trees stand, as well as around the sails at the top middle.

## Why the trees moved

paprika3d seeds `Math.random`, so the sequence of numbers is the same on every load. But three.js draws from that same sequence: every `Object3D`, `BufferGeometry` and `Material` gets a UUID made from four `Math.random()` calls when it is created. One sail fewer is one mesh, one geometry and one material fewer, so the trees, made after the sails, started at a different point in the sequence and landed elsewhere.

A layout that should stay put while the rest of the scene changes needs a generator of its own, seeded once:

```js
// Trees scattered by a generator of their own, so the layout does not depend on what was made before it.
function mulberry32(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry32(7);
const trees = new THREE.Group();
trees.name = 'trees';
for (let i = 0; i < 14; i++) {
  const a = rand() * Math.PI * 2, r = 3 + rand() * 5;
```

With that change, a new baseline (`mill-seeded`, saved the same way at frame 90), and the same three-sail edit:

```text
look {"compare": "mill-seeded"}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Compare: 1.4% of pixels differ from mill-seeded (saved 2026-10-28, frame 90, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T05-52-39-807Z/look-2-diff.png
Picture: <project>/paprika3d/runs/2026-10-28T05-52-39-807Z/look-2.png
Pixels, Hues: as the last look; 0% of the picture changed since it.
Surfaces, Surface: the same 2 lines as the last look, still open.
World's edge: 33% of the picture is background below the horizon, in [0, 111, 1279, 483], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.
On screen (19):
field 42% [0, 349, 1279, 799] 18 × 18 units
mill 2.9% [564, 292, 716, 542]
trees ×13 6.4% [37, 323, 1250, 799]
roof 0.48% [562, 199, 710, 294]
sails ×3 1.1% [498, 161, 747, 438] 1.8 × 0.3 units
Never visible: none
```

```text
reference {"cwd": "<project>", "file": "mill-seeded", "compare": true, "cells": 4}

baseline mill-seeded is 1280 × 800 px.
Shown: the picture, the page's look (1280 × 800) and their differences in red, each 480 px tall.
1% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 4% 0% 0% / 0% 13% 0% 0% / 0% 1% 0% 0% / 0% 0% 0% 0%. Most different: upper-middle centre-left (13%).
```

1.4% of the pixels differ, the trees' box is unchanged, and the regions that differ are the top middle ones around the sails and the mill.

## What paprika3d does not do

- It sets no pass or fail threshold. `compare` reports the share of pixels that differ and the diff picture; deciding how much is too much is up to the agent or the test that reads it.
- `test` reruns state checks saved with `interact`, not picture comparisons. A baseline is compared when an agent asks for it with `look` or `reference`.
- It does not make pictures from different renderers match. A baseline from SwiftShader and a picture from a GPU, or from two GPUs, can differ at edges and in shading; keep baselines per machine, and take the baseline where the comparison will run.
- It does not compare pictures of different sizes. `compare` refuses when the page's size or pixel ratio is not the baseline's, and says which size to open the page at.
- It runs in an agent session through the MCP server, not as a CI job.

## Pitfalls

- **Pick the frame, not the time.** A baseline names its frame; `wait` to the same frame count before saving, and the moment is exact.
- **Keep layout randomness on a generator of its own** when the scene around it changes, as above. Seeding `Math.random` keeps the whole sequence fixed, and any object created earlier shifts it.
- **Name your objects.** The `On screen` lines under each comparison say which named object moved or changed size, which a diff picture alone does not.
- **Wait for loading.** A model or texture that arrives after the baseline's frame on one load and before it on another makes a difference that is about the network. `open` lists what loaded; save the baseline after it has.

## Without paprika3d

Screenshot assertions in Playwright (`expect(page).toHaveScreenshot()` with `maxDiffPixelRatio` and a per-pixel `threshold`), or `pixelmatch` on two PNGs, compare pictures the same way: a share of pixels past a colour threshold. ImageMagick's `compare -metric SSIM` scores structural similarity, which tolerates small shading shifts better than a per-pixel count. Whichever does the comparison, the page needs fixed time and fixed randomness for the pictures to agree: the three.js repository's own screenshot tests inject a script that replaces the clock and `Math.random` before each example runs, for the same reason.
