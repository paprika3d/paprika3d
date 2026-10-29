---
title: three.js morph targets lip sync, with visemes driven on every mesh of the face and checked frame by frame
phrase: three.js morph targets lip sync
description: Driving a face's blend shapes (visemes, blinks, expressions) in three.js for lip sync: morphTargetDictionary and morphTargetInfluences, a timed viseme list turned into an AnimationClip, a face split into several meshes that each need the weights, and how a coding agent with the paprika3d plugin lists every mesh's targets with eval, traces the frame each viseme peaks with interact and pictures the sequence with look.
meta: three.js morph targets lip sync: drive visemes by name on every mesh of the face, from timed keyframes, and check each one moves with paprika3d.
intent: morph-targets-lip-sync
queries:
  - "Add Lip sync to existing 3D model of head"
  - "Morph targets keyframes?"
  - "Facial Morphs on a SkinnedMesh Character"
  - "Blender to GLFT export - Animation and Morph Target"
  - "Limit 8 BlendShapes on the FBXLoader"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js morph targets lip sync, with visemes driven on every mesh of the face and checked frame by frame

## Where the shapes live

A blend shape (a shape key in Blender, a morph target in glTF and three.js) is a second set of vertex positions for the same mesh. In three.js they sit in `geometry.morphAttributes.position`, one attribute per target, and each mesh has two things that drive them:

- `mesh.morphTargetDictionary`, the target names mapped to their index: `{ viseme_aa: 0, viseme_O: 1, ... }`.
- `mesh.morphTargetInfluences`, one weight per target, 0 for none and 1 for the full shape.

So a viseme is `mesh.morphTargetInfluences[mesh.morphTargetDictionary.viseme_aa] = 1`. `GLTFLoader` reads the names from the glTF mesh's `extras.targetNames`, which Blender's exporter writes from the shape key names; a file without them gives a dictionary keyed `"0"`, `"1"` and so on. Morph targets on a `SkinnedMesh` work the same way, and the shapes are applied before the skinning, so a face that talks can also turn its head.

Two things make a face harder than one mesh. A head from Blender or an avatar service usually arrives as several meshes, such as skin, teeth, tongue and eyes, and each has its own influences array, so a viseme set on one of them leaves the others where they were. And lip sync is a timing problem: the visemes have to change at the moments the sound does, which is a list of times and names (from a text-to-speech service's viseme events, from Rhubarb Lip Sync, or from an audio analysis) played against the audio's clock.

The old FBX thread's limit of 8 blend shapes is gone: three.js r186 keeps every morph target of a geometry in a texture, one layer each, and blends as many as the geometry has.

paprika3d is a Claude Code plugin and MCP server that opens the page in its own headless Chrome on a paused clock. Its `eval` tool reads every mesh's dictionary in one call, `interact` with `trace` reads the influences every frame, and `look` pictures several moments of the clip side by side.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Two faces and one line of speech

The page builds a face in three meshes, `Skin`, `Mouth` and `Eyes`, with shape keys under the same names where both need them: the skin's `viseme_aa` drops the chin, the mouth's opens the lips. A line of speech is a list of timed visemes, turned into one `AnimationClip` with a `NumberKeyframeTrack` per mesh and target, named `allMouth.morphTargetInfluences[viseme_aa]`; a mixer binds a name in brackets through the mesh's dictionary, which answers "Morph targets keyframes?". A blink is one more track on the eyes.

The face is built twice. The `all` face's clip has tracks for every mesh with the viseme; the `skinOnly` face's has them for the first mesh found, as code that does `face.getObjectByName('Head')` and sets the influences there would. `observe()` returns the clip time and both mouths' influences, and `setState({ t })` moves both clips to a time.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Visemes</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A face in three meshes, as a GLB from Blender or an avatar service often arrives: skin, mouth and eyes,
// each with its own copy of the shape keys it uses, under the same names.
function morph(geometry, targets) {   // targets: name -> (x, y, z) => [x, y, z]
  const p = geometry.attributes.position;
  geometry.morphAttributes.position = Object.entries(targets).map(([name, f]) => {
    const a = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) a.set(f(p.getX(i), p.getY(i), p.getZ(i)).map((v, k) => v - [p.getX(i), p.getY(i), p.getZ(i)][k]), i * 3);
    const attr = new THREE.Float32BufferAttribute(a, 3);
    attr.name = name;
    return attr;
  });
  geometry.morphTargetsRelative = true;
  return geometry;
}
const jaw = (drop) => (x, y, z) => [x, y < -0.12 ? y - drop * Math.min(1, (-0.12 - y) / 0.2) : y, z];
const lips = (sx, sy, dy = 0) => (x, y, z) => [x * sx, (y + 0.22) * sy - 0.22 - dy, z];
function makeFace(prefix, x) {
  const face = new THREE.Group();
  face.name = `${prefix}Face`;
  face.position.x = x;
  const mesh = (name, geometry, color) => { const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color })); m.name = `${prefix}${name}`; face.add(m); return m; };
  mesh('Skin', morph(new THREE.SphereGeometry(0.5, 48, 32), { viseme_aa: jaw(0.1), viseme_O: jaw(0.05), viseme_E: jaw(0.02) }), 0xd8a888);
  mesh('Mouth', morph(new THREE.CircleGeometry(0.12, 32).scale(1, 0.25, 1).translate(0, -0.22, 0.47), {
    viseme_aa: lips(1, 3.2, 0.04), viseme_O: lips(0.55, 2.6, 0.02), viseme_E: lips(1.35, 0.8),
  }), 0x401818);
  const eye = (ex) => new THREE.SphereGeometry(0.06, 16, 12).translate(ex, 0.1, 0.44);
  mesh('Eyes', morph(mergeGeometries([eye(-0.17), eye(0.17)]), { eyesClosed: (x, y, z) => [x, 0.1 + (y - 0.1) * 0.1, z] }), 0x202830);
  for (const m of face.children) m.updateMorphTargets();
  return face;
}

// A line of speech as timed visemes (what a text-to-speech service or Rhubarb gives), turned into one clip.
const SPEECH = [[0, 'rest'], [0.2, 'viseme_aa'], [0.45, 'viseme_O'], [0.7, 'viseme_E'], [0.95, 'rest'], [1.2, 'rest']];
function speechClip(face, meshes) {
  const times = SPEECH.map(([t]) => t);
  const tracks = [];
  for (const mesh of meshes) for (const name of Object.keys(mesh.morphTargetDictionary)) {
    if (!name.startsWith('viseme_')) continue;
    tracks.push(new THREE.NumberKeyframeTrack(`${mesh.name}.morphTargetInfluences[${name}]`, times, SPEECH.map(([, v]) => v === name ? 1 : 0)));
  }
  const eyes = face.getObjectByName(face.name.replace('Face', 'Eyes'));
  tracks.push(new THREE.NumberKeyframeTrack(`${eyes.name}.morphTargetInfluences[eyesClosed]`, [0, 0.8, 0.85, 0.9, 1.2], [0, 0, 1, 0, 0]));
  return new THREE.AnimationClip('hello', 1.2, tracks);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(1, 2, 3);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 3.4);

const faces = {}, mixers = [];
for (const [prefix, x] of [['all', -0.65], ['skinOnly', 0.65]]) {
  const face = makeFace(prefix, x);
  scene.add(face);
  // 'all' drives every mesh that has the viseme; 'skinOnly' drives the first mesh found, as many snippets do
  const meshes = prefix === 'all' ? face.children : [face.children[0]];
  const mixer = new THREE.AnimationMixer(face);
  mixer.clipAction(speechClip(face, meshes)).play();
  mixer.update(0);
  mixers.push(mixer);
  faces[prefix] = face;
}
window.faces = faces;

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

const influences = (mesh) => Object.fromEntries(Object.entries(mesh.morphTargetDictionary).map(([n, i]) => [n.replace('viseme_', ''), +mesh.morphTargetInfluences[i].toFixed(2)]));
window.__game = {
  subject: 'allFace',
  describe: () => ({ name: 'visemes', units: 'morph influences 0 to 1, clip time in seconds', keys: {} }),
  observe: () => ({ t: +mixers[0].time.toFixed(3), allMouth: influences(faces.all.getObjectByName('allMouth')), skinOnlyMouth: influences(faces.skinOnly.getObjectByName('skinOnlyMouth')) }),
  act: () => {},
  setState: (s) => { if (s.t !== undefined) for (const m of mixers) m.setTime(s.t); },
};
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); nothing below depends on frame times. Run folder paths are shortened to `<project>`, and the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out.

**1. Open and look.** Both faces and all six meshes draw:

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:39641/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"name":"visemes","units":"morph influences 0 to 1, clip time in seconds","keys":{}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-24-41-307Z

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-24-41-307Z/look-1.png
Pixels: brightness 22%, colour saturation 29%, 0% near black, 0% blown out.
Hues: blue 78%, orange 21% of the frame; over the objects (22.4% of it): orange 94%, grey 5%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Subject: allFace takes 11% of the picture [200, 212, 583, 591]; 3 of its 3 named parts show.
Stands out: subject brightness 55% against 13% around it, colour 35% against 28%, edge contrast 0.207.
On screen (6):
skinOnlySkin 11% [696, 212, 1079, 591]
allSkin 11% [200, 212, 583, 591]
allEyes 0.34% [262, 331, 459, 379]
skinOnlyEyes 0.34% [820, 331, 1017, 379]
allMouth 0.24% [307, 481, 409, 511] 0.432 × 0.3 units
skinOnlyMouth 0.21% [870, 482, 972, 507] 0.432 × 0.3 units
Never visible: none
```

**2. List every mesh with shape keys, and their names.**

```text
eval {"code":"const out = {};\nscene.traverse((o) => { if (o.morphTargetDictionary) out[o.name] = Object.keys(o.morphTargetDictionary); });\nreturn out;"}

{"allSkin":["viseme_aa","viseme_O","viseme_E"],"allMouth":["viseme_aa","viseme_O","viseme_E"],"allEyes":["eyesClosed"],"skinOnlySkin":["viseme_aa","viseme_O","viseme_E"],"skinOnlyMouth":["viseme_aa","viseme_O","viseme_E"],"skinOnlyEyes":["eyesClosed"]}
```

The skin and the mouth both have the three visemes, and the eyes have the blink. Any mesh in this list whose names match a viseme needs the weight, which is the first thing to read on a model from an unknown source. Names like `"0"` and `"1"` here mean the file was exported without target names.

**3. Trace the visemes through the line.** The clip is set to 0, then 72 frames, the clip's 1.2 s, pass:

```text
interact {"steps":[{"state":{"t":0}},{"wait":72}],"trace":["allMouth.aa","allMouth.O","allMouth.E","skinOnlyMouth.aa"]}

{"changed":{"t":1.217}}
allMouth.aa: 0.08 → peak 1 at frame 11 → low 0 at frame 26 → 0.08 at frame 72; first changed at frame 1
allMouth.O: 0 → peak 1 at frame 26 → 0 at frame 41; first changed at frame 12
allMouth.E: 0 → peak 1 at frame 41 → 0 at frame 56; first changed at frame 27
skinOnlyMouth.aa: 0 throughout the 72 frames
```

`aa` peaks on frame 11, `O` on frame 26 and `E` on frame 41. The `state` step takes a frame of its own, so frame 11 is 12/60 of a second into the clip, 0.2 s, and the other two are 0.45 s and 0.7 s: the times in the speech list, each viseme at full weight on its frame. Compared with the timestamps a speech service gives, the same trace shows a list that is shifted or a viseme that never reaches its weight. `skinOnly`'s mouth holds 0 for the whole line.

**4. Picture the line.** A `look` `sheet` reloads the page for each cell and sets the time:

```text
look {"sheet":[{"label":"0.2 s aa","state":{"t":0.2}},{"label":"0.45 s O","state":{"t":0.45}},{"label":"0.7 s E","state":{"t":0.7}},{"label":"0.85 s blink","state":{"t":0.85}}]}

Picture: <project>/paprika3d/runs/2026-10-28T10-24-41-307Z/look-6-sheet.png (4 moments, left to right, top to bottom: 0.2 s aa | 0.45 s O | 0.7 s E | 0.85 s blink); the game is reloaded at its first frame
0.2 s aa: subject allFace 12%; on screen: skinOnlySkin, allSkin, allMouth, allEyes, skinOnlyEyes, skinOnlyMouth; pixels: brightness 23%, colour saturation 30%, 0% near black, 0% blown out
0.45 s O: subject allFace 12%; on screen: skinOnlySkin, allSkin, allEyes, skinOnlyEyes, allMouth, skinOnlyMouth; pixels: brightness 22%, colour saturation 29%, 0% near black, 0% blown out
0.7 s E: subject allFace 11%; on screen: skinOnlySkin, allSkin, allEyes, skinOnlyEyes, allMouth, skinOnlyMouth; pixels: brightness 22%, colour saturation 29%, 0% near black, 0% blown out
0.85 s blink: subject allFace 11%; on screen: skinOnlySkin, allSkin, allMouth, skinOnlyMouth, skinOnlyEyes, allEyes; pixels: brightness 22%, colour saturation 29%, 0% near black, 0% blown out
This sheet took 3 s (about 1 s a cell) on a software renderer.
```

In the picture the left face opens for `aa`, rounds for `O`, widens for `E` and closes its eyes at 0.85 s. The right face drops its chin for each viseme, from the skin's targets, but its mouth stays a thin closed line through all three; its blink works, because the blink's track was written for the eyes mesh in both clips.

**5. The open mouth from four sides.**

```text
interact {"steps":[{"state":{"t":0.2}}]}

{"changed":{"t":0.217,"allMouth":{"aa":0.93,"O":0.07}}}

look {"target":"allFace"}

Picture: <project>/paprika3d/runs/2026-10-28T10-24-41-307Z/look-7-views.png (front, right, top, three-quarter)
allFace: size 1 × 1.17 × 1, centre [-0.65, -0.085, 0]
```

`target` pictures the face alone from the front, the right, the top and three-quarters. The front view shows the `aa` shape the sheet showed. The three-quarter view shows something the front hides: the mouth is a flat patch, and with the chin dropped it stands off the surface of the face. On a real head, the same check finds teeth that poke through the lips or a tongue that stays behind when the jaw opens.

## Play it against the audio

Driving the clip from the mixer's own clock lets it drift from the sound over a long line. Pause the action and set its time from the audio element each frame instead:

```js
const action = mixer.clipAction(speechClip(face, face.children));
action.play();
action.paused = true;                 // the audio's clock sets the time, not the mixer's
audio.play();
renderer.setAnimationLoop(() => {
  action.time = audio.currentTime;
  mixer.update(0);                    // applies the pose at that time
  renderer.render(scene, camera);
});
```

## What paprika3d does not do

- It does not hear the audio or judge whether the mouth matches it. `interact`'s Sound line counts the sounds the steps start, and nothing more; the check of sync is the trace's frames against the speech list's times.
- It does not make visemes. The shapes come from the model, and the timed list from a speech service or an analysis tool.

## Pitfalls

- **Set the weight on every mesh that has the name.** Walk the face, `face.traverse((m) => { const i = m.morphTargetDictionary?.[name]; if (i !== undefined) m.morphTargetInfluences[i] = w; })`, or build the clip's tracks for every mesh, as this page's `speechClip` does.
- **A mesh with several materials is several meshes.** `GLTFLoader` turns a glTF mesh with more than one primitive into a group with one `Mesh` per primitive, each with the same targets and its own influences.
- **Name the shape keys before export.** Unnamed targets arrive as `"0"`, `"1"`, and code written against names finds nothing.
- **Animated influences and code fight.** A clip with a track for a target writes it on every update; set a weight in code after `mixer.update()`, or leave that target out of the clip.
- **Blend toward the next viseme, not to 0 and back.** Keyframes that drop every viseme to 0 between sounds make a mouth that snaps shut between syllables; overlapping ramps, as in this page's list, read as speech.

## Without paprika3d

`console.log(mesh.morphTargetDictionary)` for each mesh under the head lists the names, and three.js's morph targets example (`webgl_morphtargets_face`) builds a slider per target with lil-gui, which is a quick way to see what each shape does on a new model. Logging `audio.currentTime` beside the viseme being shown, once per change, shows a list that runs ahead or behind.
