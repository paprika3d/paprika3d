---
title: three.js Texture marked for update but no image data found: give the texture an image first
phrase: texture marked for update but no image data found
description: What three.js means by "THREE.WebGLRenderer: Texture marked for update but no image data found.", the check in WebGLTextures.js that prints it on every frame, the code that sets needsUpdate on a texture with no image, and how the paprika3d plugin's eval reply catches the warning that look and observe leave out.
meta: How to fix three.js "THREE.WebGLRenderer: Texture marked for update but no image data found": what triggers it, the line that prints it, and the fix in code.
intent: error-texture-no-image-data
message: THREE.WebGLRenderer: Texture marked for update but no image data found.
queries:
  - "THREE.WebGLRenderer: Texture marked for update but no image data found."
  - "Texture marked for update but image is undefined?"
  - "WebGLRenderTarget: Null texture in shader texture Uniform"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WebGLRenderer: Texture marked for update but no image data found.

three.js prints this warning when a texture has been told to upload (`texture.needsUpdate = true`) while its `image` is still `null`. Nothing is sent to the GPU, the material samples an empty texture, and the warning comes back on every frame that draws the object until the texture gets an image. The usual cause is code that flags a texture before it has anything in it.

## Where three.js prints it

`setTexture2D()` in `src/renderers/webgl/WebGLTextures.js` (three r186) runs each time the renderer binds a 2D texture for a draw call. Setting `needsUpdate` raises `texture.version`; when that version is ahead of the one already uploaded, three looks at the image before uploading:

```js
if ( texture.isRenderTargetTexture === false && texture.isExternalTexture !== true && texture.version > 0 && textureProperties.__version !== texture.version ) {

	const image = texture.image;

	if ( image === null ) {

		warn( 'WebGLRenderer: Texture marked for update but no image data found.' );

	} else if ( image.complete === false ) {

		warn( 'WebGLRenderer: Texture marked for update but image is incomplete' );

	} else {

		uploadTexture( textureProperties, texture, slot );
		return;

	}
```

`warn()` is the logger in `src/utils.js`, which adds the `THREE.` prefix and calls `console.warn`. A `new THREE.Texture()` starts with `image` set to `null`, and `TextureLoader.load()` returns a texture whose image stays `null` until the file arrives. Because the uploaded version never catches up, the same check fails again on the next frame, so the console fills with one line per draw. Render target textures skip this check, and a texture whose `needsUpdate` was never set is skipped too: it draws empty without a word.

## Why the image is null

- **A placeholder texture flagged too early.** `new THREE.Texture()` created to be filled from a canvas, a video or a worker later, with `needsUpdate = true` written on the line after it instead of after the image is assigned.
- **needsUpdate on a texture that is still loading.** `loader.load(url).needsUpdate = true` flags the texture while its image is `null`; the warning repeats until the load ends, and forever if the URL fails.
- **An empty texture as a ShaderMaterial uniform.** `uniforms: { tMap: { value: new THREE.Texture() } }` used as a default, then marked for update before the real image or render target is put in its place.
- **The wrong texture object.** Code assigns the image to one texture and sets `needsUpdate` on a clone or on another variable that still holds no image.

## A page that reproduces it

The page makes a texture for a sign, meaning to draw its text on a canvas later, and flags it at once:

```js
const label = new THREE.Texture(); // filled in later from a canvas
label.needsUpdate = true;
const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshBasicMaterial({ map: label }));
sign.name = 'sign';
scene.add(sign);
```

paprika3d is a Claude Code plugin and MCP server that runs a three.js page in a headless Chrome it owns, on a paused clock. These calls were made on 2026-10-28 with the stable build on a machine with no GPU (SwiftShader); the run folder is shortened to `<project>` and each reply is cut to the lines discussed here, word for word.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:39371/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
{"three":"186","scenes":1,"entities":["sign"]}

look {}

Pixels: brightness 11%, colour saturation 24%, 11% near black, 0% blown out. Dark: a viewer sees little.
Hues: blue 89%, grey 11% of the frame; over the objects (11.4% of it): grey 100%.
Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
On screen (1):
sign 11% [383, 277, 896, 512] 3 × 1.5 units, across the view
Never visible: none

observe {}

{"entities":{"sign":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":2,"textures":0,"geometries":1,"programs":2},"scene":{"objects":1,"meshes":1,"lights":0,"cameras":0},"errors":[],"changed":null}}
```

The warning is in none of these replies. `open` reports three.js warnings printed while the page sets up, and this one has not happened yet: the page is paused before its first frame. `look` draws that frame, and its reply lists console errors but not warnings. `observe` shows the effect instead of the cause: the sign is drawn (`calls` 1) while `textures` is 0, so the map on it never reached the GPU, and `look` sees the sign as flat grey. The `Lighting` line counts the empty texture as a colour map with no colour space; it is right about the colour space, but the empty image is the bigger problem here.

An `eval` that renders makes the warning visible, because its reply lists what the page logged during the code:

```text
eval {"code":"for (let i = 0; i < 3; i++) renderer.render(scene, camera); return renderer.info.memory"}

{"geometries":1,"textures":0}
warn: THREE.WebGLRenderer: Texture marked for update but no image data found. (×4)
```

Three renders in the code and the frame the harness drew before it give four copies of the line, one per draw, and `renderer.info.memory` still holds no texture.

## The fix

Set `needsUpdate` after the texture has an image, never before. For a canvas, draw it first and wrap it in a `CanvasTexture`, which flags itself once; for a texture filled later, assign `texture.image` and set `needsUpdate` in the same place:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Sign</title>
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

// draw the canvas first, then make the texture from it
const art = document.createElement('canvas');
art.width = 512; art.height = 256;
const g = art.getContext('2d');
g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 512, 256);
g.fillStyle = '#b8322a'; g.font = 'bold 120px sans-serif';
g.textAlign = 'center'; g.textBaseline = 'middle';
g.fillText('OPEN', 256, 132);
const label = new THREE.CanvasTexture(art); // has an image, so its upload succeeds
label.colorSpace = THREE.SRGBColorSpace;

const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshBasicMaterial({ map: label }));
sign.name = 'sign';
scene.add(sign);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The replies for the fixed page, captured the same way:

```text
eval {"code":"return renderer.info.memory"}

{"geometries":1,"textures":1}

look {}

Hues: blue 89%, grey 10% of the frame; over the objects (11.4% of it): grey 90%, red 11%.
On screen (1):
sign 11% [383, 277, 896, 512] 3 × 1.5 units, across the view
```

The `eval` reply has no `warn:` line and the texture is in GPU memory, and `look` now finds red over the sign, the colour of the text drawn on the canvas. For a texture from `TextureLoader`, leave `needsUpdate` alone: the loader sets it when the image has arrived, and the `onLoad` callback is the place for any code that has to wait for it. If a shader uniform needs a value before its real texture exists, a 1 by 1 `DataTexture` with one pixel of data is a placeholder that uploads cleanly.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [A way to invert color of a specific channel](https://discourse.threejs.org/t/a-way-to-invert-color-of-a-specific-channel/31335) (discourse.threejs.org, 3,994 views, 8 posts)
- [Can't resolve error "Texture marked for update but image is incomplete"](https://discourse.threejs.org/t/cant-resolve-error-texture-marked-for-update-but-image-is-incomplete/38493) (discourse.threejs.org, 3,369 views, 3 posts)
- [WebGLRenderTarget: Null texture in shader texture Uniform](https://discourse.threejs.org/t/webglrendertarget-null-texture-in-shader-texture-uniform/15378) (discourse.threejs.org, 2,339 views, 6 posts)
- [Texture marked for update but image is undefined?](https://discourse.threejs.org/t/texture-marked-for-update-but-image-is-undefined/42243) (discourse.threejs.org, 1,596 views, 2 posts)
