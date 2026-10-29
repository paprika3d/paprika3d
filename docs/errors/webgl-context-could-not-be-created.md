---
title: three.js A WebGL context could not be created: read the Reason that follows
phrase: a webgl context could not be created
description: What three.js means by "THREE.WebGLRenderer: A WebGL context could not be created. Reason:", the event listener in WebGLRenderer.js that prints the browser's reason, what each kind of reason points to, and how a coding agent catches a second context request on three's canvas with the paprika3d plugin.
meta: three.js "THREE.WebGLRenderer: A WebGL context could not be created. Reason:  Canvas has an existing context of a...": what triggers it and how to fix it.
intent: error-webgl-context-could-not-be-created
message: THREE.WebGLRenderer: A WebGL context could not be created. Reason:  Canvas has an existing context of a different type
queries:
  - "FireFox on Windows: WebGL creation failed"
  - "Failed to create a WebGL2 context - bindToCurrentThread"
  - "Spline giving runtime error : A WebGL context could not be created. Reason: Failed to create a WebGL2 context"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WebGLRenderer: A WebGL context could not be created. Reason:  Canvas has an existing context of a different type

This console error is three.js passing on a message from the browser. The text after `Reason:` is written by Chrome or Firefox, not by three, and it is the part worth reading: it says whether the browser refused WebGL on this machine or whether a page asked a canvas for a second, different context. The reason in the heading is the one this page reproduces; the double space after `Reason:` is how it prints.

## Where three.js prints it

`src/renderers/WebGLRenderer.js` (three r186) adds a listener for the canvas event `webglcontextcreationerror` in its constructor, before it asks for a context, and the handler logs the event's `statusMessage`:

```js
// event listeners must be registered before WebGL context is created, see #12753
canvas.addEventListener( 'webglcontextlost', onContextLost, false );
canvas.addEventListener( 'webglcontextrestored', onContextRestore, false );
canvas.addEventListener( 'webglcontextcreationerror', onContextCreationError, false );
```

```js
function onContextCreationError( event ) {

	error( 'WebGLRenderer: A WebGL context could not be created. Reason: ', event.statusMessage );

}
```

three's `error()` adds `THREE.` and calls `console.error` with two arguments, so the console joins the text, which already ends in a space, and the reason with one more space. The browser fires the event whenever a `getContext` call for a WebGL name fails on that canvas. Two moments matter:

- **While the renderer is being made.** If three's own request fails, this line comes first and the constructor then throws `Error creating WebGL context` (or the `with your selected attributes` variant), so nothing renders.
- **Any time later.** The listener stays on the canvas for as long as the renderer exists, so another piece of code asking the same canvas for a different WebGL context makes three print this line while its own context keeps working.

## Why the browser refused

The reason text sorts the cases:

- **A reason about the GPU or the driver**, such as Chrome's `Failed to create a WebGL2 context` or one naming `bindToCurrentThread`, or a Firefox reason listing feature failures. The browser could not make a GPU context: the driver is on the browser's block list or its GPU process crashed, or hardware acceleration is off. The threads people wrote are mostly this, often on one machine while others work. Nothing in the page changes it; updating the GPU driver, turning hardware acceleration back on, or restarting the browser does.
- **`Canvas has an existing context of a different type`.** The canvas already holds a context of another kind (2D, WebGL 1, or `bitmaprenderer`), and a canvas never changes kind. Before the renderer exists, this is followed by `Error creating WebGL context`. After it exists, it means some code asked three's canvas for a context other than WebGL 2.

## A page that reproduces it

This page renders a cube, and reads the GPU's name for a bug report the WebGL 1 way, from the renderer's own canvas:

```js
const renderer = new THREE.WebGLRenderer({ antialias: true });
// ...
const gl = renderer.domElement.getContext('webgl'); // three's canvas already holds a webgl2 context
const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
window.gpuName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
```

The replies below are from paprika3d, a Claude Code plugin and MCP server that drives three.js pages in its own headless Chrome. They were captured with its stable build on 2026-10-28 on a machine with no GPU, cut to the lines this page explains, with no line changed and the project path written as `<project>`.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:35159/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["cube"]}
Errors so far:
THREE.WebGLRenderer: A WebGL context could not be created. Reason:  Canvas has an existing context of a different type

look {}

On screen (1):
cube 5.8% [518, 284, 761, 537]
Never visible: none

eval {"code":"return window.gpuName"}

unknown
```

`open` lists the line under `Errors so far`, because the request ran while the page set up, before its first frame. `look` still lists `cube` on screen: three's WebGL 2 context was never touched, so the scene draws and the error looks harmless. `eval` shows the real damage: `getContext('webgl')` returned `null`, the guard swallowed it, and the bug report would say `unknown`. A support check written the same way, `if (!canvas.getContext('webgl'))`, would show a "WebGL is not available" notice on a page that renders fine.

The replies cannot show the GPU-side reasons. Chrome on this machine draws with SwiftShader, which accepts every request, so a blocked driver's reason text is not something these calls reproduce.

## The fix

Ask the renderer for the context it already made. `renderer.getContext()` returns three's WebGL 2 context, and the debug extension works on it:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Cube</title>
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

// ask three for the context it already made, instead of asking the canvas for a WebGL 1 one
const gl = renderer.getContext();
const ext = gl.getExtension('WEBGL_debug_renderer_info');
window.gpuName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 4);
camera.lookAt(0, 0, 0);
const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());
cube.name = 'cube';
scene.add(cube);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

After the change, `open` has no `Errors so far` block, `observe` reports `"errors":[]`, and `eval` returns the GPU's name from three's own context:

```text
open {"url":"fix.html","cwd":"<project>"}

Opened http://127.0.0.1:46045/fix.html in 0.6 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["cube"]}

observe {}

{"entities":{"cube":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":12,"textures":0,"geometries":1,"programs":2},"scene":{"objects":1,"meshes":1,"lights":0,"cameras":0},"errors":[],"changed":null}}

eval {"code":"return window.gpuName"}

ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
```

For a support check, use a fresh canvas, as `WebGL.isWebGL2Available()` in `three/addons/capabilities/WebGL.js` does, never the renderer's. For the GPU-side reasons, catch the constructor's throw and show the user a message that names the browser setting, since the page cannot fix the driver.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [FireFox on Windows: WebGL creation failed](https://discourse.threejs.org/t/firefox-on-windows-webgl-creation-failed/51365) (discourse.threejs.org, 3,675 views, 3 posts)
- [Failed to create a WebGL2 context - bindToCurrentThread](https://discourse.threejs.org/t/failed-to-create-a-webgl2-context-bindtocurrentthread/58490) (discourse.threejs.org, 1,434 views, 0 posts)
- [Spline giving runtime error : A WebGL context could not be created. Reason: Failed to create a WebGL2 context](https://stackoverflow.com/questions/73976849/spline-giving-runtime-error-a-webgl-context-could-not-be-created-reason-fail) (Stack Overflow, 1,079 views, 1 answer)
- [Web GL won't load suddenly. Is this a hardware issue? I just got a new laptop within the last month](https://stackoverflow.com/questions/78387468/web-gl-wont-load-suddenly-is-this-a-hardware-issue-i-just-got-a-new-laptop-wi) (Stack Overflow, 628 views, 1 answer)
- [rev.151 /materials-physical-transmission errors on older macs](https://github.com/mrdoob/three.js/issues/25846) (GitHub, 6 comments)
