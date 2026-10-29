---
title: three.js OrbitControls and page scroll on mobile, so a swipe scrolls past the canvas and the wheel scrolls the page
phrase: three.js orbitcontrols and page scroll
description: Why three.js OrbitControls stops a phone page from scrolling past the canvas (it sets touch-action to none) and why the wheel zooms instead of scrolling, a viewer that sleeps until tapped and lets the wheel scroll the page at its zoom limit, and how the paprika3d plugin's interact touch, tap and wheel steps read the page's scroll and the camera's angle together.
meta: three.js OrbitControls and page scroll on mobile: let a swipe scroll past the canvas, tap to turn, and the wheel scroll the page.
intent: orbitcontrols-touch-and-page-scroll
queries:
  - "Three JS - Orbit controls on mobile/touch device"
  - "One finger Panning on touch devices (Orbitcontrols)"
  - "Scroll page when maximum zoom is reached"
  - "Orbit Controls suppress touch events on mobile"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js OrbitControls and page scroll on mobile, so a swipe scrolls past the canvas and the wheel scrolls the page

## Why the page stops scrolling at the canvas

A 3D viewer in the middle of a long page has two jobs for the same finger: scroll the page, and turn the model. OrbitControls takes the second one by default, and takes it for good:

- **On a touch screen**, it sets the canvas's CSS `touch-action` to `none` when it connects. That tells the browser not to scroll for any touch that starts on the canvas, so every swipe there turns the camera, and a visitor whose thumb lands on the model cannot scroll past it.
- **With a mouse wheel**, it calls `preventDefault()` on every wheel event over the canvas and zooms. The page under it never scrolls while the pointer is over the model.

Both are one line each to give back, and both have a cost:

```js
renderer.domElement.style.touchAction = 'pan-y';   // vertical swipes scroll the page again
controls.enableZoom = false;                         // the wheel scrolls the page; no zoom
```

`pan-y` hands vertical swipes to the browser, but OrbitControls still sees the start of each one and turns the camera before the browser takes over, as the second fault below shows. The usual way out is a viewer that sleeps until the visitor asks for it: asleep, the canvas is `pan-y` and the controls are off, so the page scrolls over it; a tap wakes it, and then one finger turns the model until a Done button puts it back to sleep:

```js
function wake(on) {
  controls.enabled = on;
  renderer.domElement.style.touchAction = on ? 'none' : 'pan-y';
}
wake(false);
renderer.domElement.addEventListener('click', () => wake(true));
done.addEventListener('click', () => wake(false));
```

The wheel can share the same way: zoom while awake, and once the camera is at `maxDistance` (or `minDistance`), turn `enableZoom` off for that event so the page scrolls on. OrbitControls returns before `preventDefault()` when `enableZoom` is false, so a wheel listener in the capture phase, which runs before the canvas's own, decides each event.

Which finger does what is `controls.touches`: `{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }` by default, and `ONE: THREE.TOUCH.PAN` makes one finger pan, the question in one of the threads above.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `open` takes a `size` and a `dpr`, so the page can be opened as a phone. `interact` has touch steps (`start`, `move`, `end` and `tap`, one finger) and wheel and scroll steps, which go in as Chrome input, so the browser applies `touch-action` and `preventDefault()` as it would for a person; its reply has a Scroll line with the window's scroll position, beside what changed in the page's state. So one call says both whether the page scrolled and whether the camera turned.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A lamp page with a sleeping viewer

A product page: an intro section, a viewer 420 pixels tall with a lamp in OrbitControls, and a specs section. The viewer starts asleep. A tap wakes it, and a Done button over the canvas puts it to sleep again. The Done button has `touch-action: manipulation`, so its tap is not held back while the browser waits to see whether a second tap makes a double-tap zoom. `observe()` returns whether the viewer is awake, the page's `scrollY`, the camera's polar angle and distance, and how many wheel events zoomed the camera or passed to the page.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lamp</title>
<style>
body{margin:0;font:17px/1.5 sans-serif;color:#222;background:#f6f4f0}
section{min-height:900px;padding:24px;box-sizing:border-box}
#viewer{position:relative;height:420px;background:#e6e2da}
#viewer canvas{display:block;width:100%;height:100%}
#hint{position:absolute;left:0;right:0;bottom:12px;text-align:center;font-size:14px;color:#555;pointer-events:none}
#done{position:absolute;top:10px;right:10px;padding:6px 12px;border:0;border-radius:6px;background:#222;color:#fff;font:inherit;display:none;touch-action:manipulation}
#viewer.awake #done{display:block}
#viewer.awake #hint{display:none}
</style></head>
<body>
<section id="intro"><h1>Desk lamp</h1><p>Scroll down to turn it in 3D.</p></section>
<div id="viewer"><p id="hint">Tap to turn the lamp</p><button id="done">Done</button></div>
<section id="specs"><h2>Specs</h2><p>Aluminium arm, linen shade.</p></section>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const box = document.getElementById('viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(box.clientWidth, box.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
box.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe6e2da);
const camera = new THREE.PerspectiveCamera(40, box.clientWidth / box.clientHeight, 0.1, 50);
camera.position.set(0, 4.6, 4.2);
scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 2.5));

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
const lamp = new THREE.Group();
lamp.name = 'lamp';
const part = (name, geo, color, x, y, rz = 0) => {
  const m = new THREE.Mesh(geo, mat(color));
  m.name = name;
  m.position.set(x, y, 0);
  m.rotation.z = rz;
  lamp.add(m);
};
part('lamp_base', new THREE.CylinderGeometry(0.6, 0.7, 0.15, 32), 0x333333, 0, 0.08);
part('lamp_arm', new THREE.CylinderGeometry(0.05, 0.05, 2, 12), 0xb0b4ba, 0.35, 1.05, -0.35);
part('lamp_shade', new THREE.ConeGeometry(0.55, 0.7, 32, 1, true), 0xe8d8b0, 0.75, 2.05, 0.6);
scene.add(lamp);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.minDistance = 3;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI / 2;
controls.update();

// Asleep, the viewer leaves every touch and wheel to the page: OrbitControls sets the canvas's touch-action to
// none when it connects, so a swipe over the canvas never scrolls; pan-y gives vertical swipes back to the browser.
// A tap wakes it: then one finger turns the lamp, and Done puts it back to sleep.
let awake = false;
function wake(on) {
  awake = on;
  controls.enabled = on;
  renderer.domElement.style.touchAction = on ? 'none' : 'pan-y';
  box.classList.toggle('awake', on);
}
wake(false);
renderer.domElement.addEventListener('click', () => wake(true));
document.getElementById('done').addEventListener('click', () => wake(false));

// Awake, the wheel zooms until the distance limit, then scrolls the page: OrbitControls cancels the page's scroll
// for every wheel event it zooms with, and leaves the event alone while enableZoom is false. This runs before it.
box.addEventListener('wheel', (e) => {
  const d = controls.getDistance();
  controls.enableZoom = awake && !(e.deltaY > 0 && d >= controls.maxDistance - 0.01) && !(e.deltaY < 0 && d <= controls.minDistance + 0.01);
}, { capture: true });
// after OrbitControls has seen the event: did it zoom (and cancel the page's scroll), or pass it to the page?
const wheel = { zoomed: 0, passed: 0 };
addEventListener('wheel', (e) => { wheel[e.defaultPrevented ? 'zoomed' : 'passed']++; }, { passive: true });

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  renderer.setSize(box.clientWidth, box.clientHeight);
  camera.aspect = box.clientWidth / box.clientHeight;
  camera.updateProjectionMatrix();
});

const deg = (a) => Math.round(THREE.MathUtils.radToDeg(a));
window.__game = {
  subject: 'lamp',
  describe: () => ({ name: 'lamp page', viewer: 'asleep until tapped; Done puts it back' }),
  observe: () => ({ awake, scrollY: Math.round(scrollY), polar: deg(controls.getPolarAngle()), azimuth: deg(controls.getAzimuthalAngle()), distance: +controls.getDistance().toFixed(2), wheel }),
  setState: (s) => { if (s.awake !== undefined) wake(s.awake); if (s.wheel) Object.assign(wheel, s.wheel); },
};
</script>
</body></html>
```

## A swipe over the sleeping viewer, then over the awake one

The calls below were made on 2026-10-28. Run folder paths are left out and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times. Each play scrolls the window to 700 pixels, which puts the viewer across the middle of the phone's screen, then swipes up from 550 to 350, a stroke that starts and ends on the canvas. The finger rests 20 frames before it lifts, so the page does not keep gliding after it.

```text
open {"url": "index.html", "cwd": "<project>", "size": [390, 844], "dpr": 3}

Opened http://127.0.0.1:45257/index.html at 390 × 844, DPR 3 in 0.2 s, paused at frame 0.

interact {"steps": [{"scroll": 700}, {"wait": 30}, {"touch": "start", "x": 195, "y": 550}, {"touch": "move", "x": 195, "y": 500}, {"touch": "move", "x": 195, "y": 450}, {"touch": "move", "x": 195, "y": 400}, {"touch": "move", "x": 195, "y": 350}, {"wait": 20}, {"touch": "end", "x": 195, "y": 350}, {"wait": 20}], "trace": ["scrollY", "polar"]}

{"changed":{"scrollY":885}}
Scroll: 885 of 1376 px (64%)
scrollY: 0 → 885 at frame 36; first changed at frame 1
polar: 50 throughout the 77 frames
```

Asleep, the swipe scrolls the page from 700 to 885 and the camera's polar angle stays at 50 degrees for all 77 frames: the page moved and the lamp did not. Then a tap on the canvas and the same swipe:

```text
interact {"steps": [{"scroll": 700}, {"wait": 30}, {"touch": "tap", "x": 195, "y": 400}, {"wait": 2}, {"touch": "start", "x": 195, "y": 550}, {"touch": "move", "x": 195, "y": 500}, {"touch": "move", "x": 195, "y": 450}, {"touch": "move", "x": 195, "y": 400}, {"touch": "move", "x": 195, "y": 350}, {"wait": 20}, {"touch": "end", "x": 195, "y": 350}, {"wait": 20}], "trace": ["scrollY", "polar"]}

{"changed":{"awake":true,"scrollY":700,"polar":90}}
Scroll: 700 of 1376 px (51%)
polar: 50 → 90 at frame 36; first changed at frame 36
```

Awake, the page stays at 700 and the camera turns from 50 to 90 degrees, where `maxPolarAngle` holds it level with the lamp. A tap on Done at its centre, then the swipe again:

```text
interact {"steps": [{"touch": "tap", "x": 348, "y": 229}, {"wait": 2}, {"touch": "start", "x": 195, "y": 550}, {"touch": "move", "x": 195, "y": 500}, {"touch": "move", "x": 195, "y": 450}, {"touch": "move", "x": 195, "y": 400}, {"touch": "move", "x": 195, "y": 350}, {"wait": 20}, {"touch": "end", "x": 195, "y": 350}, {"wait": 20}], "trace": ["scrollY", "polar"]}

{"changed":{"awake":false,"scrollY":885}}
scrollY: 700 → 885 at frame 8; first changed at frame 6
polar: 90 throughout the 49 frames
```

Asleep again: the page scrolls to 885 and the camera stays where the visitor left it.

## The wheel on a laptop

The same page at the default 1280 × 800, with one wheel step over the sleeping viewer, then five over the awake one:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:38865/index.html in 0.1 s, paused at frame 0.

interact {"steps": [{"state": {"awake": false, "wheel": {"zoomed": 0, "passed": 0}}}, {"scroll": 700}, {"wait": 30}, {"wheel": 300, "x": 640, "y": 400}, {"wait": 10}], "trace": ["distance", "wheel.passed"]}

{"changed":{"scrollY":1000,"wheel":{"passed":1}}}
Scroll: 1000 of 1420 px (70%)
distance: 5.47 throughout the 42 frames
wheel.passed: 0 → 1 at frame 32; first changed at frame 32

interact {"steps": [{"state": {"awake": true, "wheel": {"zoomed": 0, "passed": 0}}}, {"scroll": 700}, {"wait": 30}, {"wheel": 300, "x": 640, "y": 400}, {"wheel": 300, "x": 640, "y": 400}, {"wheel": 300, "x": 640, "y": 400}, {"wheel": 300, "x": 640, "y": 400}, {"wheel": 300, "x": 640, "y": 400}, {"wait": 10}], "trace": ["distance", "wheel.zoomed", "wheel.passed"]}

{"changed":{"awake":true,"distance":9,"wheel":{"zoomed":4}}}
Scroll: 1000 of 1420 px (70%)
distance: 5.47 → 9 at frame 35; first changed at frame 32
wheel.zoomed: 0 → 4 at frame 35; first changed at frame 32
wheel.passed: 0 → 1 at frame 36; first changed at frame 36
```

Asleep, the wheel scrolls the page 300 pixels and the distance does not change. Awake, the first four wheel steps zoom the camera out to `maxDistance`'s 9, and the fifth passes to the page, which scrolls to 1000: zoom first, then the page, with no step lost in between. The counts come from the page's own wheel listener on `window`, which reads `defaultPrevented` after OrbitControls has seen each event.

## Fault 1: OrbitControls as it comes

The same page with the sleep code taken out of `wake()` and the wheel listener removed, so OrbitControls keeps the canvas's `touch-action: none` and zooms on every wheel event:

```text
interact {"steps": [{"scroll": 700}, {"wait": 30}, {"touch": "start", "x": 195, "y": 550}, {"touch": "move", "x": 195, "y": 500}, {"touch": "move", "x": 195, "y": 450}, {"touch": "move", "x": 195, "y": 400}, {"touch": "move", "x": 195, "y": 350}, {"wait": 20}, {"touch": "end", "x": 195, "y": 350}, {"wait": 20}], "trace": ["scrollY", "polar"]}

{"changed":{"scrollY":700,"polar":90}}
Scroll: 700 of 1376 px (51%)
polar: 50 → 90 at frame 33; first changed at frame 33

interact {"steps": [{"scroll": 700}, {"wait": 30}, {"wheel": 300, "x": 640, "y": 400}, {"wait": 10}], "trace": ["distance", "wheel.zoomed", "wheel.passed"]}

{"changed":{"scrollY":700,"distance":6.38,"wheel":{"zoomed":1}}}
Scroll: 700 of 1376 px (51%)
distance: 5.47 → 6.38 at frame 32; first changed at frame 32
```

The swipe turns the camera and the page stays at 700: a visitor scrolling with a thumb on the lamp is stuck there. On the laptop the wheel zooms the camera out and the page does not move. This is "Orbit Controls suppress touch events on mobile" in two numbers.

## Fault 2: pan-y alone

The same page with `touch-action` set to `pan-y` while asleep, and the controls left on:

```text
interact {"steps": [{"scroll": 700}, {"wait": 30}, {"touch": "start", "x": 195, "y": 550}, {"touch": "move", "x": 195, "y": 500}, {"touch": "move", "x": 195, "y": 450}, {"touch": "move", "x": 195, "y": 400}, {"touch": "move", "x": 195, "y": 350}, {"wait": 20}, {"touch": "end", "x": 195, "y": 350}, {"wait": 20}], "trace": ["scrollY", "polar"]}

{"changed":{"scrollY":885,"polar":90}}
Scroll: 885 of 1376 px (64%)
polar: 50 → 90 at frame 33; first changed at frame 33
```

The page scrolls to 885, as asked, and the camera turns from 50 to 90 degrees on the same swipe. OrbitControls reads the first moves of the gesture before the browser starts the scroll and cancels the pointer, so each scroll that starts on the canvas also tilts the model. With the controls off while asleep, the angle stays at 50.

## Keep both behaviours as checks

```text
interact {"steps": [{"scroll": 700}, {"wait": 30}, {"touch": "start", "x": 195, "y": 550}, {"touch": "move", "x": 195, "y": 500}, {"touch": "move", "x": 195, "y": 450}, {"touch": "move", "x": 195, "y": 400}, {"touch": "move", "x": 195, "y": 350}, {"wait": 20}, {"touch": "end", "x": 195, "y": 350}, {"wait": 20}], "expect": {"scrollY": [800, 1376], "polar": 50}, "save": "swipe-scrolls-page"}

Expect: scrollY 885 ✓ · polar 50 ✓
Saved check "swipe-scrolls-page" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

interact {"steps": [{"scroll": 700}, {"wait": 30}, {"touch": "tap", "x": 195, "y": 400}, {"wait": 2}, {"touch": "start", "x": 195, "y": 550}, {"touch": "move", "x": 195, "y": 500}, {"touch": "move", "x": 195, "y": 450}, {"touch": "move", "x": 195, "y": 400}, {"touch": "move", "x": 195, "y": 350}, {"wait": 20}, {"touch": "end", "x": 195, "y": 350}, {"wait": 20}], "expect": {"awake": true, "scrollY": 700, "polar": 90}, "save": "tap-then-turn"}

Expect: awake true ✓ · scrollY 700 ✓ · polar 90 ✓
Saved check "tap-then-turn" in game-tests.json (2 checks now); `test` reruns them all, each from a fresh reload.

test {}

✓ swipe-scrolls-page
✓ tap-then-turn
2 of 2 saved checks passed in 3.9 s
```

The page scroll is a range, from 800 to the bottom: Chrome scrolls on real time, outside the paused clock, so how far a swipe carries the page can differ by a few pixels from run to run. `test` on the page with fault 1, then fault 2:

```text
test {}

✗ swipe-scrolls-page: scrollY 700, expected 800 to 1376; polar 90, expected 50
✓ tap-then-turn
1 of 2 saved checks passed in 2.7 s

test {}

✗ swipe-scrolls-page: polar 90, expected 50
✓ tap-then-turn
1 of 2 saved checks passed in 2.9 s
```

Fault 1 fails on both values, fault 2 on the angle alone, and the awake check passes on both, since the faults are in the sleeping viewer.

## What to read in the replies

- The Scroll line beside the `changed` line: where the window is after the gesture, and what the page's own state did. A swipe should move one of them, never both.
- The `polar` (or azimuth) trace: "throughout" is a camera the swipe did not touch.
- The wheel counts from `defaultPrevented`: how many wheel events the controls took and how many reached the page.
- A line naming an element the gesture landed on instead of the canvas: an overlay that takes the touch before the viewer does.

## Pitfalls

- **A full-screen canvas with `touch-action: none` traps the page.** With the viewer awake there is no room on the screen to swipe beside it. Keep the canvas shorter than the screen, or put the viewer back to sleep when it scrolls out of view.
- **Tap, not touch, to wake.** A wake on `pointerdown` fires at the start of every scroll that begins on the canvas. A `click` comes after a touch that did not move.
- **Two-finger zoom with `pan-y`.** `pan-y` lets the browser take vertical pans and leaves pinches to the page, which is what OrbitControls' two-finger dolly needs; `pan-y pinch-zoom` would hand pinches to the browser's page zoom instead.
- **A tap during a glide stops the glide.** A tap that lands while the page is still moving after a fast swipe ends the movement and sends no click, so a wake tap right after a scroll can do nothing. That is the browser, on a phone too; a play that taps after a swipe waits for the page to stop first.
- **Ctrl and the wheel.** A trackpad's pinch arrives as a wheel event with `ctrlKey` set, which OrbitControls zooms with. A page that scrolls on the plain wheel can still zoom on the pinch by checking `ctrlKey` in the capture listener.

## What paprika3d does not do

It does not choose between a sleeping viewer and an always-on one: it plays the gestures and reports what the page and the camera did. Its touch steps are one finger in Chrome's input, on a desktop Chrome told the phone's size and pixel ratio; it does not run Safari or a real phone, so iOS's own scrolling and its gestures stay on the device. It plays no two-finger gesture, so pinch zoom and `TOUCH.DOLLY_PAN` are not checked here. Page scroll runs on Chrome's real time, which is why the checks take a range for `scrollY`.

## Without paprika3d

On a phone, open the page and try the three gestures: a swipe starting on the canvas, a tap and a swipe, a swipe after Done. Chrome's device toolbar in desktop Chrome sends touch events too, and logging `scrollY` and `controls.getPolarAngle()` on each `touchend` gives the same two numbers this guide reads. Reading `getComputedStyle(renderer.domElement).touchAction` after the controls are made shows whether something set it back to `none`.
