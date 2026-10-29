---
title: three.js THREE.GLTFLoader is not a constructor? Load GLTFLoader from a CDN with an import map
phrase: three.gltfloader is not a constructor
description: Why a three.js page that loads GLTFLoader or OrbitControls with a script tag from a CDN throws "THREE.GLTFLoader is not a constructor", the examples/js folder that was removed in r148, the import map that loads the addons as modules, and what the paprika3d plugin's open reply names on such a page.
meta: three.js "THREE.GLTFLoader is not a constructor" from a CDN script tag: examples/js was removed in r148. Load the addon from three/addons/ instead.
intent: error-gltfloader-not-a-constructor
message: Uncaught TypeError: THREE.GLTFLoader is not a constructor
queries:
  - "How do I load GLTFLoader from a cdn THREE.js"
  - "Uncaught TypeError: THREE.GLTFLoader is not a constructor"
  - "Three.js — Uncaught TypeError: THREE.OrbitControls is not a constructor"
  - "THREE.GLTFLoader is not a constructor"
  - "Unable to load 'GLTFLoader.js'"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Uncaught TypeError: THREE.GLTFLoader is not a constructor

The browser throws this when code calls `new THREE.GLTFLoader()` and `THREE` has no `GLTFLoader` on it. three.js itself prints nothing: the loader was never attached to `THREE`, so the name is `undefined` and `new` fails. The same error names `OrbitControls`, `OBJLoader`, `FBXLoader` and every other addon when the page loads them the old way. The old way is a plain `<script>` tag for a file in `examples/js/`, and that folder is not in three.js any more.

## Where the name used to come from

Up to r147, three.js shipped each addon twice: as an ES module in `examples/jsm/` and as a classic script in `examples/js/`. The classic script wrapped the class in a function and wrote it onto the global `THREE` that `build/three.min.js` had created. These are the first and last lines of `examples/js/loaders/GLTFLoader.js` in three r147:

```js
( function () {

	class GLTFLoader extends THREE.Loader {

	// ... the loader ...

	THREE.GLTFLoader = GLTFLoader;

} )();
```

r148 deleted `examples/js/`, and r186 ships no `build/three.min.js` either. So a tag for `examples/js/loaders/GLTFLoader.js`, from a CDN or from `node_modules`, answers 404 on any current release, and nothing writes `THREE.GLTFLoader`. When three itself comes in as a module (`import * as THREE from 'three'`), there is also no global `THREE` for an old script to write to: a module namespace cannot take new properties.

## Why the code still asks for it

- **A tutorial or answer from before r148.** The pattern of one `<script>` for three and one per addon fills older answers, including the most viewed ones on this error. Copied with a current version number in the CDN URL, it fails.
- **An agent that learned three.js from older code.** Coding agents write the same tags from what they were trained on, often next to an import map they also wrote, which gives the mixed page below.
- **A CDN URL bumped to a new version.** A page that worked on `three@0.147.0` breaks the day its URLs say a later release, since the files they name no longer exist.

## A page that reproduces it

Three as a module from jsDelivr, and the two addons as script tags from the same release:

```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js"}}</script>
<script src="https://cdn.jsdelivr.net/npm/three@0.186.1/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.186.1/examples/js/controls/OrbitControls.js"></script>
<script type="module">
import * as THREE from 'three';
// ... renderer, scene, camera, a hemisphere light ...
const loader = new THREE.GLTFLoader();
loader.load('models/toolbox.glb', (gltf) => { gltf.scene.name = 'toolbox'; scene.add(gltf.scene); });
const controls = new THREE.OrbitControls(camera, renderer.domElement);
</script>
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in a headless Chrome of its own, paused at frame 0. These replies are from the stable build on 2026-10-28, on a host with no GPU; the run folder shows as `<project>`, and the replies are cut to the lines this page explains, none reworded.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:42673/index.html in 3.3 s, paused at frame 0.
index.html:6 uses examples/js/, removed in r148: use the ES modules in three/addons/ (examples/jsm/)
index.html:7 uses examples/js/, removed in r148: use the ES modules in three/addons/ (examples/jsm/)
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
THREE.GLTFLoader is not a constructor (index.html:22:16)

eval {"code":"return { GLTFLoader: typeof THREE.GLTFLoader, globalTHREE: typeof window.THREE, canAddToTHREE: Object.isExtensible(THREE) }"}

{"GLTFLoader":"undefined","globalTHREE":"undefined","canAddToTHREE":false}
```

The two `uses examples/js/` lines come from `open` reading the project's source before the page runs, so they name the tags to change by file and line even before an error shows. The error line gives the line of `new THREE.GLTFLoader()`; the page stops there, which is why `OrbitControls` on the next line never gets its own error, and why the scene has no entities. The `eval` shows the three facts above: no `GLTFLoader`, no global `THREE`, and a namespace nothing can add to.

The two 404s are not in that reply: the scripts came from another origin, and `open` lists failed fetches of models, textures and sounds, not of scripts. The same page with the tags pointing into `node_modules` gets both 404s in the reply:

```text
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) node_modules/three/examples/js/loaders/GLTFLoader.js (run bun add three in cwd)
Failed to load resource: the server responded with a status of 404 (Not Found) node_modules/three/examples/js/controls/OrbitControls.js (run bun add three in cwd)
THREE.GLTFLoader is not a constructor (index.html:22:16)
```

The `run bun add three` hint in those lines does not fit this case: three was installed, and reinstalling it brings no `examples/js/` folder back. The stale-API lines above them are the ones to act on.

## The fix

Load each addon as a module from `three/addons/`, which maps to `examples/jsm/`, and import the class by name instead of reading it off `THREE`. The import map needs both entries, `three` and `three/addons/`, because every addon module itself imports `three`. From a CDN the two entries point at the same release:

```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const loader = new GLTFLoader();
const controls = new OrbitControls(camera, renderer.domElement);
</script>
```

That page, with the rest unchanged, opened clean and drew the model:

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:39111/index.html in 0.5 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["toolbox"]}
Loaded: toolbox.glb 0.0 MB

look {}

On screen (3):
case 11% [375, 180, 909, 497]
lid 5.2% [361, 97, 922, 241] 2.05 × 1.05 units
badge 0.95% [512, 270, 645, 367] 0.6 × 0.3 units, across the view
Never visible: none
```

The whole page, here with `three` from `node_modules` (`npm install three`) and the model inlined so it runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Toolbox</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// In a project this is a file, 'models/toolbox.glb'. Inlined so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAADQBwAALAUAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC41LDAuNSwwLjVdLCJtaW4iOlstMC41LC0wLjUsLTAuNV0sImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjB9LHsidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjEyfSx7InR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjB9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6NTc2LCJieXRlU3RyaWRlIjoyNCwidGFyZ2V0IjozNDk2Mn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjU3NiwiYnl0ZUxlbmd0aCI6NzIsInRhcmdldCI6MzQ5NjN9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NjQ4fV0sIm1hdGVyaWFscyI6W3sibmFtZSI6ImVuYW1lbCIsInBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuMTgsMC4zMiwwLjU1LDFdLCJyb3VnaG5lc3NGYWN0b3IiOjAuNSwibWV0YWxsaWNGYWN0b3IiOjB9fSx7Im5hbWUiOiJwYWludCIsInBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuODUsMC43NSwwLjIsMV0sInJvdWdobmVzc0ZhY3RvciI6MC42LCJtZXRhbGxpY0ZhY3RvciI6MH19XSwibWVzaGVzIjpbeyJuYW1lIjoiY2FzZSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sIm1vZGUiOjQsIm1hdGVyaWFsIjowLCJpbmRpY2VzIjoyfV19LHsibmFtZSI6ImJhZGdlIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxfSwibW9kZSI6NCwibWF0ZXJpYWwiOjEsImluZGljZXMiOjJ9XX1dLCJub2RlcyI6W3sibmFtZSI6ImNhc2UiLCJ0cmFuc2xhdGlvbiI6WzAsMC41LDBdLCJzY2FsZSI6WzIsMSwxXSwibWVzaCI6MH0seyJuYW1lIjoibGlkIiwidHJhbnNsYXRpb24iOlswLDEuMSwwXSwic2NhbGUiOlsyLjA1LDAuMiwxLjA1XSwibWVzaCI6MH0seyJuYW1lIjoiYmFkZ2UiLCJ0cmFuc2xhdGlvbiI6WzAsMC41NSwwLjUxXSwic2NhbGUiOlswLjYsMC4zLDAuMDJdLCJtZXNoIjoxfSx7Im5hbWUiOiJ0b29sYm94IiwiY2hpbGRyZW4iOlswLDEsMl19XSwic2NlbmVzIjpbeyJuYW1lIjoiU2NlbmUiLCJub2RlcyI6WzNdfV19ICAgiAIAAEJJTgAAAAA/AAAAPwAAAD8AAIA/AAAAAAAAAAAAAAA/AAAAPwAAAL8AAIA/AAAAAAAAAAAAAAA/AAAAvwAAAD8AAIA/AAAAAAAAAAAAAAA/AAAAvwAAAL8AAIA/AAAAAAAAAAAAAAC/AAAAPwAAAL8AAIC/AAAAAAAAAAAAAAC/AAAAPwAAAD8AAIC/AAAAAAAAAAAAAAC/AAAAvwAAAL8AAIC/AAAAAAAAAAAAAAC/AAAAvwAAAD8AAIC/AAAAAAAAAAAAAAC/AAAAPwAAAL8AAAAAAACAPwAAAAAAAAA/AAAAPwAAAL8AAAAAAACAPwAAAAAAAAC/AAAAPwAAAD8AAAAAAACAPwAAAAAAAAA/AAAAPwAAAD8AAAAAAACAPwAAAAAAAAC/AAAAvwAAAD8AAAAAAACAvwAAAAAAAAA/AAAAvwAAAD8AAAAAAACAvwAAAAAAAAC/AAAAvwAAAL8AAAAAAACAvwAAAAAAAAA/AAAAvwAAAL8AAAAAAACAvwAAAAAAAAC/AAAAPwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAPwAAAD8AAAAAAAAAAAAAgD8AAAC/AAAAvwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAvwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAPwAAAL8AAAAAAAAAAAAAgL8AAAC/AAAAPwAAAL8AAAAAAAAAAAAAgL8AAAA/AAAAvwAAAL8AAAAAAAAAAAAAgL8AAAC/AAAAvwAAAL8AAAAAAAAAAAAAgL8AAAIAAQACAAMAAQAEAAYABQAGAAcABQAIAAoACQAKAAsACQAMAA4ADQAOAA8ADQAQABIAEQASABMAEQAUABYAFQAWABcAFQA=';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 3));
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.2, 2, 4);
camera.lookAt(0, 0.6, 0);

const loader = new GLTFLoader();
loader.load(MODEL, (gltf) => { gltf.scene.name = 'toolbox'; scene.add(gltf.scene); }, undefined, (err) => console.error('toolbox did not load:', err));
const controls = new OrbitControls(camera, renderer.domElement);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
</script>
</body></html>
```

With a bundler such as Vite there is no import map: `npm install three` and the same two `import` lines, with `three/addons/` resolved through the package's `exports`. Keep one version: an addon from one release next to a core from another is the setup behind [Multiple instances of Three.js being imported](/errors/multiple-instances-of-three-js). A page that must stay on script tags can pin `three@0.147.0` for both files, which keeps every API change since then out of reach; moving to modules is the lasting fix. paprika3d does not rewrite the page: `open` names the lines, and the agent edits them.

## Where people ask about it

These threads quote the message or ask the question; each count was read on 2026-10-28.

- [How do I load GLTFLoader from a cdn THREE.js](https://stackoverflow.com/questions/64409605/how-do-i-load-gltfloader-from-a-cdn-three-js) (Stack Overflow, 37,507 views)
- [Three.js — Uncaught TypeError: THREE.OrbitControls is not a constructor](https://stackoverflow.com/questions/59769090/three-js-uncaught-typeerror-three-orbitcontrols-is-not-a-constructor) (Stack Overflow, 30,055 views)
- [Uncaught TypeError: THREE.GLTFLoader is not a constructor](https://stackoverflow.com/questions/52233388/uncaught-typeerror-three-gltfloader-is-not-a-constructor) (Stack Overflow, 25,934 views)
- [THREE.GLTFLoader is not a constructor](https://discourse.threejs.org/t/three-gltfloader-is-not-a-constructor/25681) (discourse.threejs.org, 13,344 views, 8 posts)
- [Unable to load 'GLTFLoader.js'](https://discourse.threejs.org/t/unable-to-load-gltfloader-js/3985) (discourse.threejs.org, 9,004 views, 18 posts)
