---
title: three.js buffer attribute's array buffer does not match the original size: grow it another way
phrase: buffer attribute's array buffer does not match the original size
description: What three.js means by "THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size", the check in WebGLAttributes.js that throws it, why a geometry cannot grow in place, and how a coding agent catches it over several drawn frames with the paprika3d plugin's interact reply.
meta: three.js "THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size...": what triggers it and how to fix it.
intent: error-buffer-attribute-size-mismatch
message: THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.
queries:
  - "Dynamic BufferGeometry disappears when re-setting the position buffer attribute"
  - "THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported."
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.

three.js throws this when a `BufferAttribute` that has already been sent to the GPU comes back with a typed array of a different byte length. A GPU buffer has a fixed size, and three updates the one it made with `bufferSubData`, which cannot grow or shrink it. The usual trigger is a line, trail or point cloud that gets one more point per frame by swapping in a new, longer array.

## Where three.js prints it

`update()` in `src/renderers/webgl/WebGLAttributes.js` (three r186) runs for each attribute of each geometry the renderer draws. The first time it creates a buffer of the array's size; afterwards, when `needsUpdate` has raised the attribute's version, it compares sizes before writing:

```js
const data = buffers.get( attribute );

if ( data === undefined ) {

	buffers.set( attribute, createBuffer( attribute, bufferType ) );

} else if ( data.version < attribute.version ) {

	if ( data.size !== attribute.array.byteLength ) {

		throw new Error( 'THREE.WebGLAttributes: The size of the buffer attribute\'s array buffer does not match the original size. Resizing buffer attributes is not supported.' );

	}

	updateBuffer( data.buffer, attribute, bufferType );

	data.version = attribute.version;

}
```

`data.size` is the byte length recorded when the buffer was created. So the error needs two drawn frames: one that uploads the attribute, and a later one where `attribute.array` has been replaced by an array of another length and `needsUpdate` was set. For an `InterleavedBufferAttribute`, the check is on the shared `InterleavedBuffer` instead. The exception leaves `renderer.render` partway through, so whatever was still to be drawn in that frame is not drawn, and an animation loop throws again on every frame after.

## Why the array changed size

- **Appending by replacing the array.** `attribute.array = new Float32Array(points.flatMap(...))` with one more point each frame, the pattern in the thread above. The first frame works, and the second throws.
- **Rebuilding data of a different length into the same attribute**, such as new text, a regenerated mesh or a different number of particles, while keeping the old geometry and attribute objects.
- **Shrinking**, which throws in the same way: the check is for any difference, not just growth.

`BufferGeometry.setFromPoints()` does not hit this check. On a geometry that already has a position attribute, it writes as many points as fit and warns `Buffer size too small for points data` about the rest.

## A page that reproduces it

A trail adds a point every frame by putting a new array into its position attribute:

```js
renderer.setAnimationLoop(() => {
  t += 1;
  points.push(new THREE.Vector3(-3 + t * 0.05, Math.sin(t * 0.1), 0));
  const position = geometry.attributes.position;
  position.array = new Float32Array(points.flatMap(p => [p.x, p.y, p.z])); // one more point each frame
  position.count = points.length;
  position.needsUpdate = true;
  renderer.render(scene, camera);
});
```

paprika3d is a Claude Code plugin and MCP server for three.js work: it opens the page in a headless Chrome it controls and stops the clock at frame 0. These are its stable build's replies from 2026-10-28, on a computer without a GPU, cut to the lines below with nothing reworded; `<project>` is the folder.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:34219/index.html in 0.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["trail"]}

interact {"steps":[{"wait":3,"draw":true}]}

{"after":null,"changed":{},"errors":["THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported. (index.html:27:12) (×2)"]}

look {}

THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.

eval {"code":"const p = find(\"trail\").geometry.attributes.position; return [p.count, p.array.length, p.version]"}

[4,12,3]
```

`open` shows nothing wrong, because frame 0 has not been drawn. The `interact` call steps three frames and draws each of them: the first uploads the buffer, and the next two throw, which is the `(×2)` after the message with the line of `index.html` where the page calls `render`. Stepping frames without drawing them shows nothing, since the check runs inside a draw. `look` then fails with the exception as its reply, because its frame throws too. The `eval` call reads the attribute: four points in a twelve-number array at version 3, while the GPU buffer still has the size of the first upload.

## The fix

Allocate the buffer once for the longest trail and fill it as points arrive; `setDrawRange` tells three how many points to draw. The array never changes length, so `needsUpdate` always takes the update path:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Trail</title>
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
camera.position.set(0, 0, 8);

// one buffer sized for the longest trail, filled as it grows; setDrawRange draws the filled part
const MAX_POINTS = 240;
const position = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3);
position.setUsage(THREE.DynamicDrawUsage);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', position);
geometry.setDrawRange(0, 0);
const trail = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x66ddff }));
trail.name = 'trail';
trail.frustumCulled = false; // three computes the bounding sphere once, from the first points
scene.add(trail);

let count = 0;
function addPoint(t) {
  if (count === MAX_POINTS) return; // full: the buffer never grows
  position.setXYZ(count, -3 + t * 0.025, Math.sin(t * 0.1), 0);
  count += 1;
  geometry.setDrawRange(0, count);
  position.needsUpdate = true;
}
for (let t = 0; t < 60; t++) addPoint(t);

let t = 60;
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  addPoint(t++);
  renderer.render(scene, camera);
});
</script>
</body></html>
```

Sixty drawn frames later the trail has grown with no error, and the array still has its first length:

```text
interact {"steps":[{"wait":60,"draw":true}]}

{"after":null,"changed":{}}

look {}

On screen (1):
trail 0.08% [318, 292, 637, 507] 3 × 2 units
Never visible: none

eval {"code":"const g = find(\"trail\").geometry; return [g.drawRange.count, g.attributes.position.array.length]"}

[120,720]
```

The draw range holds 120 points of the 240 the array has room for. When the size cannot be known in advance, allocate a larger buffer as the trail outgrows it: call `dispose()` on the old geometry, which frees its GPU buffers, and assign a new `BufferGeometry` with the larger array to the line. Doing that by doubling keeps it rare. Swapping in a new `BufferAttribute` with `setAttribute` also avoids the error, since three makes a new buffer for a new attribute object, but three never deletes the old buffer itself: `dispose()` frees the attributes the geometry holds at that moment, so the replaced one is left for the browser to collect.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Dynamic BufferGeometry disappears when re-setting the position buffer attribute](https://discourse.threejs.org/t/dynamic-buffergeometry-disappears-when-re-setting-the-position-buffer-attribute/49274) (discourse.threejs.org, 740 views, 4 posts)
