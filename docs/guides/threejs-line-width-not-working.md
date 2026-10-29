---
title: three.js line width not working, why linewidth stays 1 pixel, fat lines with Line2 and dashed lines that draw solid
phrase: three.js line width not working
description: Why linewidth on a three.js LineBasicMaterial draws 1 pixel wide whatever it is set to, how Line2 and LineMaterial draw fat lines that keep their width on screen or shrink with distance, and why a LineDashedMaterial draws solid until computeLineDistances() runs, measured in the page's own pixels with the paprika3d plugin's look and eval.
meta: three.js line width not working: linewidth stays 1 pixel in WebGL; Line2 draws fat lines, and dashes need computeLineDistances().
intent: line-width-ignored
queries:
  - "How to change the thickness of lines using Three.js"
  - "How to create a Three.js 3D line series with width and thickness?"
  - "Three JS dashed line material not showing"
  - "LineBasicMaterail changes lineWidth on Chrome but not on firefox"
  - "Keep size of Line2 always the same"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js line width not working, why linewidth stays 1 pixel, fat lines with Line2 and dashed lines that draw solid

## Why linewidth does nothing

`THREE.Line`, `THREE.LineSegments` and `THREE.LineLoop` draw with WebGL's own line primitive. WebGL passes `linewidth` to `gl.lineWidth()`, and the browser may clamp it to the range its graphics layer supports, which on most of today's platforms is 1 to 1. So `new THREE.LineBasicMaterial({ linewidth: 5 })` draws a 1-pixel line, with no warning, and the three.js docs for `linewidth` say as much. Whether a platform allows more is a property of the machine, readable in the page: `gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)`. That is why a width can change on one browser or system and not another, as in the Chrome and Firefox thread.

A thick line is drawn as triangles instead. three.js ships three classes for it in `three/addons/lines/`: `LineGeometry` holds the points, `LineMaterial` the colour and width, and `Line2` (or `LineSegments2` for separate segments) draws each segment as a quad. Its `linewidth` is in pixels on screen by default, so a line keeps its width at any distance; with `worldUnits: true` it is in scene units and thins with distance like any object. In r186, `LineSegments2` sets the material's `resolution` from the viewport before each draw, so the `material.resolution.set(width, height)` in older answers is no longer needed.

Dashes need each vertex's distance along the line. `line.computeLineDistances()` writes them into a `lineDistance` attribute; without it every distance is 0, and a `LineDashedMaterial` line draws solid. `LineMaterial` dashes too, with `dashed: true` and the same `computeLineDistances()` on the `Line2`.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `look` lists each named line with its box in page pixels, so a horizontal line one pixel tall says its width, and `zoom` enlarges a box of the page. `eval` runs code in the page: the material each line uses, its `linewidth`, whether its geometry has a `lineDistance` attribute, the platform's line width range, and a count of the pixels each line covers, read from the drawn frame.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## Five lines, one picture

From top to bottom: a `LineBasicMaterial` line asking for 5 pixels, a `Line2` asking for 5, the same `Line2` twice as far from the camera, a dashed line with its distances computed, and the same dashed line without them.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Lines</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 10);

const points = (y, z = 0) => [new THREE.Vector3(-3, y, z), new THREE.Vector3(3, y, z)];

// 1. A plain line asking for 5 pixels: WebGL draws it 1 pixel wide.
const basic = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points(2.4)), new THREE.LineBasicMaterial({ color: 0xd62828, linewidth: 5 }));
basic.name = 'basic';

// 2. A fat line: Line2 draws each segment as two triangles, 5 pixels wide on screen.
const fatGeometry = new LineGeometry().setPositions([-3, 1.2, 0, 3, 1.2, 0]);
const fat = new Line2(fatGeometry, new LineMaterial({ color: 0x1d4ed8, linewidth: 5 }));
fat.name = 'fat';

// 3. The same fat line twice as far away: its width is in pixels, so it stays 5 pixels.
const far = new Line2(new LineGeometry().setPositions([-6, 0, -10, 6, 0, -10]), new LineMaterial({ color: 0x1d4ed8, linewidth: 5 }));
far.name = 'far';

// 4. A dashed line. Dashes need each vertex's distance along the line, which computeLineDistances() writes.
const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points(-1.2)), new THREE.LineDashedMaterial({ color: 0x15803d, dashSize: 0.3, gapSize: 0.2 }));
dashed.computeLineDistances();
dashed.name = 'dashed';

// 5. The same without computeLineDistances(): every distance reads 0, and the line draws solid.
const solid = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points(-2.4)), new THREE.LineDashedMaterial({ color: 0x15803d, dashSize: 0.3, gapSize: 0.2 }));
solid.name = 'dashed without distances';

scene.add(basic, fat, far, dashed, solid);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader through ANGLE); nothing here depends on frame times.

## What look lists

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33475/index.html in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["basic","fat","far","dashed","dashed without distances"]}

look {}

On screen (4):
far 7.1% [530, 180, 749, 509] 12 × 0 units, across the view approximate (a sprite or its own shader: see the picture)
dashed without distances 0.065% [310, 663, 969, 663] 6 × 0 units, across the view
dashed 0.065% [310, 531, 969, 531] 6 × 0 units, across the view
basic 0.065% [310, 136, 969, 136] 6 × 0 units, across the view
Never visible: none
Not found by the ID image (their own vertex shader places them, or they are see-through; see the picture): fat
```

Boxes are `[left, top, right, bottom]` in page pixels. The `basic` line's box has the same top and bottom, 136: it is one pixel tall, whatever its `linewidth`. The two dashed lines are one pixel tall too. `look` finds objects by drawing them again in flat colours, and a `Line2` places its quads in its own vertex shader, which that drawing does not run: `far` gets a box marked approximate and `fat` none, and the reply says to read the picture for them. In the picture both blue lines are thick and the same width.

## The widths, counted in the drawn frame

`eval` first reads what each line asked for and what the platform allows:

```text
eval {"code": "const gl = renderer.getContext(); return { lineWidthRange: [...gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)], lines: scene.children.map((o) => ({ name: o.name, material: o.material.type, linewidth: o.material.linewidth, lineDistance: !!o.geometry.attributes.lineDistance })) };"}

{"lineWidthRange":[1,1],"lines":[{"name":"basic","material":"LineBasicMaterial","linewidth":5,"lineDistance":false},{"name":"fat","material":"LineMaterial","linewidth":5,"lineDistance":false},{"name":"far","material":"LineMaterial","linewidth":5,"lineDistance":false},{"name":"dashed","material":"LineDashedMaterial","linewidth":1,"lineDistance":true},{"name":"dashed without distances","material":"LineDashedMaterial","linewidth":1,"lineDistance":false}]}
```

This Chrome allows line widths from 1 to 1, so the `basic` line's 5 cannot take effect. The second `dashed` line has no `lineDistance` attribute. Then a second `eval` draws a frame and reads its pixels: down the column at x 640, the runs of dark pixels and how tall each is, and along each dashed line's row, how many pixels are dark and in how many runs.

```js
renderer.render(scene, camera);
const gl = renderer.getContext(), H = gl.drawingBufferHeight, W = gl.drawingBufferWidth;
const read = (x, y, w, h) => { const p = new Uint8Array(4 * w * h); gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
const ink = (p, i) => p[4 * i] + p[4 * i + 1] + p[4 * i + 2] < 600;
const col = read(640, 0, 1, H), across = [];
for (let i = H - 1, top = -1; i >= -1; i--) {
  const on = i >= 0 && ink(col, i);
  if (on && top < 0) top = i;
  if (!on && top >= 0) { across.push({ y: H - 1 - top, px: top - i }); top = -1; }
}
const along = (y) => { const row = read(0, H - 1 - y, W, 1); let n = 0, runs = 0; for (let i = 0; i < W; i++) if (ink(row, i)) { n++; if (!i || !ink(row, i - 1)) runs++; } return { y, pixels: n, runs }; };
return { across, along: [along(531), along(663)] };
```

```text
eval (the pixel count above)

{"across":[{"y":136,"px":1},{"y":266,"px":5},{"y":397,"px":6},{"y":531,"px":2},{"y":663,"px":1}],"along":[{"y":531,"pixels":396,"runs":12},{"y":663,"pixels":660,"runs":1}]}
```

From the top: `basic` 1 pixel, `fat` 5, `far` 6, then the two dashed lines. The two `Line2` lines are the same 5-pixel line, one at the origin and one 10 units further from the camera; one edge pixel of an antialiased line falls on either side of the darkness cut-off, hence 5 and 6. The dashed line with distances is 12 dashes covering 396 pixels of its row; the one without is a single run of 660 pixels, a solid line. The dashed line reads 2 pixels tall at x 640 because it falls between two pixel rows and is drawn half in each.

## Bug: a fat line in world units thins with distance

"Keep size of Line2 always the same" is the default. The same page with both blue lines set to `linewidth: 0.05, worldUnits: true`:

```text
eval (the pixel count above)

{"across":[{"y":136,"px":1},{"y":265,"px":6},{"y":399,"px":2},{"y":531,"px":2},{"y":663,"px":1}],"along":[{"y":531,"pixels":396,"runs":12},{"y":663,"pixels":660,"runs":1}]}
```

The near line is 6 pixels and the far one 2: in world units, a line thins with distance, as a tube would. Leave `worldUnits` off for lines that should read the same everywhere (outlines, paths, selection boxes), and turn it on for lines that are things in the world (cables, roads seen from above).

## What to read in the replies

- `look`, `On screen`: a plain line's box is one pixel tall. A `Line2` gets an approximate box or none, and the picture is where it shows.
- `eval` with `gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)`: the widths this machine allows for plain lines. `[1,1]` means `linewidth` is ignored.
- `eval` with `material.type` and `geometry.attributes.lineDistance`: which kind of line each is, and whether its dashes can work.
- `eval` reading the frame's pixels: the drawn width and the dash pattern as numbers.
- `look` with `zoom`: the lines enlarged, to compare by eye.

## What paprika3d does not do

It does not measure a line's width by itself: `look` boxes give a plain line's one pixel, and for a `Line2` the agent counts pixels in `eval` as above. Its Chrome reports the line width range of the machine it runs on, which is not every visitor's; `open` with `browser: "firefox"` runs the same `eval` in Firefox where Firefox is installed (it was not on the machine this guide was written on). It does not choose between `Line2`, a tube mesh or a custom shader for a line whose width varies along its length; that is the page's design.

## Without paprika3d

Log `renderer.getContext().getParameter(renderer.getContext().ALIASED_LINE_WIDTH_RANGE)` in the browser's console on each machine the page must run on. Take a screenshot and count a line's pixels in an image editor at a high zoom. For dashes, log `line.geometry.attributes.lineDistance`: undefined means the dashes cannot show.
