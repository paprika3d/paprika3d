---
title: three.js WebGL context lost? Count what each level and each renderer leaves on the GPU
phrase: three.js webgl context lost
description: Why a three.js page goes blank with "context lost" or warns "Too many active WebGL contexts", and how a coding agent watches textures, geometries and renderers pile up with the paprika3d plugin's observe, eval and perf tools, frees them with dispose(), and checks that the page survives a lost context.
meta: three.js WebGL context lost? Count what each level and renderer leaves on the GPU, dispose it, and handle the loss and restore.
intent: webgl-context-lost-texture-memory
queries:
  - "WebGL scene does't render because of lost context"
  - "When to dispose: How to completely clean up a Three.js scene"
  - "I have a problem in \"WARNING: Too many active WebGL contexts. Oldest context will be lost\""
  - "THREE.WebGLRenderer Context Lost_Performance_RAM"
  - "How to fix context lost (Android, iPhone, iOS)?"
  - "Leaking WebGLRenderer and more when unmounting"
  - "Three.js gets very slow after removing and creating objects"
  - "Does threejs leak memory?"
  - "Add/Remove scene object geometry memory leak related"
  - "Memory leak, that I can not deal with"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js WebGL context lost? Count what each level and each renderer leaves on the GPU

## What a lost context is, and what leads to one

A `WebGLRenderer` owns one WebGL context, and the context holds everything three.js has put on the GPU: each geometry's buffers, each texture, each compiled shader program. three.js uploads them the first time they are drawn and keeps them until the page calls `dispose()` on that geometry, material or texture. Taking an object out of the scene with `scene.remove()` stops drawing it; it frees nothing on the GPU. A page that swaps levels, rooms or products this way adds a full set of textures with every swap.

The context itself can be taken away. On a phone, the system reclaims it when GPU memory runs short, and the canvas goes blank with a `webglcontextlost` event. A browser also limits how many contexts one page may keep, and every `new THREE.WebGLRenderer()` makes another one. Past that limit Chrome prints `WARNING: Too many active WebGL contexts. Oldest context will be lost.` and the oldest canvas goes blank. `renderer.dispose()` frees the renderer's own caches but leaves its context alive; `renderer.forceContextLoss()` after it gives the context back, which is what Qiumeng12 suggested in the forum thread with that warning. In the same thread, drcmda advised keeping one canvas for the whole page, since browsers clear memory inconsistently even after a dispose.

So the fix has two parts: dispose what a level change removes, and make one renderer and reuse it, or dispose it and lose its context when a component unmounts.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `observe` returns the renderer's counts of geometries, textures and programs with what changed since the last call, so a leak shows as counts that grow after every level change. `eval` reads `renderer.info.memory` and the number of canvases in the page, and calls three's `forceContextLoss()` and `forceContextRestore()` to check that the page comes back from a lost context. `perf` reports how many megabytes of textures one load puts on the GPU. This is a partial answer: the harness does not have a phone's memory limit, and it cannot make a real context loss from memory pressure. It shows the numbers that lead to one.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A game with levels and a restart key

N loads the next level: 24 crates, each with its own geometry, material and 512 px canvas texture. R restarts the game the way many pages do, by running `start()` again, which makes a new renderer. With `DISPOSE` false, the page does what the forum threads describe: it removes the old level and the old canvas and frees nothing.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crates</title>
<style>html,body{margin:0;overflow:hidden;background:#111}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

// N loads the next level: 24 crates, each with its own geometry, material and 512 px canvas texture.
// R restarts the game the way many pages do: it runs start() again, which makes a new renderer.
const DISPOSE = false;

let renderer, scene, camera, level = null, number = 0;

function crateTexture(hue) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
  const g = canvas.getContext('2d');
  g.fillStyle = `hsl(${hue}, 45%, 45%)`;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = `hsl(${hue}, 45%, 25%)`;
  g.lineWidth = 40;
  g.strokeRect(20, 20, 472, 472);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function freeLevel(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    o.material.map?.dispose();
    o.material.dispose();
  });
}

function loadLevel() {
  if (level) {
    scene.remove(level);
    if (DISPOSE) freeLevel(level);
  }
  number++;
  level = new THREE.Group();
  level.name = `level ${number}`;
  for (let i = 0; i < 24; i++) {
    const size = 0.6 + ((i * 7 + number * 3) % 5) * 0.1;
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ map: crateTexture((number * 47 + i * 13) % 360) }));
    crate.name = `crate ${i}`;
    crate.position.set((i % 6) * 1.6 - 4, size / 2, Math.floor(i / 6) * 1.6 - 2.4);
    level.add(crate);
  }
  scene.add(level);
}

function start() {
  if (renderer) {
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    if (DISPOSE) {
      freeLevel(level);
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();   // dispose() alone leaves the WebGL context alive
    }
  }
  level = null;
  number = 0;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', () => console.warn('context lost'));
  renderer.domElement.addEventListener('webglcontextrestored', () => console.warn('context restored'));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2128);
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 6, 12);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.5));
  loadLevel();
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
}

start();
addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') loadLevel();
  if (e.key === 'r' || e.key === 'R') start();
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew in software (SwiftShader). The counts below do not depend on the GPU; the frame times in the `perf` reply do, and this guide reads nothing from them. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open, look, and read the counts for one level.** `open` leaves the page paused before its first frame, so `look` draws it once and the counts have something to count:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:44735/index.html in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["level 1"]}

look {}

On screen (24):
crate * ×24 8.8% [268, 279, 1011, 502]

observe {}

{"entities":{"level 1":{"type":"Group","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":24,"triangles":288,"textures":25,"geometries":24,"programs":2},"scene":{"objects":26,"meshes":24,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

24 geometries for 24 crates, and 25 textures: the 24 crate maps and a small lookup table three.js r186 makes for its physically based materials.

**2. Change level three times and read them again.** `interact` presses N once per frame:

```text
interact {"steps": [{"key": "n"}, {"key": "n"}, {"key": "n"}]}

{"after":null,"changed":{}}

observe {}

{"entities":{"level 4":{"type":"Group","position":[0,0,0]}},"harness":{"frame":4,"renderer":{"calls":24,"triangles":288,"textures":97,"geometries":96,"programs":2},"scene":{"objects":26,"meshes":24,"lights":1,"cameras":0},"errors":[],"changed":{"entities":{"level 1":[{"type":"Group","position":[0,0,0]},null],"level 4":[null,{"type":"Group","position":[0,0,0]}]},"harness":{"renderer":{"textures":[25,97],"geometries":[24,96]}}}}}

eval {"code": "return { memory: renderer.info.memory, programs: renderer.info.programs.length, canvases: document.querySelectorAll('canvas').length }"}

{"memory":{"geometries":96,"textures":97},"programs":2,"canvases":1}
```

The scene still holds 24 meshes and draws 24 calls, but the renderer now holds 96 geometries and 97 textures. That is the leak: the `changed` part of the `observe` reply names the two counts that grew, and they grow by 24 at every level change for as long as the game runs. Programs stay at 2, since every level reuses the same material type.

**3. What one level costs.** `perf` reloads the page before it measures, so it times a fresh level 1, and its texture line counts the textures the scene can reach:

```text
perf {}

Textures 32 MB on the GPU (largest 512 px), 1 shader programs, pixel ratio 1, heap 19.01 MB, 17 long tasks, 2 frames over 3× the median (GC-like pauses); noise between two samples 0.6 ms.

observe {}

{"entities":{"level 1":{"type":"Group","position":[0,0,0]}},"harness":{"frame":0,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":26,"meshes":24,"lights":1,"cameras":0},"errors":[],"changed":{"entities":{"level 4":[{"type":"Group","position":[0,0,0]},null],"level 1":[null,{"type":"Group","position":[0,0,0]}]},"harness":{"renderer":{"textures":[97,0],"geometries":[96,0],"programs":[2,0]}}}}}
```

So each level is about 32 MB of textures, and every level the page forgets to free leaves that much behind. The leaked textures never appear in this line: the scene no longer reaches them. The `observe` after it shows the reload, back at level 1 and frame 0. Read the leak with `observe` or `eval` after the page's own level changes, and the cost per level with `perf`.

**4. Restart the game 18 times.** Each R makes a new renderer, so 19 contexts in all:

```text
interact {"steps": [{"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}]}

{"after":null,"changed":{},"logs":["warn: WARNING: Too many active WebGL contexts. Oldest context will be lost. (×3)","log: THREE.WebGLRenderer: Context Lost. (×3)","warn: context lost (×3)"]}

eval {"code": "return { canvases: document.querySelectorAll('canvas').length, lost: renderer.getContext().isContextLost() }"}

{"canvases":1,"lost":true}

look {}

Canvas: 1280x800 buffer for 0x0 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames). The canvas is 0 px tall, so nothing shows: give it (or its container) a size, then call renderer.setSize.
On screen (0):
```

Chrome's own warning comes back in the reply, three times, each followed by three's `Context Lost` log and the page's listener: of the 19 contexts, Chrome took the three oldest. The page has one canvas in the document, but the old renderers still hold their contexts until something releases them.

The `eval` and `look` replies here describe the harness's view, and the harness follows the first renderer the page made: its context is the one Chrome took first (`lost: true`), and its canvas was removed from the page, hence `0x0 CSS` and `On screen (0)`. The picture itself shows the newest canvas drawing the crates. A page with several renderers alive is the case to fix, not to measure; once it keeps one, every reply reads that one.

**5. Free what is removed, and release each old context.** The fix is the code under `DISPOSE`: `freeLevel` on a level change, and on a restart `freeLevel`, `scene.clear()`, `renderer.dispose()` and `renderer.forceContextLoss()`. With `DISPOSE` set to true, the next `look` reloads the page, and the same steps read:

```text
observe {}

{"entities":{"level 4":{"type":"Group","position":[0,0,0]}},"harness":{"frame":4,"renderer":{"calls":24,"triangles":288,"textures":25,"geometries":24,"programs":2},"scene":{"objects":26,"meshes":24,"lights":1,"cameras":0},"errors":[],"changed":{"entities":{"level 1":[{"type":"Group","position":[0,0,0]},null],"level 4":[null,{"type":"Group","position":[0,0,0]}]}}}}

interact {"steps": [{"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}, {"key": "r"}]}

{"after":null,"changed":{},"logs":["warn: context lost (×18)"]}

eval {"code": "return { memory: renderer.info.memory, canvases: document.querySelectorAll('canvas').length, lost: renderer.getContext().isContextLost() }"}

{"memory":{"geometries":24,"textures":25},"canvases":1,"lost":false}
```

At level 4 the counts are still 24 and 25, and `changed` no longer lists them. The restarts raise no Chrome warning; the 18 `context lost` lines are the page's listener on each old canvas, whose context `forceContextLoss()` gave back on purpose. The renderer the harness reads now is the live one.

A page that does not need a new renderer at all is simpler still: create it once outside `start()` and rebuild just the scene. In the React Three Fiber issue on leaking renderers, a maintainer suggested the same direction: hide and show a canvas instead of tearing its context down, and share textures and materials.

**6. Check that the page survives a lost context.** A phone can take the context at any time. three's `forceContextLoss()` and `forceContextRestore()` use the `WEBGL_lose_context` extension to make that happen on demand:

```text
eval {"code": "renderer.forceContextLoss();\nawait new Promise((r) => setTimeout(r, 100));\nreturn renderer.getContext().isContextLost()"}

true
log: THREE.WebGLRenderer: Context Lost.
warn: context lost

look {}

Pixels: brightness 7%, colour saturation 0%, 0% near black, 0% blown out; 99% of the picture changed since the last look. Dark: a viewer sees little. Pale: little colour.
Hues: grey 100%.
On screen (0):

eval {"code": "renderer.forceContextRestore();\nawait new Promise((r) => setTimeout(r, 100));\nreturn renderer.getContext().isContextLost()"}

false
log: THREE.WebGLRenderer: Context Restored.
warn: context restored

look {}

Pixels: brightness 14%, colour saturation 32%, 0% near black, 0% blown out; 99% of the picture changed since the last look.
On screen (24):
crate * ×24 8.8% [268, 279, 1011, 502]
```

While the context is lost, the picture is the page's dark background and nothing else: the blank page from the threads. After the restore, three.js sets its state up again and uploads the textures from their canvases, and the crates come back without any code of the page's own. That works because each texture still has its image. In three.js issue #22652, mrdoob noted that a page which closes its image bitmaps after upload could not upload them again after a lost context, so a page that throws image data away has to reload it in its own `webglcontextrestored` handler.

## Why does my three.js app get slower and use more memory the longer it runs?

The steps above count what a level change leaves on the GPU. Two other things grow the longer a page runs, and neither moves the texture count: objects the game's own list has forgotten while the scene still holds them, and animation loops that a restart starts again without stopping the old one. Both show in the `harness` part of every `observe` reply, which counts the scene and the last frame whatever the game's state says. This turret page has both faults, and a `?fixed` query that switches on the two lines that prevent them:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Turret</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const FIXED = new URLSearchParams(location.search).has('fixed');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2230);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 6, 12);
camera.lookAt(0, 0, -4);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.5));

const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1, 24), new THREE.MeshStandardMaterial({ color: 0x8090a0 }));
turret.name = 'turret';
turret.position.y = 0.5;
scene.add(turret);

const BULLET = new THREE.SphereGeometry(0.15, 12, 8), BRASS = new THREE.MeshStandardMaterial({ color: 0xe0b040 });
let bullets = [], shots = 0, last = 0, raf = 0;

function fire() {
  const b = new THREE.Mesh(BULLET, BRASS);
  b.name = 'bullet' + shots++;
  b.position.set(0, 1, 0);
  scene.add(b);
  bullets.push(b);
}

function loop(now) {
  const dt = Math.min((now - last) / 1000 || 0, 0.1);
  last = now;
  for (const b of bullets) b.position.z -= 30 * dt;
  // Out of range: dropped from the list. FIXED also takes it out of the scene.
  bullets = bullets.filter((b) => {
    if (b.position.z > -60) return true;
    if (FIXED) scene.remove(b);
    return false;
  });
  renderer.render(scene, camera);
  raf = requestAnimationFrame(loop);
}

function start() {
  for (const b of bullets) scene.remove(b);
  bullets = [];
  if (FIXED) cancelAnimationFrame(raf); // one loop, however often the game restarts
  raf = requestAnimationFrame(loop);
}
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) fire();
  if (e.code === 'KeyR') start();
});
start();

window.__game = {
  describe: () => ({ name: 'turret', keys: { Space: 'fire', KeyR: 'restart' } }),
  observe: () => ({ bullets: bullets.length, shots }),
  setState: (s) => { if (s.shots !== undefined) shots = s.shots; },
};
</script>
</body></html>
```

The replies below were captured on 2026-10-28 on the same host, cut to the lines this section discusses. Ten shots, then three seconds of play for them to fly out of range:

```text
observe {}

{"bullets":0,"shots":0,"harness":{"frame":1,"renderer":{"calls":1,"triangles":96,"textures":1,"geometries":1,"programs":2},"scene":{"objects":2,"meshes":1,"lights":1,"cameras":0},"errors":[],"changed":null}}

interact {"steps": [{"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"key": "Space", "frames": 6}, {"wait": 180}]}

{"changed":{"shots":10}}

observe {}

{"bullets":0,"shots":10,"harness":{"frame":241,"renderer":{"calls":11,"triangles":1776,"textures":1,"geometries":2,"programs":2},"scene":{"objects":12,"meshes":11,"lights":1,"cameras":0},"errors":[],"changed":{"shots":[0,10],"harness":{"renderer":{"calls":[1,11],"triangles":[96,1776],"geometries":[1,2]},"scene":{"objects":[2,12],"meshes":[1,11]}}}}}
```

The game's list says no bullets are in flight; the scene holds 11 meshes and the renderer drew all of them. Each bullet left the list 60 units out and stayed in the scene where it stopped, still inside the far plane, so every shot adds a draw call to every frame for the rest of the session. The geometry count went from 1 to 2 and stays there: all the bullets share one geometry, so the texture and geometry counts that the steps above watch hardly move with this leak. Three restarts next:

```text
interact {"steps": [{"key": "KeyR"}, {"key": "KeyR"}, {"key": "KeyR"}]}

{"after":{"bullets":0,"shots":10},"changed":{}}

eval {"code": "const f0 = renderer.info.render.frame;\nfor (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));\nreturn { rendersPerFrame: (renderer.info.render.frame - f0) / 10 };"}

{"rendersPerFrame":4}

observe {}

{"bullets":0,"shots":10,"harness":{"frame":254,"renderer":{"calls":44,"triangles":7104,"textures":1,"geometries":2,"programs":2},"scene":{"objects":12,"meshes":11,"lights":1,"cameras":0},"errors":[],"changed":{"harness":{"renderer":{"calls":[11,44],"triangles":[1776,7104]}}}}}
```

The scene is unchanged at 12 objects, and the draw calls went from 11 to 44: the same scene drawn four times a frame. The `eval` counts it directly: `renderer.info.render.frame` goes up once per `render()` call, and it went up four times for each frame the page was given. Each `start()` called `requestAnimationFrame(loop)` and the old loops kept scheduling themselves. The bullets do not move faster here, since the four loops share `last` and three of them see a time step of 0, so the game looks right and costs more after each restart. `renderer.setAnimationLoop` keeps one callback and replaces it, so a page that uses it cannot stack loops this way. With `?fixed`, the same steps (the ten shots, then the three restarts) end with these replies:

```text
observe {}

{"bullets":0,"shots":10,"harness":{"frame":241,"renderer":{"calls":1,"triangles":96,"textures":1,"geometries":2,"programs":2},"scene":{"objects":2,"meshes":1,"lights":1,"cameras":0},"errors":[],"changed":{"shots":[0,10],"harness":{"renderer":{"geometries":[1,2]}}}}}

eval {"code": "const f0 = renderer.info.render.frame;\nfor (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));\nreturn { rendersPerFrame: (renderer.info.render.frame - f0) / 10 };"}

{"rendersPerFrame":1}

observe {}

{"bullets":0,"shots":10,"harness":{"frame":254,"renderer":{"calls":1,"triangles":96,"textures":1,"geometries":2,"programs":2},"scene":{"objects":2,"meshes":1,"lights":1,"cameras":0},"errors":[],"changed":{}}}
```

To find either fault in a page of your own, repeat the action that should leave nothing behind (a shot, a wave, a restart, a route change) ten times in one `interact`, then compare `observe`'s `scene` and `renderer` counts with the game's own idea of what exists. A count that grows with each repetition and never comes back down is the leak, and the action names where it is.

What these replies do not show is the JavaScript heap over time. `perf` reloads the page before it measures, so its heap figure is a fresh page's, and paprika3d has no heap reading across a session. A leak of plain JavaScript objects, a history array pushed to every frame or a listener added on each restart, is found with the browser's memory panel and its heap snapshots. In React Three Fiber, `useFrame` callbacks go away with their component; a stacked loop there is usually a `requestAnimationFrame` started in an effect whose cleanup does not cancel it.

## What paprika3d does not do

- It does not have a phone's memory limit, and it cannot make a context loss from memory pressure. `forceContextLoss()` is a simulated loss, and the counts and megabytes are the numbers that lead to a real one.
- It does not run on iOS, Android or Safari. The pages run in headless Chrome, or Firefox when `open` is given `browser: "firefox"`.
- It keeps a reference to every renderer and scene a page makes, so under the harness an old renderer is never garbage collected. A page that counts on collection to release its contexts gets no help here; in a visitor's browser collection may release some of them first, at a time no page controls. Release them in code, as step 5 does.
- With several renderers alive, `observe`'s renderer counts and the `Canvas:` and `On screen` lines of `look` come from the first renderer the page made, as step 4 shows.
- `perf` reloads the page and counts the textures its scene reaches, so a leak built up by level changes never shows in its texture line.
- It does not change the page. It reports; the agent edits the source and reads the counts again.

## Pitfalls

- **`scene.remove()` is not `dispose()`.** Dispose each geometry, each material and each texture a removed object used, unless something still in the scene shares it. A texture shared by several materials needs one dispose, after the last of them goes.
- **Textures hide in more slots than `map`.** A glTF material also has `normalMap`, `roughnessMap`, `metalnessMap`, `aoMap` and `emissiveMap`; dispose every texture-valued property, and render targets and `PMREMGenerator` output the page made itself.
- **glTF textures may be image bitmaps.** The `GLTFLoader` source says it uses `ImageBitmapLoader` whenever it can, and that image bitmaps are not collected automatically and need special handling when disposed: call `texture.image.close()` after `texture.dispose()` when nothing will upload that texture again.
- **`renderer.dispose()` keeps the context.** Follow it with `renderer.forceContextLoss()` when the renderer goes away for good.
- **One model can be enough on a phone.** A single glTF with large textures can ask for more GPU memory than a phone has to give, leak or no leak; the [textures black on iOS guide](/guides/threejs-gltf-textures-black-ios) adds up one model's textures and caps them.
- **Read the counts after a draw.** The counts are uploads, which happen when a frame draws; right after `open`, before any `look`, they read 0.

## Without paprika3d

`console.log(renderer.info.memory)` after each level change gives the same two counts, and `renderer.info.programs.length` the programs. The three.js manual's page "How to dispose of objects" lists what needs a `dispose()` call and what does not. To simulate a lost context, get the `WEBGL_lose_context` extension from the WebGL context and call `loseContext()` and `restoreContext()`, which is what three's two methods do. Chrome's Task Manager can show each tab's GPU memory, which climbs with a leak. On a phone, Safari's Web Inspector, connected to an iPhone over USB, shows the page's console, where a real context loss is logged.
