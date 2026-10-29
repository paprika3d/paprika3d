---
title: three.js DRACOLoader Decoding failed: a damaged Draco file or a decoder that does not know its version
phrase: dracoloader decoding failed
description: What three.js means by "THREE.DRACOLoader: Decoding failed:" followed by Failed to decode geometry data or Unknown minor version, why the error your onError receives has no message, and how a coding agent reads the Draco header with the paprika3d plugin's open and eval replies.
meta: How to fix three.js "THREE.DRACOLoader: Decoding failed: Failed to decode geometry data": what triggers it, the line that prints it, and the fix in code.
intent: error-draco-decoding-failed
message: THREE.DRACOLoader: Decoding failed: Failed to decode geometry data.
queries:
  - "[DRACOLoader] Decoding failed: Unknown minor version"
  - "Draco decoding errors result in uncaught promise rejections."
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# THREE.DRACOLoader: Decoding failed: Failed to decode geometry data.

The Draco decoder ran on a compressed mesh and gave up. The text after `Decoding failed:` is the decoder's own reason: `Failed to decode geometry data.` when the compressed bytes are damaged, and `Unknown major version.` or `Unknown minor version.` when the file's Draco format version is one this decoder was not built for. The DRACOLoader itself is set up correctly when you see this message (a missing one gives `No DRACOLoader instance provided`, covered in the guide on [glTF models that fail to load](/guides/threejs-gltf-model-failed-to-load)); the problem is in the file or in the decoder files.

## Where three.js prints it

`decodeGeometry()` runs inside DRACOLoader's web worker, in `examples/jsm/loaders/DRACOLoader.js` (three r186). It asks the decoder for the geometry type, decodes, and checks the status:

```js
if ( ! decodingStatus.ok() || dracoGeometry.ptr === 0 ) {

	throw new Error( 'THREE.DRACOLoader: Decoding failed: ' + decodingStatus.error_msg() );

}
```

The worker catches that error, logs it with `console.error` and posts the text back:

```js
} catch ( error ) {

	console.error( error );

	self.postMessage( { type: 'error', id: message.id, error: error.message } );
```

On the main thread the task's promise is rejected with that message object as it is. So the console line comes from the worker, and the value your `onError` callback receives is a plain object `{ type, id, error }`, not an `Error`: `err.message` is undefined and the text is in `err.error`. Code that logs `err.message` prints an empty reason.

## Why a Draco mesh does not decode

- **The file was damaged on the way.** An FTP upload in ASCII mode, a deploy step that rewrites files as text, a proxy or a CDN rule that transforms the response, or a download cut short. The GLB container can survive this while the Draco bytes inside it do not, which gives `Failed to decode geometry data.`
- **A decoder older than the encoder.** A project that copied the `draco/` folder into `public/` years ago, or points `setDecoderPath` at an old CDN path, can meet files from a newer Draco encoder. The decoder reads the version in the Draco header, does not know it, and stops with `Unknown major version.` or `Unknown minor version.`
- **Bytes that are not Draco.** A tool that wrote the `KHR_draco_mesh_compression` extension around uncompressed data, or the wrong buffer view, fails the same way.

## A page that reproduces it

The page loads two Draco GLB files with a correctly set up DRACOLoader. Both started as the same valid crate. In `crate.glb`, a run of bytes inside the compressed mesh was inverted, as a damaged transfer would leave them. In `barrel.glb`, the minor version byte of the Draco header was changed from 2 to 9, to stand in for a file from an encoder newer than this decoder:

```js
const draco = new DRACOLoader().setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
for (const name of ['crate', 'barrel']) {
  loader.load(`models/${name}.glb`, (gltf) => {
    gltf.scene.name = name;
    scene.add(gltf.scene);
  }, undefined, (err) => console.error(`${name}.glb did not load:`, err.message));
}
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. The stable build gave these replies on 2026-10-28 on a machine with no GPU; the folder is written `<project>`, and the replies are trimmed to the lines used here without rewording.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33727/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Error: THREE.DRACOLoader: Decoding failed: Failed to decode geometry data.
Error: THREE.DRACOLoader: Decoding failed: Unknown minor version.
crate.glb did not load: 
barrel.glb did not load: 
Loaded: crate.glb 0.0 MB, barrel.glb 0.0 MB
```

Both files downloaded (`Loaded`), both decodes failed, and `entities` is empty. The first two error lines are the worker's. The next two are the page's own `onError`, and they end in nothing: `err.message` is undefined, as the source above predicts. An `eval` that catches the rejection shows what the callback really gets:

```text
eval {"code": "const { GLTFLoader } = await import(\"three/addons/loaders/GLTFLoader.js\"); const { DRACOLoader } = await import(\"three/addons/loaders/DRACOLoader.js\"); const l = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(\"./node_modules/three/examples/jsm/libs/draco/\")); try { await l.loadAsync(\"models/crate.glb\"); return \"loaded\" } catch (err) { return { isError: err instanceof Error, message: err.message ?? null, keys: Object.keys(err), error: err.error } }"}

{"isError":false,"message":null,"keys":["type","id","error"],"error":"THREE.DRACOLoader: Decoding failed: Failed to decode geometry data."}
errors: Error: THREE.DRACOLoader: Decoding failed: Failed to decode geometry data.
```

For a version error, the Draco header says which version the file claims. It starts with the text `DRACO`, then the major and minor version bytes:

```text
eval {"code": "const b = new Uint8Array(await (await fetch(\"models/barrel.glb\")).arrayBuffer()); const i = b.findIndex((v, k) => String.fromCharCode(...b.slice(k, k + 5)) === \"DRACO\"); return { at: i, version: b[i + 5] + \".\" + b[i + 6] }"}

{"at":976,"version":"2.9"}
```

Version 2.9 is the edited byte. The unedited crate's header says 2.2, the version current Draco encoders write, so a real file that claims something else came from an encoder newer or older than your decoder. What the replies cannot tell is where a damaged file was damaged; for that, compare the file's size and checksum with the exporter's output.

## The fix

For damaged bytes, replace the file: export or download it again, move it in binary mode, and in Git mark models as binary (`*.glb binary` in `.gitattributes`) so no line-ending filter touches them. For a version error, load the decoder that ships with the three.js you use, from `three/examples/jsm/libs/draco/` (copied into `public/draco/` if your build needs that), and copy it again whenever you upgrade three. In both cases, read `err.error` as well as `err.message` in `onError`, so the reason reaches your own log. The fixed page has the undamaged crate inlined so it runs on its own:

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

// In a project this is 'models/crate.glb', copied again from the exporter's output as binary.
// Inlined here so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAACUBAAAtAMAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjM2fSx7InR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjI0LCJtYXgiOlswLjUsMC41LDAuNV0sIm1pbiI6Wy0wLjUsLTAuNSwtMC41XX0seyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNH0seyJ0eXBlIjoiVkVDMiIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNH1dLCJidWZmZXJWaWV3cyI6W3siYnVmZmVyIjowLCJieXRlT2Zmc2V0IjowLCJieXRlTGVuZ3RoIjoxOTV9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6MTk1fV0sIm1hdGVyaWFscyI6W3sibmFtZSI6Indvb2QiLCJwYnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLjY5LDAuNDIsMC4yLDFdLCJyb3VnaG5lc3NGYWN0b3IiOjAuOCwibWV0YWxsaWNGYWN0b3IiOjB9fV0sIm1lc2hlcyI6W3sibmFtZSI6ImNyYXRlIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MSwiTk9STUFMIjoyLCJURVhDT09SRF8wIjozfSwibW9kZSI6NCwibWF0ZXJpYWwiOjAsImluZGljZXMiOjAsImV4dGVuc2lvbnMiOnsiS0hSX2RyYWNvX21lc2hfY29tcHJlc3Npb24iOnsiYnVmZmVyVmlldyI6MCwiYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxLCJURVhDT09SRF8wIjoyfX19fV19XSwibm9kZXMiOlt7Im5hbWUiOiJjcmF0ZSIsIm1lc2giOjB9XSwic2NlbmVzIjpbeyJub2RlcyI6WzBdfV0sImV4dGVuc2lvbnNVc2VkIjpbIktIUl9kcmFjb19tZXNoX2NvbXByZXNzaW9uIl0sImV4dGVuc2lvbnNSZXF1aXJlZCI6WyJLSFJfZHJhY29fbWVzaF9jb21wcmVzc2lvbiJdfSDEAAAAQklOAERSQUNPAgIBAQAAAAgMAgsAAANvtRQBARBVBNdT9kZVBNdT9kYD/wAAAAEAAQEAAQAJAwAAAgEBCQMAAQMBAwkCAAICAQEBAAMDASgBGAMA6LExQpRAAAAAAAD/PwAAAAAAvwAAAL8AAAC/AACAPw4AAwEBAYEEqTb/////////960GrQIHUCRrdKNsgf8DAAD/AQAACgEBAQEBA60eARRVDQuKfZmOMPmz+r4/SwAAAAD/DwAAAAAAAAAAAAAAAIA/DAA=';

// The decoder files that ship with this three.js release, so decoder and loader always match.
const draco = new DRACOLoader().setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
loader.load(MODEL, (gltf) => {
  gltf.scene.name = 'crate';
  scene.add(gltf.scene);
}, undefined, (err) => {
  // A Draco failure arrives as the worker's message object: its text is in err.error, not err.message.
  console.error('crate.glb did not load:', err.message ?? err.error);
});

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

Opened http://127.0.0.1:42789/index.html in 0.3 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["crate"]}

look {}

On screen (1):
crate 9.3% [464, 352, 806, 713]
```

No errors, and the crate is on screen.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [(DRACOLoader) Decoding failed: Unknown minor version](https://discourse.threejs.org/t/dracoloader-decoding-failed-unknown-minor-version/3907) (discourse.threejs.org, 2,156 views, 5 posts)
- [Draco decoding errors result in uncaught promise rejections.](https://github.com/mrdoob/three.js/issues/20883) (GitHub, 8 comments)
