---
title: three.js virtual joystick and touch look for a phone game, beside keyboard and pointer lock on a computer
phrase: three.js virtual joystick
description: How to add an on-screen joystick, a drag-to-look area and a jump button to a three.js game for phones (pointer events followed by pointerId, touch-action none on the canvas, pointer-events none on the joystick's picture), next to WASD and pointer lock on a computer, and how the paprika3d plugin's interact touch steps at a phone's size drive one and two fingers and catch the three faults that leave a joystick dead or a second finger turning the view.
meta: three.js virtual joystick: on-screen stick, drag to look and two fingers at once on a phone, beside WASD and pointer lock.
intent: mobile-virtual-joystick-touch-controls
queries:
  - "Three.js with touch and or swipe events example"
  - "Orbit controls + Custom Joystick"
  - "How to add touch on PointerLockControls?"
  - "Making Pointer Lock Controls work with iphone/ipad"
  - "Three.js touch events not working properly on mobile"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js virtual joystick and touch look for a phone game, beside keyboard and pointer lock on a computer

## A phone has no pointer to lock

On a computer, a first-person game moves with WASD and turns with the mouse under pointer lock: a click calls `requestPointerLock()`, and each `pointermove` carries `movementX` and `movementY` however far the mouse travels. A finger has no pointer to lock and no keys, so a phone game draws its own controls: a joystick under the left thumb, a drag anywhere else to turn the view, and buttons for actions. The camera code stays the same; the touch code produces the same two inputs, a move vector and a turn.

Three things make the touch half work, and missing any one of them leaves it dead or confused:

- **`touch-action: none` on the canvas.** Without it the browser claims a finger that starts moving, to pan or zoom the page, and sends `pointercancel`. The joystick sees one press and nothing after.
- **`pointer-events: none` on the joystick's picture.** The circle and knob drawn over the canvas are HTML. If they take pointer events, a touch on the joystick lands on them and the canvas's listeners never hear it.
- **Each finger followed by its `pointerId`.** A thumb holds the joystick while another finger turns the view. Code that keeps one "current touch" lets the second finger take over the first one's role, and the first finger's moves then turn the view.

Pointer events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) cover mouse, pen and touch with one set of listeners, and `e.pointerType` says which. `setPointerCapture` keeps a finger's moves coming to the canvas when it slides over a button or off the edge. A button gets `touch-action: manipulation`, so a tap on it is not held back to wait for a double tap.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `open` with `size` and `dpr` loads the page at a phone's size. `interact` sends touch steps (`start`, `move`, `end`, `tap`) and mouse steps, including a `relative` move for pointer lock, frame by frame, and with `trace` follows the page's `observe()` every frame. Each `touch` `start` adds a finger and each `move` and `end` acts on the oldest finger still down, which is enough to hold one finger while another works. When a touch lands on HTML instead of the canvas, its reply names the element. `look` lists the HTML over the canvas with its boxes.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A courtyard to walk in

A first-person walk around a fountain and four pillars. WASD and pointer lock on a computer; on a phone, a joystick in the bottom left, a drag elsewhere to look and a Jump button. `observe()` returns the player's position, height, yaw and pitch in degrees, the joystick's vector, the number of fingers down and whether the pointer is locked; `setState` places the player for a check.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Courtyard</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#cfdce6}
canvas{display:block;touch-action:none}  /* every touch on the canvas goes to the game: no pan, no pinch zoom, no pointercancel */
#stick{position:fixed;left:30px;bottom:30px;width:120px;height:120px;box-sizing:border-box;border-radius:50%;background:rgba(255,255,255,.25);border:2px solid rgba(255,255,255,.7);pointer-events:none}
#knob{position:absolute;left:33px;top:33px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.85)}
#jump{position:fixed;right:30px;bottom:40px;width:76px;height:76px;border-radius:50%;border:0;background:rgba(255,255,255,.75);font:600 15px system-ui;touch-action:manipulation}
@media (pointer: fine) { #stick, #jump { display: none } }  /* a mouse and keyboard need neither */
</style></head>
<body>
<div id="stick"><div id="knob"></div></div>
<button id="jump">Jump</button>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfdce6);
scene.fog = new THREE.Fog(0xcfdce6, 25, 60);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6050, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(5, 10, 4);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 100);

// A courtyard: paving, a fountain in the middle and four pillars around it.
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
const paving = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), mat(0xb8ac98));
paving.name = 'paving';
scene.add(paving);
const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.8, 32), mat(0x8fa4b4));
fountain.name = 'fountain';
fountain.position.y = 0.4;
scene.add(fountain);
for (const [i, [x, z]] of [[-5, -5], [5, -5], [-5, 5], [5, 5]].entries()) {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4, 0.8), mat(0xd8cbb4));
  pillar.name = `pillar_${i + 1}`;
  pillar.position.set(x, 2, z);
  scene.add(pillar);
}

// The player: a position, a yaw and a pitch; the camera is its eyes.
const player = { x: 0, z: 9, y: 0, vy: 0, yaw: 0, pitch: 0 };
const keys = new Set(), stick = { x: 0, y: 0 };
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
const MOUSE = 0.003, TOUCH = 0.006;   // radians per CSS pixel: a thumb drags less far than a mouse moves
const turn = (dx, dy, k) => {
  player.yaw -= dx * k;
  player.pitch = THREE.MathUtils.clamp(player.pitch - dy * k, -1.2, 1.2);
};

// Mouse: pointer lock on a click, then movementX and movementY turn the view.
// Touch: the joystick's circle moves, any other finger on the canvas turns the view. Each finger is followed by its
// pointerId, so a thumb on the joystick and a finger turning the view work at the same time.
const stickEl = document.getElementById('stick'), knob = document.getElementById('knob'), REACH = 50;
const fingers = new Map();   // pointerId → { kind: 'stick' | 'look', x, y }
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') { canvas.requestPointerLock(); return; }
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const onStick = Math.hypot(e.clientX - cx, e.clientY - cy) < r.width && ![...fingers.values()].some((f) => f.kind === 'stick');
  fingers.set(e.pointerId, { kind: onStick ? 'stick' : 'look', x: e.clientX, y: e.clientY, cx, cy });
  canvas.setPointerCapture(e.pointerId);   // moves keep coming here when the finger slides off the canvas or over a button
  if (onStick) moveStick(e.clientX, e.clientY, cx, cy);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { if (document.pointerLockElement === canvas) turn(e.movementX, e.movementY, MOUSE); return; }
  const f = fingers.get(e.pointerId);
  if (!f) return;
  if (f.kind === 'look') turn(e.clientX - f.x, e.clientY - f.y, TOUCH);
  else moveStick(e.clientX, e.clientY, f.cx, f.cy);
  f.x = e.clientX;
  f.y = e.clientY;
});
const lift = (e) => {
  if (fingers.get(e.pointerId)?.kind === 'stick') moveStick(0, 0, 0, 0);
  fingers.delete(e.pointerId);
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
function moveStick(x, y, cx, cy) {
  let dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d > REACH) { dx *= REACH / d; dy *= REACH / d; }
  stick.x = dx / REACH;
  stick.y = dy / REACH;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
document.getElementById('jump').addEventListener('pointerdown', () => { if (player.y === 0) player.vy = 5; });

const SPEED = 4, dt = 1 / 60;
renderer.setAnimationLoop(() => {
  // keys and the joystick add up, so a keyboard on a tablet works too
  const right = THREE.MathUtils.clamp(stick.x + (keys.has('KeyD') - keys.has('KeyA')), -1, 1);
  const back = THREE.MathUtils.clamp(stick.y + (keys.has('KeyS') - keys.has('KeyW')), -1, 1);
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  player.x += (right * c + back * s) * SPEED * dt;
  player.z += (back * c - right * s) * SPEED * dt;
  player.vy -= 12 * dt;
  player.y = Math.max(0, player.y + player.vy * dt);
  if (player.y === 0) player.vy = 0;
  camera.position.set(player.x, 1.6 + player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const r = (n) => +n.toFixed(2), deg = (a) => Math.round(THREE.MathUtils.radToDeg(a));
window.__game = {
  subject: 'fountain',
  describe: () => ({ name: 'courtyard walk', keys: { KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right' }, touch: 'joystick bottom left, drag elsewhere to look, Jump button' }),
  observe: () => ({ x: r(player.x), z: r(player.z), y: r(player.y), yaw: deg(player.yaw), pitch: deg(player.pitch), stick: [r(stick.x), r(stick.y)], fingers: fingers.size, locked: document.pointerLockElement === canvas }),
  setState: (s) => { Object.assign(player, s); },
};
</script>
</body></html>
```

`MOUSE` and `TOUCH` are the turn per CSS pixel. They differ on purpose: a thumb drags a short way across a phone, a mouse moves far, and the same turn should take a similar effort with each. The joystick's vector is the knob's offset over its reach, so it runs from -1 to 1 on each axis and a half push walks at half speed.

## The mouse under pointer lock

The calls below were made on 2026-10-28. Run folder paths are left out and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

At the default laptop size, a click and two `relative` moves of 50 pixels:

```text
open {"url": "index.html", "cwd": "<project>"}

interact {"steps": [{"mouse": "click", "x": 640, "y": 400}, {"mouse": "move", "relative": [50, 0]}, {"mouse": "move", "relative": [50, 0]}], "trace": ["yaw", "locked"]}

{"changed":{"yaw":-17,"locked":true}}
yaw: 0 → -17 at frame 3; first changed at frame 2
locked: false until frame 1, then true
```

The click takes the lock, and 100 pixels of mouse movement turn the view 17 degrees to the right. That is the number to compare the touch look against.

## The joystick, the look and the button at a phone's size

A phone held sideways, then a `look` at what is over the canvas, and a listener that counts `pointercancel` events:

```text
open {"url": "index.html", "cwd": "<project>", "size": [844, 390], "dpr": 3}

Opened http://127.0.0.1:41791/index.html at 844 × 390, DPR 3 in 0.1 s, paused at frame 0.

look {}

HTML over the canvas: 1 (button via page), 0 overlap, 0 off-screen, 0 cut off: button#jump "Jump" [738, 274, 813, 349].
Subject: fountain takes 1.5% of the picture [360, 218, 484, 262]; 1 of its 1 named parts show.

eval {"code": "window.cancels = 0; addEventListener(\"pointercancel\", () => cancels++, true); return cancels;"}

0
```

The Jump button is the one element `look` lists over the canvas. The joystick's circle is not in the list either way; it has `pointer-events: none`, so touches on it pass through to the canvas. A thumb on the joystick's centre pushed up 60 pixels and held for a second:

```text
interact {"steps": [{"wait": 1}, {"touch": "start", "x": 90, "y": 300}, {"touch": "move", "x": 90, "y": 270}, {"touch": "move", "x": 90, "y": 240}, {"wait": 60}, {"touch": "end", "x": 90, "y": 240}], "trace": ["z", "stick.1", "fingers"]}

{"changed":{"z":4.92}}
touch start at (90, 300): over pillar_3 (Mesh, 6.4 units)
z: 9 → 4.92 at frame 64; first changed at frame 3
stick.1: 0 → low -1 at frame 5 → 0 at frame 65; first changed at frame 3
fingers: 0 → peak 1 at frame 2 → 0 at frame 65; first changed at frame 2

eval {"code": "return cancels"}

0

interact {"steps": [{"touch": "tap", "x": 775, "y": 311}, {"wait": 30}], "trace": ["y"]}

{"changed":{"y":0.93}}
y: 0 → peak 1 at frame 23 → 0.93 at frame 31; first changed at frame 1
```

The joystick's vector reaches a full push forward (-1) by frame 5, the player walks from z 9 to 4.92, and the vector returns to 0 when the thumb lifts. No `pointercancel` arrived. A tap on Jump lifts the player to a height of 1. The `over pillar_3` line is the scene object behind the joystick, which the joystick's touch does not concern.

## Two fingers at once, kept as a check

The case that single-touch code gets wrong: the thumb on the joystick, a second finger down on the right, the thumb walking for half a second and lifting, then the second finger dragging 100 pixels. The `resize` and `state` steps make the check stand alone when `test` replays it on a fresh page:

```text
interact {"steps": [{"resize": [844, 390]}, {"state": {"x": 0, "z": 9, "yaw": 0, "pitch": 0}}, {"touch": "start", "x": 90, "y": 300}, {"touch": "start", "x": 600, "y": 200}, {"touch": "move", "x": 90, "y": 250}, {"wait": 30}, {"touch": "end", "x": 90, "y": 250}, {"touch": "move", "x": 650, "y": 200}, {"touch": "move", "x": 700, "y": 200}, {"touch": "end", "x": 700, "y": 200}], "trace": ["fingers", "z", "yaw"], "expect": {"z": [6.5, 7.5], "yaw": [-40, -30]}, "save": "two-fingers"}

{"changed":{"z":6.93,"yaw":-34}}
touch start at (90, 300): over pillar_3 (Mesh, 6.4 units)
touch start at (600, 200): over nothing in the scene
fingers: 0 → peak 2 at frame 4 → 0 at frame 39; first changed at frame 3
z: 9 → 6.93 at frame 35; first changed at frame 5
yaw: 0 → -34 at frame 39; first changed at frame 38
Expect: z 6.93 ✓ · yaw -34 ✓
Saved check "two-fingers" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

test {}

✓ two-fingers
1 of 1 saved checks passed in 1.7 s
```

Two fingers were down from frame 4, the player walked while the second finger stayed still, and the yaw did not move until that finger dragged. Its 100 pixels turned the view 34 degrees, twice the mouse's 17 for the same distance, as `TOUCH` and `MOUSE` set.

## Fault 1: no touch-action on the canvas

The change: `canvas{display:block}`, without `touch-action:none`. The same thumb on the joystick:

```text
eval {"code": "window.cancels = 0; addEventListener(\"pointercancel\", () => cancels++, true); return cancels;"}

0

interact {"steps": [{"wait": 1}, {"touch": "start", "x": 90, "y": 300}, {"touch": "move", "x": 90, "y": 270}, {"touch": "move", "x": 90, "y": 240}, {"wait": 60}, {"touch": "end", "x": 90, "y": 240}], "trace": ["z", "stick.1", "fingers"]}

{"after":{"x":0,"z":9,"y":0,"yaw":0,"pitch":0,"stick":[0,0],"fingers":0,"locked":false},"changed":{}}
touch start at (90, 300): over pillar_3 (Mesh, 6.4 units)
z: 9 throughout the 65 frames
stick.1: 0 throughout the 65 frames
fingers: 0 → peak 1 at frame 2 → 0 at frame 3; first changed at frame 2

eval {"code": "return cancels"}

1

test {}

✗ two-fingers: z 9, expected 6.5 to 7.5; yaw 0, expected -40 to -30
0 of 1 saved checks passed in 1.2 s
```

The finger is down for one frame. On its first move Chrome took the touch for its own pan and sent one `pointercancel`, so the joystick never left the centre. The page cannot scroll, and the browser claims the touch anyway; `touch-action: none` on the element is what tells it not to. A page that does scroll past its canvas has a choice to make about which touches the canvas keeps, covered in [three.js OrbitControls and page scroll](/guides/threejs-orbitcontrols-touch-page-scroll).

## Fault 2: the joystick's picture takes the touch

The change: the `#stick` style without `pointer-events:none`.

```text
look {}

HTML over the canvas: 1 (button via page), 0 overlap, 0 off-screen, 0 cut off: button#jump "Jump" [738, 274, 813, 349].

interact {"steps": [{"wait": 1}, {"touch": "start", "x": 90, "y": 300}, {"touch": "move", "x": 90, "y": 270}, {"touch": "move", "x": 90, "y": 240}, {"wait": 60}, {"touch": "end", "x": 90, "y": 240}], "trace": ["z", "stick.1", "fingers"]}

{"after":{"x":0,"z":9,"y":0,"yaw":0,"pitch":0,"stick":[0,0],"fingers":0,"locked":false},"changed":{}}
touch start at (90, 300) landed on div#knob (opacity 1), not the canvas: listeners on the canvas never got it.
touch move at (90, 270) landed on div#stick (opacity 1), not the canvas: listeners on the canvas never got it.
z: 9 throughout the 65 frames
stick.1: 0 throughout the 65 frames
fingers: 0 throughout the 65 frames

test {}

✗ two-fingers: z 9, expected 6.5 to 7.5
0 of 1 saved checks passed in 1.2 s
```

`interact` names the culprit: the knob took the start, the circle took the move, and the canvas heard nothing, so `fingers` never left 0. The test fails on `z` alone because the second finger, which starts on the canvas, still turns the view. `look`'s line about the HTML over the canvas is the same as on the working page: it does not list the joystick's picture, which has no text, so the `interact` reply is where this fault shows. The other fix is to listen on the joystick's element itself, if the joystick never needs to start a look.

## Fault 3: one touch record for every finger

The change: the handler keeps one record under a fixed key instead of one per `pointerId`, as code that stores a single "current touch" does:

```js
fingers.clear(); fingers.set('touch', { kind: onStick ? 'stick' : 'look', x: e.clientX, y: e.clientY, cx, cy });   // in pointerdown
const f = fingers.get('touch');   // in pointermove: whichever finger moved
```

One finger on the joystick works as before; the saved check is what catches it:

```text
interact {"steps": [{"wait": 1}, {"touch": "start", "x": 90, "y": 300}, {"touch": "move", "x": 90, "y": 270}, {"touch": "move", "x": 90, "y": 240}, {"wait": 60}, {"touch": "end", "x": 90, "y": 240}], "trace": ["z", "stick.1", "fingers"]}

{"changed":{"z":4.92}}
z: 9 → 4.92 at frame 64; first changed at frame 3

test {}

✗ two-fingers: z 9, expected 6.5 to 7.5; yaw 175, expected -40 to -30
0 of 1 saved checks passed in 1.2 s
```

The second finger replaced the thumb's record with a look record. The thumb's next move, from the joystick at the bottom left, was then read as a look drag from the right side of the screen to the left, and the view spun to a yaw of 175 degrees while the player stood at z 9. A test with one finger at a time passes this code; it takes the two-finger check to see it. OrbitControls tracks its own fingers by `pointerId` too, and treats two fingers on its element as a dolly and pan, so a joystick drawn on the same element as OrbitControls has the same conflict in another form.

## Portrait and landscape

`look` with `viewports` pictures the page at several sizes in one call, each on a fresh reload; the phone held upright and sideways are two entries:

```text
look {"viewports": ["phone", [844, 390, 3]]}

phone 390x844@3: subject fountain 7%, 2 on screen; not on screen here: pillar_3, pillar_4, pillar_1, pillar_2. Canvas: 780x1688 buffer for 390x844 CSS at DPR 3 (renderer pixel ratio 2, capped below DPR 3); resize handler ran.
844x390@3: subject fountain 1.5%, 6 on screen. Canvas: 1688x780 buffer for 844x390 CSS at DPR 3 (renderer pixel ratio 2, capped below DPR 3); resize handler ran.
```

In the picture, the joystick and the Jump button sit in the bottom corners in both, because the page places them with `left`, `right` and `bottom` in pixels rather than by shares of the screen. The scene is what changes: upright, none of the four pillars is on screen. The camera's `fov` of 65 is vertical, so a tall, narrow screen keeps the height and loses the sides. A first-person game played upright widens `fov` when the aspect drops below 1, in the resize handler.

## What to read in the replies

- `fingers` in the trace: a peak of 2 with two fingers down, and a count that falls back one frame after a start is a cancelled touch. The `cancels` counter from `eval` confirms it.
- A `landed on` line: the touch went to that element, not the canvas.
- `yaw` in a two-finger trace: it should not move until the look finger moves. A large jump in `yaw` on the joystick's first move is a single touch record.
- The turn per 100 pixels for the mouse and for a drag, from the two traces: the numbers to tune `MOUSE` and `TOUCH` with.

## Pitfalls

- **Pointer lock is for a mouse.** The page above calls `requestPointerLock()` when `e.pointerType` is `mouse`; a touch turns the view by dragging instead.
- **Read the turn from `clientX` deltas on touch.** The page computes each touch drag from the finger's last `clientX` and `clientY`, so the touch path does not depend on `movementX`, which it reads for the locked mouse.
- **A joystick that never returns to centre** has no `pointercancel` handler; the page lifts the finger on both `pointerup` and `pointercancel`.
- **Detecting a phone by screen width** shows the joystick on a narrow laptop window and hides it on a tablet. Show it on the first touch, or with a `(pointer: coarse)` media query on a real device.

## What paprika3d does not do

It runs Chrome and sends Chrome's touch events at the phone's size and pixel ratio; it is not iOS Safari or an Android phone, and what Safari does with the same page stays on the device. Its phone size does not make the page a touch device:

```text
eval {"code": "return { maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia(\"(pointer: coarse)\").matches, size: [innerWidth, innerHeight, devicePixelRatio] };"}

{"maxTouchPoints":0,"coarse":false,"size":[844,390,3]}
```

A page that shows its joystick when those say "touch" hides it under paprika3d, although the touch steps still reach the page. Two fingers can be down at once, but a `move` acts on the oldest finger still down, so two fingers moving in the same frame (a pinch) is not something it sends.

## Without paprika3d

Open the page in Chrome's device toolbar with a phone selected, which turns mouse drags into touches, and watch `pointerdown`, `pointermove`, `pointerup` and `pointercancel` in the console with each event's `pointerId` and target. A cancel right after the first move is a missing `touch-action`, and a target other than the canvas is an element in the way. For the two-finger case, a real phone with remote debugging from the computer's Chrome shows the same events with two `pointerId`s.
