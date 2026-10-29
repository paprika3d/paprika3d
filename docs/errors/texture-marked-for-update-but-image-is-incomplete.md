---
title: three.js Texture marked for update but image is incomplete: wait for the image to load
phrase: texture marked for update but image is incomplete
description: Why three.js prints "THREE.WebGLRenderer: Texture marked for update but image is incomplete" when a frame is drawn before an HTMLImageElement has finished loading or decoding, the check in WebGLTextures.js behind it, how to wait for the image, and what the paprika3d plugin's open, eval and look replies show of it.
meta: How to fix three.js "THREE.WebGLRenderer: Texture marked for update but image is incomplete": what triggers it, the line that prints it, and the fix in code.
intent: error-texture-image-incomplete
message: THREE.WebGLRenderer: Texture marked for update but image is incomplete
queries:
  - "THREE.WebGLRenderer: Texture marked for update but image is incomplete"
  - "Threejs, why “Texture marked for update but image is incomplete”?"
  - "A-Frame scene initializes before assets ready when dynamically adding `a-asset-item` elements"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WebGLRenderer: Texture marked for update but image is incomplete

three.js prints this warning when a texture is flagged for upload while its image is an `<img>` that the browser has not finished loading. The renderer skips the upload for that draw, so the object is drawn with no map, and tries again on the next frame. When the image arrives the texture uploads and the warning stops, so in many pages it is a blank frame or two at startup. When the image never completes, the warning repeats for as long as the page runs.

## Where three.js prints it

`setTexture2D()` in `src/renderers/webgl/WebGLTextures.js` (three r186) checks the image of any texture whose `version` is ahead of the uploaded one, which is what `needsUpdate = true` does. An `HTMLImageElement` has a `complete` property that is `false` while it is loading:

```js
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

`warn()` in `src/utils.js` puts `THREE.` in front and calls `console.warn`. Canvases, `ImageBitmap`s and typed arrays have no `complete` property, so the check is about `<img>` elements: one made with `new Image()`, one taken from the page's HTML, or one an asset system such as A-Frame's `<a-assets>` hands over before it has loaded. Since nothing records the upload, three checks again at every draw, and uploads the image at the first frame after `complete` turns `true`.

## Why the image is still loading

- **needsUpdate set right after img.src.** `img.src = url` starts a load (a data URL or a `canvas.toDataURL()` result is decoded later as well), so the texture made on the next line holds an image that is not complete yet.
- **A frame drawn during setup.** A first `renderer.render()` called at the end of the setup code, before any `await`, runs before the browser has had a chance to load anything.
- **An asset system that starts the scene early.** The A-Frame threads describe assets added to `<a-assets>` at run time, after the scene had already started, so the material gets an image that is still on its way.
- **An image that fails.** A wrong path keeps the texture empty; the browser's console shows the failed request for the file next to three's line.

## A page that reproduces it

The page draws a poster on a canvas, turns it into a data URL for an `<img>`, flags the texture at once and draws a first frame during setup:

```js
const img = new Image();
img.src = art.toDataURL(); // decoding starts now and finishes later
const poster = new THREE.Texture(img);
poster.colorSpace = THREE.SRGBColorSpace;
poster.needsUpdate = true;
const frame = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: poster }));
frame.name = 'frame';
scene.add(frame);
renderer.render(scene, camera); // a first frame drawn during setup, before the image has decoded
```

paprika3d is a Claude Code plugin and MCP server that loads a three.js page into its own headless Chrome and holds the clock still. The replies below are from the stable build, recorded on 2026-10-28 on a host with no GPU; the project folder reads `<project>`, and lines that do not matter here were cut without changing the rest.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:43891/index.html in 1.0 s, paused at frame 0.
three.js warned: THREE.WebGLRenderer: Texture marked for update but image is incomplete
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["frame"]}

eval {"code":"const map = find(\"frame\").material.map; return { complete: map.image.complete, uploaded: renderer.info.memory.textures }"}

{"complete":true,"uploaded":0}

look {}

Hues: blue 95% of the frame; over the objects (10.2% of it): blue 56%, orange 44%.
On screen (1):
frame 10% [466, 233, 813, 548] 2 × 2 units
Never visible: none
```

This warning fires while the page is still setting up, so `open` lists it under `three.js warned:`. The `eval` shows the state after that: by the time the page was paused the image had finished (`complete` is `true`), yet `renderer.info.memory` still counts no texture, because nothing has been drawn since the failed attempt. The next frame, drawn by `look`, uploads it, and the poster's blue and orange are on screen. Had the setup render not been there, the same race would have happened at the page's first animation frame, and `open` would not have seen it; `look` does not list warnings, so the way to see one at the first frame is an `eval` called before `look`.

What the replies do not tell is how many frames a viewer saw with an empty poster. On a slow network that is every frame until the file arrives, and the harness, which serves the page from the local disk, does not slow the load down unless asked to.

## The fix

Make the texture from an image that has loaded. `TextureLoader` does this for you: it sets `needsUpdate` itself in its load callback, and `loadAsync` returns a promise to `await`. For an `<img>` you already hold, `await img.decode()` before flagging the texture does the same:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Poster</title>
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

const art = document.createElement('canvas');
art.width = art.height = 256;
const g = art.getContext('2d');
g.fillStyle = '#e8a33d'; g.fillRect(0, 0, 256, 256);
g.fillStyle = '#2b4c7e'; g.fillRect(32, 32, 192, 192);

// TextureLoader sets needsUpdate itself, once the image has loaded
const poster = await new THREE.TextureLoader().loadAsync(art.toDataURL());
poster.colorSpace = THREE.SRGBColorSpace;

const frame = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: poster }));
frame.name = 'frame';
scene.add(frame);
renderer.render(scene, camera); // the image is complete by now

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

With the fixed page, the replies have no warning at any step:

```text
open {"url":"fixed.html","cwd":"<project>"}

Opened http://127.0.0.1:46165/fixed.html in 1.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["frame"]}

eval {"code":"return renderer.info.memory"}

{"geometries":1,"textures":1}
```

The texture is in GPU memory before the first look, and `look` reports the same blue and orange split as before. In A-Frame, the equivalent is to wait for the asset's `loaded` event, or to declare the asset in `<a-assets>` before the scene starts, so the scene does not start with it half loaded.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Threejs, why “Texture marked for update but image is incomplete”?](https://stackoverflow.com/questions/44029127/threejs-why-texture-marked-for-update-but-image-is-incomplete) (Stack Overflow, 4,948 views, 1 answer)
- [A-Frame scene initializes before assets ready when dynamically adding `a-asset-item` elements](https://stackoverflow.com/questions/64841550/a-frame-scene-initializes-before-assets-ready-when-dynamically-adding-a-asset-i) (Stack Overflow, 1,867 views, 2 answers)
- [Loading images with aframe](https://stackoverflow.com/questions/46822641/loading-images-with-aframe) (Stack Overflow, 1,809 views, 1 answer)
- [A-Frame 1.4.0 not showing the VR button on iOS](https://stackoverflow.com/questions/75690396/a-frame-1-4-0-not-showing-the-vr-button-on-ios) (Stack Overflow, 670 views, 1 answer)
- [Texture SubImage Interface](https://github.com/mrdoob/three.js/issues/17162) (GitHub, 12 comments)
