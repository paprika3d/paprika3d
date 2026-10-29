---
title: three.js FBXLoader TGA loader not found, skipping: the black FBX model and the TGALoader handler
phrase: tga loader not found, skipping
description: What three.js means by "FBXLoader: TGA loader not found, skipping", why an FBX model with an embedded TGA texture draws black, how to register TGALoader on the loading manager, and how a coding agent sees the missing picture with the paprika3d plugin's eval replies.
meta: How to fix three.js "FBXLoader: TGA loader not found, skipping": what triggers it, the line that prints it, and the fix in code.
intent: error-fbx-tga-loader-not-found
message: FBXLoader: TGA loader not found, skipping
queries:
  - "Issue Loading FBX with imbedded TGA"
  - "FBXLoader: TGA loader not found, skipping"
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# FBXLoader: TGA loader not found, skipping  crate.tga

FBXLoader prints this when an FBX file carries a texture as an embedded TGA image and nothing on the page can decode TGA. Browsers decode PNG, JPEG and WebP, but not TGA, so three needs its own `TGALoader` for it, and FBXLoader looks for one on its loading manager. Without one, the texture is created with no picture and the material samples black. In r186 this line has no `THREE.` prefix, unlike most three.js warnings, and the two spaces before the file name are how the console joins the two values three passes it.

## Where three.js prints it

`parseImage()` in `examples/jsm/loaders/FBXLoader.js` (three r186) turns each embedded image (an FBX `Video` node with `Content`) into a data URL, choosing the MIME type from the file's extension:

```js
case 'tga':

	if ( this.manager.getHandler( '.tga' ) === null ) {

		console.warn( 'FBXLoader: TGA loader not found, skipping ', fileName );

	}

	type = 'image/tga';
	break;
```

Despite the word "skipping", the code goes on. It returns a `data:image/tga;base64,...` URL, and `loadTexture()` later asks the manager for a `.tga` handler again; finding none, it gives the URL to the plain `TextureLoader`, which hands it to an `<img>` element. The browser cannot decode it, the image's error event fires, and the `Texture` keeps `image` set to null. Nothing else is logged.

`parseImage()` runs for embedded images and no others. When the FBX names a TGA file beside it instead of embedding it, the same thing happens to the texture, but this warning never prints, so the model goes black with no line in the console at all.

## Why an FBX file has TGA textures

- **Game art pipelines.** TGA was the usual texture format for games for a long time, and models from asset stores, Unity projects and older 3ds Max or Maya scenes often keep it.
- **Embed Media on export.** 3ds Max, Maya and Blender's FBX exporter (path mode Copy with the embed button) can pack the textures inside the FBX. A packed TGA is the case that prints this warning.
- **An FBX converted from another format**, which keeps the original texture files as they were.

## A page that reproduces it

The FBX here is a crate written by hand in FBX 7.4's text format, with its colour map embedded as an 8 by 8 TGA in a `Video` node. The page loads it with a bare FBXLoader:

```js
new FBXLoader().load('models/crate.fbx', (fbx) => {
  fbx.name = 'crate';
  scene.add(fbx);
}, undefined, (err) => console.error('crate did not load:', err));
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. These calls were made on 2026-10-28 with the stable build on a machine with no GPU. Paths are shortened to `<project>`, and the replies are cut to the lines discussed below with nothing reworded.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:37127/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}

look {}

Pixels: brightness 16%, colour saturation 20%, 10% near black, 0% blown out.
Hues: grey 100% of the frame; over the objects (9.8% of it): grey 100%.
On screen (1):
crate 9.8% [456, 247, 813, 596]

observe {}

{"entities":{"crate":{"type":"Group","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":12,"textures":0,"geometries":1,"programs":2},"scene":{"objects":4,"meshes":1,"lights":2,"cameras":0},"errors":[],"changed":null}}
```

`open` shows no warning. It lists a three.js warning when the text starts with `THREE.` and leaves out the rest, and this one starts with the bare loader name, so an agent reading `open` alone does not see it. The other replies show the effect: `look` finds the crate on screen but all grey, with 10% of the frame near black (the crate's faces), and `observe` counts zero textures on the GPU (`textures: 0`) for a material that has a map. To see the warning itself, an `eval` can parse the file again, since its reply lists what the code logged:

```text
eval {"code": "const { FBXLoader } = await import(\"three/addons/loaders/FBXLoader.js\"); const bytes = await (await fetch(\"models/crate.fbx\")).arrayBuffer(); new FBXLoader().parse(bytes, \"models/\"); return \"parsed again\""}

parsed again
warn: FBXLoader: TGA loader not found, skipping  crate.tga

eval {"code": "const t = find(\"crate\").children[0].material.map; return { name: t.name, image: t.image ?? null, version: t.version }"}

{"name":"crate_color","image":null,"version":0}
```

The second `eval` is the check to run on any black FBX model: the material has a `map`, its `image` is null, and `version` 0 means three never uploaded it.

## The fix

Register `TGALoader` on a `LoadingManager` and give that manager to FBXLoader. `parseImage()` then stops warning, and `loadTexture()` sends the TGA to the handler instead of to an image element. The handler covers TGA files next to the FBX as well as embedded ones. The fixed page inlines the same FBX so it runs on its own:

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
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

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

// In a project this is models/crate.fbx, with its colour map embedded as a TGA file.
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
	Texture: 4000, "Texture::crate_color", "" {
		Type: "TextureVideoClip"
		Version: 202
		TextureName: "Texture::crate_color"
		FileName: "crate.tga"
		RelativeFilename: "crate.tga"
	}
	Video: 5000, "Video::crate_color", "Clip" {
		Type: "Clip"
		FileName: "crate.tga"
		RelativeFilename: "crate.tga"
		Content: ,
			"AAACAAAAAAAAAAAACAAIABgAOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCwKFSMKFSMOnCwOnCw"
	}
}
Connections:  {
	C: "OO",2000,0
	C: "OO",1000,2000
	C: "OO",3000,2000
	C: "OP",4000,3000, "DiffuseColor"
	C: "OO",5000,4000
}`;

// FBXLoader asks the loading manager for a .tga handler before it decodes an embedded TGA.
const manager = new THREE.LoadingManager();
manager.addHandler(/\.tga$/i, new TGALoader(manager));

const fbx = new FBXLoader(manager).parse(new TextEncoder().encode(CRATE_FBX).buffer, '');
fbx.name = 'crate';
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

Opened http://127.0.0.1:44923/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["crate"]}

look {}

Hues: grey 90%, orange 10% of the frame; over the objects (9.8% of it): orange 100%.
On screen (1):
crate 9.8% [456, 247, 813, 596]

observe {}

{"entities":{"crate":{"type":"Group","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":12,"textures":1,"geometries":1,"programs":2},"scene":{"objects":4,"meshes":1,"lights":2,"cameras":0},"errors":[],"changed":null}}

eval {"code": "const t = find(\"crate\").children[0].material.map; return { name: t.name, type: t.type, image: [t.image.width, t.image.height] }"}

{"name":"crate_color","type":1009,"image":[8,8]}
```

The crate is orange-brown over all of its pixels, `observe` counts one texture, and the map now holds the 8 by 8 picture. Type 1009 is `UnsignedByteType`: TGALoader builds a `DataTexture` from the decoded pixels.

The other fix is in the file: convert the TGA to PNG and export the FBX again pointing at the PNG. That saves a loader on the page, since the browser decodes PNG itself. For a model you are going to ship, converting it to glTF with its textures as PNG, JPEG or WebP avoids the question entirely.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Issue Loading FBX with imbedded TGA](https://discourse.threejs.org/t/issue-loading-fbx-with-imbedded-tga/11976) (discourse.threejs.org, 2,704 views, 3 posts)
