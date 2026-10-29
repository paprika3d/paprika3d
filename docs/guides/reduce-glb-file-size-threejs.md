---
title: Reduce GLB file size for three.js: find the textures, shrink them, check the picture
phrase: reduce glb file size
description: How to reduce a GLB file's size for a three.js page. A coding agent reads which part of the file holds the bytes with the paprika3d plugin's model_audit tool, rewrites the textures smaller with its shrink option, checks that the page looks the same with look save and compare, and reads what the textures cost on the GPU with perf.
meta: Reduce GLB file size for three.js: find whether textures or triangles make a model heavy, shrink the textures, and check the picture did not change.
intent: reduce-glb-file-size
queries:
  - "What glb compessions (optimizers) can I find?"
  - "GLTF and / or GLB online optimization and compression"
  - "How to compress GLB files?"
  - "How to reduce/compress three.js GLTF model size (with .bin and textures)?"
  - "Reducing GLB File Sizes"
  - "Three.js: ways to reduce file size of models?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Reduce GLB file size for three.js: find the textures, shrink them, check the picture

## Where the bytes in a GLB are

A GLB holds two kinds of data: geometry (vertex positions, normals, texture coordinates and indices) and images (base colour, normal, roughness and other maps, each a whole PNG or JPEG file inside the GLB). In many models exported for a product page or a game, the images are most of the file. One 4096 × 4096 normal map saved as PNG can be larger than every mesh in the scene together. So the order is:

1. **Find out which part is large.** Count the triangles and read each texture's pixel size and format.
2. **Make the textures smaller.** Scale each one down to the size the page needs, and store it as WebP or JPEG instead of PNG. KTX2 (Basis Universal) goes further: it stays compressed on the GPU too.
3. **Compress the geometry**, if it is still large: meshopt or Draco compression, or fewer triangles from a simplifier.
4. **Stop when the page starts to look different** at the camera it really uses.

Draco is a common first answer in these threads, but Draco compresses geometry, and on a textured model it leaves most of the file as it was.

paprika3d is a Claude Code plugin and MCP server for three.js work. Its `model_audit` tool reads a .glb or .gltf file without loading it and reports megabytes, triangles, materials, each texture's size and format, and whether Draco, meshopt or KTX2 is used, with a verdict against a website budget. Its `shrink` option rewrites the file with every texture capped at a size and saved as WebP. `look` with `save` and `compare` says what share of the page's pixels changed after the swap, and `perf` reports the texture memory on the GPU.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The model

The project for this guide has three files in `models/`. `vase.glb` is a vase on a wooden plinth, built for this guide with gltf-transform: 16,396 triangles and four textures at 4096 × 4096, two base colour maps as JPEG and two normal maps as PNG, as a typical export from a texturing tool comes out. `statue-scan.glb` is a dense mesh with no textures, the shape of a raw photogrammetry or sculpting export. `crate-draco.glb` is a small Draco-compressed box. The page loads `models/vase.glb` with `GLTFLoader` behind a loading screen.

The calls below were made on 2026-10-28 on a Linux server with no GPU, so Chrome drew in software (SwiftShader). Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

## 1. Audit the folder

`model_audit` needs no page open. With `path` set to a folder, it reports each model in it:

```text
model_audit {"cwd": "<project>", "path": "models"}

models/vase.glb · 28.54 MB · 16,396 triangles · 2 materials · textures: 4096×4096 jpeg, 4096×4096 png, 4096×4096 jpeg, 4096×4096 png · Draco no, meshopt no, KTX2 no
site: fails, 28.54 MB over 4 MB (the site budget for all assets); 4096×4096 texture over 2048; 4096×4096 texture over 2048; 4096×4096 texture over 2048; 4096×4096 texture over 2048
Fix: `model_audit` { path: "models/vase.glb", shrink: { textures: 2048 } } writes models/vase-opt.glb with each texture at most 2048 px (WebP; textures: false drops them); then `look` compare against a look saved before (save).

models/statue-scan.glb · 16.48 MB · 614,400 triangles · 1 material · no textures · Draco no, meshopt no, KTX2 no
site: fails, 16.48 MB over 4 MB (the site budget for all assets); 614,400 triangles over 200,000
Fix: `model_audit` { path: "models/statue-scan.glb", shrink: { textures: 2048 } } writes models/statue-scan-opt.glb with each texture at most 2048 px (WebP; textures: false drops them); then `look` compare against a look saved before (save). Shrink keeps every triangle: for fewer, pick a lower-poly model.

models/crate-draco.glb · 2 KB · 12 triangles · 1 material · no textures · Draco yes, meshopt no, KTX2 no
site: passes
```

The two large files are large for different reasons. The vase has few triangles and four 4096 px textures, so its 28.54 MB are nearly all images. The statue has no textures at all, and its 16.48 MB are 614,400 triangles of geometry. The default `site` target is a website's budget for all its assets; `target: "shopify"` judges a file as Shopify's 3D model page does.

## 2. Save the picture, then shrink the textures

Before changing the file, open the page and keep its picture as a baseline:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:45907/index.html in 4.2 s, paused at frame 0.
Loaded: vase.glb 29.9 MB

look {"save": "original"}

Saved as baseline original: <project>/paprika3d/baselines/original.png
On screen (2):
glaze 15% [448, 96, 830, 609]
plinth 5.7% [394, 532, 885, 702]
```

(`open` counts a megabyte as a million bytes, `model_audit` as 2 to the power 20, so the same file reads 29.9 MB in one and 28.54 MB in the other.)

Then the call the audit suggested, and a second one with a 1024 px cap written to its own file:

```text
model_audit {"cwd": "<project>", "path": "models/vase.glb", "shrink": {"textures": 2048}}

Before: models/vase.glb · 28.54 MB · 16,396 triangles · 2 materials · textures: 4096×4096 jpeg, 4096×4096 png, 4096×4096 jpeg, 4096×4096 png · Draco no, meshopt no, KTX2 no
After: models/vase-opt.glb · 1.31 MB · 16,396 triangles · 2 materials · textures: 2048×2048 webp, 2048×2048 webp, 2048×2048 webp, 2048×2048 webp · Draco no, meshopt no, KTX2 no
site: passes

model_audit {"cwd": "<project>", "path": "models/vase.glb", "shrink": {"textures": 1024, "out": "models/vase-1k.glb"}}

Before: models/vase.glb · 28.54 MB · 16,396 triangles · 2 materials · textures: 4096×4096 jpeg, 4096×4096 png, 4096×4096 jpeg, 4096×4096 png · Draco no, meshopt no, KTX2 no
After: models/vase-1k.glb · 817 KB · 16,396 triangles · 2 materials · textures: 1024×1024 webp, 1024×1024 webp, 1024×1024 webp, 1024×1024 webp · Draco no, meshopt no, KTX2 no
site: passes
```

`shrink` scales each texture larger than the cap down in Chrome's canvas, writes it as WebP, and keeps the geometry, materials and node names as they were. A texture already at or under the cap is left in its format. These textures are smooth procedural patterns, which WebP compresses well; a photographed texture with fine grain keeps more of its bytes at the same size, so expect a smaller drop on a scanned model.

## 3. Check that the page looks the same

Point the page at the new file (`const MODEL = 'models/vase-opt.glb'`), and compare with the baseline. `compare` reloads the page to the baseline's frame, so the two pictures are the same moment:

```text
look {"compare": "original"}

Compare: 0.0058% of pixels differ from original (saved 2026-10-28, frame 1, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T06-11-40-214Z/look-1-diff.png
```

And with `models/vase-1k.glb`:

```text
look {"compare": "original"}

Compare: 0.039% of pixels differ from original (saved 2026-10-28, frame 1, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T06-11-49-615Z/look-1-diff.png
```

Both are well under one pixel in a thousand. The reason is in the `On screen` line above: the vase covers a box of about 380 by 510 CSS pixels, so the GPU samples a smaller mipmap level of a 4096 texture anyway. That is the measure of "how far": a texture needs about as many pixels as the model covers on the largest screen and the closest camera the page allows. A viewer that lets the visitor zoom in on a detail needs the comparison made at that zoom, and the diff picture shows where the change is. Lossy WebP is also where a normal map can show faint blocks on a glossy surface, which the diff would mark in red.

## 4. The file size is not the memory size

A PNG, JPEG or WebP texture is decoded before it is uploaded, and the GPU holds every pixel at 4 bytes, plus a third more for mipmaps, whatever the file's format was. `perf` reports that total. The three versions of the vase, each opened after pointing the page at it, cut to the assets and texture lines (the frame times on this software renderer are no measure of a real GPU and are left out):

```text
perf {}

Assets are the files this load fetched, largest vase.glb 28.54 MB.
Textures 344.33 MB on the GPU (largest 4096 px), 6 shader programs, pixel ratio 1, heap 65.79 MB, 19 long tasks, 0 frames over 3× the median (GC-like pauses); noise between two samples 1.1 ms.

perf {}

Assets are the files this load fetched, largest vase-opt.glb 1.31 MB.
Textures 88.33 MB on the GPU (largest 2048 px), 6 shader programs, pixel ratio 1, heap 11.34 MB, 20 long tasks, 0 frames over 3× the median (GC-like pauses); noise between two samples 0.4 ms.

perf {}

Assets are the files this load fetched, largest vase-1k.glb 0.8 MB.
Textures 24.33 MB on the GPU (largest 1024 px), 6 shader programs, pixel ratio 1, heap 6.73 MB, 20 long tasks, 0 frames over 3× the median (GC-like pauses); noise between two samples 2.1 ms.
```

The 28.54 MB file took 344.33 MB of texture memory, and a phone shares that memory with everything else it runs. Halving each side of the textures divides that by about four. KTX2 is the format that also cuts GPU memory, since the GPU reads it compressed; WebP and JPEG cut the download and nothing after it.

The same sum works in the page. This block lists each texture in a scene with its pixel size and its decoded size in memory; after a GLTFLoader load, call it on `gltf.scene`:

```js
// verify: inline
import * as THREE from 'three';

// Each texture's pixels and what it takes once decoded: width × height × 4 bytes, plus a third for mipmaps.
function textureReport(root) {
  const seen = new Map();
  root.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m) continue;
      for (const [slot, t] of Object.entries(m)) {
        if (!t?.isTexture || seen.has(t)) continue;
        const { width = 0, height = 0 } = t.image ?? {};
        seen.set(t, { mesh: o.name, slot, width, height, decodedMB: +(width * height * 4 * 4 / 3 / 2 ** 20).toFixed(2) });
      }
    }
  });
  return [...seen.values()];
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(1.6, 1.2, 2.4);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.5));

// A 1024 px canvas texture stands in for a model's base colour map.
const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
const g = canvas.getContext('2d');
for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
  g.fillStyle = (i + j) % 2 ? '#c8834a' : '#7a4a2a';
  g.fillRect(i * 128, j * 128, 128, 128);
}
const map = new THREE.CanvasTexture(canvas);
map.colorSpace = THREE.SRGBColorSpace;
const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map }));
crate.name = 'crate';
scene.add(crate);

console.log(JSON.stringify(textureReport(scene)));   // [{"mesh":"crate","slot":"map","width":1024,"height":1024,"decodedMB":5.33}]
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

## What shrink does not do

`shrink` changes textures and nothing else. The statue shows its limit: the audit offered it the same shrink call, and on a file with no textures it writes a copy of the same size.

```text
model_audit {"cwd": "<project>", "path": "models/statue-scan.glb", "shrink": {"textures": false}}

Before: models/statue-scan.glb · 16.48 MB · 614,400 triangles · 1 material · no textures · Draco no, meshopt no, KTX2 no
After: models/statue-scan-opt.glb · 16.48 MB · 614,400 triangles · 1 material · no textures · Draco no, meshopt no, KTX2 no
site: fails, 16.48 MB over 4 MB (the site budget for all assets); 614,400 triangles over 200,000
```

A Draco file is refused, because the plugin carries no Draco decoder:

```text
model_audit {"cwd": "<project>", "path": "models/crate-draco.glb", "shrink": {"textures": 1024}}

model_audit: crate-draco.glb is Draco-compressed, which shrink cannot decode; shrink the source model before its Draco step
```

So paprika3d does not:

- compress geometry with Draco or meshopt, or quantize it (a meshopt file it reads stays meshopt when shrink writes it);
- reduce the triangle count: for the statue, that takes a simplifier or a lower-poly model;
- write KTX2 textures, the format that saves GPU memory as well as download, or resize ones already in KTX2, which no canvas decodes.

## Pitfalls

- **A compressed file needs its decoder in the page.** A meshopt file needs `loader.setMeshoptDecoder(MeshoptDecoder)`, a Draco file a `DRACOLoader`, and KTX2 textures a `KTX2Loader` with `detectSupport(renderer)`. Without it the model does not load.
- **Shrink the source, then compress.** Draco and meshopt are the last step of a pipeline; resize textures before them, as the refusal above says.
- **Measure at the page's own camera.** A comparison at a far camera says nothing about a close-up the page also allows.
- **Normal maps are data, not colour.** Lossy compression of a normal map shows as faint blocks on a shiny surface sooner than on a base colour map.

## Without paprika3d

The gltf-transform CLI covers the whole pipeline in one command, resizing and re-encoding textures and compressing geometry with meshopt by default:

```bash
npx @gltf-transform/cli optimize vase.glb vase-small.glb --texture-compress webp --texture-size 2048
npx @gltf-transform/cli inspect vase-small.glb
```

`inspect` prints a table of meshes, textures and their sizes. gltfpack (from meshoptimizer) compresses geometry with meshopt and, with `-tc`, converts textures to KTX2; `-si 0.5` simplifies to about half the triangles. gltf.report runs the same steps in a browser tab, and Blender's glTF exporter can write Draco geometry and JPEG or WebP images at export. Comparing the result means loading both files in a viewer side by side and checking them by eye.
