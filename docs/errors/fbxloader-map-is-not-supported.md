---
title: three.js FBXLoader map is not supported in three.js, skipping texture: the FBX slots it drops
phrase: map is not supported in three.js, skipping texture
description: What three.js means by "THREE.FBXLoader: SpecularFactor map is not supported in three.js, skipping texture", which material slots of an FBX file the loader reads and which it drops, and how a coding agent sees the dropped map with the paprika3d plugin's open and eval replies.
meta: How to fix three.js "THREE.FBXLoader: %s map is not supported in three.js, skipping texture": what triggers it, the line that prints it, and the fix in code.
intent: error-fbx-map-not-supported
message: THREE.FBXLoader: %s map is not supported in three.js, skipping texture.
queries:
  - "FBX loading warning"
  - "How can I load SpecularFactor Map textures from .FBX models?"
  - "FBX file renders as grayscale and skipping the textures"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.FBXLoader: SpecularFactor map is not supported in three.js, skipping texture.

FBXLoader prints this warning once for every texture an FBX material plugs into a slot that three.js has no property for. The model still loads and draws; the picture in that slot is simply not attached to the material. `SpecularFactor` is one name you will see in place of the slot; others are `ShininessExponent`, `AmbientColor`, `undefined`, and the long slot names a 3ds Max Physical Material writes.

## Where three.js prints it

`parseParameters()` in `examples/jsm/loaders/FBXLoader.js` (three r186) builds the parameters of each `MeshPhongMaterial` (or `MeshLambertMaterial`) from the FBX material node. It walks the textures connected to the material and switches on the name of the connection, which is the FBX property the texture drives. Names it knows become `map`, `normalMap`, `bumpMap`, `emissiveMap`, `specularMap`, `alphaMap`, `envMap`, `displacementMap` or `aoMap`. Every other name falls through to this branch:

```js
case 'AmbientColor':
case 'ShininessExponent': // AKA glossiness map
case 'SpecularFactor': // AKA specularLevel
case 'VectorDisplacementColor': // NOTE: Seems to be a copy of DisplacementColor
default:
	console.warn( 'THREE.FBXLoader: %s map is not supported in three.js, skipping texture.', type );
	break;
```

`type` is the connection's name, substituted for `%s` by the browser console. The full list of names three reads is in the same switch: `DiffuseColor` and `Maya|TEX_color_map`, `Bump`, `NormalMap` and `Maya|TEX_normal_map`, `Maya|TEX_ao_map`, `DisplacementColor`, `EmissiveColor`, `ReflectionColor`, `SpecularColor`, `TransparentColor` and `TransparencyFactor`. The picture behind a dropped slot is still loaded, because `parseTextures()` loads every texture node in the file before any material asks for one.

## Why an FBX file has slots three.js drops

- **Specular level and glossiness maps.** 3ds Max and Maya Phong or Blinn materials can drive `SpecularFactor` (specular level) and `ShininessExponent` (glossiness) with a picture. three's Phong material has one `specularMap` and no glossiness map, so the loader keeps neither.
- **An ambient colour map.** Some exports wire the diffuse picture into `AmbientColor` as well as `DiffuseColor`. The second copy is the one that warns; the model looks right.
- **A 3ds Max Physical Material.** Its slots are named after the renderer, not after FBX's standard Phong names, so none of them matches the switch. Every map warns, `DiffuseColor` is never set, and the model draws in plain grey. This is the case where the warning matters most.
- **A texture connected with no property name.** The connection is an object link instead of a property link, and the warning says `undefined map`.

## A page that reproduces it

The FBX file here is a small crate written by hand in FBX 7.4's text format, with two textures: a colour picture in `DiffuseColor` and a specular level picture in `SpecularFactor`, as a 3ds Max Phong material exports them. The page loads it the usual way:

```js
new FBXLoader().load('models/crate.fbx', (fbx) => {
  fbx.name = 'crate';
  scene.add(fbx);
}, undefined, (err) => console.error('crate did not load:', err));
```

The two connections in the file that matter:

```text
C: "OP",4000,3000, "DiffuseColor"
C: "OP",4100,3000, "SpecularFactor"
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. These calls were made on 2026-10-28 with the stable build on a machine with no GPU. Paths are shortened to `<project>` and the replies are cut to the lines discussed here, word for word.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:35491/index.html in 0.2 s, paused at frame 0.
three.js warned: THREE.FBXLoader: %s map is not supported in three.js, skipping texture. SpecularFactor
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}

look {}

On screen (1):
crate 9.8% [456, 247, 813, 596]
Never visible: none

eval {"code": "const m = find(\"crate\").children[0]; return { type: m.material.type, map: m.material.map?.name, specularMap: m.material.specularMap }"}

{"type":"MeshPhongMaterial","map":"wood_color","specularMap":null}
```

The warning fires while the file is parsed, before frame 0, so `open` lists it under `three.js warned`. It shows the message as three passed it to `console.warn`: the format string first, then the slot name, where a browser console prints `SpecularFactor map is not supported` in one piece. `look` finds the crate on screen, because one slot of two was dropped. The `eval` reply is the useful part: the colour picture reached `map`, and `specularMap` is null, so the specular level picture is loaded and unused. In a file where every slot warns, the same `eval` shows `map` as undefined, which is what a grey model means.

The replies do not say whether the dropped map mattered to the look. A specular level map changes nothing but the highlights, which is hard to see in one still frame.

## The fix

Decide per slot. When the dropped map is a duplicate (an ambient copy of the colour map) or a detail you can do without, leave it: the warning is information. When it carries something you want, there are two ways:

1. **Re-export with standard slots.** In 3ds Max, use a Standard or Phong material (or bake the Physical Material) so the colour sits in `DiffuseColor`; in any tool, unlink the slots three cannot use. Converting the model to glTF in Blender is the other route, and glTF's metal and roughness maps load without this step.
2. **Attach the picture yourself after loading.** For a specular level map, `MeshPhongMaterial.specularMap` is the closest property: three multiplies the highlight by it.

The fixed page does both: its FBX file names the colour map and nothing else, and the page loads the specular picture onto `specularMap`. The file is inlined so the block runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crate</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

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

// In a project this is models/crate.fbx, exported again with the specular level map unlinked
// from the material, so the file names only the colour map three.js can use.
const CRATE_FBX = `; FBX 7.4.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",1
		P: "UpAxisSign", "int", "Integer", "",1
		P: "FrontAxis", "int", "Integer", "",2
		P: "FrontAxisSign", "int", "Integer", "",1
		P: "CoordAxis", "int", "Integer", "",0
		P: "CoordAxisSign", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
	}
}
Objects:  {
	Geometry: 1000, "Geometry::crate", "Mesh" {
		Vertices: *24 {
			a: -0.5,0,-0.5,0.5,0,-0.5,0.5,0,0.5,-0.5,0,0.5,-0.5,1,-0.5,0.5,1,-0.5,0.5,1,0.5,-0.5,1,0.5
		}
		PolygonVertexIndex: *24 {
			a: 0,1,2,-4,4,7,6,-6,3,2,6,-8,1,0,4,-6,2,1,5,-7,0,3,7,-5
		}
		GeometryVersion: 124
		LayerElementNormal: 0 {
			Version: 101
			Name: ""
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			Normals: *72 {
				a: 0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0
			}
		}
		LayerElementUV: 0 {
			Version: 101
			Name: "UVMap"
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "IndexToDirect"
			UV: *8 {
				a: 0,0,1,0,1,1,0,1
			}
			UVIndex: *24 {
				a: 0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3
			}
		}
		Layer: 0 {
			Version: 100
			LayerElement:  {
				Type: "LayerElementNormal"
				TypedIndex: 0
			}
			LayerElement:  {
				Type: "LayerElementUV"
				TypedIndex: 0
			}
		}
	}
	Model: 2000, "Model::crate", "Mesh" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
		}
		Culling: "CullingOff"
	}
	Material: 3000, "Material::wood", "" {
		Version: 102
		ShadingModel: "phong"
		MultiLayer: 0
		Properties70:  {
			P: "DiffuseColor", "Color", "", "A",0.8,0.5,0.25
		}
	}
	Texture: 4000, "Texture::wood_color", "" {
		Type: "TextureVideoClip"
		Version: 202
		TextureName: "Texture::wood_color"
		FileName: "wood_color.png"
		RelativeFilename: "wood_color.png"
	}
	Video: 5000, "Video::wood_color", "Clip" {
		Type: "Clip"
		FileName: "wood_color.png"
		RelativeFilename: "wood_color.png"
		Content: ,
			"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGklEQVR4nGPoCdHAihhwSmwosMKKcEvQwQ4A5mxMQTAx4NEAAAAASUVORK5CYII="
	}
}
Connections:  {
	C: "OO",2000,0
	C: "OO",1000,2000
	C: "OO",3000,2000
	C: "OP",4000,3000, "DiffuseColor"
	C: "OO",5000,4000
}`;
// The specular level picture, loaded by hand onto the slot three.js has for it.
// In a project this is 'models/wood_spec.png'.
const SPEC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGUlEQVR4nGM4ceKEjY0NJsmAVRRIMgxKHQAZAmGBa6sqOQAAAABJRU5ErkJggg==';

const fbx = new FBXLoader().parse(new TextEncoder().encode(CRATE_FBX).buffer, '');
fbx.name = 'crate';
const specularMap = new THREE.TextureLoader().load(SPEC);
fbx.traverse((o) => {
  if (o.isMesh) o.material.specularMap = specularMap; // MeshPhongMaterial reads it as specular strength
});
scene.add(fbx);

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

Opened http://127.0.0.1:34707/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}

observe {}

{"entities":{"crate":{"type":"Group","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":12,"textures":2,"geometries":1,"programs":2},"scene":{"objects":4,"meshes":1,"lights":2,"cameras":0},"errors":[],"changed":null}}

eval {"code": "const m = find(\"crate\").children[0]; return { map: m.material.map?.name, specularMap: !!m.material.specularMap?.image }"}

{"map":"wood_color","specularMap":true}
```

`open` has no `three.js warned` line now, `observe` counts two textures in use on the GPU (`textures: 2`) instead of one, and `eval` confirms both properties hold a picture. For a model with many materials, the same `eval` run as a `traverse` over every mesh lists each material's `map`, which finds the grey ones in one call.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [How can I resolve issue with fbx not loading textures and colors?](https://discourse.threejs.org/t/how-can-i-resolve-issue-with-fbx-not-loading-textures-and-colors/20987) (discourse.threejs.org, 8,588 views, 4 posts)
- [FBX textures black (maybe a transparency issue?)](https://discourse.threejs.org/t/fbx-textures-black-maybe-a-transparency-issue/4010) (discourse.threejs.org, 3,304 views, 10 posts)
- [How can I load SpecularFactor Map textures from .FBX models?](https://discourse.threejs.org/t/how-can-i-load-specularfactor-map-textures-from-fbx-models/7940) (discourse.threejs.org, 3,225 views, 3 posts)
- [FBX loading warning](https://discourse.threejs.org/t/fbx-loading-warning/30787) (discourse.threejs.org, 2,973 views, 2 posts)
- [FBX file renders as grayscale and skipping the textures](https://discourse.threejs.org/t/fbx-file-renders-as-grayscale-and-skipping-the-textures/4795) (discourse.threejs.org, 2,883 views, 2 posts)
