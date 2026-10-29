---
title: three.js THREE.ObjectLoader: Can't parse the file, ObjectLoader reads three.js JSON and nothing else
phrase: objectloader: can't parse
description: What three.js means by "THREE.ObjectLoader: Can't parse <url>." with a JSON SyntaxError after it, which files ObjectLoader reads, which loader an OBJ, glTF or FBX file needs instead, and how a coding agent reads the error with the paprika3d plugin's open and observe replies.
meta: three.js "THREE.ObjectLoader: Can't parse models/chair.obj. Unexpected token '#', '# Blender '... is not valid JSON": what triggers it and how to fix it.
intent: error-objectloader-cant-parse
message: THREE.ObjectLoader: Can't parse models/chair.obj. Unexpected token '#', "# Blender "... is not valid JSON
queries:
  - "THREE:ObjectLoader: Can't parse https://cywarr.github.io/small-shop/Kirche3D.obj. Unexpected token # in JSON at position 0"
  - "THREE.ObjectLoader: Can't parse"
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# THREE.ObjectLoader: Can't parse models/chair.obj. Unexpected token '#', "# Blender "... is not valid JSON

`ObjectLoader` loads one format: three.js's own JSON, the kind `object.toJSON()` and the three.js editor's export write. It reads the file as text and hands it to `JSON.parse`. When that throws, ObjectLoader prints this error with the URL and the browser's own JSON message after it, and nothing is added to the scene. The JSON message names the first character it could not read, which usually tells you what the file is: `#` for an OBJ, `<` for an HTML page, `K` for a binary FBX, `g` for a GLB (`glTF`).

## Where three.js prints it

`ObjectLoader.load()` in `src/loaders/ObjectLoader.js` (three r186) fetches the file with a `FileLoader` as text, then:

```js
let json = null;

try {

	json = JSON.parse( text );

} catch ( e ) {

	if ( onError !== undefined ) onError( e );

	error( 'ObjectLoader: Can\'t parse ' + url + '.', e.message );

	return;

}
```

`error()` is three's logger from `src/utils.js`: it adds the `THREE.` prefix and calls `console.error` with both values, which is why the line reads as the URL, a full stop and then the `SyntaxError` text. The error prints whether or not you pass an `onError` callback. A file that is valid JSON but not three's format gets a different error from the next lines of the same function, `THREE.ObjectLoader: Can't load <url>`, when it has no `metadata.type` or its type is `geometry`.

The text after the full stop comes from the browser, not from three, so it differs between browsers and versions. Chrome today writes `Unexpected token '#', "# Blender "... is not valid JSON`; older Chrome wrote `Unexpected token # in JSON at position 0`, the form in the thread title below.

## Why ObjectLoader gets a file it cannot read

- **The wrong loader for the format.** ObjectLoader's name suggests it loads any 3D object; it does not. OBJ needs `OBJLoader`, glTF and GLB need `GLTFLoader`, FBX needs `FBXLoader`, all from `three/addons/loaders/`. This is the case in the thread.
- **An HTML page instead of the JSON.** A wrong path on a single-page-app server, which answers with its `index.html`, gives `Unexpected token '<'`.
- **A JSON file cut short or written by hand** with a trailing comma or a comment, which `JSON.parse` refuses.
- **An old three.js JSON model** from the removed `JSONLoader` era, which parses but then gets `Can't load` because its metadata type is `geometry`.

## A page that reproduces it

The page loads an OBJ file exported from Blender with ObjectLoader:

```js
new THREE.ObjectLoader().load('models/chair.obj', (obj) => {
  obj.name = 'chair';
  scene.add(obj);
});
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. These replies come from the stable build on 2026-10-28, on a computer without a GPU; `<project>` replaces the folder path, and the lines not discussed are cut, with the rest as the tools wrote them.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41191/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
THREE.ObjectLoader: Can't parse models/chair.obj. Unexpected token '#', "# Blender "... is not valid JSON

look {}

On screen (0):
Never visible: none

observe {}

{"entities":{},"harness":{"frame":1,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":2,"meshes":0,"lights":2,"cameras":0},"errors":["THREE.ObjectLoader: Can't parse models/chair.obj. Unexpected token '#', \"# Blender \"... is not valid JSON"],"changed":null}}
```

The error is in `open`'s `Errors so far` because the load finished before frame 0. There is no `Failed to load` line, so the file was found and downloaded; the quoted start of the file, `# Blender `, is the header comment Blender writes at the top of every OBJ export. `look` has nothing on screen, and `observe` shows no meshes in the scene and the same error under `harness.errors`.

## The fix

Use the loader that matches the file. For the OBJ, `OBJLoader`; keep ObjectLoader for files three wrote itself. The page below does both, with the chair as OBJ text and a rug saved earlier with `rug.toJSON()`, each inlined so the block runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Chair</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2e36);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.2, 1.8, 3);
camera.lookAt(0, 0.5, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 4);
scene.add(sun);

// In a project these are 'models/chair.obj' (an OBJ file from Blender) and 'models/rug.json'
// (three's own JSON, written by rug.toJSON()). Inlined here so the page runs on its own.
const CHAIR_OBJ = `# Blender 4.2.0
o chair
v -0.5 0.45 -0.5
v 0.5 0.45 -0.5
v 0.5 0.45 0.5
v -0.5 0.45 0.5
v -0.5 0.55 -0.5
v 0.5 0.55 -0.5
v 0.5 0.55 0.5
v -0.5 0.55 0.5
v -0.5 0.55 -0.5
v 0.5 0.55 -0.5
v 0.5 0.55 -0.4
v -0.5 0.55 -0.4
v -0.5 1.3 -0.5
v 0.5 1.3 -0.5
v 0.5 1.3 -0.4
v -0.5 1.3 -0.4
v -0.45 0 -0.45
v -0.35 0 -0.45
v -0.35 0 -0.35
v -0.45 0 -0.35
v -0.45 0.45 -0.45
v -0.35 0.45 -0.45
v -0.35 0.45 -0.35
v -0.45 0.45 -0.35
v -0.45 0 0.35
v -0.35 0 0.35
v -0.35 0 0.45
v -0.45 0 0.45
v -0.45 0.45 0.35
v -0.35 0.45 0.35
v -0.35 0.45 0.45
v -0.45 0.45 0.45
v 0.35 0 -0.45
v 0.45 0 -0.45
v 0.45 0 -0.35
v 0.35 0 -0.35
v 0.35 0.45 -0.45
v 0.45 0.45 -0.45
v 0.45 0.45 -0.35
v 0.35 0.45 -0.35
v 0.35 0 0.35
v 0.45 0 0.35
v 0.45 0 0.45
v 0.35 0 0.45
v 0.35 0.45 0.35
v 0.45 0.45 0.35
v 0.45 0.45 0.45
v 0.35 0.45 0.45
f 1 2 3 4
f 5 8 7 6
f 4 3 7 8
f 2 1 5 6
f 3 2 6 7
f 1 4 8 5
f 9 10 11 12
f 13 16 15 14
f 12 11 15 16
f 10 9 13 14
f 11 10 14 15
f 9 12 16 13
f 17 18 19 20
f 21 24 23 22
f 20 19 23 24
f 18 17 21 22
f 19 18 22 23
f 17 20 24 21
f 25 26 27 28
f 29 32 31 30
f 28 27 31 32
f 26 25 29 30
f 27 26 30 31
f 25 28 32 29
f 33 34 35 36
f 37 40 39 38
f 36 35 39 40
f 34 33 37 38
f 35 34 38 39
f 33 36 40 37
f 41 42 43 44
f 45 48 47 46
f 44 43 47 48
f 42 41 45 46
f 43 42 46 47
f 41 44 48 45
`;
const RUG_JSON = '{"metadata":{"version":4.7,"type":"Object","generator":"Object3D.toJSON"},"geometries":[{"uuid":"rug-geometry","type":"BoxGeometry","width":1.6,"height":0.02,"depth":1.2}],"materials":[{"uuid":"rug-material","type":"MeshStandardMaterial","color":9059118,"roughness":0.9,"metalness":0}],"object":{"uuid":"rug","type":"Mesh","name":"rug","geometry":"rug-geometry","material":"rug-material","matrix":[1,0,0,0,0,1,0,0,0,0,1,0,0,-0.011,0,1]}}';

// Each format to its own loader: OBJLoader for .obj, ObjectLoader for three's JSON.
const chair = new OBJLoader().parse(CHAIR_OBJ);
chair.name = 'chair';
scene.add(chair);

const rug = new THREE.ObjectLoader().parse(JSON.parse(RUG_JSON));
scene.add(rug);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33695/index.html in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["chair","rug"]}

look {}

On screen (2):
chair 7.3% [463, 181, 818, 586]
rug 4% [404, 446, 874, 642] 1.6 × 1.2 units
```

Both objects reach the scene with no errors. `look` measures the rug at `1.6 × 1.2 units`, the size its JSON gives the box. If the model has to stay in three's JSON format, convert it once: load the OBJ with OBJLoader in a page, then save `JSON.stringify(object.toJSON())` to a file, which ObjectLoader reads back with the same geometry and materials. For models you share with other tools, GLB is the format to keep, since Blender, game engines and model viewers read it.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [THREE:ObjectLoader: Can't parse https://cywarr.github.io/small-shop/Kirche3D.obj. Unexpected token # in JSON at position 0](https://discourse.threejs.org/t/three-cant-parse-https-cywarr-github-io-small-shop-kirche3d-obj-unexpected-token-in-json-at-position-0/5622) (discourse.threejs.org, 5,912 views, 12 posts)
