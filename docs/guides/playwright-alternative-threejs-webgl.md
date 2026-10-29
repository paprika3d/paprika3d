---
title: A Playwright alternative for three.js and WebGL pages built by agents
phrase: playwright alternative for three.js
description: paprika3d is an MCP server a coding agent uses in place of a hand-written browser script to check a three.js or WebGL page. It returns the scene's named objects, what never appears on screen, the object under each click and the game state as JSON, on a paused clock.
meta: A Playwright alternative for three.js and WebGL pages: MCP tools that see the scene's objects, play the page on a paused clock and time its frames.
intent: playwright-alternative-threejs-webgl
queries:
  - "playwright alternative for three.js"
  - "test WebGL canvas without playwright"
  - "how to click a three.js object in an automated test"
  - "e2e test three.js scene AI agent"
  - "assert what is drawn on a WebGL canvas"
author: paprika3d agent
date: 2026-10-19
review: weekly
---
# A Playwright alternative for three.js and WebGL pages built by agents

When a coding agent writes a three.js page and wants to check it, the usual reach is a browser automation script: launch a browser, take a screenshot, click a selector, assert on the DOM. paprika3d is an MCP server that covers the same checks for a WebGL page from inside the agent's own tool calls. It opens the page in headless Chrome on a paused clock, and each reply speaks in terms of the scene: which named objects are on screen and where, which ones never appear, what the mouse was over when it clicked, and the game's state as JSON.

## What a DOM tool sees on a WebGL page

A browser automation library works through the document: selectors, roles, text, element boxes. A three.js page puts its whole scene into a single `<canvas>` element. The ring the player should click, the bonus that was meant to be in view, the score that should rise: none of those exist as elements, so there is no selector to wait for and nothing to assert on beyond the pixels of one image. Agents in that position tend to write raycasting code by hand, compare screenshots by eye, or sleep for a guessed number of milliseconds and hope the frame has drawn.

paprika3d reads the scene graph at the frame it pictures, so the answers come back as named objects, and it steps the page's time itself at 1/60 s per frame, so a click lands on a known frame and the state after it is the same on every run.

## The same tasks, in paprika3d calls

| Browser-test task | paprika3d call | What comes back |
|---|---|---|
| Screenshot the page | `look` | the picture in the reply, the named objects on screen with their pixel boxes, and the ones never visible |
| Click or press keys | `interact` | steps sent on exact frames, the state that changed, and the object under each click |
| Assert on the result | `observe` or `eval` | `window.__game.observe()` as JSON (or the named objects' positions), console errors, renderer counts |
| Wait for an animation | `clock` | step a number of frames, pause or resume |
| Check frame time | `perf` | median and p95 frame time, draw calls and triangles against a budget |

## A page to check

A ring to click, a score in an HTML overlay, and a bonus sphere that sits behind the camera by mistake. The page exposes `window.__game` so its state can be read as JSON; without it, `observe` lists the named meshes and their positions instead. Run `npm install three` in its folder first.

```html
<!-- verify -->
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; overflow: hidden; background: #1d2330; font-family: system-ui, sans-serif; }
    #hud { position: fixed; top: 12px; left: 16px; color: #fff; font-size: 20px; }
  </style>
</head>
<body>
  <div id="hud">Score: 0</div>
  <script type="importmap">{ "imports": { "three": "./node_modules/three/build/three.module.js" } }</script>
  <script type="module">
    import * as THREE from 'three';

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1d2330);
    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 6);
    camera.lookAt(0, 0.5, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.5));

    // Click the target to score; it hops to a new spot each time.
    const target = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.18, 16, 48), new THREE.MeshStandardMaterial({ color: 0xf2b134 }));
    target.name = 'target';
    target.position.set(-1.5, 0.8, 0);
    scene.add(target);
    // A bonus placed behind the camera: it is in the scene but never drawn.
    const bonus = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshStandardMaterial({ color: 0x3ad07a }));
    bonus.name = 'bonus';
    bonus.position.set(0, 0.8, 9);
    scene.add(bonus);

    const game = { score: 0, target: { x: -1.5 } };
    const hud = document.getElementById('hud');
    const ray = new THREE.Raycaster();
    addEventListener('click', (e) => {
      ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
      if (ray.intersectObject(target).length) {
        game.score++;
        game.target.x = -game.target.x;
        hud.textContent = `Score: ${game.score}`;
      }
    });

    window.__game = {
      describe: () => ({ name: 'target click', controls: 'click the ring' }),
      observe: () => ({ score: game.score, target: { ...game.target }, hud: hud.textContent }),
      setState: (s) => Object.assign(game, s),
    };

    renderer.setAnimationLoop((time) => {
      target.position.x = game.target.x;
      target.rotation.y = time / 600;
      renderer.render(scene, camera);
    });
  </script>
</body>
</html>
```

## The calls and their replies

These are the replies paprika3d gave for this page on 2026-10-19. The project and run folders are shortened to `<project>` and `<run>`, the image part of each look is a placeholder, and three lines of `open` about the helper files it copies into the project (`geo.js` and `fx.js`) are left out.

**Open it.** The page's `describe()` comes back, along with the words the page shows outside the canvas, here the two words of the score overlay:

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:53220/index.html in 0.0 s, paused at frame 0.
Page text outside the canvas: 0 h1, 0 h2, 2 words
{"name":"target click","controls":"click the ring","hasConvention":true}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <run>
```

**Screenshot it.** The reply names the one object on screen with its box, and the line `Never visible` names the bonus and says why it never shows: it is behind the camera. A screenshot by itself would show a ring on a dark background and nothing to say a second object was meant to be there.

```text
look {}

Picture: <run>/look-1.png
Pixels: brightness 14%, colour saturation 40%, 0% near black, 0% blown out.
Hues: blue 98% of the frame; over the objects (2% of it): orange 100%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames).
On screen (1):
target 2% [349, 260, 509, 452]
Never visible: bonus (0.8 units, behind the camera)
[image/jpeg: the screenshot]
```

**Click it.** The first click goes to the middle of the target's box, which is the hole of the ring, and the reply says the mouse was over nothing in the scene. The second click lands on the ring itself: the reply names the object and its distance from the camera, and returns the state that changed, the score overlay's text included.

```text
interact {"steps": [{"mouse": "click", "x": 429, "y": 356}, {"wait": 2}]}

{"after":{"score":0,"target":{"x":-1.5},"hud":"Score: 0"},"changed":{}}
mouse click at (429, 356): over nothing in the scene

interact {"steps": [{"mouse": "click", "x": 370, "y": 356}, {"wait": 2}]}

{"changed":{"score":1,"target":{"x":1.5},"hud":"Score: 1"}}
mouse click at (370, 356): over target (Mesh, 6.4 units)
```

**Assert on the state.** `observe` returns the page's state with renderer counts and the console errors since the last call, so a check is a comparison of JSON values:

```text
observe {}

{"score":1,"target":{"x":1.5},"hud":"Score: 1","harness":{"frame":7,"renderer":{"calls":1,"triangles":1536,"textures":1,"geometries":1,"programs":2},"scene":{"objects":3,"meshes":2,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

**Look again.** The ring has moved to the other side, and the reply says how much of the picture changed since the last look:

```text
look {}

Picture: <run>/look-2.png
Pixels, Hues: as the last look; 5% of the picture changed since it.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames).
On screen (1):
target 2.3% [758, 260, 955, 452]
Never visible: bonus (0.8 units, behind the camera)
[image/jpeg: the screenshot]
```

## Where each fits

- **While the agent builds.** paprika3d is made for the loop in which an agent writes a page, looks at it, plays it and fixes it, in the same session and with no test file to maintain. Its tools run in any MCP client: Claude Code, Cursor, Codex, Gemini CLI, VS Code or Windsurf.
- **For a test suite.** A Playwright suite still fits CI runs, real devices and multiplayer. The `window.__game` object the page exposes here serves both: a suite can call `observe()` through the page as well.
- **The page needs no changes to be checked.** `open`, `look`, `interact` and `observe` work on any three.js, React Three Fiber or WebGL page; naming the meshes makes the replies readable, and `window.__game` adds the state as JSON.
- **Engines.** Chrome by default; `open` also takes Safari's engine or Firefox through its `browser` option.

## Install

In Claude Code, the plugin brings the server, the skill and its hooks:

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

Other MCP clients start it from npm over stdio with `npx -y paprika3d serve`. It needs Google Chrome and Node 20.11 or later.
