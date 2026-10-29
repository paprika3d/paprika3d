---
title: three.js Draco, meshopt or KTX2? Tell which compression a GLB uses and set up its loader
phrase: three.js draco, meshopt or ktx2
description: Which compression a GLB file uses (Draco or meshopt for geometry, KTX2 or WebP for textures), the error each one gives when the three.js page has no decoder for it, the GLTFLoader setup that loads all three, and what each costs in bytes, read with the paprika3d plugin's model_audit and open tools.
meta: three.js Draco, meshopt or KTX2? Tell which compression a GLB uses, set up the loader it needs, and check the decoders load.
intent: glb-draco-meshopt-ktx2-check
queries:
  - "How to create ktx2 correctly"
  - "Compressed Texture Workflow (glTF|Basis)"
  - "BestPractice: JPG attached to model or Load WebP to Model?"
  - "Incredible Compression on a GLB"
  - "Compression ... draco + ktx2 example"
  - "GLTFExporter: Add option for draco compression"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js Draco, meshopt or KTX2? Tell which compression a GLB uses and set up its loader

## Three compressions, three decoders

A compressed GLB is still a glTF file. Its JSON lists the extensions it uses in `extensionsUsed`, and each compression is one extension with its own decoder in the page:

| In the file | What it compresses | What GLTFLoader needs |
|---|---|---|
| `KHR_draco_mesh_compression` | mesh geometry | `setDRACOLoader(new DRACOLoader().setDecoderPath(...))`, and the decoder's files served at that path |
| `EXT_meshopt_compression` | geometry, and any other buffer (animation, morph targets) | `setMeshoptDecoder(MeshoptDecoder)`, a module imported with the page |
| `KHR_texture_basisu` | textures, as KTX2 (Basis Universal) | `setKTX2Loader(new KTX2Loader().setTranscoderPath(...).detectSupport(renderer))`, and the transcoder's files |
| `EXT_texture_webp` | textures, as WebP | nothing: GLTFLoader reads it as it is |

Without the decoder, GLTFLoader stops with an error and the model never reaches the scene. Draco and meshopt both quantize the geometry, so they lose a little precision; both need the decoder to rebuild it. KTX2 textures stay compressed on the GPU, which WebP, PNG and JPEG do not. So the question "which one should my file use" has two halves: one for geometry (Draco or meshopt) and one for textures (WebP or KTX2), and a file can use one of each.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Its `model_audit` tool reads a .glb or .gltf file's JSON and image headers without decoding anything, so it reports whether a file uses Draco, meshopt or KTX2, and each texture's size and format, even for a file the page cannot load yet. `open` reports the loader's errors and the decoder files that did not load. The [glTF failed-to-load guide](/guides/threejs-gltf-model-failed-to-load) walks through a missing `DRACOLoader` on its own; this guide is about telling the three apart and loading all of them.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## One model, compressed three ways

The project for this guide has one plain model, `models/vase.glb`: a vase with 101,888 triangles and a 1024 px PNG base colour texture, built with gltf-transform. Three copies of it were made from that file:

- `vase-meshopt.glb` with gltf-transform's `reorder`, `quantize` and `meshopt` functions and the meshoptimizer encoder, the steps the gltf-transform CLI's `meshopt` command runs;
- `vase-draco.glb` with `bunx @gltf-transform/cli draco models/vase.glb models/vase-draco.glb`;
- `vase-ktx2.glb` with the texture replaced by a real KTX2 file inside `KHR_texture_basisu`. This server has no KTX-Software (`toktx`), which gltf-transform's `etc1s` and `uastc` commands call, so the texture is three.js's own 40 × 40 ETC1S sample (`examples/textures/ktx2/2d_etc1s.ktx2`), a different and much smaller picture than the PNG. Its file size says nothing about KTX2 against PNG; it is here to show the extension and its loader.

This page loads the vase in both of its compressed geometries and with a KTX2 texture, with all three decoders set up. In a project the models are files; here two small ones are inlined, so the page runs on its own. The decoder files ship with three.js, in `three/examples/jsm/libs/`.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Compressed vases</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// In a project these are files under models/. Here two small ones are inlined so the page runs on its own:
// a Draco-compressed vase, and a meshopt-compressed vase with a KTX2 (Basis Universal) texture.
const MODELS = {
  draco: 'data:model/gltf-binary;base64,Z2xURgIAAAD4BwAABAQAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjUwNH0seyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoxMDQsIm1heCI6WzAuMjk5Mjc1MzY4NDUyMDcyMTQsMC44MDAwMDAwMTE5MjA5MjksMC4yOTkyNzUzNjg0NTIwNzIxNF0sIm1pbiI6Wy0wLjI5OTI3NTM2ODQ1MjA3MjE0LDAsLTAuMjk5Mjc1MzY4NDUyMDcyMTRdfSx7InR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjEwNH0seyJ0eXBlIjoiVkVDMiIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoxMDR9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6OTgzfV0sImJ1ZmZlcnMiOlt7ImJ5dGVMZW5ndGgiOjk4M31dLCJtYXRlcmlhbHMiOlt7Im5hbWUiOiJjbGF5IiwicGJyTWV0YWxsaWNSb3VnaG5lc3MiOnsiYmFzZUNvbG9yRmFjdG9yIjpbMC43NSwwLjQ1LDAuMjUsMV0sInJvdWdobmVzc0ZhY3RvciI6MC41LCJtZXRhbGxpY0ZhY3RvciI6MH19XSwibWVzaGVzIjpbeyJuYW1lIjoiY2xheSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjEsIk5PUk1BTCI6MiwiVEVYQ09PUkRfMCI6M30sIm1vZGUiOjQsIm1hdGVyaWFsIjowLCJpbmRpY2VzIjowLCJleHRlbnNpb25zIjp7IktIUl9kcmFjb19tZXNoX2NvbXByZXNzaW9uIjp7ImJ1ZmZlclZpZXciOjAsImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MSwiVEVYQ09PUkRfMCI6Mn19fX1dfV0sIm5vZGVzIjpbeyJuYW1lIjoiY2xheSIsIm1lc2giOjB9XSwic2NlbmVzIjpbeyJub2RlcyI6WzBdfV0sImV4dGVuc2lvbnNVc2VkIjpbIktIUl9kcmFjb19tZXNoX2NvbXByZXNzaW9uIl0sImV4dGVuc2lvbnNSZXF1aXJlZCI6WyJLSFJfZHJhY29fbWVzaF9jb21wcmVzc2lvbiJdfSAgINgDAABCSU4ARFJBQ08CAgEBAAAAaKgBAqgBBgAv77qu6/q0qqqqT7Wqqqr6VLWqqqqqT1W1qqqqqvpUVbWqqqqqqk9VVbWqqqqqqgb/ARH/ApBY/wKQWAP/AAAAAAABAAABAAkDAAACAQEJAwABAwEDCQIAAgIBAQEADyOcFQMVK2UPPQGcFAsBX7JPm0HwHD/hxtuS7r6K/Z+AUsi2rZBFoSSJbWmEkgQAagYARnQsgCiBAoCUagbAlJwUAHSOSwFAsscAdEwSAAxRCgFAiNAWAJ6KhwL4KEsCsGrnAWCeLACQKYwCQEzxLgBgkFQBQKOMBMDTQxSAW9EMgNrIEgCxtA0AzuyDAIBmvgsA26FzALCkGhFAo6cUgC7HFACnlDYAqANQAABUOgCQtr4BEG23BQBM8EAAAICNAAApDGIAXHpmAVCq4AA4hcEBIB6DAyA8IgVASMUDgIKbEgAGt1IAYAufBIC7GyIARoJmAUTqzADIjcEBoIqCAyA8ZggAg1CGACAIIgWASA8PgOCJBwAGDyUACh4eABh8EACgDEMKAJEKDwCHLzgAxIPmAMTrzADQjRAF8NYgAoAkGglApzMCYBIlAeRYSgA+iWkArihTAJQl2gBoi7QBMJ2yBIBPASgA/jmXAMAm1AFAtO8NAGlPBwDR/hQAMMt/AuCfbAIAchltAERH2gDQd7QBIB2zBABQwUwAMCUpAUDNNwcATnrkAHBJNwBAc24AgGZ9CKDaWQrAkT8qgByaBQAxLQsAYro8AM1fEADwbtkCgFS1NABBBAAAAAD/PwAAnzqZvgAAAACfOpm+zcxMPw4AAwEACwucnAcpBu0EA7UzD62/6x/VaRxgJjCNU94NmFqUralHCcBI0yKEDgn4fTQth+koAA8GDMK9GGXLQTYPoXvwfBfgh/ZVvO2F1oykjsTtHIyvvepZQB7a/8D3D3frsXIdituQ/APwa786FpCH9jQEDgPhVmSsR40C8BGUP4D+rWeffetXAB7Zr2C4BpWXcPXtSDhuv/aqn/599q1bnT3Mv/lfQB7UGyAcXoD/+qdeAP/Uw25A/j8i95+LceX/zWhV9f3mpO44+I+4b7r2Y8vq2rOW6P+AH8s/WGD4A/rDz/oD9S9f+wPwc57+A/XDLwYIDvdrcpsXAD8I9yPw/QP6cpwvQuiQgP/B2wBY7j0yylICAP8DAAD/AQAACgEBAQANA8U2ZQcfPQGcDG1KEZ+R+7+Nodt/gqt626qKJAAkKSAAEoAAABIAIBAAIAEAAkAAAACAEABCQAIAgAAAAAAA/w8AAAAAAAAAAAAAAACAPwwA',
  meshoptKtx2: 'data:model/gltf-binary;base64,Z2xURgIAAAAQEwAAMAkAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjUwNCwibm9ybWFsaXplZCI6ZmFsc2UsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjF9LHsidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIwLCJjb3VudCI6MTA0LCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjoyfSx7InR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMiwiY291bnQiOjEwNCwibWF4IjpbMjQ1MTQsMzI3NjcsMjQ1MTRdLCJtaW4iOlstMjQ1MTQsLTMyNzY3LC0yNDUxNF0sIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjN9LHsidHlwZSI6IlZFQzIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MTA0LCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3Ijo0fV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjk2Nn0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjEwMDgsInRhcmdldCI6MzQ5NjMsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo5NjgsImJ5dGVMZW5ndGgiOjIxNiwibW9kZSI6IlRSSUFOR0xFUyIsImJ5dGVTdHJpZGUiOjIsImNvdW50Ijo1MDR9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjEwMDgsImJ5dGVMZW5ndGgiOjQxNiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6NCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjExODQsImJ5dGVMZW5ndGgiOjI0OSwibW9kZSI6IkFUVFJJQlVURVMiLCJmaWx0ZXIiOiJPQ1RBSEVEUkFMIiwiYnl0ZVN0cmlkZSI6NCwiY291bnQiOjEwNH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MTQyNCwiYnl0ZUxlbmd0aCI6ODMyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTQzNiwiYnl0ZUxlbmd0aCI6NjQ5LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjgsImNvdW50IjoxMDR9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjIyNTYsImJ5dGVMZW5ndGgiOjQxNiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6NCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjIwODgsImJ5dGVMZW5ndGgiOjQxMSwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo0LCJjb3VudCI6MTA0fX19XSwic2FtcGxlcnMiOlt7IndyYXBTIjoxMDQ5Nywid3JhcFQiOjEwNDk3fV0sInRleHR1cmVzIjpbeyJzYW1wbGVyIjowLCJleHRlbnNpb25zIjp7IktIUl90ZXh0dXJlX2Jhc2lzdSI6eyJzb3VyY2UiOjB9fX1dLCJpbWFnZXMiOlt7Im5hbWUiOiJnbGF6ZSIsIm1pbWVUeXBlIjoiaW1hZ2Uva3R4MiIsImJ1ZmZlclZpZXciOjB9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6MjUwMH0seyJieXRlTGVuZ3RoIjoyNjcyLCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImZhbGxiYWNrIjp0cnVlfX19XSwibWF0ZXJpYWxzIjpbeyJuYW1lIjoiZ2xhemUiLCJwYnJNZXRhbGxp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',
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2e35);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(0, 0.9, 2.4);
camera.lookAt(0, 0.35, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.5));

// One loader, set up once for all three. Each line is needed by files that use that compression, and costs nothing
// for files that do not: the decoders are fetched the first time a file needs them.
const loader = new GLTFLoader();
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('./node_modules/three/examples/jsm/libs/draco/gltf/'));
loader.setKTX2Loader(new KTX2Loader().setTranscoderPath('./node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer));
loader.setMeshoptDecoder(MeshoptDecoder);

Object.entries(MODELS).forEach(([name, url], i) => {
  loader.load(url, (gltf) => {
    gltf.scene.name = name;
    gltf.scene.traverse((o) => { if (o.isMesh) o.name = name; });
    gltf.scene.position.x = (i - 0.5) * 0.9;
    scene.add(gltf.scene);
  }, undefined, (err) => console.error(`${name} did not load:`, err.message));
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The calls below were made on 2026-10-28 on a Linux server with no GPU, so Chrome drew in software (SwiftShader); none of what follows depends on frame times. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

## The tool calls, in order

**1. Ask the files which compression they use.** `model_audit` with `path` set to the folder reports every model in it, with no page open:

```text
model_audit {"cwd": "<project>", "path": "models"}

models/vase.glb · 3.73 MB · 101,888 triangles · 1 material · textures: 1024×1024 png · Draco no, meshopt no, KTX2 no
site: passes

models/vase-meshopt.glb · 1.36 MB · 101,888 triangles · 1 material · textures: 1024×1024 png · Draco no, meshopt yes, KTX2 no
site: passes

models/vase-ktx2.glb · 2.74 MB · 101,888 triangles · 1 material · textures: 40×40 ktx2 · Draco no, meshopt no, KTX2 yes
site: passes

models/vase-draco.glb · 1.15 MB · 101,888 triangles · 1 material · textures: 1024×1024 png · Draco yes, meshopt no, KTX2 no
site: passes
```

The last part of each line is the answer: `Draco yes`, `meshopt yes` or `KTX2 yes`, and the texture list says `ktx2`, `png`, `jpeg` or `webp` for each image. The triangle count is read from the JSON's accessor counts, which glTF keeps even for a compressed primitive, so it is the same in all four. A file sent by someone else, or downloaded from a model site, can be checked this way before any loader code is written.

**2. Load them with a plain GLTFLoader.** The page first had a `GLTFLoader` and nothing else, loading the four files from `models/`:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:46379/index.html in 0.3 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["plain"]}
Errors so far:
meshopt did not load: THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files
draco did not load: THREE.GLTFLoader: No DRACOLoader instance provided.
ktx2 did not load: THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures
Loaded: vase.glb 3.9 MB, vase-meshopt.glb 1.4 MB, vase-draco.glb 1.2 MB, vase-ktx2.glb 2.9 MB
```

Each compressed file downloaded (all four are under `Loaded`), and each failed in the parser with a message naming the setter it needed. The KTX2 file failed as a whole model, not just its texture: the file lists `KHR_texture_basisu` in `extensionsRequired`, as a KTX2 texture with no PNG fallback must. `entities` shows the one model that reached the scene, and `look` agrees:

```text
look {}

On screen (1):
plain 3.6% [151, 275, 374, 530]
```

**3. Set up the three decoders.** The three `loader.set...` lines from the page above went into the source, and the page was opened again:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:46379/index.html in 0.3 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["meshopt","plain"]}
Loaded: vase.glb 3.9 MB, vase-meshopt.glb 1.4 MB, vase-draco.glb 1.2 MB, vase-ktx2.glb 2.9 MB

look {}

On screen (4):
ktx2 3.6% [905, 275, 1128, 530]
plain 3.6% [151, 275, 374, 530]
meshopt 3.5% [407, 276, 620, 530]
draco 3.5% [659, 276, 871, 530]
Never visible: none
```

No `Errors so far` line this time. At frame 0 of this open, `entities` held the plain and meshopt vases: the meshopt decoder runs in the page as soon as the file arrives, while the Draco decoder and the Basis transcoder are fetched on first use and decode in workers, so those models can arrive a little later. By the `look` all four were drawn.

**4. See what the GPU got for the KTX2 texture.** `detectSupport(renderer)` asks the GPU which compressed formats it reads, and the transcoder turns the Basis data into one of them:

```text
eval {"code": "const out = {};\nscene.traverse((o) => { if (o.isMesh) out[o.name] = { map: o.material.map?.constructor.name, format: o.material.map?.format, mipmaps: o.material.map?.mipmaps?.length }; });\nreturn { ...out, RGBAFormat: THREE.RGBAFormat, RGBA_BPTC_Format: THREE.RGBA_BPTC_Format }"}

{"meshopt":{"map":"Texture","format":1023,"mipmaps":0},"plain":{"map":"Texture","format":1023,"mipmaps":0},"ktx2":{"map":"CompressedTexture","format":36492,"mipmaps":6},"draco":{"map":"Texture","format":1023,"mipmaps":0},"RGBAFormat":1023,"RGBA_BPTC_Format":36492}
```

The three PNG textures are plain `RGBAFormat`, decoded to 4 bytes a pixel. The KTX2 one arrived as a `CompressedTexture` in BC7 (`RGBA_BPTC_Format`) with its six mip levels from the file. A phone's GPU reads other formats (ASTC or ETC2), and the same file transcodes to those there.

## Two ways the setup goes half wrong

**A KTX2Loader without `detectSupport(renderer)`.** With that call left out, the model loads and its texture does not:

```text
open {"url": "index.html", "cwd": "<project>"}

{"three":"186","scenes":1,"entities":["ktx2","meshopt","plain","draco"]}
Errors so far:
THREE.GLTFLoader: Couldn't load texture blob:http://127.0.0.1:44129/368700da-c73a-4125-96a0-3c567cef5be2
```

All four vases are in `entities`, so a screenshot shows a vase in its plain material colour. The blob address is the texture GLTFLoader cut out of the GLB. The error does not say KTX2, so `model_audit`'s `KTX2 yes` is how to connect the two.

**A decoder path that is wrong.** With the Draco decoder path set to `./draco/`, a folder the project does not have:

```text
open {"url": "index.html", "cwd": "<project>"}

{"three":"186","scenes":1,"entities":["meshopt","plain","ktx2"]}
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) draco/draco_wasm_wrapper.js
draco did not load: fetch for "http://127.0.0.1:44129/draco/draco_wasm_wrapper.js" responded with 404: Not Found
Failed to load resource: the server responded with a status of 404 (Not Found) draco/draco_decoder.wasm
Loaded: vase.glb 3.9 MB, vase-ktx2.glb 2.9 MB, vase-meshopt.glb 1.4 MB, vase-draco.glb 1.2 MB
Failed to load: draco_wasm_wrapper.js (404), draco_decoder.wasm (404)
```

The path is resolved against the page's address, like any URL in it. A bundler does not copy these files for you: they go in a folder the server serves (`public/` in Vite), or the path points at a CDN copy.

## What each choice costs

**Geometry: Draco or meshopt.** `model_audit` with `shrink: { textures: false }` wrote geometry-only copies of the plain and meshopt vases, and the Draco CLI compressed the plain one, so the three files below differ in geometry alone:

```text
model_audit {"cwd": "<project>", "path": "geometry"}

geometry/vase.glb · 2.74 MB · 101,888 triangles · 1 material · no textures · Draco no, meshopt no, KTX2 no
geometry/vase-meshopt.glb · 399 KB · 101,888 triangles · 1 material · no textures · Draco no, meshopt yes, KTX2 no
geometry/vase-draco.glb · 161 KB · 101,888 triangles · 1 material · no textures · Draco yes, meshopt no, KTX2 no
```

Draco's file is the smaller one on disk. A web server compresses what it sends, though, and meshopt's output is laid out to be compressed again; gzip at level 9 on the same three files:

```bash
$ for f in vase.glb vase-meshopt.glb vase-draco.glb; do echo "$f $(stat -c%s $f) bytes, gzip -9: $(gzip -9c $f | wc -c) bytes"; done
vase.glb 2868512 bytes, gzip -9: 1278849 bytes
vase-meshopt.glb 408324 bytes, gzip -9: 129851 bytes
vase-draco.glb 163908 bytes, gzip -9: 131528 bytes
```

Over a compressing server the two arrive at about the same size for this mesh (129,851 bytes and 131,528 bytes). The decoders differ more. These are the files three.js ships for each, which the page downloads the first time it needs one:

```bash
$ cd node_modules/three/examples/jsm/libs && wc -c meshopt_decoder.module.js draco/gltf/draco_wasm_wrapper.js draco/gltf/draco_decoder.wasm basis/basis_transcoder.js basis/basis_transcoder.wasm
 29256 meshopt_decoder.module.js
 58456 draco/gltf/draco_wasm_wrapper.js
192420 draco/gltf/draco_decoder.wasm
 57529 basis/basis_transcoder.js
527333 basis/basis_transcoder.wasm
```

A single mesh this size leans toward meshopt: a 29,256 bytes module against a 58,456 bytes wrapper and a 192,420 bytes wasm file for Draco. Served without compression, Draco's smaller raw file is the one that arrives sooner. Meshopt also compresses animation and morph target data, which Draco leaves alone, and `model_audit`'s `shrink` reads and rewrites meshopt files but refuses Draco ones, so resizing textures later is one call on a meshopt file.

**Textures: WebP or KTX2.** `shrink` on the meshopt vase, with each texture capped at 512 px, gives a file with meshopt geometry and a WebP texture:

```text
model_audit {"cwd": "<project>", "path": "models/vase-meshopt.glb", "shrink": {"textures": 512}}

Before: models/vase-meshopt.glb · 1.36 MB · 101,888 triangles · 1 material · textures: 1024×1024 png · Draco no, meshopt yes, KTX2 no
After: models/vase-meshopt-opt.glb · 452 KB · 101,888 triangles · 1 material · textures: 512×512 webp · Draco no, meshopt yes, KTX2 no
site: passes
```

From the plain 3.73 MB vase to 452 KB in two steps. WebP shrinks the download, and the browser decodes it to full RGBA before the upload, so its GPU memory is the same as the PNG's. KTX2 is the format that is smaller on the GPU too. The memory for one 1024 px texture, by what the GPU holds:

```text
1024 × 1024 texture, before mipmaps (which add a third):
  PNG, JPEG or WebP, decoded to RGBA       4 bytes a pixel     4 MB
  KTX2 transcoded to BC7, ASTC 4x4, ETC2 RGBA   1 byte a pixel   1 MB
  KTX2 transcoded to BC1 or ETC2 RGB       half a byte a pixel   0.5 MB
```

What KTX2 costs is the 527,333 bytes transcoder, a page that must call `detectSupport`, and an encoder step (KTX-Software's `toktx`, or gltfpack) in the asset pipeline. Its download is not always smaller than a WebP of the same picture, so a page with a few textures and no memory trouble is often fine with WebP, and a page that runs out of GPU memory on phones is where KTX2 pays.

## What paprika3d does not do

- **It does not compress anything with Draco, meshopt or KTX2.** `shrink` writes WebP textures and keeps the rest of the file as it was: a meshopt file stays meshopt, a KTX2 texture is left as it is (no canvas decodes it), and a Draco file is refused. The converters are gltf-transform (`meshopt`, `draco`, `etc1s`, `uastc`, `webp` commands) and gltfpack.
- **It does not add the decoders to the page.** `open` names the error; the agent writes the three setter lines.
- **`perf` counts every texture as width × height × 4 bytes**, so it overstates the GPU memory of a KTX2 texture. Read the format with `eval` as in step 4 when that matters.
- **It does not judge quality loss** from quantization or from KTX2's modes. `look` with `save` and `compare` measures how much of the picture changed after a swap, at the camera the page uses.

## Pitfalls

- **Draco decoder path, not file.** `setDecoderPath` takes a folder ending in `/`, and the server must serve `draco_wasm_wrapper.js` and `draco_decoder.wasm` from it. The `gltf/` folder is the smaller decoder build, enough for glTF.
- **One loader, set up once.** Put the three setters on the `GLTFLoader` every model goes through, and reuse it. The Draco decoder and the Basis transcoder are fetched when a file first needs them, so a page with no such file pays nothing for those two lines.
- **`detectSupport(renderer)` after the renderer exists.** It reads the GPU's formats from it; without it, a KTX2 texture fails as shown above, with a message that does not say why.
- **React Three Fiber.** drei's `useGLTF` sets up Draco and meshopt for you, but not KTX2; with `useLoader`, pass a function that calls the setters, as for any `GLTFLoader`.
- **Models from paprika3d's asset library are meshopt files with WebP textures**, and the code `asset_search` writes with a pick includes `setMeshoptDecoder(MeshoptDecoder)`.

## Without paprika3d

`npx @gltf-transform/cli inspect model.glb` prints the extensions a file uses, with tables of its meshes and textures; opening the GLB's JSON chunk and reading `extensionsUsed` gives the same answer by hand. To convert, the gltf-transform CLI has one command for each: `meshopt`, `draco`, `webp`, and `etc1s` and `uastc` for KTX2, which need KTX-Software installed; optimize runs a whole pipeline. gltfpack, from meshoptimizer, writes meshopt geometry with `-c` (`-cc` for more) and KTX2 textures with `-tc`. gltf.report runs gltf-transform in a browser tab, and Blender's glTF exporter has a Draco option. In the page, the error in the browser console names the missing setter, as in step 2.
