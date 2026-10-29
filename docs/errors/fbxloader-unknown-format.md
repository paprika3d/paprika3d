---
title: three.js FBXLoader Unknown format: the file is not an FBX file
phrase: fbxloader unknown format
description: What three.js means by "THREE.FBXLoader: Unknown format.", the header test in FBXLoader.js that throws it, which files fail that test, and how a coding agent reads the first bytes of the file with the paprika3d plugin's open and eval replies.
meta: How to fix three.js "THREE.FBXLoader: Unknown format": what triggers it, the line that prints it, and the fix in code.
intent: error-fbx-unknown-format
message: THREE.FBXLoader: Unknown format.
queries:
  - "Three.js - Unknown format Error when using .FBX Models"
  - "THREE.FBXLoader: Unknown format."
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# THREE.FBXLoader: Unknown format.

FBXLoader throws this when the bytes it was given are neither a binary FBX file nor something it takes for a text FBX file. Nothing is added to the scene. The name of the file does not matter to the loader: a file called `.fbx` that holds an OBJ, an HTML page or a damaged download fails the same way, so the first thing to look at is what is really in the file.

## Where three.js prints it

`FBXLoader.parse()` in `examples/jsm/loaders/FBXLoader.js` (three r186) tries the binary signature first, then the text test, then the version:

```js
if ( isFbxFormatBinary( FBXBuffer ) ) {

	fbxTree = new BinaryParser().parse( FBXBuffer );

} else {

	const FBXText = convertArrayBufferToString( FBXBuffer );

	if ( ! isFbxFormatASCII( FBXText ) ) {

		throw new Error( 'THREE.FBXLoader: Unknown format.' );

	}

	if ( getFbxVersion( FBXText ) < 7000 ) {
```

A binary FBX starts with the text `Kaydara FBX Binary`, two spaces and a NUL byte. The text test is less obvious. `isFbxFormatASCII()` walks the text with a cursor that skips one more character each step, so it reads the characters at positions 0, 1, 3, 6, 10, 15 and so on, and it returns false as soon as one of them equals the next letter of the binary signature:

```js
for ( let i = 0; i < CORRECT.length; ++ i ) {

	const num = read( 1 );
	if ( num === CORRECT[ i ] ) {

		return false;

	}

}
```

So a file is called unknown when it looks a little like a binary FBX at those positions, which happens to many text files by chance. Text that slips through goes on to `getFbxVersion()`, which throws `Cannot find the version number for the file given.` when there is no `FBXVersion:` line. Both errors mean the same thing for an HTML page or another format: it is not FBX. A real text FBX from before FBX 2011 (version 6100, for example) passes both and stops at `FBX version not supported`.

`load()` catches the error and passes it to your `onError` callback. Without one, it calls `console.error` with it, which is the line people see.

## Why a .fbx file is not FBX

- **Another format with the FBX extension.** An OBJ exported from Blender and renamed, or saved with the wrong extension, is the case in the page below: `# Blender` puts a `d` at position 6, the signature's fourth letter, so it fails the text test.
- **The wrong loader for the file.** Code copied from an FBX example and pointed at an `.obj`, `.gltf` or `.dae` file.
- **A damaged binary file.** A binary FBX whose first bytes were changed on the way (a text-mode transfer, a proxy, a broken upload) fails the binary check and then the text one.
- **A server answer instead of the file.** An HTML page from a single-page-app server, or a Git LFS pointer committed instead of the model. In a quick test these went on to the version error instead, but which of the two appears depends on the letters, so check the bytes either way.

## A page that reproduces it

The project's `models/crate.fbx` is an OBJ file from Blender with the wrong extension. The page loads it with FBXLoader and no error callback:

```js
new FBXLoader().load('models/crate.fbx', (fbx) => {
  fbx.name = 'crate';
  scene.add(fbx);
});
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. These are the stable build's replies from 2026-10-28, on a machine without a GPU; `<project>` stands for the folder, and each reply is cut to the lines discussed, with no word changed.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:37671/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Error: THREE.FBXLoader: Unknown format.

look {}

On screen (0):
Never visible: none

observe {}

{"entities":{},"harness":{"frame":1,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":2,"meshes":0,"lights":2,"cameras":0},"errors":["Error: THREE.FBXLoader: Unknown format."],"changed":null}}
```

The file downloaded fine (there is no `Failed to load` line), the parse threw, and `entities` is empty. `look` finds nothing on screen, and `observe` keeps the error under `harness.errors` with zero meshes in the scene. None of this says what the file holds, so the next call reads its first bytes:

```text
eval {"code": "const b = new Uint8Array(await (await fetch(\"models/crate.fbx\")).arrayBuffer()); return { bytes: b.length, start: new TextDecoder().decode(b.slice(0, 40)) }"}

{"bytes":206,"start":"# Blender 4.2.0\n# www.blender.org\no Crat"}
```

`# Blender`, then an `o` line: an OBJ file. A binary FBX would start with `Kaydara FBX Binary`, and a text FBX with a `; FBX 7.4.0 project file` comment and an `FBXHeaderExtension` block. An answer that starts with `<!doctype html>` is the server's page, and `version https://git-lfs` is an LFS pointer, which `git lfs pull` replaces with the real file.

## The fix

Give the file its real extension and the loader that reads it, or export it from Blender again as FBX if FBX is what the project needs. A loader that reads the first bytes before choosing also turns the next wrong file into an error that says what it is. The fixed page does both, with the OBJ inlined so it runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crate</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
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

// In a project this is 'models/crate.fbx': the file Blender wrote is an OBJ, so it gets its real
// extension (crate.obj) and the loader that reads it. Inlined here so the page runs on its own.
const CRATE_OBJ = `# Blender 4.2.0
# www.blender.org
o Crate
v -0.5 0 -0.5
v 0.5 0 -0.5
v 0.5 0 0.5
v -0.5 0 0.5
v -0.5 1 -0.5
v 0.5 1 -0.5
v 0.5 1 0.5
v -0.5 1 0.5
f 1 2 3 4
f 5 8 7 6
f 4 3 7 8
f 2 1 5 6
f 3 2 6 7
f 1 4 8 5
`;
const MODEL = 'data:text/plain,' + encodeURIComponent(CRATE_OBJ);

// Read the first bytes before choosing a loader, and say what the file is when it is neither.
async function loadModel(url) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const head = new TextDecoder().decode(bytes.slice(0, 64));
  if (head.startsWith('Kaydara FBX Binary') || /FBXVersion|; FBX \d/.test(head)) return new FBXLoader().parse(bytes, '');
  if (/^(#|v |o |g |mtllib )/m.test(head)) return new OBJLoader().parse(new TextDecoder().decode(bytes));
  throw new Error(`${url.slice(0, 60)} is not FBX or OBJ; it starts with ${JSON.stringify(head.slice(0, 30))}`);
}

const crate = await loadModel(MODEL);
crate.name = 'crate';
crate.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xb0703a }); });
scene.add(crate);

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

Opened http://127.0.0.1:46171/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}

look {}

On screen (1):
Crate 9.8% [456, 247, 813, 596]
Never visible: none
```

`entities` has `crate`, `open` has no `Errors so far`, and `look` finds the mesh, which keeps the name `Crate` from the OBJ's `o` line. For a damaged binary FBX there is no loader to switch to: download or export the file again and compare its size with the original.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Three.js - "Unknown format" Error when using .FBX Models](https://stackoverflow.com/questions/60528249/three-js-unknown-format-error-when-using-fbx-models) (Stack Overflow, 2,196 views, 1 answer)
