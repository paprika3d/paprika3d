---
title: three.js animation crossfade from walk to run, without a T-pose flash or a fade that stops working
phrase: three.js animation crossfade
description: Blending walk and run in three.js with AnimationAction.crossFadeTo, and the three ways it goes wrong (a fade back that leaves the model in its T-pose, a stop and fade-in that flashes the rest pose, root motion that resets the position), shown frame by frame with the paprika3d plugin's interact trace of each action's weight, a look sheet of the fade and one eval of the actions' flags.
meta: three.js animation crossfade between walk and run: why the second fade leaves a T-pose, why a fade-in flashes the rest pose, and how to check the weights.
intent: animation-crossfade-blend-walk-run
queries:
  - "Three.js - skinned skeletal mesh instances, animations and blending"
  - "GLTF Split animations and CrossFade them"
  - "Animation crossFade stops working"
  - "How to not reset model position when crossfading animations?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js animation crossfade from walk to run, without a T-pose flash or a fade that stops working

## What a crossfade does to the weights

An `AnimationMixer` blends every running action by its weight. `walk.crossFadeTo(run, 0.3, true)` fades `walk` from its weight to 0 and `run` from 0 to its weight over 0.3 s, so the two weights always add up to 1 and the pose moves from one clip to the other. The third argument, `warp`, also changes the two actions' speeds during the fade so that both cycles take the same time at every moment, and a short run cycle and a long walk cycle do not fight.

Two details of `AnimationAction` decide whether that holds:

- **An action whose fade-out ends at 0 disables itself** (`enabled = false`). It stays in the mixer, and a later `play()` does not enable it again, so a fade back to it changes nothing: a disabled action's weight counts as 0.
- **When the weights add up to less than 1, the mixer fills the rest with the rest pose**, the pose the bones had when the mixer first bound them. For most rigs that is a T-pose, so any frame where the running actions' weights sum to less than 1 pulls the arms out and the legs straight.

Both are silent: no warning, no error, and the clips themselves are fine. They show in the weights, frame by frame, which is what paprika3d reads. paprika3d is a Claude Code plugin and MCP server that runs the page in its own headless Chrome on a paused clock, and its `interact` tool holds a key on exact frames and traces values from `window.__game.observe()` every frame.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Three robots, three ways to switch

The page builds a small rigged robot three times, each with a `walk` clip (1 s, arms down at -75 degrees) and a `run` clip (0.6 s, arms at -55 degrees, legs swinging wider), and switches all three to `run` while Shift is held and back to `walk` when it is let go. Each robot switches its own way:

- `once`: `from.crossFadeTo(next.play(), FADE, true)`, the line most snippets show. It works the first time.
- `flash`: `from.stop()`, then `next.reset().fadeIn(FADE).play()`.
- `fixed`: `next.reset().play()`, then `from.crossFadeTo(next, FADE, true)`.

`observe()` returns each robot's two weights (0 for an action that is not running), their total, and its left arm's angle, where 0 is the T-pose.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Walk and run</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A small rigged robot in a T-pose; a GLB from Blender or Mixamo gives the same SkinnedMesh and bones.
function makeRobot(name, color) {
  const bone = (n, x, y, parent) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, 0); parent?.add(b); return b; };
  const hips = bone('Hips', 0, 1);
  const spine = bone('Spine', 0, 0.15, hips), head = bone('Head', 0, 0.65, spine);
  const armL = bone('LeftArm', 0.32, 0.5, spine), armR = bone('RightArm', -0.32, 0.5, spine);
  const legL = bone('LeftLeg', 0.15, -0.05, hips), legR = bone('RightLeg', -0.15, -0.05, hips);
  const bones = [hips, spine, head, armL, armR, legL, legR];
  hips.updateMatrixWorld(true);
  const part = (b, w, h, d, x, y) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, 0).applyMatrix4(b.matrixWorld);
    const n = g.attributes.position.count, i = bones.indexOf(b);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, k) => k % 4 ? 0 : i), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, k) => k % 4 ? 0 : 1), 4));
    return g;
  };
  const geometry = mergeGeometries([part(hips, 0.5, 0.25, 0.3, 0, 0), part(spine, 0.6, 0.6, 0.35, 0, 0.3), part(head, 0.35, 0.35, 0.35, 0, 0.2),
    part(armL, 0.6, 0.14, 0.14, 0.3, 0), part(armR, 0.6, 0.14, 0.14, -0.3, 0), part(legL, 0.18, 0.9, 0.18, 0, -0.45), part(legR, 0.18, 0.9, 0.18, 0, -0.45)]);
  const body = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color }));
  body.name = name;
  body.add(hips);
  body.bind(new THREE.Skeleton(bones));
  return body;
}
const q = (deg, axis) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'x' ? 1 : 0, 0, axis === 'z' ? 1 : 0), THREE.MathUtils.degToRad(deg)).toArray();
const track = (bone, axis, times, degs) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, degs.flatMap(d => q(d, axis)));
const walkClip = new THREE.AnimationClip('walk', 1, [
  track('LeftArm', 'z', [0, 1], [-75, -75]), track('RightArm', 'z', [0, 1], [75, 75]),
  track('LeftLeg', 'x', [0, 0.5, 1], [25, -25, 25]), track('RightLeg', 'x', [0, 0.5, 1], [-25, 25, -25]),
]);
const runClip = new THREE.AnimationClip('run', 0.6, [
  track('LeftArm', 'z', [0, 0.6], [-55, -55]), track('RightArm', 'z', [0, 0.6], [55, 55]), track('Spine', 'x', [0, 0.6], [15, 15]),
  track('LeftLeg', 'x', [0, 0.3, 0.6], [50, -50, 50]), track('RightLeg', 'x', [0, 0.3, 0.6], [-50, 50, -50]),
]);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.5));
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.5, 1.8, 7);
camera.lookAt(0, 1, 0);

const FADE = 0.3;   // seconds
const robots = {};
const colours = { once: 0xc07050, flash: 0xc0a040, fixed: 0x50a0c0 };
for (const [i, name] of ['once', 'flash', 'fixed'].entries()) {
  const body = makeRobot(name, colours[name]);
  body.position.x = (i - 1) * 1.6;
  scene.add(body);
  const mixer = new THREE.AnimationMixer(body);
  const walk = mixer.clipAction(walkClip), run = mixer.clipAction(runClip);
  walk.play();
  mixer.update(0);   // pose it before the first frame draws, or frame 0 shows the T-pose
  robots[name] = { body, mixer, walk, run, current: walk };
}
window.anim = robots;

function switchTo(name, to) {
  const r = robots[name], from = r.current, next = r[to];
  if (from === next) return;
  if (name === 'once') from.crossFadeTo(next.play(), FADE, true);                  // works the first time
  else if (name === 'flash') { from.stop(); next.reset().fadeIn(FADE).play(); }   // nothing holds the pose during the fade
  else { next.reset().play(); from.crossFadeTo(next, FADE, true); }               // re-enables the action first
  r.current = next;
}
const run = (on) => { for (const name in robots) switchTo(name, on ? 'run' : 'walk'); };
addEventListener('keydown', (e) => { if (e.code === 'ShiftLeft' && !e.repeat) run(true); });
addEventListener('keyup', (e) => { if (e.code === 'ShiftLeft') run(false); });

let last = null;
renderer.setAnimationLoop((now) => {
  const dt = last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1);
  last = now;
  for (const name in robots) robots[name].mixer.update(dt);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const w = (a) => a.isRunning() ? +a.getEffectiveWeight().toFixed(2) : 0;   // an action that is not running adds nothing
const arm = (r) => +THREE.MathUtils.radToDeg(r.body.skeleton.getBoneByName('LeftArm').rotation.z).toFixed(1);
window.__game = {
  subject: 'fixed',
  describe: () => ({ name: 'walk-run', units: 'action weights 0 to 1, arm angle in degrees (0 is the T-pose)', keys: { ShiftLeft: 'hold to run' } }),
  observe: () => Object.fromEntries(Object.entries(robots).map(([n, r]) => [n, { walk: w(r.walk), run: w(r.run), total: +(w(r.walk) + w(r.run)).toFixed(2), arm: arm(r) }])),
  act: ({ key, down = true }) => { if (key === 'ShiftLeft') run(down); },
  setState: () => {},
};
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). The results are counts of frames on the paused clock, 1/60 s each, and do not depend on the machine. Run folder paths are shortened to `<project>`, and the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out.

**1. Open and look.** All three robots are on screen:

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:41183/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: none
{"name":"walk-run","units":"action weights 0 to 1, arm angle in degrees (0 is the T-pose)","keys":{"ShiftLeft":"hold to run"}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-15-33-464Z

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-15-33-464Z/look-1.png
Pixels: brightness 15%, colour saturation 31%, 0% near black, 0% blown out.
Hues: blue 92% of the frame; over the objects (7.9% of it): cyan 37%, yellow 33%, orange 27%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Subject: fixed takes 2.9% of the picture [792, 219, 968, 559]; 1 of its 1 named parts show.
Stands out: subject brightness 37% against 13% around it, colour 79% against 28%, edge contrast 0.156.
On screen (3):
fixed 2.9% [792, 219, 968, 559]
flash 2.6% [563, 224, 719, 539]
once 2.4% [364, 228, 503, 521]
Never visible: none
```

**2. Run, then walk again.** Shift is held for 60 frames and let go, then 60 more frames pass. The trace follows `once` and `fixed`:

```text
interact {"steps":[{"key":"ShiftLeft","down":true},{"wait":60},{"key":"ShiftLeft","down":false},{"wait":60}],"trace":["once.walk","once.run","once.arm","fixed.walk","fixed.run","fixed.arm"]}

{"changed":{"once":{"walk":0,"total":0,"arm":0}}}
once.walk: 1 → 0 at frame 18; first changed at frame 1
once.run: 0 → peak 1 at frame 18 → 0 at frame 79; first changed at frame 1
once.arm: -75 → 0 at frame 79; first changed at frame 1
fixed.walk: 1 → low 0 at frame 18 → 1 at frame 79; first changed at frame 1
fixed.run: 0 → peak 1 at frame 18 → 0 at frame 79; first changed at frame 1
fixed.arm: -75 → peak -55 at frame 18 → -75 at frame 79; first changed at frame 1
```

The first fade works for both: `walk` reaches 0 and `run` reaches 1 on frame 18, the 0.3 s fade. The fade back is where they part. Shift is let go on frame 61; on frame 79 `fixed` is walking again with `walk` at 1, while `once` has both weights at 0 and its arm at 0, standing in the T-pose. Nothing more will move it.

**3. Read the actions' flags.**

```text
eval {"code":"const flags = (a) => ({ enabled: a.enabled, running: a.isRunning(), weight: +a.getEffectiveWeight().toFixed(2), time: +a.time.toFixed(2) });\nreturn Object.fromEntries(Object.entries(anim).map(([n, r]) => [n, { walk: flags(r.walk), run: flags(r.run) }]));"}

{"once":{"walk":{"enabled":false,"running":false,"weight":0,"time":0.41},"run":{"enabled":false,"running":false,"weight":0,"time":0.01}},"flash":{"walk":{"enabled":true,"running":true,"weight":1,"time":0.02},"run":{"enabled":true,"running":false,"weight":1,"time":0}},"fixed":{"walk":{"enabled":true,"running":true,"weight":1,"time":0.11},"run":{"enabled":false,"running":false,"weight":0,"time":0.01}}}
```

Both of `once`'s actions are disabled. `walk` was disabled when the first fade took it to 0, and the second fade's `play()` left it that way, so the fade raised nothing while `run` faded out as asked. `fixed` called `reset()` first, which sets `enabled` back to true, the time to 0, and clears any fade or warp left over. That is the whole difference between the two lines of code, and the fix for "crossFade stops working".

**4. The T-pose flash.** A fresh `open` (not shown, it reloads to frame 0), then Shift for 30 frames, tracing `flash` against `fixed`:

```text
interact {"steps":[{"key":"ShiftLeft","down":true},{"wait":30}],"trace":["flash.total","flash.arm","fixed.total","fixed.arm"]}

{"changed":{"once":{"walk":0,"run":1,"arm":-55},"flash":{"walk":0,"run":1,"arm":-55},"fixed":{"walk":0,"run":1,"arm":-55}}}
flash.total: 1 → low 0.06 at frame 1 → 1 at frame 18; first changed at frame 1
flash.arm: -75 → peak -3.1 at frame 1 → -55 at frame 18; first changed at frame 1
fixed.total: 1 throughout the 31 frames
fixed.arm: -75 → -55 at frame 18; first changed at frame 1
```

On frame 1, `flash`'s weights add up to 0.06: `walk` was stopped at once and `run` has just begun to fade in, so the mixer fills nearly all of the pose from the rest pose and the arm jumps from -75 to -3.1 degrees, nearly straight out. It takes the 18 frames of the fade to come back. `fixed` keeps a total of 1 on every frame, and its arm moves straight from the walk's angle to the run's.

**5. Picture the fade.** A `look` `sheet` reloads the page for each cell and plays the steps given, so it shows frames 1, 6 and 18 after Shift side by side:

```text
look {"sheet":[{"label":"Shift, frame 1","steps":[{"key":"ShiftLeft","down":true}]},{"label":"frame 6","steps":[{"key":"ShiftLeft","down":true},{"wait":5}]},{"label":"frame 18","steps":[{"key":"ShiftLeft","down":true},{"wait":17}]}]}

Picture: <project>/paprika3d/runs/2026-10-28T10-15-34-753Z/look-4-sheet.png (3 moments, left to right, top to bottom: Shift, frame 1 | frame 6 | frame 18); the game is reloaded at its first frame
Shift, frame 1: subject fixed 2.9%; on screen: fixed, flash, once; pixels: brightness 15%, colour saturation 31%, 0% near black, 0% blown out
frame 6: subject fixed 3%; on screen: fixed, flash, once; pixels: brightness 15%, colour saturation 32%, 0% near black, 0% blown out
frame 18: subject fixed 3%; on screen: fixed, flash, once; pixels: brightness 15%, colour saturation 31%, 0% near black, 0% blown out
This sheet took 2 s (about 1 s a cell) on a software renderer.
```

In the picture, `flash` (the middle robot) stands with its arms almost level and its legs straight on frame 1, still has them well above the others' on frame 6, and runs like the other two on frame 18. A one-frame flash like that is easy to miss in a browser at full speed; the sheet holds it still.

## The position that resets at the fade

A clip exported with root motion has a position track on the hips (`Hips.position` or `mixamorigHips.position`) that walks the model forward and jumps back each time the clip loops. During a crossfade the two clips' hip positions are blended, so the model slides or snaps back partway. Moving the character in code and keeping the clip in place stops it: drop the hip's position track, or keep its height and drop the forward part.

```js
// keep the clip in place: remove root motion before making the actions
for (const clip of gltf.animations) {
  clip.tracks = clip.tracks.filter((t) => !/Hips\.position$/.test(t.name));
}
```

To check it on the page, put the hips' world position in `observe()` and trace it over a switch: a position that changes while the character's own position does not is root motion.

## What paprika3d does not do

- It does not judge a blend. The weights, angles and sheet say what happened on each frame; whether a 0.3 s fade looks right for this character is a person's call.
- It does not read a mixer's actions unless the page puts them where `eval` or `observe()` can reach them, as this page does with `window.anim`.
- It does not hear or see foot sliding: a walk and a run fading out of step shows in a sheet or a `record` GIF, not in a reply line.

## Pitfalls

- **`reset()` the action you fade to**, every time. It re-enables it, sets its time to 0 and clears a fade or warp still running.
- **A weight of 0 is not a fade's starting point.** `fadeIn` multiplies the action's own weight, so an action set to `setEffectiveWeight(0)` and then faded in stays at 0. Leave its weight at 1 and let the fade bring it in, or set it to 1 just before.
- **Do not stop the old action and fade in the new one.** Fade both, with `crossFadeTo` or with `fadeOut` and `fadeIn` of the same length, so the total stays 1.
- **Pose the model before the first frame.** A `mixer.update(0)` right after `play()` applies the first pose, or frame 0 draws the T-pose.
- **Match the cycles for walk and run.** With `warp` the two cycles keep the same length during the fade, but not the same step; to land on the same step, start the new action at the same share of its clip, `next.time = from.time / from.getClip().duration * next.getClip().duration`, after `reset()`.

## Without paprika3d

Log `action.getEffectiveWeight()` for both actions and their total each frame during a switch, and `action.enabled` after it: a total under 1 is the rest pose showing through, and a disabled action that should be playing is the fade that stopped working. three.js's own skinning and blending example (`webgl_animation_skinning_blending`) enables the target action and sets its weight to 1 before each crossfade, which is the same fix as `reset()`. Slowing the mixer with `mixer.timeScale = 0.1` stretches a one-frame flash long enough to see.
