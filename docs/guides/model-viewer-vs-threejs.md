---
title: model-viewer vs three.js for a product page with AR, and moving a model or a colour change between them
phrase: model-viewer vs three.js
description: What model-viewer adds on top of three.js for a product page (one model, camera controls, AR, a material API), when a page needs three.js itself, how to pass a GLB from a three.js scene to model-viewer with or without a file, and how to change a material by name in each, with the paprika3d plugin's eval, model_audit and look replies on both kinds of page.
meta: model-viewer or three.js for a product page with AR: pass a three.js GLB to model-viewer and change a material by name in each.
intent: model-viewer-vs-threejs
queries:
  - "Passing a GLB model from three.js to Model-Viewer (AR scene)"
  - "Threejs and Model-Viewer"
  - "Target and update a GLB's material like Model-Viewer does"
  - "How export scene i threejs and see it in model-viewer"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# model-viewer vs three.js for a product page with AR, and moving a model or a colour change between them

## model-viewer is built on three.js

`<model-viewer>` is a web component from Google's `@google/model-viewer` package, and three.js is what it draws with. The release used here asks for three as a peer dependency:

```text
$ grep -E '"version"|"three"' node_modules/@google/model-viewer/package.json
  "version": "4.4.0",
    "three": "^0.183.0"
    "three": "^0.183.0",
```

The element takes one glTF or GLB file in `src` and supplies the rest of a product viewer: the camera and its controls, lighting from its own environment (`environment-image`, `exposure`, `tone-mapping`), and an AR button. Which AR viewer opens depends on the device, tried in the order of `ar-modes`, and for iOS it makes the USDZ itself from the loaded model with three's `USDZExporter`, unless `ios-src` names a file. From `dist/model-viewer.js` in that release:

```js
const DEFAULT_AR_MODES = 'webxr scene-viewer quick-look';

// in [$openIOSARQuickLook]()
const generateUsdz = !this.iosSrc;
objectURL = generateUsdz ? await this.prepareUSDZ() : this.iosSrc;

// in prepareUSDZ()
maxTextureSize: isNaN(this.arUsdzMaxTextureSize) ?
        Infinity :
        Math.max(parseInt(this.arUsdzMaxTextureSize), 16)
```

So without `ar-usdz-max-texture-size` the generated USDZ keeps every texture at full size, which is where a large USDZ comes from; the [USDZ guide](/guides/threejs-usdz-ar-quick-look) measures that growth.

With three.js itself, the scene, camera, lights, render loop and input are code you write.

## Which one a product page needs

- **One model to turn around, an AR button, colour or material swatches:** model-viewer does this with attributes and its material API; with three.js you add the controls, the lighting and the AR hand-off yourself.
- **A scene:** several models placed together, a camera that moves on its own path, custom shaders, physics, or input beyond orbiting and zooming. That is three.js, since model-viewer shows one model at a time.
- **Both:** a three.js page that builds or configures the product, with a model-viewer element for the AR button, fed the GLB the three.js page makes. The sections below do this.

The choice is advice; what the tools below measure is the file passed between the two, and what each page draws.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three @google/model-viewer
```

## From a three.js scene to model-viewer, through a file

The three.js page here shows a toolbox whose case and lid share one material named `enamel`, and a badge with one named `paint`. The configurator turns the enamel red, then `eval` with `save` writes the product as a GLB with `bake` from `fx.js` (the `open` tool copies it into the project), and `model_audit` checks the file against Shopify's limits:

```text
eval {"code":"const enamel = find(\"lid\").material;\nenamel.color.set(\"#c0392b\");\nreturn { shared: find(\"case\").material === enamel, name: enamel.name, linear: enamel.color.toArray().map((v) => +v.toFixed(3)) }"}

{"shared":true,"name":"enamel","linear":[0.527,0.041,0.024]}

eval {"code":"const { bake } = await import(\"./fx.js\");\nreturn bake(find(\"toolbox\"))","save":"export/toolbox.glb"}

Saved export/toolbox.glb (3 KB, application/octet-stream)

model_audit {"cwd":"<project>","path":"export/toolbox.glb","target":"shopify"}

export/toolbox.glb · 3 KB · 36 triangles · 2 materials · no textures · Draco no, meshopt no, KTX2 no
shopify: passes
```

The model-viewer page is the element and its script, nothing else:

```html
<script type="module" src="vendor/model-viewer.min.js"></script>
<model-viewer src="export/toolbox.glb" alt="Toolbox" ar camera-controls></model-viewer>
```

paprika3d's tools work on that page too. `open` finds the three.js inside model-viewer and lists the file it fetched, and `look` names the toolbox's three meshes from the GLB:

```text
open {"url":"mv.html","cwd":"<project>"}

{"three":"183","scenes":3,"entities":[]}
Loaded: toolbox.glb 0.0 MB

look {}

Over the canvas: model-viewer takes the clicks on 100% of it though it shows nothing (listeners on the canvas miss them).
Behind the canvas: transparent (alpha, clear 0, no scene background), the page shows through 75% of it; page background #e9e6e1 (model-viewer).
On screen (3):
case 16% [321, 320, 958, 613]
lid 6.8% [308, 210, 971, 319] 2.05 × 1.05 units
badge 1.7% [546, 410, 733, 501] 0.6 × 0.3 units, across the view
```

The `Over the canvas` line is written for a page that listens for clicks on its canvas; model-viewer listens on its own element, so on this page the line describes how it works and there is nothing to fix. `eval` reads the element's state:

```text
eval {"code":"const mv = document.querySelector(\"model-viewer\");\nawait mv.updateComplete;\nreturn { loaded: mv.loaded, materials: mv.model?.materials.map((m) => m.name), arModes: mv.arModes, canActivateAR: mv.canActivateAR }"}

{"loaded":true,"materials":["enamel","paint"],"arModes":"webxr scene-viewer quick-look","canActivateAR":false}
```

The material names made it across. `canActivateAR` is `false` because this is desktop Chrome: the harness opens no AR viewer, so what a phone shows after the AR button is not something paprika3d checks.

What a GLB carries is the model: meshes, materials, textures, names, and the transform of each node. The three.js page's camera, lights, background and tone mapping are page settings and stay behind; model-viewer lights and frames the model with its own.

## From three.js to model-viewer without a file

The bytes can go straight from `GLTFExporter` to the element as an object URL, with the two on one page:

```js
const glb = await new GLTFExporter().parseAsync(product, { binary: true });
document.getElementById('mv').src = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
```

How model-viewer is loaded matters on such a page. `model-viewer.min.js` carries its own copy of three, so the page has two:

```text
open {"url":"both-bundled.html","cwd":"<project>"}

three.js warned: THREE.WARNING: Multiple instances of Three.js being imported.

eval {"code":"const mv = document.getElementById(\"mv\");\nif (!mv.loaded) await new Promise((r) => mv.addEventListener(\"load\", r, { once: true }));\nreturn { src: mv.src.slice(0, 5), materials: mv.model.materials.map((m) => m.name) }"}

{"src":"blob:","materials":["enamel","paint"]}
```

`model-viewer-module.min.js` imports `three` instead, so with the page's import map both share one copy, and the warning is gone:

```text
open {"url":"both-module.html","cwd":"<project>"}

Page text outside the canvas: none
{"three":"186","scenes":5,"entities":[]}

eval {"code":"const mv = document.getElementById(\"mv\");\nif (!mv.loaded) await new Promise((r) => mv.addEventListener(\"load\", r, { once: true }));\nreturn { src: mv.src.slice(0, 5), materials: mv.model.materials.map((m) => m.name) }"}

{"src":"blob:","materials":["enamel","paint"]}
```

That page ran model-viewer 4.4.0 on three r186, above the release it asks for; it loaded and drew this model, and nothing more was tested. The [multiple instances page](/errors/multiple-instances-of-three-js) covers the warning itself. On a page with two WebGL canvases, `look` described one of them, here model-viewer's smaller one, so check each viewer on a page of its own.

## Changing a material by name, in each

The forum question is how to do in three.js what model-viewer's material API does. In model-viewer, on the page with the red file:

```text
eval {"code":"const mv = document.querySelector(\"model-viewer\");\nawait mv.updateComplete;\nconst enamel = mv.model.getMaterialByName(\"enamel\");\nconst before = enamel.pbrMetallicRoughness.baseColorFactor.map((v) => +v.toFixed(3));\nenamel.pbrMetallicRoughness.setBaseColorFactor(\"#2e7d32\");\nreturn { before, after: enamel.pbrMetallicRoughness.baseColorFactor.map((v) => +v.toFixed(3)) }"}

{"before":[0.527,0.041,0.024,1],"after":[0.027,0.205,0.032,1]}

look {"sample":[[400,560],[640,260]]}

Colours (5 × 5 mean, in the page's pixels): (400, 560) #238629, (640, 260) #308a35.
```

In three.js, glTF material names survive loading, and meshes that shared a material in the file share one material object, so finding it by name and setting its colour recolours the case and the lid together, as model-viewer does:

```text
eval {"code":"let enamel;\nfind(\"toolbox\").traverse((o) => { if (o.isMesh && o.material.name === \"enamel\") enamel = o.material; });\nenamel.color.set(\"#2e7d32\");\nreturn enamel.color.toArray().map((v) => +v.toFixed(3))"}

[0.027,0.205,0.032]

look {"sample":[[780,560],[640,300]]}

Colours (5 × 5 mean, in the page's pixels): (780, 560) #005d15, (640, 300) #005d15.
```

The stored colour is the same in both, `[0.027,0.205,0.032]`. A hex string is read as sRGB and stored linear by both APIs; an array passed to `setBaseColorFactor` is taken as linear, the glTF `baseColorFactor`, as `color.setRGB()` is in three by default. From model-viewer's source:

```js
setBaseColorFactor(rgba) {
    const color = new Color();
    if (rgba instanceof Array) {
        color.fromArray(rgba);
    }
    else {
        color.set(rgba);
    }
```

The drawn pixels differ, `#308a35` on the lid in model-viewer and `#005d15` in three.js, because each page lights the same material its own way: model-viewer with its environment and tone mapping, the three.js page with one hemisphere light and ACES tone mapping. To make the two look alike, match the lighting, not the colour. Giving a part its own material, and checking every swatch, is in the [configurator guide](/guides/threejs-change-material-color-configurator).

## The page

A three.js configurator that recolours by material name and keeps a GLB of the configured product ready for a `<model-viewer src>`. The model is inlined so the page runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Toolbox configurator</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}
#ui{position:absolute;left:16px;bottom:16px;display:flex;gap:8px;font:15px sans-serif}
#ui button{width:40px;height:40px;border:2px solid #fff;border-radius:50%;cursor:pointer}
#ui a{padding:10px 14px;background:#fff;color:#111;border-radius:6px;text-decoration:none}</style></head>
<body>
<div id="ui">
  <button data-hex="#7699c4" style="background:#7699c4" aria-label="Blue"></button>
  <button data-hex="#c0392b" style="background:#c0392b" aria-label="Red"></button>
  <button data-hex="#2e7d32" style="background:#2e7d32" aria-label="Green"></button>
  <a id="glb" download="toolbox.glb">Download GLB</a>
</div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// In a project this is a file, 'models/toolbox.glb'. Inlined so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAADQBwAALAUAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC41LDAuNSwwLjVdLCJtaW4iOlstMC41LC0wLjUsLTAuNV0sImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjB9LHsidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjEyfSx7InR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjB9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6NTc2LCJieXRlU3RyaWRlIjoyNCwidGFyZ2V0IjozNDk2Mn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjU3NiwiYnl0ZUxlbmd0aCI6NzIsInRhcmdldCI6MzQ5NjN9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NjQ4fV0sIm1hdGVyaWFscyI6W3sibmFtZSI6ImVuYW1lbCIsInBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuMTgsMC4zMiwwLjU1LDFdLCJyb3VnaG5lc3NGYWN0b3IiOjAuNSwibWV0YWxsaWNGYWN0b3IiOjB9fSx7Im5hbWUiOiJwYWludCIsInBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuODUsMC43NSwwLjIsMV0sInJvdWdobmVzc0ZhY3RvciI6MC42LCJtZXRhbGxpY0ZhY3RvciI6MH19XSwibWVzaGVzIjpbeyJuYW1lIjoiY2FzZSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sIm1vZGUiOjQsIm1hdGVyaWFsIjowLCJpbmRpY2VzIjoyfV19LHsibmFtZSI6ImJhZGdlIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxfSwibW9kZSI6NCwibWF0ZXJpYWwiOjEsImluZGljZXMiOjJ9XX1dLCJub2RlcyI6W3sibmFtZSI6ImNhc2UiLCJ0cmFuc2xhdGlvbiI6WzAsMC41LDBdLCJzY2FsZSI6WzIsMSwxXSwibWVzaCI6MH0seyJuYW1lIjoibGlkIiwidHJhbnNsYXRpb24iOlswLDEuMSwwXSwic2NhbGUiOlsyLjA1LDAuMiwxLjA1XSwibWVzaCI6MH0seyJuYW1lIjoiYmFkZ2UiLCJ0cmFuc2xhdGlvbiI6WzAsMC41NSwwLjUxXSwic2NhbGUiOlswLjYsMC4zLDAuMDJdLCJtZXNoIjoxfSx7Im5hbWUiOiJ0b29sYm94IiwiY2hpbGRyZW4iOlswLDEsMl19XSwic2NlbmVzIjpbeyJuYW1lIjoiU2NlbmUiLCJub2RlcyI6WzNdfV19ICAgiAIAAEJJTgAAAAA/AAAAPwAAAD8AAIA/AAAAAAAAAAAAAAA/AAAAPwAAAL8AAIA/AAAAAAAAAAAAAAA/AAAAvwAAAD8AAIA/AAAAAAAAAAAAAAA/AAAAvwAAAL8AAIA/AAAAAAAAAAAAAAC/AAAAPwAAAL8AAIC/AAAAAAAAAAAAAAC/AAAAPwAAAD8AAIC/AAAAAAAAAAAAAAC/AAAAvwAAAL8AAIC/AAAAAAAAAAAAAAC/AAAAvwAAAD8AAIC/AAAAAAAAAAAAAAC/AAAAPwAAAL8AAAAAAACAPwAAAAAAAAA/AAAAPwAAAL8AAAAAAACAPwAAAAAAAAC/AAAAPwAAAD8AAAAAAACAPwAAAAAAAAA/AAAAPwAAAD8AAAAAAACAPwAAAAAAAAC/AAAAvwAAAD8AAAAAAACAvwAAAAAAAAA/AAAAvwAAAD8AAAAAAACAvwAAAAAAAAC/AAAAvwAAAL8AAAAAAACAvwAAAAAAAAA/AAAAvwAAAL8AAAAAAACAvwAAAAAAAAC/AAAAPwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAPwAAAD8AAAAAAAAAAAAAgD8AAAC/AAAAvwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAvwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAPwAAAL8AAAAAAAAAAAAAgL8AAAC/AAAAPwAAAL8AAAAAAAAAAAAAgL8AAAA/AAAAvwAAAL8AAAAAAAAAAAAAgL8AAAC/AAAAvwAAAL8AAAAAAAAAAAAAgL8AAAIAAQACAAMAAQAEAAYABQAGAAcABQAIAAoACQAKAAsACQAMAA4ADQAOAA8ADQAQABIAEQASABMAEQAUABYAFQAWABcAFQA=';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e6e1);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 3));
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.2, 2, 4);
camera.lookAt(0, 0.6, 0);

const product = (await new GLTFLoader().loadAsync(MODEL)).scene;
product.name = 'toolbox';
scene.add(product);

// three's counterpart of model-viewer's model.getMaterialByName(): the glTF material names survive loading,
// and meshes that shared a material in the file share one material object here.
function materialByName(name) {
  let found = null;
  product.traverse((o) => { if (!found && o.isMesh && o.material.name === name) found = o.material; });
  return found;
}

// The GLB a <model-viewer src> loads, made from the product as configured.
async function updateGLB() {
  const bytes = await new GLTFExporter().parseAsync(product, { binary: true });
  const link = document.getElementById('glb');
  URL.revokeObjectURL(link.href);
  link.href = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
}

for (const button of document.querySelectorAll('#ui button')) {
  button.addEventListener('click', () => {
    materialByName('enamel').color.set(button.dataset.hex); // a hex string is sRGB; three stores it linear
    updateGLB();
  });
}
await updateGLB();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

Clicking the green swatch with `interact`, then sampling the case and lid and reading the download back:

```text
interact {"steps":[{"mouse":"click","x":132,"y":763}]}

{"after":null,"changed":{}}

look {"sample":[[780,560],[640,300]]}

HTML over the canvas: 1 (div via page), 0 overlap, 0 off-screen, 0 cut off: div#ui "Download GLB" [16, 744, 288, 783].
Colours (5 × 5 mean, in the page's pixels): (780, 560) #005d15, (640, 300) #005d15.

eval {"code":"const { GLTFLoader } = await import(\"three/addons/loaders/GLTFLoader.js\");\nconst link = document.getElementById(\"glb\");\nconst bytes = await (await fetch(link.href)).arrayBuffer();\nconst gltf = await new GLTFLoader().parseAsync(bytes, \"\");\nconst names = new Set();\ngltf.scene.traverse((o) => o.isMesh && names.add(o.material.name + \" #\" + o.material.color.getHexString()));\nreturn { download: link.download, bytes: bytes.byteLength, materials: [...names] }"}

{"download":"toolbox.glb","bytes":2268,"materials":["enamel #2e7d32","paint #ede17c"]}
```

## What paprika3d does not do

It does not choose between the two for you, and it opens no AR viewer: Scene Viewer, Quick Look and WebXR sessions run on phones and headsets, and the harness runs desktop Chrome. On a model-viewer page its tools read the three.js scene inside the element and the element's own properties through `eval`; they do not change model-viewer's attributes for you.

## Without paprika3d

Load the GLB in a page with nothing but the `<model-viewer>` tag, as above, and call `getMaterialByName()` from the browser's console to try a colour. Save the three.js product with `GLTFExporter` and a download link, as the page does, and open the file in any glTF viewer to see what it carries.

## Where people ask about it

- [Passing a GLB model from three.js to Model-Viewer (AR scene)](https://discourse.threejs.org/t/passing-a-glb-model-from-three-js-to-model-viewer-ar-scene/30861) (discourse.threejs.org, 6,216 views)
- [Threejs and Model-Viewer](https://discourse.threejs.org/t/threejs-and-model-viewer/65868) (discourse.threejs.org, 4,279 views)
- [Target and update a GLB's material like Model-Viewer does](https://discourse.threejs.org/t/target-and-update-a-glbs-material-like-model-viewer-does/47595) (discourse.threejs.org, 663 views)
- [How export scene i threejs and see it in model-viewer](https://discourse.threejs.org/t/how-export-scene-i-threejs-and-see-it-in-model-viewer/37616) (discourse.threejs.org, 486 views)
