---
title: three.js glTF textures black on iOS? Add up what the textures take on a phone
phrase: three.js gltf textures black on ios
description: Why a glTF model's textures can draw black, or the page crash, on iPhones and not on a desktop, what the three.js threads found, and how a coding agent reads each texture's pixel size with the paprika3d plugin's model_audit tool, the texture megabytes and pixel ratio with perf against its mobile budget, and caps both.
meta: three.js glTF textures black on iOS? Add up the GPU memory the textures take on a phone, and the Safari ImageBitmap cause.
intent: gltf-textures-black-on-ios
queries:
  - "Textures in gLTF sometimes display black, but only on iOS"
  - "Changing texture crash on mobile - context lost"
  - "Unable to load GLB in Some of the Iphones"
  - "Browser crashes when loading large files (dxf, glTF, etc.)"
  - "iOS large textures and Level of Detail (LOD) / Progressive Loading"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js glTF textures black on iOS? Add up what the textures take on a phone

## What the threads found

A forum thread and three.js issue #22652, opened under the same title in October 2021, describe the same thing: a model that draws correctly on a desktop and in Android browsers shows one or more textures black on an iPhone, sometimes not until the second or third load, and some pages crash with Safari's "a problem repeatedly occurred". Most reports came after the move to iOS 15.

Two causes are named there, both by the people who maintain three.js:

- **Running out of GPU memory.** In the forum thread, donmccurdy said it sounded like the device was running out of GPU memory and the last textures to load were going dark. A smaller copy of the asker's textures loaded, and another poster fixed theirs by making the textures smaller still. In the issue, donmccurdy and hybridherbst each estimated where textures start going dark; their figures are in the comments of the code block below, and both are estimates for particular devices, not a documented limit.
- **A Safari bug with image bitmaps.** `GLTFLoader` decoded textures with `createImageBitmap`, and posters in the issue found that turning that path off on iOS 15 stopped the black textures. The issue was closed by mrdoob's pull request #23086, "GLTFLoader: Avoid using ImageBitmap in Safari", for r136. In the r186 source in this repo, `GLTFLoader` uses the plain `TextureLoader` on Safari before version 17 and `ImageBitmapLoader` elsewhere. A page on a three.js older than r136 has this bug, and upgrading three.js is the fix.

The memory side is what a page controls. A texture is decoded before it reaches the GPU, so its cost is its pixels, not its file: width × height × 4 bytes, and a third more for the mipmaps three.js makes. A normal map and a roughness map cost as much as the colour map. A file can be small on disk and still ask a phone for hundreds of megabytes, and the canvas's own drawing buffer grows with the phone's pixel ratio on top of that.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `model_audit` reads a .glb or .gltf without loading it and lists each texture's pixel size and format, with the `shrink` call that caps them. `open` takes a phone's viewport with `size` and `dpr`. `perf` with `budget: "mobile"` reports the textures' megabytes on the GPU, the largest texture and the pixel ratio. The harness never runs on iOS or in Safari, and its mobile budget is a desktop proxy: the limits are a phone's, the machine is not. So it does not reproduce the black textures; it measures the memory the threads point to.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The model and the page

`models/lamp.glb` is a table lamp built for this guide with gltf-transform, shaped like an export from a texturing tool: two materials, `shade` and `ceramic`, each with a base colour map (JPEG), a normal map (PNG) and a metallic-roughness map (PNG), all six at 4096 × 4096. The patterns are smooth and procedural, so the file is small; a photographed texture would make the file larger and leave the memory the same. The page loads it the common way, with the renderer at the device's full pixel ratio:

```html
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL = 'models/lamp.glb';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 20);
camera.position.set(0.9, 0.8, 1.6);
camera.lookAt(0, 0.45, 0);
new GLTFLoader().load(MODEL, (gltf) => scene.add(gltf.scene));
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew in software (SwiftShader) on a busy host. The texture megabytes, sizes and pixel ratios do not depend on that; the frame and load times do, and this guide reads nothing from them. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Read the textures from the file.** No page needs to be open:

```text
model_audit {"cwd": "<project>", "path": "models/lamp.glb"}

models/lamp.glb · 1.16 MB · 384 triangles · 2 materials · textures: 4096×4096 jpeg, 4096×4096 png, 4096×4096 png, 4096×4096 jpeg, 4096×4096 png, 4096×4096 png · Draco no, meshopt no, KTX2 no
site: fails, 4096×4096 texture over 2048; 4096×4096 texture over 2048; 4096×4096 texture over 2048; 4096×4096 texture over 2048; 4096×4096 texture over 2048; 4096×4096 texture over 2048
Fix: `model_audit` { path: "models/lamp.glb", shrink: { textures: 2048 } } writes models/lamp-opt.glb with each texture at most 2048 px (WebP; textures: false drops them); then `look` compare against a look saved before (save).
```

At 1.16 MB the file is well inside the `site` target's asset budget, and the verdict fails it on the textures alone: six at 4096 px, twice the 2048 px the target allows on a side.

**2. Open it at a phone's size.** 390 × 844 CSS pixels at a pixel ratio of 3 is the viewport of an iPhone 12, 13 or 14:

```text
open {"url": "index.html", "cwd": "<project>", "size": [390, 844], "dpr": 3}

Opened http://127.0.0.1:40079/index.html at 390 × 844, DPR 3 in 7.9 s, paused at frame 0.
Loaded: lamp.glb 1.2 MB

look {}

Canvas: 1170x2532 buffer for 390x844 CSS at DPR 3 (renderer pixel ratio 3, no cap); resize handler ran.
On screen (3):
shade 28% [0, 100, 389, 376]
base 25% [43, 483, 346, 793]
stem 1.2% [181, 377, 208, 515] 0.3 × 0.04 units
```

**3. Measure it against the mobile budget.**

```text
perf {"budget": "mobile"}

Only the limits are a phone's: the frame ran on this host's GPU, which is faster than a phone's, so GPU work (shadows, post-processing, a high pixel ratio) costs more there than this says.
Assets are the files this load fetched, largest lamp.glb 1.16 MB.
Textures 515 MB on the GPU (largest 4096 px), 7 shader programs, pixel ratio 3, heap 12.83 MB, 4 long tasks, 0 frames over 3× the median (GC-like pauses); noise between two samples 312.4 ms.
```

A 1.16 MB file asks for 515 MB of texture memory. The sum, in the same megabytes `perf` uses (2 to the power 20 bytes):

```text
one 4096 × 4096 texture   4096 × 4096 × 4 bytes = 64 MB, plus a third for mipmaps = 85.3 MB
six of them               512 MB; the rest of the 515 MB is the room environment's map
at 1024 px                1024 × 1024 × 4 bytes, plus a third = 5.3 MB each, 32 MB for six
the drawing buffer        1170 × 2532 × 4 bytes = 11.3 MB for its colour alone, at pixel ratio 3
```

The `mobile` budget in `src/budgets.ts` holds a texture to 1024 px and the pixel ratio to 2, and the source calls its mobile entry a rough proxy. This page is over both. The verdict at the top of the reply, cut here, names the frame time, which is over on this software renderer and no signal; read the texture line against those two limits yourself.

**4. Cap the textures at 1024 px.** The [reduce GLB file size guide](/guides/reduce-glb-file-size-threejs) walks through `shrink` and the `look` comparison that checks the picture after it; here it is one call:

```text
model_audit {"cwd": "<project>", "path": "models/lamp.glb", "shrink": {"textures": 1024, "out": "models/lamp-1k.glb"}}

Before: models/lamp.glb · 1.16 MB · 384 triangles · 2 materials · textures: 4096×4096 jpeg, 4096×4096 png, 4096×4096 png, 4096×4096 jpeg, 4096×4096 png, 4096×4096 png · Draco no, meshopt no, KTX2 no
After: models/lamp-1k.glb · 60 KB · 384 triangles · 2 materials · textures: 1024×1024 webp, 1024×1024 webp, 1024×1024 webp, 1024×1024 webp, 1024×1024 webp, 1024×1024 webp · Draco no, meshopt no, KTX2 no
site: passes
```

On this phone viewport the shade covers 390 by about 280 CSS pixels, so a 1024 px texture still has more pixels than the screen shows of it.

**5. Cap the pixel ratio at 2, and measure again.** Two edits to the page: `const MODEL = 'models/lamp-1k.glb'` and `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.

```text
open {"url": "index.html", "cwd": "<project>", "size": [390, 844], "dpr": 3}

Loaded: lamp-1k.glb 0.1 MB

look {}

Canvas: 780x1688 buffer for 390x844 CSS at DPR 3 (renderer pixel ratio 2, capped below DPR 3); resize handler ran.

perf {"budget": "mobile"}

Textures 35 MB on the GPU (largest 1024 px), 7 shader programs, pixel ratio 2, heap 8.71 MB, 9 long tasks, 0 frames over 3× the median (GC-like pauses); noise between two samples 8.1 ms.

eval {"code": "const b = renderer.getDrawingBufferSize(new THREE.Vector2());\nreturn { buffer: [b.x, b.y], colourMB: +(b.x * b.y * 4 / 2 ** 20).toFixed(1), pixelRatio: renderer.getPixelRatio() }"}

{"buffer":[780,1688],"colourMB":5,"pixelRatio":2}
```

Texture memory went from 515 MB to 35 MB, and the colour buffer from 11.3 MB to 5 MB. Six 1024 px textures are 32 MB; the rest is again the environment map.

## The same sum in the page

`perf` measures a page in the harness. On a real phone, the page can add up its own textures once the model has loaded, and log the total or pick a smaller model. This block does that for every texture in a scene, with the figures the iOS thread reported as comments:

```js
// verify: inline
import * as THREE from 'three';

// What a scene's textures and the canvas ask of a phone's GPU, in MB of 2 ** 20 bytes.
// Figures reported in three.js issue #22652 (iOS 15, 2021); estimates for those devices, not published limits:
//   donmccurdy: textures went dark past about 250 MB of decoded images on an iPhone 11 Pro
//   hybridherbst: around 120 MB on the devices they tried, and failures from 3 MB models with five 2048 px textures
function phoneMemory(renderer, scene) {
  const textures = new Set();
  scene.traverse((o) => {
    for (const m of [o.material].flat()) for (const v of Object.values(m ?? {})) if (v?.isTexture) textures.add(v);
  });
  let bytes = 0, largest = 0;
  for (const t of textures) {
    const { width = 0, height = 0 } = t.image ?? {};
    bytes += width * height * 4 * (t.generateMipmaps ? 4 / 3 : 1);
    largest = Math.max(largest, width, height);
  }
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const mb = (b) => +(b / 2 ** 20).toFixed(1);
  return { textures: textures.size, largest, textureMB: mb(bytes), colourBufferMB: mb(buffer.x * buffer.y * 4) };
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // a phone's 3 costs 2.25 times the pixels of 2
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e4dc);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(1.8, 1.4, 2.6);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 3));

// Three 1024 px canvas textures stand in for a model's colour, normal and roughness maps.
function canvasTexture(draw) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
  draw(canvas.getContext('2d'));
  return new THREE.CanvasTexture(canvas);
}
const map = canvasTexture((g) => { g.fillStyle = '#3c7f8f'; g.fillRect(0, 0, 1024, 1024); g.fillStyle = '#e6d3a8'; g.fillRect(0, 384, 1024, 256); });
map.colorSpace = THREE.SRGBColorSpace;
const normalMap = canvasTexture((g) => { g.fillStyle = '#8080ff'; g.fillRect(0, 0, 1024, 1024); });
const roughnessMap = canvasTexture((g) => { g.fillStyle = '#909090'; g.fillRect(0, 0, 1024, 1024); });
const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 48), new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap }));
vase.name = 'vase';
scene.add(vase);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
console.log(JSON.stringify(phoneMemory(renderer, scene)));   // {"textures":3,"largest":1024,"textureMB":16,...}
```

## What paprika3d does not do

- It never runs on iOS or in Safari: pages run in headless Chrome, or Firefox when `open` is given `browser: "firefox"`. It cannot show a texture going black on an iPhone, and it does not reproduce the Safari image bitmap bug.
- Its `mobile` budget is a desktop proxy. The limits are a phone's (1024 px textures, 3 MB of assets, 100,000 triangles); the frame is drawn by the machine the harness runs on, as the `perf` reply says.
- It does not know any device's memory limit. The thread's figures are estimates for the devices those posters had.
- `shrink` writes WebP, which saves download and not GPU memory. It does not write KTX2, the GPU-compressed format that stays smaller on the GPU too; in the forum thread, aidenhjj reported that converting to KTX2 let them load models with far larger textures on iOS.
- It does not change the page. The agent edits the model path and the pixel ratio, and measures again.

## Pitfalls

- **The file size says nothing about the memory.** A JPEG or WebP is decoded to full pixels before upload; read the pixel sizes, not the megabytes on disk.
- **Every map counts.** A material with colour, normal, roughness-metalness, occlusion and emissive maps at 4096 px holds five textures of that size.
- **Models add up.** The asker in the forum thread saw textures go black again when more models with 2048 px textures loaded beside the first one. Swapping models without freeing the old ones adds their textures every time; the [WebGL context lost guide](/guides/threejs-webgl-context-lost) shows how to watch that and free them.
- **Cap the pixel ratio.** `renderer.setPixelRatio(devicePixelRatio)` on a phone with a ratio of 3 draws 2.25 times the pixels of a ratio of 2, and `antialias: true` multiplies the buffer's samples on top.
- **Upgrade an old three.js.** Before r136, `GLTFLoader` used image bitmaps on Safari, which the issue above found losing textures on iOS 15.

## Without paprika3d

`npx @gltf-transform/cli inspect lamp.glb` prints a table of the textures with their resolution, and gltf.report shows the same in a browser tab with an estimate of the GPU memory they take. `npx @gltf-transform/cli resize lamp.glb lamp-1k.glb --width 1024 --height 1024` caps them, and `gltfpack -tc` or gltf-transform's `uastc` and `etc1s` commands write KTX2. In three.js, `renderer.capabilities.maxTextureSize` gives the device's largest texture side, and logging the `phoneMemory` sum above on the phone itself, through Safari's Web Inspector connected over USB, shows what the page asks of that device.
