---
title: three.js selective bloom on some objects, without the glow showing through walls
phrase: three.js selective bloom
description: How to bloom some objects and not others in three.js with UnrealBloomPass, why the layers recipe can make a lamp glow through the wall in front of it, and how a coding agent finds that with the paprika3d plugin (look naming a never-visible lamp and the wall at the glowing pixel, sample reading the glow), moves to a luminance threshold with emissive values above 1, finds the intensity where the glow starts, and reads each pass and its draw calls from perf.
meta: three.js selective bloom glowing through walls or on everything? Bloom what is brighter than 1, and check each pass the composer draws.
intent: selective-bloom-some-objects-only
queries:
  - "ThreeJS Selective Bloom For Specific Parts Of One Object Using Emission Map"
  - "Pmndrs post-processing: How to get selective Bloom"
  - "Glowing Item Looking through Wall : Selective bloom"
  - "Postprocessing selective bloom"
  - "How to get Selective Bloom to work without layers?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js selective bloom on some objects, without the glow showing through walls

## Two ways to bloom some objects and not others

`UnrealBloomPass` blurs whatever in its input is brighter than its `threshold` and adds the blur back. Given the whole scene and a threshold of 0, everything blooms, the white van as much as the neon sign. There are two common ways to limit it:

- **Layers.** The glowing objects go on a second layer; one composer renders that layer alone and blooms it, a second renders the scene and mixes the bloom over it. The three.js example `webgl_postprocessing_unreal_bloom_selective` works this way, and it does one more thing that copies often leave out: for the bloom render it swaps every other mesh's material for black instead of hiding it. A copy that hides the others with `camera.layers.set(BLOOM)` lets a lamp behind a wall glow straight through the wall, because the wall is not in the bloom render to cover it.
- **A threshold above 1.** The composer's render targets in r186 hold values above 1 before `OutputPass` tone maps them. Set the bloom's `threshold` to 1 and turn the glowing materials' `emissiveIntensity` up until they pass it, and nothing lit by ordinary lights blooms. It is one composer and one scene render, and the depth buffer has already hidden what is behind a wall before the bloom sees the picture. Partial glow on one object, from an emission map, comes for free: the map's bright texels pass the threshold and the dark ones do not.

The threshold is compared with luminance, `0.2126 R + 0.7152 G + 0.0722 B` in linear colour, so a saturated red, pink or blue needs a much higher intensity than a yellow or a white to cross the same threshold. And `UnrealBloomPass` fades in over 0.01 above the threshold (its `smoothWidth`), so the glow appears almost at once at one intensity and not at all just below it.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. On a bloom page three of its tools do the looking: `look` lists objects that are in view but never visible with what covers them, and `look` with `at` lists the objects at a pixel nearest first, so a glow over a wall is the wall's name with the lamp behind it; `look` with `sample` reads the colour drawn at points; `eval` reads each mesh's layers and the pass's settings and tries an intensity on the open page; and `perf` lists the passes in one frame with their size and draw calls, which shows how many times a composer chain draws the scene.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A night street with a lamp behind a wall

A street with a white van, a neon sign in plain view, and a street lamp's bulb behind a wall. Both glowing objects are on layer 1. A bloom composer renders layer 1 alone with the camera's layers set to it, and a final composer mixes its bloom over the full scene: the layers recipe with the other meshes hidden, not darkened.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Night street</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e16);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 8);
camera.lookAt(0, 1.2, 0);
scene.add(new THREE.HemisphereLight(0x8090b0, 0x202020, 1.2));
const moon = new THREE.DirectionalLight(0xc8d4ff, 1.2);
moon.position.set(-4, 6, 5);
scene.add(moon);

const BLOOM = 1; // the layer of things that glow
const box = (name, w, h, d, material, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.name = name;
  m.position.set(x, y, z);
  scene.add(m);
  return m;
};
box('street', 16, 0.1, 10, new THREE.MeshStandardMaterial({ color: 0x3a3a40 }), 0, -0.05, 0);
box('wall', 3, 2.6, 0.3, new THREE.MeshStandardMaterial({ color: 0x8a7a6a }), 2.2, 1.3, 1);
box('van', 2.4, 1.4, 1.2, new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), -3.2, 0.75, 1.5);
// A neon sign in plain view, and a street lamp's bulb hidden behind the wall.
const neon = box('neon', 2.2, 0.25, 0.1, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a8a }), -0.4, 2.6, -1);
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 12), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd27a }));
bulb.name = 'bulb';
bulb.position.set(2.2, 1.6, -0.5);
scene.add(bulb);
neon.layers.enable(BLOOM);
bulb.layers.enable(BLOOM);

// Bloom on the glowing layer only: one composer renders that layer and blurs it, a second mixes it over the scene.
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.2, 0.5, 0);
const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderPass);
bloomComposer.addPass(bloomPass);
const mixPass = new ShaderPass(new THREE.ShaderMaterial({
  name: 'mix',
  uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
    void main() { gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }`,
}), 'baseTexture');
mixPass.needsSwap = true;
const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderPass);
finalComposer.addPass(mixPass);
finalComposer.addPass(new OutputPass());
window.bloomPass = bloomPass;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  bloomComposer.setSize(innerWidth, innerHeight);
  finalComposer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  camera.layers.set(BLOOM);   // the glowing things alone
  bloomComposer.render();
  camera.layers.set(0);       // everything
  finalComposer.render();
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). The objects, pixel colours, passes and draw call counts do not depend on the GPU; the milliseconds in the `perf` replies do, and this guide does not use them. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page and look after a few frames.** On a page drawn through a composer, a short wait first lets the page draw frames of its own.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:42475/index.html in 0.3 s, paused at frame 0.

interact {"steps": [{"wait": 3}], "look": true}

Picture: <project>/paprika3d/runs/2026-10-28T10-22-50-750Z/look-1.png
On screen (4):
street 32% [0, 470, 1279, 799] 16 × 10 units
wall 15% [734, 209, 1165, 574]
van 8.2% [0, 372, 370, 602]
neon 0.68% [477, 229, 715, 257] 2.2 × 0.25 units, across the view
Never visible: bulb (0.6 units, in view, behind wall)
```

The picture has a white disc with a warm halo in the middle of the wall. The list says the bulb is never visible, in view and behind the wall. A light source that cannot be seen and whose glow can is the whole bug in two lines.

**2. What is at the glow, and how bright it is.** The point is the middle of the disc; the others are bare wall and the van, for comparison.

```text
look {"at": [[890, 350]]}

At (890, 350): wall 7.08 m at [1.77, 1.61, 1.15]; behind it bulb 8.48 m; background beyond.

look {"sample": [[890, 350], [1100, 300], [180, 480]]}

Colours (5 × 5 mean, in the page's pixels): (890, 350) #fdf9ef, (1100, 300) #524a53, (180, 480) #7d86a4.
```

The nearest surface at that pixel is the wall, at 7.08 m, with the bulb 8.48 m away behind it, and the pixel is near white (`#fdf9ef`) where the bare wall elsewhere is a dull `#524a53`. The van, `#7d86a4`, did not bloom: the layer kept it out.

**3. The layers and the pass.** One `eval`:

```text
eval {"code": "const meshes = [];\nscene.traverse(o => o.isMesh && meshes.push(`${o.name} layers ${o.layers.mask}`));\nreturn { meshes, bloom: { threshold: bloomPass.threshold, strength: bloomPass.strength, radius: bloomPass.radius } }"}

{"meshes":["street layers 1","wall layers 1","van layers 1","neon layers 3","bulb layers 3"],"bloom":{"threshold":0,"strength":1.2,"radius":0.5}}
```

A layers mask of 3 is layers 0 and 1, so the neon and the bulb are in both renders and the wall is in layer 0 alone. With the camera set to layer 1 for the bloom render, the wall is not drawn there; the bulb is drawn whole, bloomed at a threshold of 0, and the mix adds that over the final picture regardless of what the final render put in front of it.

**4. What the chain draws.** `perf` with no options measures the page as it is and lists the passes in one frame:

```text
perf {}

445 ms median frame (p95 577.7 ms, 2 fps on average), 22 draw calls, 1131 triangles, 0 MB assets; over budget: frameMs 445 of 16.7 ms; desktop budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Passes in one frame, each timed to the end of its GPU work (884.7 ms in all: synced passes do not overlap):
  main scene → 1280×800: 26.4 ms, 2 draw calls, 540 triangles
  Mesh (ShaderMaterial) → 640×400: 101.6 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 640×400: 53.2 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 320×200: 82.2 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 320×200: 70.1 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 160×100: 33.2 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 160×100: 28.3 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 640×400: 137.4 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 1280×800: 91.9 ms, 1 draw calls, 1 triangles
  main scene → 1280×800: 81.5 ms, 5 draw calls, 576 triangles
  Mesh (mix) → 1280×800: 76.5 ms, 1 draw calls, 1 triangles
  Mesh (OutputShader) → screen: 53.1 ms, 1 draw calls, 1 triangles
  … 5 more: 49.3 ms
```

The scene is drawn twice per frame: once with 2 draw calls (the neon and the bulb alone, layer 1) and once with 5 (everything). Between them are the bloom's blur passes at half, quarter and eighth size, then the `mix` pass and the output. The first scene render is cheap here precisely because it leaves the wall out, which is the bug. The example's fix, black materials in place of hidden ones, puts every mesh into that first render too.

**5. One composer, a threshold of 1, and the glowing materials turned up.** The two composers and the mix pass become one chain:

```js
// Bloom on what is brighter than 1 before tone mapping: the emissive things, turned up past it.
neon.material.emissiveIntensity = 4;
bulb.material.emissiveIntensity = 3;
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 1);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
```

with `renderer.setAnimationLoop(() => composer.render());` and no layers. The next call reloads the page by itself:

```text
interact {"steps": [{"wait": 3}], "look": true}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.2 s).
Picture: <project>/paprika3d/runs/2026-10-28T10-22-50-750Z/look-3.png
Pixels: brightness 9%, colour saturation 57%, 44% near black, 0% blown out; 98% of the picture changed since the last look. Dark: a viewer sees little.
Never visible: bulb (0.6 units, in view, behind wall)
```

The wall is plain now; the bulb is still behind it and nothing of it shows. But the neon does not glow either: it is a flat pale pink bar. The luminance of this pink is low, so an intensity of 4 left it under the threshold:

```text
0xff2a8a in linear colour: R 1.0, G 0.023, B 0.254
luminance: 0.2126 × 1.0 + 0.7152 × 0.023 + 0.0722 × 0.254 = 0.247 per unit of emissiveIntensity
emissiveIntensity 4: 0.99, under the threshold of 1
emissiveIntensity 5: 1.24, over it
```

**6. Try 5 on the open page.**

```text
eval {"code": "find(\"neon\").material.emissiveIntensity = 5;\nreturn \"neon emissiveIntensity 5\""}

neon emissiveIntensity 5

interact {"steps": [{"wait": 3}]}

look {"sample": [[890, 350], [1100, 300], [180, 480], [596, 243]]}

Pixels: brightness 14%, colour saturation 63%, 11% near black, 0% blown out; 29% of the picture changed since the last look.
Never visible: bulb (0.6 units, in view, behind wall)
Colours (5 × 5 mean, in the page's pixels): (890, 350) #512a39, (1100, 300) #362930, (180, 480) #797d9a, (596, 243) #ffecfa.
```

The neon blooms, a pink halo spreading over the dark sky and onto the near edge of the wall, and 29% of the picture changed with it. The point where the white disc was reads `#512a39`, the wall with a little of the neon's pink, and the van, `#797d9a`, still has no glow of its own. The neon's centre, `(596, 243)`, is `#ffecfa`.

**7. Write 5 into the source and measure the chain again.**

```text
perf {}

401.8 ms median frame (p95 546.4 ms, 2 fps on average), 19 draw calls, 590 triangles, 0 MB assets; over budget: frameMs 401.8 of 16.7 ms; desktop budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Passes in one frame, each timed to the end of its GPU work (407.5 ms in all: synced passes do not overlap):
  main scene → 1280×800: 48.6 ms, 5 draw calls, 576 triangles
  Mesh (ShaderMaterial) → 640×400: 11.7 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 640×400: 41 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 640×400: 41.6 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 320×200: 15.9 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 320×200: 15.1 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 160×100: 24.8 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 160×100: 19.4 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 80×50: 2.7 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 640×400: 29.4 ms, 1 draw calls, 1 triangles
  Mesh (ShaderMaterial) → 1280×800: 32.4 ms, 1 draw calls, 1 triangles
  Mesh (OutputShader) → screen: 119.6 ms, 1 draw calls, 1 triangles
  … 3 more: 5.3 ms
```

One scene render with 5 draw calls, the bloom's passes, and the output: 19 draw calls in all against 22, and 590 triangles against 1,131, since the scene is drawn once. The gap grows with the scene: every mesh drawn in a second scene render is another draw call, and the example's black-material version draws all of them twice.

## What paprika3d does not do

- **No line names a bloom fault.** The evidence is the `Never visible` entry, `at`, the sampled colours and the picture; the conclusion is the agent's.
- **`at` and the object list ignore post-processing.** They come from the scene's geometry, so the halo itself is not an object and is never listed; read it with `sample` or the picture.
- **It does not grade how much glow looks right.** Strength, radius and threshold are taste; the tools picture and measure each setting.
- **The pmndrs `postprocessing` package was not run here.** Its bloom has the same choice, a luminance threshold or a selection of objects; the tools work the same on a page that uses it, but this guide's replies are from three's own passes.
- **Frame times on this host mean nothing for a GPU.** The pass list and its draw calls hold anywhere; the milliseconds next to them do not.

## Pitfalls

- **Bloom before `OutputPass`.** The values above 1 that the threshold relies on exist before tone mapping; a bloom placed after the output pass sees values already squeezed under 1.
- **Black base colour for things that do nothing but glow.** The neon's `color` is black, so its brightness is its emission alone and the arithmetic in step 5 is exact; a lit base colour adds to it.
- **Saturated colours need more intensity.** Green counts for most of luminance and blue for little; pick the intensity per colour, or check each glowing material with `sample` as in step 6.
- **Selective bloom on part of one mesh** is an `emissiveMap`: its bright texels pass the threshold and the rest do not, with no extra mesh or layer. The map multiplies `emissive`, so `emissive` must not be black.
- **With layers, darken instead of hiding.** If the layers recipe stays, follow the example: give non-glowing meshes a black material for the bloom render and restore it after, so walls still cover what is behind them.

## Without paprika3d

Move the camera so a glowing object passes behind another one and watch whether its halo goes with it; that is the glow-through-wall test. To see what each composer draws, render each one into a render target and show it on a quad, or count with `renderer.info` (`autoReset` off, `reset()` before the frame, `render.calls` after). The threshold arithmetic above needs nothing but the colour: convert it to linear with `new THREE.Color(hex)` (three converts on input) and apply the weights.
