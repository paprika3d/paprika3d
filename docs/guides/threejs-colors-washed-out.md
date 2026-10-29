---
title: three.js colors washed out? Tag colour textures sRGB, and find the ones that are not
phrase: three.js colors washed out
description: Why three.js textures and colours draw washed out or too dark since r152, and how a coding agent finds each mistagged texture, the removed encoding code, and the drawn colour at a point from the paprika3d plugin's open and look replies, then checks the fix against the source colours.
meta: three.js colors washed out? Tag colour textures as sRGB, replace pre-r152 encoding code, and find the textures with the wrong colour space.
intent: threejs-colors-washed-out-srgb
queries:
  - "Updates to Color Management in three.js r152"
  - "Three color problem"
  - "Over saturated GLTF texture"
  - "Three.js r152 - Colors washed out or too dark. Tips or advice?"
  - "Three.js loading object from glb file looks washed out"
  - "Washed out colors w/ color-encoding despite conversion"
  - "Getting ugly color Effect while Using Post-Processing"
  - "Texture are Darker on Initial Load (while using post-processing).what am I missing here?"
  - "Color Management - Slight color differences when using EffectComposer r152"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js colors washed out? Tag colour textures sRGB, and find the ones that are not

## Why colours wash out

Image files store colour in sRGB, a curve that spends more of each byte on dark shades. three.js lights and blends colour in linear values, then converts the finished frame back to sRGB for the screen (`renderer.outputColorSpace`, `SRGBColorSpace` by default since r152). Every texture has to say which of the two its pixels are in:

- **A colour texture** (`map`, `emissiveMap`) holds sRGB pixels and needs `texture.colorSpace = THREE.SRGBColorSpace`. Left at the default, `NoColorSpace`, its pixels are read as linear and then brightened a second time on the way out: the picture looks pale, grey and washed out.
- **A data texture** (`normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`) holds numbers, not colours, and must stay `NoColorSpace`. Tagged sRGB, its numbers are bent by the curve: normals tilt, and roughness and occlusion come out wrong, usually darker.
- **A colour given as numbers** (`new THREE.Color(0.75, 0.22, 0.17)`, `setRGB`, vertex colours) is read as linear since r152, while a hex value or a CSS string is read as sRGB.

`GLTFLoader` tags a model's own textures correctly. The mistakes come from textures the page makes or swaps in: a `CanvasTexture`, a `TextureLoader` image, a texture changed by a configurator, and code written for three.js before r152, which set `texture.encoding = THREE.sRGBEncoding`. On r162 and later that constant is gone, so the line sets nothing and raises no error.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Its `open` reply names the lines of the project's source that use the removed encoding API, and both `open` and `look` count the textures tagged the wrong way in the live scene. `look` with `sample` returns the colour drawn at a point, which a coding agent can set against the colour in the source.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page written from an old tutorial

A poster painted in a canvas in four flat colours, and a tiled panel with a colour map and a normal map for its grout. The code mixes three mistakes: the pre-r152 encoding lines, a poster texture with no colour space, and a loop that tags every texture sRGB, the normal map included.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Showroom</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;   // from a pre-r152 tutorial
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e2228);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 9);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 3, 5);
scene.add(sun);

const paint = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d')); return c; };

// A poster in four flat brand colours.
const SWATCHES = ['#c0392b', '#2e86de', '#f1c40f', '#808080'];
const label = new THREE.CanvasTexture(paint((g) => SWATCHES.forEach((s, i) => { g.fillStyle = s; g.fillRect(i * 64, 0, 64, 256); })));
label.encoding = THREE.sRGBEncoding;   // from the same tutorial
const poster = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), new THREE.MeshBasicMaterial({ map: label, toneMapped: false }));
poster.name = 'poster';
poster.position.x = -2.4;
scene.add(poster);

// A tiled panel: a colour map and a normal map for the grout.
const tiles = new THREE.CanvasTexture(paint((g) => {
  g.fillStyle = '#d9d2c5'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#6b5f52'; for (let i = 0; i < 256; i += 64) { g.fillRect(i, 0, 6, 256); g.fillRect(0, i, 256, 6); }
}));
const grout = new THREE.CanvasTexture(paint((g) => {
  g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgb(128,200,200)'; for (let i = 0; i < 256; i += 64) { g.fillRect(0, i, 256, 6); }
  g.fillStyle = 'rgb(200,128,200)'; for (let i = 0; i < 256; i += 64) { g.fillRect(i, 0, 6, 256); }
}));
for (const t of [tiles, grout]) t.colorSpace = THREE.SRGBColorSpace;   // tags every texture, the normal map too
const panel = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: tiles, normalMap: grout, roughness: 0.6 }));
panel.name = 'panel';
panel.position.x = 2.4;
panel.rotation.y = -0.35;
scene.add(panel);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The poster has `toneMapped: false` on purpose: flat graphics and interface colours should reach the screen as painted, so the colour sampled on screen can be compared with the hex in the source.

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, which is what the `GPU:` line says; colour spaces do not depend on it. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page.** Before any picture, `open` reads the project's source for removed three.js API and the live scene's textures for their colour space:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:39111/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
index.html:11 uses outputEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:11 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:29 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
Page text outside the canvas: none
Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
Lighting: 1 data textures (normal, roughness, metalness, ao) tagged sRGB: set texture.colorSpace = NoColorSpace.
{"three":"186","scenes":1,"entities":["poster","panel"]}
```

The source lines and the scene lines are separate checks. The first three name where the old code is, by file and line. The two `Lighting:` lines count what the scene holds now, whichever code put it there.

**2. Read what the old lines did.** `eval` runs in the page, so it can read what the assignments left behind:

```text
eval {"code": "const p = find('poster').material, w = find('panel').material;\nreturn { sRGBEncoding: String(THREE.sRGBEncoding), outputColorSpace: renderer.outputColorSpace, poster: p.map.colorSpace, tiles: w.map.colorSpace, grout: w.normalMap.colorSpace }"}

{"sRGBEncoding":"undefined","outputColorSpace":"srgb","poster":"","tiles":"srgb","grout":"srgb"}
```

`THREE.sRGBEncoding` is `undefined` on r186, so `label.encoding = THREE.sRGBEncoding` set a property nothing reads, and the poster's texture kept the empty string, `NoColorSpace`. The output was never the problem: `outputColorSpace` is already `srgb`. The normal map is `srgb` because of the loop.

**3. Measure the drawn colour.** `look` with `sample` returns the mean of 5 × 5 pixels at each point, here the middle of each swatch and one tile of the panel:

```text
look {"sample": [[164, 400], [286, 400], [408, 400], [529, 400], [890, 360]]}

Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
Lighting: 1 data textures (normal, roughness, metalness, ao) tagged sRGB: set texture.colorSpace = NoColorSpace.
On screen (2):
poster 15% [103, 247, 590, 552] 4 × 2.5 units
panel 14% [754, 206, 1132, 593] 3 × 3 units
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (164, 400) #e18272, (286, 400) #76c0f0, (408, 400) #f9e345, (529, 400) #bcbcbc, (890, 360) #5f5b53.
```

Set against the source, every swatch is lighter: `#c0392b` drew as `#e18272`, and the middle grey `#808080` as `#bcbcbc`. That is what washed out means in numbers. The panel's tile, painted `#d9d2c5`, drew as `#5f5b53`, darker than its paint, because the bent normals turn it away from the light.

**4. Try the fix in the page.** `eval` changes the two textures without touching the source:

```text
eval {"code": "const p = find('poster').material, w = find('panel').material;\np.map.colorSpace = THREE.SRGBColorSpace; p.map.needsUpdate = true;\nw.normalMap.colorSpace = THREE.NoColorSpace; w.normalMap.needsUpdate = true;\nreturn [p.map.colorSpace, w.normalMap.colorSpace]"}

["srgb",""]
```

`needsUpdate` matters: a texture already uploaded to the GPU keeps its old colour space until it is uploaded again.

**5. Sample the same points.**

```text
look {"sample": [[164, 400], [286, 400], [408, 400], [529, 400], [890, 360]]}

Pixels: brightness 26%, colour saturation 28%, 0% near black, 0% blown out; 30% of the picture changed since the last look.
On screen (2):
poster 15% [103, 247, 590, 552] 4 × 2.5 units
panel 14% [754, 206, 1132, 593] 3 × 3 units
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (164, 400) #c0392b, (286, 400) #2e86de, (408, 400) #f1c40f, (529, 400) #808080, (890, 360) #bfbbb4.
```

The four swatches now match the four hex values in `SWATCHES` exactly, both `Lighting:` lines are gone, and the tile is lit as its paint. The change to write into the source:

```js
// renderer.outputEncoding: delete the line; outputColorSpace is SRGBColorSpace by default.
label.colorSpace = THREE.SRGBColorSpace;   // a colour texture
tiles.colorSpace = THREE.SRGBColorSpace;   // the colour map only: the normal map keeps NoColorSpace
```

Opened again with those lines, the reply has no stale three.js lines and no `Lighting:` lines.

## A colour no line names: numbers in 0 to 1

The fixed page has one more object, a chip under the poster meant to match the poster's red. It is given as three numbers, as a pre-r152 tutorial or a colour picker's 0 to 1 output would give it:

```js
const chip = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.22, 0.17), toneMapped: false }));
```

No line in the `look` reply names it: a colour value carries no tag to check, and the numbers could be meant as linear. The sample shows it:

```text
look {"sample": [[164, 400], [529, 400], [890, 360], [163, 619]]}

On screen (3):
poster 15% [103, 247, 590, 552] 4 × 2.5 units
panel 14% [754, 206, 1132, 593] 3 × 3 units
chip 0.73% [103, 589, 224, 649] 1 × 0.5 units, across the view
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (164, 400) #c0392b, (529, 400) #808080, (890, 360) #bfbbb4, (163, 619) #e18173.

eval {"code": "const c = find('chip').material.color;\nconst before = c.getHexString();\nc.setRGB(0.75, 0.22, 0.17, THREE.SRGBColorSpace);\nreturn { before, after: c.getHexString() }"}

{"before":"e18173","after":"bf382b"}

look {"sample": [[163, 619]]}

Colours (5 × 5 mean, in the page's pixels): (163, 619) #bf382b.
```

The chip drew as `#e18173`, the same washed-out red as the untagged poster. Passing the colour space to `setRGB` reads the numbers as sRGB, and the chip draws `#bf382b`, the poster's red to within the rounding of the three numbers. Writing the colour as hex, `new THREE.Color(0xc0392b)`, gives the same result.

## Why do three.js colours change when I add an EffectComposer?

Drawn straight to the screen, each material's shader ends with the tone mapping and the conversion to sRGB. Through an `EffectComposer`, the `RenderPass` draws into a render target instead, where three.js keeps linear values and applies neither, so some later pass has to. Since r155 that pass is `OutputPass`, last in the chain. A composer added for antialiasing or bloom without one puts linear values on the screen, and the whole picture goes darker and more saturated. This page paints four brand colours on a poster and draws it through a composer for FXAA:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Swatches</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(0, 0, 6);

// Four brand colours painted on a canvas, drawn flat: what is on screen should be these hex values.
const SWATCHES = ['#c0392b', '#2e86de', '#f1c40f', '#808080'];
const paint = document.createElement('canvas');
paint.width = 512; paint.height = 128;
const ctx = paint.getContext('2d');
SWATCHES.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * 128, 0, 128, 128); });
const label = new THREE.CanvasTexture(paint);
label.colorSpace = THREE.SRGBColorSpace;
const poster = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: label }));
poster.name = 'poster';
scene.add(poster);

// Antialiasing through a composer: the render pass draws into a render target, FXAA draws it to the screen.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new FXAAPass());
window.composer = composer;

renderer.setAnimationLoop(() => composer.render());
</script>
</body></html>
```

`open` reads the project's source for a composer with no `OutputPass` and says so before any picture. The replies below were captured on 2026-10-28 on the same host as above and cut to the lines this section discusses; each `look` comes after an `interact` step that waits three frames, since a composer page has not drawn a frame of its own at frame 0:

```text
open {"url": "index.html", "cwd": "<project>"}

EffectComposer without an OutputPass: since r155 tone mapping and the output colour space apply only on the screen pass, so add new OutputPass() as the last pass.

look {"sample": [[365, 400], [548, 400], [731, 400], [914, 400], [100, 100]]}

poster 13% [274, 308, 1005, 491] 4 × 1 units, across the view
Colours (5 × 5 mean, in the page's pixels): (365, 400) #860a06, (548, 400) #073dba, (731, 400) #e08d01, (914, 400) #373737, (100, 100) #dedede.
```

Every colour is darker than its source: `#c0392b` drew as `#860a06`, the middle grey `#808080` as `#373737`, and the `#f0f0f0` background as `#dedede`. The `Lighting:` lines have nothing to say here, since every texture is tagged correctly; the fault is in the chain. `eval` can add the pass to the running page to try it:

```text
eval {"code": "const { OutputPass } = await import(\"three/addons/postprocessing/OutputPass.js\");\ncomposer.addPass(new OutputPass());\nreturn composer.passes.map((p) => p.constructor.name)"}

["RenderPass","FXAAPass","OutputPass"]

look {"sample": [[365, 400], [548, 400], [731, 400], [914, 400], [100, 100]]}

Colours (5 × 5 mean, in the page's pixels): (365, 400) #c0392b, (548, 400) #2e86de, (731, 400) #f1c40f, (914, 400) #808080, (100, 100) #f0f0f0.
```

All five points now match the source exactly. In the page's code the fix is one import and `composer.addPass(new OutputPass())` after the FXAA pass. A page from before r155 that converted with `ShaderPass(GammaCorrectionShader)` should drop that pass when it adds `OutputPass`, or the conversion is applied twice.

`OutputPass` also changes what `toneMapped: false` means. It applies the renderer's tone mapping to every pixel of the finished frame, so a material can no longer opt out. Here the renderer is given ACES tone mapping and the poster's material `toneMapped: false`, which on a page without a composer keeps the poster at its hex values:

```text
eval {"code": "renderer.toneMapping = THREE.ACESFilmicToneMapping; scene.getObjectByName(\"poster\").material.toneMapped = false; return \"aces\""}

aces

look {"sample": [[365, 400], [548, 400], [731, 400], [914, 400], [100, 100]]}

Colours (5 × 5 mean, in the page's pixels): (365, 400) #cf2f25, (548, 400) #3694d6, (731, 400) #e2cb45, (914, 400) #8d8d8d, (100, 100) #dedede.
```

The red came out as `#cf2f25` and the grey as `#8d8d8d`: ACES reached the poster anyway. A page that needs tone mapping on its lit scene and exact colours on flat graphics has to keep the flat ones out of the composer, in HTML over the canvas for example, or go without tone mapping for the whole frame as the page above does.

## What to read in the replies

- `open`, the lines that say `uses sRGBEncoding` or `uses outputEncoding`: the file and line of code written for three.js before r152. They mean nothing in the scene by themselves; the `Lighting:` lines say what the scene holds.
- `open` and `look`, `Lighting: N colour textures not tagged sRGB`: colour maps that draw washed out.
- `open` and `look`, `Lighting: N data textures ... tagged sRGB`: normal, roughness, metalness or ao maps that bend the lighting.
- `look` with `sample`: the colour drawn at each point, to set against the colour in the source or the reference image. It is the check for colours given as numbers, which no line names.

## Pitfalls

- **Tag on creation, or set `needsUpdate`.** A colour space changed after the texture's first upload has no effect until `texture.needsUpdate = true`.
- **Do not tag every texture.** A loop over a material's maps that sets sRGB on all of them is the commonest way a normal map ends up tagged.
- **Tone mapping changes colours on purpose.** With `ACESFilmicToneMapping`, a lit material's colour will not match its hex, and that is not a colour space fault. Set `toneMapped: false` on flat graphics that must match a brand colour.
- **A post-processing chain needs an `OutputPass` last.** Since r155 the output colour space is applied there; `open` says so when an `EffectComposer` has none.
- **No line checks `renderer.outputColorSpace`.** A page that sets it to `LinearSRGBColorSpace` draws everything dark; `eval` reads the value.
- **paprika3d reports colour spaces; it does not change them.** The agent edits the source and opens the page again.

## Without paprika3d

In the page, `scene.traverse` over every material and its texture slots lists each texture's `colorSpace` in the console, which is the same count the `Lighting:` lines give. A search of the source for `encoding` finds the pre-r152 code. For drawn colours, `renderer.readRenderTargetPixels` or `gl.readPixels` right after a render (or a renderer made with `preserveDrawingBuffer: true`) returns the pixel values, and an eyedropper on a screenshot of the page gives the same number. The three.js manual's colour management page explains the working and output colour spaces in full.
