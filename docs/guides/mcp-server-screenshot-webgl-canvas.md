---
title: MCP server that screenshots a WebGL canvas, for three.js pages
phrase: mcp server that screenshots a webgl canvas
description: paprika3d is an MCP server that screenshots a WebGL canvas. Its look tool returns the picture of a three.js, React Three Fiber or WebGL page inside the tool result, as an image the model reads, with the named objects on screen and their pixel boxes.
meta: An MCP server that screenshots a WebGL canvas: paprika3d opens your three.js page in headless Chrome and returns the picture and what is on screen.
intent: mcp-server-screenshot-webgl-canvas
queries:
  - "MCP server screenshot WebGL canvas"
  - "MCP server that screenshots a three.js canvas"
  - "let my coding agent see a WebGL canvas"
  - "AI agent screenshot three.js scene"
author: paprika3d agent
date: 2026-10-19
review: weekly
---
# MCP server that screenshots a WebGL canvas, for three.js pages

paprika3d is an MCP server that screenshots a WebGL canvas. A coding agent calls `open` with a page or a dev command, then `look`, and the tool result carries the screenshot itself as an image the model reads in the same turn, with a text part that names each object on screen, its share of the picture and its pixel box. It works on three.js, React Three Fiber and other WebGL pages, and runs in any MCP client: Claude Code, Cursor, Codex, Gemini CLI, VS Code or Windsurf.

## Why a canvas needs a picture and a list

To a browser tool, a WebGL page is one `<canvas>` element with nothing inside it to query: no text, no child nodes, no roles. What the agent wants to know (did the model load, is it in view, is it the right size, is the scene lit) lives in the drawn pixels and in the scene graph behind them. An MCP server for WebGL therefore has two jobs. It renders the page in a real browser with a working WebGL context, and it reads the scene graph at the same frame, so the image and the description agree.

paprika3d does both in its own headless Chrome. The page's clock is paused and stepped at 1/60 s per frame, so a look taken twice at the same frame gives the same picture, which matters when an agent compares the scene before and after an edit.

## Add the server to your MCP client

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later. In Claude Code, install it as a plugin, which also adds the skill and hooks:

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

Any other MCP client runs the same server from npm over stdio:

```json
{
  "mcpServers": {
    "paprika": {
      "command": "npx",
      "args": ["-y", "paprika3d", "serve"]
    }
  }
}
```

For the Codex CLI that is one command: `codex mcp add paprika -- npx -y paprika3d serve`.

## A page to look at

Four named meshes on a round ground, one of them spinning. Naming meshes is the one change worth making to a page, since the text part of the reply lists objects by `name`. The page loads three through an import map, so run `npm install three` in its folder first.

```js
// verify: inline
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdde3ea);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.5, 7);
camera.lookAt(0, 0.6, 0);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(2, 4, 3);
scene.add(key);

// Each mesh has a name, so the reply can say which object is where.
const shapes = [
  ['cone', new THREE.ConeGeometry(0.5, 1.2, 32), 0xe0603a, -2],
  ['sphere', new THREE.SphereGeometry(0.6, 32, 16), 0x3a8ee0, 0],
  ['cylinder', new THREE.CylinderGeometry(0.45, 0.45, 1.2, 32), 0x4cb860, 2],
];
for (const [name, geometry, color, x] of shapes) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
  mesh.name = name;
  mesh.position.set(x, 0.6, 0);
  scene.add(mesh);
}
const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0xb8c0c8 }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

renderer.setAnimationLoop((time) => {
  scene.getObjectByName('cone').rotation.y = time / 800;
  renderer.render(scene, camera);
});
```

Put it in a module script in `index.html`, under an import map that maps `three` to `./node_modules/three/build/three.module.js`.

## The calls and what comes back

Each reply below is what paprika3d returned for this page on 2026-10-19. The run folder is shortened to `<run>`, and the image part of each result is shown as a placeholder.

**Open the page.** The `open` tool serves the folder, loads the page and pauses it at frame 0. `entities` lists the named objects the scene holds:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:57840/index.html in 0.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["cone","sphere","cylinder","ground"],"hasConvention":false}
```

**Take the screenshot.** `look` with no arguments renders the frame through the page's own camera. The MCP result has two parts: a text part, and an `image/jpeg` part holding the screenshot, so a vision model sees the canvas without opening a file. The full-size PNG is saved in the run folder, with an ID image beside it that paints each object in its own flat colour.

```text
look {}

Picture: <run>/look-1.png
Pixels: brightness 76%, colour saturation 11%, 0% near black, 0% blown out.
Hues: grey 93% of the frame; over the objects (51.2% of it): grey 86%, green 6%, blue 5%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames).
Lighting: no tone mapping (renderer.toneMapping is NoToneMapping): bright colours clip to white. Set ACESFilmicToneMapping, AgXToneMapping or NeutralToneMapping.
Surface: "ground" covers 44% with almost no detail (0 of 255): it reads as flat colour. Unless the user asked for flat colour, add texture, normal detail or lighting variation.
World's edge: 36% of the picture is background below the horizon, in [0, 102, 1279, 799], past the far end of the ground: extend the ground, keep the camera over it, or fade it out with scene.fog.
On screen (4):
ground 44% [0, 356, 1279, 799]
cylinder 2.8% [869, 298, 1022, 509]
sphere 2.5% [549, 309, 730, 490]
cone 1.6% [266, 311, 418, 512]
Never visible: none
[image/jpeg: the screenshot]
```

The boxes are `[left, top, right, bottom]` in the picture's pixels, and the default page size is 1280 px by 800 px. Read the lines above `On screen` as notes on the frame: here the page has no tone mapping, and the camera sees past the edge of the ground.

**Enlarge a region.** `zoom` takes a box in the same pixels and returns that part of the frame enlarged, for detail too small to judge at full size:

```text
look {"zoom": [480, 300, 800, 560]}

Picture: <run>/look-2-zoom.png ([480, 300, 800, 560] at 3.08×) of the live page at frame 1, not a saved picture or sheet
[image/jpeg: the region around the sphere, enlarged]
```

**Picture one object from four sides.** `target` frames one named object alone from the front, right, top and a three-quarter angle, in one image, and states its size in world units:

```text
look {"target": "cone"}

Picture: <run>/look-3-views.png (front, right, top, three-quarter)
cone: size 1.298 × 1.2 × 1.298, centre [-2, 0.6, 0]
[image/jpeg: four views of the cone]
```

Other modes of the same tool take a grid of moments (`sheet`), the page at several screen sizes (`viewports`), a scroll-driven page at several stops (`scroll`), another viewpoint for one picture (`camera`), and a saved baseline with a pixel diff against it (`save`, then `compare`). The tools page lists every option.

## Notes for agents and their users

- **The image is in the result.** Clients that pass image content to the model show the screenshot to it directly; the PNG path in the text part is for a person, or for a client that drops images.
- **The canvas size is the page size.** A page that sizes its renderer from `innerWidth` and `innerHeight` draws at 1280 px by 800 px unless a look asks for `viewports`.
- **Dev servers work too.** For a Vite or Next.js project, give `open` the dev-server `command` instead of a `url`; it runs the command in `cwd` and opens the page the server serves.
- **Runs stay in the project.** Pictures go under `paprika3d/runs/` in the project folder, which belongs in `.gitignore`.
- **A page with no renderer.** If no three.js renderer and no `window.__game` appear within 10 s, `open` returns an error that includes the page's console errors, so the agent sees why the canvas stayed empty.
