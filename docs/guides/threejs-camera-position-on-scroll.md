---
title: three.js change camera position on scroll, and check where the camera is at every stop
phrase: three.js change camera position on scroll
description: How to move a three.js camera as the page scrolls (scroll progress from 0 to 1 mapped to camera stops, turned around the subject), the same shape in GSAP ScrollTrigger and drei ScrollControls, and two faults the paprika3d plugin's look scroll grid and interact scroll steps catch on a real page, a camera that passes through the product and one that never reaches the last stop.
meta: three.js change camera position on scroll: map scroll progress to camera stops, and check where the camera is at every stop.
intent: scroll-camera-animation
queries:
  - "Three.js: Change camera position on page scroll"
  - "Three.js + Gsap ScrollTrigger"
  - "How to change camera position on scroll in react-three-fibre?"
  - "Play animation with scroll"
  - "3D Scroll-Based Product Landing-Page"
  - "How can I recreate this scroll-wheel camera animation"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js change camera position on scroll, and check where the camera is at every stop

## Scroll progress in, camera position out

A scroll-driven 3D page has a canvas fixed behind the text and a camera that moves as the reader scrolls. The whole technique is one function from a number to a camera: the scroll progress, 0 at the top of the page and 1 at the bottom, in; the camera's position and what it looks at, out. Read the progress every frame and place the camera from it:

```js
const progress = () => {
  const max = document.documentElement.scrollHeight - innerHeight;   // how far the page can scroll
  return max > 0 ? THREE.MathUtils.clamp(scrollY / max, 0, 1) : 0;
};

const target = new THREE.Vector3(0, 1.2, 0);
const stops = [                                  // one per section; section i is at progress i / (stops.length - 1)
  { theta: 0, phi: 1.5, radius: 6 },             // front
  { theta: Math.PI, phi: 1.5, radius: 6 },       // back
  { theta: Math.PI, phi: 0.3, radius: 4.5 },     // top
];
const sph = new THREE.Spherical(), lerp = THREE.MathUtils.lerp;

function placeCamera(p) {
  const f = p * (stops.length - 1), i = Math.min(Math.floor(f), stops.length - 2);
  const t = THREE.MathUtils.smoothstep(f - i, 0, 1), a = stops[i], b = stops[i + 1];
  sph.set(lerp(a.radius, b.radius, t), lerp(a.phi, b.phi, t), lerp(a.theta, b.theta, t));
  camera.position.setFromSpherical(sph).add(target);
  camera.lookAt(target);
}

renderer.setAnimationLoop(() => {
  placeCamera(progress());
  renderer.render(scene, camera);
});
```

Three choices in it decide whether the camera ends up where the design says:

- **The scroll range is the page's height minus the window's.** At the bottom of the page `scrollY` equals `scrollHeight - innerHeight`, not `scrollHeight`. Divide by the wrong one and the progress never reaches 1.
- **Stops are angles around the subject, not points.** Interpolating `theta` (around the vertical axis, 0 at the front), `phi` (down from straight above) and the distance turns the camera around the product. Interpolating two positions moves it along the straight line between them, which for a front view and a back view runs through the product.
- **The frame reads the scroll; the scroll event does not move the camera.** The same scroll position always gives the same picture, whatever the frame rate, and a page reloaded half way down starts in the right place. Smoothing, if you want it, is a lerp of the progress toward its target each frame, kept apart from the mapping.

The same function works under a scroll library, which then supplies the progress. These two sketches show the shape; this guide did not run them, since neither library is installed here.

```js
// GSAP ScrollTrigger: the trigger spans the whole page, so self.progress is 0 at the top and 1 at the bottom.
ScrollTrigger.create({
  trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => placeCamera(self.progress),
});
```

```jsx
// React Three Fiber with drei: scroll.offset is the same 0 to 1 progress over the ScrollControls pages.
function CameraRig() {
  const scroll = useScroll();
  useFrame(() => placeCamera(scroll.offset)); // placeCamera written against the R3F camera from useThree
  return null;
}
// <ScrollControls pages={3}><CameraRig /><Speaker /></ScrollControls>
```

With `scrub: true` the camera follows the scrollbar exactly; `scrub: 1` makes it trail by a second, so a picture taken right after a scroll shows it between stops. Lenis replaces the page's scrolling with a smoothed one and still moves `scrollY`, so the plain `progress()` above keeps working under it.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `look` with `scroll` takes a list of stops as shares of the scroll range and pictures each on a fresh reload in one labelled grid, with the camera's position, the direction it looks along and the objects on screen at each stop. `interact` has a scroll step that scrolls the window by pixels, to a share of the range, or to an element, then steps the page a frame and returns what changed in its state, and a wheel step that sends a mouse wheel. The tool description says a scroll step also reports the progress of Lenis, ScrollTrigger or drei ScrollControls when it finds one; the page here uses none of them, so that line does not appear below.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A product page that turns on scroll

A speaker page with three sections, each the height of the window: the front with its blue grille, the back with its red port, and the top with four buttons. The canvas is fixed behind the text. The camera starts in front, turns around to the back by the middle of the page, and rises over the top at the end. `window.__game.subject` names the speaker, and `observe()` returns the scroll position, the progress and the camera position, so each scroll step's reply says where the camera went.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Speaker</title>
<style>
html,body{margin:0;background:#15181d;color:#fff;font:18px sans-serif}
canvas{position:fixed;inset:0;display:block}
section{position:relative;height:100vh;padding:40px;box-sizing:border-box;max-width:320px}
</style></head>
<body>
<section id="front"><h2>Front</h2><p>A grille that covers the full height.</p></section>
<section id="back"><h2>Back</h2><p>One port, one switch.</p></section>
<section id="top"><h2>Top</h2><p>Four buttons under your thumb.</p></section>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15181d);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 3));

// The product: a speaker 2.4 units tall, with a grille on the front, a port on the back and buttons on top.
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
const speaker = new THREE.Group();
speaker.name = 'speaker';
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.4, 48), mat(0x30343c));
body.name = 'body';
body.position.y = 1.2;
const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 2, 48, 1, true, -Math.PI / 3, (2 * Math.PI) / 3), mat(0x4a90d9));
grille.name = 'grille';
grille.position.y = 1.2;
const port = new THREE.Mesh(new THREE.CircleGeometry(0.25, 32), mat(0xe05040));
port.name = 'port';
port.position.set(0, 0.8, -0.91);
port.rotation.y = Math.PI;
speaker.add(body, grille, port);
for (let i = 0; i < 4; i++) {
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 24), mat(0xf0c040));
  button.name = 'button' + i;
  button.position.set(Math.cos(i * Math.PI / 2) * 0.45, 2.43, Math.sin(i * Math.PI / 2) * 0.45);
  speaker.add(button);
}
scene.add(speaker);

// The camera's stops, one per section, as angles around the speaker: theta turns around it (0 is the front),
// phi is the angle down from straight above, radius the distance. Section i is at progress i / (stops - 1).
const target = new THREE.Vector3(0, 1.2, 0);
const stops = [
  { theta: 0, phi: 1.5, radius: 6 },          // #front
  { theta: Math.PI, phi: 1.5, radius: 6 },    // #back
  { theta: Math.PI, phi: 0.3, radius: 4.5 },  // #top
];
const sph = new THREE.Spherical(), lerp = THREE.MathUtils.lerp;

// Scroll progress, 0 at the top of the page and 1 at the bottom: the scroll position over the distance it can scroll.
const progress = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? THREE.MathUtils.clamp(scrollY / max, 0, 1) : 0;
};

function placeCamera(p) {
  const f = p * (stops.length - 1), i = Math.min(Math.floor(f), stops.length - 2);
  const t = THREE.MathUtils.smoothstep(f - i, 0, 1), a = stops[i], b = stops[i + 1];
  // Turn around the speaker rather than move in a straight line, so the camera never passes through it.
  sph.set(lerp(a.radius, b.radius, t), lerp(a.phi, b.phi, t), lerp(a.theta, b.theta, t));
  camera.position.setFromSpherical(sph).add(target);
  camera.lookAt(target);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  placeCamera(progress()); // read the scroll every frame: no scroll listener, no time, the same picture for the same scroll
  renderer.render(scene, camera);
});

window.__game = {
  subject: 'speaker',
  describe: () => ({ name: 'speaker page', scroll: 'the camera turns from the front to the back, then rises over the top' }),
  observe: () => ({
    scrollY: Math.round(scrollY),
    progress: +progress().toFixed(3),
    camera: camera.position.toArray().map((n) => +n.toFixed(2)),
  }),
};
</script>
</body></html>
```

## Every stop in one call

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:38125/index.html in 0.1 s, paused at frame 0.
Page text outside the canvas: 0 h1, 3 h2, 19 words

look {"scroll": [0, 0.25, 0.5, 0.75, 1]}

Picture: <project>/paprika3d/runs/2026-10-28T06-48-26-581Z/look-6-scroll.png (5 scroll stops, left to right, top to bottom, each on a fresh reload); the game is reloaded at its first frame
0 of 1600 px (0%): camera [0, 1.62, 5.98] looking along [0, -0.07, -1]; on screen: grille, body, button1
400 of 1600 px (25%): camera [5.98, 1.62, 0] looking along [-1, -0.07, 0]; on screen: body, grille, button0
800 of 1600 px (50%): camera [0, 1.62, -5.98] looking along [0, -0.07, 1]; on screen: body, port, button3
1200 of 1600 px (75%): camera [0, 4.46, -4.11] looking along [0, -0.62, 0.78]; on screen: body, port, button* ×4
1600 of 1600 px (100%): camera [0, 5.5, -1.33] looking along [0, -0.96, 0.3]; on screen: body, button* ×4, port
```

Each line can be checked against the stops in the code. At 0% the camera is 6 units in front (`z` 5.98) and sees the grille. At 25% it has turned a quarter of the way round to the right side (`x` 5.98) and still sees the edge of the grille. At 50%, the top of the `#back` section, it is behind the speaker (`z` -5.98) and sees the port. At 75% it is half way up, and at 100% it looks almost straight down (`looking along [0, -0.96, 0.3]`) at the four buttons. The page scrolls 1600 px in all: three sections of 800 px in a window 800 px tall.

`interact` checks one position at a time and returns the state the page holds there:

```text
interact {"steps": [{"scroll": {"to": "#back"}}]}

{"changed":{"scrollY":800,"progress":0.5,"camera":[0,1.62,-5.98]}}
Scroll: 800 of 1600 px (50%)

interact {"steps": [{"scroll": 600}]}

{"changed":{"scrollY":600,"progress":0.375,"camera":[2.82,1.62,-5.28]}}
Scroll: 600 of 1600 px (38%)

interact {"steps": [{"scroll": 0}, {"wheel": 800}, {"wait": 10}]}

{"changed":{"scrollY":800,"progress":0.5,"camera":[0,1.62,-5.98]}}
Scroll: 800 of 1600 px (50%)
```

A scroll to `#back` lands on progress 0.5, the back stop, as the section's place in the page says it should. A scroll to 600 px lands between the side and the back. A wheel of 800 from the top reaches the same place as scrolling to `#back`. The clock stays paused between calls, so each reply is the page one frame after the scroll, and nothing moves while the agent reads it.

## Fault 1: the camera passes through the product

The same page with the stops turned into positions and the camera moved along the straight line between them:

```js
const from = new THREE.Vector3().setFromSpherical(sph.set(a.radius, a.phi, a.theta)).add(target);
const to = new THREE.Vector3().setFromSpherical(sph.set(b.radius, b.phi, b.theta)).add(target);
camera.position.lerpVectors(from, to, t);
```

```text
look {"scroll": [0, 0.25, 0.5, 0.75, 1]}

0 of 1600 px (0%): camera [0, 1.62, 5.98] looking along [0, -0.07, -1]; on screen: grille, body, button1
400 of 1600 px (25%): camera [0, 1.62, 0] looking along [0, -1, 0]; on screen: nothing
800 of 1600 px (50%): camera [0, 1.62, -5.98] looking along [0, -0.07, 1]; on screen: body, port, button3
1200 of 1600 px (75%): camera [0, 3.56, -3.66] looking along [0, -0.54, 0.78]; on screen: body, port, button* ×4
1600 of 1600 px (100%): camera [0, 5.5, -1.33] looking along [0, -0.96, 0.3]; on screen: body, button* ×4, port
```

The stops at 0%, 50% and 100% are where they were, so a check of the sections alone passes. Between the front and the back the camera goes straight through the speaker: at 25% it is at `[0, 1.62, 0]`, on the speaker's axis and inside its body, looking straight down at the target below it, with nothing on screen. A reader scrolling past the first section sees the product vanish for a moment. A plain look at that position says why:

```text
interact {"steps": [{"scroll": {"progress": 0.25}}], "look": true}

{"changed":{"scrollY":400,"progress":0.25,"camera":[0,1.62,0]}}
Scroll: 400 of 1600 px (25%)
Subject: speaker drew no pixel; 0 of its 7 named parts show; in view but covered: body, grille.
On screen (0):
```

From inside a closed mesh the camera sees its back faces, which three.js does not draw by default, so the speaker draws no pixel at all. Turning around the target by angle, as the page at the top does, keeps the camera at its distance the whole way. A path that moves straight toward or away from the model, or one that clears it, can use straight lines; the grid at 25% and 75% is where to see whether a path clears it.

## Fault 2: the camera never reaches the last stop

The same page with the scroll range measured as the page's full height:

```js
const max = document.body.scrollHeight;   // the page's height, not how far it can scroll
```

```text
look {"scroll": [0, 0.25, 0.5, 0.75, 1]}

0 of 1600 px (0%): camera [0, 1.62, 5.98] looking along [0, -0.07, -1]; on screen: grille, body, button1
400 of 1600 px (25%): camera [4.35, 1.62, 4.11] looking along [-0.73, -0.07, -0.68]; on screen: grille, body
800 of 1600 px (50%): camera [4.35, 1.62, -4.11] looking along [-0.73, -0.07, 0.68]; on screen: body, port, grille
1200 of 1600 px (75%): camera [0, 1.62, -5.98] looking along [0, -0.07, 1]; on screen: body, port, button3
1600 of 1600 px (100%): camera [0, 3.29, -5.21] looking along [0, -0.37, 0.93]; on screen: body, port, button* ×4
```

Every stop is behind where it should be. The back view, meant for 50%, arrives at 75%, and at the bottom of the page the camera is still low and behind the speaker (`y` 3.29, looking along a direction that is mostly level) instead of over the top looking down. The `#top` section's text says "Four buttons under your thumb" over a side view. The state shows the cause in one call each:

```text
interact {"steps": [{"scroll": {"to": "#back"}}]}

{"changed":{"scrollY":800,"progress":0.333,"camera":[4.35,1.62,-4.11]}}
Scroll: 800 of 1600 px (50%)

interact {"steps": [{"scroll": {"progress": 1}}]}

{"changed":{"scrollY":1600,"progress":0.667,"camera":[0,3.29,-5.21]}}
Scroll: 1600 of 1600 px (100%)
```

The scroll step says the window is at 1600 of 1600 px, the bottom, while the page's own progress reads 0.667. The page is three windows tall and can scroll two of them, and two over three is 0.667. Subtract `innerHeight`, as the page at the top does. The same fault comes from a ScrollTrigger whose `end` is `'bottom top'`: the trigger then ends when the page's bottom reaches the window's top, which a page that ends with its last section never scrolls to.

## What to read in the replies

- `look` with `scroll`, one line per stop: the scroll position in pixels and as a share, the camera's position, the direction it looks along, and the objects on screen. A stop with `on screen: nothing` is a moment the reader sees an empty scene.
- The grid's picture: each stop as the reader sees it, with the page's text over the canvas.
- `interact`, the line that starts with Scroll: where the window is, from the browser. The `changed` line: what the page made of it. When the two disagree (100% against a progress of 0.667), the mapping is wrong.
- The Subject line in a look after a scroll step: how much of the product drew and what covers it.

## Pitfalls

- **Pick stops between sections.** The sections' own positions are the points the design was drawn at; faults live between them. Put 0.25 and 0.75 in the list, or more stops for more sections (up to nine in one grid).
- **A smoothed camera trails the scroll.** If the page lerps the camera toward its target each frame, or uses `scrub` with a number, one frame after a scroll it is still on its way. Add a `wait` step after the scroll in `interact` to see where it settles.
- **`scroll-behavior: smooth` in CSS** makes `scrollTo` animate, so code that scrolls the page and reads the camera at once reads it mid-way.
- **Resize changes the range.** The scroll range is measured in pixels, so a page whose section heights depend on the window has a different range on a phone. Read `scrollHeight` each frame, as `progress()` does, rather than once at load.
- **Text over the subject.** A fixed canvas under scrolling text can put a paragraph across the product at some stop; the grid's picture shows each stop with its text.

## What paprika3d does not do

It does not write the camera path or choose the stops; it reports where the camera is at each scroll position and what is on screen, and the agent changes the code. It pictures stops one frame after the scroll, so a smoothed camera is shown on its way unless the agent waits. Its scroll step and the `look` scroll stops move the window. drei's ScrollControls scrolls an element of its own, which a window scroll does not move; the scroll step's reply says so when it finds one, and a wheel step over the canvas sends what a reader's mouse wheel would. Lenis is reported when its instance is kept on `window` (`window.lenis = new Lenis()`). The page in this guide uses no library, so none of those lines appear here. It does not judge whether a camera move feels good to a reader.

## Without paprika3d

Log `scrollY`, `document.documentElement.scrollHeight - innerHeight` and the computed progress in the frame loop, then scroll to the bottom by hand: the progress should read 1 there. Draw the camera's path in the scene to see whether it crosses the product: sample `placeCamera` at a hundred progress values into a `THREE.Line`, and look at the scene from a second camera. GSAP's `markers: true` on a ScrollTrigger shows where its start and end sit on the page. To see a stop again, scroll back to it: when the frame reads the scroll, as the page above does, the same scroll position always gives the same picture.
