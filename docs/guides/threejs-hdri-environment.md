---
title: three.js HDRI environment and background, shown or hidden, at the strength you want
phrase: three.js hdri environment
description: How to load an HDRI in three.js r186 as the scene's environment and background, keep its light while hiding the picture, and set the strength of each, with the paprika3d plugin's open reply showing whether the .hdr loaded, asset_search putting a CC0 sky in the project, and look sampling the drawn colour after each change.
meta: Load an HDRI as the three.js environment, hide the background but keep the light, and set the strength of each, checked by colour samples.
intent: threejs-hdri-environment
queries:
  - "How to apply HDRI(env)?"
  - "How to Add hdri Background"
  - "Cannot get HDRI Lighting to work with RGBELoader"
  - "How to hide the display of background HDR map, but save hdri's work for lighting in three.js?"
  - "How to control the strength of an HDRI environment?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js HDRI environment and background, shown or hidden, at the strength you want

## One file, two jobs

An HDRI is a photo of everything around one point, stored with light values brighter than white, usually as an equirectangular `.hdr` or `.exr` file. In three.js the same file can do two separate jobs, and most HDRI questions come from treating them as one:

- **`scene.environment`** lights the materials and gives them something to reflect. It reaches `MeshStandardMaterial` and `MeshPhysicalMaterial` (prefiltered once by `PMREMGenerator` so rough surfaces get a blurred reflection), and `MeshLambertMaterial` and `MeshPhongMaterial`. `MeshBasicMaterial` takes no light, so an HDRI never shows on it.
- **`scene.background`** is the picture drawn behind everything. It lights nothing.

So hiding the sky while keeping its light means setting the environment and leaving the background alone, or setting the background to a colour. The strength of each has its own setting: `scene.environmentIntensity` for the light, `scene.backgroundIntensity` and `scene.backgroundBlurriness` for the picture, and `material.envMapIntensity` for one material. `renderer.toneMappingExposure` scales the whole frame, both at once.

The material rule is one line of `getParameters()` in `src/renderers/webgl/WebGLPrograms.js`, three r186:

```js
const environment = ( material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial ) ? scene.environment : null;
```

The loader changed name: r180 renamed `RGBELoader` to `HDRLoader`, and `RGBELoader` is now a subclass that warns and does the same work. `.exr` files load with `EXRLoader`.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. For this task its `open` reply lists the `.hdr` the page fetched with its size, or the fetch that failed; `asset_search` with `kind: "hdri"` puts a CC0 sky in the project; `eval` tries each setting on the live page; and `look` with `sample` reads the drawn colour at chosen points, so the effect of each setting is a number, not an impression.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page whose sky never arrives

Three spheres under no light but an HDRI: polished chrome, brushed metal and red plastic. The HDRI code is the one found in many answers:

```js
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

new RGBELoader().load('textures/sky.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.background = texture;
});
```

These replies were captured on 2026-10-28 with the stable build, on a Linux server with no GPU. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:41951/index.html in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["chrome","brushed","plastic"]}
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) textures/sky.hdr
Failed to load: sky.hdr (404)

look {}

Pixels: brightness 0%, colour saturation 0%, 100% near black, 0% blown out. Mostly black: a blank or unlit frame? Pale: little colour.
Lighting: 2 metallic materials with no environment map (scene.environment unset): metal reflects nothing and draws black. Bake a RoomEnvironment through PMREMGenerator, or call stage() from fx.js.
On screen (3):
plastic 7% [856, 253, 1165, 546]
chrome 7% [114, 253, 423, 546]
brushed 6.6% [493, 253, 786, 546]
Never visible: none

eval {"code":"const { RGBELoader } = await import(\"three/addons/loaders/RGBELoader.js\");\nnew RGBELoader();\nreturn scene.environment"}

null
warn: RGBELoader has been deprecated. Please use HDRLoader instead.
```

The `Failed to load:` line is the answer to "my HDRI lighting does not work": the file was never there, the callback never ran, and the frame is black because nothing else lights it. `look` confirms it from the scene side, with two metals and no environment. The `eval` shows the warning the old loader prints when it is made; `open` lists warnings that start with `THREE.`, which this one does not, so it is easy to miss in a busy console.

## Put a sky in the project

`asset_search` with `kind: "hdri"` searches the CC0 skies of the hosted library, by words:

```text
asset_search {"cwd":"<project>","query":"overcast meadow","kind":"hdri","sheet":false}

1. ambientcg-DaySkyHDRI033A · Day Sky HDRI 033 A · 33, day, field, hdri, overcast, sky · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/hdri/ambientcg-DaySkyHDRI033A/preview.webp
2. ambientcg-EveningSkyHDRI029A · Evening Sky HDRI 029 A · 29, evening, field, hdri, overcast, rain, rainy, sky, storm, thunder · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/hdri/ambientcg-EveningSkyHDRI029A/preview.webp
3. ambientcg-DaySkyHDRI020A · Day Sky HDRI 020 A · 20, cloud, day, hdri, overcast, rain, sky, storm · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/hdri/ambientcg-DaySkyHDRI020A/preview.webp
4. ambientcg-DaySkyHDRI068A · Day Sky HDRI 068 A · 068, 68, clouds, day, dayskyhdri068a, hdri, overcast, rain, sky, storm · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/hdri/ambientcg-DaySkyHDRI068A/preview.webp
5. polyhaven-evening_meadow · Evening Meadow · grass, field, tree, meadow · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/hdri/polyhaven-evening_meadow/preview.webp

asset_search {"cwd":"<project>","kind":"hdri","pick":"polyhaven-evening_meadow"}

Saved assets/hdri/polyhaven-evening_meadow.hdr (Evening Meadow, CC0-1.0)
If the import map has no `three/addons/`, map it to three's `examples/jsm/` folder.
```

The pick also replies with the block of code that loads the file into both settings, the same block the [model too dark guide](/guides/threejs-gltf-model-too-dark) shows in full; here it replaces the `RGBELoader` call:

```js
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const pmrem = new THREE.PMREMGenerator(renderer);
const sky = await new HDRLoader().loadAsync('assets/hdri/polyhaven-evening_meadow.hdr');
scene.environment = pmrem.fromEquirectangular(sky).texture;
sky.mapping = THREE.EquirectangularReflectionMapping;
scene.background = sky;
pmrem.dispose();
```

A file in the project also answers the two drei threads below, where `<Environment preset>` failed to fetch its HDR at run time: drei's `<Environment files="...">` takes a path in the project instead. paprika3d was not run against drei for this guide.

## The sky loaded: four sample points

Each `look` below samples the same four points: the middle of the chrome, brushed and plastic spheres, and the sky above them.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:42917/index.html in 0.4 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["chrome","brushed","plastic"]}
Loaded: polyhaven-evening_meadow.hdr 1.7 MB

look {"sample":[[268,399],[639,399],[1010,399],[640,120]]}

Pixels: brightness 57%, colour saturation 34%, 0% near black, 0% blown out.
On screen (3):
plastic 7% [856, 253, 1165, 546]
chrome 7% [114, 253, 423, 546]
brushed 6.6% [493, 253, 786, 546]
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (268, 399) #152115, (639, 399) #7c857b, (1010, 399) #9b2d31, (640, 120) #dfe4ec.
```

The `Loaded:` line names the file and its size, which counts against the page's download like a model does. The `Lighting:` line is gone, and the chrome sphere's middle is the dark green of the meadow's tree line reflected in it.

## Hide the sky, keep its light

```text
eval {"code":"scene.background = new THREE.Color(0x202428);\nreturn [scene.environment?.mapping, scene.background.getHexString()]"}

[306,"202428"]

look {"sample":[[268,399],[639,399],[1010,399],[640,120]]}

Pixels: brightness 21%, colour saturation 25%, 0% near black, 0% blown out; 80% of the picture changed since the last look.
Colours (5 × 5 mean, in the page's pixels): (268, 399) #152115, (639, 399) #7c857b, (1010, 399) #9b2d31, (640, 120) #202428.
```

The three sphere samples are the same hex values as before to the last digit; the sky sample is the new colour. That is the answer to the hidden-background question in numbers: the environment is a separate texture (mapping 306 is `CubeUVReflectionMapping`, the prefiltered form `PMREMGenerator` makes), and the background was a picture all along. Leaving `scene.background` unset gives the same result with the canvas's clear colour behind.

## Set the strength of the light, or of the sky

```text
eval {"code":"scene.environmentIntensity = 0.4;\nreturn scene.environmentIntensity"}

0.4

look {"sample":[[268,399],[639,399],[1010,399],[640,120]]}

Pixels: brightness 17%, colour saturation 27%, 0% near black, 0% blown out; 21% of the picture changed since the last look.
Colours (5 × 5 mean, in the page's pixels): (268, 399) #060c06, (639, 399) #414840, (1010, 399) #551014, (640, 120) #202428.
```

All three spheres darkened, the plastic from `#9b2d31` to `#551014`, because the environment lights the non-metal too. With the sky shown again on a fresh page, the picture has its own controls, and they leave the spheres alone:

```text
eval {"code":"scene.backgroundBlurriness = 0.3;\nscene.backgroundIntensity = 0.5;\nreturn [scene.backgroundBlurriness, scene.backgroundIntensity, scene.environmentIntensity]"}

[0.3,0.5,1]

look {"sample":[[268,399],[639,399],[1010,399],[640,120]]}

Pixels: brightness 48%, colour saturation 32%, 0% near black, 0% blown out.
Colours (5 × 5 mean, in the page's pixels): (268, 399) #152115, (639, 399) #7c857b, (1010, 399) #9b2d31, (640, 120) #a7b5c7.
```

The sky went from `#dfe4ec` to `#a7b5c7` and the spheres kept their first values. A dimmer, softer backdrop with full light on the product is the usual look for a product viewer.

## The page

Every setting from above in one place, with a switch for the background. It inlines a small sky so the block runs on its own; in the project, `SKY` is the path `asset_search` saved.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Spheres</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// In a project this is the file asset_search saved, 'assets/hdri/polyhaven-evening_meadow.hdr'.
// Here a 128 × 64 sky with a sun, inlined so the page runs on its own.
const SKY = 'data:image/vnd.radiance;base64,Iz9SQURJQU5DRQpGT1JNQVQ9MzItYml0X3JsZV9yZ2JlCgotWSA2NCArWCAxMjgKAgIAgP9CAUL/dQF1/+YB5v+AAYACAgCA/0cBR/94AXj/5wHn/4ABgAICAID/TAFM/3wBfP/oAej/gAGAAgIAgP9QAVD/fwF//+kB6f+AAYACAgCA/1UBVf+DAYP/6gHq/4ABgAICAID/WgFa/4cBh//qAer/gAGAAgIAgP9fAV//igGK/+sB6/+AAYACAgCA/2QBZP+OAY7/7AHs/4ABgAICAID/aAFo/5EBkf/tAe3/gAGAAgIAgP9tAW3/lQGV/+4B7v+AAYACAgCA/3IBcv+ZAZn/7gHu/4ABgAICAID/dwF3/5wBnP/vAe//gAGAAgIAgP98AXz/oAGg//AB8P+AAYACAgCApoAB8NmApqMB4NmjpvEBwNnxpoABhdmAAgIAgKSFhfDXhaSnheDXp6TyhcDX8qSAhYXXgAICAICjiofw1oqjq4fg1quj8ofA1vKjgIeF1oACAgCAoo+J8NWPoq6J4NWuovOJwNXzooCJhdWAAgIAgKKUifDVlKKyieDVsqL0icDV9KKAiYXVgAICAICimInw1ZiitYng1bWi9YnA1fWigImF1YACAgCAop2J8NWdormJ4NW5ovaJwNX2ooCJhdWAAgIAgKOih/DWoqO9h+DWvaP2h8DW9qOAh4XWgAICAICkp4Xw16ekwIXg18Ck94XA1/ekgIWF14ACAgCA/6wBrP/EAcT/+AH4/4ABgAICAID/sAGw/8cBx//5Afn/gAGAAgIAgP+1AbX/ywHL//oB+v+AAYACAgCA/7oBuv/PAc//+gH6/4ABgAICAID/vwG//9IB0v/7Afv/gAGAAgIAgP/EAcT/1gHW//wB/P+AAYACAgCA/8gByP/ZAdn//QH9/4ABgAICAID/zQHN/90B3f/+Af7/gAGAAgIAgP/SAdL/4QHh//4B/v+AAYACAgCA/9cB1//kAeT//wH//4ABgAICAID/twG3/98B3/9lAWX/fgF+AgIAgP+0AbT/3AHc/2QBZP9+AX4CAgCA/7EBsf/ZAdn/YgFi/34BfgICAID/rwGv/9YB1v9gAWD/fgF+AgIAgP+sAaz/0gHS/18BX/9+AX4CAgCA/6oBqv/PAc//XQFd/34BfgICAID/pwGn/8wBzP9cAVz/fgF+AgIAgP+lAaX/yQHJ/1oBWv9+AX4CAgCA/6IBov/GAcb/WAFY/34BfgICAID/oAGg/8IBwv9XAVf/fgF+AgIAgP+dAZ3/vwG//1UBVf9+AX4CAgCA/5oBmv+8Abz/VAFU/34BfgICAID/mAGY/7kBuf9SAVL/fgF+AgIAgP+VAZX/tgG2/1ABUP9+AX4CAgCA/5MBk/+yAbL/TwFP/34BfgICAID/kAGQ/68Br/9NAU3/fgF+AgIAgP+OAY7/rAGs/0wBTP9+AX4CAgCA/4sBi/+pAan/SgFK/34BfgICAID/iAGI/6YBpv9IAUj/fgF+AgIAgP+GAYb/ogGi/0cBR/9+AX4CAgCA/4MBg/+fAZ//RQFF/34BfgICAID/gQGB/5wBnP9EAUT/fgF+AgIAgP9+AX7/mQGZ/0IBQv9+AX4CAgCA/3wBfP+WAZb/QAFA/34BfgICAID/eQF5/5IBkv8/AT//fgF+AgIAgP93AXf/jwGP/z0BPf9+AX4CAgCA/3QBdP+MAYz/PAE8/34BfgICAID/cQFx/4kBif86ATr/fgF+AgIAgP9vAW//hgGG/zgBOP9+AX4CAgCA/2wBbP+CAYL/NwE3/34BfgICAID/1AHU//8B//9rAWv/fQF9AgIAgP/PAc//+AH4/2gBaP99AX0=';
const SHOW_SKY = true; // false: keep the sky's light and reflections, hide the sky itself

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.6, 6);
camera.lookAt(0, 0, 0);

const ball = (name, x, material) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.8, 64, 32), material);
  m.name = name;
  m.position.x = x;
  scene.add(m);
};
ball('chrome', -2, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05 }));
ball('brushed', 0, new THREE.MeshStandardMaterial({ color: 0xd8c8a8, metalness: 1, roughness: 0.4 }));
ball('plastic', 2, new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0, roughness: 0.5 }));

const pmrem = new THREE.PMREMGenerator(renderer);
const sky = await new HDRLoader().loadAsync(SKY);
scene.environment = pmrem.fromEquirectangular(sky).texture; // lights and reflections
scene.environmentIntensity = 1;                             // the strength of that light
pmrem.dispose();
if (SHOW_SKY) {
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;                                   // the picture behind the scene
  scene.backgroundIntensity = 1;
  scene.backgroundBlurriness = 0;
} else {
  scene.background = new THREE.Color(0x202428);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

## Pitfalls

- **Bake once.** `PMREMGenerator` renders when it prefilters. Run it once after the load, not in the render loop, and `dispose()` the generator afterwards; the texture it returned stays valid.
- **Set the mapping before using the texture as a background.** An equirectangular texture without `EquirectangularReflectionMapping` is drawn as a flat image, not as a sky around the camera.
- **A material that ignores the environment.** `MeshBasicMaterial` draws its colour as it is. Give it `envMap` directly for a reflection, or use `MeshStandardMaterial`.
- **Rotation.** `scene.environmentRotation` and `scene.backgroundRotation` turn each one separately, to move the sun's highlight without moving the visible sky, or both together.
- **File size.** An HDRI is a download like any other; the `Loaded:` line gives its size, and `perf` counts it with the page's other assets. paprika3d does not resize or convert HDR files: `model_audit` reads models, not HDRIs.

## Without paprika3d

The browser's network panel shows whether the `.hdr` loaded, and the three.js editor previews an HDRI dropped onto it as background and environment. To compare settings, read pixels back from the canvas with `gl.readPixels` after a render, or set them side by side by eye. Poly Haven and ambientCG publish CC0 HDRIs at several resolutions; a smaller one is often enough for lighting alone, since the environment is blurred anyway on rough surfaces.

## Where people ask about it

- [How to apply HDRI(env)?](https://discourse.threejs.org/t/how-to-apply-hdri-env/218) (discourse.threejs.org, 19,875 views)
- [How to Add hdri Background](https://discourse.threejs.org/t/how-to-add-hdri-background/53675) (discourse.threejs.org, 10,182 views)
- [Cannot get HDRI Lighting to work with RGBELoader](https://discourse.threejs.org/t/cannot-get-hdri-lighting-to-work-with-rgbeloader/15909) (discourse.threejs.org, 6,842 views)
- [How to hide the display of background HDR map, but save hdri's work for lighting in three.js?](https://stackoverflow.com/questions/56092514/how-to-hide-the-display-of-background-hdr-map-but-save-hdris-work-for-lighting) (Stack Overflow, 2,616 views)
- [How to control the strength of an HDRI environment?](https://stackoverflow.com/questions/73099464/how-to-control-the-strength-of-an-hdri-environment) (Stack Overflow, 1,836 views)
- [using `Envinronment` component causes error - failed to fetch](https://github.com/pmndrs/drei/issues/1492) (GitHub, 21 comments) and ["Could not load `xy.hdr`" errors](https://github.com/pmndrs/drei/issues/1528) (GitHub, 15 comments)
