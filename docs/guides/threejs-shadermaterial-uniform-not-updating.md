---
title: three.js ShaderMaterial uniform not updating? Find which copy of the uniform the shader reads
phrase: three.js shadermaterial uniform not updating
description: Why a ShaderMaterial uniform set every frame in three.js leaves the picture unchanged (a cloned material, a ShaderPass that copied the shader's uniforms, a uniforms object replaced after the first draw, a compile error), and how a coding agent tells the cases apart with the paprika3d plugin, tracing the value the code writes with interact, reading the value each mesh and pass holds with eval, and confirming a fix with look save and compare.
meta: three.js ShaderMaterial uniform set but nothing changes? Compare the value the code writes with the copy the shader reads, then fix it.
intent: shadermaterial-uniform-not-updating
queries:
  - "How do you update a uniform In Three.js?"
  - "Uniform update isn't reflected in ShaderMaterial"
  - "Why float uniform is not updating?"
  - "Updating ShaderMaterial Uniform not rendering"
  - "EffectComposer - uniforms not updated"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js ShaderMaterial uniform not updating? Find which copy of the uniform the shader reads

## Where a uniform's value goes

A `ShaderMaterial` holds its uniforms as an object of `{ value }` entries. Each time three.js draws a mesh with that material, it reads every entry's `.value` and sends it to the GPU, so the documented way to animate one is to change `.value` and let the next frame carry it:

```js
material.uniforms.uTime.value = elapsed;
```

When that line runs every frame and the picture does not move, the value is almost always going somewhere the shader does not read. The usual places, from the threads:

- **A copy of the material.** `material.clone()` copies the uniforms with `UniformsUtils.clone`, values included. A second mesh given `waveMaterial.clone()` (to change its colour, say) has its own `uTime`, and the loop that writes `waveMaterial.uniforms.uTime.value` never reaches it.
- **A copy made by a pass.** `new ShaderPass(shaderObject)` copies the object's uniforms too (r186 `ShaderPass.js` calls `UniformsUtils.clone` unless it is given a `ShaderMaterial`). Writing `shaderObject.uniforms.x.value` afterwards changes the original, which nothing draws; the pass reads `pass.uniforms`.
- **A uniforms object swapped after the first draw.** The renderer keeps the uniforms object it compiled the material with; `material.uniforms = { ... }` later is not seen until `material.needsUpdate = true`. Replacing one entry, or setting its `.value`, is fine.
- **No new frame.** A page that renders on demand (once at load, or on controls' `change`) shows a new uniform value at the next render call, not before.
- **A shader that did not compile**, or a uniform the shader declares under another name: the GLSL compiler then throws away what it does not use, and the value goes nowhere without an error.

So two questions settle most cases: is the value the code writes moving, and is it the same object the drawn material or pass holds? paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `interact` with `trace` reads paths in the page's `observe()` every frame, so it answers the first question with the frame each value changed on; `eval` reads `mesh.material.uniforms` and `pass.uniforms` on the open page, which answers the second; and `look` with `save` and `compare` says what share of the picture an edit changed at the same frame, which confirms the fix without a screenshot diff script. The shader's compile log arrives as a console error in the reply of the call that drew the first frame.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Two flags and a fade

Two flags waved by one vertex shader, the second given a cloned material in another colour, and a fade in from black written as a `ShaderPass` in an `EffectComposer`. The loop writes `uTime` on the original material and `uAmount` on the fade's shader object. `window.__game.observe()` reports those two values, the ones the code believes it is animating.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Flags</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc4e4);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 7);
camera.lookAt(0, 1.5, 0);

// A waving cloth: the vertex shader moves each vertex by uTime.
const waveMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xd23c3c) } },
  vertexShader: `uniform float uTime;
    varying float vShade;
    void main() {
      vec3 p = position;
      float w = sin(p.x * 3.0 - uTime * 4.0) * 0.25 * (p.x + 1.0);
      p.z += w;
      vShade = 0.75 + w;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `uniform vec3 uColor;
    varying float vShade;
    void main() { gl_FragColor = vec4(uColor * vShade, 1.0); }`,
  side: THREE.DoubleSide,
});

const cloth = new THREE.PlaneGeometry(2, 1.2, 40, 12);
cloth.translate(1, 0, 0);
const flag = new THREE.Mesh(cloth, waveMaterial);
flag.name = 'flag';
flag.position.set(-2.6, 2.2, 0);
// A second flag in another colour, so it gets its own copy of the material.
const banner = new THREE.Mesh(cloth, waveMaterial.clone());
banner.name = 'banner';
banner.material.uniforms.uColor.value.set(0x3c64d2);
banner.position.set(0.6, 2.2, 0);
const pole = new THREE.MeshBasicMaterial({ color: 0x444444 });
for (const x of [-2.6, 0.6]) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3), pole);
  p.name = 'pole';
  p.position.set(x, 1.4, 0);
  scene.add(p);
}
scene.add(flag, banner);

// A fade in from black over the first second, as a post-processing pass.
const fadeShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(c.rgb * uAmount, c.a); }`,
};
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const fadePass = new ShaderPass(fadeShader);
composer.addPass(fadePass);
composer.addPass(new OutputPass());
window.composer = composer;

const timer = new THREE.Timer();
window.__game = {
  observe: () => ({ uTime: +waveMaterial.uniforms.uTime.value.toFixed(3), uAmount: fadeShader.uniforms.uAmount.value }),
};

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
let t = 0;
renderer.setAnimationLoop((now) => {
  timer.update(now);
  t += Math.min(timer.getDelta(), 0.1); // a slow frame or a hidden tab never jumps the waves
  waveMaterial.uniforms.uTime.value = t;
  fadeShader.uniforms.uAmount.value = Math.min(1, t);
  composer.render();
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Uniform values and the pixel shares below do not depend on the GPU. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. One second of play, with the two values traced.** `trace` reads each path every frame of the steps; `look: true` adds the picture at the end.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33507/index.html in 0.1 s, paused at frame 0.

interact {"steps": [{"wait": 60}], "trace": ["uTime", "uAmount"], "look": true}

{"changed":{"uTime":1.083,"uAmount":1}}
uTime: 0 → 1.083 at frame 60; first changed at frame 1
uAmount: 0 → 1 at frame 56; first changed at frame 1
Picture: <project>/paprika3d/runs/2026-10-28T10-18-54-347Z/look-1.png
Pixels: brightness 0%, colour saturation 0%, 100% near black, 0% blown out. Mostly black: a blank or unlit frame? Pale: little colour.
On screen (4):
banner 4.4% [728, 221, 998, 385] 2 × 1.2 units approximate (a sprite or its own shader: see the picture)
flag 4.3% [287, 221, 556, 385] 2 × 1.2 units approximate (a sprite or its own shader: see the picture)
pole ×2 0.93% [275, 206, 727, 621] 3 × 0.08 units
```

The code's side is fine: `uTime` climbs from frame 1 and `uAmount` reaches 1 at frame 56, so the fade should be over. The picture is 100% near black. The object list still finds both flags, because it draws its own ID image of the scene; the black is in what the composer put on screen. This is the "the uniform moves and the picture does not" case, so the next question is which object the shader reads.

**2. What the drawn material and the pass hold.** One `eval` reads the pass's own uniform, each flag's `uTime`, and whether the two flags share a material.

```text
eval {"code": "const pass = composer.passes.find(p => p.uniforms?.uAmount);\nconst flag = find(\"flag\"), banner = find(\"banner\");\nreturn {\n  passAmount: pass.uniforms.uAmount.value,\n  flagTime: flag.material.uniforms.uTime.value,\n  bannerTime: banner.material.uniforms.uTime.value,\n  sameMaterial: flag.material === banner.material,\n}"}

{"passAmount":0,"flagTime":1.117,"bannerTime":0,"sameMaterial":false}
```

Both faults in one reply. The pass reads `uAmount` at 0, while the code wrote 1 to the shader object it passed to `ShaderPass`: the pass made its own copy at construction, so the fade multiplies every pixel by 0 forever. And the banner's `uTime` is 0 while the flag's is 1.117: the banner has a cloned material, and the loop never writes its copy. That second fault is invisible behind the first; with the screen black, nobody would see the banner hold still.

**3. Write the pass's uniform.** The loop and `observe()` now use `fadePass.uniforms`:

```js
fadePass.uniforms.uAmount.value = Math.min(1, t); // the pass's own copy
```

The next call reloads the page by itself:

```text
interact {"steps": [{"wait": 60}], "trace": ["uTime", "uAmount"], "look": true}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
uTime: 0 → 1.083 at frame 60; first changed at frame 1
uAmount: 0 → 1 at frame 56; first changed at frame 1
Picture: <project>/paprika3d/runs/2026-10-28T10-18-54-347Z/look-2.png
Pixels: brightness 70%, colour saturation 35%, 0% near black, 0% blown out; 100% of the picture changed since the last look.
Hues: blue 95% of the frame; over the objects (9.7% of it): blue 48%, red 44%, grey 7%.
```

The trace is the same as before, and this time it is the value the pass reads. The picture shows the sky and both flags, each with the bend of a wave in it. One picture cannot say whether the blue banner's bend moves.

**4. Keep this frame, share the clock, and compare.** `save` keeps the picture with its frame; `compare` reloads the page, plays it to that same frame and diffs. Between the two, the banner's copy of the material gets the original's `uTime` entry, so both flags read one value and the banner keeps its own colour:

```text
look {"save": "waving"}

Saved as baseline waving: <project>/paprika3d/baselines/waving.png
```

```js
banner.material.uniforms.uTime = waveMaterial.uniforms.uTime; // one clock for both flags
```

```text
look {"compare": "waving"}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Compare: 4.9% of pixels differ from waving (saved 2026-10-28, frame 62, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T10-18-54-347Z/look-4-diff.png

eval {"code": "const flag = find(\"flag\"), banner = find(\"banner\");\nreturn { flagTime: flag.material.uniforms.uTime.value, bannerTime: banner.material.uniforms.uTime.value }"}

{"flagTime":1.15,"bannerTime":1.15}
```

At the same frame, 4.9% of the pixels changed, and the diff picture has the whole banner in red with nothing on the red flag but a hairline along its top edge: the banner was drawn at time 0 before the edit and at the page's time after it. The banner's list entry covers 4.4% of the view, so nearly all of the change is the banner. `eval` confirms both flags now read the same value. Had the share been 0%, the edit would not have reached the shader, and the next suspect would be the shader itself.

## A compile error looks the same at first

A typo in the GLSL leaves the material undrawn, which can pass for a uniform that does nothing. The same page with the fragment shader's uniform declared as `uColour` and used as `uColor`:

```js
fragmentShader: `uniform vec3 uColour;
  varying float vShade;
  void main() { gl_FragColor = vec4(uColor * vShade, 1.0); }`,
```

`open` stops at frame 0, before three.js compiles anything, so the error comes with the first frame drawn:

```text
interact {"steps": [{"wait": 1}]}

{"changed":{"uTime":0.1,"uAmount":0.1},"logs":["warn: WebGL: INVALID_OPERATION: useProgram: program not valid","warn: WebGL: INVALID_OPERATION: drawElements: no valid shader program in use (×2)"],"errors":["THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false"]}

observe {}

{"uTime":0.1,"uAmount":0.1,"harness":{"frame":1,"renderer":{"calls":6,"triangles":2178,"textures":2,"geometries":4,"programs":4},"scene":{"objects":4,"meshes":4,"lights":0,"cameras":0},"errors":["THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false\n\nMaterial Name: \nMaterial Type: ShaderMaterial\n\nProgram Info Log: Fragment shader is not compiled.\n\nFRAGMENT\n\nERROR: 0:60: 'uColor' : undeclared identifier\nERROR: 0:60: 'constructor' : not enough data provided for construction\n\n  55: \treturn dot( weights, rgb );\n  56: }\n  57: \n  58: uniform vec3 uColour;\n  59:     varying float vShade;\n> 60:     void main() { gl_FragColor = vec4(uColor * vShade, 1.0); }"],"changed":null}}
```

The `interact` reply names the failure, and `observe` carries the whole compile log: the undeclared `uColor`, with the lines around it and the failing one marked. The line numbers count the lines three.js adds before the shader's own code, so look for the marked line's text rather than its number.

## What paprika3d does not do

- **It does not know which uniforms should move.** The trace reads what `observe()` returns; a page that reports nothing about its uniforms gets an `eval` instead, as in step 2.
- **It does not read uniforms inside the GPU.** `eval` reads the JavaScript side, the object three.js uploads from. A value that reaches that object and is then thrown away by the GLSL compiler, because the shader never uses it, looks fine there; the compare in step 4 is what catches it.
- **The object list does not follow a vertex shader.** A mesh whose vertices are moved in the shader is listed by its geometry's box, marked `approximate`, as the flags are above.
- **It does not write the shader.** The fixes are the agent's; the tools show which copy is read.

## Pitfalls

- **Give `ShaderPass` a `ShaderMaterial` when the code keeps the shader's uniforms.** r186's `ShaderPass` uses a `ShaderMaterial`'s uniforms as they are and copies a plain shader object's; or write `pass.uniforms`, as step 3 does.
- **`clone()` then share what should stay shared.** Assigning one uniform entry to both materials, as step 4 does, keeps one value for both and lets each keep its own colour. A `Color` or `Vector` value can be shared the same way.
- **Set values in place.** `uniforms.uColor.value.set(0xff0000)` changes the `Color` the shader reads and keeps it a `Color`.
- **Cap the time step.** A clock that starts before the first frame, or a tab that was hidden, hands the shader a jump of seconds at once; `Math.min(timer.getDelta(), 0.1)` keeps one frame's step small, as the page above does.
- **On a page that renders on demand**, call the render after setting the value.

## Without paprika3d

Log `pass.uniforms` next to the object the code writes and compare them with `===` in the browser console, and check `mesh.material === otherMesh.material` for each mesh that should move together. The compile log is printed to the console by three.js itself; `renderer.debug.checkShaderErrors` (on by default) controls it. To see whether an edit changed the picture, take `renderer.domElement.toDataURL()` at the same moment before and after, with `preserveDrawingBuffer` set on the renderer, and compare the two images.
