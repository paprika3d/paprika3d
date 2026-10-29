---
title: three.js glTF model too dark or black? Give its metal something to reflect
phrase: three.js gltf model too dark
description: Why a glTF or GLB model exported from Blender draws dark or black in three.js however many lights are added, and how a coding agent finds the cause in the paprika3d plugin's look reply, measures the drawn colour before and after a change, and puts an HDRI environment in the project with asset_search.
meta: three.js glTF model too dark or black? Metal needs an environment to reflect. Find the cause and fix it with RoomEnvironment or an HDRI.
intent: gltf-model-too-dark
queries:
  - "[SOLVED] Glb model is very dark"
  - "Ambient Light and GLTF models not working - Results in black model"
  - "Exporting Blender Scene - Lighting Issues"
  - "Struggling with gltf and lighting"
  - "Three JS - GLTF model is dark"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js glTF model too dark or black? Give its metal something to reflect

## Why more lights do not help

A glTF material is a physically based material: three.js loads it as a `MeshStandardMaterial` with a base colour, a `roughness` and a `metalness`. The `metalness` decides where its brightness comes from.

- **A non-metal** (`metalness` 0: paint, plastic, wood) scatters light in every direction. Ambient, hemisphere and directional lights all brighten it.
- **A metal** (`metalness` 1: steel, gold, chrome) has no diffuse colour at all. It shows what it reflects: the scene around it, and a small highlight where a light's reflection reaches the eye. Ambient light is diffuse by definition, so it adds nothing to a metal.

Blender's Principled BSDF exports its Metallic slider as the glTF `metallicFactor`, and a model textured for a game engine often has every part at metallic 1 with a metalness map to say which parts are not. In three.js a scene has nothing to reflect until `scene.environment` is set, so those parts draw black, and every forum answer that adds an `AmbientLight` or raises its intensity leaves them black. Blender's material preview and the common online glTF viewers light the model with an environment by default, which is why the same file looks right there.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Every `look` reply ends with the setup faults it finds in the live scene, and one of them is this: metallic materials with no environment map. `look` with `sample` reads the colour drawn at a point, so a change can be judged by a number before it goes into the source, and `asset_search` with `kind: "hdri"` puts a CC0 sky in the project with the code that makes it the environment.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A dark toolbox

A toolbox as a Blender export brings it: a steel case and lid (metallic 1, roughness 0.35) and a red painted badge (metallic 0). The page lights it the way the forum threads do, with an ambient light and a directional key light. The GLB is small enough to inline as a data URL, so the block runs on its own.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Toolbox</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// In a project this is a file, 'models/toolbox.glb', as Blender exports it: a steel case and lid
// (metallic 1, roughness 0.35) and a red painted badge (metallic 0). Inlined so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAAC4BwAAFAUAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC41LDAuNSwwLjVdLCJtaW4iOlstMC41LC0wLjUsLTAuNV0sImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjB9LHsidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjEyfSx7InR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjB9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6NTc2LCJieXRlU3RyaWRlIjoyNCwidGFyZ2V0IjozNDk2Mn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjU3NiwiYnl0ZUxlbmd0aCI6NzIsInRhcmdldCI6MzQ5NjN9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NjQ4fV0sIm1hdGVyaWFscyI6W3sibmFtZSI6InN0ZWVsIiwicGJyTWV0YWxsaWNSb3VnaG5lc3MiOnsiYmFzZUNvbG9yRmFjdG9yIjpbMC44LDAuOCwwLjgyLDFdLCJyb3VnaG5lc3NGYWN0b3IiOjAuMzV9fSx7Im5hbWUiOiJwYWludCIsInBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuNiwwLjA1LDAuMDMsMV0sInJvdWdobmVzc0ZhY3RvciI6MC42LCJtZXRhbGxpY0ZhY3RvciI6MH19XSwibWVzaGVzIjpbeyJuYW1lIjoiY2FzZSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sIm1vZGUiOjQsIm1hdGVyaWFsIjowLCJpbmRpY2VzIjoyfV19LHsibmFtZSI6ImJhZGdlIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxfSwibW9kZSI6NCwibWF0ZXJpYWwiOjEsImluZGljZXMiOjJ9XX1dLCJub2RlcyI6W3sibmFtZSI6ImNhc2UiLCJ0cmFuc2xhdGlvbiI6WzAsMC41LDBdLCJzY2FsZSI6WzIsMSwxXSwibWVzaCI6MH0seyJuYW1lIjoibGlkIiwidHJhbnNsYXRpb24iOlswLDEuMSwwXSwic2NhbGUiOlsyLjA1LDAuMiwxLjA1XSwibWVzaCI6MH0seyJuYW1lIjoiYmFkZ2UiLCJ0cmFuc2xhdGlvbiI6WzAsMC41NSwwLjUxXSwic2NhbGUiOlswLjYsMC4zLDAuMDJdLCJtZXNoIjoxfSx7Im5hbWUiOiJ0b29sYm94IiwiY2hpbGRyZW4iOlswLDEsMl19XSwic2NlbmVzIjpbeyJuYW1lIjoiU2NlbmUiLCJub2RlcyI6WzNdfV19iAIAAEJJTgAAAAA/AAAAPwAAAD8AAIA/AAAAAAAAAAAAAAA/AAAAPwAAAL8AAIA/AAAAAAAAAAAAAAA/AAAAvwAAAD8AAIA/AAAAAAAAAAAAAAA/AAAAvwAAAL8AAIA/AAAAAAAAAAAAAAC/AAAAPwAAAL8AAIC/AAAAAAAAAAAAAAC/AAAAPwAAAD8AAIC/AAAAAAAAAAAAAAC/AAAAvwAAAL8AAIC/AAAAAAAAAAAAAAC/AAAAvwAAAD8AAIC/AAAAAAAAAAAAAAC/AAAAPwAAAL8AAAAAAACAPwAAAAAAAAA/AAAAPwAAAL8AAAAAAACAPwAAAAAAAAC/AAAAPwAAAD8AAAAAAACAPwAAAAAAAAA/AAAAPwAAAD8AAAAAAACAPwAAAAAAAAC/AAAAvwAAAD8AAAAAAACAvwAAAAAAAAA/AAAAvwAAAD8AAAAAAACAvwAAAAAAAAC/AAAAvwAAAL8AAAAAAACAvwAAAAAAAAA/AAAAvwAAAL8AAAAAAACAvwAAAAAAAAC/AAAAPwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAPwAAAD8AAAAAAAAAAAAAgD8AAAC/AAAAvwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAvwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAPwAAAL8AAAAAAAAAAAAAgL8AAAC/AAAAPwAAAL8AAAAAAAAAAAAAgL8AAAA/AAAAvwAAAL8AAAAAAAAAAAAAgL8AAAC/AAAAvwAAAL8AAAAAAAAAAAAAgL8AAAIAAQACAAMAAQAEAAYABQAGAAcABQAIAAoACQAKAAsACQAMAA4ADQAOAA8ADQAQABIAEQASABMAEQAUABYAFQAWABcAFQA=';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3f47);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.2, 2, 4);
camera.lookAt(0, 0.6, 0);

// The lights the forum threads add, and keep adding, when the model is dark.
const ambient = new THREE.AmbientLight(0xffffff, 1);
ambient.name = 'ambient';
scene.add(ambient);
const key = new THREE.DirectionalLight(0xffffff, 2);
key.name = 'key';
key.position.set(3, 5, 4);
scene.add(key);

new GLTFLoader().load(MODEL, (gltf) => { gltf.scene.name = 'toolbox'; scene.add(gltf.scene); }, undefined, (err) => console.error('toolbox did not load:', err));

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

These replies were captured on 2026-10-28 on a Linux server with no GPU, which is what the `GPU:` line says; the materials and the colours they draw do not depend on it. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page and look, sampling the case, the lid and the badge.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:46693/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none

look {"sample": [[450, 450], [640, 262], [580, 445]]}

Picture: <project>/paprika3d/runs/2026-10-28T06-12-50-818Z/look-1.png
Pixels: brightness 21%, colour saturation 17%, 14% near black, 0% blown out.
Hues: grey 99% of the frame; over the objects (16.6% of it): grey 94%, red 6%.
Lighting: 1 metallic materials with no environment map (scene.environment unset): metal reflects nothing and draws black. Bake a RoomEnvironment through PMREMGenerator, or call stage() from fx.js.
On screen (3):
case 11% [379, 309, 905, 627]
lid 4.9% [367, 230, 916, 369] 2.05 × 1.05 units
badge 0.94% [513, 398, 645, 494] 0.6 × 0.3 units, across the view
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (450, 450) #060606, (640, 262) #121212, (580, 445) #b72520.
```

The picture is a black box with a red badge. The `Lighting:` line names the cause and counts one material, since the case and the lid share `steel`. The samples put numbers on it: the case's front is `#060606`, close to pure black, while the painted badge, lit by the same two lights, is a plain red.

**2. Read the materials.** `eval` runs in the page:

```text
eval {"code": "const out = [];\nscene.traverse((o) => { if (o.isMesh) out.push(`${o.name}: ${o.material.name}, metalness ${o.material.metalness}, roughness ${o.material.roughness}`); });\nreturn { environment: scene.environment, meshes: out }"}

{"environment":null,"meshes":["case: steel, metalness 1, roughness 0.35","lid: steel, metalness 1, roughness 0.35","badge: paint, metalness 0, roughness 0.6"]}
```

**3. Try what the threads try: more light.** The ambient light from 1 to 10 and the key light from 2 to 8:

```text
eval {"code": "find('ambient').intensity = 10;\nfind('key').intensity = 8;\nreturn 'brighter lights'"}

brighter lights

look {"sample": [[450, 450], [640, 262], [580, 445]]}

Pixels: brightness 24%, colour saturation 16%, 0% near black, 0% blown out; 17% of the picture changed since the last look.
Lighting: the same line as the last look, still open.
Colours (5 × 5 mean, in the page's pixels): (450, 450) #222223, (640, 262) #424244, (580, 445) #ffb48d.
```

Ten times the ambient light took the steel from `#060606` to `#222223`, still a dark grey, and burnt the red badge to `#ffb48d`, a pale peach. The little the case gained is the key light's highlight spread over a rough surface. This is the trade every "add more lights" answer makes: the non-metal parts wash out long before the metal looks like metal.

**4. Give the metal an environment.** The line's own suggestion: a `RoomEnvironment`, the room three.js ships for this, baked through `PMREMGenerator` into `scene.environment`, with the lights put back as they were.

```text
eval {"code": "find('ambient').intensity = 1;\nfind('key').intensity = 2;\nconst { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');\nconst pmrem = new THREE.PMREMGenerator(renderer);\nscene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;\nreturn 'environment set'"}

environment set

interact {"steps": [{"wait": 1}]}

{"after":null,"changed":{}}

look {"sample": [[450, 450], [640, 262], [580, 445]]}

Pixels: brightness 31%, colour saturation 16%, 0% near black, 0% blown out.
On screen (3):
case 11% [379, 309, 905, 627]
lid 4.9% [367, 230, 916, 369] 2.05 × 1.05 units
badge 0.94% [513, 398, 645, 494] 0.6 × 0.3 units, across the view
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (450, 450) #919193, (640, 262) #bbbbbd, (580, 445) #ff8f6e.
```

The `Lighting:` line is gone and the case reads `#919193`, a mid steel grey, with the original lights. The `interact` step with `wait` lets the page draw one frame of its own after the bake. Without it, the `look` pictured the canvas as it was and reported that the last render calls went into a render target: the bake inside the `eval` was the last thing drawn.

## Use a real sky: `asset_search`

A `RoomEnvironment` is a neutral grey room. For a product that should reflect a studio, a sky or an interior, `asset_search` with `kind: "hdri"` searches the hosted library's HDRIs:

```text
asset_search {"cwd": "<project>", "query": "photo studio softbox", "kind": "hdri", "sheet": false}

1. polyhaven-studio_small_08 · Studio Small 08 · umbrella, softbox, infinity, lamp, studio, photo · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/hdri/polyhaven-studio_small_08/preview.webp
2. polyhaven-wooden_studio_19 · Wooden Studio 19 · black floor, lamp, softbox, soft, white, rectangle, photo · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/hdri/polyhaven-wooden_studio_19/preview.webp
3. polyhaven-white_home_studio · White Home Studio · lamp, white, photo, softbox, umbrella, rectangle, infinity · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/hdri/polyhaven-white_home_studio/preview.webp
Pick one with { pick: "<id>" }, search again with not: [ids] to reject these, or add more: true for the next ones.

asset_search {"cwd": "<project>", "kind": "hdri", "pick": "polyhaven-studio_small_08"}

Saved assets/hdri/polyhaven-studio_small_08.hdr (Studio Small 08, CC0-1.0)
If the import map has no `three/addons/`, map it to three's `examples/jsm/` folder.
```

The pick replies with the loading code as well:

```js
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sky = await new HDRLoader().loadAsync("assets/hdri/polyhaven-studio_small_08.hdr");
  scene.environment = pmrem.fromEquirectangular(sky).texture;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky; // the sky as backdrop; leave this line out to keep your own
  pmrem.dispose();
}
```

Here the page keeps its own grey backdrop, so the block goes into the source after the camera without its two `scene.background` lines, and the `HDRLoader` import goes at the top. The next `look` after the edit reloads the page and says what the edit closed:

```text
look {"sample": [[450, 450], [640, 262], [580, 445]]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.2 s).
Picture: <project>/paprika3d/runs/2026-10-28T06-13-57-652Z/look-2.png
Pixels: brightness 30%, colour saturation 17%, 0% near black, 0% blown out; 18% of the picture changed since the last look.
Closed since the last look: Lighting: 1 metallic materials with no environment map (scene.environment unset): metal reflects nothing and draws black. Bake a RoomEnvironment through PMREMGenerator, or call stage() from fx.js.
Colours (5 × 5 mean, in the page's pixels): (450, 450) #858b8f, (640, 262) #ccccd2, (580, 445) #f9785f.
```

The lid now picks up the studio's bright ceiling, and the case front shades from light to dark across the softboxes' reflections.

**The ambient light is no longer doing anything for the metal.** With the environment in place, removing the `AmbientLight` leaves the steel exactly as it was and takes a little off the badge:

```text
eval {"code": "scene.remove(find('ambient'));\nreturn scene.children.filter((o) => o.isLight).map((o) => `${o.name} ${o.intensity}`)"}

["key 2"]

look {"sample": [[450, 450], [640, 262], [580, 445]]}

Colours (5 × 5 mean, in the page's pixels): (450, 450) #858b8f, (640, 262) #ccccd2, (580, 445) #f16b56.
```

The environment lights the non-metal parts too, so a scene that gets one usually needs less of the light added to fight the darkness, and often none.

## Other reasons a model draws dark

The metal line is the cause when the parts that are dark are the metal ones. When everything is dark, check these, which `open` and `look` also report:

- **No light and no environment at all.** A `MeshStandardMaterial` with nothing lighting it draws black. No line names this, since a dark scene can be the intent; the near-black share on the Pixels line of `look` shows it, and an `eval` that lists the scene's lights says why.
- **Light intensities from old code.** Since r155 three.js lights are physically based by default, and intensities tuned before then draw dimmer. `open` names `useLegacyLights` or `physicallyCorrectLights` in the source, which marks such code.
- **No tone mapping.** `look` says `Lighting: no tone mapping` when lit materials draw with `NoToneMapping`; bright parts then clip to white, and dark scenes are often brightened to compensate.
- **A colour texture not tagged sRGB, or a normal map that is.** The first draws washed out, the second bends the lighting and usually darkens it; `open` and `look` count each in a `Lighting:` line.
- **A post-processing chain with no `OutputPass`.** `open` says so; without it tone mapping and the output colour space are never applied.

## Pitfalls

- **Set the environment once, before the first frame.** `PMREMGenerator` renders when it bakes; doing it every frame costs a frame's worth of work each time.
- **`scene.environment` lights; `scene.background` is a picture.** Either can be set without the other, and the first is the one that reaches the materials.
- **Turn `metalness` down for parts that are not metal, and no others.** A metal set to 0 to make it visible loses its look; the environment is the fix for real metal.
- **`environmentIntensity` and `material.envMapIntensity`** tune how much the environment contributes, for the whole scene or one material.
- **paprika3d reports and measures; it does not change the page.** It does not add lights or an environment. The agent edits the source and looks again.

## Without paprika3d

`scene.traverse` over the meshes, logging each `material.metalness` and `scene.environment`, gives the same readout as the `eval` above. three.js ships `RoomEnvironment` in `three/addons/environments/` for a neutral room, and Poly Haven publishes CC0 HDRIs that `HDRLoader` reads. To compare with how a glTF viewer shows the file, the three.js editor and the Khronos glTF Sample Viewer both load a GLB by drag and drop and light it with an environment.
