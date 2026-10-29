---
title: Deploy a three.js site without a 404: open the built folder before you upload it
phrase: deploy a three.js site
description: Why a three.js page that works on localhost shows nothing once deployed, a .glb or three.js itself answering 404, and how a coding agent checks the built folder first with the paprika3d plugin's open tool. Covers an import map into node_modules, a model under src/ named by a string, the public/ folder and Vite's base path on a subfolder host.
meta: Deploy a three.js site without a 404: open the built folder before you upload it, and catch missing models, textures and wrong paths first.
intent: deploy-threejs-site
queries:
  - "How to publish three.js web app"
  - "Unable to load .glb model file into React with GLTFLoader (bad URL 404)"
  - "Npm run build does not include three.js dependencies"
  - "Load models from public folder with vite"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Deploy a three.js site without a 404: open the built folder before you upload it

## What the host has that your machine does not

A host serves the files you upload, from the address you upload them to, and nothing else. On your machine the dev server serves the whole project folder, `node_modules` included, from the root of `localhost`. Three differences between the two account for most "works locally, blank once deployed" threads:

- **three.js is not in the upload.** A page with no build step imports three through an import map that points into `./node_modules/`. That folder is usually in `.gitignore`, so a push to the host does not send it, and on the host `three.module.js` answers 404 and the page draws nothing.
- **The model is not in the build.** `vite build` copies what the code imports and what is in `public/`. A model under `src/` that the code names by a string (`'/src/models/crate.glb'`) is served by the dev server and left out of `dist/`.
- **The site is not at the root.** A GitHub Pages project site lives at `/<repo>/`. A build made for the root asks for `/assets/index-*.js` and `/models/crate.glb` at the host's root, where they are not.

Each one is visible before you upload. paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome; its `open` tool serves a folder (`url`, relative to `cwd`) from the root of a local server or runs a `command`, and its reply lists the asset files the page fetched (`Loaded`), each that failed with its status (`Failed to load`) and the console errors. Point it at the folder you are about to upload, served the way the host will serve it, and a 404 shows up in that reply instead of on the live site.

The guide "three.js glTF model failed to load?" covers reading a load failure itself (a wrong path, a missing `DRACOLoader`, a missing texture, and `vite preview` answering a missing model with `index.html`). This one is about the step between a working dev server and a working host.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with no build step

This page imports three through an import map into `node_modules`, as many three.js examples do. Its model is a small box GLB inlined as a data URL, so the one thing it fetches is three itself.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crate viewer</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<!-- three comes from node_modules: fine on your machine, a 404 on a host you upload this folder to without it -->
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// A 1 × 1 × 1 box GLB, inlined so the page is one file and the only thing it fetches is three.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAAD0BQAAUAMAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC41LDAuNSwwLjVdLCJtaW4iOlstMC41LC0wLjUsLTAuNV0sImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjB9LHsidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjEyfSx7InR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjB9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6NTc2LCJieXRlU3RyaWRlIjoyNCwidGFyZ2V0IjozNDk2Mn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjU3NiwiYnl0ZUxlbmd0aCI6NzIsInRhcmdldCI6MzQ5NjN9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NjQ4fV0sIm1hdGVyaWFscyI6W3sibmFtZSI6ImNsYXkiLCJwYnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLjgsMC40NSwwLjMsMV0sInJvdWdobmVzc0ZhY3RvciI6MC42LCJtZXRhbGxpY0ZhY3RvciI6MH19XSwibWVzaGVzIjpbeyJuYW1lIjoiYm94IiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxfSwibW9kZSI6NCwibWF0ZXJpYWwiOjAsImluZGljZXMiOjJ9XX1dLCJub2RlcyI6W3sibmFtZSI6ImJveCIsIm1lc2giOjB9XSwic2NlbmVzIjpbeyJub2RlcyI6WzBdfV19IIgCAABCSU4AAAAAPwAAAD8AAAA/AACAPwAAAAAAAAAAAAAAPwAAAD8AAAC/AACAPwAAAAAAAAAAAAAAPwAAAL8AAAA/AACAPwAAAAAAAAAAAAAAPwAAAL8AAAC/AACAPwAAAAAAAAAAAAAAvwAAAD8AAAC/AACAvwAAAAAAAAAAAAAAvwAAAD8AAAA/AACAvwAAAAAAAAAAAAAAvwAAAL8AAAC/AACAvwAAAAAAAAAAAAAAvwAAAL8AAAA/AACAvwAAAAAAAAAAAAAAvwAAAD8AAAC/AAAAAAAAgD8AAAAAAAAAPwAAAD8AAAC/AAAAAAAAgD8AAAAAAAAAvwAAAD8AAAA/AAAAAAAAgD8AAAAAAAAAPwAAAD8AAAA/AAAAAAAAgD8AAAAAAAAAvwAAAL8AAAA/AAAAAAAAgL8AAAAAAAAAPwAAAL8AAAA/AAAAAAAAgL8AAAAAAAAAvwAAAL8AAAC/AAAAAAAAgL8AAAAAAAAAPwAAAL8AAAC/AAAAAAAAgL8AAAAAAAAAvwAAAD8AAAA/AAAAAAAAAAAAAIA/AAAAPwAAAD8AAAA/AAAAAAAAAAAAAIA/AAAAvwAAAL8AAAA/AAAAAAAAAAAAAIA/AAAAPwAAAL8AAAA/AAAAAAAAAAAAAIA/AAAAPwAAAD8AAAC/AAAAAAAAAAAAAIC/AAAAvwAAAD8AAAC/AAAAAAAAAAAAAIC/AAAAPwAAAL8AAAC/AAAAAAAAAAAAAIC/AAAAvwAAAL8AAAC/AAAAAAAAAAAAAIC/AAACAAEAAgADAAEABAAGAAUABgAHAAUACAAKAAkACgALAAkADAAOAA0ADgAPAA0AEAASABEAEgATABEAFAAWABUAFgAXABUA';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343c);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 1.6, 3);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));

new GLTFLoader().load(MODEL, (gltf) => {
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

The calls in this guide were made on 2026-10-28 with three.js 0.186 and Vite 7, on a Linux server with no GPU (Chrome drew in software, SwiftShader, which is what the `GPU:` line says; nothing here depends on it). Paths are shortened to `<project>`, and replies after the first are cut to the lines this guide discusses, with nothing reworded.

In the project folder, where `node_modules` is, the page works:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:34949/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
```

## three.js left out of the upload

Copy the files you will upload into a folder of their own (here `upload/`, holding `index.html` alone, which is what a push of the repository with `node_modules` ignored sends) and open that folder:

```text
open {"url": "index.html", "cwd": "<project>/upload"}

game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:34949/index.html
Failed to load resource: the server responded with a status of 404 (Not Found) node_modules/three/build/three.module.js (run bun add three in cwd)
Failed to load resource: the server responded with a status of 404 (Not Found) node_modules/three/examples/jsm/loaders/GLTFLoader.js (run bun add three in cwd)
```

The page never made a renderer, because the module that would make it never arrived. The hint at the end of each line is for a project folder; for a folder you upload, the fix is one of these:

- **Build it.** `vite build` (or any bundler) puts the parts of three the page imports into one script in `dist/`, and you upload `dist/`. This is the usual answer to "npm run build does not include three.js dependencies": the build does include them, in the bundle, and `node_modules` is never uploaded.
- **Load three from a CDN.** Point the import map at a copy pinned to the version you wrote the page for:

```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"}}</script>
```

```text
open {"url": "index.html", "cwd": "<project>/upload-cdn"}

Opened http://127.0.0.1:34949/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
```

## A model the Vite build left out

In this Vite project the model is `src/models/crate.glb`, and `src/main.js` names it by a string. The rest of `main.js` is the scene of the page above.

```js
// The model sits in src/models/ and is named by a string: the dev server serves it, vite build does not copy it.
new GLTFLoader().load('/src/models/crate.glb', (gltf) => {
  gltf.scene.name = 'crate';
  scene.add(gltf.scene);
}, undefined, (err) => console.error('crate did not load:', err));
```

`open` with a `command` runs the dev server, and the model loads:

```text
open {"command": "./node_modules/.bin/vite --port 5401 --strictPort", "cwd": "<project>"}

Opened http://localhost:5401/ in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate.glb 0.0 MB
```

After `vite build`, open `dist/` as a host serves a site at its root, with `cwd` set to the built folder:

```text
open {"url": "index.html", "cwd": "<project>/dist"}

Opened http://127.0.0.1:39299/index.html in 0.4 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) src/models/crate.glb
crate did not load: ed: fetch for "http://127.0.0.1:39299/src/models/crate.glb" responded with 404: Not Found
Failed to load: crate.glb (404)
```

`Failed to load` names the file and `entities` is empty. (`ed` is three's `HttpError` class, renamed by the minifier.) `dist/` has `index.html` and one script in `assets/`, and no model. The fix is to let the build see the file: `new URL` with `import.meta.url` is a pattern Vite rewrites at build time, copying the model into `dist/assets/` under a hashed name.

```js
// new URL(..., import.meta.url) tells vite build to copy the model into dist/assets/ and rewrite the URL to it.
const CRATE = new URL('./models/crate.glb', import.meta.url).href;
new GLTFLoader().load(CRATE, (gltf) => {
  gltf.scene.name = 'crate';
  scene.add(gltf.scene);
}, undefined, (err) => console.error('crate did not load:', err));
```

```text
open {"url": "index.html", "cwd": "<project>/dist"}

Opened http://127.0.0.1:39299/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate-BtTwrOnR.glb 0.0 MB
```

`import crateUrl from './models/crate.glb?url'` does the same. In a Create React App project, a model under `src/` named by a string does not load even on the dev server, which serves `public/` alone; the fix is the same, import it or move it to `public/`.

## A site in a subfolder: Vite's `base`

A GitHub Pages project site, or any host that serves the site under a path, puts `index.html` at `/<repo>/`. Opening `dist/` from the project folder (`url` set to `dist/`) serves it the same way, at `/dist/`:

```text
open {"url": "dist/", "cwd": "<project>"}

game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:39299/dist/
Failed to load resource: the server responded with a status of 404 (Not Found) http://127.0.0.1:39299/assets/index-BJguXUCv.js
```

The built `index.html` loads its script with `src="/assets/index-BJguXUCv.js"`, from the host's root, so the whole app is missing, the model with it. Vite's `base` option sets the path the build writes; `'./'` makes every URL relative to the page, which works at the root and in any folder (`'/<repo>/'` works too, for that one folder):

```js
// vite.config.js
export default { base: './' };
// assetsInlineLimit is 4096 by default: a file smaller than that is inlined into the script as a data URL, not copied.
```

```text
open {"url": "dist/", "cwd": "<project>"}

Opened http://127.0.0.1:39299/dist/ in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate-BtTwrOnR.glb 0.0 MB
```

## The public folder and an absolute path

The other usual fix for the left-out model is `public/models/crate.glb`, which Vite copies into `dist/models/` as is. With `base: './'` set and the model named `'/models/crate.glb'`, the subfolder open gives:

```text
open {"url": "dist/", "cwd": "<project>"}

Opened http://127.0.0.1:39299/dist/ in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) http://127.0.0.1:39299/models/crate.glb
crate did not load: ed: fetch for "http://127.0.0.1:39299/models/crate.glb" responded with 404: Not Found
Failed to load: crate.glb (404)
```

The file is in `dist/models/`, but a string in your code is not rewritten by `base`: a slash at the start still means the host's root. Build the URL from `import.meta.env.BASE_URL`, which is the `base` the build used:

```js
// import.meta.env.BASE_URL is vite's base ('./' here), so the URL works from any folder.
new GLTFLoader().load(import.meta.env.BASE_URL + 'models/crate.glb', (gltf) => {
```

```text
open {"url": "dist/", "cwd": "<project>"}

Opened http://127.0.0.1:39299/dist/ in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate.glb 0.0 MB

look {}

On screen (1):
crate 9.9% [455, 237, 812, 602]
Never visible: none
```

## What to read in the replies

- `entities`: the named objects in the scene at frame 0. Empty on the built folder and full on the dev server means the build or the path changed something.
- `Failed to load`: each asset that answered with an error status, with the status.
- `game not ready after 10 s` with a 404 for a script: the page's own code or three.js did not arrive, so no renderer was made. A script under `/assets/` points at `base`; a script under `node_modules/` points at an upload without a build.
- `Wrote geo.js and fx.js here`: `open` writes these two files, and a `paprika3d/` run folder, into the folder it serves. Opening `dist/` itself as `cwd` puts them in `dist/`; build again before you upload, which empties it, or open `dist/` from the project folder as in the subfolder check.

## What paprika3d does not do

- It does not deploy to your host or set the host up. It serves a folder on a local server, so it checks the files and the paths, not the host's own rules (redirects, a single-page fallback, headers, HTTPS).
- It does not know which files your upload tool sends. It checks the folder you open, so open the exact folder you will upload.
- It does not change `vite.config.js` or your code; the agent makes the change and opens the built folder again.
- paprika3d has a `publish` tool. Its description says it publishes the project at a public `https://<slug>.paprika3d.app` address, as a preview that is invite-only, and never for another host. It is not a way to put a site on your own host, and this guide does not use it.

## Pitfalls

- **Test the build, not the dev server.** The dev server serves the whole project folder, so it hides every one of these faults.
- **Open the folder you upload, from where the host serves it.** As its own `cwd` for a site at the root; as a subfolder of `cwd` for a project site under a path.
- **A slash at the start of a URL is the host's root.** `'/models/crate.glb'` in code and `/assets/...` in the built HTML both break under a subfolder; `base` fixes the second, `import.meta.env.BASE_URL` the first.
- **Pin a CDN copy of three.** An import map to an unversioned URL changes under you when three.js releases.
- **Names are case-sensitive on most hosts.** `Crate.glb` loads from `crate.glb` on a Mac's default disk and answers 404 on a Linux host.

## Without paprika3d

Run `npx vite build && npx vite preview` and watch the browser's network panel for red rows. A static server started inside `dist/` (`npx serve dist` or `python3 -m http.server`) answers a missing file with a plain 404, closer to most static hosts than `vite preview`, which answers it with `index.html`. For the upload, `git ls-files` lists what a push sends, and three.js's own manual has an installation page that compares the import map, CDN and build setups.
