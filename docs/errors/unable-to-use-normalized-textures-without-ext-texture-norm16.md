---
title: three.js Unable to use normalized textures without EXT_texture_norm16 extension: 16-bit heights that read as zero
phrase: unable to use normalized textures without ext_texture_norm16 extension
description: Why three.js prints "THREE.WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension" for a 16-bit texture with normalized set, the internal format check in WebGLTextures.js, what the texture does on a GPU without the extension, the half float and float alternatives, and the paprika3d eval reply that shows the warning.
meta: three.js "THREE.WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension": what triggers it and how to fix it.
intent: error-norm16-extension
message: THREE.WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension
queries:
  - "THREE.WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"
  - "Data3DTexture where each pixel is 16 bits precision"
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# THREE.WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension

three.js prints this warning when a texture asks for a 16-bit normalized format (R16, RG16 or RGBA16, where 0 to 65535 is read as 0 to 1) on a browser and GPU that do not offer the `EXT_texture_norm16` WebGL extension. The format is not part of core WebGL 2, so without the extension three has no internal format to give the texture, and what samples from it reads zeros. A heightmap stays flat, a data texture reads black. The page works on machines that have the extension and breaks on those that do not, which makes it look like a device bug.

## Where three.js prints it

`getInternalFormat()` in `src/renderers/webgl/WebGLTextures.js` (three r186) picks the WebGL internal format from the texture's `format`, `type` and `normalized` flag. It asks for the extension first and warns when it is missing:

```js
let ext_texture_norm16;

if ( normalized ) {

	ext_texture_norm16 = extensions.get( 'EXT_texture_norm16' );

	if ( ! ext_texture_norm16 ) {

		warn( 'WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension' );

	}

}

let internalFormat = glFormat;

if ( glFormat === _gl.RED ) {

	if ( glType === _gl.FLOAT ) internalFormat = _gl.R32F;
	if ( glType === _gl.HALF_FLOAT ) internalFormat = _gl.R16F;
	if ( glType === _gl.UNSIGNED_BYTE ) internalFormat = _gl.R8;
	if ( glType === _gl.UNSIGNED_SHORT && ext_texture_norm16 ) internalFormat = ext_texture_norm16.R16_EXT;
```

With no extension, a `RedFormat` and `UnsignedShortType` texture keeps the unsized `RED` as its internal format, which WebGL 2 does not accept for 16-bit data, so the upload fails and the texture stays empty. The same holds for `RGFormat` and `RGBAFormat`. `extensions.get()` in `WebGLExtensions.js` prints its own line first, `EXT_texture_norm16 extension not supported.`, so the two warnings arrive as a pair. three calls this function when it first uploads the texture, which is the first frame that draws something using it.

## Why the texture asks for it

- **A DataTexture of 16-bit values with normalized set.** A heightmap or a scientific dataset in a `Uint16Array`, with `texture.normalized = true` so the shader reads 0 to 1 without dividing.
- **A 16-bit KTX2 file.** `KTX2Loader` sets `normalized` itself for the UNORM and SNORM 16-bit formats (`texture.normalized = NORMALIZED_VK_FORMATS.has( vkFormat )`), so a KTX2 heightmap or normal map saved as R16 or RGBA16 asks for the extension without any line in your code saying so.
- **A Data3DTexture for volume rendering.** Medical and scientific volumes are often 16-bit, and the thread about 16 bits of precision per pixel comes from that case.

Support differs by browser, GPU and driver, so testing on one desktop says little about the rest. The machine these replies come from (Chrome with SwiftShader) does not offer it, which is why the page below shows the problem.

## A page that reproduces it

A terrain displaced by a 16-bit heightmap:

```js
const heights = new Uint16Array(size * size); // 16-bit heights, as a PNG16 or RAW heightmap holds them
// ... heights filled with values from 0 to 65535 ...
const hmap = new THREE.DataTexture(heights, size, size, THREE.RedFormat, THREE.UnsignedShortType);
hmap.normalized = true; // read 0..65535 as 0..1: the R16 internal format
hmap.needsUpdate = true;
const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4, 63, 63).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x7f9c5a, displacementMap: hmap, displacementScale: 0.8 })
);
```

paprika3d is a Claude Code plugin and MCP server that drives a three.js page in a headless Chrome of its own, paused on a fixed clock. These are the stable build's replies from 2026-10-28, on a host without a GPU; the run folder is written `<project>` and lines unrelated to this page were dropped, the rest kept as printed.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:35751/index.html in 0.6 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["terrain"]}

eval {"code":"return renderer.extensions.has(\"EXT_texture_norm16\")"}

false
warn: THREE.WebGLRenderer: EXT_texture_norm16 extension not supported.
warn: THREE.WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension

look {}

Hues: blue 84%, green 16% of the frame; over the objects (16.2% of it): green 100%.
Surface: "terrain" covers 16% with almost no detail (0 of 255): it reads as flat colour. Unless the user asked for flat colour, add texture, normal detail or lighting variation.
On screen (1):
terrain 16% [122, 331, 1157, 548] 4 × 4 units
```

`open` stops before the first frame, so the upload, and both warnings, have not happened yet. The `eval` steps to the first frame before it runs, and its reply carries the two lines printed during that frame, along with the answer to the question it asked: this GPU has no `EXT_texture_norm16`. Calling `look` first would have drawn that frame without listing them, since `look` reports console errors and not warnings.

`look` shows the result: the terrain is a flat sheet of one colour, which its `Surface` line reports. Note what it measures, though: `4 × 4 units` comes from the geometry's vertices, and the displacement happens in the vertex shader, so the same size is reported with or without heights.

## The fix

Store the values in a type that WebGL 2 samples without an extension. `HalfFloatType` (R16F) can be filtered everywhere WebGL 2 runs and takes half the memory of floats; it holds about 11 bits of precision, which is enough for most terrain. When every bit of the 16 is needed, `FloatType` (R32F) keeps them all, with `NearestFilter` unless the device also offers `OES_texture_float_linear`. Or ask first with `renderer.extensions.has('EXT_texture_norm16')` and keep the 16-bit path for devices that have it:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Terrain</title>
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
camera.position.set(0, 1.5, 5);
camera.lookAt(0, 0, 0);

// the same 16-bit heights, stored as half floats (R16F): WebGL 2 samples and filters them without an extension
const size = 64;
const heights = new Uint16Array(size * size);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
  heights[y * size + x] = Math.round(65535 * (0.5 + 0.25 * Math.sin(x * 0.2) + 0.25 * Math.cos(y * 0.15)));
const half = new Uint16Array(heights.length);
for (let i = 0; i < heights.length; i++) half[i] = THREE.DataUtils.toHalfFloat(heights[i] / 65535);
const hmap = new THREE.DataTexture(half, size, size, THREE.RedFormat, THREE.HalfFloatType);
hmap.magFilter = THREE.LinearFilter;
hmap.needsUpdate = true;

const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4, 63, 63).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x7f9c5a, displacementMap: hmap, displacementScale: 0.8 })
);
terrain.name = 'terrain';
scene.add(terrain, new THREE.HemisphereLight(0xdde8ff, 0x3a3020, 2));

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

With half floats, the warning pair is gone and the terrain has its hills:

```text
eval {"code":"return renderer.info.memory"}

{"geometries":1,"textures":2}

look {}

Hues: blue 90%, green 10% of the frame; over the objects (16.2% of it): blue 69%, green 31%.
On screen (1):
terrain 16% [122, 331, 1157, 548] 4 × 4 units
```

The `Surface` line no longer appears. The blue that `look` now counts over the terrain is the background, seen around the hills inside the part of the frame the terrain spans. For a KTX2 file, the fix is in the file: re-encode the 16-bit channel as a float format, or keep the KTX2 for devices with the extension and a float version for the rest.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Banding effect with transmission property](https://discourse.threejs.org/t/banding-effect-with-transmission-property/38797) (discourse.threejs.org, 1,502 views, 11 posts)
- [Data3DTexture where each pixel is 16 bits precision](https://discourse.threejs.org/t/data3dtexture-where-each-pixel-is-16-bits-precision/49321) (discourse.threejs.org, 867 views, 8 posts)
