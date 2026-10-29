---
title: three.js OrbitControls limit zoom and rotation, so the camera stays out of the model and above the ground
phrase: three.js orbitcontrols limit zoom
description: How to limit three.js OrbitControls (minDistance and maxDistance, maxPolarAngle above the ground, minAzimuthAngle and maxAzimuthAngle for the horizontal turn, minZoom and maxZoom for an orthographic camera), how to pick the values from the model's bounding sphere, and how the paprika3d plugin's interact wheel and drag steps with look show where the camera stops and what it sees there.
meta: three.js OrbitControls limit zoom and rotation: minDistance from the model's size, maxPolarAngle, azimuth, and minZoom for orthographic.
intent: orbitcontrols-limit-zoom-angles
queries:
  - "How do I put limits on OrbitControl?"
  - "How to limit max and min zoom in THREE.OrbitControls with THREE.OrthographicCamera"
  - "three.js - how to limit the zooming so that object does not break due to camera"
  - "Limit OrbitControls horizontal rotation"
  - "Orbit controls zooming limits"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js OrbitControls limit zoom and rotation, so the camera stays out of the model and above the ground

## One property per limit

OrbitControls keeps the camera on a sphere around `controls.target` and clamps each of the sphere's three numbers on every `update()`:

```js
controls.minDistance = 6;                     // perspective camera: the closest it gets to the target
controls.maxDistance = 30;                    // and the farthest
controls.minZoom = 0.5;                       // orthographic camera: camera.zoom's range instead
controls.maxZoom = 3;
controls.maxPolarAngle = Math.PI / 2 - 0.1;   // the angle down from straight above: just under level
controls.minAzimuthAngle = -Math.PI / 2;      // the turn around the vertical axis, 0 in front (+z)
controls.maxAzimuthAngle = Math.PI / 2;
```

The units trip people up more than the properties do:

- **Angles are radians.** `Math.PI / 2` is level with the target. A polar angle of 0 is straight above; a `maxPolarAngle` of `Math.PI / 2` lets the camera reach the ground's own height, and a little less keeps it above.
- **Distance limits act on a perspective camera, zoom limits on an orthographic one.** OrbitControls zooms an `OrthographicCamera` by changing `camera.zoom` and leaves its distance alone, so `minDistance` and `maxDistance` do nothing there. Set `minZoom` and `maxZoom`.
- **The limits are measured from the target.** Panning moves the target, and the camera's limits move with it. A target panned below the ground takes the camera under it at any polar angle; set `enablePan = false`, or clamp `controls.target` in the frame loop.

The values come from the model, not from trial and error. The camera must stay outside everything around the target, plus the near plane: `minDistance` above the distance from the target to the model's farthest point, with the bounding sphere as that model. `maxDistance` is where the model is still worth looking at, which a picture at that distance answers.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `interact` sends mouse wheel and drag steps frame by frame, as a person's mouse would, and with `trace` reads paths in `observe()` every frame; with `look: true` it adds `look`'s picture and its Subject line, the share of the picture the model takes at the place the camera stopped. `eval` runs code in the page, with `find` and `THREE` in scope.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A house on a lawn

A house 4 units wide with a roof and a door, on a ground plane, with OrbitControls around a target 1.5 units up. `?ortho` in the address switches to an orthographic camera. `observe()` returns the camera's distance from the target, its polar and azimuth angles in degrees, its height and `camera.zoom`, and `setState` places the camera by the same numbers, through the controls.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>House viewer</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#cfe0ee}canvas{display:block}</style></head>
<body>
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
scene.background = new THREE.Color(0xcfe0ee);
scene.fog = new THREE.Fog(0xcfe0ee, 40, 90);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7a5a, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(6, 10, 8);
scene.add(sun);

// ?ortho switches to an orthographic camera, as a map or an isometric view uses.
const ortho = new URLSearchParams(location.search).has('ortho');
const aspect = innerWidth / innerHeight, view = 8;   // the orthographic camera shows 2 × view units of height
const camera = ortho
  ? new THREE.OrthographicCamera(-view * aspect, view * aspect, view, -view, 0.1, 200)
  : new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
camera.position.set(0, 6, 14);

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), mat(0x7a9a5a));
ground.name = 'ground';
scene.add(ground);
const house = new THREE.Group();
house.name = 'house';
const walls = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), mat(0xe8dcc8));
walls.name = 'house_walls';
walls.position.y = 1.5;
const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.8, 4).rotateY(Math.PI / 4), mat(0xa0442c));
roof.name = 'house_roof';
roof.position.y = 3.9;
const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.1), mat(0x5a3a22));
door.name = 'house_door';
door.position.set(0, 0.9, 2.05);
house.add(walls, roof, door);
scene.add(house);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
// The limits. A perspective camera zooms by distance, an orthographic one by camera.zoom.
controls.minDistance = 6;                       // never closer than this to the target: outside the walls
controls.maxDistance = 30;                      // never so far that the house is a speck
controls.minZoom = 0.5;                         // the orthographic camera's limits
controls.maxZoom = 3;
controls.maxPolarAngle = Math.PI / 2 - 0.1;     // stop just above the horizon: never under the ground
controls.minAzimuthAngle = -Math.PI / 2;        // the front half only: from the left side round to the right
controls.maxAzimuthAngle = Math.PI / 2;
controls.update();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  const a = innerWidth / innerHeight;
  if (ortho) { camera.left = -view * a; camera.right = view * a; } else camera.aspect = a;
  camera.updateProjectionMatrix();
});

const r = (n) => +n.toFixed(2), deg = (a) => Math.round(THREE.MathUtils.radToDeg(a));
window.__game = {
  subject: 'house',
  describe: () => ({ name: 'house viewer', camera: ortho ? 'orthographic' : 'perspective' }),
  observe: () => ({
    distance: r(camera.position.distanceTo(controls.target)),
    polar: deg(controls.getPolarAngle()),
    azimuth: deg(controls.getAzimuthalAngle()),
    y: r(camera.position.y),
    zoom: r(camera.zoom),
  }),
  // places the camera by distance and angles in degrees, through the controls, so the limits apply
  setState: (s) => {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (s.distance !== undefined) sph.radius = s.distance;
    if (s.polar !== undefined) sph.phi = THREE.MathUtils.degToRad(s.polar);
    if (s.azimuth !== undefined) sph.theta = THREE.MathUtils.degToRad(s.azimuth);
    camera.position.setFromSpherical(sph).add(controls.target);
    if (s.zoom !== undefined) { camera.zoom = s.zoom; camera.updateProjectionMatrix(); }
    controls.update();
  },
};
</script>
</body></html>
```

## Push each limit, and see the view there

The calls below were made on 2026-10-28. Run folder paths are left out and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

First the number `minDistance` must clear:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:37541/index.html in 0.2 s, paused at frame 0.

eval {"code": "const s = new THREE.Box3().setFromObject(find(\"house\")).getBoundingSphere(new THREE.Sphere()); return { centre: s.center.toArray().map(n => +n.toFixed(2)), radius: +s.radius.toFixed(2), farthest: +(s.center.distanceTo(new THREE.Vector3(0, 1.5, 0)) + s.radius).toFixed(2) };"}

{"centre":[0,2.4,0],"radius":4.08,"farthest":4.98}
```

The house's bounding sphere reaches 4.98 units from the target at its far side. With a near plane of 0.1, a `minDistance` of 6 keeps the whole house in front of the camera from every side. Eight wheel steps toward the house, then eight away:

```text
interact {"steps": [{"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}], "trace": ["distance", "zoom"], "look": true}

{"changed":{"distance":6,"y":3.34}}
wheel at (640, 400): over house_walls (Mesh, 12.6 units)
distance: 14.71 → 6 at frame 4; first changed at frame 1
zoom: 1 throughout the 8 frames
Subject: house takes 76% of the picture [0, 0, 1279, 799], cut by its edge; 3 of its 3 named parts show.
On screen (4):
house_walls 50% [110, 192, 1169, 799]
ground 19% [0, 123, 1279, 799] 200 × 200 units
house_roof 19% [0, 0, 1279, 191]
house_door 6.6% [529, 479, 750, 799] 1.8 × 0.9 units

interact {"steps": [{"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}], "trace": ["distance", "zoom"], "look": true}

{"changed":{"distance":30,"y":10.68}}
distance: 6 → 30 at frame 7; first changed at frame 1
Subject: house takes 2.1% of the picture [558, 296, 721, 469]; 3 of its 3 named parts show.
```

The distance stops at 6 on the fourth step, and the four steps after it change nothing. At that distance the house fills 76% of the picture and its edge cuts the roof, which the `house_roof` box running from 0 to 1279 shows: closest zoom is a close-up of the walls and the door, which suits a house viewer. At 30 the house is 2.1% of the picture. Whether 2.1% is too small is the designer's call, and it is the number to decide it on.

Then a drag upward, which tilts the camera down toward the ground, and a long drag sideways:

```text
interact {"steps": [{"mouse": "down", "x": 640, "y": 700}, {"mouse": "move", "x": 640, "y": 500}, {"mouse": "move", "x": 640, "y": 300}, {"mouse": "up", "x": 640, "y": 300}], "trace": ["polar", "y"], "look": true}

{"changed":{"polar":84,"y":4.5}}
polar: 72 → 84 at frame 2; first changed at frame 2
y: 10.68 → 4.5 at frame 2; first changed at frame 2
Subject: house takes 1.9% of the picture [559, 294, 720, 458]; 3 of its 3 named parts show.

interact {"steps": [{"mouse": "down", "x": 200, "y": 400}, {"mouse": "move", "x": 600, "y": 400}, {"mouse": "move", "x": 1000, "y": 400}, {"mouse": "up", "x": 1000, "y": 400}], "trace": ["azimuth"]}

{"changed":{"azimuth":-90}}
azimuth: 0 → -90 at frame 2; first changed at frame 2
```

A drag of 400 pixels would turn the camera 180 degrees; it stops at 84 degrees from straight above, which is `Math.PI / 2 - 0.1`, with the camera 4.5 units up. The sideways drag stops at -90 degrees, side-on to the house, where `minAzimuthAngle` holds it.

## Fault 1: no minDistance, and the camera is inside the house

The same page without `minDistance`:

```text
interact {"steps": [{"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}], "trace": ["distance", "zoom"], "look": true}

{"changed":{"distance":1.89,"y":2.08}}
distance: 14.71 → 1.89 at frame 8; first changed at frame 1
Subject: house drew no pixel; 0 of its 3 named parts show; in view but covered: house_walls (behind ground), house_roof, house_door.
On screen (1):
ground 86% [0, 111, 1279, 799] 200 × 200 units
Never visible: house: 3 parts (house_walls, house_roof, house_door), in view, behind ground
```

Each wheel step multiplies the distance by the same factor, so with no floor it keeps shrinking: 1.89 units after eight steps, inside walls that stand 2 units from the target. From inside a closed mesh the camera faces the backs of its faces, which three.js does not draw by default, so the house draws no pixel and the picture is the lawn under it. This is the "object breaks due to the camera" of the question above. A `minDistance` above the 4.98 the bounding sphere gave keeps the camera out.

## Fault 2: no maxPolarAngle, and the camera is under the ground

The same page without `maxPolarAngle`, and the same upward drag:

```text
interact {"steps": [{"mouse": "down", "x": 640, "y": 700}, {"mouse": "move", "x": 640, "y": 500}, {"mouse": "move", "x": 640, "y": 300}, {"mouse": "up", "x": 640, "y": 300}], "trace": ["polar", "y"], "look": true}

{"changed":{"polar":180,"y":-13.21}}
polar: 72 → 180 at frame 3; first changed at frame 2
y: 6 → -13.21 at frame 3; first changed at frame 2
Subject: house takes 8.4% of the picture [494, 246, 785, 545]; 2 of its 3 named parts show; in view but covered: house_roof (behind house_walls).
On screen (2):
house_walls 8.3% [494, 254, 785, 545]
house_door 0.052% [607, 246, 672, 253] 1.8 × 0.9 units
Never visible: ground (200 units, in view, behind house_walls), house_roof (4.67 units, in view, behind house_walls)
```

The drag goes all the way to 180 degrees, straight under the target, with the camera 13.21 units below the lawn. The ground is a plane drawn from above, so from below it vanishes and the picture is the underside of the house against the sky. The default `maxPolarAngle` is `Math.PI`, which allows exactly this.

## The orthographic camera zooms by zoom

The same page opened as `index.html?ortho`, eight wheel steps away from the house:

```text
open {"url": "index.html?ortho", "cwd": "<project>"}

Opened http://127.0.0.1:35009/index.html?ortho in 0.1 s, paused at frame 0.

interact {"steps": [{"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}], "trace": ["distance", "zoom"], "look": true}

{"changed":{"zoom":0.5}}
distance: 14.71 throughout the 8 frames
zoom: 1 → 0.5 at frame 3; first changed at frame 1
Subject: house takes 1.2% of the picture [582, 322, 697, 451]; 3 of its 3 named parts show.
```

The distance does not change at all: the wheel moved `camera.zoom` from 1 to `minZoom`'s 0.5 and stopped. The same steps with `minZoom` and `maxZoom` left out, and `minDistance` and `maxDistance` still set:

```text
interact {"steps": [{"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}, {"wheel": 500, "x": 640, "y": 400}], "trace": ["distance", "zoom"], "look": true}

{"changed":{"zoom":0.13}}
distance: 14.71 throughout the 8 frames
zoom: 1 → 0.13 at frame 8; first changed at frame 1
Subject: house takes 0.081% of the picture [625, 380, 654, 412]; 3 of its 3 named parts show.
```

The zoom keeps falling to 0.13 and the house shrinks to 0.081% of the picture, a few pixels. The distance limits were there the whole time; they do not apply to this camera.

## Keep the limits as a check

One play that zooms all the way in and then tilts down, kept with `expect` and `save`:

```text
interact {"steps": [{"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"wheel": -500, "x": 640, "y": 400}, {"mouse": "down", "x": 640, "y": 700}, {"mouse": "move", "x": 640, "y": 500}, {"mouse": "move", "x": 640, "y": 300}, {"mouse": "up", "x": 640, "y": 300}], "expect": {"distance": [5.9, 6.1], "y": [0, 50]}, "save": "limits"}

{"changed":{"distance":6,"polar":84,"y":2.1}}
Expect: distance 6 ✓ · y 2.1 ✓
Saved check "limits" in game-tests.json (1 check now); `test` reruns them all, each from a fresh reload, and the after-edit hook reruns them after each edit, speaking only when one starts or stops failing.

test {}

✓ limits
1 of 1 saved checks passed in 3.4 s
```

`test` on the page with fault 1, then fault 2:

```text
test {}

✗ limits: distance 1.89, expected 5.9 to 6.1
0 of 1 saved checks passed in 2.2 s

test {}

✗ limits: y -4.5, expected 0 to 50
0 of 1 saved checks passed in 2.0 s
```

`test` replays a check after calling `window.__game.setState` on the fresh page, which is why the page has one.

## What to read in the replies

- The trace of the limited value: the frame it stops at and the steps after it that change nothing. A value that is still moving on the last step has no limit, or one beyond where the steps reached.
- The Subject line at each end: the share of the picture the model takes when the camera is as close and as far as it can go. "drew no pixel" at the close end is a camera inside the model.
- `Never visible` naming the ground at the low end: a camera under the ground plane.
- `zoom` against `distance` on an orthographic camera: the one that moves is the one to limit.

## Pitfalls

- **Code that moves the camera skips the limits until the next `update()`.** A tween or a "reset view" button that sets `camera.position` directly can put the camera inside the model; the next `update()` then clamps it in one frame, which reads as a jump. Move the camera to a place inside the limits.
- **An azimuth range across the back wraps.** OrbitControls accepts a `minAzimuthAngle` greater than `maxAzimuthAngle` for a range through `Math.PI`, the back of the model. Write the two in the order the range runs.
- **`zoomToCursor` moves the target.** With it on, each wheel step moves the target toward the pointer, and every limit moves with the target.
- **Damping does not overshoot the limits**, but it keeps moving toward them for a few frames after the person lets go, so read the value a few frames after the last step.
- **A page that should scroll past a model** wants the wheel left to the page, not limited: that is a page of its own, [three.js OrbitControls and page scroll](/guides/threejs-orbitcontrols-touch-page-scroll).

## What paprika3d does not do

It does not choose the limits: it reports the bounding sphere the page's scene gives, where the camera stops under the wheel and the mouse, and what the picture holds there, and the agent or the designer picks the numbers. Its wheel and drag steps are events Chrome sends; a trackpad's pinch and a phone's two-finger zoom are not among them, though OrbitControls applies the same limits to both.

## Without paprika3d

Log `controls.getDistance()`, `controls.getPolarAngle()` and `controls.getAzimuthalAngle()` on the controls' `change` event, then scroll and drag to each end by hand; each should stop at its limit. For the close end, set `controls.minDistance` from `new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere())` plus `camera.near`, rather than by eye. Drawing the bounding sphere with a wireframe `SphereGeometry` shows how close the camera may come.
