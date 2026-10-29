---
title: three.js Raycaster: Unsupported camera type, pick with a bare camera matrix
phrase: raycaster: unsupported camera type
description: What "THREE.Raycaster: Unsupported camera type" means in three.js, the branch of Raycaster.setFromCamera() that prints it, which cameras and values reach it, how to build the ray yourself from a projection matrix, and what the paprika3d plugin's eval and observe replies show before and after.
meta: How to fix three.js "THREE.Raycaster: Unsupported camera type: Camera": what triggers it, the line that prints it, and the fix in code.
intent: error-raycaster-camera-type
message: THREE.Raycaster: Unsupported camera type: Camera
queries:
  - "three.js raycaster unsupported camera type"
  - "Raycast in Three.js with only a projection matrix"
  - "THREE.Raycaster: Unsupported camera type"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.Raycaster: Unsupported camera type: Camera

three.js logs this console error from `Raycaster.setFromCamera()` when the camera it was given is neither a `PerspectiveCamera` nor an `OrthographicCamera`. The word after the colon is the camera's `type` property, so it reads `Camera` for a plain `THREE.Camera`, `CubeCamera` for a cube camera and `undefined` for an object that is not a camera at all. The raycaster's ray is left as it was, so the next `intersectObjects()` tests whatever ray the raycaster held before, and clicks pick nothing or the wrong object.

## Where three.js prints it

`setFromCamera()` in `src/core/Raycaster.js` (three r186) has one branch per supported projection and an error for the rest:

```js
setFromCamera( coords, camera ) {

	if ( camera.isPerspectiveCamera ) {

		this.ray.origin.setFromMatrixPosition( camera.matrixWorld );
		this.ray.direction.set( coords.x, coords.y, 0.5 ).unproject( camera ).sub( this.ray.origin ).normalize();
		this.camera = camera;

	} else if ( camera.isOrthographicCamera ) {

		this.ray.origin.set( coords.x, coords.y, camera.projectionMatrix.elements[ 14 ] ).unproject( camera ); // set origin in plane of camera
		this.ray.direction.set( 0, 0, - 1 ).transformDirection( camera.matrixWorld );
		this.camera = camera;

	} else {

		error( 'Raycaster: Unsupported camera type: ' + camera.type );

	}

}
```

The test is on the `isPerspectiveCamera` and `isOrthographicCamera` flags, not on the matrix. A camera whose projection matrix is a valid perspective matrix still lands in the `else` branch when the object is a base `Camera`. `ArrayCamera`, which WebXR uses, extends `PerspectiveCamera` and passes.

## Why the camera is not supported

- **A base `THREE.Camera` with a matrix from somewhere else.** Map libraries with a custom 3D layer (Mapbox GL and MapLibre among them), AR toolkits and some engines pass a projection matrix each frame, and the usual pattern copies it into `new THREE.Camera()`. Rendering with it works; picking with `setFromCamera()` does not.
- **A `CubeCamera` or `StereoCamera`.** A `CubeCamera` is a group of six perspective cameras with type `CubeCamera`; a `StereoCamera` keeps its eyes in `cameraL` and `cameraR`. Pass one of the inner cameras instead.
- **Something that is not a camera.** Controls, a scene, a `gltf` result or an R3F state object passed where the camera goes prints `Unsupported camera type: undefined`. With OrbitControls the camera is `controls.object`.
- **A custom camera class** that extends `Camera` directly and sets its own projection, for an oblique or off-axis view.

## A page that reproduces it

This page draws three crates through a bare `Camera` that receives a perspective matrix, standing in for a map layer's matrix, and turns the clicked crate red:

```js
const camera = new THREE.Camera();
camera.projectionMatrix.copy(new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100).projectionMatrix);
// ...
raycaster.setFromCamera(pointer, camera); // a base Camera: neither branch matches
const hit = raycaster.intersectObjects(crates)[0];
if (hit) hit.object.material.color.set(0xff5533);
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. The calls below ran on 2026-10-28 with the stable build, on a machine with no GPU; the run folder becomes `<project>`, and the replies are cut to the lines this page explains, word for word.

```text
look {}

On screen (3):
crate* ×3 8.1% [250, 322, 1029, 477]
Never visible: none

eval {"code": "renderer.domElement.dispatchEvent(new PointerEvent(\"pointerdown\", { clientX: 950, clientY: 400 })); return scene.children.map(c => c.name + \" #\" + c.material.color.getHexString())"}

["crate0 #5588cc","crate1 #5588cc","crate2 #5588cc"]
errors: THREE.Raycaster: Unsupported camera type: Camera

observe {}

{"entities":{"crate0":{"type":"Mesh","position":[-2,0,0]},"crate1":{"type":"Mesh","position":[0,0,0]},"crate2":{"type":"Mesh","position":[2,0,0]}},"harness":{"frame":1,"renderer":{"calls":3,"triangles":36,"textures":0,"geometries":3,"programs":2},"scene":{"objects":3,"meshes":3,"lights":0,"cameras":0},"errors":["THREE.Raycaster: Unsupported camera type: Camera"],"changed":null}}
```

`look` draws the first frame, so the crates have their world matrices, and shows all three on screen; the box `[250, 322, 1029, 477]` is the pixel area they cover together, which puts the right crate under x 950. The `eval` sends the page's own handler a press at that point. The error comes back on its `errors:` line, and the returned colours show that no crate changed: the raycaster kept its default ray from the origin along minus z, which starts inside the middle crate and meets no front face. `observe` keeps the error in `harness.errors` for later calls. The replies show the camera's type but not where the camera came from; for a map layer, the place to look is the code that builds the camera in the layer's setup.

## The fix

When the page owns the camera, make it a `PerspectiveCamera` and keep `setFromCamera()`. When the matrix comes from outside, build the ray with `unproject()`, which works on any camera: it multiplies by `projectionMatrixInverse` and then by `matrixWorld`. A base `Camera` never fills `projectionMatrixInverse` itself, so invert it each time the projection is copied in:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Pick</title>
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

// a camera that has nothing but a projection matrix, as a map or AR layer hands it over
const camera = new THREE.Camera();
const setProjection = () => {
  camera.projectionMatrix.copy(new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100).projectionMatrix);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); // unproject() reads the inverse
};
setProjection();
camera.position.set(0, 0, 6);
camera.updateMatrixWorld();

const crates = [-2, 0, 2].map((x, i) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x5588cc }));
  m.position.x = x;
  m.name = 'crate' + i;
  scene.add(m);
  return m;
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', e => {
  pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  // setFromCamera() handles perspective and orthographic cameras; for a bare matrix, unproject two depths instead
  const near = new THREE.Vector3(pointer.x, pointer.y, -1).unproject(camera);
  const far = new THREE.Vector3(pointer.x, pointer.y, 1).unproject(camera);
  raycaster.set(near, far.sub(near).normalize());
  const hit = raycaster.intersectObjects(crates)[0];
  if (hit) hit.object.material.color.set(0xff5533);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  setProjection();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The same press now turns the right crate red, and nothing is logged:

```text
eval {"code": "renderer.domElement.dispatchEvent(new PointerEvent(\"pointerdown\", { clientX: 950, clientY: 400 })); return scene.children.map(c => c.name + \" #\" + c.material.color.getHexString())"}

["crate0 #5588cc","crate1 #5588cc","crate2 #ff5533"]

observe {}

{"entities":{"crate0":{"type":"Mesh","position":[-2,0,0]},"crate1":{"type":"Mesh","position":[0,0,0]},"crate2":{"type":"Mesh","position":[2,0,0]}},"harness":{"frame":1,"renderer":{"calls":3,"triangles":36,"textures":0,"geometries":3,"programs":2},"scene":{"objects":3,"meshes":3,"lights":0,"cameras":0},"errors":[],"changed":null}}
```

Points at depth -1 and 1 in normalized device coordinates lie on the near and far planes, so the ray between them passes through the pixel under the pointer for a perspective or an orthographic matrix alike. If the outside library moves the camera through the matrix it hands over (a combined view-projection matrix, as map layers usually pass), leave `matrixWorld` at identity and invert that combined matrix instead; the ray then comes out in world space directly.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Raycast in Three.js with only a projection matrix](https://stackoverflow.com/questions/59163141/raycast-in-three-js-with-only-a-projection-matrix) (Stack Overflow, 3,853 views, 1 answer)
- [three.js raycaster unsupported camera type](https://stackoverflow.com/questions/48039062/three-js-raycaster-unsupported-camera-type) (Stack Overflow, 3,426 views, 0 answers)
- [THREE.Raycaster: Unsupported camera type](https://discourse.threejs.org/t/three-raycaster-unsupported-camera-type/12545) (discourse.threejs.org, 2,839 views, 2 posts)
- [Raycaster not working setFromCamera](https://discourse.threejs.org/t/raycaster-not-working-setfromcamera/33261) (discourse.threejs.org, 2,592 views, 5 posts)
