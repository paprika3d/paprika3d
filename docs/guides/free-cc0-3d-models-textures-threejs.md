---
title: Free CC0 3D models and textures for three.js: find one, read its licence, place it at real size
phrase: free cc0 3d models and textures for three.js
description: Where to get a free 3D model or tiling PBR texture that a three.js site may use, what CC0 and CC BY 4.0 ask of you, and how a coding agent finds one with the paprika3d plugin's asset_search tool (by words or by a crop of a photo), picks it into the project with its loading code and a credit line, and checks it on the page with look.
meta: Free CC0 3D models and textures for three.js: find one with asset_search, read its licence and credit line, and place it at real size.
intent: free-cc0-3d-models-textures
queries:
  - "Where can i find good seamless textures for free that can be used commercially?"
  - "Creating 3d models and converting them into a form usable by WebGL - a beginners guide?"
  - "How can I get clothing texture?"
  - "Where can I find free to use and distribute human organ models?"
  - "Three.js Asset marketplace in development!."
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Free CC0 3D models and textures for three.js: find one, read its licence, place it at real size

## What "free to use" means for a model or a texture

three.js loads glTF (`.gltf` or `.glb`) with `GLTFLoader`, and a texture is an image file that `TextureLoader` reads, so the format question has a short answer: look for GLB models and for PNG, JPEG or WebP texture maps. The licence question takes more care. The two licences most free assets use:

- **CC0** (public domain dedication): use it, change it, sell a product with it, with no credit required. The PBR textures and HDRI skies of Poly Haven and ambientCG are CC0.
- **CC BY 4.0**: the same freedoms, on one condition: credit the author, link the source and the licence, and say if you changed the work. Credit is due wherever the work is used, so on a site it goes on a page visitors can reach, such as a credits page or a footer link.

Other licences on model sites (CC BY-NC, which forbids commercial use; CC BY-SA, which puts your changes under the same licence; a site's own "free" licence) each need reading before use. A free model is also not automatically fit for the web: scans and sculpts can be hundreds of thousands of triangles, textures can be far larger than the 2048 px a web page needs, and few models arrive at their real size in metres.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Its `asset_search` tool searches a hosted library of models, PBR textures and HDRIs for one that fits, by words or by a crop of a picture, and `pick` puts the chosen file in the project with the code that loads it: a model at real size, or at the height asked, with a credit line written to `CREDITS.md`. `model_audit` reads the picked files, and `look` shows them on the page with their size.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## What the library is

The library behind `asset_search` is hosted by paprika3d at `assets.keeno.dev`. As of 2026-10-28 it holds 57,732 models under CC BY 4.0 or CC0: 57,183 from Objaverse, a dataset of models published on Sketchfab with the licence each author chose there, and 549 AI-generated ones from Scenario's 3D Collection (CC BY 4.0, credited to Scenario). It also holds 3,545 CC0 PBR textures from Poly Haven, ambientCG, TextureCan and 3DTextures.me, and 1,430 CC0 HDRIs. Each model was rewritten for the web before it went in: meshopt-compressed geometry, WebP textures no larger than 2048 px, and its origin at the centre of its base. Branded and character assets are filtered out before publishing, and sources whose terms do not allow re-hosting are left out.

The library learns from use: it logs model searches, picks and rejections with the agent's name (texture and HDRI searches are not logged), and it sees the caller as a keyed hash of the IP address, not the address.

## The tool calls, in order

The task: a reading corner for a furniture page, with a rocking chair like the one in a photo, a wooden floor and a planter. The calls were made on 2026-10-28 on a Linux server with no GPU, so Chrome drew in software (SwiftShader). Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. Each search reply also carries a contact sheet, one picture with the hits' thumbnails numbered as the lines are; it is left out here.

**1. Search by words.**

```text
asset_search {"cwd": "<project>", "query": "rocking chair"}

1. d66764db18324c718cfe4a3bca40433d · Lounge Chair · scanned · 187494 tris · 1.492 MB · about 1 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/d66764db18324c718cfe4a3bca40433d-r2.webp
2. a55f03e5ab214921a99af0f2120ea519 · Rocking chair · realistic · 2586 tris · 0.287 MB · about 1 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/a55f03e5ab214921a99af0f2120ea519-r2.webp
3. aebc93f3a0c443bd94a08f934323982d · Rocking Chair · stylized · 12789 tris · 0.235 MB · about 1 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/aebc93f3a0c443bd94a08f934323982d.webp
Pick one with { pick: "<id>" } (real size, or height: units tall), search again with not: [ids] to reject these, or add more: true for the next ones.
```

Each line has what decides the choice before any download: the style, the triangle count, the file size, the real height and the licence. The first hit is a 187,494-triangle scan of a different chair. `more` asks for the next hits of the same query, past the ones shown, without rejecting any:

```text
asset_search {"cwd": "<project>", "query": "rocking chair", "more": true, "sheet": false}

1. 10de91400b454d0fb04e23f699c95cf3 · Rocking Chair · stylized · 420 tris · 0.008 MB · about 1 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/10de91400b454d0fb04e23f699c95cf3-r2.webp
2. bcd3f4e05ec44902af3b5668b2b831ca · Rocking Chair · low-poly · 1610 tris · 0.174 MB · about 1 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/bcd3f4e05ec44902af3b5668b2b831ca.webp
3. 0102b2c1449f448687d62ea66ae2a26a · Chair · realistic · 2256 tris · 0.096 MB · about 0.9 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/0102b2c1449f448687d62ea66ae2a26a-r2.webp
```

`not` with a list of ids is the other way on: it rejects those hits, which the library learns from, and searches again without them.

**2. Search by a crop of a photo.** The project has `refs/attic.jpg`, a CC0 photograph from Wikimedia Commons ("Black Rocking Chair (Unsplash)", by Anthony Delanoix) of a spindle-back rocking chair in an attic, 1280 px wide. `image` with `crop` cuts the chair out of it, in the picture's pixels, and ranks models by how alike they look, with the words as well:

```text
asset_search {"cwd": "<project>", "query": "rocking chair", "image": "refs/attic.jpg", "crop": [390, 355, 680, 670]}

1. aebc93f3a0c443bd94a08f934323982d · Rocking Chair · stylized · 12789 tris · 0.235 MB · about 1 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/aebc93f3a0c443bd94a08f934323982d.webp
2. 5c5d1c3bb4494ed9bcad956b6b4709d5 · Rocking Chair - Low Poly · low-poly · 5758 tris · 0.273 MB · about 1 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/5c5d1c3bb4494ed9bcad956b6b4709d5.webp
3. 922babc233ae4da9bf2835427644002f · Rocking Chair · realistic · 3942 tris · 0.283 MB · about 1 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/922babc233ae4da9bf2835427644002f-r2.webp
4. d5e784aa92464572af37264c3b3d2fa6 · Western Rocking Chair · realistic · 2497 tris · 0.224 MB · about 1.05 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/d5e784aa92464572af37264c3b3d2fa6-r2.webp
5. 400b2f945fb24beaa5e3ce576670144e · Weathered Rocking Chair · scanned · 171796 tris · 1.22 MB · about 1.2 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/400b2f945fb24beaa5e3ce576670144e-r2.webp
```

Every hit is now a rocking chair, and the one ranked third by words alone is first: its thumbnail shows the same tall spindle back and curved top rail as the photo.

**3. Pick it.** An id's first characters are enough when no other hit shown in the project starts with them:

```text
asset_search {"cwd": "<project>", "pick": "aebc93f3"}

Picked aebc93f3a0c443bd94a08f934323982d, the one shown id that starts with "aebc93f3".
Saved assets/rocking-chair-aebc93.glb (Rocking Chair, CC-BY-4.0); credited in assets/CREDITS.md
If the import map has no `three/addons/`, map it to three's `examples/jsm/` folder.
```

The reply goes on with the code that loads it:

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const rockingChair = new THREE.Group();
{ // a block, so a second pick's snippet pastes beside this one
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync("assets/rocking-chair-aebc93.glb");
  const box = new THREE.Box3().setFromObject(gltf.scene);
  gltf.scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); // origin to floor centre
  rockingChair.add(gltf.scene);
}
rockingChair.scale.setScalar(0.733229); // real size, about 1 m tall
scene.add(rockingChair);
```

The code sets up the meshopt decoder the library's files need (the [Draco, meshopt and KTX2 guide](/guides/threejs-draco-meshopt-ktx2) explains why), puts the model's origin at the centre of its base, and scales it to real size.

**4. A tiling floor texture.** `kind: "texture"` searches the PBR textures; each line names its maps and, when the source says, how many metres one tile covers:

```text
asset_search {"cwd": "<project>", "query": "oak wood floor planks", "kind": "texture", "sheet": false}

1. polyhaven-oak_wood_planks · Oak Wood Planks · maps: basecolor, normal, roughness, ao, displacement · tiles every 1.2 × 1.2 m · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/tex/polyhaven-oak_wood_planks/preview.webp
2. ambientcg-Planks033B · Planks 033 B · maps: ao, basecolor, displacement, metalness, normal, roughness · CC0-1.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/tex/ambientcg-Planks033B/preview.webp

asset_search {"cwd": "<project>", "kind": "texture", "pick": "polyhaven-oak_wood_planks"}

Saved assets/textures/polyhaven-oak_wood_planks/: basecolor, normal, roughness, ao (Oak Wood Planks, CC0-1.0)
```

The reply goes on with the code that loads it:

```js
const oakWoodPlanks = (() => {
  const loadMap = (file, srgb) => {
    const t = new THREE.TextureLoader().load("assets/textures/polyhaven-oak_wood_planks/" + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10 / 1.2, 10 / 1.2); // a 10 × 10 m surface with 0-1 UVs; with UVs in metres, 1 / 1.2
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; // colour map only
    return t;
  };
  return new THREE.MeshStandardMaterial({
    map: loadMap("basecolor.webp", true),
    normalMap: loadMap("normal.webp"),
    roughnessMap: loadMap("roughness.webp"),
    aoMap: loadMap("ao.webp"),
  });
})();
```

The pick saves the 1K version of each map the material uses and leaves out the displacement map, which moves vertices and needs a dense mesh. The colour map alone is tagged sRGB. A texture pick writes no credit line: the textures are CC0.

**5. A model at the height asked.** `height` scales a model to that many units tall instead of its real size, here a planter 0.45 m tall where the library's pot is about 0.25 m:

```text
asset_search {"cwd": "<project>", "query": "terracotta flower pot", "sheet": false}

1. 90762992c41d49569c098517a49dcb8a · Pot On Platform · realistic · 22344 tris · 0.355 MB · about 0.4 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/90762992c41d49569c098517a49dcb8a-r2.webp
2. b99c584dd11d4691b5d13303383371e5 · FlowerPot · realistic · 4604 tris · 0.126 MB · about 0.2 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/b99c584dd11d4691b5d13303383371e5.webp
3. 305f2b09e0de48bb919116026aba8f44 · flowerpot · realistic · 5324 tris · 0.054 MB · about 0.25 m tall · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/305f2b09e0de48bb919116026aba8f44-r2.webp

asset_search {"cwd": "<project>", "pick": "305f2b09", "height": 0.45}

Picked 305f2b09e0de48bb919116026aba8f44, the one shown id that starts with "305f2b09".
Saved assets/flowerpot-305f2b.glb (flowerpot, CC-BY-4.0); credited in assets/CREDITS.md
flowerpot.scale.setScalar(0.45 / 1.233); // 0.45 units tall
```

**6. Read the credits and the files.**

```bash
$ cat assets/CREDITS.md
- Rocking Chair: "Rocking Chair" by Lightningx (https://sketchfab.com/3d-models/aebc93f3a0c443bd94a08f934323982d) is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Optimized for the web by paprika3D.
- flowerpot: "flowerpot" by laura-han (https://sketchfab.com/3d-models/305f2b09e0de48bb919116026aba8f44) is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Optimized for the web by paprika3D.
```

Each line names the work, its author, the source page, the licence with its link, and the change made, which is what CC BY 4.0 asks for. A model is credited once, however often it is picked. `model_audit` reads the two files as the page will get them:

```text
model_audit {"cwd": "<project>", "path": "assets"}

assets/rocking-chair-aebc93.glb · 230 KB · 12,789 triangles · 1 material · textures: 1024×1024 webp, 1024×1024 webp · Draco no, meshopt yes, KTX2 no
site: passes

assets/flowerpot-305f2b.glb · 53 KB · 5,324 triangles · 1 material · textures: 512×256 webp · Draco no, meshopt yes, KTX2 no
site: passes
```

**7. See them on the page.** The three snippets went into `index.html` as they came, with the two models' shared imports written once, a 10 m plane for the floor, and the planter moved beside the chair. `open`, `look` and an `eval` that measures each picked model:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:41157/index.html in 0.3 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["floor","rockingChair","flowerpot"]}
Loaded: rocking-chair-aebc93.glb 0.2 MB, flowerpot-305f2b.glb 0.1 MB

look {}

On screen (3):
floor 62% [0, 218, 1279, 799] 10 × 10 units
pCylinder1_lambert6_0 3.3% [821, 378, 1023, 588]
PilierHautAvantDroit2_RockingChair_Tex_0 3.1% [433, 195, 694, 564]
Never visible: none

eval {"code": "const size = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));\nreturn { rockingChair: size(find('rockingChair')), flowerpot: size(find('flowerpot')) }"}

{"rockingChair":[0.45,1,0.82],"flowerpot":[0.52,0.45,0.53]}
```

The chair stands 1 unit (a metre) tall and the planter 0.45, as asked. `look` lists the meshes by the names their authors gave them inside the files, which is worth knowing before writing code that finds a part by name. The same `look` also reported a metal part with no environment map (the [too-dark model guide](/guides/threejs-gltf-model-too-dark) covers that line) and the far edge of the floor in view; neither is about the assets.

## Placing a model from anywhere else

A model downloaded from another site needs the same two steps the pick's code takes: origin to the centre of its base, then a scale from its own units to metres. A texture needs its repeat set from the metres one tile covers. This page does both, with stand-ins for the downloaded files, so it runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Placing a downloaded model</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

// A model from any source: put its origin at the centre of its base, then scale it to a height in metres.
// (What the code from an asset_search pick does; a GLB from elsewhere needs the same two steps.)
function placeAtHeight(model, metres) {
  const holder = new THREE.Group();
  const box = new THREE.Box3().setFromObject(model);
  model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  holder.add(model);
  holder.scale.setScalar(metres / (box.max.y - box.min.y));
  return holder;
}

// A seamless texture that covers `tileMetres` per repeat, on a plane `sizeMetres` wide with 0 to 1 UVs.
function tileEvery(texture, tileMetres, sizeMetres) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(sizeMetres / tileMetres, sizeMetres / tileMetres);
  return texture;
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9d4cc);
scene.fog = new THREE.Fog(0xd9d4cc, 4, 9);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(1.6, 1.3, 2.4);
camera.lookAt(0.2, 0.45, 0);
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6b5a48, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 4, 3);
scene.add(sun);

// Stand-in for a downloaded plank texture: one 1.2 m tile drawn on a canvas.
const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
const g = canvas.getContext('2d');
for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#b07a48' : '#c08a55'; g.fillRect(0, i * 32, 256, 32); }
const planks = new THREE.CanvasTexture(canvas);
planks.colorSpace = THREE.SRGBColorSpace;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: tileEvery(planks, 1.2, 10) }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Stand-in for a downloaded model in its own units (here 2.3 units tall, offset from its origin).
const stool = new THREE.Group();
const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7 });
const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 32), wood);
seat.position.set(5, 2.2, 3);
stool.add(seat);
for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.1, 12), wood);
  leg.position.set(5 + x, 1.05, 3 + z);
  stool.add(leg);
}
const placed = placeAtHeight(stool, 0.65);  // a stool 65 cm tall
placed.name = 'stool';
scene.add(placed);
console.log('stool size in metres:', new THREE.Box3().setFromObject(placed).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)));

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

Measured with `eval` on the opened page, its size is `[0.51,0.65,0.51]`: the stand-in, 2.3 units tall in its own units and offset from its origin, now stands 0.65 m tall on the floor, centred at the origin.

## What paprika3d does not do

- **It is not a marketplace.** Nothing is sold, and the library holds no paid or "free for personal use" assets. It also does not search other sites: a model that is not in the library is not found.
- **It does not check a licence for you beyond copying it.** The licence on each line is the one the source gave; a CC BY model that copies a brand or another artist's work is still a problem for the page that uses it. Open the source page in the credit line before relying on a model.
- **It does not put the credits on the page.** `CREDITS.md` holds the text; showing it to visitors (a credits page, a footer link) is the site's job.
- **It does not work offline.** `asset_search` reaches the hosted library at `assets.keeno.dev` over the network, which logs model searches, picks and rejections with the agent's name.
- **It does not make a model lighter.** A pick arrives as the library stored it; `model_audit` with `shrink` caps texture sizes, and a lower-poly hit is the answer to a high triangle count.

## Pitfalls

- **Paste shared imports once.** Two model picks each start with the same two `import` lines; a module that imports `GLTFLoader` twice does not run.
- **Check the repeat against your surface.** The texture code assumes a 10 m surface with 0 to 1 UVs. A 4 m floor needs `4 / 1.2`, and a mesh with UVs in metres needs `1 / 1.2`, as its comment says.
- **Real size is the catalogue's estimate.** "About 1 m tall" comes from the library's data; `look` and the `eval` above show the size the page really draws.
- **A model name says little about the parts inside.** Name the group you add (`rockingChair` here) and find the model by that name.
- **Keep the credits with the assets.** Copying a model to another project without its line in `CREDITS.md` drops the credit CC BY 4.0 requires.

## Without paprika3d

Free CC0 textures and HDRIs: Poly Haven and ambientCG publish PBR texture sets with every map, at several resolutions, and Poly Haven also has CC0 models and HDRIs. Free models: Kenney and Quaternius publish low-poly game asset packs as glTF (read each pack's current licence page); Sketchfab's search has a "Downloadable" filter and a licence filter, and offers many models as glTF; the Smithsonian's 3D collection (3d.si.edu) publishes scans of museum objects, many of them CC0. Whichever the source, check the licence on the model's own page, keep the author, link and licence in a credits file, and put the model at real size with a `Box3` as in the page above. To make a heavy download lighter, the [GLB file size guide](/guides/reduce-glb-file-size-threejs) shows the steps.
