---
title: three.js Property .outputEncoding has been removed? Use outputColorSpace and colorSpace
phrase: outputencoding has been removed
description: What the three.js warning "Property .outputEncoding has been removed. Use .outputColorSpace instead." meant in r152 to r161, why r162 and later print nothing for the same line while a texture's colours go wrong, the old to new mapping from three's own setters, and what the paprika3d plugin's open and look replies show on r160 and r186.
meta: three.js "Property .outputEncoding has been removed. Use .outputColorSpace instead": what it meant in r152 to r161 and why r186 says nothing.
intent: error-outputencoding-removed
message: THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead.
queries:
  - "Updates to Color Management in three.js r152"
  - "When do we need to use renderer.outputEncoding = THREE.sRGBEncoding"
  - "WebGLRenderer outputEncoding"
  - "How to apply sRGBEncoding on texture?"
  - "Improve explanation on how to migrate from 151 to 152 color management"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead.

three.js r152 to r161 print this warning when code reads or sets `renderer.outputEncoding`, and a twin, `THREE.Texture: Property .encoding has been replaced by .colorSpace.`, when code sets `texture.encoding`. In those releases the old line still did its job: a setter turned the encoding into the new colour space and warned. r162 deleted the setters and the `sRGBEncoding` and `LinearEncoding` constants, so on r186 the same code prints nothing at all, and the part of it that tagged textures quietly stops working.

## Where three.js printed it

`src/renderers/WebGLRenderer.js` in three r160 kept the old property as a getter and setter pair. The setter maps the old constant onto the new property, then the colour pipeline carries on as if `outputColorSpace` had been set:

```js
set outputEncoding( encoding ) { // @deprecated, r152

	console.warn( 'THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead.' );
	this.outputColorSpace = encoding === sRGBEncoding ? SRGBColorSpace : LinearSRGBColorSpace;

}
```

`src/textures/Texture.js` in r160 did the same for textures, with `warnOnce`, so its line appears once a page however many textures set it:

```js
set encoding( encoding ) { // @deprecated, r152

	warnOnce( 'THREE.Texture: Property .encoding has been replaced by .colorSpace.' );
	this.colorSpace = encoding === sRGBEncoding ? SRGBColorSpace : NoColorSpace;

}
```

The renderer's line has no once-guard: code that reads `renderer.outputEncoding` in its render loop prints it every frame. Both setters are gone from r186, and so are the two constants, which leaves three ways the old code behaves now:

- `renderer.outputEncoding = THREE.sRGBEncoding` writes `undefined` into a plain property nothing reads. No harm is done, because `outputColorSpace` is `SRGBColorSpace` by default.
- `texture.encoding = THREE.sRGBEncoding` does the same, and here the harm is real: the texture keeps `NoColorSpace`, so a colour texture is read as linear and drawn washed out.
- `import { sRGBEncoding } from 'three'` is a missing export, and the browser refuses the whole module before any of it runs.

## The same page on r160 and on r186

A shop sign painted into a canvas in the brand green `#2e7d32` around a cream panel `#f5e6c8`, with the two old lines:

```js
renderer.outputEncoding = THREE.sRGBEncoding;   // line 11
// ... a canvas painted with the sign ...
const texture = new THREE.CanvasTexture(canvas);
texture.encoding = THREE.sRGBEncoding;          // line 25
const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: texture }));
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in a headless Chrome of its own, paused at frame 0. These replies came from the stable build on 2026-10-28, on a host with no GPU, with the project's `node_modules/three` pointed at r160 for the first run and at r186 for the second. The run folder shows as `<project>`; replies are cut to the lines this page explains, none reworded.

On r160:

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:45899/index.html in 0.2 s, paused at frame 0.
three r160 installed (current r186).
index.html:11 uses outputEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:11 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:25 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
three.js warned: THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead.
three.js warned: THREE.Texture: Property .encoding has been replaced by .colorSpace.
{"three":"160","scenes":1,"entities":["sign"]}

look {"sample":[[400,400],[640,400]]}

On screen (1):
sign 26% [274, 217, 1005, 582] 4 × 2 units, across the view
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (400, 400) #2e7d32, (640, 400) #f5e6c8.

eval {"code":"return { revision: THREE.REVISION, outputColorSpace: renderer.outputColorSpace, textureColorSpace: find(\"sign\").material.map.colorSpace }"}

{"revision":"160","outputColorSpace":"srgb","textureColorSpace":"srgb"}
```

Both warnings are there as `three.js warned:` lines, and so is the proof that the old lines still worked: the sampled colours are the painted ones, and the texture reads `srgb` because the setter put it there.

On r186, the same file:

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:36345/index.html in 0.2 s, paused at frame 0.
index.html:11 uses outputEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:11 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:25 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
{"three":"186","scenes":1,"entities":["sign"]}

look {"sample":[[400,400],[640,400]]}

Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
On screen (1):
sign 26% [274, 217, 1005, 582] 4 × 2 units, across the view
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (400, 400) #76ba7a, (640, 400) #fbf4e5.

eval {"code":"return { revision: THREE.REVISION, sRGBEncoding: String(THREE.sRGBEncoding), outputEncoding: String(renderer.outputEncoding), outputColorSpace: renderer.outputColorSpace, textureColorSpace: find(\"sign\").material.map.colorSpace }"}

{"revision":"186","sRGBEncoding":"undefined","outputEncoding":"undefined","outputColorSpace":"srgb","textureColorSpace":""}
```

The warnings are gone, and nothing replaced them in the console. The green drew as `#76ba7a`, a pale mint, because the texture is left at `NoColorSpace`, the empty string. The output setting is still `srgb` by default, which is why the renderer line was harmless all along and the texture line was not. What the console no longer says is in the reply twice. The source lines come from `open` reading the files, which works on any release. The `Lighting:` line comes from the live scene. Why a texture with no colour space draws pale is set out in [three.js colors washed out](/guides/threejs-colors-washed-out).

With a named import instead of `THREE.sRGBEncoding`, r186 stops the page at load:

```text
open {"url":"index.html","cwd":"<project>"}

game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:42973/index.html
The requested module 'three' does not provide an export named 'sRGBEncoding'
```

That reply has the browser's message but not the source lines, which `open` lists for a page that started. Search the project for `Encoding` to find the import.

## The fix

The mapping is the one the r160 setters applied:

| Old code | r186 |
|---|---|
| `renderer.outputEncoding = THREE.sRGBEncoding` | delete it: `renderer.outputColorSpace` is `THREE.SRGBColorSpace` by default |
| `renderer.outputEncoding = THREE.LinearEncoding` | `renderer.outputColorSpace = THREE.LinearSRGBColorSpace` |
| `texture.encoding = THREE.sRGBEncoding` | `texture.colorSpace = THREE.SRGBColorSpace` |
| `texture.encoding = THREE.LinearEncoding` | delete it: `texture.colorSpace` is `THREE.NoColorSpace` by default |

Set `SRGBColorSpace` on colour textures (`map`, `emissiveMap`), never on normal, roughness or other data maps. A texture loaded by `GLTFLoader` is tagged by the loader already. The sign with the two lines replaced:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Sign</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

// a shop sign painted in a canvas: the brand green and a cream panel
const canvas = document.createElement('canvas');
canvas.width = 512; canvas.height = 256;
const g = canvas.getContext('2d');
g.fillStyle = '#2e7d32'; g.fillRect(0, 0, 512, 256);
g.fillStyle = '#f5e6c8'; g.fillRect(160, 64, 192, 128);
const texture = new THREE.CanvasTexture(canvas);
texture.colorSpace = THREE.SRGBColorSpace;
const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: texture }));
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

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:37987/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["sign"]}

look {"sample":[[400,400],[640,400]]}

On screen (1):
sign 26% [274, 217, 1005, 582] 4 × 2 units, across the view
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (400, 400) #2e7d32, (640, 400) #f5e6c8.
```

No source line, no `Lighting:` line, and the two samples are the painted hex values again. The source check matches text, so a comment that still names `sRGBEncoding` keeps its line in the reply; delete the old line rather than leave it commented out. paprika3d does not edit the page: it names the lines and measures the colours, and the agent makes the change.

## Where people ask about it

These threads ask about the change or quote the old code; each count was read on 2026-10-28.

- [Updates to Color Management in three.js r152](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791) (discourse.threejs.org, 25,348 views, 76 posts)
- [When do we need to use renderer.outputEncoding = THREE.sRGBEncoding](https://stackoverflow.com/questions/69962432/when-do-we-need-to-use-renderer-outputencoding-three-srgbencoding) (Stack Overflow, 9,700 views)
- [WebGLRenderer outputEncoding](https://discourse.threejs.org/t/webglrenderer-outputencoding/12577) (discourse.threejs.org, 7,879 views, 9 posts)
- [How to apply sRGBEncoding on texture?](https://discourse.threejs.org/t/how-to-apply-srgbencoding-on-texture/39608) (discourse.threejs.org, 6,273 views, 7 posts)
- [Improve explanation on how to migrate from 151 to 152 color management](https://github.com/mrdoob/three.js/issues/30305) (GitHub, 10 comments)
