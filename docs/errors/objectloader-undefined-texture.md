---
title: three.js THREE.ObjectLoader: Undefined texture, a scene background or environment the JSON does not contain
phrase: objectloader: undefined texture
description: What three.js means by "THREE.ObjectLoader: Undefined texture" followed by a uuid or a colour, which fields of a scene JSON ObjectLoader looks up as textures, why a background written as a colour string turns the scene black, and how a coding agent finds it with the paprika3d plugin's open, look and eval replies.
meta: How to fix three.js "THREE.ObjectLoader: Undefined texture #87ceeb": what triggers it, the line that prints it, and the fix in code.
intent: error-objectloader-undefined-texture
message: THREE.ObjectLoader: Undefined texture #87ceeb
queries:
  - "Undefined texture to load JSON material with MaterialLoader"
  - "THREE.ObjectLoader: Undefined texture"
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# THREE.ObjectLoader: Undefined texture #87ceeb

ObjectLoader prints this warning when a three.js JSON file points at a texture by its uuid and the file's `textures` list has no texture with that uuid. The object is still created, with the texture property left undefined. The value after the word `texture` is whatever the file had in that place: a uuid when a texture was dropped from the file, or, as here, a colour that was never meant to be a texture at all.

## Where three.js prints it

`ObjectLoader.parseObject()` in `src/loaders/ObjectLoader.js` (three r186) looks textures up through a small helper:

```js
function getTexture( uuid ) {

	if ( textures[ uuid ] === undefined ) {

		warn( 'ObjectLoader: Undefined texture', uuid );

	}

	return textures[ uuid ];

}
```

In r186 the helper is called for a `Scene`'s `background` and `environment`, and for the matrices, indirect and colour textures of a `BatchedMesh`. The background case decides between a colour and a texture by type alone:

```js
if ( data.background !== undefined ) {

	if ( Number.isInteger( data.background ) ) {

		object.background = new Color( data.background );

	} else {

		object.background = getTexture( data.background );

	}

}
```

An integer is a colour; anything else, a string included, is taken as a texture uuid. Material maps (`map`, `normalMap` and the rest) go through `Material.fromJSON()` instead, which sets a missing one to null without printing anything, so a material that lost its texture in a JSON file stays silent.

## Why the texture is not in the file

- **A colour written as a string.** A scene JSON produced by your own exporter (a Python script, a CMS, a level editor) that writes `"background": "#87ceeb"` or `"0x87ceeb"`. `scene.toJSON()` writes the colour as a number, which is what ObjectLoader expects.
- **The images and textures trimmed out.** Someone removed the large `images` array (and with it `textures`) to make the file smaller, or merged objects from two files and kept one file's lists. The `background` or `environment` uuid now points nowhere.

## A page that reproduces it

The room below comes from a small exporter that writes the sky colour as a CSS string. The page loads it and copies the room's background and children into its own scene:

```js
new THREE.ObjectLoader().load('models/room.json', (room) => {
  scene.background = room.background;   // the room's sky colour
  scene.add(...room.children);
});
```

The field in `models/room.json` that matters:

```text
"uuid": "room", "type": "Scene", "name": "room", "background": "#87ceeb",
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. The calls are from 2026-10-28 with the stable build, run on a machine with no GPU; the folder appears as `<project>`, and the replies are cut to the lines this page goes through, each kept as written.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:35907/index.html in 0.1 s, paused at frame 0.
three.js warned: THREE.ObjectLoader: Undefined texture #87ceeb
Page text outside the canvas: none
{"three":"186","scenes":2,"entities":["rug"]}

look {}

Pixels: brightness 3%, colour saturation 7%, 89% near black, 0% blown out. Mostly black: the objects cover 10.7% of the frame.
Hues: grey 89%, red 11% of the frame; over the objects (10.7% of it): red 100%.
On screen (1):
rug 11% [335, 312, 944, 521] 1.6 × 1.2 units

eval {"code": "return { background: scene.background ?? null }"}

{"background":null}
```

`open` lists the warning, since the JSON loaded and parsed before frame 0, and the value it quotes is the colour string from the file. `scenes: 2` counts the page's scene and the loaded room, which is a `Scene` object of its own. `look` shows what the warning costs: 89% of the frame is near black, where the sky should be light blue, and the red rug is the one thing visible. The page's own dark grey background is gone too, because `room.background` was undefined and the page copied that over it. The `eval` confirms the scene has no background.

## The fix

Write the colour as a number in the exporter, as `scene.toJSON()` does: `0x87ceeb` is 8900331. If the JSON comes from a tool you cannot change, convert the field before parsing (`json.object.background = new THREE.Color(json.object.background).getHex()`), then call `ObjectLoader.parse()` on the object. For a background or environment texture that went missing from the lists, export the scene again with `scene.toJSON()` so `textures` and `images` come with it. The fixed page, with the room JSON inlined:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Room</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';


const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2e36);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 2.6);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 4);
scene.add(sun);

// In a project this is 'models/room.json'. The background is a number (0x87ceeb is 8900331), the way
// scene.toJSON() writes a colour; a string there is read as a texture's uuid.
const ROOM_JSON = {
  metadata: { version: 4.7, type: 'Object', generator: 'room-export.py' },
  geometries: [{ uuid: 'rug-geometry', type: 'BoxGeometry', width: 1.6, height: 0.02, depth: 1.2 }],
  materials: [{ uuid: 'rug-material', type: 'MeshStandardMaterial', color: 9059118, roughness: 0.9, metalness: 0 }],
  object: {
    uuid: 'room', type: 'Scene', name: 'room', background: 8900331,
    children: [{ uuid: 'rug', type: 'Mesh', name: 'rug', geometry: 'rug-geometry', material: 'rug-material' }]
  }
};

const room = new THREE.ObjectLoader().parse(ROOM_JSON);
scene.background = room.background;   // the room's sky colour, a THREE.Color now
scene.add(...room.children);

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

Opened http://127.0.0.1:40199/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":2,"entities":["rug"]}

look {}

Pixels: brightness 71%, colour saturation 45%, 0% near black, 0% blown out.
Hues: cyan 89%, red 11% of the frame; over the objects (10.7% of it): red 100%.
On screen (1):
rug 11% [335, 312, 944, 521] 1.6 × 1.2 units

eval {"code": "return { background: scene.background.isColor ? \"#\" + scene.background.getHexString() : scene.background }"}

{"background":"#87ceeb"}
```

The warning is gone, the 89% that was near black is now cyan (the light blue sky), and `eval` reads the background back as `#87ceeb`.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Undefined texture to load JSON material with MaterialLoader](https://discourse.threejs.org/t/undefined-texture-to-load-json-material-with-materialloader/3954) (discourse.threejs.org, 2,036 views, 15 posts)
