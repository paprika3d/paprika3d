---
title: Retarget a Mixamo animation to another rig in three.js, when renamed tracks twist the arms and flip the legs
phrase: retarget a mixamo animation
description: Why a Mixamo clip put on a three.js model rigged elsewhere twists limbs and inverts feet even after its track names match (the bones' rest axes differ), how SkeletonUtils.retargetClip with a names map and per-bone rest offsets fixes it, and how a coding agent with the paprika3d plugin compares the rigs' bone names and rest turns with eval, measures the pose frame by frame with interact, and finds a character that already has its clips with asset_search.
meta: Retarget a Mixamo animation in three.js: renamed tracks twist limbs when rest axes differ; SkeletonUtils.retargetClip with rest offsets, checked with paprika3d.
intent: retarget-mixamo-animation
queries:
  - "Retargeting animation to Mixamo rig"
  - "Apply animation to GLB inside three.js"
  - "Can I apply a mixamo animation to another model that has already been rigged?"
  - "Fixing SkeletonUtils retarget() and retargetClip() functions"
  - "SkeletonUtils.retarget() doesn't work with mixamoRig skeleton (inverted feet, backward hands)"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Retarget a Mixamo animation to another rig in three.js, when renamed tracks twist the arms and flip the legs

## Two things a clip assumes about its rig

A clip from Mixamo, or from any other rig, is a list of tracks such as `mixamorigLeftArm.quaternion`: a bone's name and that bone's rotation over time, relative to its parent. Played on another model, it assumes two things about that model's bones.

1. **The names.** A track finds its bone by name. Mixamo names bones `mixamorig:LeftArm`, which three's loaders turn into `mixamorigLeftArm`; a model rigged in Blender or elsewhere calls it `LeftArm`, `upperarm_l` or `spine01_JNT_02`. A track whose name matches no bone does nothing and prints a warning, which has its own page: [No target node found for track](/errors/propertybinding-no-target-node-found).
2. **The rest axes.** A bone's rotation in a clip is measured from the bone's own axes. In a Mixamo rig every bone's rest rotation is close to zero. In a rig made in Blender, each bone's own +y axis runs along the bone, so an arm that points sideways rests turned 90 degrees and a leg that points down rests turned 180. The same quaternion then means another direction.

Renaming the tracks answers the first. When the rest axes differ too, the limbs still go the wrong way: arms up instead of down, hands backwards, feet pointing up. `SkeletonUtils.retargetClip()` from three's addons answers the second. It plays the clip on the source rig, reads each bone's rotation in the world, and writes a new clip that gives the target's bone the same world rotation, times an offset per bone that the caller supplies. The offset is the turn from the source bone's rest to the target bone's rest; without it, every target bone is set to the source bone's world rotation, which is wrong wherever the rests differ.

paprika3d is a Claude Code plugin and MCP server that opens the page in its own headless Chrome on a paused clock. Its `eval` tool reads both rigs' bone names and rest rotations in one call, `interact` with `trace` follows the angles the page measures frame by frame, and `asset_search` finds characters in the hosted asset library that come with their own clips.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## One clip, four robots

The page builds the same robot rigged two ways, `mixamo` (bones `mixamorigHips` and so on, every rest rotation 0) and `blender` (plain names, each bone's +y along the bone), and a clip made for the Mixamo rig: left arm down, right arm waving, left leg stepping. It plays the clip on four robots, left to right:

- `mixamo`: the clip's own rig, the reference.
- `renamed`: a `blender` rig, with `mixamorig` cut from the clip's track names.
- `retargetedBare`: a `blender` rig, with `retargetClip` given the bone names and no offsets.
- `retargeted`: a `blender` rig, with `retargetClip` given the names and each bone's rest offset.

`observe()` returns, for each robot, the left and right arms' angle above level in the world (down is negative) and each leg's turn from straight down (forward is positive), measured from the bones' world positions.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Retarget</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const D = THREE.MathUtils.degToRad;
// The same robot rigged two ways. 'mixamo': bones named mixamorig..., every bone's rest rotation 0.
// 'blender': plain names, and each bone's own +y axis runs along the bone, as Blender's bones do,
// so the arms rest turned -90 and 90 degrees and the legs 180.
function makeRig(name, style, color) {
  const blender = style === 'blender', prefix = blender ? '' : 'mixamorig';
  const spec = [   // name, parent, position in the parent's frame, rest rotation about z
    ['Hips', null, [0, 1, 0], 0], ['Spine', 'Hips', [0, 0.15, 0], 0], ['Head', 'Spine', [0, 0.65, 0], 0],
    ['LeftArm', 'Spine', [0.32, 0.5, 0], blender ? -90 : 0], ['LeftHand', 'LeftArm', blender ? [0, 0.6, 0] : [0.6, 0, 0], 0],
    ['RightArm', 'Spine', [-0.32, 0.5, 0], blender ? 90 : 0], ['RightHand', 'RightArm', blender ? [0, 0.6, 0] : [-0.6, 0, 0], 0],
    ['LeftLeg', 'Hips', [0.15, -0.05, 0], blender ? 180 : 0], ['LeftFoot', 'LeftLeg', blender ? [0, 0.9, 0] : [0, -0.9, 0], 0],
    ['RightLeg', 'Hips', [-0.15, -0.05, 0], blender ? 180 : 0], ['RightFoot', 'RightLeg', blender ? [0, 0.9, 0] : [0, -0.9, 0], 0],
  ];
  const bones = {};
  for (const [n, parent, pos, rz] of spec) {
    const b = new THREE.Bone();
    b.name = prefix + n;
    b.position.fromArray(pos);
    b.rotation.z = D(rz);
    if (parent) bones[parent].add(b);
    bones[n] = b;
  }
  const list = Object.values(bones);
  const part = (n, w, h, d, x, y) => {   // a box in the robot's own frame, stuck to one bone
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, 0);
    const c = g.attributes.position.count, i = list.indexOf(bones[n]);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(c * 4).fill(0).map((_, k) => k % 4 ? 0 : i), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(c * 4).fill(0).map((_, k) => k % 4 ? 0 : 1), 4));
    return g;
  };
  const geometry = mergeGeometries([part('Hips', 0.5, 0.25, 0.3, 0, 1), part('Spine', 0.6, 0.6, 0.35, 0, 1.45), part('Head', 0.35, 0.35, 0.35, 0, 2),
    part('LeftArm', 0.6, 0.14, 0.14, 0.62, 1.65), part('RightArm', 0.6, 0.14, 0.14, -0.62, 1.65),
    part('LeftLeg', 0.18, 0.9, 0.18, 0.15, 0.5), part('RightLeg', 0.18, 0.9, 0.18, -0.15, 0.5)]);
  const body = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color }));
  body.name = name;
  body.add(bones.Hips);
  body.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(list));
  return { body, bones };
}

// A clip made for the mixamo rig: left arm down, right arm waving, left leg stepping.
const q = (deg, axis) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'x' ? 1 : 0, 0, axis === 'z' ? 1 : 0), D(deg)).toArray();
const track = (n, axis, times, degs) => new THREE.QuaternionKeyframeTrack(`mixamorig${n}.quaternion`, times, degs.flatMap((d) => q(d, axis)));
const clip = new THREE.AnimationClip('wave', 1, [
  track('LeftArm', 'z', [0, 1], [-75, -75]),
  track('RightArm', 'z', [0, 0.5, 1], [-60, -100, -60]),
  track('LeftLeg', 'x', [0, 0.5, 1], [20, -20, 20]),
]);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.5));
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.4, 10);
camera.lookAt(0, 1.2, 0);

const rigs = {
  mixamo: makeRig('mixamo', 'mixamo', 0x9070c0),         // the clip's own rig
  renamed: makeRig('renamed', 'blender', 0xc07050),       // the clip with 'mixamorig' cut from its track names
  retargetedBare: makeRig('retargetedBare', 'blender', 0xc0a040),   // retargetClip with the bone names only
  retargeted: makeRig('retargeted', 'blender', 0x50a0c0), // retargetClip with names and each bone's rest offset
};
const names = Object.fromEntries(Object.keys(rigs.retargeted.bones).map((n) => [n, `mixamorig${n}`]));   // target bone -> source bone
const offsets = {};   // per target bone: the turn from the source bone's rest to its own
for (const b of rigs.retargeted.body.skeleton.bones) {
  const s = rigs.mixamo.body.skeleton.getBoneByName(names[b.name]);
  offsets[b.name] = new THREE.Matrix4().extractRotation(s.matrixWorld).invert().multiply(new THREE.Matrix4().extractRotation(b.matrixWorld));
}
const renamed = clip.clone();
for (const t of renamed.tracks) t.name = t.name.replace(/^mixamorig/, '');
const clips = {
  mixamo: clip,
  renamed,
  retargetedBare: SkeletonUtils.retargetClip(rigs.retargetedBare.body, rigs.mixamo.body, clip, { names, fps: 30 }),
  retargeted: SkeletonUtils.retargetClip(rigs.retargeted.body, rigs.mixamo.body, clip, { names, fps: 30, localOffsets: offsets }),
};
const mixers = [];
for (const [i, [key, rig]] of Object.entries(rigs).entries()) {
  rig.body.position.x = (i - 1.5) * 2.4;
  scene.add(rig.body);
  const mixer = new THREE.AnimationMixer(rig.body);   // the SkinnedMesh: retargeted tracks are named .bones[...]
  mixer.clipAction(clips[key]).play();
  mixer.update(0);
  mixers.push(mixer);
}
window.rigs = rigs;
window.clips = clips;

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

// Angles in the world: an arm's rise above level (down is negative); a leg's turn from straight down, forward positive.
const a = new THREE.Vector3();
const dir = (rig, from, to) => rig.bones[to].getWorldPosition(new THREE.Vector3()).sub(rig.bones[from].getWorldPosition(a)).normalize();
const pose = (rig) => {
  const arm = dir(rig, 'LeftArm', 'LeftHand'), wave = dir(rig, 'RightArm', 'RightHand');
  const leg = dir(rig, 'LeftLeg', 'LeftFoot'), still = dir(rig, 'RightLeg', 'RightFoot');
  const deg = THREE.MathUtils.radToDeg;
  return { leftArm: Math.round(deg(Math.asin(arm.y))), rightArm: Math.round(deg(Math.asin(wave.y))),
    leftLeg: Math.round(deg(Math.atan2(leg.z, -leg.y))), rightLeg: Math.round(deg(Math.atan2(still.z, -still.y))) };
};
window.__game = {
  subject: 'retargeted',
  describe: () => ({ name: 'retarget', units: 'degrees: arms above level, legs from straight down (forward positive)', keys: {} }),
  observe: () => Object.fromEntries(Object.entries(rigs).map(([k, r]) => [k, pose(r)])),
  act: () => {},
  setState: (s) => { if (s.t !== undefined) for (const m of mixers) m.setTime(s.t); },
};
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); nothing below depends on frame times. Run folder paths are shortened to `<project>`, and the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out.

**1. Open and look.**

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:46651/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"name":"retarget","units":"degrees: arms above level, legs from straight down (forward positive)","keys":{}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-29-08-808Z

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-29-08-808Z/look-1.png
Pixels: brightness 14%, colour saturation 30%, 0% near black, 0% blown out.
Hues: blue 95% of the frame; over the objects (5.3% of it): cyan 30%, violet 27%, orange 19%, yellow 18%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Subject: retargeted takes 1.6% of the picture [961, 288, 1097, 526]; 1 of its 1 named parts show.
Stands out: subject brightness 36% against 13% around it, colour 80% against 28%, edge contrast 0.154.
This camera shows little of the subject: try other views with `look` camera, then move the page's own camera to the best (said once).
On screen (4):
mixamo 1.6% [167, 288, 305, 526]
retargeted 1.6% [961, 288, 1097, 526]
renamed 1.1% [468, 291, 608, 526]
retargetedBare 0.96% [733, 291, 874, 436]
Never visible: none
```

Every robot draws, and `retargetedBare` is shorter than the rest: its box ends at y = 436 where the others end at 526. In the picture, `renamed` has its left arm raised to the side and its left leg folded up across its body, and `retargetedBare` has both legs up, while `retargeted` stands exactly as `mixamo` does.

**2. Read the angles.**

```text
observe {}

{"mixamo":{"leftArm":-75,"rightArm":61,"leftLeg":-19,"rightLeg":0},"renamed":{"leftArm":15,"rightArm":29,"leftLeg":161,"rightLeg":0},"retargetedBare":{"leftArm":15,"rightArm":29,"leftLeg":161,"rightLeg":180},"retargeted":{"leftArm":-75,"rightArm":61,"leftLeg":-19,"rightLeg":0},"harness":{"frame":1,"renderer":{"calls":4,"triangles":336,"textures":5,"geometries":4,"programs":2},"scene":{"objects":49,"meshes":4,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

The clip holds the left arm 75 degrees below level. `renamed` and `retargetedBare` hold it 15 degrees above, and their stepping leg points 161 degrees from straight down, which is nearly straight up. `retargetedBare` also has its right leg at 180, a leg the clip never animates: `retargetClip` writes a track for every bone in the names map, so a bone the clip leaves alone is still set to the source bone's world rotation. `retargeted` matches `mixamo` on every angle.

**3. Compare the two rigs.**

```text
eval {"code":"// each bone's rest turn about z, from the inverse bind matrix the skin keeps\nconst rest = (rig) => Object.fromEntries(rig.body.skeleton.bones.map((b, i) => [b.name, Math.round(THREE.MathUtils.radToDeg(new THREE.Euler().setFromRotationMatrix(rig.body.skeleton.boneInverses[i].clone().invert()).z))]).filter(([, z]) => z !== 0));\nreturn { clipTracks: clips.mixamo.tracks.map((t) => t.name), mixamoBones: rigs.mixamo.body.skeleton.bones.map((b) => b.name), blenderBones: rigs.renamed.body.skeleton.bones.map((b) => b.name), restTurnsMixamo: rest(rigs.mixamo), restTurnsBlender: rest(rigs.renamed), retargetedTracks: clips.retargeted.tracks.slice(0, 3).map((t) => t.name) };"}

{"clipTracks":["mixamorigLeftArm.quaternion","mixamorigRightArm.quaternion","mixamorigLeftLeg.quaternion"],"mixamoBones":["mixamorigHips","mixamorigSpine","mixamorigHead","mixamorigLeftArm","mixamorigLeftHand","mixamorigRightArm","mixamorigRightHand","mixamorigLeftLeg","mixamorigLeftFoot","mixamorigRightLeg","mixamorigRightFoot"],"blenderBones":["Hips","Spine","Head","LeftArm","LeftHand","RightArm","RightHand","LeftLeg","LeftFoot","RightLeg","RightFoot"],"restTurnsMixamo":{},"restTurnsBlender":{"LeftArm":-90,"LeftHand":-90,"RightArm":90,"RightHand":90,"LeftLeg":180,"LeftFoot":180,"RightLeg":180,"RightFoot":180},"retargetedTracks":[".bones[Hips].quaternion",".bones[Spine].quaternion",".bones[Head].quaternion"]}
```

The names differ by the prefix alone. The rest turns are the real difference: none in the Mixamo rig, and 90, -90 or 180 degrees for every arm, hand, leg and foot bone of the Blender-style rig. These are the turns the offsets carry. The retargeted clip's tracks are named `.bones[Hips].quaternion`, a path into the skinned mesh's skeleton, so its mixer has to be built on the `SkinnedMesh` itself, as this page does.

**4. Follow the step and the wave for a second.**

```text
interact {"steps":[{"wait":60}],"trace":["mixamo.leftLeg","retargeted.leftLeg","renamed.leftLeg","mixamo.rightArm","retargeted.rightArm"]}

{"after":{"mixamo":{"leftArm":-75,"rightArm":61,"leftLeg":-19,"rightLeg":0},"renamed":{"leftArm":15,"rightArm":29,"leftLeg":161,"rightLeg":0},"retargetedBare":{"leftArm":15,"rightArm":29,"leftLeg":161,"rightLeg":180},"retargeted":{"leftArm":-75,"rightArm":61,"leftLeg":-19,"rightLeg":0}},"changed":{}}
mixamo.leftLeg: -19 → peak 20 at frame 29 → low -20 at frame 59 → -19 at frame 60; first changed at frame 1
retargeted.leftLeg: -19 → peak 19 at frame 28 → low -20 at frame 59 → -19 at frame 60; first changed at frame 1
renamed.leftLeg: 161 → peak 180 at frame 14 → low -180 at frame 44 → 161 at frame 60; first changed at frame 1
mixamo.rightArm: 61 → peak 89 at frame 21 → low 60 at frame 59 → 61 at frame 60; first changed at frame 1
retargeted.rightArm: 61 → peak 89 at frame 21 → low 60 at frame 59 → 61 at frame 60; first changed at frame 1
```

`retargeted`'s leg swings between 19 and -20 degrees where `mixamo`'s swings between 20 and -20, a frame apart at the turn: `retargetClip` samples the clip at the `fps` it is given, 30 here, and a turn that falls between two samples is cut a little short. The wave's peak of 89 degrees lands on the same frame on both. `renamed`'s leg goes all the way round, through straight up.

**5. The broken rig from four sides.**

```text
look {"target":"renamed"}

Picture: <project>/paprika3d/runs/2026-10-28T10-29-08-808Z/look-2-views.png (front, right, top, three-quarter)
renamed: size 1.271 × 2.125 × 0.548, centre [-0.918, 1.112, 0.099]
```

The front and three-quarter views show the left leg raised across the body, with the right leg left to stand on, and the left arm held straight out to the side.

## A character that comes with its clips

For a game, retargeting can often be skipped with a character whose clips were made on its own rig. `asset_search` with `animated: true` looks for those in the hosted library:

```text
asset_search {"cwd":"<project>","query":"character with walk and run animations","animated":true,"type":"character-humanoid","sheet":false}

1. 21d7e6227c0846529bfd39e0df9baa07 · Walk Animation · stylized · 4076 tris · 0.041 MB · about 1.75 m tall · animated · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/21d7e6227c0846529bfd39e0df9baa07.webp
2. c0a60c865023425f80b55f4d23897c62 · Walk cycle · low-poly · 6935 tris · 0.157 MB · about 1.7 m tall · animated · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/c0a60c865023425f80b55f4d23897c62.webp
3. a2647e9b2ebf4e56accad43254cef39f · Walk Cycle FK · low-poly · 12005 tris · 0.242 MB · about 1.8 m tall · animated · CC-BY-4.0 · https://pub-da56e9d607b24519a815698ff4e9020f.r2.dev/thumb/a2647e9b2ebf4e56accad43254cef39f.webp
Pick one with { pick: "<id>" } (real size, or height: units tall), search again with not: [ids] to reject these, or add more: true for the next ones.
```

A pick downloads one into the project (made in a later session in the same project):

```text
asset_search {"cwd":"<project>","pick":"c0a60c86"}

Picked c0a60c865023425f80b55f4d23897c62, the one shown id that starts with "c0a60c86".
Saved assets/walk-cycle-c0a60c.glb (Walk cycle, CC-BY-4.0); credited in assets/CREDITS.md
If the import map has no `three/addons/`, map it to three's `examples/jsm/` folder.
```

It also returns the code that loads it, at its real size, with a mixer playing its first clip:

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const walkCycle = new THREE.Group();
{ // a block, so a second pick's snippet pastes beside this one
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync("assets/walk-cycle-c0a60c.glb");
  const box = new THREE.Box3().setFromObject(gltf.scene);
  gltf.scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); // origin to floor centre
  walkCycle.add(gltf.scene);
  walkCycle.animations = gltf.animations;
}
walkCycle.scale.setScalar(0.023124); // real size, about 1.7 m tall
scene.add(walkCycle);
const walkCycleMixer = new THREE.AnimationMixer(walkCycle);
walkCycleMixer.clipAction(walkCycle.animations[0]).play(); // walkCycleMixer.update(dt) each frame; walkCycle.animations holds every clip by name
```

And `eval` lists what came with it:

```text
eval {"code":"const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');\nconst { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');\nconst gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/walk-cycle-c0a60c.glb');\nconst bones = [];\ngltf.scene.traverse((o) => { if (o.isBone) bones.push(o.name); });\nreturn { clips: gltf.animations.map((c) => `${c.name}: ${c.duration.toFixed(2)} s, ${c.tracks.length} tracks`), bones: bones.length, firstBones: bones.slice(0, 5), firstTracks: gltf.animations[0].tracks.slice(0, 3).map((t) => t.name) };"}

{"clips":["Take 001: 1.38 s, 111 tracks"],"bones":49,"firstBones":["_rootJoint","base_JNT_01","spine01_JNT_02","spine02_JNT_03","spine03_JNT_04"],"firstTracks":["headTip_JNT_09.position","headBase_JNT_08.position","neck01_JNT_07.position"]}
```

One clip, `Take 001`, ships in the same file as its 49 bones and names them directly (`headTip_JNT_09.position`), so it needs no retargeting. The bone names (`spine01_JNT_02` and so on) also show what a Mixamo clip would need on this model: a full names map and its rest offsets, not a prefix cut. Hits differ from one search to the next, and the ids above are examples, not fixed.

## The fix in code

```js
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// target: the SkinnedMesh of your model; source: the SkinnedMesh the clip was made for, both in their rest pose
const names = { Hips: 'mixamorigHips', LeftArm: 'mixamorigLeftArm' /* every bone: target name -> source name */ };
const offsets = {};
for (const bone of target.skeleton.bones) {
  const from = source.skeleton.getBoneByName(names[bone.name]);
  if (!from) continue;
  offsets[bone.name] = new THREE.Matrix4().extractRotation(from.matrixWorld).invert()
    .multiply(new THREE.Matrix4().extractRotation(bone.matrixWorld));
}
const clip = SkeletonUtils.retargetClip(target, source, mixamoClip, { names, localOffsets: offsets, fps: 30, hip: 'mixamorigHips' });
const mixer = new THREE.AnimationMixer(target);   // the SkinnedMesh, not its group
mixer.clipAction(clip).play();
```

`hip` is the source's name for the root bone, whose position the new clip keeps (root motion); leave it out and the hips get rotations alone. Take the offsets with both rigs unturned at their roots, as this page's are. When the two rigs differ in scale, as a rig at 1/100 scale does, the `scale` option multiplies the hip's position so the hips move by the right amount.

## What paprika3d does not do

- It does not retarget a clip or build the names map: the rigs and the code are yours, and the replies show whether the result matches.
- It does not measure a pose by itself. The angles here come from the page's own `observe()`, which compares bones' world positions; a page that puts nothing about its bones there gets pictures from `look`, and numbers from `eval`.

## Pitfalls

- **The mixer root for a retargeted clip is the `SkinnedMesh`.** Its tracks are `.bones[Name]` paths; on a group, three.js r186 logs "THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton." for each track, and nothing moves.
- **Pass `fps`.** By default `retargetClip` samples as many times per second as the clip's longest track has keys, which for a clip of a few keys is a few samples.
- **Take the offsets at rest.** Both skeletons in their bind pose, before any mixer runs: `skeleton.pose()` puts a rig back.
- **Bones missing from the map keep their rest pose**, so a short map is a safe first test: map the hips, spine and one arm, compare, then add the rest.

## Without paprika3d

A `SkeletonHelper` on each model shows the two skeletons; an `AxesHelper` added to the same bone on both shows the rest axes that differ. Log `skeleton.bones.map(b => b.name)` on both and `clip.tracks.map(t => t.name)` for the clip before writing the names map. Another route is to rig the character in Mixamo itself: its auto-rigger gives an uploaded character Mixamo's own bones, after which Mixamo's clips play on it by name, with no retargeting in three.js.
