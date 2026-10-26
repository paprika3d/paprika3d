# Three.js MCP server and Claude Code plugin: paprika3d

Three.js MCP server and Claude Code plugin: screenshot, play, test and profile the three.js, React Three Fiber and WebGL pages your coding agent builds. paprika3d is the toolset that makes your coding agent a better three.js developer. It lets the agent open, look at, play, measure and fix the pages it writes, before it tells you they are done: it **sees** the scene as data, **plays** the page on an exact clock, **inspects** any mesh or value, **builds** shapes with real geometry, and **speeds up** the frame.

## Install

Needs Google Chrome and Node 20.11 or later. `open`'s `browser: "firefox"` uses the Firefox installed on the machine (or `PAPRIKA3D_FIREFOX`); nothing is downloaded. With no Chrome, a plain open falls back to it when it is there.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

Chrome is found at its usual macOS path; elsewhere, set `PAPRIKA3D_CHROME` to the Chrome executable. For other agents, see [Other agents](#other-agents).

Docs: [https://paprika3d.com/docs](https://paprika3d.com/docs). The `window.__game` convention: [https://paprika3d.com/docs/convention](https://paprika3d.com/docs/convention). For LLMs: [https://paprika3d.com/docs/llms.txt](https://paprika3d.com/docs/llms.txt).

It works on any three.js, React Three Fiber or WebGL page: a game, a product viewer or configurator, a simulation, a shader or post-processing demo. The page needs no changes to be opened, looked at, driven and inspected.

## What your agent gets

A three.js page is one `<canvas>`: from outside it is a picture. paprika3d works inside it, with the 3D scene itself.

| Your agent asks | paprika3d answers |
|---|---|
| What is on screen? | Every named object with its share of the image and its box, plus each one that never appears, with its size and whether it is behind the camera, outside the view or too small to draw |
| Did my model load? | Reported when the page opens: the model, texture and sound files fetched, and every load that failed |
| What happens when I press Space? | The key goes in on an exact frame of a paused, seeded clock (1/60 s per frame), so the same inputs give the same frames and state every run |
| What is the game's state? | The state as JSON before and after each input |
| How big is this mesh? Is it closed? | Found without changes to the page: triangles, bounds, closed or open edges, volume and genus per mesh, and any JavaScript run against `scene`, `camera` and `renderer` |
| Is it fast enough? | Frame time, draw calls, triangles and asset size against a desktop, mobile or Quest budget |
| How do I make it faster? | `optimize` tries resolution scaling, instancing, LOD and disposal, and keeps only what helps without changing the picture |
| Does the hit feel like anything? | Camera shake, scale pops, eased moves versus teleports, flashes, spawned objects and sounds after an event |
| Can it build the shape I need? | `geo.js` in the project: booleans, hull, extrude, revolve and seeded scatter, with Manifold built in |

It never captures your screen: every picture is of its own headless page.

## What it catches

Here is `look` on a mini golf page an agent wrote from a spec that said "scale the car to 0.8":

```
On screen (14):
Mesh 17.4% [399, 240, 880, 771]
…
Never visible: ToyCar (0.0338 units, in view), Glass (0.0168 units, in view)
```

The car is there, in view, and 3 cm long on an 8-metre course. In the runs below, two agents opened a page like this, looked at the screenshot and still missed the car; this line names it.

Measured with Sonnet 5.5 in clean installs, on long, exact three.js specs that each ship a glTF model:

| | Agent alone | With paprika3d |
|---|---|---|
| Imported model left at the wrong scale or not loaded | 10 of 11 runs | 2 of 11 runs |
| Draco-compressed model that never loaded ("No DRACOLoader instance provided") | 3 of 3 runs | 0 of 3 runs |

With the tools installed but no reminder, the agent opened its page in 0 of 6 runs; with the reminder the plugin now gives once per session, 10 of 11. Game logic was right in every arm on these tasks, so the gain is in what only looking shows: imported assets, scale, framing and failed loads. A run costs about 1.5 to 2 times the dollars and 2 to 7 times the wall time. These are small samples (3 to 5 runs per task, one model).

## For agents: the loop

To ask for it in a prompt, say **use paprika3d to playtest**.

Use these tools after writing or changing any three.js, React Three Fiber or WebGL page, before saying it is done.

1. **Open it:** `open` with `url: "index.html"` (the folder is served) or `command: "bunx vite"`. Read the `Loaded:` and `Failed to load:` lines.
2. **Look:** `look`. Read `Never visible:`. An object of 0.07 units in a scene 8 units wide is at the wrong scale; `behind the camera` or `outside the view` is a framing problem. Open the picture it saves.
3. **Drive it:** for each interaction the request names, call `interact` and read the state it returns; a `{ wait }` step steps time.
4. **Ask the scene:** `eval` answers questions about sizes, materials and positions, and can try a change in the page before you write it into the source.
5. **Fix it, then look again.** Call `perf` when performance matters.

The `threejs-game` skill has the full method and templates for plain three.js, React Three Fiber and Rapier. Two skills start a build for you: `/paprika3d:paprika-make <request>` asks a few questions for a short brief (what it is, what it must have, the pictures to work from), writes it to `BRIEF.md` and builds the page in this session with that method, and `/paprika3d:paprika-loop <request> for <time>` builds from the same brief, kept as `paprika-loop/PROMPT.md`, which you can edit while it runs, unattended until the time given is up, in a loop of fresh `claude -p` sessions (one improvement each, a read-only judge session scoring the page and naming the next three, a commit per iteration, the best-scored commit tagged `paprika-loop/best`) with the agents' notes in `paprika-loop/PROGRESS.md`. The same loop runs from a terminal: `node <plugin>/src/cli.js loop --minutes N --prompt "…"`; it needs `claude` and `git` on PATH.

## Tools

| Tool | What it does |
|---|---|
| `open` | Opens the page (a file or folder, an http URL, or a dev-server command) in headless Chrome on a paused, seeded clock, and lists the model, texture and sound files the page fetched and every fetch that failed; names a three.js older than the current release, removed three.js API the source uses (with the release it went and the replacement) and three.js's own deprecation warnings; `browser` (`chrome` by default, or `firefox`) picks the engine, and the reply names it and its version; `network` (here and in `perf`), `perf`'s `throttle` and main-thread time per frame are Chrome's only, each said in one reply line; `size`, `dpr` and `reducedMotion` open it at another page size, device pixel ratio, or with prefers-reduced-motion: reduce; `network` (`fast-4g`, `slow-4g`, `3g`, Chrome DevTools' presets) also times a first visit on that network: when the first scene frame came, the bytes before it by kind, and when an overlay over the canvas went |
| `look` | A picture, an ID image (one colour per object) and the list of named objects on screen, plus the named objects no look has seen yet with their size and where they are (behind the camera, outside the view, or in view but drawing no pixel); with `target`, one named object alone from the front, right, top and a three-quarter angle in one picture; with `cameras` (up to 9 of `{ position, lookAt, label }` or names), the same moment from each in one labelled grid with no reload, each labelled one kept in `paprika3d/cameras.json` so a later `camera` (look, zoom, `reference` compare) names it, as it names a picture in `refs/cameras.json`; every look has a Canvas line (drawing buffer for CSS size at the DPR, the renderer's pixel ratio, and whether a resize handler ran); a transparent canvas (alpha, clear alpha under 1, no scene background) adds a Behind the canvas line (the share of the canvas the page shows through, the page background, and how much of each text behind it shows), and HTML labels a CSS2DRenderer or drei `Html` places add an HTML labels line (count, how many overlap, how many are off-screen, each box in picture pixels); with `viewports: ["phone", "tablet", "laptop", "desktop"]` (or `[width, height, dpr]` items), the page at each size in one labelled grid, each on a fresh reload with its subject's share and objects on screen; with `scroll: [0, 0.25, 0.5, 0.75, 1]`, a scroll-driven page at each share of its scroll range in one labelled grid, each on a fresh reload with the camera's position and look direction and the objects on screen |
| `interact` | Sends keys, mouse, touch, window scroll (`scroll` to a pixel offset, `{ progress }` or `{ to: "#section" }`, replying with where it is) or `__game.act` actions frame by frame, with the state before and after; `record: true` plays them in real time (up to 15 s) into a GIF in the run folder, with the game's frame intervals at a 60 Hz pace |
| `observe` | The page's state (its `__game.observe()`, or its named three.js objects), renderer counts, new console errors and what changed since the last observe |
| `eval` | Runs JavaScript in the page with `scene`, `camera`, `renderer`, `find(name)` and `stats(target)` in scope, and replies with what it returns; `stats` gives each mesh's vertices, triangles, bounds, attributes, materials, closed or open edges, volume and genus. Replies are capped at 2,048 characters, with the full text saved in the run folder |
| `model_run` | Runs JavaScript against a modelling scene the server keeps between calls, apart from any page, as Blender keeps its scene: `THREE`, Manifold (`geo`: booleans, hull, extrude, revolve), `scatter`, `find`, `stats`, `load` (a .glb from the project) and `save` (a GLB into the project, with the line that loads it) in scope. What the code adds stays for the next call and is saved to `paprika3d/model/scene.glb`, so a restart loads it back |
| `model_look` | The modelling scene, or one object in it, from the front, right and top (orthographic, true to size against a grid) and three-quarter in one picture, with one line per object: place, material, triangles, size, closed or open, volume and genus; `cameras` for other views |
| `feel` | Sends the steps that cause an event, then watches the next frames for camera shake, scale pops, eased moves versus teleports, colour flashes, spawned objects, HUD text ticks and sounds |
| `perf` | Frame time, draw calls, triangles and asset size against a budget (desktop, mobile, quest or site); `throttle` slows the page's JavaScript, and `network` times a first visit as `open` does (`site` judges the first scene frame on fast-4g and the script size) |
| `optimize` | Only when a check says the frame is over budget, or the user asks about performance: measures, tries the runtime's switches, keeps those that help without failing a keypoint or changing the picture, writes `game-runtime.json`, and ends with the final check |
| `test` | Reruns every check saved with `interact` `save` (game-tests.json), each from a fresh reload at frame 0, one line each: `✓ pickup` or `✗ jump: player.y 1.4, expected ≥ 2` |
| `model_audit` | Inspects .glb, .gltf and USD files: megabytes, triangles, materials, texture sizes and formats, Draco, meshopt and KTX2, with a verdict against a website (`site`) or Shopify (`shopify`) budget; `shrink` rewrites a .glb or .gltf smaller |
| `reference` | Reads a reference picture the page should match at full resolution: `crop` with a labelled `grid` and colour `sample`s; with the page open, `compare: true` puts the picture, the page and their difference side by side |
| `asset_search` | Searches the hosted library (assets.keeno.dev) for a ready-made model (CC BY or CC0), PBR texture or HDRI sky by words or by a reference crop, and `pick` puts one in the project with its loading code, at real size and credited in CREDITS.md |
| `send_feedback` | Sends the paprika3d team a bug, feedback or criticism about the harness; see Feedback below |
| `publish` | (preview, invite-only) Only when you ask: puts the built page on `https://<name>.paprika3d.app`; see Publishing below |

## Making a game checkable

Any page can be opened, looked at and driven. To check its rules, a game also exposes `window.__game` once its page has loaded:

```js
window.__game = {
  describe(),        // a short description: name, controls, units
  observe(),         // the state, as plain JSON
  act(input),        // performs one input object: { key, down? } or { action, ...args }
  setState(partial), // sets any of the schema's keys at once; keys left out keep their values
};
// Starts playing on load: no title screen, no click to start.
// Time comes only from requestAnimationFrame / performance.now (faked, 1/60 s per frame, never more than 0.1 s a frame).
// Randomness comes only from Math.random (seeded). Keys listen on window and match event.key.
```

The full rules are in `skills/threejs-game/SKILL.md` and at [https://paprika3d.com/docs/convention](https://paprika3d.com/docs/convention).

## The runtime import

A game needs it only once a check says the frame is over budget. Then `optimize`, on a game without it, puts the built runtime in the project as `three-runtime.js` and asks for the import; add it once at the top of the entry file, before the renderer is made, and reopen the game:

```js
import { install } from "./three-runtime.js";
install();
```

It does nothing until `optimize` has written `game-runtime.json` (also into `public/` when the project has one, since vite copies only that); then it runs the switches kept there: `resolution`, `defaults`, `instancing`, `lod` and `dispose`.

## Procedural geometry

The `open` tool puts `geo.js` in the project: one file with Manifold built in, for booleans, hull, extrude and revolve, plus a seeded `scatter`. Import it with `import { geo, scatter } from "./geo.js";` (`"../geo.js"` from `src/` in a vite project). Recipes are in `skills/threejs-game/references/geometry.md`.

## Other agents

The MCP server is on npm as [`paprika3d`](https://www.npmjs.com/package/paprika3d) and runs on Node 20.11 or later with Google Chrome. Point any MCP client at it:

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

| Client | One line |
|---|---|
| Codex CLI | `codex mcp add paprika -- npx -y paprika3d serve` |
| Gemini CLI | `gemini mcp add paprika npx -y paprika3d serve` |
| Cursor, VS Code, Windsurf | the JSON above in the client's MCP settings |
| The `threejs-game` skill, any agent | `npx skills add paprika3d/paprika3d` |

`open`, `model_audit`, `model_run` and `model_look` take the project folder as `cwd`; the other page tools act on the game `open` opened, picked by its `game` name ("main" when left out). The after-edit hook and the `threejs-game` skill are Claude Code features; other agents can read `AGENTS.md` and `skills/threejs-game/SKILL.md` for the same method.

## Where runs go

- `<project>/paprika3d/runs/<time>/`: each run's pictures and `run.json`. `<project>/paprika3d/state.json` holds the iteration count, the last 200 runs and how the hook reaches the running server. Add `paprika3d/` to the project's `.gitignore`.

## Feedback

Your agent can send the paprika3d team a bug, feedback or criticism about the harness with the `send_feedback` tool, and a failed reply suggests it. It sends only when the agent calls it: the agent's own text, the last tool call's name, option names and error line (paths and URLs taken out), and the plugin version, OS and Node version. Never your code, files, pictures or page text. Each report also carries a random install id, so reports from one install can be read together. A copy of each report is kept in the run folder. `PAPRIKA3D_TELEMETRY=0` or `DO_NOT_TRACK=1` removes the tool.

`asset_search` works against the hosted library at assets.keeno.dev: it sends the search words (or the reference crop the agent searches by), the models the agent picks or rejects, and the agent's model name, never your project's files. Nothing else is sent, unless you ask your agent to `publish`, which uploads your built game; see Publishing below.

## Publishing (preview, invite-only)

Publishing is a preview, open by invite only for now: ask for an invite at https://paprika3d.com/waitlist and set `PAPRIKA3D_PUBLISH_INVITE` to the code; without one, `publish` says so before it builds anything. When you ask, your agent can put the page on a public link, `https://<name>.paprika3d.app`, with the `publish` tool. It uploads the built project (never `.env` files, dotfiles, `node_modules` beyond what the page imports, or files named like credentials) and, on the first publish, makes this install's publish key with no sign-in. Every publish records the key, the install id, the agent's client and version, its model, the OS, the plugin version and a keyed hash of your IP address, even with `DO_NOT_TRACK` set, since publishing opts in to hosting. Unclaimed games are unlisted and noindexed, and come down after 90 days with no plays. If a reply warns that your key was used from a new network and that was not you, ask your agent to rotate it (`publish` with `rotate: true`) from your usual network: the old key stops working. If someone else rotated it first, a rotation from your usual network within 24 hours takes it back; after that, write to founders@keeno.dev for a new key with your games.

## License

Apache License 2.0 (`LICENSE`). The packages each build bundles keep their own licences, listed in
`THIRD_PARTY_NOTICES.md`. "paprika3d" is a trademark of Keeno Corp (`NOTICE`); forks are welcome under
the licence with their own name. Issues are welcome; see `CONTRIBUTING.md` for code.
