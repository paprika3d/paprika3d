---
title: three.js USDZ exporter for AR Quick Look: why the file grows, how to shrink it, and reading it back
phrase: three.js usdz exporter
description: How to make a USDZ for iOS AR Quick Look from a three.js r186 scene with USDZExporter, why the file comes out larger than the GLB and the two settings that shrink it, where the model's base must sit, and what three's USDLoader shows when it reads the file back, with the paprika3d plugin's eval writing the file and model_audit reading it.
meta: Export a three.js scene to USDZ for AR Quick Look, see why it grows past the GLB, shrink its textures, and read the file back with model_audit.
intent: usdz-ar-quick-look
queries:
  - "USDZ loader for three.js?"
  - "GLTF to USDZ converter for windows"
  - "USDZ Exporter increases file size"
  - "USDZ Exporter flips mesh normals"
  - "GLTF to USDZ exporter issues"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js USDZ exporter for AR Quick Look: why the file grows, how to shrink it, and reading it back

## Three pieces, and the one this page cannot run

AR Quick Look is Apple's viewer on iOS and iPadOS. Safari opens it from a link with `rel="ar"` to a `.usdz` file, and the link's first child must be an image. three.js r186 has the two other pieces, both in `three/addons/`:

- **`USDZExporter`** (`exporters/USDZExporter.js`) turns an object or a whole scene into USDZ bytes in the browser. A GLB loaded with `GLTFLoader` and handed to it is a GLB to USDZ converter that runs wherever the page runs, Windows included.
- **`USDLoader`** (`loaders/USDLoader.js`) reads `.usd`, `.usda`, `.usdc` and `.usdz` into three objects.

paprika3d runs pages in Chrome on the machine the agent uses, and none of that is Quick Look. Nothing here shows how Quick Look draws the file, where it puts it in the room, or whether its normals face the right way. What the tools do show: `eval` with `save` writes the exporter's bytes into the project, and `model_audit` reads a `.usdz` with three's own USD parsers and reports its size, triangles, materials and each texture, so the file's contents are a before and after you can read.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Export the model on the page

The page here shows a leather armchair from the hosted asset library (CC BY 4.0, credited in the project's `CREDITS.md`), a GLB with meshopt geometry and WebP textures, inside a group named `armchair`. First what the GLB holds, then the export, then what the export holds:

```text
model_audit {"cwd":"<project>","path":"assets/old-armchair-81ae47.glb"}

assets/old-armchair-81ae47.glb · 113 KB · 1,551 triangles · 1 material · textures: 1024×1024 webp, 1024×1024 webp, 1024×1024 webp, 1024×1024 webp · Draco no, meshopt yes, KTX2 no
site: passes

eval {"code":"const { USDZExporter } = await import(\"three/addons/exporters/USDZExporter.js\");\nreturn new USDZExporter().parseAsync(find(\"armchair\"))","save":"export/armchair.usdz"}

Saved export/armchair.usdz (1,456 KB, application/octet-stream)
warn: THREE.USDZExporter: USDZ does not support double sided materials [object MeshPhysicalMaterial]

model_audit {"cwd":"<project>","path":"export/armchair.usdz"}

export/armchair.usdz · 1.42 MB · 1,551 triangles · 1 material · textures: 1024×1024 png, 1024×1024 png, 1024×1024 png
site: passes
```

The triangle count is the same on both sides. The size is not, and the warning names the first thing the exporter could not carry over.

## Why the USDZ is larger than the GLB

A USDZ is a zip whose files are stored, not compressed (the exporter calls fflate's `zipSync` with `level: 0`). Listing the one above:

```text
$ unzip -l export/armchair.usdz | awk '{print $1, $4}'
Length Name
--------- ----
6070 model.usda
169674 geometries/Geometry_16.usda
568638 textures/Texture_10_false.png
299759 textures/Texture_13_false.png
445120 textures/Texture_12_false.png
---------
1489261
```

Two things grow. The exporter writes geometry as text (`.usda`), where the GLB held it in meshopt-compressed binary. And it writes every texture again from the decoded image: as PNG, unless the texture's `userData.mimeType` is `'image/jpeg'`, at no more than `maxTextureSize` pixels on the longer side (1024 px by default). The WebP files in the GLB are gone; the PNGs are what Quick Look gets.

The material lost something too. The GLB's material had six maps:

```text
eval {"code":"const m = find(\"armchair\").getObjectByProperty(\"isMesh\", true).material;\nreturn { side: m.side, maps: Object.keys(m).filter((k) => /map$/i.test(k) && m[k]) }"}

{"side":2,"maps":["map","aoMap","roughnessMap","metalnessMap","specularIntensityMap","specularColorMap"]}
```

The USDZ has three textures: colour, occlusion, and one image that both roughness and metallic read from different channels. The two specular maps are not in the file, and `side: 2` is `DoubleSide`, which the warning says USDZ has no equivalent for.

## Two settings that shrink it

Both run in the same `eval`, on the same object. A smaller texture limit:

```text
eval {"code":"const { USDZExporter } = await import(\"three/addons/exporters/USDZExporter.js\");\nreturn new USDZExporter().parseAsync(find(\"armchair\"), { maxTextureSize: 512 })","save":"export/armchair-512.usdz"}

Saved export/armchair-512.usdz (646 KB, application/octet-stream)
warn: THREE.USDZExporter: USDZ does not support double sided materials [object MeshPhysicalMaterial]

model_audit {"cwd":"<project>","path":"export/armchair-512.usdz"}

export/armchair-512.usdz · 646 KB · 1,551 triangles · 1 material · textures: 512×512 png, 512×512 png, 512×512 png
site: passes
```

Or full-size textures written as JPEG:

```text
eval {"code":"const m = find(\"armchair\").getObjectByProperty(\"isMesh\", true).material;\nfor (const t of [m.map, m.aoMap, m.roughnessMap]) t.userData.mimeType = \"image/jpeg\";\nconst { USDZExporter } = await import(\"three/addons/exporters/USDZExporter.js\");\nreturn new USDZExporter().parseAsync(find(\"armchair\"))","save":"export/armchair-jpeg.usdz"}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 6.3 s).
Saved export/armchair-jpeg.usdz (414 KB, application/octet-stream)
warn: THREE.USDZExporter: USDZ does not support double sided materials [object MeshPhysicalMaterial]

model_audit {"cwd":"<project>","path":"export/armchair-jpeg.usdz"}

export/armchair-jpeg.usdz · 414 KB · 1,551 triangles · 1 material · textures: 1024×1024 jpeg, 1024×1024 jpeg, 1024×1024 jpeg
site: passes
```

The `Reloaded` line is the harness seeing a new file in the project (the `.usdz` the previous call saved) and reloading the page before the next call (the 6.3 s is the page loading again on this host's software renderer, SwiftShader); the export then ran on a freshly loaded armchair. JPEG has no alpha channel, so keep PNG for a colour texture with transparent parts. The two settings combine. paprika3d's `model_audit` `shrink` does not rewrite USD files; it says to convert to GLB first, so the size is set here, at export.

## Where the model sits

The exporter adds plane anchoring to the scene in `model.usda` (it can be turned off with `includeAnchoringProperties: false`):

```text
$ grep -n -i anchoring model.usda
25:			token preliminary:anchoring:type = "plane"
26:			token preliminary:planeAnchoring:alignment = "horizontal"
```

The file asks for a horizontal surface; what it carries about position is the object's own transform. A model whose base is at `y = 0` in three has its base at the origin in the file, and one centred on its middle, or lifted to look right in front of a camera, carries that offset with it. The page below moves the base to `y = 0` before it exports. Where Quick Look then puts the model in a room is not something this page could check.

## Reading a USDZ back in three.js

`USDLoader` loads the export into a page with the same camera and lights as the GLB page. `open` lists it, and `look` samples the chair at the same two points on both pages:

```text
open {"url":"view.html","cwd":"<project>"}

Loaded: armchair.usdz 1.5 MB

look {"sample":[[617,300],[617,560]]}

On screen (1):
chair_chesterfield_Poltrona_0 13% [412, 167, 823, 671]
Colours (5 × 5 mean, in the page's pixels): (617, 300) #dcdcdc, (617, 560) #d7d7d7.
```

On the GLB page the same samples are red leather:

```text
look {"sample":[[617,300],[617,560]]}

Colours (5 × 5 mean, in the page's pixels): (617, 300) #591914, (617, 560) #5d1f19.
```

`eval` on the GLB page reads the material:

```text
eval {"code":"const m = find(\"armchair\").getObjectByProperty(\"isMesh\", true).material;\nreturn { type: m.type, metalness: m.metalness, roughness: m.roughness, metalnessMap: !!m.metalnessMap }"}

{"type":"MeshPhysicalMaterial","metalness":0,"roughness":1,"metalnessMap":true}
```

The same call on the USDZ page:

```text
{"type":"MeshPhysicalMaterial","metalness":1,"roughness":1,"metalnessMap":true}
```

The file is right: its metallic texture has `inputs:scale = (0, 0, 0, 1)`, which carries the GLB's metalness factor of 0. The loader sets metalness to 1 whenever a metallic texture is connected and does not read that scale, in `USDComposer.js`, three r186:

```js
if ( hasMetalnessMap ) {

	material.metalness = 1.0;

}
```

So a fully metal chair reflecting a grey room draws grey. Reading a file back in three is a check of what three's loader makes of it, not a preview of Quick Look. `model_audit` is the check of what the file holds.

## Mirrored objects, and a transform changed since the last frame

The exporter writes each object's `matrix` as it stands; it does not rebuild it from `position`, `rotation` and `scale`. A copy of the toolbox from the page below, mirrored with `scale.x = -1` and exported straight away, comes out with no warning and the byte count of the unmirrored export, because its matrix still holds the old scale:

```text
eval {"code":"const { USDZExporter } = await import(\"three/addons/exporters/USDZExporter.js\");\nconst mirrored = find(\"toolbox\").clone();\nmirrored.scale.x = -1;\nconst bytes = await new USDZExporter().parseAsync(mirrored);\nreturn bytes.byteLength"}

5417
```

With `updateMatrixWorld()` before the export, the mirror is in the file and the exporter says so:

```text
eval {"code":"const { USDZExporter } = await import(\"three/addons/exporters/USDZExporter.js\");\nconst mirrored = find(\"toolbox\").clone();\nmirrored.scale.x = -1;\nmirrored.updateMatrixWorld();\nconst bytes = await new USDZExporter().parseAsync(mirrored);\nreturn bytes.byteLength"}

5416
warn: THREE.USDZExporter: USDZ does not support negative scales [object Group]
```

So call `updateMatrixWorld()` on the object, or export after a frame has rendered. three draws a mirrored mesh the right way round by flipping its face order when the world matrix's determinant is negative (`WebGLRenderer.js`, `frontFaceCW`); a viewer that does not do the same shows those faces inside out. Treat the warning as the object to check first when the faces look wrong in Quick Look.

## Finding a model that already has a USD file

The hosted library lists a USD file for some models, and `asset_search` with `format: "usd"` is meant to find those and pick one with `USDLoader` code. In the searches made for this page (armchair, wooden crate, toy robot, sneaker) it returned models, and each pick tried failed with a reply that the model has no USD file. Until that is fixed, export the GLB as above.

## The page

A product page that shows the model and offers its USDZ, made in the browser from the same object. It saves the file the AR link points to; host that file next to the page. The model is inlined so the page runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Toolbox in AR</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}
.btn{position:absolute;bottom:16px;padding:10px 14px;background:#fff;color:#111;font:15px sans-serif;border-radius:6px;text-decoration:none}
#ar{right:16px}#get{left:16px}</style></head>
<body>
<!-- Safari on iOS opens AR Quick Look from a rel="ar" link to a .usdz whose first child is an image -->
<a id="ar" class="btn" rel="ar" href="toolbox.usdz"><img alt="" width="1" height="1" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">View in your room</a>
<a id="get" class="btn" download="toolbox.usdz">Download USDZ</a>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

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

const gltf = await new GLTFLoader().loadAsync(MODEL);
const product = gltf.scene;
product.name = 'toolbox';
const box = new THREE.Box3().setFromObject(product);
product.position.y -= box.min.y; // base at y = 0: the origin is what the file's plane anchoring places
scene.add(product);

// The USDZ, made from the same object. The exporter writes PNG unless a texture says JPEG,
// and USDZ has no double-sided materials, so both are settled here, not left to the exporter.
product.traverse((o) => {
  if (!o.isMesh) return;
  o.material.side = THREE.FrontSide;
  if (o.material.map) o.material.map.userData.mimeType = 'image/jpeg';
});
const bytes = await new USDZExporter().parseAsync(product);
document.getElementById('get').href = URL.createObjectURL(new Blob([bytes], { type: 'model/vnd.usdz+zip' }));

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

`look` on it lists both links over the canvas and the three parts of the toolbox, and `eval` reads the download back:

```text
look {}

HTML over the canvas: 2 (.btn via page), 0 overlap, 0 off-screen, 0 cut off: a#ar "View in your room" [1115, 747, 1263, 783], a#get "Download USDZ" [16, 747, 155, 783].
On screen (3):
case 11% [379, 309, 905, 627]
lid 4.9% [367, 230, 916, 369] 2.05 × 1.05 units
badge 0.94% [513, 398, 645, 494] 0.6 × 0.3 units, across the view

eval {"code":"const a = document.getElementById(\"get\");\nconst bytes = new Uint8Array(await (await fetch(a.href)).arrayBuffer());\nreturn { download: a.download, bytes: bytes.byteLength, zip: String.fromCharCode(bytes[0], bytes[1]) }"}

{"download":"toolbox.usdz","bytes":5417,"zip":"PK"}
```

## Pitfalls

- **Flipped normals.** Beyond the mirror warning above, not checked on this page: the place they would show is Quick Look, which the harness does not run.
- **Animation.** The exporter bakes the clips passed as `animations` into the file, and of their tracks it writes position, quaternion and scale, nothing else.
- **Export once.** `parseAsync` reads every texture back through a canvas. On a product page with a fixed model, export once, save the file, and link to it.
- **A texture that is a pixel array.** The exporter draws each texture's image onto a canvas. An image element, a canvas or an `ImageBitmap` works; a `DataTexture`'s array does not, and the export stops with `THREE.USDZExporter: No valid image data found. Unable to process texture.`

## Without paprika3d

Run the export in the browser's console and download the bytes with a `Blob` link, as the page does. `unzip -l` on the file shows what is inside, and any USD viewer opens the `.usda` files for reading. For the result in Quick Look itself, open the file on an iPhone or iPad.

## Where people ask about it

- [USDZ loader for three.js?](https://discourse.threejs.org/t/usdz-loader-for-three-js/35357) (discourse.threejs.org, 13,727 views)
- [GLTF to USDZ converter for windows](https://discourse.threejs.org/t/gltf-to-usdz-converter-for-windows/25750) (discourse.threejs.org, 4,454 views)
- [USDZ Exporter increases file size](https://discourse.threejs.org/t/usdz-exporter-increases-file-size/22777) (discourse.threejs.org, 4,036 views)
- [USDZ Exporter flips mesh normals](https://discourse.threejs.org/t/usdz-exporter-flips-mesh-normals/55719) (discourse.threejs.org, 1,081 views)
- [GLTF to USDZ exporter issues](https://discourse.threejs.org/t/gltf-to-usdz-exporter-issues/63069) (discourse.threejs.org, 803 views)
