---
title: three.js camera is not an instance of THREE.Camera: what render was given instead
phrase: camera is not an instance of three.camera
description: What three.js means by "THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.", the isCamera test in WebGLRenderer.js that prints it, the objects that end up in the camera argument, and how a coding agent spots the wrong argument with the paprika3d plugin's observe and eval replies.
meta: How to fix three.js "THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera": what triggers it, the line that prints it, and the fix in code.
intent: error-camera-not-instance-of-camera
message: THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.
queries:
  - "Error in three.js : camera is not an instance of THREE.Camera"
  - "THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera"
  - "repetitively getting error THREE.WebGLRenderer.render"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.

`renderer.render(scene, camera)` prints this and draws nothing when its second argument is an object that is not a camera. It is printed again on every frame of an animation loop, which is why people see it repeat hundreds of times. The fix is always at the call site: find what the code passed and pass the camera.

## Where three.js prints it

The test is the first thing `render` does in `src/renderers/WebGLRenderer.js` (three r186):

```js
this.render = function ( scene, camera ) {

	if ( camera !== undefined && camera.isCamera !== true ) {

		error( 'WebGLRenderer.render: camera is not an instance of THREE.Camera.' );
		return;

	}

	if ( _isContextLost === true ) return;
```

Two details of the test explain most of what people see. It reads the `isCamera` flag that every `Camera` subclass sets, not `instanceof`: older releases used `instanceof`, so a camera made by a second copy of three failed, and the old threads about two copies are about a check r186 no longer makes. And it skips `undefined`, so a missing camera passes this line and fails later inside the renderer with a `TypeError` instead.

## Why the argument is not a camera

- **The arguments are swapped.** `renderer.render(camera, scene)` puts the `Scene` in the camera slot. The scene has no `isCamera`, so this message prints.
- **A rig or a parent was passed.** A camera inside a `Group` that orbits or follows a player is still the camera; the group is an `Object3D`. The same goes for passing a model's root, a light, or a controls object such as `OrbitControls`, which holds the camera as its `object` property.
- **A loaded camera was looked up by name.** In a glTF or FBX file the node named "Camera" can be a parent whose child is the actual camera, so `getObjectByName` returns an `Object3D`. `gltf.cameras` holds the camera objects themselves.
- **A variable was reassigned.** A function parameter named `camera` that receives an event or a config object, or a wrapper around three that passes its own camera holder, reaches `render` with the wrong thing.

## A page that reproduces it

A camera sits in a group that turns, and the loop renders the group:

```js
const rig = new THREE.Group(); // turns the camera around the scene
rig.add(camera);
scene.add(rig);
renderer.setAnimationLoop(() => {
  rig.rotation.y += 0.01;
  renderer.render(scene, rig);
});
```

paprika3d is a Claude Code plugin and MCP server that runs three.js pages in a headless Chrome it owns, with the clock stopped at frame 0 until a tool steps it. The stable build answered these calls on 2026-10-28 on a computer with no GPU; lines not discussed here are left out, no line is reworded, and `<project>` stands for the folder.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:41367/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["rig","cube"]}

look {}

Cannot read properties of undefined (reading 'elements')

observe {}

{"entities":{"rig":{"type":"Group","position":[0,0,0]},"cube":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":1,"programs":0},"scene":{"objects":3,"meshes":1,"lights":0,"cameras":1},"errors":["THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera. (×3)"],"changed":null}}

eval {"code":"renderer.render(scene, find(\"rig\")); return 1"}

1
errors: THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.
```

`open` lists `rig` as an entity, a first hint that the page has a named group around its camera. `look` returns a `TypeError` and no picture: it redraws the frame with whatever the page last passed to `render` as its camera, and a `Group` has no projection matrix to read. That reply is the plugin failing on the same wrong argument, not a second bug in the page. `observe` holds the real message under `harness.errors`, counted three times, and shows `"calls":0`: three returned before drawing anything. Its `scene` block counts one camera in the scene, so the camera exists; it just never reached `render`. The `eval` call repeats the page's own call with the object found by name and gets the message back on its `errors` line, which confirms that the group is what triggers it.

## The fix

Render with the camera and let the group move it. The camera's world matrix includes the group's rotation, so nothing else changes:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Rig</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 4);
camera.lookAt(0, 0, 0);
const rig = new THREE.Group(); // turns the camera around the scene
rig.name = 'rig';
rig.add(camera);
scene.add(rig);
const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());
cube.name = 'cube';
scene.add(cube);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  rig.rotation.y += 0.01;
  renderer.render(scene, camera); // the camera inside the rig, not the rig
});
</script>
</body></html>
```

With the camera passed, the cube is listed on screen, `calls` is `1`, and `errors` is empty:

```text
look {}

On screen (1):
cube 5.8% [517, 284, 760, 538]
Never visible: none

observe {}

{"entities":{"rig":{"type":"Group","position":[0,0,0]},"cube":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":12,"textures":0,"geometries":1,"programs":2},"scene":{"objects":3,"meshes":1,"lights":0,"cameras":1},"errors":[],"changed":null}}
```

When the object comes from elsewhere, a one-line check in `eval` names it: `return [x.type, x.isCamera]` for the value the code passes. If it prints `Group` or `Object3D`, search its children with `x.getObjectByProperty('isCamera', true)`, which returns the first camera under it.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Error in three.js : camera is not an instance of THREE.Camera](https://stackoverflow.com/questions/26944839/error-in-three-js-camera-is-not-an-instance-of-three-camera) (Stack Overflow, 3,556 views, 2 answers)
- [Three.js error "camera is not an instance of THREE.Camera" when trying to render a cube](https://stackoverflow.com/questions/56009776/three-js-error-camera-is-not-an-instance-of-three-camera-when-trying-to-render) (Stack Overflow, 2,952 views, 1 answer)
- [THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera](https://stackoverflow.com/questions/37684129/three-webglrenderer-render-camera-is-not-an-instance-of-three-camera) (Stack Overflow, 1,248 views, 1 answer)
- [repetitively getting error THREE.WebGLRenderer.render](https://stackoverflow.com/questions/53230445/repetitively-getting-error-three-webglrenderer-render) (Stack Overflow, 873 views, 1 answer)
- [camera is not an instance of THREE.Camera](https://github.com/mrdoob/three.js/issues/3209) (GitHub, 6 comments)
