---
title: three.js Can not resolve #include: the shader chunk name three no longer has
phrase: can not resolve #include
description: What three.js means by "THREE.WebGLProgram: Can not resolve #include <name>", the include resolver in WebGLProgram.js that throws it, the renamed and removed chunks behind most cases in r186, and how a coding agent finds the name with the paprika3d plugin's look, observe and eval replies.
meta: How to fix three.js "THREE.WebGLProgram: Can not resolve #include <encodings_fragment>": what triggers it, the line that prints it, and the fix in code.
intent: error-can-not-resolve-include
message: THREE.WebGLProgram: Can not resolve #include <encodings_fragment>
queries:
  - "Vite Can not resolve #include <uv2_pars_vertex>"
  - "THREE.WebGLProgram: Can not resolve #include <encodings_fragment>"
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.WebGLProgram: Can not resolve #include <encodings_fragment>

three.js throws this when a shader asks for a chunk by a name that is not in `THREE.ShaderChunk`. The name inside the angle brackets is the whole diagnosis: either it is spelled wrong, it was never registered, or three renamed or removed it in a release newer than the code that uses it. Because it is a thrown exception rather than a logged error, it stops the render call it happens in, so nothing in the scene is drawn that frame.

## Where three.js prints it

Before compiling, `src/renderers/webgl/WebGLProgram.js` (three r186) replaces every `#include <name>` line of a material's shaders with the text of that chunk, recursively:

```js
const includePattern = /^[ \t]*#include +<([\w\d./]+)>/gm;

function resolveIncludes( string ) {

	return string.replace( includePattern, includeReplacer );

}

const shaderChunkMap = new Map();

function includeReplacer( match, include ) {

	let string = ShaderChunk[ include ];

	if ( string === undefined ) {

		const newInclude = shaderChunkMap.get( include );

		if ( newInclude !== undefined ) {

			string = ShaderChunk[ newInclude ];
			warn( 'WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.', include, newInclude );

		} else {

			throw new Error( 'THREE.WebGLProgram: Can not resolve #include <' + include + '>' );

		}

	}

	return resolveIncludes( string );

}
```

`shaderChunkMap` is the table of old names that three still accepts with a warning. In r186 the map is empty: no renamed chunk has a grace period any more, so every old name goes straight to the throw. The program is built the first time a mesh with that material is rendered (or when `renderer.compile` runs), so the exception comes out of `renderer.render`.

## Why the chunk is missing

- **A chunk three renamed.** `encodings_fragment` became `colorspace_fragment` (and `encodings_pars_fragment` became `colorspace_pars_fragment`) when three moved to colour spaces, and for a while the old name printed a deprecation warning. Shader code copied from an older example or answer now throws instead.
- **A chunk three removed.** The `uv2_*` chunks went away when the second UV set was renamed; the Vite thread is a dependency compiled against the older three, such as a post-processing or material library, being bundled with a newer one.
- **Your own chunk, registered too late or not at all.** `#include <myNoise>` works when `THREE.ShaderChunk.myNoise` is set before the material first renders. Setting it in another module that loads later, or on a second copy of three, leaves the name unknown.
- **A typo**, including a `.glsl` file name with its extension, which the pattern accepts and the lookup does not find.

The pattern needs the angle-bracket form at the start of a line. `#include "name"` is not touched by three and reaches the GLSL compiler, which fails with a `Shader Error` message instead.

## A page that reproduces it

A `ShaderMaterial` copied from an older answer ends its fragment shader with the old colour chunk:

```js
fragmentShader: `uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(map, vUv);
  #include <encodings_fragment>
}`
```

paprika3d, a Claude Code plugin and MCP server, opens three.js pages in a headless Chrome of its own, paused before their first frame. Its stable build gave these replies on 2026-10-28 on a machine with no GPU. Lines not discussed are cut, the rest are as printed, and the project folder shows as `<project>`.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:34649/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["card"]}

look {}

THREE.WebGLProgram: Can not resolve #include <encodings_fragment>

observe {}

{"entities":{"card":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":1,"programs":0},"scene":{"objects":1,"meshes":1,"lights":0,"cameras":0},"errors":["THREE.WebGLProgram: Can not resolve #include <encodings_fragment> (index.html:30:42)"],"changed":null}}

eval {"code":"return Object.keys(THREE.ShaderChunk).filter(k => k.startsWith(\"colorspace\"))"}

["colorspace_fragment","colorspace_pars_fragment"]
```

`open` has nothing to say, since three resolves includes at the first render. `look` asks the page to draw, the draw throws, and the reply is the exception itself instead of a picture. `observe` shows what the throw cost: `calls` and `programs` are `0`, so the frame drew nothing at all, the card and every other object alike, and the error names the line of `index.html` where the render was called. `eval` lists the chunk names this copy of three has that start with the new prefix, which is a quick way to find the replacement for any old name: `Object.keys(THREE.ShaderChunk)` holds every name the resolver accepts.

## The fix

Use the current chunk name. `colorspace_fragment` converts `gl_FragColor` from linear to the renderer's output colour space, which is what `encodings_fragment` did; marking the texture as sRGB keeps its colour right:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Card</title>
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
camera.position.set(0, 0, 3);

const map = new THREE.DataTexture(new Uint8Array([255, 160, 40, 255]), 1, 1);
map.colorSpace = THREE.SRGBColorSpace;
map.needsUpdate = true;
const material = new THREE.ShaderMaterial({
  name: 'tint',
  uniforms: { map: { value: map } },
  vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(map, vUv);
  #include <colorspace_fragment>
}`
});
const card = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
card.name = 'card';
scene.add(card);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The card draws and the program list is no longer empty:

```text
look {}

Pixels: brightness 30%, colour saturation 46%, 0% near black, 0% blown out.
Hues: blue 68%, orange 32% of the frame; over the objects (32% of it): orange 100%.
On screen (1):
card 32% [354, 114, 925, 685] 2 × 2 units approximate (a sprite or its own shader: see the picture)
Never visible: none

observe {}

{"entities":{"card":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":2,"textures":1,"geometries":1,"programs":2},"scene":{"objects":1,"meshes":1,"lights":0,"cameras":0},"errors":[],"changed":null}}
```

When the include comes from a library rather than your code, the fix is a version of that library built for your three release, or a single copy of three in the bundle so the library and the page share one `ShaderChunk`. For a chunk of your own, assign it to `THREE.ShaderChunk` in the module that creates the material, before the first render.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Vite Can not resolve #include \<uv2_pars_vertex\>](https://discourse.threejs.org/t/vite-can-not-resolve-include-uv2-pars-vertex/52686) (discourse.threejs.org, 1,962 views, 2 posts)
