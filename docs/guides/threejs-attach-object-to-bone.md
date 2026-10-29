---
title: three.js attach object to bone, so a sword stays in the hand at its own size through the animation
phrase: three.js attach object to bone
description: How to put a weapon, hat or tool on a three.js character's bone so it follows the animation, keeps its size under a rig scaled 0.01 and does not trail a frame behind, with Object3D.attach rather than add or a copied position; and how a coding agent with the paprika3d plugin checks it with look's on-screen list, an interact trace of the gap between hand and grip, and look at the hand's pixel.
meta: three.js attach object to bone: hand.attach(sword) keeps its size under a 0.01 rig, add() shrinks it, a copied position trails a frame. Checked with paprika3d.
intent: attach-object-to-bone
queries:
  - "Three.js attaching object to bone"
  - "THREE.JS how to move the bones of a SkinnedMesh?"
  - "How to put a weapon in a character's hand?"
  - "Setting rotations on equipable items: Cannot match rotation to parent bone"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js attach object to bone, so a sword stays in the hand at its own size through the animation

## A bone is an Object3D

In three.js a `Bone` is an `Object3D` like any other, so a sword, a hat or a torch goes on a character by becoming the bone's child: it then moves with the bone on every frame, with no code in the loop. Find the bone by name after loading, `model.getObjectByName('mixamorigRightHand')`, and give it the prop. Three things go wrong after that:

- **The prop shrinks or grows.** A child takes on every scale above it. Many Mixamo and FBX exports arrive with an `Armature` node scaled 0.01 and bones placed in centimetres, so a 1 m sword added to the hand becomes 1 cm long and disappears inside the fist.
- **The prop points the wrong way.** A child's rotation is in the bone's own axes, which the rig's author chose, so a rotation worked out in world terms does not apply as it is.
- **The prop trails the hand.** Code that copies the hand's world position onto a prop each frame, instead of parenting it, reads the hand before the mixer has moved it and puts the prop where the hand was a frame ago.

`hand.attach(sword)` answers the first two: it makes the sword the hand's child while keeping its world position, rotation and scale, working out the local transform under whatever scale and axes the bone has. Pose the prop in world space once, as it should sit in the rest pose, then attach it.

paprika3d is a Claude Code plugin and MCP server that opens the page in its own headless Chrome on a paused clock. Its `look` tool lists what is on screen by name with its size, `interact` traces values from `window.__game.observe()` frame by frame, and `look` with `at` lists every object drawn at a pixel, nearest first.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Three robots, three ways to hold a sword

The page builds a rig the way a Mixamo export arrives, with an `Armature` scaled 0.01 and the bones in centimetres, three times, each swinging its right arm with the same clip and holding a 1 m sword whose origin is at its grip:

- `add`: `hand.add(sword)`.
- `copy`: the sword stays in the scene, and each frame the loop copies the hand's world position and rotation onto it, before `mixer.update()`.
- `attach`: the sword is placed at the hand's world position, then `hand.attach(sword)`.

`observe()` returns, for each robot, the distance between the hand bone and the sword's grip in centimetres.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Swords</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A rig the way many Mixamo exports arrive: an Armature scaled 0.01, bones placed in centimetres.
function makeRobot(name, color) {
  const robot = new THREE.Group();
  robot.name = name;
  const armature = new THREE.Object3D();
  armature.name = 'Armature';
  armature.scale.setScalar(0.01);
  robot.add(armature);
  const bone = (n, x, y, parent) => { const b = new THREE.Bone(); b.name = n; b.position.set(x * 100, y * 100, 0); (parent ?? armature).add(b); return b; };
  const hips = bone('Hips', 0, 1);
  const spine = bone('Spine', 0, 0.15, hips), head = bone('Head', 0, 0.65, spine);
  const armL = bone('LeftArm', 0.32, 0.5, spine), armR = bone('RightArm', -0.32, 0.5, spine);
  const handR = bone('RightHand', -0.6, 0, armR);
  const legL = bone('LeftLeg', 0.15, -0.05, hips), legR = bone('RightLeg', -0.15, -0.05, hips);
  const bones = [hips, spine, head, armL, armR, handR, legL, legR];
  const body = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color }));
  body.name = `${name}Body`;
  armature.add(body);
  robot.updateMatrixWorld(true);
  const toBody = body.matrixWorld.clone().invert();
  const part = (b, w, h, d, x, y) => {   // a box in metres in the bone's frame, stored in the body's centimetres
    const g = new THREE.BoxGeometry(w * 100, h * 100, d * 100).translate(x * 100, y * 100, 0).applyMatrix4(b.matrixWorld).applyMatrix4(toBody);
    const n = g.attributes.position.count, i = bones.indexOf(b);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, k) => k % 4 ? 0 : i), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, k) => k % 4 ? 0 : 1), 4));
    return g;
  };
  body.geometry = mergeGeometries([part(hips, 0.5, 0.25, 0.3, 0, 0), part(spine, 0.6, 0.6, 0.35, 0, 0.3), part(head, 0.35, 0.35, 0.35, 0, 0.2),
    part(armL, 0.6, 0.14, 0.14, 0.3, 0), part(armR, 0.6, 0.14, 0.14, -0.3, 0), part(handR, 0.12, 0.12, 0.12, -0.06, 0),
    part(legL, 0.18, 0.9, 0.18, 0, -0.45), part(legR, 0.18, 0.9, 0.18, 0, -0.45)]);
  body.bind(new THREE.Skeleton(bones));
  return { robot, hand: handR };
}
function makeSword(name) {   // 1 m long, its origin at the grip, the blade along +y
  const sword = new THREE.Group();
  sword.name = name;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.02).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xe0e4ea, metalness: 0.2 }));
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
  blade.name = `${name}Blade`;
  grip.name = `${name}Grip`;
  sword.add(blade, grip);
  return sword;
}
const q = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(deg)).toArray();
const swing = new THREE.AnimationClip('swing', 1, [
  new THREE.QuaternionKeyframeTrack('LeftArm.quaternion', [0, 1], [...q(-75), ...q(-75)]),
  new THREE.QuaternionKeyframeTrack('RightArm.quaternion', [0, 0.5, 1], [...q(-40), ...q(40), ...q(-40)]),
]);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.5));
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 8);
camera.lookAt(0, 1.2, 0);

const rigs = {};
const colours = { add: 0xc07050, copy: 0xc0a040, attach: 0x50a0c0 };
for (const [i, way] of ['add', 'copy', 'attach'].entries()) {
  const { robot, hand } = makeRobot(`robot_${way}`, colours[way]);
  robot.position.x = (i - 1) * 2.4;
  scene.add(robot);
  robot.updateMatrixWorld(true);
  const sword = makeSword(`sword_${way}`);
  if (way === 'add') hand.add(sword);               // takes on the hand's 0.01 scale
  if (way === 'copy') scene.add(sword);              // follows by copying, each frame
  if (way === 'attach') {                            // put it in the hand in world space, then attach: keeps its world size
    hand.getWorldPosition(sword.position);
    scene.add(sword);
    hand.attach(sword);
  }
  const mixer = new THREE.AnimationMixer(robot);
  mixer.clipAction(swing).play();
  rigs[way] = { robot, hand, sword, mixer };
}
window.rigs = rigs;

let last = null;
renderer.setAnimationLoop((now) => {
  const dt = last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1);
  last = now;
  const c = rigs.copy;
  c.hand.getWorldPosition(c.sword.position);         // copied before the mixer moves the hand: a frame behind
  c.hand.getWorldQuaternion(c.sword.quaternion);
  for (const way in rigs) rigs[way].mixer.update(dt);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const v = new THREE.Vector3(), w = new THREE.Vector3();
const gapCm = (r) => +(r.hand.getWorldPosition(v).distanceTo(r.sword.getWorldPosition(w)) * 100).toFixed(1);
window.__game = {
  subject: 'robot_attach',
  describe: () => ({ name: 'swords', units: 'gap between hand and grip in cm', keys: {} }),
  observe: () => Object.fromEntries(Object.keys(rigs).map((way) => [way, gapCm(rigs[way])])),
  act: () => {},
  setState: () => {},
};
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); nothing below depends on frame times. Run folder paths are shortened to `<project>`, and the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out.

**1. Open and look.**

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:43857/index.html in 0.1 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"name":"swords","units":"gap between hand and grip in cm","keys":{}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-21-45-480Z

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-21-45-480Z/look-1.png
Pixels: brightness 15%, colour saturation 31%, 0% near black, 0% blown out.
Hues: blue 93% of the frame; over the objects (7.2% of it): orange 34%, cyan 34%, yellow 29%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Subject: robot_attach takes 2.6% of the picture [842, 186, 1046, 558]; 3 of its 3 named parts show.
Stands out: subject brightness 38% against 13% around it, colour 76% against 28%, edge contrast 0.184.
On screen (7):
robot_addBody 2.5% [178, 264, 386, 558]
robot_attachBody 2.5% [842, 264, 1046, 558]
robot_copyBody 2.1% [511, 264, 714, 558]
sword_attachBlade 0.11% [866, 186, 940, 279] 0.8 × 0.07 units, across the view
sword_copyBlade 0.1% [508, 213, 517, 323] 0.8 × 0.07 units
sword_copyGrip 0.019% [510, 324, 516, 351] 0.2 × 0.05 units
sword_attachGrip 0.0072% [849, 275, 871, 300] 0.2 × 0.05 units, across the view
Never visible: sword_addBlade (0.00679 units, in view, behind robot_addBody), sword_addGrip (0.00189 units, in view, behind robot_addBody)
In view but no pixel: too small for the scene (check its size against the scene), hidden behind something, or not drawn.
```

`add`'s sword is never visible: its blade is 0.00679 units long, smaller than a centimetre, and inside the hand. `attach`'s blade is 0.8 units, as made, and drawn above the raised hand. `copy`'s blade is the right size, but its box sits at the far left of its robot, at x 508 to 517: in the picture it stands upright, apart from the hand, where the hand was in the T-pose before the first frame's animation moved the arm.

**2. Trace the gap between hand and grip for one second of the swing.**

```text
interact {"steps":[{"wait":60}],"trace":["add","copy","attach"]}

{"changed":{"copy":2.8}}
add: 0 throughout the 60 frames
copy: 38.4 → 2.8 at frame 1; first changed at frame 1
attach: 0 throughout the 60 frames
```

`add` and `attach` hold 0 on every frame: a child moves with its bone. `copy` starts 38.4 cm off, the jump from the rest pose to the first animated frame, then stays 2.8 cm behind for the rest of the swing, one frame of the hand's travel. A faster swing, or a prop farther out along a longer arm, trails by more.

**3. Read the scales, and where each hand is on screen.**

```text
eval {"code":"const v = new THREE.Vector3(), s = new THREE.Vector3();\nreturn Object.fromEntries(Object.entries(rigs).map(([way, r]) => [way, {\n  parent: r.sword.parent.name || r.sword.parent.type,\n  handWorldScale: +r.hand.getWorldScale(s).x.toFixed(3),\n  swordLocalScale: +r.sword.scale.x.toFixed(3),\n  swordWorldScale: +r.sword.getWorldScale(s).x.toFixed(3),\n  handPixel: (() => { r.hand.getWorldPosition(v).project(camera); return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]; })(),\n}]));"}

{"add":{"parent":"RightHand","handWorldScale":0.01,"swordLocalScale":1,"swordWorldScale":0.01,"handPixel":[199,288]},"copy":{"parent":"Scene","handWorldScale":0.01,"swordLocalScale":1,"swordWorldScale":1,"handPixel":[530,288]},"attach":{"parent":"RightHand","handWorldScale":0.01,"swordLocalScale":100,"swordWorldScale":1,"handPixel":[861,288]}}
```

Both swords on the hand have the hand as their parent. The hand's world scale is 0.01 in all three rigs. `add`'s sword kept its local scale of 1, so its world scale is 0.01; `attach` set the local scale to 100, which leaves a world scale of 1. The `handPixel` values are the hand bones projected to the page's pixels, for the next call.

**4. What is drawn at each hand.**

```text
look {"at":[[199,288],[530,288],[861,288]]}

At (199, 288): robot_addBody 8.55 m at [-3.17, 2.01, 0.07]; background beyond.
At (530, 288): robot_copyBody 7.99 m at [-0.79, 2.01, 0.07]; behind it sword_copyGrip 8.03 m; background beyond.
At (861, 288): robot_attachBody 8.11 m at [1.6, 2.01, 0.06]; behind it sword_attachGrip 8.15 m; background beyond.
```

At `add`'s hand there is the robot's body and nothing else. At `copy`'s and `attach`'s, the sword's grip is drawn just behind the hand, 4 cm farther from the camera.

## Rotation and the grip

`attach` keeps the world rotation the prop had when it was attached, so set it in world space first: with the character in its rest pose, turn the sword the way it should point, then attach it. To adjust it later, rotate it in the hand's axes (`sword.rotateX(...)` after attaching), and check from more than one side; `look` with `target` on the sword's name pictures it alone from four sides.

The prop's origin is the point that sits on the bone. A model whose origin is at its centre puts the middle of the blade in the palm; move the geometry once (`geometry.translate(0, -gripY, 0)`) or put the mesh in a group and offset it there, so the origin is the grip.

## Moving a bone yourself

To turn a head toward a target or aim an arm, set the bone's rotation after `mixer.update()` and before `renderer.render()`, every frame: the mixer writes every bone its clip has a track for on each update, so a rotation set before it is overwritten. A bone the clip does not animate keeps whatever the code sets. `look` with `target` on the character pictures the result from four sides.

## What paprika3d does not do

- It does not know which bone a prop belongs on or how it should point; the trace, the scales and the pictures say where it is.
- It does not catch a trailing prop from a picture: at 2.8 cm a frame the lag is easy to miss in a still. The trace of the gap is the check, and it needs the page to put the gap, or both positions, in `observe()`.

## Pitfalls

- **`attach`, not `add`, under a scaled rig.** Or keep `add` and set `sword.scale.setScalar(1 / hand.getWorldScale(v).x)`.
- **Bone names differ between exports.** Log `model.getObjectsByProperty('isBone', true).map(b => b.name)` once, rather than guessing `RightHand` or `mixamorigRightHand`.
- **One prop, one parent.** To show the same sword in two hands, clone it; adding it to the second hand takes it from the first.

## Without paprika3d

A `SkeletonHelper` added to the scene draws the bones, and an `AxesHelper` added to the hand bone shows its local axes, which explains a prop that points the wrong way. Logging `hand.getWorldScale(new THREE.Vector3())` shows a scale above the bone at once. For a prop that trails, log the distance between `hand.getWorldPosition(a)` and `sword.getWorldPosition(b)` after rendering each frame: anything above zero for a parented prop means the copy runs before the mixer.
