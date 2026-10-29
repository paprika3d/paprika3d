---
title: Use the same glTF model twice in three.js, with clone() or SkeletonUtils.clone, and find the copy that is missing
phrase: use the same gltf model twice
description: A glTF model loaded once and added to a three.js scene twice draws once, and a skinned model copied with clone() draws where the first copy stands. Why both happen, the fix for each (Object3D.clone, SkeletonUtils.clone, drei's Clone), and how a coding agent with the paprika3d plugin sees the missing copy in look's on-screen list and finds whose bones each skin follows with one eval.
meta: Use the same glTF model twice in three.js: why a second add moves the model, why clone() breaks a skinned mesh, and SkeletonUtils.clone.
intent: use-same-gltf-twice-clone-model
queries:
  - "Use the same GLTF model twice in react-three-fiber/drei/Three.js"
  - "Cloning a skinned mesh"
  - "SkinnedMesh cloning issues"
  - "Are there disadvantages to always using SkeletonUtils.clone()?"
  - "Clone skinned mesh with SkeletonUtils undefined error"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Use the same glTF model twice in three.js, with clone() or SkeletonUtils.clone, and find the copy that is missing

## One object, one parent

A loader gives back one object tree: `gltf.scene`. An `Object3D` has one parent, so `scene.add(model)` for an object that is already in the scene takes it out of its old place and puts it in the new one. Adding `gltf.scene` twice, or rendering the same `scene` from `useGLTF` in two `<primitive object={scene} />` elements in React Three Fiber, gives one model at the last place it was added. `useGLTF` and `useLoader` cache by URL, so a second component that loads the same file gets the same object back, not a new one.

A copy needs `clone()`. For a model without bones, `model.clone()` is enough: it copies the tree and shares the geometry and materials by reference, which is cheap. A model with a `SkinnedMesh` needs more. The mesh does not draw from its own transform: each vertex follows the bones in `mesh.skeleton.bones`, and `clone()` copies the bones as new objects but leaves the copied mesh's skeleton pointing at the old ones. The copy then draws wherever the first model's bones are, in the first model's pose, and its own bones, which its mixer animates, move nothing. `SkeletonUtils.clone()` from the addons copies the tree and then points each copied skin at the copied bones.

paprika3d is a Claude Code plugin and MCP server that opens the page in its own headless Chrome. Its `look` tool returns a screenshot and the list of named objects on screen, with the named objects no look has seen, so a copy that is not where it should be shows as a name missing from the list.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page that places one model four times

The page makes a small rigged robot with two clips, writes it to GLB bytes with `GLTFExporter` so it needs no file, and loads it once with `GLTFLoader`. It then places it four times, from left to right, naming each copy's skinned mesh and giving it a colour and a mixer of its own:

- `one`: `gltf.scene` itself.
- `two`: `gltf.scene` again.
- `three`: `gltf.scene.clone()`.
- `four`: `SkeletonUtils.clone(gltf.scene)`.

With `?fixed` in the URL, `two` and `three` are made with `SkeletonUtils.clone` as well. `observe()` lists the four names the page expects and marks the ones the scene no longer has.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Copies</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// A small rigged robot in a T-pose with two clips, written to GLB bytes in memory, so the page needs no file.
async function robotGlb() {
  const bone = (name, x, y, parent) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, 0); parent?.add(b); return b; };
  const hips = bone('Hips', 0, 1);
  const spine = bone('Spine', 0, 0.15, hips), head = bone('Head', 0, 0.65, spine);
  const armL = bone('LeftArm', 0.32, 0.5, spine), armR = bone('RightArm', -0.32, 0.5, spine);
  const legL = bone('LeftLeg', 0.15, -0.05, hips), legR = bone('RightLeg', -0.15, -0.05, hips);
  const bones = [hips, spine, head, armL, armR, legL, legR];
  hips.updateMatrixWorld(true);
  const part = (b, w, h, d, x, y) => {   // a box stuck to one bone, placed in the bone's frame at rest
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, 0).applyMatrix4(b.matrixWorld);
    const n = g.attributes.position.count, i = bones.indexOf(b);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, k) => k % 4 ? 0 : i), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, k) => k % 4 ? 0 : 1), 4));
    return g;
  };
  const geometry = mergeGeometries([part(hips, 0.5, 0.25, 0.3, 0, 0), part(spine, 0.6, 0.6, 0.35, 0, 0.3), part(head, 0.35, 0.35, 0.35, 0, 0.2),
    part(armL, 0.6, 0.14, 0.14, 0.3, 0), part(armR, 0.6, 0.14, 0.14, -0.3, 0), part(legL, 0.18, 0.9, 0.18, 0, -0.45), part(legR, 0.18, 0.9, 0.18, 0, -0.45)]);
  const body = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0x8899aa }));
  body.name = 'body';
  body.add(hips);
  body.bind(new THREE.Skeleton(bones));
  const robot = new THREE.Group();
  robot.name = 'robot';
  robot.add(body);
  const q = (deg, axis = 'z') => new THREE.Quaternion().setFromEuler(new THREE.Euler(...['x', 'y', 'z'].map(a => a === axis ? THREE.MathUtils.degToRad(deg) : 0))).toArray();
  const track = (name, times, degs, axis) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, degs.flatMap(d => q(d, axis)));
  const wave = new THREE.AnimationClip('wave', 2, [
    track('LeftArm', [0, 2], [-75, -75]),
    track('RightArm', [0, 0.5, 1, 1.5, 2], [-60, -100, -60, -100, -60]),
  ]);
  const bow = new THREE.AnimationClip('bow', 1, [
    track('Spine', [0, 1], [0, 45], 'x'),
    track('LeftArm', [0, 1], [-75, -75]),
    track('RightArm', [0, 1], [75, 75]),
  ]);
  return new GLTFExporter().parseAsync(robot, { binary: true, animations: [wave, bow] });
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.5));
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 10);
camera.lookAt(0, 1.1, 0);

// Loaded once. A real page: const gltf = await new GLTFLoader().loadAsync('robot.glb');
const gltf = await new GLTFLoader().parseAsync(await robotGlb(), '');
const clip = (name) => THREE.AnimationClip.findByName(gltf.animations, name);
const mixers = [];
function place(model, name, x, colour, clipName) {
  model.position.x = x;
  const body = model.getObjectByProperty('isSkinnedMesh', true);
  body.name = name;                          // look lists what it draws by this name
  body.material = body.material.clone();     // a material of its own, so the colour is its own
  body.material.color.set(colour);
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip(clipName)).play();
  mixers.push(mixer);
}
// ?fixed gives every copy after the first bones of its own
const fixed = new URLSearchParams(location.search).has('fixed');
place(gltf.scene, 'one', -3, 0xc07050, 'wave');
place(fixed ? SkeletonUtils.clone(gltf.scene) : gltf.scene, 'two', -1, 0xc0a040, 'wave');           // the same object again: it moves, it is not copied
place(fixed ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(), 'three', 1, 0x9070c0, 'bow');   // a copy whose skin still follows the first robot's bones
place(SkeletonUtils.clone(gltf.scene), 'four', 3, 0x50a0c0, 'bow');                                // a copy with bones of its own
const expected = ['one', 'two', 'three', 'four'];

let last = null;
renderer.setAnimationLoop((now) => {
  const dt = last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1);
  last = now;
  for (const m of mixers) m.update(dt);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

window.__game = {
  subject: 'four',
  describe: () => ({ name: 'copies', units: 'metres', expected, keys: {} }),
  observe: () => ({ robots: expected.map((n) => scene.getObjectByName(n) ? n : `${n} (missing)`) }),
  act: () => {},
  setState: () => {},
};
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); nothing below depends on frame times. Run folder paths are shortened to `<project>`, and the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out.

**1. Open.**

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:40151/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"name":"copies","units":"metres","expected":["one","two","three","four"],"keys":{}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-19-08-508Z
```

**2. Look.** Four robots were placed; two are on screen:

```text
look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-19-08-508Z/look-1.png
Pixels: brightness 13%, colour saturation 29%, 0% near black, 0% blown out.
Hues: blue 97% of the frame; over the objects (2.9% of it): cyan 53%, violet 46%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Subject: four takes 1.5% of the picture [908, 281, 1031, 515]; 1 of its 1 named parts show.
Stands out: subject brightness 37% against 13% around it, colour 79% against 28%, edge contrast 0.172.
This camera shows little of the subject: try other views with `look` camera, then move the page's own camera to the best (said once).
On screen (2):
four 1.5% [908, 281, 1031, 515]
three 1.4% [455, 277, 589, 515]
Never visible: two (2.16 units, in view)
In view but no pixel: too small for the scene (check its size against the scene), hidden behind something, or not drawn.
```

`one` is not in the list at all, and `two` is named as in view but never drawn. `three` is drawn, but its box, starting at x = 455, is not where the page put it: the page placed `three` at x = 1, right of the middle, and `two` at x = -1. In the picture, the violet `three` stands at `two`'s place, waving `two`'s wave, and covers it.

**3. Ask the page what it has.**

```text
observe {}

{"robots":["one (missing)","two","three","four"],"harness":{"frame":1,"renderer":{"calls":3,"triangles":252,"textures":3,"geometries":1,"programs":2},"scene":{"objects":31,"meshes":3,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

`one` is missing from the scene: the second `place` call moved `gltf.scene` to `two`'s place and renamed its mesh. The renderer counts three meshes and one geometry, so the copies share their geometry as they should.

**4. Find whose bones each skin follows.**

```text
eval {"code":"const skins = [];\nscene.traverse((o) => { if (o.isSkinnedMesh) skins.push(o); });\nconst root = (o) => { while (o.parent !== scene) o = o.parent; return o; };\nconst x = (o) => +o.getWorldPosition(new THREE.Vector3()).x.toFixed(2);\nreturn { skinnedMeshes: skins.length, skins: skins.map((s) => ({ name: s.name, placedAt: x(root(s)), hipsAt: x(s.skeleton.bones[0]),\n  bonesInsideItsModel: root(s.skeleton.bones[0]) === root(s),\n  sharesBonesWith: skins.filter((t) => t !== s && t.skeleton.bones[0] === s.skeleton.bones[0]).map((t) => t.name) })) };"}

{"skinnedMeshes":3,"skins":[{"name":"two","placedAt":-1,"hipsAt":-1,"bonesInsideItsModel":true,"sharesBonesWith":["three"]},{"name":"three","placedAt":1,"hipsAt":-1,"bonesInsideItsModel":false,"sharesBonesWith":["two"]},{"name":"four","placedAt":3,"hipsAt":3,"bonesInsideItsModel":true,"sharesBonesWith":[]}]}
```

`three` was placed at x = 1, but its hips are at x = -1, and its bones are not inside its own model: its skeleton is `two`'s, and `sharesBonesWith` says so in both directions. That is the plain `clone()` of a skinned mesh. `four`'s skin follows bones inside its own model, at its own place.

**5. The fix, opened with `?fixed`.**

```text
open {"url":"index.html?fixed","cwd":"<project>"}

Opened http://127.0.0.1:40151/index.html?fixed in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"name":"copies","units":"metres","expected":["one","two","three","four"],"keys":{}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-19-09-791Z

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-19-09-791Z/look-1.png
Pixels: brightness 14%, colour saturation 30%, 0% near black, 0% blown out.
Hues: blue 94% of the frame; over the objects (5.8% of it): cyan 26%, orange 26%, yellow 24%, violet 23%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Subject: four takes 1.5% of the picture [908, 281, 1031, 515]; 1 of its 1 named parts show.
Stands out: subject brightness 37% against 13% around it, colour 79% against 28%, edge contrast 0.172.
This camera shows little of the subject: try other views with `look` camera, then move the page's own camera to the best (said once).
On screen (4):
one 1.6% [233, 277, 371, 515]
four 1.5% [908, 281, 1031, 515]
two 1.4% [455, 277, 589, 515]
three 1.4% [690, 281, 809, 515]
Never visible: none

observe {}

{"robots":["one","two","three","four"],"harness":{"frame":1,"renderer":{"calls":4,"triangles":336,"textures":5,"geometries":1,"programs":2},"scene":{"objects":41,"meshes":4,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

Four robots on screen, nothing missing, four meshes sharing one geometry.

## The fix in code

```js
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const gltf = await new GLTFLoader().loadAsync('robot.glb');
for (let i = 0; i < 4; i++) {
  const copy = SkeletonUtils.clone(gltf.scene);   // works for models with or without bones
  copy.position.x = i * 2;
  scene.add(copy);
  const mixer = new THREE.AnimationMixer(copy);   // one mixer per copy; the clips are shared
  mixer.clipAction(gltf.animations[0]).play();
  mixers.push(mixer);
}
```

In React Three Fiber, copy the cached scene once per component, `const copy = useMemo(() => SkeletonUtils.clone(scene), [scene])`, and render `<primitive object={copy} />`; or use drei's `<Clone object={scene} />`, which in drei 10.7 calls `SkeletonUtils.clone` when the object holds a skinned mesh. Each copy's animation needs its own mixer on that copy: `useAnimations(animations, ref)` with a ref on the copy's group.

## What paprika3d does not do

- It does not know how many copies a page meant to have. `look` lists what it drew and the named objects it never saw; the page's own list, as in this `observe()`, is what makes a missing one stand out.
- It does not name objects. A copy whose mesh has no name, or the same name as another, is listed by that name or counted together (`body ×4`); naming each copy is what makes the list useful.

## Pitfalls

- **Import the module, not a named object.** three's addon file exports functions: `import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'`, or `import { clone } from` it. The `three-stdlib` package exports a `SkeletonUtils` object instead, so `import { SkeletonUtils }` is right there and wrong for three's file, where a browser refuses the module (it does not provide an export named `SkeletonUtils`) and some bundlers pass it through as `undefined`.
- **Clones share materials.** Changing one copy's colour changes all of them. Give a copy its own material first, as this page does with `body.material.clone()` (more in [changing a material's colour at run time](/guides/threejs-change-material-color-configurator)).
- **SkeletonUtils.clone has no hidden cost for a model without bones.** It does the same copy as `clone()` plus two walks over the tree, so using it for every model is a safe default.
- **One mixer per copy.** A mixer on the original does not move a copy, and two copies on one mixer fight over the same bones.
- **Many copies of a static model** draw one call each; for hundreds, an `InstancedMesh` draws them in one.

## Without paprika3d

Count the skinned meshes after placing the copies, `scene.getObjectsByProperty('isSkinnedMesh', true).length`, and check that each one's first bone is inside its own model: `copy.getObjectById(mesh.skeleton.bones[0].id)` returns `undefined` for a skin that follows another model's bones. A `SkeletonHelper` on each copy draws its bones, and helpers that stack on one model while another copy stands still show the shared skeleton. For the copy that moved instead of copying, `model.parent` after the second `add` is the new parent.
