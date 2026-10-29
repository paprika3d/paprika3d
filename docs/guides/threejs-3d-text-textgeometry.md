---
title: three.js 3D text with TextGeometry, centred, on several lines, facing the camera, and the font that will not load
phrase: three.js 3D text
description: How to make 3D text in three.js with FontLoader and TextGeometry, centre it on its position, centre each line of a multiline sign, turn a label to face the camera, and find why a typeface font never loads, measured with the paprika3d plugin's eval stats, look target and open replies.
meta: three.js 3D text: TextGeometry starts at the left of the baseline, '\n' lines stay left-aligned, and the npm package has no fonts.
intent: threejs-3d-text-center-multiline
queries:
  - "How make 3d text in three js"
  - "TextGeometry to always face user?"
  - "Align center TextGeometry in each line break"
  - "Text geometry not rendering on screen, used fontLoader"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js 3D text with TextGeometry, centred, on several lines, facing the camera, and the font that will not load

## How TextGeometry lays out text

3D text in three.js takes two addons. `FontLoader` (in `three/addons/loaders/FontLoader.js`) loads a typeface font, a JSON file of glyph outlines, and `TextGeometry` (in `three/addons/geometries/TextGeometry.js`) turns a string into those outlines extruded, as an `ExtrudeGeometry`. Four things about it cause most of the questions:

- **It starts at the left end of the baseline.** The geometry's origin is where the first letter starts, on the line the letters sit on, at the front face. A mesh placed at x = 0 has its text running to the right of x = 0. Centring is a translation by the geometry's own bounding box, `geometry.center()` for all three axes or a translate of half the box on x for one.
- **A `'\n'` starts the next line at the same left edge.** Lines of different lengths in one `TextGeometry` stay left-aligned, and there is no alignment option. One mesh per line, each centred on x, gives centred lines.
- **The option is `depth`.** r186's `TextGeometry` fills in a depth of 50 when `depth` is missing, so an older answer's `height` is ignored without a warning and the letters are extruded 50 units, which in a scene a few units across runs through the camera.
- **The font file is the project's to serve.** Since three 0.185 the npm package has no `examples/fonts` folder (0.184.0 has it), so the path in most answers, `node_modules/three/examples/fonts/...`, is a 404 after `npm install three`. A dev server that answers unknown paths with `index.html` turns the 404 into a page of HTML, and `JSON.parse` fails on its first character, `<`.

Text that faces the camera copies the camera's rotation each frame, `label.quaternion.copy(camera.quaternion)`, after the camera moves.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `open` lists the page's failed requests and errors. `eval` runs code in the page, and its `__harness.stats()` gives each mesh's bounds in world units, so an offset or a depth is a number to read. `look` lists each named mesh with its box in page pixels, and `look` with `target` draws one object alone from the front, right, top and a three-quarter view with its size and centre. `interact` moves the camera with keys, so the facing label is checked from another side.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A shop sign in three meshes

The page below is a sign: a title centred with its bounds, two lines of hours centred one by one, and a price over a crate that turns to the camera. The arrow keys orbit the camera around the sign. The font comes from a CDN pinned to three 0.184.0, a release whose package has the fonts; a project can copy the file into its own folder (Vite's `public/`, for one) and load it from there instead.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Sign</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// three 0.186 from npm has no examples/fonts folder: serve your own copy of the typeface file, or load it from a CDN
// pinned to a release that ships it, as here.
const FONT = 'https://cdn.jsdelivr.net/npm/three@0.184.0/examples/fonts/helvetiker_bold.typeface.json';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc4e4);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 5);
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x7a9a5a }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
const board = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.2), new THREE.MeshStandardMaterial({ color: 0x3b2a20 }));
board.name = 'board';
board.position.set(0, 2.1, -0.2);
const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xb07a3c }));
crate.name = 'crate';
crate.position.set(2.4, 0.4, 1.8);
scene.add(floor, board, crate);

const font = await new FontLoader().loadAsync(FONT);
const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e });

// TextGeometry starts at the left end of the first line's baseline. Shift it by its own bounds so x = 0 is its middle.
function centred(text, size) {
  const g = new TextGeometry(text, { font, size, depth: size * 0.15, curveSegments: 4 });   // depth, not the old height
  g.computeBoundingBox();
  const b = g.boundingBox;
  return g.translate(-(b.min.x + b.max.x) / 2, 0, -b.max.z / 2);
}
// '\n' starts a new line at the same left edge; one mesh per line centres each line.
function lines(text, size, gap = 1.5) {
  const group = new THREE.Group();
  text.split('\n').forEach((t, i) => {
    const m = new THREE.Mesh(centred(t, size), gold);
    m.name = `line${i + 1}`;
    m.position.y = -i * size * gap;
    group.add(m);
  });
  return group;
}

const title = new THREE.Mesh(centred('PAPRIKA', 0.6), gold);
title.name = 'title';
title.position.set(0, 2.75, 0);
const hours = lines('OPEN EVERY DAY\n9 TO 5', 0.3);
hours.name = 'hours';
hours.position.set(0, 1.85, 0);
const price = new THREE.Mesh(centred('$5', 0.35), new THREE.MeshStandardMaterial({ color: 0xffffff }));
price.name = 'price';
price.position.set(2.4, 1.2, 1.8);
scene.add(title, hours, price);

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
let angle = 0, last = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - (last || t)) / 1000, 0.1);
  last = t;
  angle += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * dt;
  camera.position.set(Math.sin(angle) * 8, 1.8, Math.cos(angle) * 8);
  camera.lookAt(0, 1.6, 0);
  price.quaternion.copy(camera.quaternion);   // the label turns with the camera, so it reads from every side
  renderer.render(scene, camera);
});

window.__game = {
  subject: 'title',
  describe: () => ({ name: 'sign', keys: { ArrowLeft: 'orbit left', ArrowRight: 'orbit right' } }),
  observe: () => ({ camera: { angle: Math.round(angle * 100) / 100 } }),
};
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times.

## The bounds of each line

One `eval` returns the bounds of every text mesh, in world units, from `__harness.stats()`:

```js
const s = __harness.stats();
return s.meshes.filter((m) => /title|line|hours|price/.test(m.name)).map((m) => ({ name: m.name, min: m.bounds.min, max: m.bounds.max, size: m.bounds.size }));
```

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:42693/index.html in 0.2 s, paused at frame 0.
{"name":"sign","keys":{"ArrowLeft":"orbit left","ArrowRight":"orbit right"}}

eval (the stats call above)

[{"name":"title","min":[-1.806,2.75,-0.045],"max":[1.806,3.358,0.045],"size":[3.611,0.608,0.09]},{"name":"line1","min":[-1.778,1.841,-0.023],"max":[1.778,2.162,0.023],"size":[3.555,0.321,0.045]},{"name":"line2","min":[-0.641,1.39,-0.023],"max":[0.641,1.712,0.023],"size":[1.283,0.322,0.045]},{"name":"price","min":[2.126,1.145,1.764],"max":[2.674,1.575,1.828],"size":[0.548,0.43,0.063]}]
```

Each line's `min` and `max` on x are the same number with opposite signs: the title runs from -1.806 to 1.806 and the short second line from -0.641 to 0.641, so both are centred on the sign's middle whatever their lengths. The price's x runs from 2.126 to 2.674 around the crate's 2.4. Each mesh's y starts at its position's y (2.75 for the title), because `centred` shifts on x and z and leaves the baseline where the code put it.

`look` with `target` draws one object alone from four sides, with its size and centre:

```text
look {"target": "title"}

Picture: <project>/paprika3d/runs/2026-10-28T10-46-35-617Z/look-2-views.png (front, right, top, three-quarter)
title: size 3.611 × 0.608 × 0.09, centre [0, 3.054, 0]
```

The centre's x of 0 is the centring, and the third size, 0.09, is the depth the code asked for: 0.15 of the 0.6 letter size.

## Bug 1: the text as most answers write it

This version builds every mesh the way most answers do, with `new TextGeometry(text, { font, size, depth })` and no translation, the hours as one string with a `'\n'`, and no rotation for the price.

```js
const plain = (text, size) => new TextGeometry(text, { font, size, depth: size * 0.15, curveSegments: 4 });
const title = new THREE.Mesh(plain('PAPRIKA', 0.6), gold);
const hours = new THREE.Mesh(plain('OPEN EVERY DAY\n9 TO 5', 0.3), gold);
const price = new THREE.Mesh(plain('$5', 0.35), new THREE.MeshStandardMaterial({ color: 0xffffff }));
```

```text
look {}

Subject: title takes 1.4% of the picture [640, 209, 1032, 275]; 1 of its 1 named parts show.
On screen (6):
floor 39% [0, 446, 1279, 799] 30 × 30 units
board 18% [320, 187, 959, 504] 6 × 3 units, across the view
crate 1.9% [898, 508, 1051, 642]
title 1.4% [640, 209, 1032, 275] 3.61 × 0.608 units, across the view
hours 0.81% [640, 339, 1023, 425] 3.56 × 0.802 units, across the view
price 0.24% [972, 410, 1050, 469] 0.548 × 0.429 units

eval (the stats call above)

[{"name":"title","min":[0,2.75,0],"max":[3.611,3.358,0.09],"size":[3.611,0.608,0.09]},{"name":"hours","min":[0,1.36,0],"max":[3.555,2.162,0.045],"size":[3.555,0.802,0.045]},{"name":"price","min":[2.4,1.145,1.8],"max":[2.948,1.574,1.852],"size":[0.548,0.429,0.052]}]
```

The board's box runs from x 320 to 959 in the picture, and the title and the hours both start at 640, its middle, and run past its right edge to 1032 and 1023. The bounds say why: every `min` on x is the mesh's own position, 0 for the title and the hours and 2.4 for the price. The hours are one mesh 0.802 tall, two lines that both start at x 0, so "9 TO 5" sits under the left end of "OPEN EVERY DAY". The fix is the page above: translate each geometry by half its box, and one mesh per line.

## Bug 2: a label that does not turn

The arrow keys turn the camera one radian around the sign. On the version without the `quaternion.copy` line:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"camera":{"angle":1}}}

look {}

price 0.31% [595, 418, 654, 493] 0.548 × 0.429 units
```

And on the page above, with it:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 60}]}

{"changed":{"camera":{"angle":1}}}

look {}

price 0.31% [555, 417, 649, 490] 0.548 × 0.429 units
```

The size in units is the mesh's own and stays 0.548 × 0.429 in both; the box in pixels is what a visitor sees. Without the line the price's box spans x 595 to 654, the label seen at an angle; with it the box spans 555 to 649, the label square to the view. Copying the camera's quaternion keeps the text parallel to the screen; `price.lookAt(camera.position)` turns it toward the camera's position instead, which differs at the screen's edges. A `THREE.Sprite` with a canvas texture faces the camera with no code, at the cost of being flat.

## Bug 3: height in place of depth

This version passes `height: size * 0.15` to `TextGeometry`, as answers written before the option was renamed do, and changes nothing else.

```text
look {}

Subject: title drew no pixel; 0 of its 1 named parts show; in view but covered: title (behind line1).
On screen (5):
line* ×2 89% [0, 0, 1279, 799] 50 × 1.28–3.56 units, along the view
floor 2.6% [0, 446, 623, 799] 30 × 30 units
board 2.3% [322, 345, 957, 504] 6 × 3 units, across the view
price 1.7% [866, 407, 1279, 492] 50 × 0.548 units, along the view
Never visible: crate (0.8 units, in view, behind line2), title (50 units, in view, behind line1)

eval (the stats call above)

[{"name":"title","min":[-1.806,2.75,-25],"max":[1.806,3.358,25],"size":[3.611,0.608,50]},{"name":"line1","min":[-1.778,1.841,-25],"max":[1.778,2.162,25],"size":[3.555,0.321,50]},{"name":"line2","min":[-0.641,1.39,-25],"max":[0.641,1.712,25],"size":[1.283,0.322,50]},{"name":"price","min":[2.126,0.521,-23.202],"max":[2.674,2.199,26.794],"size":[0.548,1.678,49.995]}]

look {"target": "title"}

title: size 3.611 × 0.608 × 50, centre [0, 3.054, 0]
```

Every text mesh is 50 units deep: `height` is not an option of `TextGeometry` and the default depth filled in. The lines run along the view through the camera, which stands 8 units from the sign, and cover 89% of the picture; the title is behind them and draws no pixel. Rename the option to `depth` and give it in scene units.

## Bug 4: the font that never loads

The same page with the path most answers use, `./node_modules/three/examples/fonts/helvetiker_bold.typeface.json`, on the harness's own static server:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:43111/index.html in 3.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["floor","board","crate"]}
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) node_modules/three/examples/fonts/helvetiker_bold.typeface.json (run bun add three in cwd)
fetch for "http://127.0.0.1:43111/node_modules/three/examples/fonts/helvetiker_bold.typeface.json" responded with 404: Not Found
Failed to load: helvetiker_bold.typeface.json (404)

look {}

look: the game has not drawn a three.js scene after 5 s of stepping frames; if it is still loading or building, step it with `interact` { steps: [{ wait: frames }] } and look again
```

The `Failed to load:` line names the file and its 404. The `bun add three` hint does not fit this case: three is installed, and the folder is not in its package. The scene holds the floor, board and crate made before the `await`; the rejected `loadAsync` stopped the module there, so the animation loop never started and nothing is drawn, the "not rendering on screen" of the thread. With `loader.load(url, onLoad)` instead of `await`, the rest of the scene draws and the text never appears.

The same page on a Vite dev server, with the path `fonts/helvetiker_bold.typeface.json` and no file there:

```text
open {"command": "node_modules/.bin/vite --port 0", "cwd": "<project>"}

Opened http://localhost:5173/ in 3.2 s, paused at frame 0.
Errors so far:
Unexpected token '<', "<!doctype "... is not valid JSON
JSON.parse (<anonymous>)

eval {"code": "return performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.json')).map((e) => ({ url: e.name, status: e.responseStatus, type: e.contentType }));"}

[{"url":"http://localhost:5173/fonts/helvetiker_bold.typeface.json","status":200,"type":"text/html"}]
```

Vite answers a path it does not have with the app's `index.html` and a 200, so no request failed and `open` shows the parse error with no URL. The `eval` names the request: the font's URL came back as `text/html`. Put the file in the project's `public/fonts/` folder and the same path loads it.

## What to read in the replies

- `eval` with `__harness.stats()`: `bounds.min` and `bounds.max` on x of opposite signs mean a centred line; a `min` equal to the mesh's position means the geometry starts at its origin. The third `size` is the depth.
- `look`: each text mesh's box in page pixels against the board's or the screen's, and `Never visible:` for text hidden behind something.
- `look` with `target`: the object's size and centre, and its depth seen from the side.
- `open`: `Failed to load:` for a font that answered an error, and `Errors so far:` with `Unexpected token '<'` for one that answered a page.

## What paprika3d does not do

It does not supply or convert fonts: a typeface JSON comes from three's GitHub repository, an older release's package or a converter such as facetype.js, which turns a TTF into one. It does not wrap text to a width; a sign that wraps splits its string into lines in code, measuring each line's bounds as above. Its `look` gives a mesh's box and size, and whether the letters read well at that size is for the agent to judge from the picture.

## Without paprika3d

Call `geometry.computeBoundingBox()` and log `geometry.boundingBox` for each text geometry: `min.x` of 0 means it is not centred, and `max.z - min.z` is its depth. Watch the Network panel of the browser's developer tools for the font request: a 404, or a 200 whose type is `text/html`, is the font that never loaded. Orbit the camera with `OrbitControls` and watch the label from the side.
