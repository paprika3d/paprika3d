---
title: three.js Texture has been resized from: the image is over the GPU's maxTextureSize
phrase: texture has been resized from
description: What three.js means by "THREE.WebGLRenderer: Texture has been resized from (WxH) to (WxH).", the resize in WebGLTextures.js that runs when an image is larger than the GPU's maxTextureSize, why it shows up on phones and with large GLB textures, and how to see it through the paprika3d plugin's eval reply.
meta: three.js "THREE.WebGLRenderer: Texture has been resized from (12000x750) to (8192x512)": what triggers it and how to fix it.
intent: error-texture-resized
message: THREE.WebGLRenderer: Texture has been resized from (12000x750) to (8192x512).
queries:
  - "THREE.WebGLRenderer: Texture has been resized from"
  - "Is my .glb file too big for Three js?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WebGLRenderer: Texture has been resized from (12000x750) to (8192x512).

three.js prints this warning when an image is wider or taller than the largest texture the GPU accepts. Rather than fail, three draws the image onto a smaller canvas, keeping its proportions, and uploads that copy. The texture still shows, with less detail than the file has. The numbers in the message are the image's size and the size the GPU got, and the second pair depends on the device: the same page can warn on a phone and stay silent on a desktop.

## Where three.js prints it

`resizeImage()` in `src/renderers/webgl/WebGLTextures.js` (three r186) runs at every upload of a 2D texture, with `capabilities.maxTextureSize` as the limit. It works out a scale from the longer side and, for image types it can draw, resizes on a 2D canvas:

```js
if ( dimensions.width > maxSize || dimensions.height > maxSize ) {

	scale = maxSize / Math.max( dimensions.width, dimensions.height );

}

// only perform resize if necessary

if ( scale < 1 ) {

	// only perform resize for certain image types

	if ( ( typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement ) ||
		( typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement ) ||
		( typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap ) ||
		( typeof VideoFrame !== 'undefined' && image instanceof VideoFrame ) ) {

		const width = Math.floor( scale * dimensions.width );
		const height = Math.floor( scale * dimensions.height );
```

After `context.drawImage( image, 0, 0, width, height )` it calls `warn( 'WebGLRenderer: Texture has been resized from (' + dimensions.width + 'x' + dimensions.height + ') to (' + width + 'x' + height + ').' )`, which `src/utils.js` prints with the `THREE.` prefix through `console.warn`. A `DataTexture` cannot be drawn on a canvas, so an oversized one gets `Image in DataTexture is too big` instead and is uploaded as it is. Cube maps go through the same function with `maxCubemapSize`. In r186 the size limit is the reason for a resize: an image whose sides are not powers of two is uploaded at its own size.

## Why the image is too big

- **Textures exported at the size of the source art.** A GLB from a scan or a sculpting tool often carries 8K or 16K maps. GLTFLoader hands them to the renderer as decoded images, and a GPU with a smaller limit gets the resized copy. This is the story of the thread about a GLB that looked fine on a computer and not on a phone.
- **Panoramas and long strips.** An equirectangular sky or a scrolling banner is wide by nature, so its width passes the limit before its area becomes large.
- **A canvas sized from the screen.** A canvas texture sized as a multiple of `innerWidth` times the device pixel ratio can pass the limit on a large or dense display.
- **Devices with lower limits.** Many desktop GPUs report 16384, while phones and software renderers often report 4096 or 8192. The host these replies come from reports 8192.

Besides the lost detail, the resize costs time and memory: the full image stays in JavaScript memory as the texture's `image`, and the canvas copy is drawn on the CPU each time the texture uploads.

## A page that reproduces it

A banner texture drawn on a canvas 12000 wide:

```js
const strip = document.createElement('canvas');
strip.width = 12000; strip.height = 750;
// ... a gradient is drawn on it ...
const tex = new THREE.CanvasTexture(strip);
tex.colorSpace = THREE.SRGBColorSpace;
const banner = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.25), new THREE.MeshBasicMaterial({ map: tex }));
banner.name = 'banner';
scene.add(banner);
```

paprika3d is a Claude Code plugin and MCP server: it opens the page in a headless Chrome of its own with the clock stopped at frame 0. The calls were made on 2026-10-28 with the stable build, without a GPU (SwiftShader); `<project>` stands for the run folder, and the replies keep the lines this page talks about, unchanged.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:37061/index.html in 0.5 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["banner"]}

eval {"code":"return [renderer.capabilities.maxTextureSize, find(\"banner\").material.map.image.width]"}

[8192,12000]
warn: THREE.WebGLRenderer: Texture has been resized from (12000x750) to (8192x512).
```

`open` has nothing to say: the texture uploads at the first frame, and the page is paused before it. The `eval` draws that first frame before running its code, as `look` would, and lists the warning printed during it. Its return value gives the two numbers behind the message: this GPU's limit, and the canvas the texture still holds at its full width.

The order of calls matters. Run with `look` first, the same page gave this:

```text
look {}

On screen (1):
banner 2.6% [309, 380, 970, 419] 4 × 0.25 units, across the view
Never visible: none

eval {"code":"renderer.render(scene, camera); return renderer.info.memory"}

{"geometries":1,"textures":1}
```

`look` drew the first frame, which did the resize, and its reply lists console errors but not warnings. Once uploaded, the texture is not resized again unless it is flagged for update, so the later `eval` had nothing to report. The banner looks the same in both cases, because at this size on screen the lost detail does not show.

## The fix

Keep every image within the limit before it reaches three: export model textures at the size they are seen at, split long panoramas, and size canvases from `renderer.capabilities.maxTextureSize` instead of a fixed number:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Banner</title>
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

// size the canvas to what this GPU takes, instead of letting three scale it down
const max = renderer.capabilities.maxTextureSize;
const width = Math.min(4096, max), height = width / 16;
const strip = document.createElement('canvas');
strip.width = width; strip.height = height;
const g = strip.getContext('2d');
const grad = g.createLinearGradient(0, 0, width, 0);
grad.addColorStop(0, '#3a6ea5'); grad.addColorStop(1, '#f2c14e');
g.fillStyle = grad; g.fillRect(0, 0, width, height);
const tex = new THREE.CanvasTexture(strip);
tex.colorSpace = THREE.SRGBColorSpace;

const banner = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.25), new THREE.MeshBasicMaterial({ map: tex }));
banner.name = 'banner';
scene.add(banner);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The fixed page's replies:

```text
open {"url":"fixed.html","cwd":"<project>"}

Opened http://127.0.0.1:36207/fixed.html in 1.0 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["banner"]}

eval {"code":"return renderer.info.memory"}

{"geometries":1,"textures":1}
```

There is no `warn:` line, and the banner covers the same part of the frame. For textures inside a GLB, `model_audit` lists each texture's size and format from the file, and its shrink option writes a copy with each texture capped at a size you choose, so the phone and the desktop get the same image.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Is my .glb file too big for Three js?](https://discourse.threejs.org/t/is-my-glb-file-too-big-for-three-js/51076) (discourse.threejs.org, 4,623 views, 26 posts)
- [THREE.WebGLRenderer: Texture has been resized from](https://discourse.threejs.org/t/three-webglrenderer-texture-has-been-resized-from/20058) (discourse.threejs.org, 2,650 views, 1 post)
