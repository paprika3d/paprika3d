---
title: three.js Audio: Audio is already playing, overlap sounds with a pool
phrase: audio is already playing
description: What the three.js warning "THREE.Audio: Audio is already playing." means, the isPlaying check at the top of Audio.play(), the click handlers, loops and autoplay settings that reach it, and how the paprika3d plugin's interact replies count the sounds that started before and after a pool of Audio objects.
meta: How to fix three.js "THREE.Audio: Audio is already playing": what triggers it, the line that prints it, and the fix in code.
intent: error-audio-already-playing
message: THREE.Audio: Audio is already playing.
queries:
  - "THREE.Audio: Audio is already playing."
  - "Audio pause not working properly"
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.Audio: Audio is already playing.

three.js prints this warning when `play()` is called on an `Audio` or `PositionalAudio` whose `isPlaying` flag is still true. The call does nothing else: the sound that is playing keeps going, no second copy starts, and the warning is the one trace left. In a game this shows up as a sound effect that plays once and then goes quiet when the player clicks, jumps or shoots again before it has finished.

## Where three.js prints it

`Audio.play()` in `src/audio/Audio.js` (three r186) returns early in two cases before it creates a source node:

```js
play( delay = 0 ) {

	if ( this.isPlaying === true ) {

		warn( 'Audio: Audio is already playing.' );
		return;

	}

	if ( this.hasPlaybackControl === false ) {

		warn( 'Audio: this Audio has no playback control.' );
		return;

	}
```

Past those checks, `play()` creates one `AudioBufferSourceNode`, starts it and sets `isPlaying = true`. The flag goes back to false in three places: `pause()`, `stop()`, and `onEnded()`, which the source node calls when the buffer finishes. An `Audio` object therefore holds exactly one playing sound. While that sound lasts, every other `play()` hits the warning.

## Why play() finds the sound still playing

- **A sound effect replayed faster than it lasts.** A click, a footstep or a gunshot that calls `play()` on the same `Audio` each time is ignored until the previous one ends. A sound with a long tail or silence at the end makes this happen with slow clicking too.
- **`play()` in the animation loop.** Calling it every frame, for example while a key is held, warns on every frame after the first.
- **Autoplay set and `play()` called as well.** With `setAutoplay(true)`, `setBuffer()` already calls `play()`, so a `play()` written after it in the loader callback warns once.
- **A looping sound.** With `setLoop(true)` the source never ends, so `isPlaying` stays true until `stop()` or `pause()`.
- **A suspended AudioContext.** `play()` sets `isPlaying` whatever the context's state, so a sound started on load before any user gesture is counted as playing, is silent, and blocks the `play()` in a later click until the code calls `stop()` and resumes the context.

## A page that reproduces it

The page draws a bell, builds a 1.5 s tone in code into an `AudioBuffer`, and rings one `Audio` on every press of the canvas:

```js
const ring = new THREE.Audio(listener);
ring.setBuffer(buffer);
bell.add(ring);

// ring the bell on every click
renderer.domElement.addEventListener('pointerdown', () => ring.play());
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. The calls below were made on 2026-10-28 with the stable build, on a machine with no GPU; the run folder is written `<project>`, and each reply is cut to the lines discussed, verbatim.

```text
interact {"steps": [{"mouse": "click", "x": 640, "y": 400, "frames": 10}, {"mouse": "click", "x": 640, "y": 400, "frames": 10}]}

{"after":null,"changed":{},"logs":["warn: THREE.Audio: Audio is already playing."]}
Sound: 1 started during these steps.
mouse click at (640, 400): over bell (Mesh, 3.7 units)

observe {}

{"entities":{"bell":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":21,"renderer":{"calls":1,"triangles":24,"textures":1,"geometries":1,"programs":2},"scene":{"objects":3,"meshes":1,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

`interact` clicks the bell twice, 10 frames apart, well inside the tone's length. Its `logs` field carries the console warning from the second click, and the `Sound:` line counts what the page actually started: 1 sound for 2 clicks. The mouse line confirms both clicks landed on the bell, so the input is not the problem. `observe` has an empty `errors` list, since three logs this as a warning; an agent that reads errors and skips the logs would miss it. The replies say a sound started but not whether it was audible: the harness counts started sources, and on a real machine an AudioContext still suspended by the browser's autoplay rule would also start sounds that nobody hears.

## The fix

When each press should restart the sound, call `stop()` before `play()`. When rings should overlap, as a bell's would, keep a few `Audio` objects on the same buffer and use them in turn; the buffer is shared, so the extra objects cost little:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Bell</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);

const listener = new THREE.AudioListener();
camera.add(listener);

// a 1.5 s bell tone made in code, standing in for an AudioLoader result
const ctx = listener.context, seconds = 1.5;
const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < data.length; i++) { const t = i / ctx.sampleRate; data[i] = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-3 * t) * 0.4; }

const bell = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xd4af37, side: THREE.DoubleSide }));
bell.name = 'bell';
scene.add(bell);
// one Audio plays one sound at a time: keep a few, so rings can overlap
const rings = Array.from({ length: 4 }, () => {
  const ring = new THREE.Audio(listener);
  ring.setBuffer(buffer);
  bell.add(ring);
  return ring;
});
let next = 0;

// ring the bell on every click, restarting the oldest ring when all four are sounding
renderer.domElement.addEventListener('pointerdown', () => {
  const ring = rings[next];
  next = (next + 1) % rings.length;
  if (ring.isPlaying) ring.stop();
  ring.play();
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The same two clicks now start two sounds and log nothing:

```text
interact {"steps": [{"mouse": "click", "x": 640, "y": 400, "frames": 10}, {"mouse": "click", "x": 640, "y": 400, "frames": 10}]}

{"after":null,"changed":{}}
Sound: 2 started during these steps.
mouse click at (640, 400): over bell (Mesh, 3.7 units)

eval {"code": "return find(\"bell\").children.map(a => a.isPlaying)"}

[true,true,false,false]
```

Two of the four `Audio` objects are sounding and two wait for the next presses. With four in the pool, a fifth press within the tone's 1.5 s restarts the oldest ring instead of being dropped. For a looping sound such as music or an engine hum, the pattern is the opposite: check `isPlaying` and skip `play()` when it is already true, or call `pause()` and `play()` to resume from where it stopped.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Complex PositionalAudio setup, audio gets out of sync in case of slow connection](https://discourse.threejs.org/t/complex-positionalaudio-setup-audio-gets-out-of-sync-in-case-of-slow-connection/42443) (discourse.threejs.org, 1,111 views, 10 posts)
- [Audio pause not working properly](https://github.com/mrdoob/three.js/issues/11876) (GitHub, 8 comments)
