---
title: three.js match a reference image: rebuild its camera, place objects on its pixels, check the colours
phrase: three.js match a reference image
description: How to rebuild a reference picture or mockup in three.js (the camera it was taken from with a vertical field of view, objects placed under the picture's own pixels, colours tuned to what the picture shows) and how a coding agent reads the picture and checks the page against it with the paprika3d plugin's reference tool and fx.js picture().
meta: three.js match a reference image: rebuild its camera, place objects on its pixels, and check the colours against the picture.
intent: match-reference-photo
queries:
  - "Matterport features for THREEjs?"
  - "How to accurately align panoramic images with a 3D model at hotspot locations in Three.js?"
  - "How to recreate image wave effect from portfolio website?"
  - "THREE.JS & Reality Capture - Rotation issue photogrammetry reference camera's in a 3D space"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js match a reference image: rebuild its camera, place objects on its pixels, check the colours

## What has to match

A page matches a reference picture (a photo, a photogrammetry frame, a designer's render or mockup) when three things agree with it:

1. **The camera.** Its position, the point it aims at, its vertical field of view, and the picture's aspect. three.js `PerspectiveCamera` takes the vertical angle. Blender's camera panel shows the horizontal one for a wide picture, and many capture tools give a focal length in millimetres, so the number usually needs converting before it goes in.
2. **Where things stand.** With the camera right, each object belongs on the ray through the pixel where the picture shows it. A point on the ground is where that ray meets the floor; a ball's centre is where it meets the plane at the ball's height.
3. **The colours.** A pixel in the picture is a surface's colour after the light, the shadows and the tone mapping. Used as a material colour as it is, it draws darker under the page's lights. Tune the material until the page draws what the picture shows at the same point.

```js
import { picture } from './fx.js';   // written into the project by paprika3d's open tool

// The picture's camera: fov is vertical, size is the picture's pixels.
const hfov = 60, aspect = 1280 / 720;
const fov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / aspect) * 180 / Math.PI;   // 35.98, from a horizontal 60
const pic = picture({ position: [3.2, 1.5, 5.2], lookAt: [0, 0.5, 0], fov, size: [1280, 720] });
pic.fit(innerWidth, innerHeight);                         // the picture's frame on any canvas; call it on resize
ball.position.copy(pic.ground(777, 465, 0.3));            // under pixel (777, 465), on the plane y = 0.3
const [u, v] = pic.px(ball.position);                     // and back: where the picture has a world point
renderer.render(scene, pic.camera);
```

paprika3d is a Claude Code plugin and MCP server for three.js pages. Two parts of it do this work. `reference` reads the picture itself, at full resolution and with no page open: a `crop` with a `grid` labelled in the picture's own pixels, so a position read off it goes straight into `ground` or `px`, and `sample` points answered as hex. With the page open, `reference` with `compare: true` puts the picture, the page and their differences side by side, and says what share of pixels differ in each region of a grid. `picture()` in fx.js, which the `open` tool writes into the project, turns the camera into a three.js camera and the maps between pixels and the world.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The reference picture

`refs/hero.png` stands in for a designer's mockup. It was rendered for this guide by a separate three.js page, written for the purpose and not shared with the page below: a plinth with a vase on it, a red crate and a yellow ball on a sand floor, its own lights (a warm sun and a cool sky light), shadows, `NeutralToneMapping` and a vase turned from a profile with `LatheGeometry`. The camera file that came with it, `refs/cameras.json`, is what a designer would send:

```json
{ "hero.png": { "position": [3.2, 1.5, 5.2], "lookAt": [0, 0.5, 0], "fov": 36, "size": [1280, 720] } }
```

The brief gave the sizes (a plinth 1.2 by 0.6 by 1.2 at the origin, a crate of 0.5, a ball of radius 0.3) and nothing else: not where the crate and the ball stand, and not their colours. The page below reads those from the picture. At the end, the render's real values are compared with what the page found.

The calls were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

## 1. Read the picture, with no page open

```text
reference {"file": "refs/hero.png", "cwd": "<project>", "grid": 100, "sample": [[640, 80], [200, 620], [380, 352], [350, 400], [410, 400], [580, 400], [640, 280], [778, 465]]}

refs/hero.png is 1280 × 720 px.
Shown: [0, 0, 1280, 720] at 1× (1280 × 720), gridlines every 100 px labelled in the picture's pixels.
Colours (5 × 5 mean): (640, 80) #a9c6dd, (200, 620) #b4a386, (380, 352) #ad270e, (350, 400) #921e06, (410, 400) #5c0c01, (580, 400) #ada595, (640, 280) #05544e, (778, 465) #b08803.

reference {"file": "refs/hero.png", "cwd": "<project>", "crop": [300, 160, 880, 560], "grid": 20}

refs/hero.png is 1280 × 720 px.
Shown: [300, 160, 880, 560] at 2.21× (1280 × 883), gridlines every 20 px labelled in the picture's pixels.
```

The samples are the sky, the floor, the crate's top, its lit front and its shaded side, the plinth's front, the vase and the ball. The sky is the background and no light touches it, so `#a9c6dd` is the colour to give `scene.background`. The other seven are lit colours: the crate's three faces are three different reds.

The crop is the middle of the picture enlarged, with a line every 20 pixels labelled in the picture's coordinates. Read off it: the floor meets the sky at row 180; the ball spans about 706 to 849 across and 394 to 536 down, so its centre is near (777, 465); the crate's bottom corner nearest the camera is near (382, 452). Those pixels go into the page as they are.

## The page

The camera from `refs/cameras.json` through `picture()`; the plinth and the vase at the origin, as the brief says; the ball and the crate placed under the pixels read above with `ground`, the ball on the plane through its centre and the crate from its corner. The vase is a cylinder standing in for the model.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Hero scene rebuilt from refs/hero.png</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { picture } from './fx.js';

// The camera refs/hero.png was rendered from, as refs/cameras.json has it. fov is vertical, as in three.js.
const view = { position: [3.2, 1.5, 5.2], lookAt: [0, 0.5, 0], fov: 36, size: [1280, 720] };
const pic = picture(view);
const { camera, ground } = pic;
pic.fit(innerWidth, innerHeight);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9c6dd');                 // sampled from the sky
scene.add(new THREE.HemisphereLight('#ffffff', '#806c50', 1.3));
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.position.set(-3, 5, 3);                                      // shadows in the picture fall right and back
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
scene.add(sun);

// Colours: each the sampled picture colour, scaled once by picture over page at the same point (see the guide).
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
const add = (name, geometry, color) => {
  const m = new THREE.Mesh(geometry, mat(color));
  m.name = name;
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  return m;
};
const floor = add('floor', new THREE.PlaneGeometry(2000, 2000), '#bfac8c');
floor.rotation.x = -Math.PI / 2;
// Sizes from the brief; the plinth stands at the origin, where the camera aims.
add('plinth', new THREE.BoxGeometry(1.2, 0.6, 1.2), '#e5dcc8').position.set(0, 0.3, 0);
add('vase', new THREE.CylinderGeometry(0.2, 0.2, 0.7, 32), '#038a84').position.set(0, 0.95, 0);   // a stand-in for the vase model
// Placed where the picture shows them, from pixels read off reference { crop, grid }:
const ball = add('ball', new THREE.SphereGeometry(0.3, 48, 24), '#e8b400');
ball.position.copy(ground(777, 465, 0.3));          // the ball's centre pixel, on the plane through its centre
const crate = add('crate', new THREE.BoxGeometry(0.5, 0.5, 0.5), '#c01e02');
crate.position.copy(ground(382, 452)).add(new THREE.Vector3(-0.25, 0.25, -0.25));   // its bottom corner nearest the camera

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); pic.fit(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script></body></html>
```

## 2. Compare the page with the picture

The page opened at the default size first:

```text
open {"url": "index.html", "cwd": "<project>"}

reference {"file": "refs/hero.png", "cwd": "<project>", "compare": true}

The page's look is from cameras.json's viewpoint for hero.png.
The page's aspect (1.60) is not the picture's (1.78), so pixels were not compared: size the canvas to the picture's aspect, e.g. 1707 × 960, and compare again.
```

`fit` showed the whole picture's frame on the taller canvas, with room above and below, so the two cannot be laid over each other pixel for pixel. Opened at the picture's size:

```text
open {"url": "index.html", "cwd": "<project>", "size": [1280, 720]}

reference {"file": "refs/hero.png", "cwd": "<project>", "compare": true, "sample": [[640, 80], [200, 620], [380, 352], [350, 400], [580, 400], [640, 280], [778, 465]]}

The page's look is from cameras.json's viewpoint for hero.png.
Shown: the picture, the page's look (1280 × 720) and their differences in red, each 480 px tall.
1% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 0% 0% 0% / 0% 6% 4% 0% / 0% 1% 2% 0% / 0% 0% 0% 0%. Most different: upper-middle centre-left (6%).
Colours (5 × 5 mean): (640, 80): picture #a9c6dd, page #a9c6dd, off by 0 0 0; (200, 620): picture #b4a386, page #b4a285, off by 0 -1 -1; (380, 352): picture #ad270e, page #b4271a, off by +7 0 +12; (350, 400): picture #921e06, page #911e13, off by -1 0 +13; (580, 400): picture #ada595, page #ada493, off by 0 -1 -2; (640, 280): picture #05544e, page #08514c, off by +3 -3 -2; (778, 465): picture #b08803, page #af8711, off by -1 -1 +14.

eval {"code": "return { ball: find('ball').position.toArray().map((n) => +n.toFixed(2)), crate: find('crate').position.toArray().map((n) => +n.toFixed(2)) };"}

{"ball":[1.3,0.3,1],"crate":[-1.41,0.25,0.6]}
```

A small share of pixels differ, and the region grid puts them in the middle: the upper-middle cells hold the vase, and the lower-middle ones the ball and the crate's edges. Each sample is within a few steps of the picture in each channel. The render placed the ball at `[1.3, 0.3, 1.0]` and the crate at `[-1.4, 0.25, 0.6]`, and the page found both from two pixels each.

To see what is left, `compare` takes a `crop` of the same region of both:

```text
reference {"file": "refs/hero.png", "cwd": "<project>", "compare": true, "crop": [560, 190, 720, 360]}

Shown: [560, 190, 720, 360] of the picture at 2.82× and the same region of the page's look (1280 × 720) and their differences in red, each 480 px tall.
18% of pixels in that region differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 23% 17% 0% / 5% 32% 10% 5% / 21% 30% 10% 21% / 2% 66% 40% 10%. Most different: bottom centre-left (66%).
```

The red in the difference picture is the vase's outline around the cylinder and the highlight on its shoulder: the shape, not the camera. The next step there is the real model.

## A horizontal angle used as the vertical one

The same page with `fov: 60`, the number from Blender's camera panel, passed to `picture()` as it is:

```text
reference {"file": "refs/hero.png", "cwd": "<project>", "compare": true}

15% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 0% 0% 0% / 44% 56% 54% 44% / 1% 10% 27% 0% / 0% 0% 2% 0%. Most different: upper-middle centre-left (56%).

eval {"code": "return { ball: find('ball').position.toArray().map((n) => +n.toFixed(2)), crate: find('crate').position.toArray().map((n) => +n.toFixed(2)) };"}

{"ball":[2.04,0.3,1.79],"crate":[-1.23,0.25,2]}
```

The whole second row of regions differs by about half: a wider view puts the horizon lower, so a band of sky in the picture is floor on the page. The ball and the crate still sit under their pixels, because `ground` follows whatever camera it is given, but the wider camera put them further away and drew them smaller. A row of regions that all differ by a similar share points at the camera; a few cells that differ point at the objects in them. The conversion at the top of this guide gives the vertical angle.

The aspect matters the same way. A vertical angle holds for any canvas width, so a page that keeps `fov` and sets `camera.aspect` from its canvas shows more or less at the sides; `fit` keeps the picture's whole frame in view on any canvas.

## 3. The colours

The first version of the page used the sampled hex values as its material colours (`'#ada595'` for the plinth, `'#921e06'` for the crate, and so on). Opened at the picture's size:

```text
reference {"file": "refs/hero.png", "cwd": "<project>", "compare": true, "sample": [[640, 80], [200, 620], [380, 352], [350, 400], [580, 400], [640, 280], [778, 465]]}

7% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 0% 0% 0% / 0% 15% 12% 0% / 1% 39% 42% 0% / 0% 0% 0% 0%. Most different: lower-middle centre-right (42%).
Colours (5 × 5 mean): (640, 80): picture #a9c6dd, page #a9c6dd, off by 0 0 0; (200, 620): picture #b4a386, page #aa9a80, off by -10 -9 -6; (380, 352): picture #ad270e, page #89271b, off by -36 0 +13; (350, 400): picture #921e06, page #6e1e14, off by -36 0 +14; (580, 400): picture #ada595, page #827b6e, off by -43 -42 -39; (640, 280): picture #05544e, page #09312c, off by +4 -35 -34; (778, 465): picture #b08803, page #856612, off by -43 -34 +15.
```

The sky matches, since it is unlit. Every lit surface draws darker than the picture, because the sampled colour is the result of light and the page lit it again. Light multiplies a colour in linear terms, so one pass of picture over page per channel, at one point on each surface, corrects most of it. `eval` tried it on the open page first:

```text
eval {"code": "// picture's colour, page's colour, at one point on each surface (from the compare above)\nconst seen = { floor: ['#b4a386', '#aa9a80'], crate: ['#921e06', '#6e1e14'], plinth: ['#ada595', '#827b6e'], vase: ['#05544e', '#09312c'], ball: ['#b08803', '#856612'] };\nconst out = {};\nfor (const [name, [want, got]] of Object.entries(seen)) {\n  const c = find(name).material.color, w = new THREE.Color(want), g = new THREE.Color(got);\n  c.r *= w.r / g.r; c.g *= w.g / g.g; c.b *= w.b / g.b;   // a Color holds linear values, which light scales\n  out[name] = '#' + c.getHexString();\n}\nreturn out;"}

{"floor":"#bfac8c","crate":"#c01e02","plinth":"#e5dcc8","vase":"#038a84","ball":"#e8b400"}
```

Those five values are the ones in the page above, which compares as in step 2. They draw like the picture under this page's lights. They are not the colours the render used, which had other lights and tone mapping:

```text
render's materials:  floor #c9b79c  crate #c0392b  plinth #e8e2d6  vase #2f7f7a  ball #e6b422
page's materials:    floor #bfac8c  crate #c01e02  plinth #e5dcc8  vase #038a84  ball #e8b400
```

The near-white plinth and the yellow ball came out close; the crate and the vase did not. A colour fitted under one set of lights is right for those lights and no others. When the page has to hold its colour under other lights too (a configurator, a day and night cycle), get the material colours from the source, the designer's file or the product's paint codes, and match the lights to the picture instead.

## When no camera came with the picture

paprika3d does not work out a camera from a picture. The grid gives the numbers to work it out with. With the vertical angle known, the row where a flat floor meets the sky gives how far the camera looks down:

```js
const f = 720 / 2 / Math.tan(36 / 2 * Math.PI / 180);           // 1108: focal length in picture pixels
const pitch = Math.atan((720 / 2 - 180) / f) * 180 / Math.PI;   // 9.23 degrees down, from the floor's edge at row 180
```

The render looked down by `9.30` degrees (from `[3.2, 1.5, 5.2]` to `[0, 0.5, 0]`). The height needs one length the brief gives, such as the crate's: guess a height, place the crate with `ground`, and change the height until `px` of its top corner lands where the grid shows it. Then compare, as above, until a whole row of regions no longer differs.

## What paprika3d does not do

- It does not solve a camera pose from a picture, or align a panorama or a photogrammetry frame to a model. It gives exact pixel positions and colours to do that with, and `compare` to check the result.
- It does not fetch a reference picture. The picture must be in the project; `asset_search` finds models, textures and skies, not references.
- `compare` counts pixels that differ by more than a set step in a channel. It does not judge style or whether a page looks like the same place in the way a person would.
- `picture()` is a pinhole camera: no lens distortion. A wide photo's curved straight lines will differ near its edges whatever the camera.

## Pitfalls

- **Vertical angle, picture's aspect.** Convert a horizontal angle or a focal length first, and open the page at the picture's aspect to compare.
- **Use `picture.camera` to draw.** A second camera made by hand from the same numbers drifts the first time one of them changes.
- **Read pixels at full resolution.** Positions read off a picture shown smaller are off by the scale; `reference` labels its grid in the picture's own pixels whatever it shows.
- **Sample a flat, evenly lit spot.** A 5 by 5 mean across an edge or a highlight is a mix of two surfaces.
- **The lit colour is not the material colour.** Keep it in mind whenever a sampled hex goes into a material.

## Without paprika3d

Open the reference in an image editor whose info panel shows the cursor's pixel coordinates and colour, and note them by hand. In the page, set `renderer.domElement.style.opacity = 0.5` over an `<img>` of the reference at the same size to see both at once, or draw the reference as `scene.background` with a `TextureLoader` texture. For a numeric comparison, `pixelmatch` compares two PNGs of the same size and writes a difference image; save the canvas with `renderer.domElement.toDataURL()` after a render to get the page's PNG. Blender's camera panel shows the sensor fit and the field of view; set Sensor Fit to Vertical to read the angle three.js expects.
