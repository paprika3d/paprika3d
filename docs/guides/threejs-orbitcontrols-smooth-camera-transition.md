---
title: three.js smooth camera transition with OrbitControls, without a snap at the end or a jump at the start
phrase: three.js smooth camera transition
description: How to move a three.js camera smoothly to a new object with OrbitControls by tweening the camera and the controls' target together (with your own tween or GSAP), how to change the orbit centre, and how the paprika3d plugin's look cameras grid and an interact trace of the camera's per-frame turn show the end framing first and catch a snap at the end or a jump at the start.
meta: three.js smooth camera transition with OrbitControls: tween the camera and the target together, and catch the snap at the end.
intent: orbit-camera-smooth-transition
queries:
  - "[SOLVED]How to add smooth transition to three.js orbital camera?"
  - "how to set the first lookAt/target of a Control"
  - "Three.js | OrbitControls | How to change center?"
  - "Need help with gsap camera and OrbitControls animations"
  - "How to make a camera transition to a different point"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js smooth camera transition with OrbitControls, without a snap at the end or a jump at the start

## The target moves with the camera

OrbitControls owns where the camera looks. Each call to `controls.update()` puts the camera at its distance and angles around `controls.target` and ends with `camera.lookAt(controls.target)`, whether the controls are enabled or not. So the orbit centre is `controls.target`, and changing the centre is moving it, then calling `update()`:

```js
controls.target.set(4, 0.6, 0);   // the new centre, or the first one before the first frame
controls.update();
```

A smooth transition is the same thing spread over frames: move the camera's position and the target together, from where they are now to where they should end, and let `update()` aim the camera each frame:

```js
function focusOn(object) {
  const goal = goalFor(object);   // { position, target }: where the camera ends and the point it orbits
  tween = { t: 0, duration: 1, from: camera.position.clone(), fromTarget: controls.target.clone(), ...goal };
}

// in the frame loop, with dt the seconds since the last frame
if (tween) {
  tween.t = Math.min(tween.t + dt / tween.duration, 1);
  const e = THREE.MathUtils.smootherstep(tween.t, 0, 1);
  camera.position.lerpVectors(tween.from, tween.position, e);
  controls.target.lerpVectors(tween.fromTarget, tween.target, e);
  if (tween.t === 1) tween = null;
}
controls.update();
```

Three choices in it decide whether the move reads as one smooth motion:

- **Never aim the camera yourself while OrbitControls is attached.** A `camera.lookAt(object)` in the tween is undone by the next `update()`, which aims at `controls.target`. If the tween skips `update()` to stop that, the controls take the camera back the first frame after the tween ends, and the view snaps to the old centre. Move the target instead.
- **Start from where the camera and target are now.** A tween that starts from a stored home position, or a second click while one is running, otherwise jumps to that start on the first frame. Cloning both at the click makes a new click continue from the middle of the old move.
- **Ease both with the same curve.** When the position and the target share one eased value, the direction from one to the other turns smoothly or not at all; two tweens with different durations or easings make the view swing during the move.

The same shape with GSAP: one timeline moves both, and `update()` runs on every tick. This sketch did not run here, since GSAP is not installed on the machine that wrote this page.

```js
// GSAP: both tweens on one timeline, the same duration and ease, the controls updated on every tick.
gsap.timeline({ onUpdate: () => controls.update() })
  .to(camera.position, { ...goal.position, duration: 1, ease: 'power2.inOut' }, 0)
  .to(controls.target, { ...goal.target, duration: 1, ease: 'power2.inOut' }, 0);
```

GSAP spreads a `Vector3` like any object with `x`, `y` and `z`. If the frame loop also calls `controls.update()`, keep it: the two calls agree, since both aim at the same target.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `look` with `cameras` pictures up to nine camera positions in one grid with the objects on screen in each, so the end framings can be checked before any tween is written. `interact` plays clicks and waits frame by frame, and with `trace` reads paths in `observe()` every frame and gives each one's first and last value, its peak and the frame of it. A snap is a turn of the camera that happens in one frame, so the page below puts the camera's per-frame move and turn in `observe()` for the trace to read.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A showroom with three products

A chair, a lamp and a vase on plinths 4 units apart, with OrbitControls, and four buttons over the canvas: one per product and one back to the whole room. A button starts a tween of the camera and the target to that product. The goal keeps the direction the camera looks from now and sits at a distance that fits the product's bounding sphere in the field of view. `observe()` returns the focus, the camera's position, the target, and how far the camera moved (`step`) and turned in degrees (`turn`) since the last frame.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Showroom</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#e9e6e1;font:15px sans-serif}
canvas{display:block}
nav{position:fixed;top:16px;left:16px;display:flex;gap:8px}
button{padding:8px 14px;font:inherit;border:0;border-radius:6px;background:#222;color:#fff}
</style></head>
<body>
<nav><button data-focus="chair">Chair</button><button data-focus="lamp">Lamp</button><button data-focus="vase">Vase</button><button data-focus="all">All</button></nav>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e6e1);
scene.fog = new THREE.Fog(0xe9e6e1, 20, 45);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 5, 14);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(4, 8, 6);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

// Three products on plinths, of different sizes, spread along x.
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(50, 64).rotateX(-Math.PI / 2), mat(0xd8d2c8));
floor.name = 'floor';
scene.add(floor);
function product(name, x, parts) {
  const g = new THREE.Group();
  g.name = name;
  g.position.x = x;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 2), mat(0xf4f1ec));
  plinth.name = name + '_plinth';
  plinth.position.y = 0.2;
  g.add(plinth);
  for (const [geo, color, y, part] of parts) {
    const m = new THREE.Mesh(geo, mat(color));
    m.name = name + '_' + part;
    m.position.y = y;
    g.add(m);
  }
  scene.add(g);
  return g;
}
const items = {
  chair: product('chair', -4, [[new THREE.BoxGeometry(1, 0.15, 1), 0x8b5a2b, 1.0, 'seat'], [new THREE.BoxGeometry(1, 1.1, 0.12), 0x8b5a2b, 1.6, 'back']]),
  lamp: product('lamp', 0, [[new THREE.CylinderGeometry(0.05, 0.05, 2.2, 16), 0x333333, 1.5, 'pole'], [new THREE.ConeGeometry(0.5, 0.6, 32, 1, true), 0xf0c040, 2.7, 'shade']]),
  vase: product('vase', 4, [[new THREE.LatheGeometry([0.2, 0.35, 0.3, 0.15, 0.22].map((r, i) => new THREE.Vector2(r, i * 0.2)), 32), 0x3a7bd5, 0.4, 'body']]),
};

// The camera's goal for an object: the same direction it looks from now, at a distance that fits the object's
// bounding sphere in the vertical field of view, aimed at the object's centre.
function goalFor(object) {
  const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
  const dist = (sphere.radius * 1.3) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  const dir = camera.position.clone().sub(controls.target).normalize();
  return { position: sphere.center.clone().addScaledVector(dir, dist), target: sphere.center.clone() };
}

// One tween moves the camera and the controls' target together, from where they are now, over `frames` frames.
let tween = null, focus = null;
function focusOn(name) {
  const object = name === 'all' ? scene : items[name];
  const goal = name === 'all' ? { position: new THREE.Vector3(0, 5, 14), target: new THREE.Vector3(0, 1, 0) } : goalFor(object);
  tween = { t: 0, duration: 1, from: camera.position.clone(), fromTarget: controls.target.clone(), ...goal };
  focus = name;
}
document.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => focusOn(b.dataset.focus)));

let last = 0;
const prev = { pos: camera.position.clone(), dir: camera.getWorldDirection(new THREE.Vector3()) };
let step = 0, turn = 0;
renderer.setAnimationLoop((now) => {
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
  last = now;
  if (tween) {
    tween.t = Math.min(tween.t + dt / tween.duration, 1);
    const e = THREE.MathUtils.smootherstep(tween.t, 0, 1);
    camera.position.lerpVectors(tween.from, tween.position, e);
    controls.target.lerpVectors(tween.fromTarget, tween.target, e);
    if (tween.t === 1) tween = null;
  }
  controls.update();   // aims the camera at the target, every frame, tween or not
  // how far the camera moved and turned since the last frame, for observe()
  const dir = camera.getWorldDirection(new THREE.Vector3());
  step = camera.position.distanceTo(prev.pos);
  turn = THREE.MathUtils.radToDeg(dir.angleTo(prev.dir));
  prev.pos.copy(camera.position);
  prev.dir.copy(dir);
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const r = (n) => +n.toFixed(2), v = (p) => ({ x: r(p.x), y: r(p.y), z: r(p.z) });
window.__game = {
  describe: () => ({ name: 'showroom', actions: { focus: 'tween the camera to chair, lamp, vase or all' } }),
  act: (a) => { if (a.action === 'focus') focusOn(a.name); },
  goal: (name) => { const g = goalFor(items[name]); return { position: g.position.toArray().map(r), lookAt: g.target.toArray().map(r), label: name }; },
  observe: () => ({ focus, tweening: !!tween, camera: v(camera.position), target: v(controls.target), step: r(step), turn: r(turn) }),
};
</script>
</body></html>
```

## See each end framing before the tween

The calls below were made on 2026-10-28. Run folder paths are left out and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:37157/index.html in 0.1 s, paused at frame 0.

eval {"code": "return [\"chair\", \"lamp\", \"vase\"].map(window.__game.goal)"}

[{"position":[-4,2.93,6.49],"lookAt":[-4,1.08,0],"label":"chair"},{"position":[0,3.65,7.53],"lookAt":[0,1.5,0],"label":"lamp"},{"position":[4,2.2,5.61],"lookAt":[4,0.6,0],"label":"vase"}]

look {"cameras": [{"position": [-4, 2.93, 6.49], "lookAt": [-4, 1.08, 0], "label": "chair"}, {"position": [0, 3.65, 7.53], "lookAt": [0, 1.5, 0], "label": "lamp"}, {"position": [4, 2.2, 5.61], "lookAt": [4, 0.6, 0], "label": "vase"}]}

Picture: <project>/paprika3d/runs/2026-10-28T10-20-59-949Z/look-3-cameras.png (3 cameras, left to right, top to bottom, at frame 1, no reload; the game's own camera is not moved)
chair: subject chair 9.8%; on screen: floor, chair_plinth, lamp_plinth, chair_back, chair_seat, lamp_shade, lamp_pole; pixels: brightness 81%, colour saturation 6%, 0% near black, 0% blown out. Pale: little colour.
lamp: subject chair 6.7%; on screen: floor, lamp_plinth, chair_plinth, vase_plinth, chair_back, vase_body, lamp_shade, chair_seat, … 1 more; pixels: brightness 81%, colour saturation 7%, 0% near black, 0% blown out. Pale: little colour.
vase: subject chair 0%; on screen: floor, vase_plinth, lamp_plinth, vase_body; pixels: brightness 82%, colour saturation 5%, 0% near black, 0% blown out. Pale: little colour.
Kept as `camera` names for look, zoom and reference compare: "chair", "lamp", "vase" (paprika3d/cameras.json).
```

`eval` asks the page for the three goals its own `goalFor` computes, and `look` pictures them side by side without moving the page's camera. Each cell lists what the framing holds. The chair's framing also holds the lamp, and the lamp's holds parts of all three: on a canvas wider than it is tall, a distance that fits an object in the vertical field of view leaves room at the sides for its neighbours. Whether that is right is a design call; a framing that should show one product alone needs a larger margin or the horizontal field of view in `goalFor`. The page names no `subject`, so `look` took the named group with the most named parts, the chair, and gives its share in each cell. The labels are kept, so `look {"camera": "vase"}` pictures that framing again later.

## The tween, frame by frame

A click on the Vase button, then 70 frames:

```text
interact {"steps": [{"mouse": "click", "x": 191, "y": 32}, {"wait": 70}], "trace": ["camera.x", "target.x", "step", "turn"]}

{"changed":{"focus":"vase","camera":{"x":4,"y":2.2,"z":5.61},"target":{"x":4,"y":0.6}}}
camera.x: 0 → 4 at frame 57; first changed at frame 4
target.x: 0 → 4 at frame 57; first changed at frame 4
step: 0 → peak 0.3 at frame 28 → 0 at frame 59; first changed at frame 3
turn: 0 throughout the 71 frames
```

The camera and the target leave together and arrive together, at frame 57. `step` rises to its peak in the middle of the move and falls back to 0, which is the ease: slow out, fast through the middle, slow in. `turn` stays 0 for all 71 frames, since the goal keeps the view direction and both ends move on one curve: the camera slides to the vase without turning. A goal from another direction would show a turn that rises and falls the way `step` does.

A click on Chair, then All while the chair move is half done:

```text
interact {"steps": [{"mouse": "click", "x": 48, "y": 32}, {"wait": 30}, {"mouse": "click", "x": 252, "y": 32}, {"wait": 70}], "trace": ["camera.x", "target.x", "step", "turn"]}

{"changed":{"focus":"all","camera":{"x":0,"y":5,"z":14},"target":{"x":0,"y":1}}}
camera.x: 4 → low -0.25 at frame 31 → 0 at frame 83; first changed at frame 3
target.x: 4 → low -0.25 at frame 31 → 0 at frame 83; first changed at frame 3
step: 0 → peak 0.26 at frame 59 → 0 at frame 90; first changed at frame 3
turn: 0 throughout the 102 frames
```

The second click comes with the camera at x -0.25 on its way to the chair, and the new tween starts from there: no jump, and `step` peaks once, in the middle of the second move.

## Fault 1: the camera snaps at the end

The same page with the tween aiming the camera itself and the controls left out until it ends, the common shape of a GSAP `onUpdate: () => camera.lookAt(...)`:

```js
if (tween) {
  // ...
  camera.position.lerpVectors(tween.from, tween.position, e);
  camera.lookAt(lookPoint.lerpVectors(tween.fromTarget, tween.target, e));   // the camera aims itself; the controls sit out
  if (tween.t === 1) tween = null;
} else controls.update();
```

```text
interact {"steps": [{"mouse": "click", "x": 191, "y": 32}, {"wait": 70}], "trace": ["camera.x", "target.x", "step", "turn"]}

{"changed":{"focus":"vase","camera":{"x":4,"y":2.2,"z":5.61}}}
camera.x: 0 → 4 at frame 58; first changed at frame 5
target.x: 0 throughout the 71 frames
step: 0 → peak 0.3 at frame 28 → 0 at frame 60; first changed at frame 4
turn: 0 → peak 35.05 at frame 63 → 0 at frame 64; first changed at frame 63
```

The move itself is smooth: `step` peaks in the middle as before, and the camera's x rounds to 4 from frame 58. Then, at frame 63, `turn` reads 35.05 degrees in a single frame and 0 the frame after: the snap, on the first frame the controls run again. `target.x` stays 0 throughout, so the controls still orbit the lamp at the origin, and the first `update()` after the tween aims the camera back at it. Every later drag orbits the lamp too, which is the "how do I change the centre" question from the other side. Moving `controls.target` in the tween, as the page at the top does, removes the snap.

## Fault 2: the camera jumps at the start

The same page with the target set to the new centre at the click and the tween moving the camera alone:

```js
controls.target.copy(goal.target);   // the new centre at once; the tween moves the camera
```

```text
interact {"steps": [{"mouse": "click", "x": 191, "y": 32}, {"wait": 70}], "trace": ["camera.x", "target.x", "step", "turn"]}

{"changed":{"focus":"vase","camera":{"x":4,"y":2.2,"z":5.61},"target":{"x":4,"y":0.6}}}
camera.x: 0 → 4 at frame 58; first changed at frame 5
target.x: 0 → 4 at frame 1; first changed at frame 1
step: 0 → peak 0.3 at frame 29 → 0 at frame 60; first changed at frame 4
turn: 0 → peak 15.32 at frame 1 → 0 at frame 61; first changed at frame 1
```

`target.x` reaches 4 at frame 1, and `turn` peaks at 15.32 degrees on that same frame: the view swings to the vase before the camera has moved, then keeps turning a little each frame as the camera travels, to frame 61. The ending is right and the start is a jump. The fix is the same: tween the target with the camera.

## What to read in the replies

- `look` with `cameras`: one line per camera with the objects in its framing. Read it before writing the tween, to check that each goal shows what it should and nothing it should not.
- The `turn` trace: 0 throughout, or a rise and fall across the move, is smooth. A peak with 0 on the frames around it is a snap; its frame says whether it comes at the start or after the end.
- The `step` trace: one peak near the middle of the move is an ease. Two peaks are two moves, and a peak at the first or last frame is a jump in position.
- The `target` trace beside the camera's: they should leave and arrive on the same frames. A target that never changes is a camera that will orbit the old centre.

## Pitfalls

- **Damping keeps moving after the tween.** With `enableDamping`, `update()` keeps spending the last drag's motion for a few frames, and it must run every frame. A tween started while the camera still drifts begins from a moving point, and the page's `step` is above 0 before the click.
- **The distance limits clamp the goal.** `update()` holds the camera between `minDistance` and `maxDistance` from the target on every call, so a goal closer than `minDistance` ends short of where the tween aims. Compute the goal within the limits.
- **Stop the user's drag during the move.** A drag mid-tween moves the camera, and the next frame of the tween puts it back. Set `controls.enabled = false` at the start and `true` at the end; `update()` still runs either way.
- **Read the goal from the object's world bounds.** `Box3().setFromObject` gives the centre in world space. A model's `position` is its origin, which for many glTF files sits at the feet or off to one side, so a target at `position` orbits a point beside the model.
- **Advance the tween by the frame's time.** A tween that adds a fixed amount each frame takes twice as long on a 30 Hz screen as on a 60 Hz one. Use the time since the last frame, as the page does, and clamp it so a hidden tab does not finish the move in one jump.

## What paprika3d does not do

It does not write the tween or choose the framings: `look` pictures the goals the page computes, and `interact` reads the values the page puts in `observe()`. The `step` and `turn` values here are the page's own code; a page that does not report them can still be traced on the camera's position and the target, which show where each starts and settles but not how far the view turned in one frame. It does not judge whether a move feels too slow or too fast to a person, and it did not run GSAP here.

## Without paprika3d

Log the angle between the camera's direction this frame and the last in the frame loop, and the same for its position, then click a button: a single large value is the snap or the jump, and its place in the log says which. `controls.addEventListener('change', ...)` fires on each `update()` that moved the camera, which shows when the controls take over after a tween. To preview framings, set the camera to each goal from the console and render; a second camera with a `CameraHelper` drawn in the scene shows where a goal sits relative to the products.
