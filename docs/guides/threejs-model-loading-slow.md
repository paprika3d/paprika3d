---
title: three.js model loading slow? Time a first visit on 4G and show a progress bar
phrase: three.js model loading slow
description: Why a three.js page takes seconds to show its glTF model, and how to measure it. A coding agent times a first visit on a throttled 4G network with the paprika3d plugin's open and perf tools, judges it against a website budget, sees the loading screen as a visitor does with look, and finds the file to shrink with model_audit.
meta: three.js model loading slow? Time a first visit on 4G, add a GLTFLoader progress bar, and measure what shrinking the model saves.
intent: threejs-model-loading-slow
queries:
  - "Display Progress Bar Till 3D Model Gets Loaded Fully"
  - "Maximum 3d model size to load"
  - "Three.JS - GLTF model loads slow. How to speed up load time?"
  - "ThreeJS my GLTF loading speed is too slow on host server?"
  - "Javascript Three.Js GLTF Loading Is Very Slow Compared To Other GLTF Viewers"
  - "Considerations for loading large glb files"
  - "Basic Loading Screen"
  - "Callback after scene is completely ready"
  - "There is a delay between the model load using gltfLoader and the scene rendering, how would I know when to hide the loading screen?"
  - "How do I create a three js loading screen"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js model loading slow? Time a first visit on 4G and show a progress bar

## What the visitor waits for

Before a three.js page shows its model, the browser downloads the page's JavaScript, runs it, downloads the model, parses it, decodes its images and uploads them to the GPU, and draws. On your own machine, served from localhost, all of it takes a moment, so the problem shows up on the hosted site or on a phone. Two things usually decide the wait:

- **The model's size.** A GLB with 4096 px textures can be tens of megabytes, and on Chrome's fast 4G preset a megabyte takes about a second.
- **The script's size.** three.js imported from `node_modules` without a build step is the full, unminified library, and the page draws nothing until it has arrived.

So "how big can my model be" has a measured answer: as big as the time the visitor will wait. paprika3d's `site` budget for a 3D website puts that at the first scene frame within three seconds on Chrome's fast 4G preset, 1 MB of script and 4 MB of assets in all. A progress bar makes the wait readable; it does not make it shorter.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. With `network` set, `open` and `perf` time a first visit with the cache off on one of Chrome's network presets (`fast-4g`, `slow-4g` or `3g`): when the first frame was drawn, which files arrived by when, and when the element over the canvas (a loading screen) went away. `perf` with `budget: "site"` judges the visit, `look` with `opening: true` pictures the first seconds, and `model_audit` names the file to shrink.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with a progress bar

The page covers the canvas with a loading screen, fills a bar from `GLTFLoader`'s progress callback and removes the screen when the model is in the scene. In the project the model is `models/vase.glb`, a 28.54 MB vase with four 4096 px textures; here a small GLB of a box is inlined as a data URL, so the block runs on its own.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Vase</title>
<style>
html,body{margin:0;overflow:hidden;background:#1d2128;font:14px system-ui,sans-serif}
canvas{display:block}
#loading{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#1d2128;color:#ccd}
#bar{width:240px;height:6px;background:#333a46}#bar div{height:100%;width:0;background:#7ab}
</style></head>
<body>
<div id="loading"><span id="pct">Loading 0%</span><div id="bar"><div></div></div></div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// In the project: 'models/vase.glb'. Here a 1 × 1 × 1 box GLB is inlined, so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAAD0BQAAUAMAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC41LDAuNSwwLjVdLCJtaW4iOlstMC41LC0wLjUsLTAuNV0sImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjB9LHsidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjEyfSx7InR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjB9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6NTc2LCJieXRlU3RyaWRlIjoyNCwidGFyZ2V0IjozNDk2Mn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjU3NiwiYnl0ZUxlbmd0aCI6NzIsInRhcmdldCI6MzQ5NjN9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NjQ4fV0sIm1hdGVyaWFscyI6W3sibmFtZSI6ImNsYXkiLCJwYnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLjgsMC40NSwwLjMsMV0sInJvdWdobmVzc0ZhY3RvciI6MC42LCJtZXRhbGxpY0ZhY3RvciI6MH19XSwibWVzaGVzIjpbeyJuYW1lIjoiYm94IiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxfSwibW9kZSI6NCwibWF0ZXJpYWwiOjAsImluZGljZXMiOjJ9XX1dLCJub2RlcyI6W3sibmFtZSI6ImJveCIsIm1lc2giOjB9XSwic2NlbmVzIjpbeyJub2RlcyI6WzBdfV19IIgCAABCSU4AAAAAPwAAAD8AAAA/AACAPwAAAAAAAAAAAAAAPwAAAD8AAAC/AACAPwAAAAAAAAAAAAAAPwAAAL8AAAA/AACAPwAAAAAAAAAAAAAAPwAAAL8AAAC/AACAPwAAAAAAAAAAAAAAvwAAAD8AAAC/AACAvwAAAAAAAAAAAAAAvwAAAD8AAAA/AACAvwAAAAAAAAAAAAAAvwAAAL8AAAC/AACAvwAAAAAAAAAAAAAAvwAAAL8AAAA/AACAvwAAAAAAAAAAAAAAvwAAAD8AAAC/AAAAAAAAgD8AAAAAAAAAPwAAAD8AAAC/AAAAAAAAgD8AAAAAAAAAvwAAAD8AAAA/AAAAAAAAgD8AAAAAAAAAPwAAAD8AAAA/AAAAAAAAgD8AAAAAAAAAvwAAAL8AAAA/AAAAAAAAgL8AAAAAAAAAPwAAAL8AAAA/AAAAAAAAgL8AAAAAAAAAvwAAAL8AAAC/AAAAAAAAgL8AAAAAAAAAPwAAAL8AAAC/AAAAAAAAgL8AAAAAAAAAvwAAAD8AAAA/AAAAAAAAAAAAAIA/AAAAPwAAAD8AAAA/AAAAAAAAAAAAAIA/AAAAvwAAAL8AAAA/AAAAAAAAAAAAAIA/AAAAPwAAAL8AAAA/AAAAAAAAAAAAAIA/AAAAPwAAAD8AAAC/AAAAAAAAAAAAAIC/AAAAvwAAAD8AAAC/AAAAAAAAAAAAAIC/AAAAPwAAAL8AAAC/AAAAAAAAAAAAAIC/AAAAvwAAAL8AAAC/AAAAAAAAAAAAAIC/AAACAAEAAgADAAEABAAGAAUABgAHAAUACAAKAAkACgALAAkADAAOAA0ADgAPAA0AEAASABEAEgATABEAFAAWABUAFgAXABUA';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment()).texture;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50);
camera.position.set(0, 0.75, 2.4);
camera.lookAt(0, 0.45, 0);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(2, 3, 2);
scene.add(sun);

// The progress bar: onProgress gets the bytes so far and, when the server sends Content-Length, the total.
const pct = document.getElementById('pct'), bar = document.querySelector('#bar div');
new GLTFLoader().load(MODEL, (gltf) => {
  gltf.scene.name = 'vase';
  scene.add(gltf.scene);
  document.getElementById('loading').remove();
}, (e) => {
  if (!e.total) return;
  pct.textContent = `Loading ${Math.round(e.loaded / e.total * 100)}%`;
  bar.style.width = `${e.loaded / e.total * 100}%`;
}, (err) => { pct.textContent = 'The model did not load'; console.error(err); });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

`e.total` comes from the response's `Content-Length` header (or `X-File-Size`, which three.js reads first for nginx). A server that compresses on the fly often sends no length, and then `e.total` is 0 and no share can be shown; the page above keeps its label. When the length is that of the compressed body, `e.loaded` counts the bytes after decompression and can pass it, so cap the share at 100 in a real page.

## 1. Time a first visit on fast-4g

The calls below were made on 2026-10-28 on a Linux server with no GPU, so Chrome drew in software (SwiftShader). Network timings are in real time and measure the download under Chrome's throttling; the work after the download (parsing, decoding, the first frames) ran on that software renderer and is no measure of a phone. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

```text
open {"url": "index.html", "cwd": "<project>", "network": "fast-4g"}

Opened http://127.0.0.1:38859/index.html in 3.9 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
First scene frame: 2.9 s after navigation on fast-4g, a first visit with no cache (scripts 2.19 MB by 2.8 s); div#loading "Loading 0%" over the canvas gone at 6.4 s; div#loading "Loading 7%" over the canvas gone at 6.5 s; div#loading "Loading 8%" over the canvas gone at 6.8 s; div#loading "Loading 9%" over the canvas gone at 7.2 s; div#loading "Loading 10%" over the canvas gone at 7.5 s; div#loading "Loading 11%" over the canvas gone at 7.7 s; div#loading "Loading 12%" over the canvas gone at 8.0 s; div#loading "Loading 13%" over the canvas gone at 8.3 s; div#loading "Loading 14%" over the canvas gone at 8.6 s; div#loading "Loading 15%" over the canvas gone at 8.9 s; div#loading "Loading 16%" over the canvas gone at 9.2 s; div#loading "Loading 17%" over the canvas gone at 9.5 s; div#loading "Loading 18%" over the canvas gone at 9.8 s; div#loading "Loading 19%" over the canvas gone at 10.0 s; div#loading "Loading 20%" over the canvas gone at 10.3 s; div#loading "Loading 21%" over the canvas gone at 10.7 s; div#loading "Loading 22%" over the canvas gone at 11.0 s; div#loading "Loading 23%" over the canvas gone at 11.3 s; div#loading "Loading 24%" over the canvas gone at 11.6 s; div#loading "Loading 25%" over the canvas gone at 11.9 s; div#loading "Loading 26%" over the canvas gone at 12.2 s; div#loading "Loading 27%" over the canvas gone at 12.5 s; div#loading "Loading 28%" over the canvas gone at 12.7 s; div#loading "Loading 29%" still over the canvas at 12.9 s. Host load 15.9 on 64 cores.
Over the canvas: div#loading "Loading 100%" shows over 100% of it (background rgb(29, 33, 40)) and takes the clicks on 100% of it (listeners on the canvas miss them). A visitor sees it first; `look` opening: true shows how long it stays.
Loaded: vase.glb 29.9 MB
```

Read the `First scene frame` line from both ends:

- **The first frame came at 2.9 s**, right after 2.19 MB of scripts arrived at 2.8 s. That frame is the empty scene behind the loading screen; the time is when the page first drew, not when the model appeared.
- **The loading screen was still up at 12.9 s**, at 29%. The measure stops 10 s after the first frame, so the model's 28.54 MB never finished; at that rate the whole file needs well over twenty seconds.
- The tool names the element over the canvas by its text, so each new percentage reads as a new element that went away. The entry that matters is the last one, `still over the canvas`.

The `Over the canvas` line is from the paused page at frame 0, which `open` loads at full speed after the timed visit: the screen covered the whole canvas then too.

## 2. Judge it against the site budget

`perf` with `budget: "site"` times the visit on fast-4g by itself (the network that budget is set for) and gives the verdict:

```text
perf {"budget": "site"}

215.3 ms median frame (p95 220 ms, 5 fps on average), 2 draw calls, 16396 triangles, 28.54 MB assets; over budget: frameMs 215.3 of 16.7 ms, assetMB 28.54 of 4 MB, scriptMB 2.19 of 1 MB; site budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Largest scripts: three.core.js 1.39 MB, three.module.js 0.63 MB, GLTFLoader.js 0.11 MB. Fix: serve a production build (vite build minifies three.js and drops what the page does not import), compressed.
Assets are the files this load fetched, largest vase.glb 28.54 MB.
Fix: `model_audit` { path: "models/vase.glb", shrink: { textures: 1024 } } writes models/vase-opt.glb with each texture at most 1024 px (WebP; textures: false drops them); then `look` compare against a look saved before (save).
```

Two of the three limits the page is over are real: 28.54 MB of assets against 4 MB, and 2.19 MB of script against 1 MB. The frame time is over because this host has no GPU, and the reply says to ignore it. Each real one comes with its fix: a production build for the script, and the `shrink` call for the model.

## 3. See the opening

`look` with `opening: true` reloads the page with its clock running and pictures the first seconds in one row:

```text
look {"opening": true}

Picture: <project>/paprika3d/runs/2026-10-28T06-12-06-755Z/look-1-opening.png (the first seconds in real time, left to right: 3.8 s after load | 3.9 s after load | 6.2 s after load); the game is reloaded paused at its first frame
Software renderer (no GPU): about 248 ms a drawn frame, so a game that moves one step a frame ran about 15× slower than real time in this opening; a countdown or animation that looks stuck may only be slow.
```

The first picture shows the loading screen at `Loading 100%` and the next the vase. This reload is not throttled: `opening` loads at the local server's speed, so it shows what the page looks like while it loads and how long the work after the download holds the screen up, while the `network` timing above is the download. On this host the reload itself took several seconds, so the first picture came later than it would on a machine with a GPU.

## 4. Shrink the model and time it again

The call from the `perf` reply:

```text
model_audit {"cwd": "<project>", "path": "models/vase.glb", "shrink": {"textures": 1024}}

Before: models/vase.glb · 28.54 MB · 16,396 triangles · 2 materials · textures: 4096×4096 jpeg, 4096×4096 png, 4096×4096 jpeg, 4096×4096 png · Draco no, meshopt no, KTX2 no
After: models/vase-opt.glb · 817 KB · 16,396 triangles · 2 materials · textures: 1024×1024 webp, 1024×1024 webp, 1024×1024 webp, 1024×1024 webp · Draco no, meshopt no, KTX2 no
site: passes
```

With the page pointed at `models/vase-opt.glb`:

```text
open {"url": "index.html", "cwd": "<project>", "network": "fast-4g"}

First scene frame: 2.9 s after navigation on fast-4g, a first visit with no cache (scripts 2.19 MB by 2.8 s, vase-opt.glb 0.8 MB by 3.9 s, other 0 MB by 6.4 s); div#loading "Loading 0%" over the canvas gone at 6.8 s. Host load 13.0 on 64 cores.

perf {"budget": "site"}

227.7 ms median frame (p95 242.5 ms, 4 fps on average), 2 draw calls, 16396 triangles, 0.8 MB assets; over budget: frameMs 227.7 of 16.7 ms, scriptMB 2.19 of 1 MB; site budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
```

The model now arrives by 3.9 s, and the loading screen goes at 6.8 s instead of after the measure gave up. The script is the next item: it still takes until 2.8 s before anything runs. (`other 0 MB` is the browser's request for `favicon.ico`.)

## 5. Build the script

A bundler minifies three.js and leaves out what the page does not import. Here the page's script moved into `main.js` and was built with Bun's bundler; `vite build` does the same:

```bash
bun build main.js --minify --outdir dist
#  main.js  0.62 MB  (entry point)
```

```text
open {"url": "dist/index.html", "cwd": "<project>", "network": "fast-4g"}

First scene frame: 1.0 s after navigation on fast-4g, a first visit with no cache (main.js 0.6 MB by 1.0 s, vase-opt.glb 0.8 MB by 2.0 s, other 0 MB by 4.6 s); div#loading "Loading 0%" over the canvas gone at 5.0 s. Host load 17.9 on 64 cores.

perf {"budget": "site"}

216.1 ms median frame (p95 220.2 ms, 5 fps on average), 2 draw calls, 16396 triangles, 0.8 MB assets; over budget: frameMs 216.1 of 16.7 ms; site budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it

perf {"network": "slow-4g"}

First scene frame: 4.7 s after navigation on slow-4g, a first visit with no cache (main.js 0.6 MB by 4.6 s, vase-opt.glb 0.8 MB by 9.9 s, other 0 MB by 9.9 s); div#loading "Loading 0%" over the canvas gone at 8.2 s; div#loading "Loading 64%" over the canvas gone at 8.3 s; div#loading "Loading 66%" over the canvas gone at 8.4 s; div#loading "Loading 69%" over the canvas gone at 8.6 s; div#loading "Loading 71%" over the canvas gone at 8.7 s; div#loading "Loading 73%" over the canvas gone at 8.8 s; div#loading "Loading 75%" over the canvas gone at 8.9 s; div#loading "Loading 78%" over the canvas gone at 9.0 s; div#loading "Loading 80%" over the canvas gone at 9.1 s; div#loading "Loading 82%" over the canvas gone at 9.2 s; div#loading "Loading 84%" over the canvas gone at 9.3 s; div#loading "Loading 86%" over the canvas gone at 9.4 s; div#loading "Loading 89%" over the canvas gone at 9.5 s; div#loading "Loading 91%" over the canvas gone at 9.6 s; div#loading "Loading 93%" over the canvas gone at 9.7 s; div#loading "Loading 95%" over the canvas gone at 9.8 s; div#loading "Loading 98%" over the canvas gone at 9.9 s; div#loading "Loading 100%" over the canvas gone at 10.3 s.
```

On fast-4g every download is done by 2.0 s, and the one limit left over is the frame time this host cannot judge. The loading screen goes at 5.0 s; the time between the model's arrival and that is the page's own work on a software renderer, which a phone with a GPU does in its own time. On slow-4g the same page shows the vase at 10.3 s. The label sat at `Loading 0%` until 8.2 s, though the model had been arriving for a while: the page's start-up work was still holding the main thread, so the progress callbacks ran late.

| Version | Script by | Model by | Loading screen gone (fast-4g) |
|---|---|---|---|
| unbuilt, 4096 px textures | 2.8 s | not within the measure | still up at 12.9 s |
| unbuilt, 1024 px textures | 2.8 s | 3.9 s | 6.8 s |
| built, 1024 px textures | 1.0 s | 2.0 s | 5.0 s |

## The bytes are as sent

The harness's own server does not compress anything, and the replies count the bytes as they crossed the throttled link. A host or CDN that serves JavaScript with gzip or brotli sends the minified three.js in a fraction of its size, so the script times above are an upper bound. A GLB whose textures are WebP or JPEG gains less from that, since its images are compressed already; its geometry compresses somewhat. A second visit with the browser cache warm is faster again, and these timings never measure it: every visit here is a first one with the cache off.

## When should a three.js loading screen be hidden?

When the last file has arrived and been parsed, and the frame that shows it can be drawn without a stall. The usual first tries each miss part of that. The window's `load` event does not wait for the files three's loaders fetch (`GLTFLoader` and `HDRLoader` read theirs with `fetch`). A loader's own callback waits for its file and no other. And a screen removed in a success callback stays up for good when the load fails.

A page with a `#loading` div over the canvas, like the vase page above, loads a dog model compressed with meshopt and an HDR sky for its lighting, and removes the screen when the model is in:

```js
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

new HDRLoader().load('env/room.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = scene.background = hdr;
});
new GLTFLoader().load('models/dog.glb', (gltf) => {
  gltf.scene.name = 'dog';
  gltf.scene.scale.setScalar(0.1);
  scene.add(gltf.scene);
  document.getElementById('loading').remove(); // the model is in: hide the screen
});
```

These replies were captured on 2026-10-28 on the same kind of host as above (no GPU, SwiftShader), cut to the lines this section discusses:

```text
open {"url": "stuck.html", "cwd": "<project>"}

Over the canvas: div#loading "Loading" shows over 100% of it (background rgb(29, 33, 40)) and takes the clicks on 100% of it (listeners on the canvas miss them). A visitor sees it first; `look` opening: true shows how long it stays.
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Error: THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files
Loaded: room.hdr 1.6 MB, dog.glb 1.1 MB
```

Both files arrived; the model could not be decoded, so the callback that removes the screen never ran, and `entities` is empty. A visitor would wait on "Loading" for good, with the reason nowhere but the console. One `LoadingManager` for every loader answers all three misses: its `onLoad` runs once the last file has been parsed, and its `onError` names the one that failed. `onLoad` runs after a failure too, so the page keeps its own flag. Before removing the screen, `renderer.compileAsync` compiles the scene's shaders, which would otherwise be compiled on the first frame that draws the model, the delay the "delay between the model load and the scene rendering" thread asks about:

```js
const loading = document.getElementById('loading');
let failed = false;
const manager = new THREE.LoadingManager();
manager.onError = (url) => { failed = true; loading.textContent = `Could not load ${url}`; };
manager.onLoad = async () => {
  if (failed) return; // onLoad runs after a failure too: keep the message up
  await renderer.compileAsync(scene, camera); // the shaders, before the frame that shows the model
  renderer.render(scene, camera);
  requestAnimationFrame(() => loading.remove());
};

new HDRLoader(manager).load('env/room.hdr', (hdr) => { /* as before */ });
new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).load('models/dog.glb', (gltf) => { /* as before, without remove() */ });
```

`MeshoptDecoder` comes from `three/addons/libs/meshopt_decoder.module.js`. On a first visit over fast-4g:

```text
open {"url": "fixed.html", "cwd": "<project>", "network": "fast-4g"}

First scene frame: 2.9 s after navigation on fast-4g, a first visit with no cache (scripts 2.22 MB by 2.9 s, dog.glb 1.04 MB by 5.3 s, 902cb891-3444-4a26-9cc5-7b81c15815b2 0 MB by 5.3 s, room.hdr 1.57 MB by 5.8 s); div#loading "Loading" over the canvas gone at 10.1 s. Host load 25.5 on 64 cores.
three.js warned: THREE.WebGLRenderer: KHR_parallel_shader_compile extension not supported. (×3)
```

The screen now goes after the last file, the sky at 5.8 s, never before it. The seconds between the two are the page's own work after the download (decoding, the sky's environment map, compiling, the first frame) on a software renderer, which lacks the extension `compileAsync` uses to compile in the background, hence three's warning; they say nothing of a phone with a GPU, and this guide draws nothing from them. (The 0 MB entry named by a UUID is the model's embedded texture, which `GLTFLoader` reads from a blob URL in memory.) With the decoder left out, the same page keeps its screen up with the reason on it:

```text
open {"url": "fixed-nodecoder.html", "cwd": "<project>"}

Over the canvas: div#loading "Could not load models/dog.glb" shows over 100% of it (background rgb(29, 33, 40)) and takes the clicks on 100% of it (listeners on the canvas miss them). A visitor sees it first; `look` opening: true shows how long it stays.
```

`open` pauses the page at frame 0, so its own reply on the working page still lists the screen, which leaves on a later frame; after one `interact` step that waits three frames, `look` lists the dog on screen with nothing over the canvas.

In React Three Fiber, `<Suspense fallback>` stays up until every component inside it that loads with `useLoader` (or drei's `useGLTF`) has its file, and drei's `useProgress` reads three's `DefaultLoadingManager`, so a loader given a manager of its own is not counted. Neither waits for shaders; drei's `<Preload all />` compiles the scene before it is first drawn.

What these tools do not show on this host: a page that removes its screen on the window's `load` event, before the models arrive. The network timing stops once nothing covers the canvas, and files still downloading then are not timed on the throttled network, so the gap between the screen leaving and the model appearing is not measured; `look` with `opening: true` takes its first picture seconds after load on a software renderer, after a local load has finished.

## What paprika3d does not do

- It does not configure your host or CDN: compression and cache headers are the server's. The timings here are from the harness's local server; `publish` puts a project on a paprika3d.app site of its own, which this guide did not time.
- It does not test on a real phone or a real network. The presets are Chrome's throttling of this host's connection.
- It does not stream a model in parts or load a low-resolution version first. That is code in the page: a small GLB shown first and the full one swapped in when it arrives.
- `shrink` resizes textures and nothing else; geometry compression and fewer triangles are steps outside paprika3d.

## Pitfalls

- **Draw while you load, but show something.** A render loop that starts at once keeps the page responsive; a scene that is empty for seconds behind no loading screen looks broken.
- **A Draco or KTX2 file adds requests.** The decoder (`DRACOLoader`) or transcoder (`KTX2Loader`) is fetched before the model can be parsed; time the page with it in place.
- **Check the deployed site, not localhost.** Point `open` at the hosted URL with `network` set to time what the server really sends.
- **Watch the start-up work as well as the bytes.** An environment map, many shader programs or huge textures keep the main thread busy after the download, and the progress bar stops moving while they run.

## Without paprika3d

The browser's network panel has the same fast and slow 4G presets and a "Disable cache" switch; reload with both and read the waterfall for when the model arrived, and the performance panel for when the first frame was drawn. Lighthouse and WebPageTest time a first visit on a throttled connection with a real browser and report when content was first drawn. In the page, a `THREE.LoadingManager` passed to every loader calls `onProgress(url, itemsLoaded, itemsTotal)` as each file finishes, which counts files instead of bytes, and drei's `useProgress` reads the same manager for React Three Fiber. For the model itself, `gltf-transform inspect` and gltf.report list what the file holds.
