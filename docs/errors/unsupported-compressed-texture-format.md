---
title: three.js Attempt to load unsupported compressed texture format in .uploadTexture(): the GPU lacks the format
phrase: attempt to load unsupported compressed texture format
description: Why three.js prints "THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()" when a DDS, PVR or KTX2 texture is in a GPU format the device does not have, the check in WebGLTextures.js, how KTX2Loader and a fallback avoid it, and the paprika3d eval reply that shows it.
meta: three.js "THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()": what triggers it and how to fix it.
intent: error-unsupported-compressed-texture
message: THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()
queries:
  - "THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"
  - "ThreeJS KTX2Loader Attempt to load unsupported compressed texture format in .uploadTexture()"
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()

three.js prints this warning when a `CompressedTexture` holds data in a GPU compression format that the browser's WebGL context does not offer. Compressed formats are not universal: each one is a WebGL extension, and which extensions a device has depends on its GPU. three cannot convert the blocks into something else, so it skips the upload and the texture stays empty. A model that looks right on a laptop can show blank or black materials on a phone, and the other way round.

## Where three.js prints it

`uploadTexture()` in `src/renderers/webgl/WebGLTextures.js` (three r186) first converts the texture's `format` to a WebGL constant with `utils.convert()`. For a compressed format, `WebGLUtils.js` asks for the extension that defines it and returns `null` when there is none, as in its PVRTC branch:

```js
if ( p === RGB_PVRTC_4BPPV1_Format || p === RGB_PVRTC_2BPPV1_Format || p === RGBA_PVRTC_4BPPV1_Format || p === RGBA_PVRTC_2BPPV1_Format ) {

	extension = extensions.get( 'WEBGL_compressed_texture_pvrtc' );

	if ( extension !== null ) {

		if ( p === RGB_PVRTC_4BPPV1_Format ) return extension.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;
```

Then, for each mipmap of a compressed 2D texture, the upload goes ahead when there is a format to give the GPU, and warns when there is not:

```js
if ( texture.format !== RGBAFormat ) {

	if ( glFormat !== null ) {

		if ( useTexStorage ) {

			if ( dataReady ) {

				state.compressedTexSubImage2D( _gl.TEXTURE_2D, i, 0, 0, mipmap.width, mipmap.height, glFormat, mipmap.data );

			}

		} else {

			state.compressedTexImage2D( _gl.TEXTURE_2D, i, glInternalFormat, mipmap.width, mipmap.height, 0, mipmap.data );

		}

	} else {

		warn( 'WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()' );

	}
```

The same line is printed from the array texture branch of `uploadTexture()`, and a cube map prints it with `.setTextureCube()` at the end. `extensions.get()` prints `WEBGL_compressed_texture_pvrtc extension not supported.` (or the name of whichever extension is missing) once before it, which is the line that names the format. All of this happens at upload, the first frame that draws the texture.

## Why the format is not supported

- **A file compressed for one platform.** DDS files hold S3TC (BC1 to BC3) or BC7 blocks, which desktop GPUs read and many phones do not; PVR files hold PVRTC, which older iPhones and iPads read and most desktops do not; ETC2 and ASTC are common on phones and missing on many desktop GPUs.
- **A KTX2 file that is not Basis.** `KTX2Loader` transcodes Basis Universal files (ETC1S or UASTC) into a format the device has, chosen by `detectSupport( renderer )`. A KTX2 written directly in a GPU format, such as ASTC or BC7 without Basis, is passed through as it is (`createRawTexture()` in `KTX2Loader.js`), and on a device without that format it prints this warning.
- **A hand-built CompressedTexture.** Data from a custom pipeline or a server, wrapped in `new THREE.CompressedTexture(...)` with a format constant the target devices do not share.

## A page that reproduces it

A crate with a PVRTC texture, a format the GPU on this host does not offer:

```js
const blocks = new Uint8Array(w * h / 2); // PVRTC 4 bits per pixel
const tex = new THREE.CompressedTexture([{ data: blocks, width: w, height: h }], w, h, THREE.RGB_PVRTC_4BPPV1_Format);
tex.needsUpdate = true;
const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
crate.name = 'crate';
scene.add(crate);
```

paprika3d is a Claude Code plugin and MCP server whose tools open a three.js page in a private headless Chrome, frozen at frame 0. These replies are the stable build's, from 2026-10-28, on a host with SwiftShader in place of a GPU; the run folder appears as `<project>`, and the lines left out are the ones this page does not need.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:39757/index.html in 0.7 s, paused at frame 0.
Page text outside the canvas: none
Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
{"three":"186","scenes":1,"entities":["crate"]}

eval {"code":"return renderer.extensions.has(\"WEBGL_compressed_texture_pvrtc\")"}

false
warn: THREE.WebGLRenderer: WEBGL_compressed_texture_pvrtc extension not supported.
warn: THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()

look {}

Hues: blue 91%, grey 9% of the frame; over the objects (8.6% of it): grey 100%.
Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
On screen (1):
crate 8.6% [490, 260, 789, 569]
```

`open` replies before the first frame, so the upload has not been tried and neither line has been printed. `eval` draws the first frame before running its code, lists the two warnings from that frame, and answers whether the extension exists: it does not. Had `look` been called first instead, it would have drawn that frame and listed neither line, since its reply carries console errors and not warnings, and a texture that failed once is not tried again until it is flagged for update.

`look` shows the crate as flat grey, the colour of a material whose map holds nothing. Its `Lighting` line is about the texture's colour space, a separate point that would matter once the texture uploads.

## The fix

Choose the format per device instead of shipping one. For Basis Universal KTX2 files, call `ktx2Loader.detectSupport( renderer )` once and the loader picks a supported target for every file. For files already in a GPU format, ship one per family (BC for desktops, ASTC or ETC2 for phones) and choose with `renderer.extensions.has(...)`, keeping an uncompressed fallback:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crate</title>
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

// ask the GPU before using a compressed format, and keep an uncompressed fallback
function crateTexture() {
  if (renderer.extensions.has('WEBGL_compressed_texture_pvrtc')) {
    const blocks = new Uint8Array(16 * 16 / 2); // the real PVRTC data would go here
    return new THREE.CompressedTexture([{ data: blocks, width: 16, height: 16 }], 16, 16, THREE.RGB_PVRTC_4BPPV1_Format);
  }
  const px = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) {
    const plank = ((i >> 2) & 1) ? [176, 122, 66, 255] : [140, 94, 48, 255];
    px.set(plank, i * 4);
  }
  const tex = new THREE.DataTexture(px, 16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const tex = crateTexture();
tex.needsUpdate = true;

const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
crate.rotation.set(0.4, 0.6, 0);
crate.name = 'crate';
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

On this host, the fixed page takes the fallback, and the warning pair is gone:

```text
eval {"code":"return renderer.info.memory"}

{"geometries":1,"textures":1}

look {}

Hues: blue 90%, orange 10% of the frame; over the objects (10.2% of it): orange 100%.
On screen (1):
crate 10% [457, 208, 834, 616]
```

The crate now shows its plank colours, and the `Lighting` line is gone because the fallback is tagged sRGB. For a GLB with KTX2 textures, `model_audit` reports each texture's size and format and whether the file uses KTX2, read from the file, which tells you which ones to re-encode as Basis.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [ThreeJS KTX2Loader "Attempt to load unsupported compressed texture format in .uploadTexture()"](https://stackoverflow.com/questions/69683811/threejs-ktx2loader-attempt-to-load-unsupported-compressed-texture-format-in-up) (Stack Overflow, 879 views, 1 answer)
