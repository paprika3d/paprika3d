---
title: three.js transparent background with alpha, and the post-processing pass that paints it black again
phrase: three.js transparent background
description: How to make a three.js canvas transparent so the page shows behind it (alpha true, a clear alpha of 0, no scene.background), and how to find the EffectComposer pass that paints it black again, shown with the paprika3d plugin's look, sample and eval replies before and after the fix.
meta: three.js transparent background with alpha: true and a clear colour, and the post-processing pass that turns it black again.
intent: transparent-canvas-background
queries:
  - "Changing three.js background to transparent or other color"
  - "Transparent background with three.js"
  - "How to get my scene background to be transparent?"
  - "How do I stop EffectComposer from destroying my transparent background?"
  - "ThreeJS- Adding bloom pass affects canvas transparency"
  - "three.js bloom is a blur?"
  - "(Three.js) Bloom effect performance"
  - "Post Effects and Transparent background in three.js"
  - "Unreal Bloom and Renderer Transparency issue"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js transparent background with alpha, and the post-processing pass that paints it black again

## The answer is one line

```js
const renderer = new THREE.WebGLRenderer({ alpha: true });
```

With `alpha: true`, three.js clears the canvas to a clear alpha of 0 before each frame, so every pixel the scene does not draw stays transparent and the page behind the canvas shows through. Three things undo it:

- **`scene.background`.** Any background colour, texture or environment drawn as the background fills those pixels again. Leave it `null`.
- **`renderer.setClearColor(color)` with one argument.** Its alpha defaults to 1, which makes the canvas opaque. Pass the alpha too: `renderer.setClearColor(0x000000, 0)`, or call `renderer.setClearAlpha(0)`.
- **A CSS background on the canvas element** covers the page as surely as a scene background does.

That answers most of the threads. The case that takes longer is post-processing: the page was transparent, an `EffectComposer` went in, and the background is black again. Every setting still reads right, so the cause is one of the passes, and finding which one is the part the tools help with.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Its `look` reply pictures the page as Chrome composites it, page and canvas together, and with `sample` it returns the colour at chosen points, so a coding agent can read whether the page behind the canvas really shows at a pixel where it should. On a transparent canvas the same reply has a `Behind the canvas` line naming the page background and the text behind the canvas. `eval` reads the renderer and the composer in the open page, and switches a pass off to try the page without it before the source changes.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The plain case

A product page: a cream page with a heading, and a fixed canvas over all of it with a glowing lamp on the right. The heading sits behind the canvas, so it can be read just where the canvas is transparent.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Lumen</title>
<style>
html,body{margin:0;height:100%;background:#f3e9d8;color:#2a2018;font:18px sans-serif}
section{padding:120px 0 0 80px}
h1{font-size:72px;margin:0}
canvas{position:fixed;inset:0;display:block}
</style></head>
<body>
<section><h1>Lumen</h1><p>A desk lamp that glows.</p></section>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// alpha: true gives a clear alpha of 0, so wherever the scene draws nothing the page shows through
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();   // no scene.background: a background would cover the page again
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
const lamp = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16),
  new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5500, emissiveIntensity: 1.5 }));
lamp.name = 'lamp';
lamp.position.x = 1.5;
scene.add(lamp);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  lamp.rotation.y += 0.01;
  renderer.render(scene, camera);
});
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times. First the page as it is often first written, `new THREE.WebGLRenderer({ antialias: true })` with no `alpha`; the two points sampled are page background below the heading and above the lamp:

```text
open {"url": "plain-opaque.html", "cwd": "<project>"}

Opened http://127.0.0.1:41181/plain-opaque.html in 0.2 s, paused at frame 0.

look {"sample": [[200, 300], [640, 100]]}

Pixels: brightness 9%, colour saturation 10%, 87% near black, 0% blown out. Mostly black: the objects cover 12.7% of the frame.
On screen (1):
lamp 13% [686, 182, 1121, 630]
Colours (5 × 5 mean, in the page's pixels): (200, 300) #000000, (640, 100) #000000.

eval {"code": "return { clearAlpha: renderer.getClearAlpha(), contextAlpha: renderer.getContext().getContextAttributes().alpha, background: scene.background }"}

{"clearAlpha":1,"contextAlpha":true,"background":null}
```

Black at both points, and no `Behind the canvas` line, because the canvas is opaque. The `eval` reply holds a trap: the WebGL context reports `alpha` true even without the option, because three.js always asks the browser for an alpha channel and makes the canvas opaque with a clear alpha of 1. `renderer.getClearAlpha()` is the value to read. With `alpha: true` added:

```text
look {"sample": [[200, 300], [640, 100]]}

Pixels: brightness 88%, colour saturation 20%, 0% near black, 0% blown out.
Behind the canvas: transparent (alpha, clear 0, no scene background), the page shows through 83% of it; page background #f3e9d8 (body); h1 "Lumen" shows through 100% of its box; p "A desk lamp that glows." shows through 100% of its box.
Colours (5 × 5 mean, in the page's pixels): (200, 300) #f3e9d8, (640, 100) #f3e9d8.

eval {"code": "return { clearAlpha: renderer.getClearAlpha(), contextAlpha: renderer.getContext().getContextAttributes().alpha, background: scene.background }"}

{"clearAlpha":0,"contextAlpha":true,"background":null}
```

The sampled colour is now the page's own `#f3e9d8`, and the new line names what shows through: the body's background and both pieces of text, each fully readable. For this case the tools confirm the one line and add nothing to it.

## With post-processing: the page goes black again

The same page with an `EffectComposer` from `three/addons/postprocessing`: a `RenderPass`, an `UnrealBloomPass` for the glow, a vignette written by hand as a `ShaderPass`, and the `OutputPass` that applies tone mapping and the sRGB conversion. This is the working version; the version that went black differs in one line, shown after it.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Lumen</title>
<style>
html,body{margin:0;height:100%;background:#f3e9d8;color:#2a2018;font:18px sans-serif}
section{padding:120px 0 0 80px}
h1{font-size:72px;margin:0}
canvas{position:fixed;inset:0;display:block}
</style></head>
<body>
<section><h1>Lumen</h1><p>A desk lamp that glows.</p></section>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
const lamp = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16),
  new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5500, emissiveIntensity: 1.5 }));
lamp.name = 'lamp';
lamp.position.x = 1.5;
scene.add(lamp);

// A hand-written vignette after the bloom. Its last line must pass the alpha on: c.a, not 1.0.
const vignette = new ShaderPass({
  name: 'vignette',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float v = 1.0 - 0.8 * distance(vUv, vec2(0.5));
      gl_FragColor = vec4(c.rgb * v, c.a);
    }`,
});
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.3, 0.5));
composer.addPass(vignette);
composer.addPass(new OutputPass());
window.composer = composer;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  lamp.rotation.y += 0.01;
  composer.render();
});
</script>
</body></html>
```

The version that went black ends its vignette the way many shader snippets do, with an alpha of 1:

```glsl
gl_FragColor = vec4(c.rgb * v, 1.0);
```

### Before the fix

```text
open {"url": "black.html", "cwd": "<project>"}

Opened http://127.0.0.1:41181/black.html in 0.2 s, paused at frame 0.

interact {"steps": [{"wait": 5}]}

{"after":null,"changed":{}}

look {"sample": [[200, 300], [640, 100]]}

Pixels: brightness 23%, colour saturation 82%, 22% near black, 0% blown out.
Behind the canvas: transparent (alpha, clear 0, no scene background), the page shows through 83% of it; page background #f3e9d8 (body); h1 "Lumen" shows through 100% of its box; p "A desk lamp that glows." shows through 100% of its box.
On screen (1):
lamp 13% [684, 182, 1116, 630]
Colours (5 × 5 mean, in the page's pixels): (200, 300) #090000, (640, 100) #6d0e01.
```

The picture is the lamp's glow on black, with no heading. The reply disagrees with itself, and the disagreement is the clue. The `Behind the canvas` line is worked out from the renderer's settings (a clear alpha below 1, no scene background, no CSS background on the canvas) and from where the scene draws objects, so it says what the settings promise: the heading should show. The sampled colours are the finished pixels, and at the point below the heading they are near black (`#090000`) instead of the page's `#f3e9d8`. Settings that promise a transparent canvas and pixels that are not transparent mean a pass after the render wrote alpha.

`eval` rules out the setup, the usual suspect in the older threads, and lists the passes:

```text
eval {"code": "const name = (v, end) => Object.keys(THREE).find(k => k.endsWith(end) && THREE[k] === v); const t = composer.readBuffer.texture; return { clearAlpha: renderer.getClearAlpha(), background: scene.background, format: name(t.format, 'Format'), type: name(t.type, 'Type'), passes: composer.passes.map(p => p.constructor.name === 'ShaderPass' ? 'ShaderPass ' + p.material.name : p.constructor.name) }"}

{"clearAlpha":0,"background":null,"format":"RGBAFormat","type":"HalfFloatType","passes":["RenderPass","UnrealBloomPass","ShaderPass vignette","OutputPass"]}
```

The clear alpha is 0, there is no background, and the composer's render targets are `RGBAFormat`, so they carry an alpha channel through the chain. That leaves the passes. The next call switches the vignette off in the running page (the source is untouched, and a reload brings it back), and the look after a couple of frames reads the same two points:

```text
eval {"code": "composer.passes.find(p => p.material?.name === 'vignette').enabled = false; return composer.passes.map(p => p.enabled)"}

[true,true,false,true]

interact {"steps": [{"wait": 2}]}

look {"sample": [[200, 300], [640, 100]]}

Pixels: brightness 84%, colour saturation 32%, 0% near black, 0% blown out; 87% of the picture changed since the last look.
Colours (5 × 5 mean, in the page's pixels): (200, 300) #fde5d4, (640, 100) #ffcba8.
```

With the vignette off, the page is back. The bloom pass kept the canvas transparent: the point below the heading is the cream page lightened slightly by the glow, and the point above the lamp is the page under the brighter part of the halo. So the bloom pass was never the culprit here, and the vignette's `1.0` was.

### After the fix

The vignette's last line passes the alpha on, `gl_FragColor = vec4(c.rgb * v, c.a);`, as in the page above:

```text
open {"url": "index.html", "cwd": "<project>"}

interact {"steps": [{"wait": 5}]}

look {"sample": [[200, 300], [640, 100]]}

Pixels: brightness 82%, colour saturation 34%, 0% near black, 0% blown out; 82% of the picture changed since the last look.
Behind the canvas: transparent (alpha, clear 0, no scene background), the page shows through 83% of it; page background #f3e9d8 (body); h1 "Lumen" shows through 100% of its box; p "A desk lamp that glows." shows through 100% of its box.
Colours (5 × 5 mean, in the page's pixels): (200, 300) #f8e5d4, (640, 100) #ffc1a7.
```

The settings line and the pixels agree again, and the picture shows the heading beside the glowing lamp, with the glow lightening the cream page around it.

## Which passes write alpha

In the three.js release these pages load (r186), the chain above keeps transparency until a pass writes an alpha of 1 where the scene drew nothing. The ones to look at first:

- **Shaders you wrote or copied.** Any `gl_FragColor = vec4(color, 1.0)` at the end of a `ShaderPass`. Pass the input's alpha on instead.
- **Passes whose shader sets it.** In r186, `BokehShader` (depth of field) and the colour branch of `HalftoneShader` end like this:

```glsl
gl_FragColor = col / 41.0;
gl_FragColor.a = 1.0;
```

```glsl
gl_FragColor = vec4( r, g, b, 1.0 );
```

- **Older releases.** The two composer threads quoted most often were written in 2014 and 2020, against three.js releases whose composer or bloom pass dropped alpha. In r186, `UnrealBloomPass` writes its glow's alpha (`gl_FragColor = vec4( bloom, bloomAlpha );`), as the run above shows. Check the version before patching it.

Switching passes off one at a time from `eval` and reading `sample` after each finds the one that writes alpha without editing the file.

## Why is my three.js bloom too strong, or a blur over the whole scene?

Whether bloom keeps a transparent canvas is answered above: in r186 `UnrealBloomPass` passes the alpha on, and the pass that paints the page black is usually another one. The other bloom questions are about its three numbers, `new UnrealBloomPass(resolution, strength, radius, threshold)`. The threshold is the luminance a pixel of the `RenderPass` output must pass before it glows, in linear values where 1 is full white. At 0, every lit pixel glows, and the pass becomes a blur laid over the whole picture. This page has a dark floor, a lit crate and a neon sign whose emissive colour is set to four times full brightness, with the threshold at 0:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Neon</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10131a);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 50);
camera.position.set(0, 1.6, 7);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));

const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshStandardMaterial({ color: 0x404650 }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xb8b0a0 }));
crate.name = 'crate';
crate.position.set(-2, 0.6, 0);
// The sign glows: an emissive colour at 4 times full brightness, which only it reaches.
const sign = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 16, 64), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2a8a, emissiveIntensity: 4 }));
sign.name = 'sign';
sign.position.set(1.6, 1.6, 0);
scene.add(floor, crate, sign);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.5, 0.4, 0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
window.bloom = bloom;

renderer.setAnimationLoop(() => composer.render());
</script>
</body></html>
```

The replies below were captured on 2026-10-28 on the same host, each `look` after an `interact` wait of three frames, and cut to the lines this section discusses. The five points sampled are the sky, the floor, the crate, the sign's ring and a corner of the sky far from the sign. First the page as written, then with the bloom switched off as a reference:

```text
look {"sample": [[100, 100], [200, 700], [356, 460], [861, 205], [1180, 120]]}

Pixels: brightness 64%, colour saturation 21%, 0% near black, 0% blown out.
Hues: grey 63%, magenta 31%, blue 6% of the frame; over the objects (47.5% of it): grey 100%.
Colours (5 × 5 mean, in the page's pixels): (100, 100) #434a61, (200, 700) #c2c9d4, (356, 460) #f0eeeb, (861, 205) #fff5fd, (1180, 120) #854a72.

eval {"code": "bloom.enabled = false; return { threshold: bloom.threshold, strength: bloom.strength, radius: bloom.radius }"}

{"threshold":0,"strength":1.5,"radius":0.4}

look {"sample": [[100, 100], [200, 700], [356, 460], [861, 205], [1180, 120]]}

Pixels: brightness 10%, colour saturation 47%, 53% near black, 0% blown out; 100% of the picture changed since the last look. Dark: a viewer sees little.
Colours (5 × 5 mean, in the page's pixels): (100, 100) #030408, (200, 700) #212730, (356, 460) #736d62, (861, 205) #ffb0e4, (1180, 120) #030408.
```

With the bloom on, the night sky is `#434a61` instead of `#030408`, the dark floor is a pale `#c2c9d4`, and the crate glows almost white: the whole frame went from 10% to 64% brightness. A threshold of 1, which keeps everything up to full white from glowing, removes the glow altogether here:

```text
eval {"code": "bloom.enabled = true; bloom.threshold = 1; return \"threshold 1\""}

threshold 1

look {"sample": [[100, 100], [200, 700], [356, 460], [861, 205], [1180, 120]]}

Pixels: brightness 10%, colour saturation 47%, 53% near black, 0% blown out; 0% of the picture changed since the last look. Dark: a viewer sees little.

eval {"code": "const m = find(\"sign\").material, c = m.emissive.clone().multiplyScalar(m.emissiveIntensity);\nreturn { linear: c.toArray().map((n) => +n.toFixed(3)), luminance: +(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b).toFixed(3) }"}

{"linear":[4,0.093,1.017],"luminance":0.99}
```

Nothing changed from the frame without bloom, and the `eval` says why: luminance weighs green most and blue least, so a saturated pink at four times its colour still sits at 0.99, under the threshold. The threshold has to sit between what the glowing parts reach and what the lit scene reaches. At 0.5:

```text
eval {"code": "bloom.threshold = 0.5; return \"threshold 0.5\""}

threshold 0.5

look {"sample": [[100, 100], [200, 700], [356, 460], [861, 205], [1180, 120]]}

Pixels: brightness 23%, colour saturation 63%, 9% near black, 0% blown out; 65% of the picture changed since the last look.
Hues: magenta 55%, grey 39%, blue 5% of the frame; over the objects (47.5% of it): magenta 64%, grey 25%, blue 11%.
Colours (5 × 5 mean, in the page's pixels): (100, 100) #060409, (200, 700) #262731, (356, 460) #846e68, (861, 205) #fff5fd, (1180, 120) #65002e.
```

The sky, the floor and the crate are back near their unbloomed colours, and the sign's ring glows. The glow itself is still large: magenta covers 55% of the frame, and the far corner of the sky is `#65002e`. That spread is `strength` (how much glow is added) and `radius` (how far it reaches):

```text
eval {"code": "bloom.strength = 0.6; bloom.radius = 0.2; return \"strength 0.6, radius 0.2\""}

strength 0.6, radius 0.2

look {"sample": [[100, 100], [200, 700], [356, 460], [861, 205], [1180, 120]]}

Pixels: brightness 17%, colour saturation 57%, 15% near black, 0% blown out; 48% of the picture changed since the last look.
Hues: grey 58%, magenta 32%, blue 10% of the frame; over the objects (47.5% of it): magenta 39%, grey 39%, blue 20%.
Colours (5 × 5 mean, in the page's pixels): (100, 100) #040408, (200, 700) #232731, (356, 460) #786e64, (861, 205) #ffeaf9, (1180, 120) #280515.
```

How much glow is right is a matter of taste, and paprika3d does not decide it; the samples and the `Hues` shares say where the glow reaches, so each change is a number before it is a judgement. For the cost, `perf` with a variant that switches the pass off measures both in one call:

```text
perf {"variants": [{"label": "no bloom", "code": "bloom.enabled = false"}]}

baseline: 649.5 ms median (p95 772.9), work 579 ms, 17 draw calls, 2076 triangles; over budget: frameMs 649.5 of 16.7 ms; desktop budget
no bloom: 76 ms median (p95 95.1), work 59.9 ms, 4 draw calls, 2063 triangles; −88% vs baseline; −76% draw calls
Noise between two samples of the baseline: 148.6 ms. Load to first frame: 0.1 s.
Host load 20.2 on 64 cores. GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
```

The draw calls do not depend on the GPU: the bloom adds 13 draw calls a frame (a bright-pass, ten blurs at five shrinking sizes, and two passes that combine them and add them back), whatever the scene holds. The frame times come from a software renderer, and the noise line shows how far two samples of the same page differ; this guide draws nothing from them, and on a machine with one, the same call gives the pass's cost.

## What paprika3d does not do

- It does not change the pass or write the shader fix. It reports the settings, the pixels and the passes, and the agent changes the code.
- The `Behind the canvas` line reads the renderer's settings and where the scene's objects are drawn, not the composited result, so on a composer page it says the page shows through even when a pass painted over it, as in the reply before the fix. Read `sample` or the picture for what a visitor sees.
- On these composer pages, a look taken right after `open`, at frame 0 before the page has drawn a frame of its own, pictured the clear part black, the fixed page included: `(200, 300) #090000` on `index.html`. After an `interact` wait of a few frames the same look showed the page, as above, and as Chrome without paprika3d showed it. Take the look after a short wait on a page drawn through a composer.
- It does not check how the canvas blends into the page in every browser; the pictures are Chrome's compositing.

## Pitfalls

- **Name your own passes.** A `ShaderPass` built from an object with a `name` gives its material that name, so a list of passes from `eval` says which one is the vignette.
- **Premultiplied alpha.** The canvas is composited with premultiplied alpha by default, so a pass that writes colour where alpha is small adds light to the page behind it. The bloom's halo lightens a light page; on a dark page it reads as glow.
- **Resize the composer with the renderer.** `composer.setSize` in the resize handler keeps its render targets the canvas's size.

## Without paprika3d

Give the page a loud background (a checkerboard or a bright colour) while you work, so any opaque pixel stands out. In the console, `renderer.getClearAlpha()` and `scene.background` check the setup. To read the canvas's own alpha at a pixel, call `composer.render()` and then, in the same task, `gl.readPixels(x, height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)` on `renderer.getContext()`; an alpha of 255 where the page should show is the fault. Then set `pass.enabled = false` on each pass in turn until it turns 0.
