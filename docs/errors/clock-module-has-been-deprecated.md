---
title: three.js Clock: This module has been deprecated. Please use THREE.Timer instead: moving to Timer
phrase: this module has been deprecated. please use three.timer instead
description: Why three.js prints "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead." from r183 on, the line in Clock.js that prints it when a Clock is made, how THREE.Timer replaces getDelta and getElapsedTime, and how the paprika3d plugin's open reply lists the warning.
meta: three.js "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead": what triggers it and how to fix it.
intent: error-clock-deprecated
message: THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
queries:
  - "R183.0 Only - AudioListener Generates Clock Error Notice"
  - "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead."
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.

three.js prints this warning each time a `THREE.Clock` is constructed. Clock still works in r186: its `getDelta()` and `getElapsedTime()` return what they always did, and nothing on screen changes. The warning is notice that the class is on its way out, with `THREE.Timer` as its replacement. Moving takes a few lines, and it also fixes two habits of Clock that cause animation bugs.

## Where three.js prints it

The constructor of `Clock` in `src/core/Clock.js` (three r186) sets up its fields and then, as its last statement, warns with no condition:

```js
		this.running = false;

		warn( 'Clock: This module has been deprecated. Please use THREE.Timer instead.' ); // @deprecated, r183

	}
```

`warn()` in `src/utils.js` prefixes `THREE.` and calls `console.warn`. The class is marked `@deprecated since r183`, and `src/Three.Core.js` exports both `Clock` and `Timer` from `src/core/`. Since the warning is in the constructor, it is printed once per Clock, usually while the page sets up. The AudioListener thread reports the warning in r183 pages that never made a Clock themselves, from `AudioListener`. In r186, `AudioListener` uses a `Timer` (`this._timer = new Timer()` in `src/audio/AudioListener.js`), so a Clock warning in r186 comes from your code or from an add-on library that still makes one.

## Why Timer replaces it

- **Clock reads the time whenever it is asked.** `getDelta()` calls `performance.now()` on each call, so two parts of a frame that each call `getDelta()` get different values, and the second is close to zero. Timer reads the time once, in `update()`, and every `getDelta()` until the next `update()` returns the same number.
- **getElapsedTime() changes the delta.** Clock's `getElapsedTime()` calls `this.getDelta()` inside, so reading the elapsed time before `getDelta()` in a frame leaves the delta near zero for that frame. Timer's `getElapsed()` reads and changes nothing.
- **A hidden tab gives one huge step.** With Clock, a tab that was in the background for a minute returns a delta of a minute on its first frame back, which can send physics objects through walls. After `timer.connect(document)`, Timer uses the Page Visibility API and gives a delta of 0 while the page is hidden, then resets when it comes back.
- **Timer can use the frame's own time.** `timer.update(timestamp)` takes the timestamp that `requestAnimationFrame` and `setAnimationLoop` pass to their callback, so every system in the frame measures from the same moment.

Timer's `getDelta()` and `getElapsed()` return seconds, as Clock's did, and `setTimescale()` speeds time up or slows it down.

## A page that reproduces it

A torus knot spun by a Clock:

```js
const clock = new THREE.Clock();
const spinner = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16), new THREE.MeshNormalMaterial());
spinner.name = 'spinner';
scene.add(spinner);
renderer.setAnimationLoop(() => { spinner.rotation.y += clock.getDelta(); renderer.render(scene, camera); });
```

paprika3d is a Claude Code plugin and MCP server that loads three.js pages into a headless Chrome it keeps for itself, with the clock paused at frame 0 until a tool advances it. The replies were captured on 2026-10-28 from the stable build on a machine without a GPU; the run folder is printed as `<project>`, and lines that do not bear on this page were cut, the rest left as they were.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:43889/index.html in 0.6 s, paused at frame 0.
three.js warned: THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["spinner"]}

look {}

On screen (1):
spinner 13% [426, 165, 881, 624]
Never visible: none
```

The Clock is made during setup, before the first frame, so `open` reports the warning on its `three.js warned:` line. This is the case where `open` is enough: warnings printed while the page's module runs are collected before the page is paused. `look` then draws the knot normally, and its reply has no trace of the warning, since it lists console errors and not warnings. A Clock created later, for example when a level loads or inside a component that mounts after a click, would warn after `open` has replied; an `eval` that does what the click does lists warnings printed during its code.

## The fix

Make a `Timer`, connect it to the document, and call `update()` once at the start of each frame with the frame's timestamp:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Spinner</title>
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
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 5);
camera.lookAt(0, 0, 0);

const timer = new THREE.Timer();
timer.connect(document); // a hidden tab gives a delta of 0, not one long jump

const spinner = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16), new THREE.MeshNormalMaterial());
spinner.name = 'spinner';
scene.add(spinner);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop((time) => {
  timer.update(time);
  spinner.rotation.y += timer.getDelta();
  renderer.render(scene, camera);
});
</script>
</body></html>
```

The fixed page's replies:

```text
open {"url":"fixed.html","cwd":"<project>"}

Opened http://127.0.0.1:45459/fixed.html in 1.4 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["spinner"]}

look {}

On screen (1):
spinner 13% [393, 166, 843, 588]
Never visible: none
```

The `three.js warned:` line is gone, and the knot is on screen. When the code calls `clock.getElapsedTime()` for a shader's time uniform, the replacement is `timer.getElapsed()` after the frame's `update()`. If the warning comes from a library, check for a release that has moved to Timer; the warning does not change what the library does.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [R183.0 Only - AudioListener Generates Clock Error Notice](https://discourse.threejs.org/t/r183-0-only-audiolistener-generates-clock-error-notice/89980) (discourse.threejs.org, 835 views, 6 posts)
