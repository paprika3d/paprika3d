---
title: three.js Error creating WebGL context: why WebGLRenderer got no WebGL 2 context
phrase: error creating webgl context
description: What three.js means by "THREE.WebGLRenderer: Error creating WebGL context.", the lines of WebGLRenderer.js that throw it, the reasons a browser refuses a WebGL 2 context, and how a coding agent reads the failure from the paprika3d plugin's open reply.
meta: How to fix three.js "THREE.WebGLRenderer: Error creating WebGL context": what triggers it, the line that prints it, and the fix in code.
intent: error-creating-webgl-context
message: THREE.WebGLRenderer: Error creating WebGL context.
queries:
  - "Error creating WebGL context. Three js chrome?"
  - "Error creating WebGL context in Chrome but not in Android Browser"
  - "Error creating WebGL context"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WebGLRenderer: Error creating WebGL context.

`new THREE.WebGLRenderer()` throws this error when the canvas it was given, or the one it made, hands back no WebGL 2 context at all. Nothing after the constructor runs: no scene is drawn, and any code below the `new` line in the same module never executes. The cause is outside your scene code: the canvas already belongs to another kind of context, or the browser will not give this page WebGL 2.

## Where three.js prints it

The constructor of `WebGLRenderer` in `src/renderers/WebGLRenderer.js` (three r186) asks the canvas for a `webgl2` context with the attributes you passed. When that returns `null`, it asks once more with no attributes, to tell the two failures apart:

```js
if ( _gl === null ) {

	const contextName = 'webgl2';

	_gl = getContext( contextName, contextAttributes );

	if ( _gl === null ) {

		if ( getContext( contextName ) ) {

			throw new Error( 'THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.' );

		} else {

			throw new Error( 'THREE.WebGLRenderer: Error creating WebGL context.' );

		}

	}

}
```

Both calls returned `null`, so three throws the plain message. The whole block sits in a `try`, and its `catch` logs the message once more through three's `error()` helper before throwing it again:

```js
} catch ( e ) {

	canvas.removeEventListener( 'webglcontextlost', onContextLost, false );
	canvas.removeEventListener( 'webglcontextrestored', onContextRestore, false );
	canvas.removeEventListener( 'webglcontextcreationerror', onContextCreationError, false );

	error( 'WebGLRenderer: ' + e.message );
```

That is why the console shows the text twice, once as `THREE.WebGLRenderer: THREE.WebGLRenderer: Error creating WebGL context.` and once as the uncaught exception. three registers its `webglcontextcreationerror` listener before asking, so the browser's own reason usually arrives first, as the line `A WebGL context could not be created. Reason:` followed by what the browser said.

## Why the browser gave no context

- **The canvas already has a 2D context.** A canvas holds one kind of context for its whole life. Code that drew a loading message, a placeholder or a fallback with `getContext('2d')`, then handed the same element to `WebGLRenderer({ canvas })`, gets `null` for WebGL 2. A WebGL 1 context made earlier on that canvas, by an older library or a support check, blocks it in the same way.
- **The browser has WebGL 2 turned off or blocked.** Hardware acceleration switched off in Chrome's settings, a GPU or driver on the browser's block list, or a GPU process that crashed several times makes the browser refuse every WebGL context on the page. The threads about this message are mostly this case: one machine fails while another browser or device works.
- **The device has WebGL 1 and no WebGL 2.** three r186 asks for `webgl2` and nothing else, so an old phone or a browser without WebGL 2 now fails where a three.js release from before WebGL 1 support ended still ran.
- **There is no browser GPU stack at all**, as in a unit test under jsdom or Node, where `getContext` returns `null` for every WebGL name.

## A page that reproduces it

This page writes a loading message on its canvas with the 2D API, then passes that canvas to three:

```js
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d'); // a loading message drawn on the same canvas
ctx.fillText('Loading...', 20, 20);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
```

paprika3d is a Claude Code plugin and MCP server that runs a three.js page in a headless Chrome it controls and pauses it at its first frame. These replies come from its stable build on 2026-10-28, on a machine without a GPU; each is cut to the lines discussed here, no line reworded, and the project folder reads `<project>`.

```text
open {"url":"index.html","cwd":"<project>"}

game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:45915/index.html
THREE.WebGLRenderer: A WebGL context could not be created. Reason:  Canvas has an existing context of a different type
THREE.WebGLRenderer: A WebGL context could not be created. Reason:  Canvas has an existing context of a different type
THREE.WebGLRenderer: THREE.WebGLRenderer: Error creating WebGL context.
THREE.WebGLRenderer: Error creating WebGL context. (index.html:13:18)

observe {}

no game is open; call `open` first
```

`open` waited for a renderer, found none, and listed the console lines in the order the page printed them. Chrome fired `webglcontextcreationerror` for each of three's two `getContext` calls, which is why the reason line appears twice, and its reason names the cause directly: the canvas already has a context of another type. Next come three's logged copy and the uncaught throw, with the line of `index.html` where the renderer was made. Because the constructor threw, there is no renderer to wrap, so `observe` and `look` have no page to read.

What the replies cannot show is a machine-level refusal. On a computer whose browser blocks WebGL the reason text changes (Chrome and Firefox each word it their own way), but the shape is the same: one or two reason lines, then this error. Reading the reason line before the error tells the two cases apart.

## The fix

Keep the loading message out of the WebGL canvas. Here three makes its own canvas and the message is a page element removed once the scene is ready:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Cube</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<div id="loading" style="position:fixed;left:20px;top:20px;color:#ccc;font:16px sans-serif">Loading...</div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

// three makes its own canvas; the loading text lives in its own element
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 4);
camera.lookAt(0, 0, 0);
const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());
cube.name = 'cube';
scene.add(cube);
document.getElementById('loading').remove();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

With the fix, `open` reports the page with its `cube` entity and no `Errors so far` block, and `look` lists `cube` on screen. `observe` shows `"errors":[]`:

```text
open {"url":"fix.html","cwd":"<project>"}

Opened http://127.0.0.1:34815/fix.html in 0.5 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["cube"]}

look {}

On screen (1):
cube 5.8% [518, 284, 761, 537]
Never visible: none

observe {}

{"entities":{"cube":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":12,"textures":0,"geometries":1,"programs":2},"scene":{"objects":1,"meshes":1,"lights":0,"cameras":0},"errors":[],"changed":null}}
```

When the cause is the browser rather than the page, there is nothing to fix in the scene. Wrap the constructor in `try` and show a message in the page when it throws, or test first with `WebGL.isWebGL2Available()` from `three/addons/capabilities/WebGL.js`, which makes its own throwaway canvas and returns `false` instead of throwing. Users who see the message on one machine can check that hardware acceleration is on in the browser settings and that `chrome://gpu` lists WebGL 2 as available.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Error creating WebGL context. Three js chrome?](https://stackoverflow.com/questions/54232528/error-creating-webgl-context-three-js-chrome) (Stack Overflow, 54,249 views, 13 answers)
- [Error creating WebGL context in Chrome but not in Android Browser](https://stackoverflow.com/questions/28466387/error-creating-webgl-context-in-chrome-but-not-in-android-browser) (Stack Overflow, 10,700 views, 2 answers)
- [Error creating WebGL context](https://github.com/mrdoob/three.js/issues/4927) (GitHub, 66 comments)
