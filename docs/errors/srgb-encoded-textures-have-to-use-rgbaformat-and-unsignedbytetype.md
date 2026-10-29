---
title: three.js sRGB encoded textures have to use RGBAFormat and UnsignedByteType: fix the colour space or the data type
phrase: srgb encoded textures have to use rgbaformat and unsignedbytetype
description: What three.js means by "THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.", the colour space check in WebGLTextures.js, why sRGB on float, half float or RGB data draws too light, the two ways to fix it, and the paprika3d eval reply that shows the warning and the pixel it changes.
meta: three.js "THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType": what triggers it and how to fix it.
intent: error-srgb-rgbaformat-unsignedbyte
message: THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.
queries:
  - "THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType"
  - "Creating a CubeTexture from 6 CompressedTextures doesn't work after r136"
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.

three.js prints this warning when a texture's `colorSpace` is `SRGBColorSpace` but its data is not 8-bit RGBA: a float or half float texture, a 16-bit one, or one in `RGBFormat` or `RedFormat`. WebGL 2 decodes sRGB in the GPU for one uncompressed format, `SRGB8_ALPHA8`, so for any other format three cannot honour the colour space. It uploads the data anyway and the GPU reads it as linear. If the numbers were sRGB colours, the texture draws lighter and greyer than intended; if they were linear values, the picture is right and the `colorSpace` setting is what is wrong.

## Where three.js prints it

`verifyColorSpace()` in `src/renderers/webgl/WebGLTextures.js` (three r186) runs on each upload of a 2D texture and on each face of a cube texture, before the data goes to the GPU:

```js
function verifyColorSpace( texture, image ) {

	const colorSpace = texture.colorSpace;
	const format = texture.format;
	const type = texture.type;

	if ( texture.isCompressedTexture === true || texture.isVideoTexture === true ) return image;

	if ( colorSpace !== LinearSRGBColorSpace && colorSpace !== NoColorSpace ) {

		// sRGB

		if ( ColorManagement.getTransfer( colorSpace ) === SRGBTransfer ) {

			// in WebGL 2 uncompressed textures can only be sRGB encoded if they have the RGBA8 format

			if ( format !== RGBAFormat || type !== UnsignedByteType ) {

				warn( 'WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.' );

			}
```

`warn()` in `src/utils.js` prints it with `THREE.` in front through `console.warn`. The internal format chosen later in `getInternalFormat()` shows why it matters: for `RGBAFormat`, `UnsignedByteType` becomes `SRGB8_ALPHA8` when the transfer is sRGB, while `FloatType` becomes `RGBA32F` and `HalfFloatType` becomes `RGBA16F` whatever the colour space says. Compressed and video textures are skipped by the check, since their formats carry sRGB in another way. The warning appears once per upload, so at the first frame that uses the texture and again after each `needsUpdate`.

## Why the texture is sRGB with the wrong format

- **A loop that tags every texture sRGB.** Code that walks a scene and sets `colorSpace = SRGBColorSpace` on every map also reaches environment maps, HDR files and data textures that should stay linear.
- **An HDR or EXR texture set to sRGB by hand.** `HDRLoader` (formerly `RGBELoader`) and `EXRLoader` return half float or float data in `LinearSRGBColorSpace`; changing it to sRGB, often by following advice meant for JPEG and PNG maps, triggers the warning.
- **A DataTexture of floats holding colours.** Colours computed in JavaScript and stored in a `Float32Array` with sRGB set, as in the page below.
- **RGB or single-channel data.** A texture in `RGBFormat` or `RedFormat` with 8-bit data has the right type and the wrong format; WebGL 2 has no sRGB variant of those.

## A page that reproduces it

An orange swatch whose sRGB colour (0.9, 0.4, 0.1) is stored as floats with the sRGB colour space:

```js
const data = new Float32Array(size * size * 4);
for (let i = 0; i < size * size; i++) data.set([0.9, 0.4, 0.1, 1], i * 4);
const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
tex.colorSpace = THREE.SRGBColorSpace; // sRGB on float data
tex.needsUpdate = true;
const swatch = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex }));
swatch.name = 'swatch';
scene.add(swatch);
```

paprika3d is a Claude Code plugin and MCP server that runs three.js pages in its own headless Chrome, with time held at frame 0 until a tool moves it. The calls below used the stable build on 2026-10-28, on a computer with no GPU; `<project>` replaces the run folder, and the replies are trimmed to the lines discussed, never reworded.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:46173/index.html in 0.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["swatch"]}

eval {"code":"renderer.render(scene, camera); const gl = renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(640, 400, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px]"}

[243,170,89,255]
warn: THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.
```

The upload happens at the first frame, after `open` has replied, so `open` has nothing to list. The `eval` draws that frame, then renders once more and reads the pixel at the centre of the canvas, and its reply carries the warning printed during the upload. The pixel is the cost of the warning in numbers: the sRGB colour 0.9, 0.4, 0.1 should come out near 230, 102, 26 out of 255, and it came out as 243, 170, 89, because the GPU took the sRGB numbers as linear and the renderer then encoded them to sRGB a second time.

`look` reports the swatch as `orange 100%` with or without the fix, since both shades are orange, and its reply lists console errors and not warnings. If `look` runs before any `eval`, it draws the frame that uploads the texture, and the warning is printed during a call whose reply does not include it; a later `eval` will not see it either, as the texture is not uploaded again.

## The fix

Decide what the numbers are. If they are sRGB colours, as here, store them as 8-bit RGBA and keep `SRGBColorSpace`, so the GPU decodes them. If they are linear values, as in HDR and EXR files, normal maps and computed data, set `colorSpace` to `THREE.LinearSRGBColorSpace` (or leave the default) and nothing else changes:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Swatch</title>
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

// sRGB colour values belong in 8-bit RGBA, which the GPU decodes from sRGB as it samples
const size = 32;
const data = new Uint8Array(size * size * 4);
for (let i = 0; i < size * size; i++) data.set([230, 102, 26, 255], i * 4); // 0.9, 0.4, 0.1 times 255
const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
tex.colorSpace = THREE.SRGBColorSpace;
tex.needsUpdate = true;

const swatch = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex }));
swatch.name = 'swatch';
scene.add(swatch);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

With 8-bit data, the same reading comes back with the intended colour and no warning:

```text
eval {"code":"renderer.render(scene, camera); const gl = renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(640, 400, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px]"}

[230,102,26,255]
```

For a scene-wide loop, tag the textures that hold colour (`map`, `emissiveMap`, `specularColorMap`, `sheenColorMap`) and leave every other map, and every texture whose `type` is not `UnsignedByteType`, as it is.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType](https://discourse.threejs.org/t/three-webgltextures-srgb-encoded-textures-have-to-use-rgbaformat-and-unsignedbytetype/38856) (discourse.threejs.org, 2,202 views, 1 post)
- [Creating a CubeTexture from 6 CompressedTextures doesn't work after r136](https://github.com/mrdoob/three.js/issues/24065) (GitHub, 11 comments)
