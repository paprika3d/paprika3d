---
title: three.js in WordPress or Webflow: a canvas that fits the post, a model path that loads, or an iframe
phrase: three.js in wordpress
description: How to put a three.js scene inside a WordPress or Webflow page, as code in an HTML block or as an iframe, shown on a copy of a post with the paprika3d plugin's open naming the model URL the browser asked for, look showing the canvas below the footer, and interact and eval catching a box that keeps its height when the column narrows.
meta: three.js in WordPress or Webflow: size the canvas from its block, load the model from the site root, keep it responsive, or use an iframe.
intent: threejs-in-wordpress-webflow-iframe
queries:
  - "Wordpress integration"
  - "Integrate ThreeJS 3D Animation in WordPress Site"
  - "Wordpress and Three rendering"
  - "Alternative to iframe for loading three.js projects"
  - "THREE.JS on Webflow site not responsive and not changing to fit viewport"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js in WordPress or Webflow: a canvas that fits the post, a model path that loads, or an iframe

## What changes when the scene moves into a post

A three.js scene written as its own page usually works there and then breaks when its code is pasted into a WordPress Custom HTML block or a Webflow Code Embed. Three things are different inside a post:

- **The page's address is a folder.** A WordPress permalink like `/blog/chair-review/` makes the browser resolve a relative path such as `'table.glb'` under that folder, where the file is not.
- **The canvas goes where the code puts it.** Starter code sizes the renderer to the window and appends the canvas to `document.body`, which in a theme means after the footer, at the size of the whole window.
- **The builder decides whether the script runs at all.** WordPress keeps a `<script>` in a post when the user who saves it has the `unfiltered_html` capability, and Webflow runs a Code Embed's scripts on the published site, not on the Designer's canvas.

There are two ways in. The code goes in the post itself, inside a box the block owns, or the scene stays its own page and the post holds an iframe that points at it. Both are below.

paprika3d is a Claude Code plugin and MCP server that opens a page in its own headless Chrome. `open` lists every file the page failed to fetch, with the address the browser asked for; `look` returns the picture of the whole page with the canvas's size and the objects on screen, at one size or at several `viewports`; `interact` with a `resize` step changes the window's size, and `eval` reads the result in the page.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

The page in this guide loads three.js from a CDN through an import map, as a post has to, so it needs no `npm install`.

## The tutorial's code, pasted into a post

The page opened here is a copy of a blog post's layout: a header, a content column with a maximum width, and a footer, saved as `blog/chair-review/index.html` so that its address ends in `/blog/chair-review/` as a WordPress permalink does. The model sits where WordPress keeps uploads, `wp-content/uploads/2026/10/table.glb`. Into the post went the usual starter code, as one Custom HTML block:

```html
<!-- Custom HTML block -->
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e6df);
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 50);
camera.position.set(1.6, 1.3, 2.2);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.4, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 2.5));
new GLTFLoader().load('table.glb', (gltf) => scene.add(gltf.scene));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
</script>
```

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); nothing here depends on frame times. Run folder paths are shortened to `<project>`, the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out, and replies are cut to the lines discussed, with nothing reworded.

```text
open {"url": "blog/chair-review/", "cwd": "<project>"}

Opened http://127.0.0.1:33369/blog/chair-review/ in 0.3 s, paused at frame 0.
Page text outside the canvas: 1 h1, 0 h2, 40 words
{"three":"186","scenes":1,"entities":[]}
Errors so far:
Failed to load resource: the server responded with a status of 404 (Not Found) table.glb
HttpError: fetch for "http://127.0.0.1:33369/blog/chair-review/table.glb" responded with 404: Not Found
Failed to load: table.glb (404)

look {}

Pixels: brightness 89%, colour saturation 5%, 0% near black, 0% blown out. Pale: little colour.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
On screen (0):
Never visible: none
```

The second error line has the full address the loader asked for: `/blog/chair-review/table.glb`, the post's own folder. The picture shows the post as written, header, title, two paragraphs and footer, and under the footer a pale grey area the width of the window: the canvas, 1280 by 800, with nothing in it. `On screen (0)` and the empty `entities` say the same thing in words: the scene has no table, because the file never came.

## The embed, fixed

Three changes. The block starts with a box of its own, and the canvas goes into it and takes its size from it; a `ResizeObserver` on that box resizes the renderer whenever the box changes; and a file is loaded by its address from the site's root. The table here is built from five boxes in the code, so the block runs on its own; the model version is after it.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The oak table, reviewed</title>
<style>
body{margin:0;font:18px/1.6 Georgia,serif;color:#222;background:#fbfaf7}
header{background:#2b3a42;color:#fff;padding:14px 24px;font:600 18px system-ui}
.entry-content{max-width:680px;margin:0 auto;padding:24px}
footer{border-top:1px solid #ddd;padding:24px;text-align:center;font:14px system-ui;color:#777}
</style></head>
<body>
<header>Furniture Notes</header>
<article class="entry-content">
<h1>The oak table, reviewed</h1>
<p>Solid oak, 1.2 m by 0.8 m, and a height that suits a desk chair. Turn it around below.</p>
<!-- Custom HTML block -->
<div id="table-viewer" style="width:100%;aspect-ratio:4/3;overflow:hidden;margin:24px 0"></div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const box = document.getElementById('table-viewer'); // the canvas lives in this box, and takes its size from it
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e6df);
const camera = new THREE.PerspectiveCamera(40, box.clientWidth / box.clientHeight, 0.1, 50);
camera.position.set(1.6, 1.3, 2.2);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(box.clientWidth, box.clientHeight);
box.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.4, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(2, 4, 3);
scene.add(sun);

const wood = new THREE.MeshStandardMaterial({ color: 0x9a6b43, roughness: 0.7 });
const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.8), wood);
top.name = 'top';
top.position.y = 0.75;
scene.add(top);
const legShape = new THREE.BoxGeometry(0.05, 0.73, 0.05).translate(0, 0.73 / 2, 0);
for (const [i, x, z] of [[1, -0.55, -0.35], [2, 0.55, -0.35], [3, -0.55, 0.35], [4, 0.55, 0.35]]) {
  const leg = new THREE.Mesh(legShape, wood);
  leg.name = `leg-${i}`;
  leg.position.set(x, 0, z);
  scene.add(leg);
}

new ResizeObserver(() => {
  camera.aspect = box.clientWidth / box.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(box.clientWidth, box.clientHeight);
}).observe(box);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
</script>

<p>The legs are 5 cm square and the top is 4 cm thick.</p>
</article>
<footer>Furniture Notes</footer>
</body></html>
```

In WordPress, the Custom HTML block is everything from `<!-- Custom HTML block -->` to the closing `</script>`; the rest stands for the theme. Opened and looked at:

```text
look {}

Canvas: 680x510 buffer for 680x510 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames).
On screen (5):
top 4.9% [458, 370, 824, 452] 1.2 × 0.8 units
leg-* ×4 3.2% [468, 407, 815, 656] 0.73 × 0.05 units
Never visible: none
```

The picture shows the table between the first paragraph and the second, in a box the width of the text, and the footer back at the bottom. The canvas is the column's width and three quarters of it high. The `resize handler did not run` line is wrong for this page: `look` tests resizing by making the window a tenth narrower, and at 1280 wide the column is still at its maximum width, so the box does not change and neither does the canvas. The next section changes the width far enough to matter.

With the model in place of the five boxes, the module changes in two lines, the import of `GLTFLoader` and the loader call:

```js
new GLTFLoader().load('/wp-content/uploads/2026/10/table.glb', (gltf) => scene.add(gltf.scene));
```

```text
open {"url": "blog/chair-review/", "cwd": "<project>"}

Opened http://127.0.0.1:33369/blog/chair-review/ in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["AuxScene"]}
Loaded: table.glb 0.0 MB
```

A path that starts with `/` is read from the site's root, so it is the same on every post, on the home page and in a preview. A full `https://` address works too, and is what a CDN or another host needs.

## A box that keeps its height when the column narrows

The Webflow question in the title is a canvas that does not follow the page. The fixed block above follows it, and the version before it did not, because of one CSS word. Without `overflow:hidden` on the box, the window narrowed to 600 by 800, and the box measured:

```text
interact {"steps": [{"resize": [600, 800]}]}

{"after":null,"changed":{}}

eval {"code": "const b = document.getElementById('table-viewer'), c = b.querySelector('canvas'); return { box: [b.clientWidth, b.clientHeight], canvas: [c.clientWidth, c.clientHeight] };"}

{"box":[552,510],"canvas":[552,510]}
```

The width followed the column and the height did not: the box is 552 by 510, no longer 4 by 3. A box sized by `aspect-ratio` still grows to fit its content when its overflow is visible, and its content is the canvas, still 510 tall from the last `setSize`. The observer then reads 510 back and sets it again, so the canvas never gets shorter. With `overflow:hidden`, the same steps on the fixed block:

```text
interact {"steps": [{"resize": [600, 800]}]}

{"after":null,"changed":{}}

eval {"code": "const b = document.getElementById('table-viewer'), c = b.querySelector('canvas'); return { box: [b.clientWidth, b.clientHeight], canvas: [c.clientWidth, c.clientHeight] };"}

{"box":[552,414],"canvas":[552,414]}
```

Then a phone and a laptop in one call, each a fresh load at that size:

```text
look {"viewports": ["phone", "laptop"]}

phone 390x844@3: no subject, 5 on screen. Canvas: 684x514 buffer for 342x257 CSS at DPR 3 (renderer pixel ratio 2, capped below DPR 3); resize handler ran.
laptop 1440x900@2: no subject, 5 on screen. Canvas: 1360x1020 buffer for 680x510 CSS at DPR 2 (renderer pixel ratio 2); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames).
```

On the phone the box is the narrow column's width and the table is whole; on the laptop the column is at its maximum again, which is why that line repeats `did not run`. The pixel ratio is capped at 2 by the `setPixelRatio` line, so the phone draws fewer pixels than its screen has. The [responsive canvas guide](/guides/threejs-responsive-canvas-resize) covers the resize handler of a scene that fills the window, and keeping the scene in frame on a portrait screen.

## Or an iframe

The other way in is to leave the scene as a page of its own and put one tag in the post, sized by CSS as the box was:

```html
<iframe src="/viewer/table/" title="The oak table in 3D" style="display:block;width:100%;aspect-ratio:4/3;border:0;margin:24px 0"></iframe>
```

Inside the iframe, the scene's page is the whole window, so the same module works with `const box = document.body;` and a style of `html,body{margin:0;height:100%;overflow:hidden}`. paprika3d reads the page it opens and not the pages inside its frames, so opening the post finds no scene:

```text
open {"url": "blog/chair-review-iframe/", "cwd": "<project>"}

game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://127.0.0.1:33369/blog/chair-review-iframe/
```

Open the scene's own page instead, at the size the iframe gives it:

```text
open {"url": "viewer/table/", "cwd": "<project>", "size": [680, 510]}

Opened http://127.0.0.1:33369/viewer/table/ at 680 × 510 in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["top","leg-* (4)"]}

look {}

Canvas: 680x510 buffer for 680x510 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
On screen (5):
top 4.9% [158, 139, 524, 221] 1.2 × 0.8 units
leg-* ×4 3.2% [168, 176, 515, 425] 0.73 × 0.05 units
```

Which to choose:

- **Code in the post** shares the page: one load, no second address to host, and the scene can read the post's own elements. It also shares the theme's CSS and every other script on the page, and it needs someone allowed to save scripts.
- **An iframe** keeps the scene apart: the theme's CSS and scripts do not reach it, the scene's page can be built with any tool (a Vite build, React Three Fiber) and uploaded as a folder, and the post holds one tag. It costs a second page load and a second address on the same host, and its height is whatever the iframe's CSS says.

`publish` puts a project on its own subdomain of paprika3d.app (public, in preview and invite-only), but those pages are served with `frame-ancestors 'none'`, so a browser refuses to show them inside another site's iframe. For an iframe, host the scene's page on the site's own server.

## What the builders do with the code

- **WordPress** keeps a `<script>` in a post when the user who saves it has the `unfiltered_html` capability: administrators and editors on a single site, super admins on a multisite network. For anyone else it removes the script when the post is saved, and the post shows no scene. A theme's template or a small plugin that adds the script is the route for sites where authors cannot have that capability.
- **Webflow** runs a Code Embed's scripts on the published site, not on the Designer's canvas, so check the scene on the published or staging address.
- **Both:** the import map has to come before the first module that imports `three`, which holds when the map and the module are in the same block, as above.

## What to read in the replies

- **`Failed to load` in `open`, and the line above it,** give the file's name and the full address the browser asked for. An address under the post's own folder means a relative path.
- **The Canvas line in `look`** gives the canvas's size on the page. A window-sized canvas in a post means the renderer was sized from the window.
- **`On screen (0)`** with an empty `entities` list means the scene has nothing in it yet, here because its one model never loaded.
- **`look` `viewports`** loads the page fresh at each size, which shows the box the block gets at that width; `interact` `resize` changes the size of a page already open, which is the case a fixed height gets wrong.

## What paprika3d does not do

- **It does not edit WordPress or Webflow, or sign in to them.** It opens pages: a local copy of the post, as here, or any http address `open` is given. This guide did not open a live WordPress install.
- **It does not look inside iframes.** Open the framed page by its own address, at the iframe's size.
- **It does not run the builder's filters.** A script WordPress removed on save is simply not in the page; open the published post to see what survived.
- **`look`'s resize line reads `did not run` for a canvas in a column at its maximum width,** as shown above. Change the width with `interact` and read the sizes with `eval`.
- **A page made with `publish` cannot be framed by another site.**

## Pitfalls

- **Load files from the site's root.** `'/wp-content/uploads/2026/10/table.glb'`, not `'table.glb'`.
- **Append the canvas to the block's own box,** not to `document.body`.
- **Size the renderer and the camera from that box,** not from `window.innerWidth`.
- **Give the box `overflow:hidden`** when its height comes from `aspect-ratio`, or it keeps the height of the canvas inside it.
- **Watch the box, not the window.** A `ResizeObserver` also sees a column that changes width with no window resize: a sidebar that opens, a tab that becomes visible.
- **Pin both import map entries to the same three.js version.** The core and the addons must match.

## Without paprika3d

Open the published post in a browser with the network panel open and filter by the model's name: the failed request shows the address that was asked for. Inspect the canvas to see where in the page it sits and how large it is, then make the window narrow and wide again and watch the box's height. For the WordPress capability, check the user's role before the post is saved, and view the published post's source to see whether the script is still there.
