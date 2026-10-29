---
title: three.js GLTFLoader JSON content not found: a GLB header that hides its JSON chunk
phrase: gltfloader json content not found
description: What three.js means by "THREE.GLTFLoader: JSON content not found.", the GLB header field that causes it, how to repair the file or the writer that made it, and how a coding agent reads the header with the paprika3d plugin's eval replies.
meta: How to fix three.js "THREE.GLTFLoader: JSON content not found": what triggers it, the line that prints it, and the fix in code.
intent: error-gltf-json-content-not-found
message: THREE.GLTFLoader: JSON content not found.
queries:
  - "THREE.GLTFLoader: JSON content not found"
  - "Problem loading several glb via GLTF.loader.parse"
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.GLTFLoader: JSON content not found.

A GLB file is a 12-byte header followed by chunks: a JSON chunk that describes the scene, then usually a binary chunk with the vertex data. GLTFLoader throws this error when the file starts with the right `glTF` magic but its chunk loop ends without finding a chunk of type JSON. The chunks themselves are often intact; what is wrong is the header's length field, or the type code on the JSON chunk, so the loader never looks at the bytes that are there.

## Where three.js prints it

`GLTFBinaryExtension` in `examples/jsm/loaders/GLTFLoader.js` (three r186) reads the header, then walks the chunks until it has covered the number of bytes the header claims:

```js
const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
const chunkView = new DataView( data, BINARY_EXTENSION_HEADER_LENGTH );
let chunkIndex = 0;

while ( chunkIndex < chunkContentsLength ) {
```

and after the loop:

```js
if ( this.content === null ) {

	throw new Error( 'THREE.GLTFLoader: JSON content not found.' );

}
```

`header.length` is the third 32-bit field of the file, little-endian, and the glTF 2.0 specification says it holds the length of the whole file. When it is 12 or less, `chunkContentsLength` is zero or negative and the loop never runs. When the JSON chunk's type field is anything other than `0x4E4F534A` (the bytes `JSON`), the loop skips the chunk as an unknown type, which the specification tells readers to do. Either way `content` stays null. The error goes to the `onError` callback of `load()` or `parse()`, or to `console.error` when there is none.

## Why the header is wrong

- **A GLB writer that never fills in the length.** Hand-written exporters (a server that builds GLB files from a database, a script that bakes a scene in Node) often write the header first, with the length still unknown, and forget to go back to it. A length of 0 or 12 gives exactly this error.
- **A wrong chunk type.** A writer that puts the string `json` in lower case, or swaps the chunk's length and type fields, writes a JSON chunk that the loader skips.
- **Bytes patched by hand.** A tool that edits a GLB's JSON in place and rewrites the chunk without updating the header.

A file with the wrong magic, a renamed `.gltf` or an HTML page, does not reach this code at all: GLTFLoader decodes it as JSON text and throws a `SyntaxError` instead. A big-endian header (a writer that left the little-endian flag off `setUint32`) fails with a `RangeError` while the loop reads past the end.

## A page that reproduces it

The GLB below was written by glTF Transform, then had its header length set to 0 the way a broken writer leaves it. The page loads it with no error callback:

```js
new GLTFLoader().load('models/crate.glb', (gltf) => {
  gltf.scene.name = 'crate';
  scene.add(gltf.scene);
});
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. The replies are from the stable build on 2026-10-28, on a machine without a GPU, shortened to the lines this page needs and otherwise unedited; `<project>` is the project folder.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41851/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Error: THREE.GLTFLoader: JSON content not found.
Loaded: crate.glb 0.0 MB

look {}

On screen (0):
Never visible: none
```

`Loaded: crate.glb` says the download worked, so the problem is in the bytes. To see them, `eval` reads the header and the first chunk's header with a `DataView`:

```text
eval {"code": "const b = await (await fetch(\"models/crate.glb\")).arrayBuffer(); const v = new DataView(b); return { bytes: b.byteLength, magic: new TextDecoder().decode(new Uint8Array(b, 0, 4)), version: v.getUint32(4, true), length: v.getUint32(8, true), chunk0: { length: v.getUint32(12, true), type: v.getUint32(16, true).toString(16) } }"}

{"bytes":1524,"magic":"glTF","version":2,"length":0,"chunk0":{"length":848,"type":"4e4f534a"}}
```

The magic and version are right, and the first chunk is a JSON chunk of 848 bytes (type `4e4f534a`), but the header says the file is 0 bytes long against the 1524 it has. A wrong `type` here would point at the second cause instead.

`model_audit` reads the same file without complaint, because it reads the JSON chunk at its fixed position after the header and does not check the length field:

```text
model_audit {"cwd": "<project>", "path": "models/crate.glb"}

models/crate.glb · 2 KB · 12 triangles · 1 material · no textures · Draco no, meshopt no, KTX2 no
site: passes
```

So a clean `model_audit` reply does not mean three can load a GLB; the `open` reply is the one to trust for that.

## The fix

Repair the writer: after writing every chunk, write the total byte count at offset 8, as `view.setUint32(8, totalLength, true)`. To repair a file you already have, the same `eval` can rewrite the field and `save` the result over it:

```text
eval {"code": "const b = await (await fetch(\"models/crate.glb\")).arrayBuffer(); new DataView(b).setUint32(8, b.byteLength, true); return b", "save": "models/crate.glb"}

Saved models/crate.glb (2 KB, application/octet-stream)

open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:35507/index.html in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate.glb 0.0 MB

look {}

On screen (1):
crate 9.8% [456, 247, 813, 596]
```

The crate loads. For files from a writer you do not control, a check before `parseAsync` turns the bad header into an error that gives both numbers. The page below has that check and the repaired GLB inlined, so it runs on its own:

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

// In a project this is 'models/crate.glb', written again with its total length in the header.
// Inlined here so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAAD0BQAAUAMAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC41LDEsMC41XSwibWluIjpbLTAuNSwwLC0wLjVdLCJidWZmZXJWaWV3IjowLCJieXRlT2Zmc2V0IjowfSx7InR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjI0LCJidWZmZXJWaWV3IjowLCJieXRlT2Zmc2V0IjoxMn0seyJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjM2LCJidWZmZXJWaWV3IjoxLCJieXRlT2Zmc2V0IjowfV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjU3NiwiYnl0ZVN0cmlkZSI6MjQsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo1NzYsImJ5dGVMZW5ndGgiOjcyLCJ0YXJnZXQiOjM0OTYzfV0sImJ1ZmZlcnMiOlt7ImJ5dGVMZW5ndGgiOjY0OH1dLCJtYXRlcmlhbHMiOlt7Im5hbWUiOiJ3b29kIiwicGJyTWV0YWxsaWNSb3VnaG5lc3MiOnsiYmFzZUNvbG9yRmFjdG9yIjpbMC42OSwwLjQyLDAuMiwxXSwicm91Z2huZXNzRmFjdG9yIjowLjgsIm1ldGFsbGljRmFjdG9yIjowfX1dLCJtZXNoZXMiOlt7Im5hbWUiOiJjcmF0ZSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sIm1vZGUiOjQsIm1hdGVyaWFsIjowLCJpbmRpY2VzIjoyfV19XSwibm9kZXMiOlt7Im5hbWUiOiJjcmF0ZSIsIm1lc2giOjB9XSwic2NlbmVzIjpbeyJub2RlcyI6WzBdfV19IIgCAABCSU4AAAAAvwAAAAAAAAC/AAAAAAAAgL8AAAAAAAAAPwAAAAAAAAC/AAAAAAAAgL8AAAAAAAAAPwAAAAAAAAA/AAAAAAAAgL8AAAAAAAAAvwAAAAAAAAA/AAAAAAAAgL8AAAAAAAAAvwAAgD8AAAC/AAAAAAAAgD8AAAAAAAAAvwAAgD8AAAA/AAAAAAAAgD8AAAAAAAAAPwAAgD8AAAA/AAAAAAAAgD8AAAAAAAAAPwAAgD8AAAC/AAAAAAAAgD8AAAAAAAAAvwAAAAAAAAA/AAAAAAAAAAAAAIA/AAAAPwAAAAAAAAA/AAAAAAAAAAAAAIA/AAAAPwAAgD8AAAA/AAAAAAAAAAAAAIA/AAAAvwAAgD8AAAA/AAAAAAAAAAAAAIA/AAAAPwAAAAAAAAC/AAAAAAAAAAAAAIC/AAAAvwAAAAAAAAC/AAAAAAAAAAAAAIC/AAAAvwAAgD8AAAC/AAAAAAAAAAAAAIC/AAAAPwAAgD8AAAC/AAAAAAAAAAAAAIC/AAAAPwAAAAAAAAA/AACAPwAAAAAAAAAAAAAAPwAAAAAAAAC/AACAPwAAAAAAAAAAAAAAPwAAgD8AAAC/AACAPwAAAAAAAAAAAAAAPwAAgD8AAAA/AACAPwAAAAAAAAAAAAAAvwAAAAAAAAC/AACAvwAAAAAAAAAAAAAAvwAAAAAAAAA/AACAvwAAAAAAAAAAAAAAvwAAgD8AAAA/AACAvwAAAAAAAAAAAAAAvwAAgD8AAAC/AACAvwAAAAAAAAAAAAABAAIAAAACAAMABAAFAAYABAAGAAcACAAJAAoACAAKAAsADAANAA4ADAAOAA8AEAARABIAEAASABMAFAAVABYAFAAWABcA';

// A GLB header is 12 bytes: the magic 'glTF', the version, then the length of the whole file.
function checkGLB(buffer, url) {
  const view = new DataView(buffer);
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 4));
  const length = view.getUint32(8, true);
  if (magic === 'glTF' && length !== buffer.byteLength) {
    throw new Error(`${url.slice(0, 40)}: the GLB header says ${length} bytes, the file has ${buffer.byteLength}`);
  }
  return buffer;
}

const buffer = checkGLB(await (await fetch(MODEL)).arrayBuffer(), MODEL);
const gltf = await new GLTFLoader().parseAsync(buffer, '');
gltf.scene.name = 'crate';
scene.add(gltf.scene);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [THREE.GLTFLoader: JSON content not found](https://discourse.threejs.org/t/three-gltfloader-json-content-not-found/54954) (discourse.threejs.org, 926 views, 5 posts)
- [Problem loading several glb via GLTF.loader.parse](https://discourse.threejs.org/t/problem-loading-several-glb-via-gltf-loader-parse/35439) (discourse.threejs.org, 657 views, 0 posts)
