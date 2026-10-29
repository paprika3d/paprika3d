---
title: three.js Object3D.add: object not an instance of THREE.Object3D, add gltf.scene
phrase: object not an instance of three.object3d
description: Why three.js prints "THREE.Object3D.add: object not an instance of THREE.Object3D." when a loader result, a geometry or a material is passed to scene.add(), the check in Object3D.js that rejects it, and how the paprika3d plugin's open, look and eval replies show the missing object.
meta: How to fix three.js "THREE.Object3D.add: object not an instance of THREE.Object3D": what triggers it, the line that prints it, and the fix in code.
intent: error-object3d-add
message: THREE.Object3D.add: object not an instance of THREE.Object3D.
queries:
  - "THREE.Object3D.add: object not an instance of THREE.Object3D"
  - "I get this error every time I try use a GLB model file with a GLTFLoader(). How can i fix this"
  - "three.min.js:2 THREE.Object3D.add: object not an instance of THREE.Object3D"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.Object3D.add: object not an instance of THREE.Object3D.

three.js logs this console error when `scene.add()` or `group.add()` receives something that is not a node of the scene graph. Nothing is thrown, so the page keeps running, but the thing you meant to add is not in the scene and never draws. In most reports the argument was the object a loader hands to its callback, which holds a scene but is not one.

## Where three.js prints it

`Object3D.add()` in `src/core/Object3D.js` (three r186) accepts an argument when it has the `isObject3D` flag that every `Object3D` subclass sets. Anything else falls through to the error branch, and `add()` returns `this` as if it had worked:

```js
if ( object && object.isObject3D ) {

	object.removeFromParent();
	object.parent = this;
	this.children.push( object );

	object.dispatchEvent( _addedEvent );

	_childaddedEvent.child = object;
	this.dispatchEvent( _childaddedEvent );
	_childaddedEvent.child = null;

} else {

	error( 'Object3D.add: object not an instance of THREE.Object3D.', object );

}
```

The `error()` helper from `src/utils.js` adds the `THREE.` prefix and passes the rejected value as a second argument, which is why Chrome prints it after the message (`[object Object]` for a plain object, `[object BoxGeometry]` for a geometry). That trailing word says what kind of value went in. The check reads a flag rather than using `instanceof`, so in r186 a mesh made by a second copy of three is still accepted here; that case prints a different warning, covered on the page for "Multiple instances of Three.js being imported".

## Why scene.add rejects the argument

- **The whole loader result instead of its scene.** `GLTFLoader` calls back with an object holding `scene`, `scenes`, `animations`, `cameras` and `asset`. Passing that object to `scene.add()` is the case in most threads; the node to add is `gltf.scene`. `FBXLoader` and `OBJLoader` hand over a `Group` directly, so code copied from one of those into a glTF page breaks this way.
- **A geometry or material.** `scene.add(new THREE.BoxGeometry())` or adding a material by mistake. A `Mesh`, `Line`, `Points`, `Sprite`, `Group`, light, camera or other `Object3D` can go into the scene, and nothing else can; geometry and material go into a `Mesh` first.
- **undefined or a Promise.** Adding a variable before the async load has filled it, or adding the return value of `loadAsync()` without `await`, gives `undefined` or a `Promise`.
- **An old copy of three that checked `instanceof`.** Pages that load a very old build next to a newer one, through a script tag and a bundler, can still hit the error with a real mesh. r186 checks the flag, so this is rare now.

## A page that reproduces it

The page below builds a small crate, writes it to GLB bytes with `GLTFExporter`, and reads them back with `GLTFLoader.parseAsync()`, which resolves with the same object `loader.load()` passes to its callback. Then it adds that object itself:

```js
const glb = await new GLTFExporter().parseAsync(box, { binary: true });
const gltf = await new GLTFLoader().parseAsync(glb, '');
scene.add(gltf); // the loader's result object, not gltf.scene
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. These calls ran on 2026-10-28 with the stable build, on a machine with no GPU; run folder paths are shortened to `<project>` and each reply is cut to the lines discussed here, never reworded.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:38273/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":2,"entities":[]}
Errors so far:
THREE.Object3D.add: object not an instance of THREE.Object3D. [object Object]

observe {}

{"entities":{},"harness":{"frame":0,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":1,"meshes":0,"lights":1,"cameras":0},"errors":["THREE.Object3D.add: object not an instance of THREE.Object3D. [object Object]"],"changed":null}}

look {}

On screen (0):
Never visible: none
```

The error fires while the page sets itself up, so `open` already lists it under `Errors so far`, with the `[object Object]` that says a plain object was passed. `observe` counts one object in the scene, the hemisphere light, and no meshes: the crate was never attached. `look` draws a frame and finds nothing on screen, which is how the bug looks to a player, a background colour and no model.

The same `eval` that runs code in the page shows the geometry variant of the message, with the rejected type named at the end:

```text
eval {"code": "scene.add(new THREE.BoxGeometry(1, 1, 1)); return scene.children.length"}

2
errors: THREE.Object3D.add: object not an instance of THREE.Object3D. [object BoxGeometry]
```

What the replies do not show is which line of the page made the call: the message carries no stack in the reply, so the agent searches the page for `.add(` calls whose argument comes from a loader or a constructor that is not an `Object3D`.

## The fix

Add `gltf.scene`. Keep the result object around if the page needs `gltf.animations` for an `AnimationMixer` or `gltf.cameras` later:

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
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 1.5, 3);
camera.lookAt(0, 0, 0);

// a GLB made in the page, standing in for a file loaded with loader.load('crate.glb')
const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xb07040 }));
box.name = 'crate';
const glb = await new GLTFExporter().parseAsync(box, { binary: true });

const gltf = await new GLTFLoader().parseAsync(glb, '');
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

After the change, `open` has no `Errors so far` block, and the crate is drawn:

```text
look {}

On screen (1):
crate 7.9% [474, 257, 794, 580]
Never visible: none

observe {}

{"entities":{"AuxScene":{"type":"Group","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":12,"textures":1,"geometries":1,"programs":2},"scene":{"objects":3,"meshes":1,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

`AuxScene` is the name `GLTFExporter` gives the scene it wraps around a single exported object; a file from Blender carries its own scene name. With the crate in place the renderer reports one draw call, and `harness.errors` is empty. For a loader callback written in the old style, the same rule applies: `loader.load(url, gltf => scene.add(gltf.scene))`.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [THREE.Object3D.add: object not an instance of THREE.Object3D](https://stackoverflow.com/questions/30147002/three-object3d-add-object-not-an-instance-of-three-object3d) (Stack Overflow, 37,703 views, 2 answers)
- ["THREE.Object3D.add: object not an instance of THREE.Object3D". I get this error every time I try use a GLB model file with a GLTFLoader(). How can i fix this](https://discourse.threejs.org/t/three-object3d-add-object-not-an-instance-of-three-object3d-i-get-this-error-every-time-i-try-use-a-glb-model-file-with-a-gltfloader-how-can-i-fix-this/28863) (discourse.threejs.org, 6,737 views, 2 posts)
- [THREE.Object3D.add: object not an instance of THREE.Object3D](https://discourse.threejs.org/t/three-object3d-add-object-not-an-instance-of-three-object3d/48512) (discourse.threejs.org, 2,589 views, 6 posts)
- [three.min.js:2 THREE.Object3D.add: object not an instance of THREE.Object3D](https://stackoverflow.com/questions/65018531/three-min-js2-three-object3d-add-object-not-an-instance-of-three-object3d) (Stack Overflow, 2,434 views, 1 answer)
