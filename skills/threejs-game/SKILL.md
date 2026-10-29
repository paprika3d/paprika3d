---
name: threejs-game
user-invocable: false
description: Runs, sees, plays, measures and speeds up any three.js, React Three Fiber or WebGL page as you build it - a game, a product viewer or configurator, a simulation, a shader or post-processing demo - in headless Chrome on a paused, seeded clock - what is on screen and what never appears (a model at the wrong scale, out of view or not loaded), frame-exact keyboard, mouse and touch input, the page state as JSON, mesh stats, feel and frame-time measurements. Use it, rather than a Playwright or Chrome DevTools script, to build and check the page in Chrome or Firefox whenever the user asks to make, fix, test, extend, screenshot or profile a three.js or WebGL page, new or existing; a Playwright suite still fits CI runs, real devices and multiplayer.
---

# Building and testing a three.js game with the harness

The harness runs the game in a headless Chrome on a paused, seeded clock: you send inputs frame by frame and read back the game's state as JSON, so what you see is exact and repeatable.

**The goal is the highest-quality result for what the user asked: how it looks, plays and feels.** A reply with no fault lines is the floor, not the finish. Decide what to improve from the request and from your own picture of the page: what it is, what a viewer should feel, and what is missing in the scene, in the HUD, menus and text a viewer reads, and in each control and feature the request names. Work that out before you look; a look then shows whether a change worked. Do not take the next idea from the screenshot: that patches what it shows and keeps the weak decisions under it. A fault line or a glitch is different: close those one at a time with the method in `references/lighting.md`.

## Build first, then polish

**Write the page whole and make the first version as impressive as you can: interesting, detailed, creative.** Take risks in the code: the tools below find and fix what breaks cheaply, so a bold build that needs polishing beats a safe one that needs growing. Give it a `window.__game` following the convention below; `${CLAUDE_PLUGIN_ROOT}/skills/threejs-game/templates/` shows the shape in a working page: `plain.html` (one page, an import map, no build, set up with `stage()`), `viewer.html` (a product configurator: `references/configurator.md`), `r3f.tsx` (React Three Fiber under vite) and `rapier.ts` (the `window.__game` bridge for a Rapier world, with either). An existing game works as it is; add `window.__game` when you need its state.

## What each tool shows

Every option of these tools: `references/tools.md`.

- **`open`** runs the page: `url: "index.html"` for a plain page (served over HTTP; a file:// page cannot import modules), or `command: "bunx vite"`. One open is enough: after each edit the next tool call reloads the page. `browser: "firefox"` runs Firefox; there is no Safari engine.
- **`interact`** plays inputs frame by frame and returns the state: a `{ state }` step sets a moment up, `trace` and `until` time a change, `save` keeps a play as a check the after-edit hook reruns (`test` on demand), `record` keeps a real-time GIF.
- **`look`** shows what a viewer sees, what is on screen and what never appears; `sheet`, `cameras`, `opening`, `zoom` and `sample` show more. Its `Lighting:`, `Surfaces:`, `Surface:` and `HTML over the canvas:` lines, and how to close a fault: `references/lighting.md`.
- **`reference`** reads a picture the page should match (a crop with a grid, colours at points) and with `compare: true` sets the page's look beside it.
- **`eval`** inspects the scene or tries a change before it goes into the source; what it changes vanishes on reload. Code that awaits a frame steps the clock; `save` writes what it returns into the project.
- **`feel`** plays the inputs that cause an event and says what reacted: how to check an event the request says should feel like something.
- **Subagents** open the game under their own name (`game: "tester"`) and pass it to every paprika tool call; up to 4 games are open at once.

Which calls keep the page where the last call left it, and which reload it first:
- Carry on from the page as it is: `interact`, `eval`, `observe`, and a plain or `zoom` `look`.
- Start from a fresh reload at frame 0, as `open` does: `feel`, `test`, `perf`, an `interact` with `save`, and the `sheet`, `viewports`, `scroll`, `opening` and `compare` looks.

## Game state

`plain.html` keeps its state in plain variables, enough for a small game. Use game-state when the game has physics, many entities, or needs rewind. It writes `window.__game` for you. Before writing game code that uses it, copy it next to the entry file: `cp ${CLAUDE_PLUGIN_ROOT}/state/dist/game-state.js <entry folder>/`, and for a game that calls `physics()` also `cp ${CLAUDE_PLUGIN_ROOT}/state/dist/physics-worker.js <entry folder>/`. Import from `./game-state.js`; `three` stays the game's own import. Then read `references/state.md` for its API and its Rapier beside the project's own; for Rapier's character controller, the header of `templates/rapier.ts`.

## Performance, models, geometry and effects

- A `Lights:` line in `open`'s reply names a scene with many lights (`perf` says what they cost), and a "Slow start" line a setup a software-rendered browser can take minutes over; a page with no "Slow start" line that runs smoothly needs no performance work. `perf` with `optimize: true` is for a frame `perf` says is over budget, or a user who asks (stutter, low fps): `references/optimize.md`.
- `model_audit` reports each `.glb`, `.gltf` or USD file with a verdict for a website or a Shopify listing, and `shrink` rewrites one smaller; `asset_search` finds ready-made models, PBR textures and HDRIs and puts the one picked into the project with its loading code: `references/assets.md`. A configurator's variants in one picture, and when to hand the URL to Chrome DevTools or Lighthouse: `references/configurator.md`.
- `model_run` and `model_look` are a modelling scene the server keeps between calls, as Blender is to a game: code with `THREE`, Manifold (`geo`) and `scatter` builds a model, `model_look` shows it from four sides with each mesh's measurements, and `save` writes it into the project. Geometry the game makes while it runs is built in the page with `geo.js`, which `open` puts in the project (`import { geo, scatter } from "./geo.js"`, the same API). Recipes, `stats` checks and pitfalls: `references/geometry.md`.
- `open` also puts `fx.js` in the project: lights and camera (`stage`), textures, terrain, placement, sound, particles, shake and more, seeded, with no files to load: `references/fx.md`.

## The `window.__game` convention

Once the page has loaded, it exposes:

```js
window.__game = {
  describe(),        // a short description: name, controls, units
  observe(),         // the state, as plain JSON
  act(input),        // performs one input object: { key, down? } or { action, ...args }
  setState(partial), // sets any of observe()'s keys; keys left out keep their values
  subject,           // optional: the name of the object the game is about
  intentional,       // optional: what look should not flag again
};
```

`observe`, `look` and `perf` work on any three.js page; `window.__game` makes the state exact. The optional keys and each rule below in full: `references/tools.md`.

### Rules

- **Start.** The game plays as soon as the page loads: no title screen, no click to start, nothing over the first frame (loading text, a dim veil, a fade). `open` pauses at frame 0. A title screen the user asks for puts `started` in `observe()` and `setState`, so a `{ state: { started: true } }` step skips it.
- **Time.** The harness steps frames of 1/60 s on a fake clock (`requestAnimationFrame`, `performance.now`, `Date`, timers, CSS animations and transitions). Advance the game by each frame's elapsed time, at most 0.1 s a frame, with a fixed step inside an accumulator. The clock reads 60 s at frame 0. Never read real time some other way.
- **Randomness.** A game-state game uses `state.random()`; a game that keeps its own state uses `Math.random`, which the harness seeds.
- **setState** takes effect at once, even before the first frame, and the game's start-up must not undo it. Objects merge; lists are replaced whole.
- **observe()** returns plain JSON, never three.js objects. Lists keep their order.
- **Keys** listen on `window` and match `event.code` (`KeyW`, `Space`). One-shot controls act on `keydown` and skip `event.repeat`; held controls last from `keydown` to `keyup`. Real key events and `act({ key })` go through the same function.
- **Names.** Give meshes a `name` (`player`, `coin`): `look` lists what is on screen by name. Put the main object's named parts under one named group and set `subject` to it.

`templates/plain.html` is a complete small game in this shape. In React, keep the state in a plain module and set `window.__game` in the Canvas's `onCreated` (`templates/r3f.tsx`).
