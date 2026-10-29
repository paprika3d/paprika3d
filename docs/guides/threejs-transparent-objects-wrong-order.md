---
title: three.js transparent objects render in the wrong order? Name what each pixel drew, then set alphaTest, renderOrder or depthWrite
phrase: three.js transparent objects render in the wrong order
description: Why a transparent object in three.js hides what is behind it or cuts a hole in its neighbour, and how a coding agent finds the material at fault with the paprika3d plugin's look (the objects at a pixel, nearest first, and a colour sample), lists every transparent material's flags and sort depth with eval, sees the fault flip from four cameras, and checks alphaTest, renderOrder and depthWrite on the open page before editing the source.
meta: three.js transparent object hides what is behind it? Find the material at fault, then fix it with alphaTest, renderOrder or depthWrite.
intent: transparent-objects-wrong-draw-order
queries:
  - "Transparent objects in Three.js"
  - "ThreeJS and the transparent problem"
  - "Three.js - depthWrite vs depthTest for transparent canvas texture map on THREE.Points"
  - "Transparency not working right"
  - "How to render transparent Object in correct order or looks like right？"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js transparent objects render in the wrong order? Name what each pixel drew, then set alphaTest, renderOrder or depthWrite

## How three.js orders transparent objects

three.js draws a frame in two passes. Opaque meshes go first, nearest to farthest, and the depth buffer sorts them out pixel by pixel, so their order does not matter for the picture. Meshes whose material has `transparent = true` go second, farthest to nearest, because a see-through surface has to be blended over whatever is already behind it. That second sort is per object, not per pixel: in r186 `WebGLRenderLists` sorts by `renderOrder`, then by the depth of the object's origin in front of the camera, then by creation order.

A transparent material still writes depth by default (`depthWrite` is `true`). So when the sort puts a nearer object first, it fills the depth buffer, and the object behind it, drawn second, fails the depth test and is not drawn at all. Three shapes of this come up again and again in the threads:

- **A large transparent surface and a small object behind it.** Water, a window or a glass case has its origin in the middle; an object under or behind part of it can have an origin nearer the camera, so it is drawn after the surface and vanishes.
- **A texture with clear pixels on a transparent material.** Leaves, hair, fences and sprites: the clear pixels are invisible but still write depth, so they punch the card's rectangle out of anything drawn after it.
- **The fault flips with the camera.** The sort uses origins, so moving the camera changes which object is drawn first, and the bug appears at some angles and not others.

The fixes are flags on the material or the mesh: `alphaTest` (or `alphaHash`) turns a texture with clear pixels into a cut-out that is drawn with the opaque meshes and writes no depth where it is clear; `renderOrder` overrides the sort for objects that must always draw in a given order; `depthWrite = false` stops a surface from hiding what comes after it, at the price of drawing that later thing over it. Opaque is the default fix for anything that does not need to be see-through.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. Three of its tools take this apart. `look` with `at` lists the objects at a pixel, nearest first, as the page's own shaders draw them, and says when a shader discards the pixel; `look` with `sample` reads the colour actually drawn there, so a pixel where `at` puts an object behind a see-through surface and the colour shows none of it is a sort fault. `eval` lists every transparent material's flags and its sort depth in one call and tries a fix on the open page. `look` with `cameras` shows the same frame from up to nine places, where a fault that depends on the sort comes and goes.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A pond with both faults

A pond with a transparent water surface, a jellyfish under it near the camera, a rock on the bed, and a reed on the bank made of two crossed cards whose leaf texture has a clear background. Every material is left at its defaults apart from `transparent`, as a first version usually is.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Pond</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8c8);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 6);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 6, 4);
scene.add(sun);

// The pond's bed and a rock on it: opaque, drawn before anything transparent.
const bed = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x6b5a3a }));
bed.name = 'bed';
bed.rotation.x = -Math.PI / 2;
bed.position.y = -1.5;
const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0x777766 }));
rock.name = 'rock';
rock.position.set(-1.5, -1, -1);

// The water's surface: transparent, and like every material it writes depth unless told not to.
const water = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x2a6f9a, transparent: true, opacity: 0.45 }));
water.name = 'water';
water.rotation.x = -Math.PI / 2;

// A jellyfish under the surface, near the camera: transparent too.
const jelly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0xff5fc8, transparent: true, opacity: 0.8 }));
jelly.name = 'jelly';
jelly.position.set(0.8, -0.6, 2);

// A reed on the bank: two crossed cards with a leaf texture whose background is clear.
const leaves = document.createElement('canvas');
leaves.width = leaves.height = 256;
const g = leaves.getContext('2d');
g.fillStyle = '#3f8f3a';
for (let i = 0; i < 7; i++) {
  g.beginPath();
  g.ellipse(40 + i * 30, 150, 12, 100, (i - 3) * 0.12, 0, Math.PI * 2);
  g.fill();
}
const leafTexture = new THREE.CanvasTexture(leaves);
leafTexture.colorSpace = THREE.SRGBColorSpace;
const leafMaterial = new THREE.MeshStandardMaterial({ map: leafTexture, transparent: true, side: THREE.DoubleSide });
const reed = new THREE.Group();
reed.name = 'reed';
for (const angle of [Math.PI / 4, -Math.PI / 4]) {
  const card = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), leafMaterial);
  card.name = angle > 0 ? 'reed-a' : 'reed-b';
  card.rotation.y = angle;
  reed.add(card);
}
reed.position.set(-2.4, 1, 1.2);

scene.add(bed, rock, water, jelly, reed);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Sort order and depth tests do not depend on the GPU, so the same faults show on any machine; exact colours can differ slightly. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page and look.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41883/index.html in 0.3 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
{"three":"186","scenes":1,"entities":["bed","rock","water","jelly","reed"]}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-08-45-116Z/look-1.png
On screen (5):
bed 58% [0, 236, 1279, 799] 20 × 20 units
reed-a 9.1% [0, 150, 407, 545] 2 × 2 units
reed-b 2.3% [144, 150, 349, 545] 2 × 2 units
jelly 2.2% [690, 553, 856, 724]
rock 1% [415, 394, 541, 499]
Never visible: none
Not found by the ID image (their own vertex shader places them, or they are see-through; see the picture): water
```

The picture shows the water, the rock under it and the reed, and no jellyfish. The object list says the jellyfish covers 2.2% of the view in the box `[690, 553, 856, 724]`. The list comes from an ID image in which see-through materials do not hide what is behind them, which is how the eye should see a pond; the picture is what three.js drew. When the two disagree about a transparent object, the draw order is the first suspect.

**2. What is at the jellyfish's pixel, and what colour was drawn there.** The point is the middle of the box the list gave.

```text
look {"at": [[773, 638]]}

At (773, 638): water 4.52 m at [0.67, 0, 2.68]; behind it jelly 4.94 m; then bed 6.79 m; background beyond.

look {"sample": [[773, 638]]}

Colours (5 × 5 mean, in the page's pixels): (773, 638) #476767.
```

At that pixel the water is 4.52 m from the camera and the jellyfish 4.94 m, behind it, and the drawn colour is the same blue-grey as the rest of the water over the bed, with no pink in it. Something behind a see-through surface was not drawn: a depth test rejected it.

**3. Every transparent material, its flags and its sort depth.** One `eval` reads what the sort reads: `renderOrder`, and the depth of each object's origin in front of the camera.

```text
eval {"code": "const v = new THREE.Vector3();\nconst out = [];\nscene.traverse(o => {\n  if (!o.isMesh || !o.material.transparent) return;\n  const m = o.material;\n  v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(camera.matrixWorldInverse);\n  out.push(`${o.name}: opacity ${m.opacity}, depthWrite ${m.depthWrite}, renderOrder ${o.renderOrder}, alphaTest ${m.alphaTest}, side ${m.side}, centre ${(-v.z).toFixed(2)} in front of the camera`);\n});\nreturn out"}

["water: opacity 0.45, depthWrite true, renderOrder 0, alphaTest 0, side 0, centre 6.71 in front of the camera","jelly: opacity 0.8, depthWrite true, renderOrder 0, alphaTest 0, side 0, centre 5.19 in front of the camera","reed-a: opacity 1, depthWrite true, renderOrder 0, alphaTest 0, side 2, centre 5.19 in front of the camera","reed-b: opacity 1, depthWrite true, renderOrder 0, alphaTest 0, side 2, centre 5.19 in front of the camera"]
```

That is the whole story of the jellyfish: the water's origin is 6.71 in front of the camera and the jellyfish's 5.19, so three.js draws the water first, the water writes depth across the whole pond, and the jellyfish, drawn next, is behind that depth everywhere. It also shows the reed's material: transparent, writing depth, with a texture whose background is clear.

**4. The reed from four sides.** Labelled cameras are kept, so later calls can name them.

```text
look {"cameras": [{"position": [-2.4, 1.3, 4], "lookAt": [-2.4, 1, 1.2], "label": "front"}, {"position": [0.4, 1.3, 1.2], "lookAt": [-2.4, 1, 1.2], "label": "side"}, {"position": [-5.2, 1.3, 1.2], "lookAt": [-2.4, 1, 1.2], "label": "other side"}, {"position": [-2.4, 1.3, -1.6], "lookAt": [-2.4, 1, 1.2], "label": "back"}]}

Picture: <project>/paprika3d/runs/2026-10-28T10-08-45-116Z/look-6-cameras.png (4 cameras, left to right, top to bottom, at frame 1, no reload; the game's own camera is not moved)
Kept as `camera` names for look, zoom and reference compare: "front", "side", "other side", "back" (paprika3d/cameras.json).
```

From `front` and `other side` the reed sits in the water as it should. From `side` and `back` there is a square hole around it: inside the cards' outline the water is gone and the brown bed shows through untinted, and above the waterline the band of water in the distance is cut away too, leaving sky. The cards and the water have origins at different depths from each camera, so on two sides the reed is drawn first and its clear pixels block the water.

**5. What is at a pixel inside the hole.** `at` takes points in the page's pixels; with `camera` it reads them from that kept view.

```text
look {"camera": "side", "at": [[840, 600], [1100, 600]]}

At (840, 600): reed-a 2.45 m at [-1.86, 0.51, 0.66]; behind it water 4.04 m; then bed 8.7 m; background beyond.
At (1100, 600): water 4.44 m at [-3.32, 0, -0.86]; behind it bed 9.57 m; background beyond.
```

At the point in the hole, the nearest thing drawn is `reed-a`, although the picture shows no leaf there: the card drew a pixel with an alpha of 0, and that pixel kept its depth. The point outside the hole starts at the water.

**6. Make the reed a cut-out.** `alphaTest` discards the clear pixels in the shader, so they write nothing; with it the material no longer needs `transparent` and joins the opaque pass. Both cards share the one material.

```text
eval {"code": "const m = find(\"reed-a\").material;\nm.alphaTest = 0.5;\nm.transparent = false;\nm.needsUpdate = true;\nreturn \"reed: alphaTest 0.5, opaque\""}

reed: alphaTest 0.5, opaque

look {"camera": "side", "at": [[840, 600]]}

At (840, 600): water 4.04 m at [-3.32, 0, 0.3]; behind it bed 8.7 m; background beyond. reed-a draws nothing here (its shader discards).

look {"cameras": ["front", "side", "other side", "back"]}

Picture: <project>/paprika3d/runs/2026-10-28T10-08-45-116Z/look-10-cameras.png (4 cameras, left to right, top to bottom, at frame 1, no reload; the game's own camera is not moved)
```

`at` now names the water first and says the reed's shader discards that pixel, and all four views show unbroken water around the reed. `needsUpdate` is for the `transparent` switch: three.js compiles the shader again by itself when `alphaTest` goes from 0 to a value, but not when `transparent` changes.

**7. The jellyfish, first with depthWrite off on the water.** This is the fix most answers give:

```text
eval {"code": "find(\"water\").material.depthWrite = false;\nreturn \"water: depthWrite off\""}

water: depthWrite off

look {"sample": [[773, 638]]}

On screen (5):
jelly 2.2% [690, 553, 856, 724]
Colours (5 × 5 mean, in the page's pixels): (773, 638) #cc6eb3.
```

The jellyfish shows, but in its own pink, untinted: the water no longer blocks it, and it is still drawn after the water, so it is painted over the surface as if it floated on top. For particles above a surface that is right; for something under water it is not.

**8. Then with renderOrder.** `depthWrite` goes back on, and the water gets a `renderOrder` of 1 so it draws after every transparent object left at 0:

```text
eval {"code": "find(\"water\").material.depthWrite = true;\nfind(\"water\").renderOrder = 1;\nreturn \"water: depthWrite on, renderOrder 1\""}

water: depthWrite on, renderOrder 1

look {"sample": [[773, 638]]}

Colours (5 × 5 mean, in the page's pixels): (773, 638) #7f71a7.
```

The jellyfish is drawn first and the water blended over it, so it reads as a pink shape seen through blue water. That order holds from every camera, because it no longer depends on where the origins are.

**9. Write both into the source and look again.** The reed's material and the water become:

```js
const leafMaterial = new THREE.MeshStandardMaterial({ map: leafTexture, alphaTest: 0.5, side: THREE.DoubleSide });
water.renderOrder = 1; // after the transparent things under it
```

The next call reloads the page by itself:

```text
look {"sample": [[773, 638]]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.3 s).
Pixels, Hues: as the last look; 0% of the picture changed since it.
Colours (5 × 5 mean, in the page's pixels): (773, 638) #7f71a7.

look {"cameras": ["front", "side", "other side", "back"]}

Picture: <project>/paprika3d/runs/2026-10-28T10-08-45-116Z/look-17-cameras.png (4 cameras, left to right, top to bottom, at frame 1, no reload; the game's own camera is not moved)
```

0% of the picture changed against the look after the `eval` fixes, so the source now does what was tried, and the four cameras show the water whole around the reed from every side.

## Which fix for which case

- **Clear pixels in a texture** (leaves, grass, hair cards, fences, decals with hard edges): `alphaTest` with `transparent` off. Soft edges that need blending can use `alphaHash`, which dithers instead of blending and also writes depth correctly.
- **One surface that must always be blended over what is under it** (water, a glass case, a window): a higher `renderOrder` on the surface, so everything transparent inside or behind it draws first.
- **Many small see-through things that overlap each other** (particles, smoke, sparks): `depthWrite = false` on their material, often with additive blending, so their order stops mattering.
- **Something that never needed to be see-through**: make it opaque. It then draws in the first pass and the sort cannot hide it.
- **Double-sided glass**: three.js r186 already draws a transparent `DoubleSide` material in two passes, back faces and then front faces, unless `forceSinglePass` is set, so the inside faces of a glass sphere are ordered for you.

## What paprika3d does not do

- **No `look` line names a sort fault.** The tools show the evidence (the object list, `at`, the sampled colour and the pictures) and the agent draws the conclusion, as in steps 1 and 2.
- **The `Surfaces` line is not about this.** It names faces of two meshes that lie in one plane (z-fighting), not transparent objects drawn in the wrong order.
- **The object list treats see-through materials as clear.** A transparent material below half opacity, like this water, is left out of the ID image, so objects under it are listed as on screen even when the real picture hid them. A transparent material at half opacity or above hides what is behind it in the ID image, as an opaque one does.
- **`at` lists what is along the ray, not what passed the depth test.** In step 2 it named the jellyfish behind the water although the picture had none; pair it with `sample` or the picture.
- **It does not fix the page or sort per pixel.** It has no order-independent transparency; the agent chooses the flags and edits the source.

## Pitfalls

- **Switching `transparent` at run time needs `needsUpdate = true`.** Whether a material is transparent is part of its compiled shader (the `opaque` parameter in r186's `WebGLPrograms`), and three.js compiles it again when told. A change of `alphaTest` from 0 to a value recompiles by itself.
- **A `renderOrder` on the water sorts it after every transparent object at 0**, including ones above the water. A transparent object above the surface then draws before the water too, writes its depth, and the water behind it is not drawn where it covers it, so the water does not show through it; check the picture from a camera where the two overlap, and give that object a `renderOrder` of 2 when it matters.
- **Sorting by origin is why moving a pivot can fix or break it.** A model whose origin is far from its geometry sorts as if it stood at the origin.

## Without paprika3d

Orbit the camera in a browser and watch the transparent objects from every side, since a sort fault appears at some angles and not others. To see the order three.js chose, read the `transparent` list of `renderer.renderLists.get(scene, 0)` after a frame: its items are in draw order, each with its `object`, its `renderOrder` and the `z` it was sorted by. The three.js examples include materials with `alphaHash`, which show the difference between blending and dithering side by side.
