---
title: three.js import map for three/addons: load OrbitControls and loaders from examples/jsm without a bundler
phrase: three.js import map
description: Why three.js needs an import map, what three/addons/ maps to and why it must point at examples/jsm/ in a browser, a CDN-only page pinned to one release, and editor completion; with what the paprika3d plugin's open tool reports for each mistake: an unmapped three, an unmapped three/addons/, the alias path answering 404, and a CDN map an old release behind.
meta: The three.js import map for three/addons: why three needs one, where three/addons/ must point, and what each broken map prints, checked with open.
intent: import-three-examples-jsm-importmap
queries:
  - "Why does Three.js require a import map?"
  - "CDN only approach: not so satisfying"
  - "How to import classes from three/examples/jsm in a React Typescript app?"
  - "VSCode and intellisense"
  - "Bug: importmap isn't suppored by Firefox and Safari"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js import map for three/addons: load OrbitControls and loaders from examples/jsm without a bundler

## Why three.js needs an import map

three.js ships as ES modules, and its addons (controls, loaders, geometries, post-processing) import three by its bare name: `OrbitControls.js` starts with `import { ... } from 'three'`. Your own code does the same. A bundler such as Vite resolves a bare name from `node_modules`. A browser resolves it through an import map, or not at all, and every addon resolving `'three'` to the same URL is what keeps one copy of three on the page; a second copy prints [the "Multiple instances of Three.js being imported" warning](/errors/multiple-instances-of-three-js).

`three/addons/` is an alias, and that is the second thing to get right. three's `package.json` maps `./addons/*` to `./examples/jsm/*` for tools that read it, which is why `import ... from 'three/addons/controls/OrbitControls.js'` works under a bundler. A browser does not read `package.json`: it takes the import map literally, so the map's `three/addons/` entry has to point at the real folder, `examples/jsm/`.

Two more facts settle the older threads. Import maps work in current Chrome, Edge, Firefox (since 108) and Safari (since 16.4); for an older browser the `es-module-shims` polyfill adds them. And a page opened as a file, from `file://`, cannot load modules at all; it has to be served over HTTP.

paprika3d is a Claude Code plugin and MCP server that serves a folder over HTTP and opens the page in its own headless Chrome. Its `open` reply carries the page's console errors and the fetches that failed, and it reads the three.js release the page loads against the current one, from `node_modules`, `package.json` or the import map's URL.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The page

One import map with two entries, `three` for the core and `three/addons/` for everything under `examples/jsm/`, then a module that imports from both:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Rounded box</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202634);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.5, 2, 3.5);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 2.5));
const box = new THREE.Mesh(new RoundedBoxGeometry(1.4, 1.4, 1.4, 6, 0.2), new THREE.MeshStandardMaterial({ color: 0x5fb3a1 }));
box.name = 'box';
scene.add(box);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
</script>
</body></html>
```

## Four maps that break, and what open says

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); nothing here depends on frame times. Each is the same page with nothing changed but the import map, opened with `open {"url": "index.html", "cwd": "<project>"}`; run folder paths are shortened to `<project>`.

**1. No import map.**

```text
game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:32961/index.html
Failed to resolve module specifier "three". Relative references must start with either "/", "./", or "../".
```

The browser has no way to turn `'three'` into a URL, so the module never runs.

**2. `three` mapped, `three/addons/` not.** A map with the `three` entry alone:

```text
game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:32961/index.html
Failed to resolve module specifier "three/addons/controls/OrbitControls.js". Relative references must start with either "/", "./", or "../".
```

An import map matches whole names, or prefixes for keys that end in `/`. `"three"` does not cover `"three/addons/..."`, so the addon needs its own entry.

**3. `three/addons/` pointing at the alias.** `"three/addons/": "./node_modules/three/addons/"`, the path a bundler would accept:

```text
game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:32961/index.html
Failed to load resource: the server responded with a status of 404 (Not Found) node_modules/three/addons/controls/OrbitControls.js (run bun add three in cwd)
Failed to load resource: the server responded with a status of 404 (Not Found) node_modules/three/addons/geometries/RoundedBoxGeometry.js (run bun add three in cwd)
```

Both addons answer 404, each named by its path: the package has no `addons` folder, just the alias in its `package.json`. The fix is the real folder, `./node_modules/three/examples/jsm/`. The hint at the end of each line is wrong for this case: three is installed, and the path is what needs changing.

**4. A CDN map pinned to an old release.** For a page with no `node_modules` at all, both entries from jsDelivr, pinned to three 0.160.0:

```text
Opened http://127.0.0.1:37997/index.html in 0.4 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
three r160 installed (current r186).
Page text outside the canvas: none
{"three":"160","scenes":1,"entities":["box"]}
```

This one runs, and the `three r160 installed` line says how far behind it is. A CDN-only page is a fine setup as long as the version is in both URLs and the same in both: an unversioned URL changes under the page when three.js releases, and an addon from one release with the core from another can break on classes that changed between them. The `{"three":"160"}` part is the release the page actually loaded.

**The working map.** The page above, with both entries pointing into the local install:

```text
Opened http://127.0.0.1:32961/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["box"]}

look {}

On screen (1):
box 12% [443, 222, 827, 612]
Never visible: none
```

The replies in this section are cut to the lines discussed, with nothing reworded.

## With a bundler, and in TypeScript

A project built with Vite, Next.js or another bundler needs no import map: `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'` resolves through three's `package.json`, and `three/examples/jsm/controls/OrbitControls.js` does too. TypeScript gets the types from `@types/three`, whose `package.json` declares the same `./addons/*` and `./examples/jsm/*` paths, so both import forms type-check in a React and TypeScript app.

For editor completion on a page that loads three from a CDN, the editor needs types on disk: `npm install --save-dev @types/three` in the folder gives completion for `'three'` and `'three/addons/...'` imports in your `.js` files, while the browser keeps loading from the URLs in the map.

## What paprika3d does not do

- **It does not write or fix the import map.** It opens the page and reports what failed to resolve or load; the agent edits the map.
- **Its version line reads the `three` entry alone.** It does not compare the `three/addons/` entry's version with the core's, so keep the two in step yourself.
- **Its install hint is general.** Any 404 under `node_modules/three/` gets "(run bun add three in cwd)", including a wrong path inside an installed three, as in case 3.
- **It has no Safari engine.** `open` runs Chrome, or Firefox with `browser: "firefox"` when Firefox is installed; this server has no Firefox, so no Firefox reply is shown here.

## Pitfalls

- **End prefix entries with a slash, on both sides.** `"three/addons/": ".../examples/jsm/"`; without the slashes the entry matches one exact name.
- **Keep the `.js` on addon paths.** A browser adds no extension: `three/addons/controls/OrbitControls` is a different URL from `OrbitControls.js`, and it answers 404.
- **Put the import map before the first module script.** A map that arrives after a module has started loading is ignored for it.
- **Use `examples/jsm`, never `examples/js`.** The non-module `examples/js` scripts were removed in r148; a CDN `<script>` tag for one answers 404, and `open` names any use of `examples/js` in your source by file and line.
- **Serve over HTTP.** `npx vite`, `python3 -m http.server` or any static server; `open` serves the folder itself.

## Without paprika3d

Open the page from a local server with the browser's console and network panel open: an unresolved bare name is a console error that names the specifier, and a wrong path is a red 404 row with its URL. Compare the version in each import map URL with the one in three's latest release on GitHub. three.js's own manual has an installation page that shows the import map for both a local install and a CDN.
