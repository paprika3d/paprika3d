---
name: threejs-game
user-invocable: false
description: Runs, sees, plays, measures and speeds up any three.js, React Three Fiber or WebGL page as you build it - a game, a product viewer or configurator, a simulation, a shader or post-processing demo - in headless Chrome on a paused, seeded clock - what is on screen and what never appears (a model at the wrong scale, out of view or not loaded), frame-exact keyboard, mouse and touch input, the page state as JSON, mesh stats, feel and frame-time measurements. Use it, rather than a Playwright or Chrome DevTools script, to build and check the page in Chrome or Firefox whenever the user asks to make, fix, test, extend, screenshot or profile a three.js or WebGL page, new or existing; a Playwright suite still fits CI runs, real devices and multiplayer.
---

# Building and testing a three.js game with the harness

The harness runs the game in a headless Chrome on a paused, seeded clock: you send inputs frame by frame and read back the game's state as JSON, so what you see is exact and repeatable.

**The goal is the highest-quality result for what the user asked: how it looks, plays and feels.** A reply with no fault lines is the floor, not the finish. Decide what to improve from the request and from your own picture of the page: what it is, what a viewer should feel, and what is missing in the scene, in the HUD, menus and text a viewer reads, and in each control and feature the request names. Work that out before you look; a look then shows whether a change worked. Do not take the next idea from the screenshot: that patches what it shows and keeps the weak decisions under it. A fault line or a glitch is different: close those one at a time with the method in `references/lighting.md`.

## Build first, then polish

**Write the page whole and make the first version as impressive as you can: interesting, detailed, creative.** Take risks in the code: the tools below find and fix what breaks cheaply, so a bold build that needs polishing beats a safe one that needs growing. Give it a `window.__game` following the convention below; `${CLAUDE_PLUGIN_ROOT}/skills/threejs-game/templates/` shows the shape in a working page: `plain.html` (one page, an import map, no build, set up with `stage()`), `viewer.html` (a product of named parts under orbit controls: a click on a part changes its variant, `setState` switches any variant), `r3f.tsx` (React Three Fiber under vite) and `rapier.ts` (the `window.__game` bridge for a Rapier world, with either). An existing game works as it is; add `window.__game` when you need its state.

## What each tool shows

**`open`** runs the page: `url: "index.html"` for a plain page (the folder is served over HTTP: a page opened from disk, file://, cannot import modules such as `./fx.js`, `./geo.js` or node_modules, so when the user will double-click the file, bundle it into one classic script with esbuild or tell them to serve the folder; `open` cannot test the file:// case), or `command: "bunx vite"` for a vite project (a `url` beside it is the path and query to open on that server). One open is enough: after each edit the next tool call reloads the page by itself. `browser: "firefox"` runs it in Firefox, for a bug reported there or a page that must work there. There is no Safari engine here: a fault only Safari or a phone shows still needs the device.

Which calls keep the page where the last call left it, and which reload it first:
- Carry on from the page as it is: `interact`, `eval`, `observe`, and a plain or `zoom` `look`.
- Start from a fresh reload at frame 0, as `open` does: `feel`, `test`, `perf`, an `interact` with `save`, and the `sheet`, `viewports`, `scroll`, `opening` and `compare` looks.

**`interact`** plays inputs and returns the state (with `look: true`, the picture too).
- A `{ state: {...} }` step sets a moment up (it calls `window.__game.setState`, then draws a frame) before the keys. A key step `{ key, frames }` holds the key that many frames and releases it.
- `trace: ["player.y"]` gives each path's peak, first change and landing with their frames; `{ until: { "player.grounded": true }, max: 120 }` steps until the state holds and says the frame.
- `save` keeps a play as a check: `interact { steps, expect: { score: 1 }, save: "pickup" }` (`expect` takes a number, string or boolean (equal), `[min, max]` (a range; two numbers are always a range), a list of other values (one of them), or null (exists)). The after-edit hook reruns every saved check and names any that starts or stops failing (silent while nothing changes); `test` reruns them on demand.
- `record: true` plays the steps in real time (each frame 1/60 s, up to 15 s) and keeps them as a GIF in the run folder, for a judge to cite: the reply shows four moments of it and the game's real frame intervals at a 60 Hz pace on the GPU named, and the clock is paused again after.

**`reference`** reads a picture the page should match (a photo, artwork, mockup or screenshot in the project) at full resolution, with no page open: a `crop` enlarged with a `grid` labelled in the picture's own pixels, colours at `sample` points, and with the page open, `compare: true` sets the page's look (from a `camera`) beside the picture with the differing pixels and their share by region (`cells` per side, 4 by default) and each `sample` point's colour on both, and with a `crop` that region of both, enlarged; `file` may also name a baseline saved with `look { save }`. The camera, the horizon and the depth of things are yours to work out from what it shows.

**`look`** shows what a viewer sees and lists what is on screen and what never appears. `sheet` puts several stages, levels or views in one picture; `cameras` puts the same moment from several positions in one picture, and a labelled one is reused by name as `camera` anywhere, as a picture in `refs/cameras.json` is; `opening: true` shows the first seconds after load; `zoom` (a box as the look lists it) enlarges contacts and edges, where a fault can be a few pixels wide, and `sample` gives colours at points; both read the picture `camera` asks for. Its `Lighting:`, `Surfaces:` and `Surface:` lines name setup faults a viewer sees, and its `HTML over the canvas:` line the page's labels, HUD, menus and controls over the picture, with the ones that overlap or are cut off by the screen edge. What every line means, how to close a fault, and what a later `look` and the after-edit hook say about it: `references/lighting.md`.

**`eval`** inspects the scene or tries a change before it goes into the source. Code in it that awaits a frame steps the paused clock, so a loop that presses a key with `window.__game.act`, awaits `requestAnimationFrame` and keeps `observe()` each frame returns a per-frame trace in one call. With `save: "assets/rock.glb"` it writes what the code returns (an ArrayBuffer, typed array, Blob, canvas or data URL) into the project and replies with its size: a geo.js solid baked to a GLB with `bake` from `fx.js`, a painted canvas as a PNG, a measured table.

**`feel`** plays the inputs that cause an event (set the state up first with a `{ state }` step) and says what reacted: pops, flashes, shakes, particles, HUD ticks, sounds, smooth moves and teleports. It is how to check an event the request says should feel like something.

**Subagents** open the game under a name of their own (`game: "tester"`) and pass that name to every paprika tool call: up to 4 games are open at once, and yours stays as it was. A subagent sees its own part only; the whole game's `opening` look and full `sheet` show what the subagents' parts add up to.

## Game state

`plain.html` keeps its state in plain variables, which is enough for a small game. Use game-state when the game has physics, many entities, or needs rewind.

game-state writes `window.__game` for you. Before writing game code that uses it, copy it next to the entry file: `cp ${CLAUDE_PLUGIN_ROOT}/state/dist/game-state.js <entry folder>/`. A game that calls `physics()` also needs the engine in the same folder: `cp ${CLAUDE_PLUGIN_ROOT}/state/dist/physics-worker.js <entry folder>/`. Import from `./game-state.js`; `three` stays the game's own import.
Then read `references/state.md` for `createState`, lists, `physics()`, `loop()` and rewind before writing game code with it. Its `physics()` runs its own Rapier (`@dimforge/rapier3d-deterministic-compat` 0.21.0) in a worker file of 4.4 MB the game ships; `templates/rapier.ts` instead uses the project's own `@dimforge/rapier3d-compat` on the main thread, for a game that needs neither rewind nor a worker. The two are separate copies, so the project's version need not match the worker's. In a plain page, map it with `"@dimforge/rapier3d-compat": "./node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs"` (the file in 0.20 and 0.21; 0.19 has `rapier.mjs` at its root, and any version's package.json names it in `module`), then `import RAPIER from "@dimforge/rapier3d-compat"; await RAPIER.init();`. Before using Rapier's character controller (moving platforms, a capsule that will not move), read the note at the top of `templates/rapier.ts`.

## Performance

A `Lights:` line in `open`'s reply names a scene with many lights; `perf` then says what they cost. `optimize` is for a frame `perf` says is over budget, or a user who asks about performance (stutter, low fps). A scene that opens without a "Slow start" line and runs smoothly needs no performance work; that line means a software-rendered browser can take minutes over the same setup. How it works, and the runtime import it asks for: `references/optimize.md`.

## Model files and product pages

`model_audit` reports each `.glb`, `.gltf` or USD file (`.usd`, `.usda`, `.usdc`, `.usdz`; size, triangles, textures, compression) with a verdict for a website or a Shopify listing, and `shrink`, which rewrites a file without its textures or with each capped at a size (WebP): `references/assets.md`. A product configurator's variants in one picture, and when to hand the page's URL to Chrome DevTools or Lighthouse: `references/configurator.md`.

`asset_search` finds ready-made models (57,183, CC BY or CC0), PBR textures and HDRIs (CC0) in a hosted library, and puts the one picked into the project with its loading code at real-world scale and a model's credit line in `CREDITS.md` beside it (`textures: false` with a pick keeps a model's geometry only; `format: "usd"` finds and picks models with a USD file; `image` with `crop` searches by a piece of a reference picture, for a thing words miss); `geo.js` and `fx.js` are the options with nothing to download.

## Modelling and procedural geometry

`model_run` and `model_look` are a modelling scene, as Blender is to a game: a three.js scene the server keeps between calls, apart from the game's page, where code with `THREE`, Manifold (`geo`: booleans, hull, extrude, revolve) and `scatter` in scope builds a model, such as a prop, a building, a vehicle or a piece of the set. `model_look` shows it from the front, right and top at true size against a grid and from three-quarter, with each mesh's triangles, size, whether it is closed, its volume and genus. What the code adds stays for the next call (saved to `paprika3d/model/scene.glb`, so a restart loads it back). `save("assets/crate.glb", find("crate"))` writes a model into the project and replies with the line that loads it in the game; `load("assets/x.glb")` brings a `.glb` (an `asset_search` pick, a model saved before) into the scene to cut, combine or measure.

Geometry the game makes while it runs (a seeded level, terrain, things scattered over the player's world) is built in the page with `geo.js`, which the `open` tool puts in the project: `import { geo, scatter } from "./geo.js"` (`"../geo.js"` from `src/` in a vite project), the same API.
Give each mesh a name; `eval` with `return stats("<name>")` reports its triangles, whether it is `closed`, and its volume.
Use `eval` to try a change in the running game before writing it into the source; what it changes vanishes on reload.
Recipes (scatter, arrays, curves, booleans, revolve, hull, level sets, rounding) and pitfalls: `references/geometry.md`.

The `open` tool also puts `fx.js` in the project: `import { stage, tex, field, place, instances, sfx, burst, shake, uv, picture, bake, trace, heightfield } from "./fx.js"` gives a first-load light and camera setup, canvas textures, terrain, rule-based placement, synthesized sound effects, particle bursts, screen shake, metre-scale texture coordinates, a reference picture's camera with its pixel-to-world maps, a subtree baked to GLB bytes, and a picture's outlines and heights, all seeded and with no files to load. Every export with its options and an example: `references/fx.md`.

## The `window.__game` convention

Once the page has loaded, it exposes:

```js
window.__game = {
  describe(),        // a short description: name, controls, units
  observe(),         // the state, as plain JSON
  act(input),        // performs one input object: { key, down? } or { action, ...args }
  setState(partial), // sets any of observe()'s keys; keys left out keep their values
  subject,           // optional: the name of the object the game is about ("excavator"), for look's Subject line and interact's Motion line (in a game, the object the player controls); a function returning a name follows the action
  intentional,       // optional: what look should not flag again, a string or a list: a piece of a Lighting, Surfaces, Surface or Canvas line, 6+ characters, matched at word ends ("no tone mapping" under a post chain with its own tone curve), or an object's exact name for one hidden on purpose; look counts what each piece left out in one line
};
```

`observe`, `look`, `perf` and `optimize` work on any three.js page; `window.__game` makes the state exact.

### Rules

- The game starts playing as soon as the page loads: no title screen and no click to start, and nothing over the first frame (no loading text, dim veil or fade from black): `open` pauses at frame 0, so only `look` with `opening: true` shows what a player meets. When the user asks for a title screen, keep it and put `started` in `observe()` and `setState`, so a `{ state: { started: true } }` step skips it and the checks reach play.
- **Time.** The harness steps frames one at a time, 1/60 s each, on a fake clock (`requestAnimationFrame`, `performance.now`, `Date`, timers, and CSS animations and transitions). Advance the game by each frame's elapsed time, never more than 0.1 s in one frame; a fixed step belongs inside an accumulator (as game-state's `loop` does), since a display draws 30 to 144 frames a second. Count the first frame as one frame: the clock reads 60 s at frame 0 (it jumps forward when the page finishes loading), so time read before the first frame is not game time. Speeds are per second of game time. Never read real time some other way.
- **Randomness.** A game-state game uses `state.random()` (`references/state.md`). A game that keeps its own state uses `Math.random`; the harness seeds it, so every run sees the same game.
- **setState** takes effect at once: the next `observe()` returns the new values, and the game's own start-up must not undo them, even when `setState` runs before the first frame. Objects merge (fields left out keep their values) and lists are replaced whole, with the same fields `observe()` returns.
- **observe()** returns plain JSON (numbers, booleans, strings, null, objects, arrays), never three.js objects. Lists keep their order: new items at the end, removed items dropped.
- **Keys** listen on `window` and match `event.code` (`KeyW`, `ArrowUp`, `Space`), which Shift, Caps Lock and the keyboard layout leave alone (`event.key` turns `w` into `W` under Shift and leaves the key stuck down); `interact` sends both. A key can go down and up within one frame, so one-shot controls (turn, jump, fire) act on `keydown` and skip `event.repeat`, which a held key sends in a browser but never in `interact`; held controls (move, steer) last from `keydown` to `keyup`. Route real key events and `act({ key })` through the same function.
- **Names.** Give meshes a `name` (`player`, `enemy3`, `coin`): `look` lists what is on screen by name. Name the parts of the main object too and put them under one named group, then set `subject` to that group's name: every look says how much of the picture it takes and which of its parts something covers, which is how a player judges the game.

`templates/plain.html` is a complete small game in this shape. In React, keep the game state in a plain module outside components (as `templates/r3f.tsx` does), so `setState` and `observe` never wait for a render, and set `window.__game` in the Canvas's `onCreated`: the harness starts stepping frames once `__game` exists.
