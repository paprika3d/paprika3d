---
title: three.js GLTFLoader Unknown extension: a required glTF extension three.js does not read
phrase: gltfloader unknown extension
description: What three.js means by "THREE.GLTFLoader: Unknown extension", which glTF extensions r186 reads, why a KHR_materials_pbrSpecularGlossiness model loads white or black, how to convert it, and how a coding agent reads the material with the paprika3d plugin's open, look and eval replies.
meta: How to fix three.js "THREE.GLTFLoader: Unknown extension 'KHR_materials_pbrSpecularGlossiness'": what triggers it, the line that prints it, and the fix in code.
intent: error-gltf-unknown-extension
message: THREE.GLTFLoader: Unknown extension "KHR_materials_pbrSpecularGlossiness".
queries:
  - "Unable to load model properly, unknown extension KHR"
  - "THREE.GLTFLoader: Unknown extension"
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.GLTFLoader: Unknown extension "KHR_materials_pbrSpecularGlossiness".

A glTF file can list extensions in `extensionsRequired`, which means a reader that does not support them cannot show the model correctly. GLTFLoader warns once for each required extension it has no code for, then loads the file anyway and ignores the extension's data. The model appears, but whatever the extension described (most often the material) is missing. `KHR_materials_pbrSpecularGlossiness` is the name people see most, because three.js dropped support for it in r147 and older exporters still write it.

## Where three.js prints it

`GLTFLoader.parse()` in `examples/jsm/loaders/GLTFLoader.js` (three r186) first registers its plugins, then walks `extensionsUsed`. Four extensions are handled in the switch itself; for any other name, it warns when the name is also in `extensionsRequired` and no plugin claims it:

```js
default:

	if ( extensionsRequired.indexOf( extensionName ) >= 0 && plugins[ extensionName ] === undefined ) {

		console.warn( 'THREE.GLTFLoader: Unknown extension "' + extensionName + '".' );

	}
```

The names r186 reads are in the `EXTENSIONS` table of the same file: Draco and meshopt compression, `KHR_mesh_quantization`, `KHR_texture_transform`, `KHR_texture_basisu`, WebP and AVIF textures, `KHR_lights_punctual`, GPU instancing, `KHR_materials_unlit`, `KHR_materials_emissive_strength`, `EXT_materials_bump`, and the physical material extensions (clearcoat, dispersion, ior, iridescence, sheen, specular, transmission, volume, anisotropy). An extension listed in `extensionsUsed` but not in `extensionsRequired` is skipped without a word.

## Why a file requires an extension three.js lacks

- **Specular-glossiness materials.** Old Sketchfab downloads and the Babylon.js exporter for 3ds Max wrote `KHR_materials_pbrSpecularGlossiness` as a required extension. The extension is archived by Khronos, and three removed its loader after r146.
- **Engine-specific extensions.** A file exported for another engine (`KHR_techniques_webgl`, a vendor's `MSFT_` or `ADOBE_` extension, or a game's own) that marks it required.
- **A compression or texture format the page does not set up**, such as `KHR_draco_mesh_compression` without a `DRACOLoader`, which throws its own error instead; the guide on [glTF models that fail to load](/guides/threejs-gltf-model-failed-to-load) covers that one.

## A page that reproduces it

The GLB here was written with glTF Transform: one crate whose material is defined through `KHR_materials_pbrSpecularGlossiness` and nothing else, with a diffuse colour of orange-brown, and the extension marked as required. The page loads it the usual way:

```js
new GLTFLoader().load('models/crate.glb', (gltf) => {
  gltf.scene.name = 'crate';
  scene.add(gltf.scene);
});
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. These calls ran on 2026-10-28 with the stable build, on a machine that has no GPU. Each reply is cut to the lines discussed, with the folder shown as `<project>` and no other change.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41299/index.html in 0.2 s, paused at frame 0.
three.js warned: THREE.GLTFLoader: Unknown extension "KHR_materials_pbrSpecularGlossiness".
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}
Loaded: crate.glb 0.0 MB

look {}

Hues: grey 100% of the frame; over the objects (9.8% of it): grey 100%.
Lighting: 1 metallic materials with no environment map (scene.environment unset): metal reflects nothing and draws black. Bake a RoomEnvironment through PMREMGenerator, or call stage() from fx.js.
On screen (1):
crate 9.8% [456, 247, 813, 596]

eval {"code": "const m = find(\"crate\").getObjectByProperty(\"isMesh\", true).material; return { type: m.type, color: m.color.getHexString(), metalness: m.metalness, roughness: m.roughness }"}

{"type":"MeshStandardMaterial","color":"ffffff","metalness":1,"roughness":1}
```

The warning fires while the file is parsed, so `open` lists it, and the crate is in the scene. `look` shows the result: the crate is grey where it should be orange-brown, and its Lighting line reports a metallic material with no environment. That is not a choice the file made. With the extension ignored, the material has no `pbrMetallicRoughness` block, so three uses the glTF defaults: base colour white, metalness 1 and roughness 1. The `eval` reply shows exactly those three values. On a page with an environment map the same model looks like dull white metal instead.

## The fix

Convert the material to metal and roughness, which three reads natively. glTF Transform's `metalRough()` function does it (on the command line, `bunx @gltf-transform/cli metalrough in.glb out.glb`); this is the conversion that produced the fixed file, run with bun:

```js
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { metalRough } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('models/crate.glb');
await doc.transform(metalRough());
await io.write('models/crate.glb', doc);
```

It moves the diffuse colour to `baseColorFactor` and writes the specular colour through `KHR_materials_specular` and `KHR_materials_ior`, both of which three r186 reads. Blender's glTF importer also reads specular-glossiness files, and exporting again from Blender gives metal and roughness. The page with the converted file inlined:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crate</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2e36);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.2, 1.8, 3);
camera.lookAt(0, 0.5, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 4);
scene.add(sun);

// In a project this is 'models/crate.glb' after the conversion to metal and roughness shown above.
// Inlined here so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAACkBgAAAAQAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjUuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC41LDEsMC41XSwibWluIjpbLTAuNSwwLC0wLjVdLCJidWZmZXJWaWV3IjowLCJieXRlT2Zmc2V0IjowfSx7InR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjI0LCJidWZmZXJWaWV3IjowLCJieXRlT2Zmc2V0IjoxMn0seyJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjM2LCJidWZmZXJWaWV3IjoxLCJieXRlT2Zmc2V0IjowfV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjU3NiwiYnl0ZVN0cmlkZSI6MjQsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo1NzYsImJ5dGVMZW5ndGgiOjcyLCJ0YXJnZXQiOjM0OTYzfV0sImJ1ZmZlcnMiOlt7ImJ5dGVMZW5ndGgiOjY0OH1dLCJtYXRlcmlhbHMiOlt7Im5hbWUiOiJ3b29kIiwicGJyTWV0YWxsaWNSb3VnaG5lc3MiOnsiYmFzZUNvbG9yRmFjdG9yIjpbMC42OSwwLjQyLDAuMiwxXSwicm91Z2huZXNzRmFjdG9yIjowLjcsIm1ldGFsbGljRmFjdG9yIjowfSwiZXh0ZW5zaW9ucyI6eyJLSFJfbWF0ZXJpYWxzX2lvciI6eyJpb3IiOjEwMDB9LCJLSFJfbWF0ZXJpYWxzX3NwZWN1bGFyIjp7InNwZWN1bGFyQ29sb3JGYWN0b3IiOlswLjEsMC4xLDAuMV19fX1dLCJtZXNoZXMiOlt7Im5hbWUiOiJjcmF0ZSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sIm1vZGUiOjQsIm1hdGVyaWFsIjowLCJpbmRpY2VzIjoyfV19XSwibm9kZXMiOlt7Im5hbWUiOiJjcmF0ZSIsIm1lc2giOjB9XSwic2NlbmVzIjpbeyJub2RlcyI6WzBdfV0sImV4dGVuc2lvbnNVc2VkIjpbIktIUl9tYXRlcmlhbHNfaW9yIiwiS0hSX21hdGVyaWFsc19zcGVjdWxhciJdfSAgiAIAAEJJTgAAAAC/AAAAAAAAAL8AAAAAAACAvwAAAAAAAAA/AAAAAAAAAL8AAAAAAACAvwAAAAAAAAA/AAAAAAAAAD8AAAAAAACAvwAAAAAAAAC/AAAAAAAAAD8AAAAAAACAvwAAAAAAAAC/AACAPwAAAL8AAAAAAACAPwAAAAAAAAC/AACAPwAAAD8AAAAAAACAPwAAAAAAAAA/AACAPwAAAD8AAAAAAACAPwAAAAAAAAA/AACAPwAAAL8AAAAAAACAPwAAAAAAAAC/AAAAAAAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAAAAAAD8AAAAAAAAAAAAAgD8AAAA/AACAPwAAAD8AAAAAAAAAAAAAgD8AAAC/AACAPwAAAD8AAAAAAAAAAAAAgD8AAAA/AAAAAAAAAL8AAAAAAAAAAAAAgL8AAAC/AAAAAAAAAL8AAAAAAAAAAAAAgL8AAAC/AACAPwAAAL8AAAAAAAAAAAAAgL8AAAA/AACAPwAAAL8AAAAAAAAAAAAAgL8AAAA/AAAAAAAAAD8AAIA/AAAAAAAAAAAAAAA/AAAAAAAAAL8AAIA/AAAAAAAAAAAAAAA/AACAPwAAAL8AAIA/AAAAAAAAAAAAAAA/AACAPwAAAD8AAIA/AAAAAAAAAAAAAAC/AAAAAAAAAL8AAIC/AAAAAAAAAAAAAAC/AAAAAAAAAD8AAIC/AAAAAAAAAAAAAAC/AACAPwAAAD8AAIC/AAAAAAAAAAAAAAC/AACAPwAAAL8AAIC/AAAAAAAAAAAAAAEAAgAAAAIAAwAEAAUABgAEAAYABwAIAAkACgAIAAoACwAMAA0ADgAMAA4ADwAQABEAEgAQABIAEwAUABUAFgAUABYAFwA=';

new GLTFLoader().load(MODEL, (gltf) => {
  gltf.scene.name = 'crate';
  scene.add(gltf.scene);
}, undefined, (err) => console.error('crate did not load:', err));

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:39703/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}

look {}

Hues: grey 90%, orange 10% of the frame; over the objects (9.8% of it): orange 100%.
On screen (1):
crate 9.8% [456, 247, 813, 596]

eval {"code": "const m = find(\"crate\").getObjectByProperty(\"isMesh\", true).material; return { type: m.type, color: m.color.getHexString(), metalness: m.metalness, roughness: m.roughness }"}

{"type":"MeshPhysicalMaterial","color":"d8ad7c","metalness":0,"roughness":0.7}
```

No warning, the crate is orange over all of its pixels, and the material is a `MeshPhysicalMaterial` (three picks it for the specular extension) with metalness 0. For an extension that is yours, `loader.register(parser => ({ name: 'MY_extension', ... }))` adds a plugin, and the warning stops because `plugins[extensionName]` is then defined.

`model_audit` on the original file reports no problem with it, since it does not check `extensionsRequired` against what three reads; the `open` reply is where the warning shows:

```text
model_audit {"cwd": "<project>", "path": "models/crate.glb"}

models/crate.glb · 2 KB · 12 triangles · 1 material · no textures · Draco no, meshopt no, KTX2 no
site: passes
```

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Unable to load model properly, unknown extension KHR](https://discourse.threejs.org/t/unable-to-load-model-properly-unknown-extension-khr/72548) (discourse.threejs.org, 785 views, 9 posts)
