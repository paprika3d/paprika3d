---
title: React Three Fiber MCP server: see and test your R3F three.js scene
phrase: react three fiber mcp server
description: paprika3d is an MCP server for React Three Fiber. It runs your R3F app's Vite dev server, screenshots the canvas, lists the named meshes on screen, presses keys on exact frames and reads the scene or your game state back as JSON, so a coding agent can check the R3F scene it wrote.
meta: A React Three Fiber MCP server: paprika3d lets your coding agent open an R3F scene, see what is on screen, play it and read its state.
intent: react-three-fiber-mcp-server
queries:
  - "React Three Fiber MCP server"
  - "MCP server for R3F"
  - "let Claude Code see my react-three-fiber scene"
  - "test a React Three Fiber game with an AI agent"
author: paprika3d agent
date: 2026-10-19
review: weekly
---
# React Three Fiber MCP server: see and test your R3F three.js scene

paprika3d is an MCP server that a coding agent uses to see and test a React Three Fiber scene. The agent hands `open` the command that starts your Vite dev server, and from then on `look` returns a screenshot of the canvas with the named meshes on screen, `observe` reads the scene as JSON, and `interact` holds keys for an exact number of frames. Under a paused clock, each frame is 1/60 s of game time, so the same keys always move the scene the same distance.

## What an R3F MCP server has to do

An R3F app is JSX that React turns into a three.js scene graph, drawn into one `<canvas>`. Reading the component tree tells an agent what it meant to draw; it says nothing about what came out. Did the mesh mount, is it inside the camera's view, did the gem get collected when the player reached it? Answering that takes three things at once: the app running under its real bundler, a picture of the frame, and the scene graph React built, read at that same frame.

paprika3d runs the dev server, loads the page in its own headless Chrome with WebGL, and reads the three.js objects R3F created. Because `requestAnimationFrame` and `performance.now` are driven by its clock, `useFrame` advances when the agent asks for frames and stays put otherwise.

## Install it

You need Google Chrome and Node 20.11 or later. Claude Code users (2.1.118 or later) add the plugin, which brings the skill and hooks with the server:

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

In Cursor, VS Code, Windsurf, Gemini CLI or any other MCP client, register the npm package as a stdio server named `paprika`:

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

## The R3F app

A small Vite app with `react`, `react-dom`, `three` and `@react-three/fiber` installed. `src/main.tsx` is below: a player box, a spinning gem and a ground, each given a `name`. Holding the right arrow moves the player; reaching the gem scores and sends the gem to the other side.

```tsx
// verify: inline act=ArrowRight
import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

// The state lives outside React, so the harness reads and sets it without waiting for a render.
const game = { score: 0, player: { x: -3 }, gem: { x: 2 } };
const held = new Set<string>();
let started = false;
const act = ({ key, down = true }: { key: string; down?: boolean }) => { if (down) held.add(key); else held.delete(key); };
addEventListener('keydown', (e) => act({ key: e.key }));
addEventListener('keyup', (e) => act({ key: e.key, down: false }));

const bridge = {
  subject: 'player',
  describe: () => ({ name: 'gem run', stack: 'react-three-fiber', keys: { ArrowLeft: 'hold', ArrowRight: 'hold' } }),
  observe: () => ({ score: game.score, player: { x: +game.player.x.toFixed(3) }, gem: { ...game.gem } }),
  act,
  setState: (s: Partial<typeof game>) => Object.assign(game, s),
};

function Scene() {
  const player = useRef<Mesh>(null);
  const gem = useRef<Mesh>(null);
  useFrame((_, delta) => {
    // The first delta also spans the page's load: count it as one frame.
    const dt = started ? Math.min(delta, 0.1) : 1 / 60;
    started = true;
    game.player.x += ((held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)) * 4 * dt;
    if (Math.abs(game.player.x - game.gem.x) < 0.7) { game.score++; game.gem.x = -game.gem.x; }
    player.current!.position.x = game.player.x;
    gem.current!.position.x = game.gem.x;
    gem.current!.rotation.y += dt * 2;
  });
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={2.5} />
      <mesh ref={player} name="player" position={[-3, 0.5, 0]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#e0603a" />
      </mesh>
      <mesh ref={gem} name="gem" position={[2, 0.5, 0]}>
        <octahedronGeometry args={[0.4]} />
        <meshStandardMaterial color="#3a8ee0" />
      </mesh>
      <mesh name="ground" rotation-x={-Math.PI / 2}>
        <planeGeometry args={[10, 4]} />
        <meshStandardMaterial color="#b8c0c8" />
      </mesh>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <Canvas camera={{ position: [0, 3, 7], fov: 45 }} onCreated={({ camera }) => { camera.lookAt(0, 0.4, 0); (window as any).__game = bridge; }}>
    <color attach="background" args={['#dde3ea']} />
    <Scene />
  </Canvas>,
);
```

The replies below are what paprika3d returned for this app on 2026-10-19. Paths are shortened to `<project>` and `<run>`, and the lines `open` prints about the helper files it writes (`geo.js` and `fx.js`) are left out.

## It works on the app as it is

First, the same app with the `__game` assignment taken out of `onCreated`, as an existing R3F project would arrive. `open` takes the dev-server `command` and the folder to run it in, waits for the page, and pauses it at frame 0. `entities` lists the named objects R3F put in the scene:

```text
open {"command": "npx vite --port 5392 --strictPort", "cwd": "<project>"}

Opened http://localhost:5392/ in 0.3 s, paused at frame 0.
three.js warned: THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["player","gem","ground"],"hasConvention":false}
```

With no game object on the page, `observe` falls back to the named three.js objects and their positions:

```text
observe {}

{"entities":{"player":{"type":"Mesh","position":[-3,0.5,0]},"gem":{"type":"Mesh","position":[2,0.5,0]},"ground":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":0,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":5,"meshes":3,"lights":2,"cameras":0},"errors":[],"changed":null}}
```

Holding the right arrow for 30 frames, half a second of game time, moves the player from x = -3 to x = -1, and the next `observe` reports the change:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 30}, {"key": "ArrowRight", "down": false}]}

{"after":null,"changed":{}}

observe {}

{"entities":{"player":{"type":"Mesh","position":[-1,0.5,0]},"gem":{"type":"Mesh","position":[2,0.5,0]},"ground":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":31,"renderer":{"calls":3,"triangles":22,"textures":1,"geometries":3,"programs":1},"scene":{"objects":5,"meshes":3,"lights":2,"cameras":0},"errors":[],"changed":{"entities":{"player":{"position":[[-3,0.5,0],[-1,0.5,0]]}},"harness":{"renderer":{"calls":[0,3],"triangles":[0,22],"textures":[0,1],"geometries":[0,3],"programs":[0,1]}}}}}
```

## Add window.__game in onCreated to test the rules

Positions say where meshes are, not whether the score went up. With the `bridge` object assigned in `onCreated`, as in the listing above, `open` reads its `describe()` instead of the entity list:

```text
open {"command": "npx vite --port 5391 --strictPort", "cwd": "<project>"}

Opened http://localhost:5391/ in 0.3 s, paused at frame 0.
three.js warned: THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
Page text outside the canvas: none
{"name":"gem run","stack":"react-three-fiber","keys":{"ArrowLeft":"hold","ArrowRight":"hold"},"hasConvention":true}
```

**Look at the frame.** The tool result carries the screenshot as an image the model reads, plus text naming each mesh on screen with its share of the picture and its pixel box. `subject: 'player'` in the bridge gives the `Subject` line:

```text
look {}

Picture: <run>/look-1.png
Pixels: brightness 84%, colour saturation 7%, 0% near black, 0% blown out. Pale: little colour.
Hues: grey 98% of the frame; over the objects (26.3% of it): grey 91%, red 7%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Surface: "ground" covers 24% with almost no detail (0 of 255): it reads as flat colour. Unless the user asked for flat colour, add texture, normal detail or lighting variation.
Subject: player takes 1.8% of the picture [165, 323, 323, 455]; 1 of its 1 named parts show.
Stands out: subject brightness 40% against 79% around it, colour 76% against 6%, edge contrast 0.229.
This camera shows little of the subject: try other views with `look` camera, then move the page's own camera to the best (said once until it changes).
On screen (3):
ground 24% [0, 367, 1279, 580]
player 1.8% [165, 323, 323, 455]
gem 0.49% [848, 338, 950, 435]
Never visible: none
[image/jpeg: the screenshot]
```

**Read the state, play, read it again.** `observe` now returns the game's own state with the renderer counts under `harness`. Holding the right arrow for 75 frames carries the player onto the gem, and `interact` replies with what changed: one point scored, the gem sent to the other side.

```text
observe {}

{"score":0,"player":{"x":-3},"gem":{"x":2},"harness":{"frame":1,"renderer":{"calls":3,"triangles":22,"textures":1,"geometries":3,"programs":2},"scene":{"objects":5,"meshes":3,"lights":2,"cameras":0},"errors":[],"changed":null}}

interact {"steps": [{"key": "ArrowRight", "frames": 75}, {"key": "ArrowRight", "down": false}]}

{"changed":{"score":1,"player":{"x":2},"gem":{"x":-2}}}

observe {}

{"score":1,"player":{"x":2},"gem":{"x":-2},"harness":{"frame":77,"renderer":{"calls":3,"triangles":22,"textures":1,"geometries":3,"programs":2},"scene":{"objects":5,"meshes":3,"lights":2,"cameras":0},"errors":[],"changed":{"score":[0,1],"player":{"x":[-3,2]},"gem":{"x":[2,-2]}}}}
```

**Picture one mesh.** `target` frames a named mesh alone from four sides and gives its size in world units, here the gem at its new place:

```text
look {"target": "gem"}

Picture: <run>/look-2-views.png (front, right, top, three-quarter)
gem: size 1.106 × 0.8 × 1.106, centre [-2, 0.5, 0]
[image/jpeg: four views of the gem]
```

## Notes for R3F projects

- **Name what matters.** The `name` prop on a JSX element becomes the three.js object's `name`, and that is what `look` lists on screen and `observe` reports when the page has no game object. Unnamed meshes still draw, but the reply cannot point at them.
- **Keep game state outside React.** A plain module object, as above, lets `setState` and `observe` work at once instead of waiting for a render, and keeps `useFrame` as the one place the rules advance.
- **Assign `window.__game` in the Canvas's `onCreated`.** The harness starts stepping frames once `__game` exists; assigning it at module load would step frames before the Canvas has mounted.
- **Count the first `useFrame` delta as one frame.** The first delta also spans the page's load. Capping each delta at 0.1 s is not enough for exact tests, since the first one alone would move the player further than one frame of input.
- **The `THREE.Clock` warning is harmless.** React Three Fiber 9 still creates a `THREE.Clock`, and three r186 warns that the class is deprecated. `open` repeats the warning so the agent sees it; nothing in the app needs to change.
- **drei `<Html>` labels are checked.** `look` finds the absolutely positioned elements drei places beside an R3F canvas and reports labels that overlap or sit off screen, as it does for `CSS2DRenderer` labels.
- **Runs stay in the project.** Pictures go under `paprika3d/runs/` in the project folder, which belongs in `.gitignore`.
