---
title: three.js FBXLoader Vertex has more than 4 skinning weights: what it drops and how to export 4
phrase: vertex has more than 4 skinning weights
description: What three.js means by "THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.", which bone influences the loader keeps, how to limit them on export, and how a coding agent reads a vertex's weights with the paprika3d plugin's eval replies.
meta: three.js "THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights": what triggers it and how to fix it.
intent: error-fbx-more-than-4-skin-weights
message: THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.
queries:
  - "Is the limit of 4 skinning weights per vertex a hard limit of WebGL?"
  - "THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights."
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.

A skinned FBX model can let any number of bones pull on one vertex. three.js gives each vertex four bone slots, so FBXLoader keeps the four largest influences, throws the rest away and scales the kept four back up to a total of 1. The model loads and animates; the vertices that lost an influence move a little differently from the way they did in the program that rigged them. The warning prints once per mesh, however many vertices were cut.

## Where three.js prints it

`GeometryParser.genBuffers()` in `examples/jsm/loaders/FBXLoader.js` (three r186) gathers, for each corner of each polygon, the bones that list that vertex in their FBX skin cluster. More than four, and it warns, then keeps the four largest with a small insertion sort:

```js
if ( weights.length > 4 ) {

	if ( ! displayedWeightsWarning ) {

		console.warn( 'THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.' );
		displayedWeightsWarning = true;

	}

	const wIndex = [ 0, 0, 0, 0 ];
	const Weight = [ 0, 0, 0, 0 ];
```

`displayedWeightsWarning` is reset for each geometry, so a model with three skinned meshes can print it three times. After the buffers are built, `parseModels()` calls `SkinnedMesh.normalizeSkinWeights()`, which divides each vertex's four weights by their sum.

The limit comes from three's skinning, not from the file format or from WebGL. The vertex shader in `src/renderers/shaders/ShaderChunk/skinning_vertex.glsl.js` reads one `vec4` of bone indices and one `vec4` of weights per vertex:

```js
skinned += boneMatX * skinVertex * skinWeight.x;
skinned += boneMatY * skinVertex * skinWeight.y;
skinned += boneMatZ * skinVertex * skinWeight.z;
skinned += boneMatW * skinVertex * skinWeight.w;
```

glTF stores influences in sets of four as well, and game engines commonly cap them at four (Unity's default) or eight.

## Why a model has more than four

- **Automatic weights.** Blender's automatic weights, Maya's smooth bind with a high max influence setting and similar tools spread a vertex over every bone nearby, so vertices at a shoulder, a hip or a face often get five to eight.
- **Face rigs and tails.** Many small bones close together (lips, eyelids, a chain of tail bones) share vertices.
- **Smoothing after painting.** Smoothing weights in Blender or Maya spreads small weights to neighbour bones and raises the count without anyone noticing.

## A page that reproduces it

The FBX here is written by hand in FBX 7.4's text format: a column two units tall, skinned to a chain of five bones (`root`, `spine`, `chest`, `neck`, `head`). Its top corners take all five, with weights 0.05, 0.1, 0.15, 0.3 and 0.4. The page loads it with a plain FBXLoader:

```js
new FBXLoader().load('models/column.fbx', (fbx) => {
  fbx.name = 'column';
  scene.add(fbx);
}, undefined, (err) => console.error('column did not load:', err));
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0. The calls below ran on 2026-10-28 with the stable build, on a machine with no GPU. Paths read `<project>` and the replies are cut to the lines this page explains, unchanged otherwise.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41767/index.html in 0.2 s, paused at frame 0.
three.js warned: THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["column"]}

look {}

On screen (1):
column 7.3% [522, 229, 751, 595]
Never visible: none

eval {"code": "const m = find(\"column\").getObjectByProperty(\"isSkinnedMesh\", true); const a = m.geometry.attributes; const v = Math.floor(a.position.array.findIndex((y, i) => i % 3 === 1 && y > 1.9) / 3); return { mesh: m.type, bones: m.skeleton.bones.map(b => b.name), vertex: v, skinIndex: [...a.skinIndex.array.slice(v * 4, v * 4 + 4)], skinWeight: [...a.skinWeight.array.slice(v * 4, v * 4 + 4)].map(w => +w.toFixed(3)) }"}

{"mesh":"SkinnedMesh","bones":["root","spine","chest","neck","head"],"vertex":6,"skinIndex":[4,3,2,1],"skinWeight":[0.421,0.316,0.158,0.105]}
```

The warning comes from parsing, which happens before frame 0, so `open` lists it. `look` shows the column drawn in its rest pose, which is no help here: dropped weights change nothing until a bone moves. The `eval` reply is the evidence. It finds the first vertex at the top of the column and reads its two skin attributes: bones 4, 3, 2 and 1 (`head`, `neck`, `chest`, `spine`) are kept in order of weight, and bone 0, `root`, with its 0.05, is gone. The four kept weights were divided by 0.95, their sum, which is why 0.4 became 0.421. The share of the corner's motion that came from `root` is now spread over the other four bones.

A small dropped weight like this one is rarely visible. A large one is: if a vertex has six influences of similar size, the two that go away carry a third of its motion between them, and the mesh creases or tears at that joint while it animates. The replies here do not play an animation, so they cannot show that; the weights are what to check.

## The fix

Limit the influences to four in the program that exports the FBX, and normalise the weights there, so three has nothing to cut:

- **Blender:** in Weight Paint mode, Weights > Limit Total with Limit 4, then Weights > Normalize All.
- **Maya:** in the Bind Skin options, Max Influences set to 4 with Maintain Max Influences on.
- **3ds Max:** the Skin modifier's Bone Affect Limit set to 4.

The artist then sees the result of the cut while animating, instead of finding it in the browser. The fixed page loads the same column exported with four influences at most (the top corners drop `root` and the other four are normalised), inlined so the block runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Column</title>
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
camera.position.set(3, 2.5, 5);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 4);
scene.add(sun);

// In a project this is models/column.fbx, exported again with the influences per vertex
// limited to 4 and the weights normalised, so each vertex names at most 4 bones.
const COLUMN_FBX = `; FBX 7.4.0 project file
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
	Geometry: 1000, "Geometry::column", "Mesh" {
		Vertices: *24 {
			a: -0.5,0,-0.5,0.5,0,-0.5,0.5,0,0.5,-0.5,0,0.5,-0.5,2,-0.5,0.5,2,-0.5,0.5,2,0.5,-0.5,2,0.5
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
	Model: 2000, "Model::column", "Mesh" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
		}
		Culling: "CullingOff"
	}
	Material: 3000, "Material::clay", "" {
		Version: 102
		ShadingModel: "phong"
		MultiLayer: 0
		Properties70:  {
			P: "DiffuseColor", "Color", "", "A",0.75,0.7,0.65
		}
	}
	Deformer: 6000, "Deformer::Skin", "Skin" {
		Version: 101
		Link_DeformAcuracy: 50
	}
	Deformer: 6100, "SubDeformer::root", "Cluster" {
		Version: 100
		Indexes: *4 {
			a: 0,1,2,3
		}
		Weights: *4 {
			a: 1,1,1,1
		}
		Transform: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
		TransformLink: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
	}
	Model: 7000, "Model::root", "LimbNode" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
		}
		Culling: "CullingOff"
	}
	Deformer: 6101, "SubDeformer::spine", "Cluster" {
		Version: 100
		Indexes: *4 {
			a: 4,5,6,7
		}
		Weights: *4 {
			a: 0.105,0.105,0.105,0.105
		}
		Transform: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
		TransformLink: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0.5,0,1
		}
	}
	Model: 7001, "Model::spine", "LimbNode" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0.5,0
		}
		Culling: "CullingOff"
	}
	Deformer: 6102, "SubDeformer::chest", "Cluster" {
		Version: 100
		Indexes: *4 {
			a: 4,5,6,7
		}
		Weights: *4 {
			a: 0.158,0.158,0.158,0.158
		}
		Transform: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
		TransformLink: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,1,0,1
		}
	}
	Model: 7002, "Model::chest", "LimbNode" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0.5,0
		}
		Culling: "CullingOff"
	}
	Deformer: 6103, "SubDeformer::neck", "Cluster" {
		Version: 100
		Indexes: *4 {
			a: 4,5,6,7
		}
		Weights: *4 {
			a: 0.316,0.316,0.316,0.316
		}
		Transform: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
		TransformLink: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,1.5,0,1
		}
	}
	Model: 7003, "Model::neck", "LimbNode" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0.5,0
		}
		Culling: "CullingOff"
	}
	Deformer: 6104, "SubDeformer::head", "Cluster" {
		Version: 100
		Indexes: *4 {
			a: 4,5,6,7
		}
		Weights: *4 {
			a: 0.421,0.421,0.421,0.421
		}
		Transform: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
		TransformLink: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,2,0,1
		}
	}
	Model: 7004, "Model::head", "LimbNode" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0.5,0
		}
		Culling: "CullingOff"
	}
}
Connections:  {
	C: "OO",2000,0
	C: "OO",1000,2000
	C: "OO",3000,2000
	C: "OO",6000,1000
	C: "OO",6100,6000
	C: "OO",7000,6100
	C: "OO",7000,0
	C: "OO",6101,6000
	C: "OO",7001,6101
	C: "OO",7001,7000
	C: "OO",6102,6000
	C: "OO",7002,6102
	C: "OO",7002,7001
	C: "OO",6103,6000
	C: "OO",7003,6103
	C: "OO",7003,7002
	C: "OO",6104,6000
	C: "OO",7004,6104
	C: "OO",7004,7003
}`;

const fbx = new FBXLoader().parse(new TextEncoder().encode(COLUMN_FBX).buffer, '');
fbx.name = 'column';
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

Opened http://127.0.0.1:42493/index.html in 0.3 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["column"]}

eval {"code": "const m = find(\"column\").getObjectByProperty(\"isSkinnedMesh\", true); const a = m.geometry.attributes; const v = Math.floor(a.position.array.findIndex((y, i) => i % 3 === 1 && y > 1.9) / 3); return { mesh: m.type, bones: m.skeleton.bones.map(b => b.name), vertex: v, skinIndex: [...a.skinIndex.array.slice(v * 4, v * 4 + 4)], skinWeight: [...a.skinWeight.array.slice(v * 4, v * 4 + 4)].map(w => +w.toFixed(3)) }"}

{"mesh":"SkinnedMesh","bones":["root","spine","chest","neck","head"],"vertex":6,"skinIndex":[1,2,3,4],"skinWeight":[0.105,0.158,0.316,0.421]}
```

`open` has no warning, and the top corner holds the same four bones with the weights the file gave, in the file's order. Converting the model to glTF in Blender after limiting the weights keeps the same four per vertex.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Is the limit of 4 skinning weights per vertex a hard limit of WebGL?](https://discourse.threejs.org/t/is-the-limit-of-4-skinning-weights-per-vertex-a-hard-limit-of-webgl/801) (discourse.threejs.org, 9,433 views, 11 posts)
- [Dat.gui is not displaying as expected](https://discourse.threejs.org/t/dat-gui-is-not-displaying-as-expected/52498) (discourse.threejs.org, 3,290 views, 12 posts)
- [FBX loader failing to load binary](https://github.com/mrdoob/three.js/issues/11487) (GitHub, 34 comments)
