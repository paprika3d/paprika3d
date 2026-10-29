---
title: three.js audio not playing until a click, and positional sound that does not follow the camera
phrase: three.js audio not playing
description: Why three.js audio stays silent until the visitor clicks or presses a key (the browser creates the AudioContext suspended), where to call resume, and how to check that each PositionalAudio and the AudioListener sit where they should, read in the page with the paprika3d plugin's eval and interact tools and a level meter that needs no speakers.
meta: three.js audio not playing until a click: resume the suspended AudioContext in an input handler, and check positional sound follows.
intent: threejs-audio-wont-play-autoplay
queries:
  - "Audio stopped playing in latest Chrome update"
  - "Can we play sound of a video without user interaction?"
  - "Multiple 3D sounds in Three.js"
  - "AudioListener position not updating...please advise!"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js audio not playing until a click, and positional sound that does not follow the camera

## Why the sound waits for a click

Browsers do not let a page make sound before the visitor has done something on it. In Chrome, an `AudioContext` created before the page has had a click, a tap or a key press starts `suspended`: its clock stays at 0 and nothing started on it is heard until the page calls `resume()` after such an input. three.js leaves this to the page. `new THREE.AudioListener()` creates the page's one shared context (`THREE.AudioContext.getContext()`), so a listener made at load, as most examples make it, starts suspended, and `sound.play()` at load queues a sound nobody hears.

The fix is a handler that resumes the context on the visitor's first input:

```js
const listener = new THREE.AudioListener();
camera.add(listener);
const unlock = () => listener.context.resume();
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
```

Music queued at load then starts when the context resumes, as the meter below shows. The same rule covers a `<video>` with a sound track: Chrome lets a muted video play by itself, and its sound needs the same input first.

Placement is the other half. A `PositionalAudio` is an `Object3D`: it sounds from wherever its parent puts it, so it belongs on the object that makes the sound. The `AudioListener` is the ears: it hears from wherever its parent puts it, so it belongs on the camera. A scene with several sounds has one listener and one `PositionalAudio` per sound, each on its own object. One sound played again while it is still playing is a different problem, with its own warning: [Audio is already playing](/errors/audio-is-already-playing).

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. It hears nothing, so it reads the audio graph instead. `eval` runs code in the page: the context's state, the positions Web Audio itself holds for the listener and each sound, and a level meter (an `AnalyserNode` on the listener's input) that says whether any signal reaches the output. `interact` presses keys and clicks as a visitor would, and its `Sound` line counts the sounds the page started.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A radio in a room

A camera that walks left and right with the arrow keys, and a radio to its right that plays a looping tone made in code, so the page loads no audio file. The listener rides on the camera and the tone on the radio. `window.__game.observe()` returns the context's state and the camera's place, so `interact` reports when either changes.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Radio</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202630);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 6);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x55606e }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
const radio = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0xd04a3a }));
radio.name = 'radio';
radio.position.set(6, 0.25, 3);
scene.add(floor, radio);

// The listener rides on the camera; the radio's sound rides on the radio.
const listener = new THREE.AudioListener();
camera.add(listener);
const ctx = listener.context;   // THREE.AudioContext.getContext(): one shared context, made here at load

// A short tone made in code, so the page loads no audio file.
const tone = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
tone.getChannelData(0).forEach((_, i, d) => { d[i] = Math.sin(i / ctx.sampleRate * 2 * Math.PI * 330) * 0.2; });
const song = new THREE.PositionalAudio(listener);
song.setBuffer(tone);
song.setLoop(true);
song.setRefDistance(1);
radio.add(song);
song.play();   // at load the context is suspended: the tone waits, unheard, until it resumes

// Browsers create a context suspended until the visitor clicks, taps or presses a key; resume it in that handler.
const unlock = () => ctx.resume();
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - (last || t)) / 1000, 0.1);
  last = t;
  camera.position.x += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * 3 * dt;
  camera.lookAt(camera.position.x, 1, 0);
  renderer.render(scene, camera);
});

const round = (v) => Math.round(v * 100) / 100;
window.__game = {
  describe: () => ({ name: 'radio', keys: { ArrowLeft: 'walk left', ArrowRight: 'walk right' } }),
  observe: () => ({ audio: ctx.state, camera: { x: round(camera.position.x) } }),
};
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

## Before and after the first key

The meter is one `eval`: it taps the listener's input with an `AnalyserNode`, lets the audio run for 300 real milliseconds, and returns the loudest sample with the positions Web Audio holds.

```js
const ctx = THREE.AudioContext.getContext(), listener = camera.children.concat(scene.children).find((o) => o.type === 'AudioListener');
const meter = ctx.createAnalyser();
listener.getInput().connect(meter);
const wave = new Float32Array(meter.fftSize), t0 = realNow();
while (realNow() - t0 < 300) {}
meter.getFloatTimeDomainData(wave);
meter.disconnect();
let song;
scene.traverse((o) => { if (o.panner) song = o; });
const at = (a) => [a.positionX.value, a.positionY.value, a.positionZ.value].map((v) => +v.toFixed(2));
return { state: ctx.state, peak: +Math.max(...wave.map(Math.abs)).toFixed(3), listener: at(ctx.listener), song: at(song.panner) };
```

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33703/index.html in 0.4 s, paused at frame 0.
{"name":"radio","keys":{"ArrowLeft":"walk left","ArrowRight":"walk right"}}

eval (the meter above)

{"state":"suspended","peak":0,"listener":[0,0,0],"song":[0,0,0]}

interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"audio":"running","camera":{"x":3}}}
Sound: none started during these steps (1 since load).

eval (the meter above)

{"state":"running","peak":0.047,"listener":[2.98,1.6,6],"song":[6,0.25,3]}

interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"camera":{"x":6}}}
Sound: none started during these steps (1 since load).

eval (the meter above)

{"state":"running","peak":0.058,"listener":[5.97,1.6,6],"song":[6,0.25,3]}
```

Before any input the context is `suspended`, the meter reads 0, and even the positions are still 0: three.js sets them as ramps on the context's clock, which has not started. The key's `keydown` ran `unlock`; the state is `running` and the tone queued at load now reaches the output at 0.047. The listener stands where the camera stands (a step behind, since three.js ramps it over a frame) and the tone where the radio is. One more second of walking brings the camera nearer the radio, and the level rises to 0.058.

The `Sound` line counts the sounds a page starts, not the ones heard: its "1 since load" is the `song.play()` at load, made on a suspended context and silent until the key. The context's state and the meter tell whether a started sound can be heard.

## Bug 1: nothing resumes the context

The same page without the two `unlock` listeners:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"camera":{"x":2.95}}}
Sound: none started during these steps (1 since load).

eval (the meter above)

{"state":"suspended","peak":0,"listener":[0,0,0],"song":[0,0,0]}
```

The camera walked and `audio` is not among the changes: the context is still suspended after the key, and the meter reads 0. This is the page from "Audio stopped playing in latest Chrome update": the sound code is fine, and it waits for a `resume()` that never comes.

## Bug 2: the sound is not on the object

The same page with `scene.add(song)` in place of `radio.add(song)`:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"audio":"running","camera":{"x":2.95}}}
Sound: none started during these steps (1 since load).

eval (the meter above)

{"state":"running","peak":0.034,"listener":[2.93,1.6,6],"song":[0,0,0]}

interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"camera":{"x":5.95}}}
Sound: none started during these steps (1 since load).

eval (the meter above)

{"state":"running","peak":0.025,"listener":[5.92,1.6,6],"song":[0,0,0]}
```

The tone plays from the world's origin, `[0,0,0]`, not from the radio, so walking toward the radio makes it quieter: 0.034, then 0.025. Add the `PositionalAudio` to the object that makes the sound, and a moving object carries its sound with it.

## Bug 3: the listener is not on the camera

The same page with `scene.add(listener)` in place of `camera.add(listener)`:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"audio":"running","camera":{"x":2.95}}}
Sound: none started during these steps (1 since load).

eval (the meter above)

{"state":"running","peak":0.022,"listener":[0,0,0],"song":[6,0.25,3]}

interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"camera":{"x":5.95}}}
Sound: none started during these steps (1 since load).

eval (the meter above)

{"state":"running","peak":0.022,"listener":[0,0,0],"song":[6,0.25,3]}
```

The ears stay at the origin while the camera walks, so the level holds at 0.022 wherever the camera goes: the "AudioListener position not updating" thread. On the camera, the listener moves with it. The camera need not be in the scene for this: in the radio page it is not, and `renderer.render` updates a camera with no parent together with its children.

## What the harness cannot show: a resume with no input

In the harness, the page counts as already used from its first frame: the harness's own calls into the page count as input to Chrome, and `navigator.userActivation.hasBeenActive` reads `true` before any step. So a `resume()` placed outside an input handler works here. The same page with the `unlock` listeners removed and `if (ctx.state === 'suspended') ctx.resume();` in the frame loop:

```text
open {"url": "index.html", "cwd": "<project>"}

eval {"code": "return { state: THREE.AudioContext.getContext().state, activated: navigator.userActivation.hasBeenActive }"}

{"state":"running","activated":true}
```

The context runs before any key or click. For a visitor, Chrome keeps that context suspended until their first click, tap or key, so this page stays silent for them while the harness hears a running context. Read the source for where `resume()` is called: inside a `pointerdown`, `click`, `touchend` or `keydown` handler is the pattern that holds for a visitor.

## What to read in the replies

- `eval` with `THREE.AudioContext.getContext().state`: `suspended` right after `open` means the page made its context at load and depends on a later `resume()`; `running` after a key or click means the handler worked.
- The meter: a peak of 0 on a running context means no sound is playing or none reaches the listener; a peak that changes as the camera moves means positional audio is placed.
- `listener` and `song`: the positions Web Audio uses, read back from the graph. Compare them with the camera and the object.
- `interact`, the `Sound` line: sounds started during the steps, and since load. `feel` reports the same count after an event as `Sounds started`. A count says a sound was started, never that it was heard.

## What paprika3d does not do

It hears nothing and does not judge whether a sound fits the moment. It runs Chrome, or Firefox where installed, never Safari: the iOS threads ("AudioContext IOS 17") need the device. It cannot show Chrome refusing a `resume()` made before the visitor's first input, for the reason above. It does not write the audio code; the agent changes the page and reads the graph again.

## Without paprika3d

Open the page in a fresh tab and do not click: log `listener.context.state` from the frame loop, and from your input handler. Draw the meter's peak as a bar on screen to see the level change as you walk. Log `listener.getWorldPosition()` beside `camera.getWorldPosition()` and each sound's `getWorldPosition()` beside its object's; each pair should match. Test on an iPhone before release.
