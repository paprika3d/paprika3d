---
title: three.js emissive material not glowing? Check the emissive colour under the map, the tone mapping, and what it lights
phrase: three.js emissive material not glowing
description: Why a three.js material with emissive set does not glow (an emissiveMap multiplied by a black emissive colour, tone mapping that pales a saturated emission, an emissive surface that lights nothing around it, a glTF emission strength the exporter dropped), and how a coding agent finds each one with the paprika3d plugin, listing every emissive material with eval, reading the drawn colours with look sample, and trying each fix on the open page before editing the source.
meta: three.js emissive material set but nothing glows? Check the emissive colour under the map, tone mapping and lights, with real pixel samples.
intent: emissive-material-not-glowing
queries:
  - "How can I make something glow?"
  - "Glowing effect on emissive map and not on color map"
  - "Whats the best way to achieve a glow effect?"
  - "Blender emission strength not displayed in three js"
  - "Emissive glowing effect on custom model"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js emissive material not glowing? Check the emissive colour under the map, the tone mapping, and what it lights

## What emissive does, and what people expect it to do

On `MeshStandardMaterial`, `MeshPhysicalMaterial`, `MeshLambertMaterial` and `MeshPhongMaterial`, the emissive term is light the surface gives off whatever the lights do: `emissive` (a colour) times `emissiveIntensity` times the `emissiveMap`'s texel, added to the lit colour. Four things go wrong with it, and they look alike in a screenshot:

- **A map on a black colour.** The map multiplies `emissive`, and `emissive` is black by default. A hand-built material with `emissiveMap` set and no `emissive` gives off nothing at all; the map has to sit on a white (or tinted) `emissive`. A glTF sets `emissive` from the file's `emissiveFactor`, which is also black unless the exporter wrote it.
- **Tone mapping.** With `ACESFilmicToneMapping` or `AgXToneMapping` on the renderer, a saturated emissive green or pink comes out pale and close to white, and a warm white at intensity 1 comes out beige. More intensity brings it to white, never past it.
- **It lights nothing.** An emissive surface is bright, not a light source. The wall beside a glowing bulb stays as dark as it was; that needs a light at the bulb.
- **No halo.** A glow that spreads past the object's edge is a bloom pass over the finished picture, which the [selective bloom guide](/guides/threejs-selective-bloom) takes apart. An emissive material gives a bloom something to catch; on its own it stops at its edge.

A Blender model adds one more: Blender's emission strength reaches three.js through the glTF extension `KHR_materials_emissive_strength`, which `GLTFLoader` reads into `emissiveIntensity`. An exporter that does not write it leaves `emissiveIntensity` at 1.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `eval` lists every material's emissive settings in one call and changes them on the open page, and `look` with `sample` reads the colour actually drawn at points, after lighting and tone mapping. Between the two, each of the faults above is a number that does or does not change.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A console in a dark room

A dim room with a desk, a screen whose picture is an `emissiveMap` (green bars drawn on a canvas), and a warm emissive bulb on the wall. ACES tone mapping, as many pages set.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Console</title>
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
scene.background = new THREE.Color(0x06080c);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.4, 5);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0x8090c0, 0x202020, 2));

const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ color: 0x9a9890 }));
wall.name = 'wall';
wall.position.set(0, 2.5, -1);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshStandardMaterial({ color: 0x404448 }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x2c2f36 }));
desk.name = 'desk';
desk.position.set(-0.6, 0.4, 0);

// A screen whose picture is an emissive map: a grid of green bars drawn on a canvas.
const pic = document.createElement('canvas');
pic.width = 256; pic.height = 160;
const g = pic.getContext('2d');
g.fillStyle = '#000';
g.fillRect(0, 0, 256, 160);
g.fillStyle = '#3cff8c';
for (let i = 0; i < 8; i++) g.fillRect(16 + i * 30, 140 - (20 + i * 13), 20, 20 + i * 13);
const screenTexture = new THREE.CanvasTexture(pic);
screenTexture.colorSpace = THREE.SRGBColorSpace;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75),
  new THREE.MeshStandardMaterial({ color: 0x050505, emissiveMap: screenTexture }));
screen.name = 'screen';
screen.position.set(-0.6, 1.25, -0.2);

// A lamp on the wall: an emissive bulb, warm white.
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 12),
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0 }));
bulb.name = 'bulb';
bulb.position.set(1.6, 1.9, -0.8);

scene.add(wall, floor, desk, screen, bulb);

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

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Colours from the same shaders can differ by a unit or two on another GPU; the changes below are far larger than that. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page, look, and sample four points.** The points are one of the screen's bars at `(543, 380)`, the bulb's centre at `(909, 238)`, the wall just under the bulb at `(909, 300)`, and the wall to its right at `(1000, 238)`.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:34237/index.html in 0.1 s, paused at frame 0.

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-26-47-953Z/look-1.png
Pixels: brightness 8%, colour saturation 60%, 12% near black, 0% blown out. Dark: a viewer sees little.
On screen (5):
wall 59% [0, 0, 1279, 544] 10 × 5 units, across the view
floor 29% [0, 545, 1279, 799] 10 × 6 units
desk 8.8% [265, 430, 764, 611] 2.4 × 0.8 units, across the view
screen 3% [416, 281, 639, 419] 1.2 × 0.75 units
bulb 0.29% [878, 208, 940, 268]

look {"sample": [[543, 380], [909, 238], [909, 300], [1000, 238]]}

Colours (5 × 5 mean, in the page's pixels): (543, 380) #000000, (909, 238) #e3d5b8, (909, 300) #181e2e, (1000, 238) #181e2e.
```

The screen is on the list and black in the picture: `#000000` on a bar. The bulb is a pale beige, `#e3d5b8`, not white. And the wall under the bulb is exactly the colour of the wall away from it, `#181e2e` both: the bulb lights nothing.

**2. Every emissive material, in one call.**

```text
eval {"code": "const out = [];\nscene.traverse(o => {\n  const m = o.material;\n  if (!o.isMesh || !m.emissive || (!m.emissiveMap && m.emissive.getHex() === 0)) return;\n  out.push({ name: o.name, emissive: \"#\" + m.emissive.getHexString(), emissiveIntensity: m.emissiveIntensity, emissiveMap: !!m.emissiveMap, toneMapped: m.toneMapped });\n});\nreturn out"}

[{"name":"screen","emissive":"#000000","emissiveIntensity":1,"emissiveMap":true,"toneMapped":true},{"name":"bulb","emissive":"#ffd9a0","emissiveIntensity":1,"emissiveMap":false,"toneMapped":true}]
```

The screen has a map and a black `emissive`: the map is multiplied by zero. The bulb has its colour at intensity 1, tone mapped.

**3. Put the map on white.**

```text
eval {"code": "find(\"screen\").material.emissive.set(0xffffff);\nreturn \"screen emissive white\""}

screen emissive white

look {"sample": [[543, 380], [909, 238], [909, 300], [1000, 238]]}

Colours (5 × 5 mean, in the page's pixels): (543, 380) #9ce3ac, (909, 238) #e3d5b8, (909, 300) #181e2e, (1000, 238) #181e2e.
```

The bars show. But the canvas painted them `#3cff8c`, a saturated green, and they are drawn `#9ce3ac`, a pale mint: ACES tone mapping pulled the bright green toward white.

**4. Keep a screen's colours as painted.** A screen, a sign or a UI panel should usually show its texture's colours, not a tone-mapped version of them. `toneMapped` is part of the compiled shader, so the change needs `needsUpdate`:

```text
eval {"code": "const m = find(\"screen\").material;\nm.toneMapped = false;\nm.needsUpdate = true;\nreturn \"screen toneMapped off\""}

screen toneMapped off

look {"sample": [[543, 380], [909, 238], [909, 300], [1000, 238]]}

Colours (5 × 5 mean, in the page's pixels): (543, 380) #3cff8c, (909, 238) #e3d5b8, (909, 300) #181e2e, (1000, 238) #181e2e.
```

`#3cff8c`, exactly the canvas's colour. The rest of the scene stays tone mapped.

**5. Turn the bulb up.**

```text
eval {"code": "find(\"bulb\").material.emissiveIntensity = 10;\nreturn \"bulb emissiveIntensity 10\""}

bulb emissiveIntensity 10

look {"sample": [[543, 380], [909, 238], [909, 300], [1000, 238]]}

Colours (5 × 5 mean, in the page's pixels): (543, 380) #3cff8c, (909, 238) #fefdfa, (909, 300) #181e2e, (1000, 238) #181e2e.
```

Ten times the emission takes the bulb from `#e3d5b8` to `#fefdfa`, as white as a pixel gets, and does nothing else: the wall under it is still `#181e2e`. This is the point where the threads ask why the glow does not show. The surface is as bright as the screen can draw it; brightness does not leave the surface.

**6. A light where the bulb is.**

```text
eval {"code": "const light = new THREE.PointLight(0xffd9a0, 2);\nlight.position.copy(find(\"bulb\").position);\nscene.add(light);\nreturn \"point light at the bulb\""}

point light at the bulb

look {"sample": [[543, 380], [909, 238], [909, 300], [1000, 238]]}

Pixels: brightness 13%, colour saturation 50%, 11% near black, 0% blown out; 17% of the picture changed since the last look.
Colours (5 × 5 mean, in the page's pixels): (543, 380) #3cff8c, (909, 238) #fefdfa, (909, 300) #cdb996, (1000, 238) #7c6956.
```

The wall under the bulb goes from `#181e2e` to `#cdb996` and the wall beside it to `#7c6956`, falling off with distance, and 17% of the picture changed. The picture now has a warm pool of light around the bulb on the wall, which reads as a glow without any post-processing.

**7. Write it into the source and look again.** The two materials and the light become:

```js
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75),
  new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: screenTexture, toneMapped: false }));
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 12),
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 10 }));
const bulbLight = new THREE.PointLight(0xffd9a0, 2); // what lights the wall: emissive lights nothing
bulbLight.position.copy(bulb.position);
scene.add(bulbLight);
```

```text
look {"sample": [[543, 380], [909, 238], [909, 300], [1000, 238]]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Pixels, Hues: as the last look; 0% of the picture changed since it.
Colours (5 × 5 mean, in the page's pixels): (543, 380) #3cff8c, (909, 238) #fefdfa, (909, 300) #cdb996, (1000, 238) #7c6956.
```

The reloaded page draws exactly what the `eval` changes drew, at all four points.

## A glTF's emission strength

For a model exported from Blender, read the loaded material rather than the file: `GLTFLoader` turns `emissiveFactor` into `emissive` and `KHR_materials_emissive_strength` into `emissiveIntensity`, so an `eval` that returns `find('sign').material.emissiveIntensity` (with the model's own mesh name) says whether the strength arrived. A 1 where Blender had a strength of 10 means the exporter did not write the extension; check the exporter's version and export settings, or set the intensity in code after loading. A material that came in as `MeshBasicMaterial` (the glTF unlit extension) has no emissive term at all, and its `color` is what it shows.

## What paprika3d does not do

- **`model_audit` does not list emissive settings.** It reports a file's size, triangles, material count and textures; the emissive values are read from the loaded page with `eval`, as above.
- **No `look` line names an emissive fault.** A black `emissive` under a map is found by the `eval` in step 2, not by a reply line.
- **It does not make the halo.** A glow past the object's edge is a bloom pass; the tools picture and sample one, as the selective bloom guide shows.
- **It does not choose the look.** Whether a screen should be tone mapped, and how bright a bulb should be, are the page's choices; the samples say what each choice draws.

## Pitfalls

- **An `emissiveMap` is a colour texture.** Set `colorSpace = THREE.SRGBColorSpace` on it, as on a `map`, or its colours come out paler than painted.
- **`toneMapped = false` needs `needsUpdate = true` on a material already drawn.** Without it the old shader keeps tone mapping.
- **`emissiveIntensity` past white changes nothing you can see on the surface** without bloom; above, intensity 10 drew `#fefdfa`, and no intensity draws past white. It does matter to a bloom pass, whose threshold reads the value before tone mapping.
- **Point lights cost per pixel.** One per bulb is fine; dozens of glowing windows are better baked into a lightmap or faked with a soft sprite.

## Without paprika3d

In the browser console, list `scene.traverse` materials whose `emissiveMap` is set and whose `emissive.getHex()` is 0; that one check finds most "the map does not glow" threads. To read a drawn colour, render to a `WebGLRenderTarget` and `readRenderTargetPixels`, or create the renderer with `preserveDrawingBuffer: true` and read the canvas with a 2D context after a frame.
