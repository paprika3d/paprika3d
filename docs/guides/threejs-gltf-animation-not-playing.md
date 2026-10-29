---
title: three.js glTF animation not playing? Read the mixer, its clock and each action's flags
phrase: three.js gltf animation not playing
description: Why a glTF model's animation does not play in three.js (no AnimationMixer, mixer.update never called or called with no time, the action never played, a LoopOnce clip that snaps back), and how a coding agent with the paprika3d plugin tells which from one eval of the actions' flags and an interact trace of a bone, then scrubs and reverses the clip.
meta: three.js glTF animation not playing: find the missing mixer update, the unplayed action or the zero delta, and check play once, scrub and reverse.
intent: gltf-animation-not-playing
queries:
  - "Play a GLTF animation? three.js"
  - "Easiest way to play skeletal animation from glTF"
  - "GLTFLoader Animations = :-("
  - "ThreeJS - how to set current time in Animation"
  - "Playing an animation changes behaviour of next animation"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js glTF animation not playing? Read the mixer, its clock and each action's flags

## Four things between a loaded clip and a moving bone

`GLTFLoader` gives back the model in `gltf.scene` and its clips in `gltf.animations`, and nothing plays them by itself. A clip moves a bone when four things all hold:

1. An `AnimationMixer` exists for the model, built on the object that holds the bones (`gltf.scene`, or the group under it).
2. An action exists for the clip, `mixer.clipAction(clip)`, and `play()` was called on it.
3. `mixer.update(delta)` runs every frame, with the seconds since the last frame.
4. The action is still enabled and has weight: a clip set to play once and finished, a fade that ended at 0, or a `stop()` leaves the model in its rest pose, which for most rigs is a T-pose.

A missing piece makes no error and no warning. The model loads, draws and stands still, which is why threads on this question go back and forth over the setup code. A track whose bone name does not match the model is the one case three.js does warn about; that warning has its own page, [No target node found for track](/errors/propertybinding-no-target-node-found).

paprika3d is a Claude Code plugin and MCP server that opens the page in its own headless Chrome on a paused clock. Its `eval` tool runs code in the page and returns the answer, so the agent can read each mixer's time and each action's flags in one call, and `interact` with `trace` reads a bone's angle every frame to show which models move.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A page with four robots and four setups

The page makes a small rigged robot with two clips, `wave` (a loop) and `bow` (meant to play once), writes it to GLB bytes with `GLTFExporter` so the page needs no file, and loads that GLB four times with `GLTFLoader`, as a page loads `robot.glb`. Each copy is set up the way one of the threads had it:

- `noUpdate`: the action plays, but nobody calls `mixer.update()`.
- `noPlay`: the mixer updates every frame, but the action was created and never played.
- `zeroDelta`: the action plays and the mixer updates, with a delta from a `THREE.Clock` that something else already read in the same frame.
- `plays`: the setup that works.

The mixers sit on `window.anim`, so the tools can reach them: `eval` runs in the page, but a mixer kept in a closure is out of its reach. `observe()` returns each robot's right arm angle in degrees, the `plays` robot's spine angle and its mixer time.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Robots</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
camera.position.set(0, 1.6, 9);
camera.lookAt(0, 1.1, 0);

// Four copies of the same file, each set up the way one thread had it. A real page: await loader.loadAsync('robot.glb').
const glb = await robotGlb();
const loader = new GLTFLoader();
const clock = new THREE.Clock();   // the older clock, for the zeroDelta robot only
const anim = {};   // name: { mixer, clips }, for the tools to read
const robots = {};
const colours = { noUpdate: 0xc07050, noPlay: 0xc0a040, zeroDelta: 0x9070c0, plays: 0x50a0c0 };
for (const [i, name] of ['noUpdate', 'noPlay', 'zeroDelta', 'plays'].entries()) {
  const gltf = await loader.parseAsync(glb.slice(0), '');
  const robot = gltf.scene.getObjectByName('robot');
  robot.name = name;
  const body = robot.getObjectByName('body');
  body.name = `${name}Body`;
  body.material.color.set(colours[name]);
  robot.position.x = (i - 1.5) * 2.2;
  scene.add(robot);
  const mixer = new THREE.AnimationMixer(robot);
  const wave = THREE.AnimationClip.findByName(gltf.animations, 'wave');
  if (name !== 'noPlay') mixer.clipAction(wave).play();
  else mixer.clipAction(wave);                    // created, never played
  anim[name] = { mixer, clips: gltf.animations };
  robots[name] = robot;
}
window.anim = anim;

const deg = (o, a = 'z') => +THREE.MathUtils.radToDeg(o.rotation[a]).toFixed(1);
const arm = (name) => deg(robots[name].getObjectByName('RightArm'));
let clampBow = false;

let last = null;
renderer.setAnimationLoop((now) => {
  const dt = last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1);   // seconds, at most 0.1
  last = now;
  anim.plays.mixer.update(dt);
  anim.noPlay.mixer.update(dt);
  clock.getDelta();                               // something else reads the clock first...
  anim.zeroDelta.mixer.update(clock.getDelta());  // ...so this second read is about 0
  // anim.noUpdate.mixer is never updated
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const bowAction = () => anim.plays.mixer.clipAction(THREE.AnimationClip.findByName(anim.plays.clips, 'bow'));
function bow() {   // stop waving, bow once
  anim.plays.mixer.stopAllAction();
  const action = bowAction();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = clampBow;
  action.timeScale = 1;
  action.reset().play();               // reset: a finished action plays again from 0
}
function unbow() {  // the same clip backwards, from its end
  const action = bowAction();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset();
  action.time = action.getClip().duration;
  action.timeScale = -1;
  action.play();
}

window.__game = {
  subject: 'plays',
  describe: () => ({ name: 'robots', units: 'degrees and seconds', actions: { bow: 'the plays robot bows once', unbow: 'and straightens up' }, keys: {} }),
  observe: () => ({ noUpdate: arm('noUpdate'), noPlay: arm('noPlay'), zeroDelta: arm('zeroDelta'), plays: arm('plays'),
    spine: deg(robots.plays.getObjectByName('Spine'), 'x'), clip: +anim.plays.mixer.time.toFixed(3), clampBow }),
  act: ({ action }) => { if (action === 'bow') bow(); if (action === 'unbow') unbow(); },
  setState: (s) => {
    if (s.clampBow !== undefined) clampBow = s.clampBow;
    if (s.clip !== undefined) { anim.plays.mixer.setTime(s.clip); }   // jump the plays robot to a time
  },
};
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Nothing below depends on frame times: every result is a count of frames on the paused clock. Run folder paths are shortened to `<project>`, and the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out.

**1. Open the page.** It loads paused at frame 0. three.js r186 deprecates `THREE.Clock`, and `open` passes the warning on:

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:42753/index.html in 0.4 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
three.js warned: THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
Page text outside the canvas: none
{"name":"robots","units":"degrees and seconds","actions":{"bow":"the plays robot bows once","unbow":"and straightens up"},"keys":{}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-11-34-766Z
```

**2. Look.** All four robots draw, so loading and materials are not the problem:

```text
look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-11-34-766Z/look-1.png
Pixels: brightness 14%, colour saturation 31%, 0% near black, 0% blown out.
Hues: blue 93% of the frame; over the objects (7.4% of it): cyan 27%, orange 26%, yellow 23%, violet 23%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Subject: plays takes 2% of the picture [961, 263, 1111, 528]; 1 of its 1 named parts show.
Stands out: subject brightness 37% against 13% around it, colour 79% against 28%, edge contrast 0.181.
This camera shows little of the subject: try other views with `look` camera, then move the page's own camera to the best (said once).
On screen (4):
playsBody 2% [961, 263, 1111, 528]
noUpdateBody 2% [119, 267, 350, 528]
zeroDeltaBody 1.7% [691, 264, 841, 528]
noPlayBody 1.7% [391, 267, 617, 528]
Never visible: none
```

**3. Step one second and read the arms.** `trace` reads each robot's right arm angle on every one of the 60 frames:

```text
interact {"steps":[{"wait":60}],"trace":["noUpdate","noPlay","zeroDelta","plays"]}

{"changed":{"clip":1.017}}
noUpdate: 0 throughout the 60 frames
noPlay: 0 throughout the 60 frames
zeroDelta: -60 throughout the 60 frames
plays: -61.3 → low -100 at frame 29 → peak -60 at frame 59 → -61.3 at frame 60; first changed at frame 1
```

`noUpdate` and `noPlay` hold 0, the T-pose of the rig at rest. `zeroDelta` holds -60, which is the clip's first key: its action is bound and applied, but its clock never moves. `plays` swings from -60 down to -100 and back, the wave the clip asks for.

**4. Read every mixer and action in one call.**

```text
eval {"code":"const LOOP = { 2200: 'once', 2201: 'repeat', 2202: 'pingpong' };\nconst robots = {};\nfor (const [name, { mixer, clips }] of Object.entries(anim)) robots[name] = { mixerTime: +mixer.time.toFixed(3),\n  actions: clips.map(c => mixer.existingAction(c)).filter(Boolean).map(a => ({ clip: a.getClip().name, running: a.isRunning(), time: +a.time.toFixed(3), weight: a.getEffectiveWeight(), enabled: a.enabled, paused: a.paused, loop: LOOP[a.loop], clamp: a.clampWhenFinished })) };\nreturn { clips: anim.plays.clips.map(c => `${c.name} ${c.duration} s`), robots };"}

{"clips":["wave 2 s","bow 1 s"],"robots":{"noUpdate":{"mixerTime":0,"actions":[{"clip":"wave","running":true,"time":0,"weight":1,"enabled":true,"paused":false,"loop":"repeat","clamp":false}]},"noPlay":{"mixerTime":1.017,"actions":[{"clip":"wave","running":false,"time":0,"weight":1,"enabled":true,"paused":false,"loop":"repeat","clamp":false}]},"zeroDelta":{"mixerTime":0,"actions":[{"clip":"wave","running":true,"time":0,"weight":1,"enabled":true,"paused":false,"loop":"repeat","clamp":false}]},"plays":{"mixerTime":1.017,"actions":[{"clip":"wave","running":true,"time":1.017,"weight":1,"enabled":true,"paused":false,"loop":"repeat","clamp":false}]}}}
```

The flags separate the three faults that look the same in the picture:

| Robot | mixer `time` | action | What it means |
|---|---|---|---|
| `noUpdate` | 0 | running, time 0 | the mixer never got time: `update()` is not called |
| `noPlay` | 1.017 | not running | the mixer runs, the action was never played |
| `zeroDelta` | 0 | running, time 0 | `update()` is called with 0; with the pose at the first key, not the rest pose |
| `plays` | 1.017 | running, time 1.017 | works |

A mixer time of 0 with a running action means the update gets no time, whether it is never called or called with 0, and the trace in step 3 tells those two apart. `mixer.existingAction(clip)` returns the action if one was made, without making one, so the same code works on any page that exposes its mixers.

## Play once, hold the last frame, play backwards

**5. A clip that plays once and snaps back.** The `bow` action stops the wave and plays `bow` once with `LoopOnce`, as the code first had it, with `clampWhenFinished` left false:

```text
interact {"steps":[{"action":"bow"},{"wait":90}],"trace":["spine","plays"]}

{"changed":{"plays":0,"clip":2.533}}
spine: 0 → peak 45 at frame 60 → 0 at frame 61; first changed at frame 1
plays: -61.3 → peak 75 at frame 1 → 0 at frame 61; first changed at frame 1
```

The spine reaches 45 degrees on frame 60, the end of the 1 s clip, and is back at 0 on frame 61, with the arms back in the T-pose. A finished `LoopOnce` action without `clampWhenFinished` disables itself, and a model with no enabled action returns to its rest pose. The same `bow` with `clampBow` set true first:

```text
interact {"steps":[{"state":{"clampBow":true}},{"action":"bow"},{"wait":90}],"trace":["spine","plays"]}

{"changed":{"plays":75,"spine":45,"clip":4.067,"clampBow":true}}
spine: 0 → 45 at frame 60; first changed at frame 1
plays: 0 → 75 at frame 1; first changed at frame 1
```

It holds 45. With `clampWhenFinished` the finished action pauses on its last frame and stays enabled. To play it again, call `reset()` before `play()`: a finished action keeps its time at the end, so `play()` alone does nothing, which is what "Playing an animation changes behaviour of next animation" ran into.

**6. Play it backwards.** `unbow` plays the same clip with `timeScale = -1`, starting from its end:

```text
interact {"steps":[{"action":"unbow"},{"wait":90}],"trace":["spine"]}

{"changed":{"spine":0,"clip":5.583}}
spine: 45 → 0 at frame 60; first changed at frame 1
```

The spine goes from 45 back to 0 over the same 60 frames. A reversed `LoopOnce` action has to start at `time = clip.duration`; started at 0, it is finished on its first frame. The page's `unbow()` calls `reset()`, then sets `time` and `timeScale`, then `play()`, in that order, because `reset()` puts the time back to 0.

**7. Jump to a time.** `mixer.setTime(t)` puts the mixer and its actions back to 0, advances them by `t` and applies the pose, which is how to scrub a clip or start it partway. The page's `setState({ clip })` calls it, so a `look` `sheet` can picture five times of the wave in one grid, each cell a fresh reload:

```text
look {"sheet":[{"label":"0 s","state":{"clip":0}},{"label":"0.25 s","state":{"clip":0.25}},{"label":"0.5 s","state":{"clip":0.5}},{"label":"0.75 s","state":{"clip":0.75}},{"label":"1 s","state":{"clip":1}}]}

Picture: <project>/paprika3d/runs/2026-10-28T10-11-34-766Z/look-7-sheet.png (5 moments, left to right, top to bottom: 0 s | 0.25 s | 0.5 s | 0.75 s | 1 s); the game is reloaded at its first frame
0 s: subject plays 2%; on screen: playsBody, noUpdateBody, zeroDeltaBody, noPlayBody; pixels: brightness 14%, colour saturation 31%, 0% near black, 0% blown out
0.25 s: subject plays 2%; on screen: playsBody, noUpdateBody, zeroDeltaBody, noPlayBody; pixels: brightness 14%, colour saturation 31%, 0% near black, 0% blown out
0.5 s: subject plays 1.9%; on screen: noUpdateBody, playsBody, zeroDeltaBody, noPlayBody; pixels: brightness 14%, colour saturation 31%, 0% near black, 0% blown out
0.75 s: subject plays 2%; on screen: playsBody, noUpdateBody, zeroDeltaBody, noPlayBody; pixels: brightness 14%, colour saturation 31%, 0% near black, 0% blown out
1 s: subject plays 2%; on screen: playsBody, noUpdateBody, zeroDeltaBody, noPlayBody; pixels: brightness 14%, colour saturation 31%, 0% near black, 0% blown out
```

The sheet shows the `plays` robot's arm at each time and the other three unchanged. For a scrub bar, pause the action (`action.paused = true`) and set `action.time` from the slider; for a whole mixer, `setTime`.

## Clips one after another

Listen for the mixer's `finished` event, which a `LoopOnce` action sends when it ends, and start the next clip from there:

```js
mixer.addEventListener('finished', (e) => {
  if (e.action === bowAction) waveAction.reset().fadeIn(0.3).play();
});
```

To blend from one clip into the next instead of starting it cold, see [crossfading walk and run](/guides/threejs-animation-crossfade-walk-run).

## What paprika3d does not do

- It does not find a mixer the page keeps in a closure or a React ref: `eval` reads what the page exposes on `window`, the scene, or `window.__game`.
- It does not report a still model as a fault. The replies say what moved and what did not; whether a clip should be playing is the page's to know.
- It steps the clock 1/60 s a frame, so a page that calls `mixer.update(1 / 60)` instead of passing the real delta plays at the right speed here and too fast on a faster display. Reading the update call is the check.

## Pitfalls

- **One `update()` a frame per mixer, in seconds.** A delta worked out from the rAF timestamp is in milliseconds until it is divided by 1000, and passed as it is it runs the clip a thousand times too fast.
- **Read the clock once a frame.** `THREE.Clock.getDelta()` returns the time since its last call, so a second read in the same frame returns about 0. `THREE.Timer`, which r186 recommends instead, computes the delta once in `timer.update()` and returns the same value however often `getDelta()` is read.
- **Build the mixer on the object that holds the bones.** `new AnimationMixer(gltf.scene)`; a mixer on another subtree binds nothing.
- **Find clips by name**, `THREE.AnimationClip.findByName(gltf.animations, 'Walk')`, rather than by index: exporters reorder them.
- **One mixer per copy of the model.** The clips can be shared; the mixer cannot.

## Without paprika3d

In the browser's console, log `gltf.animations.map(c => [c.name, c.duration])` after loading to see the clips, and in the loop log `mixer.time` once a second: a time that does not grow means the update gets no time, and a growing time with a still model means the action is not playing or has no weight. `action.isRunning()`, `action.getEffectiveWeight()` and `action.enabled` answer the rest. A `SkeletonHelper` added to the scene draws the bones, so a skinned mesh that moves while its bones stay still, or the other way round, shows at once.
