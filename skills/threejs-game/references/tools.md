# The tools in full, and the `window.__game` rules

SKILL.md says when each tool helps and which calls reload the page; this page gives each one's options, and each `window.__game` rule with its reasons.

## `open`

`url: "index.html"` for a plain page, or `command: "bunx vite"` for a vite project (a `url` beside it is the path and query to open on that server).

The folder is served over HTTP: a page opened from disk, file://, cannot import modules such as `./fx.js`, `./geo.js` or node_modules, so when the user will double-click the file, bundle it into one classic script with esbuild or tell them to serve the folder; `open` cannot test the file:// case.

One open is enough: after each edit the next tool call reloads the page by itself. `browser: "firefox"` runs it in Firefox, for a bug reported there or a page that must work there. There is no Safari engine here: a fault only Safari or a phone shows still needs the device.

## `interact`

Plays inputs and returns the state (with `look: true`, the picture too).

- A `{ state: {...} }` step sets a moment up (it calls `window.__game.setState`, then draws a frame) before the keys, as `{ state: { player: { x: 2, z: 0 } } }`. A key step `{ key, frames }` holds the key that many frames and releases it; `{ key, down: true }` holds it across steps until `{ key, down: false }`.
- A step's frames run without drawing except its last; `draw: true` on a step draws every frame, for a picture that builds up over frames (trails, progressive rendering). `frames: 0` sends a step on the same frame as the next: two keys down at once, for a diagonal.
- `trace: ["player.y"]` gives one line per path, as `player.y: 0 → peak 2.04 at frame 22 → 0 at frame 44; first changed at frame 2`, read every frame of the steps after the leading state steps (the first 600 frames): jump height and airtime, stopping distance, frames from key to motion. `{ until: { "player.grounded": true }, max: 120 }` steps one frame at a time, drawing none, until the state holds and says the frame, or what it saw.
- `{ scroll }` scrolls the window; the reply says where, and the progress of Lenis, ScrollTrigger or drei ScrollControls when it finds one. `{ mouse: "move", relative: [dx, dy] }` is mouse look under pointer lock.
- `{ clock: { timescale } }` sets the clock's speed, and `paused: false` plays in real time until `paused: true`. The clock reads 60 s at frame 0 on purpose, past any boot, so a page's own time starts there.
- The Motion line is about the subject (`window.__game.subject`, or where the state puts its player); the Sound line counts the sounds the steps started.
- `hover: ["coin"]` moves the mouse to each named object's centre on screen after the steps and returns what changed there after `frames`, one diff per name.
- `save` keeps a play as a check: `interact { steps, expect: { score: 1 }, save: "pickup" }` (`expect` takes a number, string or boolean (equal), `[min, max]` (a range; two numbers are always a range), a list of other values (one of them), or null (exists)). A call with `save` plays its steps from a fresh reload, as the reruns will, so its leading state steps become its setup. The after-edit hook reruns every saved check and names any that starts or stops failing (silent while nothing changes); `test` reruns them on demand.
- `record: true` plays the steps in real time (each frame 1/60 s, up to 15 s) and keeps them as a GIF in the run folder (480 px, each frame shown for its real time, the HTML over the canvas included), for a judge to cite: the reply shows four moments of it and the game's real frame intervals at a 60 Hz pace (median, p95, max; a slower frame reads as its own time, not a 60 Hz screen's 33 ms) on the GPU named, with `look: true` look's picture too, and the clock is paused again after. `record: "video"`, where the schema offers it, films the steps for a person on the paused clock: every frame drawn and pictured with the HTML over the canvas into a 60 fps H.264 MP4 at the page's full size, smooth whatever the machine's speed, with no sound and no frame timing; filming a frame takes a screenshot's time.

## `reference`

Reads a picture the page should match (a photo, artwork, mockup or screenshot in the project) at full resolution, with no page open: a `crop` enlarged with a `grid` labelled in the picture's own pixels, and colours at `sample` points. With the page open, `compare: true` sets the page's look (from a `camera`) beside the picture with the differing pixels and their share by region (`cells` per side, 4 by default) and each `sample` point's colour on both, and with a `crop` that region of both, enlarged; `file` may also name a baseline saved with `look { save }`. The camera, the horizon and the depth of things are yours to work out from what it shows.

## `look`

Shows what a viewer sees and lists what is on screen and what never appears.

- `sheet` puts several stages, levels or views in one picture, each cell a fresh reload set with `state`, then `steps` and `frames`. On a software renderer (no GPU) each cell reloads and replays the page at roughly a second per drawn frame.
- `cameras` puts the same moment from several positions in one picture, and a labelled one is reused by name as `camera` anywhere, as a picture in `refs/cameras.json` is.
- `target: "excavator"` pictures one object alone from four sides, framed to its size: a model or procedural shape checked from every side.
- `opening: true` shows the first seconds after load: a loading screen or dim intro still up at 2 s is what a viewer sees first.
- `viewports` and `scroll` picture each size or scroll stop on a fresh reload. A viewport cell's line gives the subject's share, the objects on screen and whether the canvas is sized right; a scroll cell's gives the camera's position and look direction and the objects on screen.
- `zoom` (a box as the look lists it) enlarges contacts and edges, where a fault can be a few pixels wide, and `sample` gives colours at points; both read the picture `camera` asks for.
- `at` lists the objects drawn at each point as the page's own shaders draw them (a part a shader discards is skipped and named): what is under a crosshair, why a click misses, which layer covers a product.
- `save: "hero"` keeps the picture with its frame and page size; `compare: "hero"` reloads to that frame and adds a diff picture, differences in red, so an edit's effect needs no diff script.

Its `Lighting:`, `Surfaces:` and `Surface:` lines name setup faults a viewer sees, and its `HTML over the canvas:` line the page's labels, HUD, menus and controls over the picture, with the ones that overlap or are cut off by the screen edge. What every line means, how to close a fault, and what a later `look` and the after-edit hook say about it: `lighting.md`.

## `eval`

Inspects the scene or tries a change before it goes into the source; what it changes vanishes on reload. Code in it that awaits a frame steps the paused clock, so a loop that presses a key with `window.__game.act`, awaits `requestAnimationFrame` and keeps `observe()` each frame returns a per-frame trace in one call. With `save: "assets/rock.glb"` it writes what the code returns (an ArrayBuffer, typed array, Blob, canvas or data URL) into the project and replies with its size: a geo.js solid baked to a GLB with `bake` from `fx.js`, a painted canvas as a PNG, a measured table.

## `feel`

Plays the inputs that cause an event (set the state up first with a `{ state }` step) and says what reacted: pops, flashes, shakes, particles, HUD ticks, sounds, smooth moves and teleports. It is how to check an event the request says should feel like something.

## Subagents

A subagent opens the game under a name of its own (`game: "tester"`) and passes that name to every paprika tool call: up to 4 games are open at once, and yours stays as it was. A subagent sees its own part only; the whole game's `opening` look and full `sheet` show what the subagents' parts add up to.

## `window.__game`'s optional keys

- `subject`: the name of the object the game is about ("excavator"), for look's Subject line and interact's Motion line (in a game, the object the player controls); a function returning a name follows the action.
- `intentional`: what look should not flag again, a string or a list: a piece of a Lighting, Surfaces, Surface or Canvas line, 6+ characters, matched at word ends ("no tone mapping" under a post chain with its own tone curve), or an object's exact name for one hidden on purpose; look counts what each piece left out in one line.

## The rules in full

- The game starts playing as soon as the page loads: no title screen and no click to start, and nothing over the first frame (no loading text, dim veil or fade from black; a page's own controls or labels over the canvas are not a cover): `open` pauses at frame 0, so only `look` with `opening: true` shows what a player meets. When the user asks for a title screen, keep it and put `started` in `observe()` and `setState`, so a `{ state: { started: true } }` step skips it and the checks reach play.
- **Time.** The harness steps frames one at a time, 1/60 s each, on a fake clock (`requestAnimationFrame`, `performance.now`, `Date`, timers, and CSS animations and transitions). Advance the game by each frame's elapsed time, never more than 0.1 s in one frame; a fixed step belongs inside an accumulator (as game-state's `loop` does), since a display draws 30 to 144 frames a second. Count the first frame as one frame: the clock reads 60 s at frame 0 (it jumps forward when the page finishes loading), so time read before the first frame is not game time. Speeds are per second of game time. Never read real time some other way.
- **Randomness.** A game-state game uses `state.random()` (`state.md`). A game that keeps its own state uses `Math.random`; the harness seeds it, so every run sees the same game.
- **setState** takes effect at once: the next `observe()` returns the new values, and the game's own start-up must not undo them, even when `setState` runs before the first frame. Objects merge (fields left out keep their values) and lists are replaced whole, with the same fields `observe()` returns.
- **observe()** returns plain JSON (numbers, booleans, strings, null, objects, arrays), never three.js objects. Lists keep their order: new items at the end, removed items dropped.
- **Keys** listen on `window` and match `event.code` (`KeyW`, `ArrowUp`, `Space`), which Shift, Caps Lock and the keyboard layout leave alone (`event.key` turns `w` into `W` under Shift and leaves the key stuck down); `interact` sends both. A key can go down and up within one frame, so one-shot controls (turn, jump, fire) act on `keydown` and skip `event.repeat`, which a held key sends in a browser but never in `interact`; held controls (move, steer) last from `keydown` to `keyup`. Route real key events and `act({ key })` through the same function.
- **Names.** Give meshes a `name` (`player`, `enemy3`, `coin`): `look` lists what is on screen by name. Name the parts of the main object too and put them under one named group, then set `subject` to that group's name: every look says how much of the picture it takes and which of its parts something covers, which is how a player judges the game.

In React, keep the game state in a plain module outside components (as `templates/r3f.tsx` does), so `setState` and `observe` never wait for a render, and set `window.__game` in the Canvas's `onCreated`: the harness starts stepping frames once `__game` exists.
