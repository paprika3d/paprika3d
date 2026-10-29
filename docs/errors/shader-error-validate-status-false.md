---
title: three.js Shader Error 0 - VALIDATE_STATUS false: read the log, not the zero
phrase: shader error 0 - validate_status false
description: What three.js means by "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false", why the 0 and the false say nothing about the bug, how to map the GLSL line number back to your shader, and how a coding agent gets the whole compiler log from the paprika3d plugin's look and observe replies.
meta: How to fix three.js "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false": what triggers it, the line that prints it, and the fix in code.
intent: error-shader-error-validate-status
message: THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
queries:
  - "Webgl shader error 0"
  - "Shader Error 0 - VALIDATE_STATUS false"
  - "WebGLProgram Shader Error when loading glb model in three.js r151"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false

three.js logs this when the GPU driver rejects a material's shader. The first line is the same for almost every broken shader, so it tells you very little; the useful part is further down the same console message: the material's name and type, the driver's compile log with a line number, and the shader source around that line. Any mesh drawn with that material is skipped until the shader compiles.

## Where three.js prints it

`src/renderers/webgl/WebGLProgram.js` (three r186) compiles and links the program, then checks the result the first time the renderer uses it (`onFirstUse`, when `renderer.debug.checkShaderErrors` is true, which is the default). When the link status is `false` and no `renderer.debug.onShaderError` callback is set, it builds one long message:

```js
const vertexErrors = getShaderErrors( gl, glVertexShader, 'vertex' );
const fragmentErrors = getShaderErrors( gl, glFragmentShader, 'fragment' );

error(
	'WebGLProgram: Shader Error ' + gl.getError() + ' - ' +
	'VALIDATE_STATUS ' + gl.getProgramParameter( program, gl.VALIDATE_STATUS ) + '\n\n' +
	'Material Name: ' + self.name + '\n' +
	'Material Type: ' + self.type + '\n\n' +
	'Program Info Log: ' + programLog + '\n' +
	vertexErrors + '\n' +
	fragmentErrors
);
```

The two values on the first line are not about your shader. `gl.getError()` is the WebGL error flag, and a failed compile does not set it, so it is nearly always `0` (no error). three never calls `gl.validateProgram()`, so `VALIDATE_STATUS` stays `false` for every program, working or not. People who search for "shader error 0" are looking at the two least useful words of the message.

`getShaderErrors` reads each shader's info log; when the log names a line (`ERROR: 0:60`), it adds a slice of the source around it through `handleSource`, marking the line with `>`.

## Why a shader fails to compile

- **GLSL types do not convert by themselves.** `float x = 1;` or `1 - someFloat` is an error in GLSL ES: an integer literal is an `int`, and nothing turns it into a `float`. This is the most common hand-written mistake.
- **A name three does not declare.** A `ShaderMaterial` gets `position`, `uv`, `normal` and the camera matrices for free; a `RawShaderMaterial` gets nothing, and a custom attribute needs its own `attribute` line.
- **A chunk edited through `onBeforeCompile`** that replaces an `#include` with code using a variable that a newer three release renamed. Updating three breaks the patch, not the material.
- **Driver limits and precision.** A shader that compiles on a desktop can fail on a phone: too many uniforms or samplers, or a constant out of range for `lowp`.
- **A loaded model's material** with an extension or a combination of maps that a specific three release or driver handles wrongly, as in the r151 thread above; the log then points into three's own chunks, and updating three or the driver is the fix.

## A page that reproduces it

A `ShaderMaterial` named `glow` subtracts from an integer literal:

```js
fragmentShader: `uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float glow = 1 - distance(vUv, vec2(0.5)) * 2.0;
  gl_FragColor = vec4(uColor * glow, 1.0);
}`
```

paprika3d is a Claude Code plugin and MCP server; it loads a three.js page in a headless Chrome of its own and holds the clock at frame 0. The replies here were captured on 2026-10-28 from the stable build on a host without a GPU. They are trimmed to the lines discussed, never edited, and show the project folder as `<project>`.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:41441/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["disc"]}

look {}

Pixels: brightness 0%, colour saturation 0%, 100% near black, 0% blown out. Mostly black: a blank or unlit frame? Pale: little colour.
On screen (1):
disc 32% [354, 114, 925, 685] 2 × 2 units approximate (a sprite or its own shader: see the picture)
Never visible: none
Page errors since the last call (1):
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
A shader failed to compile: what is drawn with it draws nothing (a look lists it never visible) until it compiles.

observe {}

{"entities":{"disc":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":2,"textures":0,"geometries":1,"programs":2},"scene":{"objects":1,"meshes":1,"lights":0,"cameras":0},"errors":["THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false\n\nMaterial Name: glow\nMaterial Type: ShaderMaterial\n\nProgram Info Log: Fragment shader is not compiled.\n\nFRAGMENT\n\nERROR: 0:60: '-' : wrong operand types - no operation '-' exists that takes a left-hand operand of type 'const int' and a right operand of type 'highp float' (or there is no acceptable conversion)\nERROR: 0:60: '=' : cannot convert from 'const int' to 'highp float'\n\n  55: }\n  56: \n  57: uniform vec3 uColor;\n  58: varying vec2 vUv;\n  59: void main() {\n> 60:   float glow = 1 - distance(vUv, vec2(0.5)) * 2.0;\n  61:   gl_FragColor = vec4(uColor * glow, 1.0);\n  62: }"],"changed":null}}
```

`open` is clean because three compiles a program at the first render, and `open` stops before it. `look` draws that frame: its `Page errors` block shows the first line of the message and adds a line saying a shader failed. The picture is all black (`100% near black`). The `disc` row in the list comes from the mesh's position and size, so it still reads 32% of the frame even though no pixel of it was drawn; trust the Pixels line here.

`observe` returns the whole console message under `harness.errors`. The compiler says `'=' : cannot convert from 'const int' to 'highp float'` at line 60, and the source slice marks that line with `>`. The number counts the lines three puts in front of your code (version, precision, defines and uniforms), which is why a six-line shader errors at line 60: the slice shows your own text starting at line 57, so line 60 is the fourth line of `fragmentShader`.

## The fix

Write the literal as a float, `1.0`. The fixed page also clamps the value so the corners stay black instead of going negative:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Glow</title>
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

const material = new THREE.ShaderMaterial({
  name: 'glow',
  uniforms: { uColor: { value: new THREE.Color(0x33ccff) } },
  vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float glow = 1.0 - distance(vUv, vec2(0.5)) * 2.0; // 1.0, not 1: GLSL never turns an int into a float
  gl_FragColor = vec4(uColor * max(glow, 0.0), 1.0);
}`
});
const disc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
disc.name = 'disc';
scene.add(disc);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

After the fix the frame has colour and no error is listed:

```text
look {}

Pixels: brightness 13%, colour saturation 43%, 10% near black, 0% blown out.
On screen (1):
disc 32% [354, 114, 925, 685] 2 × 2 units approximate (a sprite or its own shader: see the picture)
Never visible: none

observe {}

{"entities":{"disc":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":2,"textures":0,"geometries":1,"programs":2},"scene":{"objects":1,"meshes":1,"lights":0,"cameras":0},"errors":[],"changed":null}}
```

To catch the next shader mistake without taking a picture, an agent can build every program in the scene from `eval`. On the broken page, right after `open`, that reply carries the message on its `errors` line, along with Chrome's own warnings about the invalid program:

```text
eval {"code":"renderer.compile(scene, camera); return renderer.info.programs.length"}

1
warn: WebGL: INVALID_OPERATION: useProgram: program not valid
warn: WebGL: INVALID_OPERATION: drawElements: no valid shader program in use
errors: THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
```

For your own logging, set `renderer.debug.onShaderError` to a function; three then calls it instead of printing this message.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Webgl shader error 0](https://discourse.threejs.org/t/webgl-shader-error-0/49509) (discourse.threejs.org, 5,038 views, 14 posts)
- [Shader error ("must have compiled vertex shader attached")](https://discourse.threejs.org/t/shader-error-must-have-compiled-vertex-shader-attached/25390) (discourse.threejs.org, 3,627 views, 2 posts)
- [Shader error Overflow in implicit constant conversion, minimum range for lowp float is (-2,2)](https://discourse.threejs.org/t/shader-error-overflow-in-implicit-constant-conversion-minimum-range-for-lowp-float-is-2-2/6915) (discourse.threejs.org, 3,102 views, 10 posts)
- [Shader Error 0 - VALIDATE_STATUS false](https://discourse.threejs.org/t/shader-error-0-validate-status-false/53195) (discourse.threejs.org, 2,060 views, 3 posts)
- [WebGLProgram Shader Error when loading glb model in three.js r151](https://github.com/mrdoob/three.js/issues/25836) (GitHub, 6 comments)
