---
title: three.js glTF model failed to load? Find the file, the decoder or the path
phrase: three.js gltf model failed to load
description: When a three.js glTF model fails to load, the scene stays empty and the reason is in a console line or a network status. How a coding agent reads a 404, a missing DRACOLoader, a texture that did not load and a model a production build left out, from the paprika3d plugin's open and observe replies.
meta: three.js glTF model failed to load? Find the 404, the missing DRACOLoader, the texture that did not load, or the file a build left out.
intent: gltf-load-errors
queries:
  - "THREE.GLTFLoader: No DRACOLoader instance provided"
  - "How to use DRACOLoader with GLTFLoader in ReactJs?"
  - "THREE.GLTFLoader: Couldn't load texture"
  - "Can't load gltf file in production build"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js glTF model failed to load? Find the file, the decoder or the path

## Four ways a glTF load goes wrong

`GLTFLoader.load` calls its `onLoad` callback with the model, or its `onError` callback with a reason. Most pages pass the first and leave out the second, so a failed load leaves no model in the scene and one line in the browser console. The usual reasons:

- **The file is not there.** The URL is wrong, or relative to the wrong folder, and the server answers 404.
- **The model is Draco-compressed** and the loader has no `DRACOLoader`. GLTFLoader throws `No DRACOLoader instance provided`.
- **A texture is missing.** A `.gltf` file names its images by path; when one of them returns 404, GLTFLoader logs `Couldn't load texture` and still adds the model, untextured.
- **The production build left the file out.** The dev server serves files from the project folder, so the model loads during development; the build copies what it bundles and the `public/` folder and leaves the rest out, and the deployed page asks for a file that is not there.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Its `open` reply lists the asset files the page fetched (`Loaded`), the ones that failed with their status (`Failed to load`), and the console errors from loading (`Errors so far`). A coding agent reads the reason from that reply instead of from a screenshot of an empty scene.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page that loads a Draco model

This page loads a Draco-compressed GLB with the decoder set up. In a project the model is a file under `models/`; here a small Draco GLB of a 1 × 1 × 1 box is inlined as a data URL, so the block runs on its own. The decoder files ship with three.js, in `three/examples/jsm/libs/draco/`.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crate</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// In a project this is a file, 'models/crate-draco.glb'. Here the same kind of Draco-compressed GLB
// (a 1 × 1 × 1 box) is inlined, so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAACUBAAAtAMAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjM2fSx7InR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjI0LCJtYXgiOlswLjUsMC41LDAuNV0sIm1pbiI6Wy0wLjUsLTAuNSwtMC41XX0seyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNH0seyJ0eXBlIjoiVkVDMiIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNH1dLCJidWZmZXJWaWV3cyI6W3siYnVmZmVyIjowLCJieXRlT2Zmc2V0IjowLCJieXRlTGVuZ3RoIjoxOTV9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6MTk1fV0sIm1hdGVyaWFscyI6W3sibmFtZSI6Indvb2QiLCJwYnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLjY5LDAuNDIsMC4yLDFdLCJyb3VnaG5lc3NGYWN0b3IiOjAuOCwibWV0YWxsaWNGYWN0b3IiOjB9fV0sIm1lc2hlcyI6W3sibmFtZSI6ImNyYXRlIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MSwiTk9STUFMIjoyLCJURVhDT09SRF8wIjozfSwibW9kZSI6NCwibWF0ZXJpYWwiOjAsImluZGljZXMiOjAsImV4dGVuc2lvbnMiOnsiS0hSX2RyYWNvX21lc2hfY29tcHJlc3Npb24iOnsiYnVmZmVyVmlldyI6MCwiYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxLCJURVhDT09SRF8wIjoyfX19fV19XSwibm9kZXMiOlt7Im5hbWUiOiJjcmF0ZSIsIm1lc2giOjB9XSwic2NlbmVzIjpbeyJub2RlcyI6WzBdfV0sImV4dGVuc2lvbnNVc2VkIjpbIktIUl9kcmFjb19tZXNoX2NvbXByZXNzaW9uIl0sImV4dGVuc2lvbnNSZXF1aXJlZCI6WyJLSFJfZHJhY29fbWVzaF9jb21wcmVzc2lvbiJdfSDEAAAAQklOAERSQUNPAgIBAQAAAAgMAgsAAANvtRQBARBVBNdT9kZVBNdT9kYD/wAAAAEAAQEAAQAJAwAAAgEBCQMAAQMBAwkCAAICAQEBAAMDASgBGAMA6LExQpRAAAAAAAD/PwAAAAAAvwAAAL8AAAC/AACAPw4AAwEBAYEEqTb/////////960GrQIHUCRrdKNsgf8DAAD/AQAACgEBAQEBA60eARRVDQuKfZmOMPmz+r4/SwAAAAD/DwAAAAAAAAAAAAAAAIA/DAA=';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343c);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 1.6, 3);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));

// A Draco-compressed model needs a DRACOLoader, and the decoder files at the path it is given.
const draco = new DRACOLoader().setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
loader.load(MODEL, (gltf) => {
  gltf.scene.name = 'crate';   // a name, so the replies can point at it
  scene.add(gltf.scene);
}, undefined, (err) => console.error('crate did not load:', err));

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies after the first are cut to the lines this guide discusses, with nothing reworded. The machine that captured them has no GPU, which is what the `GPU:` line says; loading does not depend on it.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:43283/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-16-04-031Z

look {}

Picture: <project>/paprika3d/runs/2026-10-28T05-16-04-031Z/look-1.png
Pixels: brightness 24%, colour saturation 23%, 0% near black, 0% blown out.
Hues: grey 90%, orange 10% of the frame; over the objects (9.9% of it): orange 100%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
On screen (1):
crate 9.9% [455, 237, 812, 602]
Never visible: none
```

`entities` lists `crate`, so the model reached the scene before frame 0, and `look` finds it on screen. The rest of this guide is what the replies say when it does not. Each failing page below is the same page with one change, loading real files from `models/` in a project folder.

## The file is not there: 404

The page asks for `models/crate.glb`, and the folder has no such file:

```js
new GLTFLoader().load('models/crate.glb', (gltf) => { gltf.scene.name = 'crate'; scene.add(gltf.scene); });
```

```text
open {"url": "missing.html", "cwd": "<project>"}

Opened http://127.0.0.1:41411/missing.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) models/crate.glb
HttpError: fetch for "http://127.0.0.1:41411/models/crate.glb" responded with 404: Not Found
Failed to load: crate.glb (404)
```

`Failed to load` names the file and the status, and `entities` is empty. The fix is the path: a relative URL resolves against the page's address, not against the script file that calls the loader.

## No DRACOLoader instance provided

The model is Draco-compressed and the loader has no decoder:

```js
new GLTFLoader().load('models/crate-draco.glb', (gltf) => { gltf.scene.name = 'crate'; scene.add(gltf.scene); });
```

```text
open {"url": "nodraco.html", "cwd": "<project>"}

Opened http://127.0.0.1:41411/nodraco.html in 0.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Error: THREE.GLTFLoader: No DRACOLoader instance provided.
Loaded: crate-draco.glb 0.0 MB
```

This reply has the file under `Loaded`, so the download worked, and the error says what is missing. The same error arrives later on a page that loads its model after a click or a level change; then it is in the `errors` list of the next `observe`:

```text
observe {}

{"entities":{},"harness":{"frame":0,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":1,"meshes":0,"lights":1,"cameras":0},"errors":["Error: THREE.GLTFLoader: No DRACOLoader instance provided."],"changed":null}}
```

The fix is the three lines in the page above: make a `DRACOLoader`, give it the decoder's folder with `setDecoderPath`, and pass it to `setDRACOLoader`. In React Three Fiber, drei's `useGLTF` sets up a `DRACOLoader` for you, with the decoder from Google's CDN unless its second argument names another path; with `useLoader(GLTFLoader, url, (loader) => loader.setDRACOLoader(draco))` you pass your own. With that change and the same file, the reply is:

```text
open {"url": "draco.html", "cwd": "<project>"}

Opened http://127.0.0.1:41411/draco.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate-draco.glb 0.0 MB
```

## Couldn't load texture

A `.gltf` file keeps its geometry in a `.bin` file and its images as separate files, named by path in the JSON. Here `crate.gltf` names `wood.png`, which was not copied next to it:

```text
open {"url": "notex.html", "cwd": "<project>"}

Opened http://127.0.0.1:41411/notex.html in 0.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) models/wood.png
THREE.GLTFLoader: Couldn't load texture wood.png
Loaded: crate.gltf 0.0 MB, crate.bin 0.0 MB
Failed to load: wood.png (404)
```

The model is in `entities` and on screen, so this failure is easy to miss in a screenshot: the crate is drawn in its plain material colour. `look` reports the colours over the objects; this crate read `grey 100%`, and with its texture `orange 100%`. The fix is to put the image where the `.gltf` says, which is relative to the `.gltf` file, or to export a `.glb`, which carries its images inside.

## Can't load the glTF in the production build

In this Vite project the model sits in `models/` next to `index.html`, and `src/main.js` loads it by an absolute path:

```js
// models/ sits next to index.html: the dev server serves it, vite build does not copy it.
new GLTFLoader().load('/models/crate.glb', (gltf) => { gltf.scene.name = 'crate'; scene.add(gltf.scene); });
```

`open` takes the command that starts a server. On the dev server the model loads:

```text
open {"command": "bunx vite --port 5391 --strictPort", "cwd": "<project>"}

Opened http://localhost:5391/ in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate.glb 0.0 MB
```

On the built site, served by `vite preview`, it does not:

```text
open {"command": "bunx vite build && bunx vite preview --port 5392 --strictPort", "cwd": "<project>"}

Opened http://localhost:5392/ in 0.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
Loaded: crate.glb 0.0 MB
```

Read this one with care. `crate.glb` is listed under `Loaded` because the request succeeded, but the preview server answered a path it does not have with the site's `index.html`, and GLTFLoader tried to parse that HTML. The `SyntaxError` about `<!doctype` is the clue: whenever a model load fails with `Unexpected token '<'`, the server sent a web page instead of the file. `eval` shows what came back:

```text
eval {"code": "const r = await fetch('/models/crate.glb'); return { status: r.status, type: r.headers.get('content-type') }"}

{"status":200,"type":"text/html"}
```

The fix is to move the model into `public/models/`, which Vite copies into the build as is. After `mv models public/`, the built site loads it:

```text
open {"command": "bunx vite build && bunx vite preview --port 5393 --strictPort", "cwd": "<project>"}

Opened http://localhost:5393/ in 0.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate.glb 0.0 MB
```

Importing the file instead (`import url from './crate.glb?url'`) also works: Vite then copies it into the build under a hashed name.

## What to read in the replies

- `open`, `entities`: the named objects in the scene at frame 0. A model that should be there and is not did not load, or loaded without its `name`.
- `open`, `Failed to load`: each asset that returned an error status, with the status.
- `open`, `Errors so far`: the loader's own message (`No DRACOLoader instance provided`, `Couldn't load texture`, a `SyntaxError`).
- `open`, `Loaded`: the asset files that came back without an error status. A file listed here can still be the wrong content, as in the production build above.
- `observe`, `harness.errors`: console errors since the last `observe`, for models loaded after the page opened.

## Pitfalls

- **Pass an `onError` callback.** `loader.load(url, onLoad, undefined, onError)`, or `await loader.loadAsync(url)` in a `try`, turns a silent empty scene into a message the page can show.
- **Name the model's root.** `gltf.scene.name = 'crate'` makes the model appear by name in `entities`, `look` and `observe`.
- **Paths in a `.gltf` are relative to the `.gltf`.** Move the `.bin` and the images with it, or use `.glb`.
- **One DRACOLoader for the page.** Create it once and share it across loaders; each instance starts its own decoder workers.
- **paprika3d reports loads; it does not fix them.** It does not move a model, change the loader code or edit the build config. The agent makes the change and opens the page again.

## Without paprika3d

The same information is in the browser. The console shows the GLTFLoader messages, and the network panel shows each request's status and content type; a model request answered with `text/html` is the production-build case above. In the page, a `THREE.LoadingManager` passed to the loaders reports each failed URL through `manager.onError`, and `DRACOLoader.setDecoderPath` can point at a CDN copy of the decoder, such as `https://www.gstatic.com/draco/versioned/decoders/1.5.5/`, the one drei uses, instead of a local folder.
