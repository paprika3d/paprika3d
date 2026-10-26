# Changelog

## 0.2.1 (2026-10-26)

The public copy for 0.2.0: a new README (the intro reel, the results, install for each agent, the 16 tools with when to
use each, what leaves your machine), the docs site's install and publish pages, shorter package, plugin and registry
descriptions, and this changelog in the package. `paprika3d check` describes the saved checks it reruns. No tool
changes.

## 0.2.0 (2026-10-26)

The first production release of paprika3d, the three.js toolset for coding agents: a Claude Code plugin and an MCP server
(`npx -y paprika3d serve`) that let an agent open, look at, play, measure and fix the three.js, React Three Fiber and
WebGL pages it writes, in headless Chrome on a paused, seeded clock.

The tool names and their inputs, the skill names, the `paprika3d serve` command and the environment variables in
`server.json` change only in a minor release before 1.0, with a note here. Previews, which may change in any minor release: `publish` (invite-only),
`model_run` and `model_look`, `asset_search`, and `open`'s `browser: "firefox"`. The plugin needs Claude Code 2.1.118
or later; the server needs Google Chrome and Node 20.11 or later.

### Tools (16)

In Claude Code a tool's full name is `mcp__plugin_paprika3d_paprika__<tool>`.

- **See the page:** `open` (the page in headless Chrome on a paused, seeded clock, with the files it loaded and failed
  to load, dev-server errors, an unsized canvas, an old or removed three.js API; up to 4 pages at once; Firefox on
  request), `look` (a screenshot with the named objects on screen and the ones never seen, and fault lines for
  lighting, z-fighting surfaces, the canvas and HTML over it; modes `target`, `cameras`, `sheet`, `viewports`,
  `scroll`, `zoom`, `sample`, `at`, `opening`, `save`, `compare`), `observe` (the state as JSON) and `reference` (a
  picture the page should match, and the page compared with it by region).
- **Play it:** `interact` (keys, mouse, touch, wheel, scroll, resize and clock steps on exact frames, with what changed
  in the state; `until`, `trace`, `expect`; `save` keeps a play as a check; `record: true` makes a real-time GIF),
  `test` (reruns the saved checks) and `feel` (shake, pops, eased moves versus teleports, flashes, particles, spawns,
  HUD ticks and sounds after an event).
- **Ask it:** `eval` (any JavaScript in the page, with each mesh's triangles, bounds, closed edges, volume and genus).
- **Build it:** `model_run` and `model_look` (a model built in code with three.js and Manifold in a scene kept between
  calls, saved as a .glb), `model_audit` (.glb, .gltf and USD files against a site or Shopify budget, and `shrink`),
  and `asset_search` (57,183 CC BY and CC0 models, 3,545 PBR textures and 1,430 HDRI skies in a hosted library, with
  `pick` and a credit line in `CREDITS.md`).
- **Speed it:** `perf` (frame time, draw calls, triangles and asset size against a desktop, mobile, Quest or site
  budget, with `variants` and `costs`) and `optimize` (resolution, defaults, instancing, LOD and dispose, kept only where
  they help without changing the picture).
- **Publish it:** `publish` (preview, invite-only: the built page on `https://<name>.paprika3d.app`; `rotate: true`
  replaces a key used from a new place).
- **Report:** `send_feedback` (the agent sends the team a bug or criticism of the harness, at most 20 a day).

### Skills

- `threejs-game`: the method, with reference files for plain three.js, React Three Fiber and Rapier, which Claude loads
  by itself.
- `/paprika3d:paprika-make <request>`: a short brief, one question at a time, written to `BRIEF.md`, then the build.
- `/paprika3d:paprika-loop <request> for <time>`: the same brief built unattended over a set time in fresh `claude -p`
  sessions, a builder and a read-only judge each iteration, a commit each and the best tagged.
- `paprika-publish`: what the agent invokes before `publish`.

### Hooks (Claude Code)

- After each batch of edits: the saved checks and the page's lighting and surface faults rechecked, said only when one
  starts or stops failing, and a once-a-session note when a three.js page the agent wrote has not been opened.
- On the first stop: the edits never played or looked at and the faults still open, stated once.

### In the project

- `geo.js` (procedural geometry with Manifold) and `fx.js` (sound effects, canvas textures, particles, a first-load
  stage, texture coordinates, placement), written by `open`; game-state (typed-array state, rewind, Rapier in a
  worker); `three-runtime.js`, written by `optimize`.

### Packaging

- Both the plugin and the npm package are bundled for Node: nothing is installed from npm and no browser is downloaded.
  The build carries `THIRD_PARTY_NOTICES.md`, the docs site's pages under `docs/`, `AGENTS.md`, `context7.json` and
  `glama.json`.

### If you tried a 0.1.x preview

The tools and the server key were renamed, with no aliases: `game_*` tools are now plain names (`game_look` is `look`,
`game_act` is `interact`, `game_clock` is an `interact` step) and the full name is
`mcp__plugin_paprika3d_paprika__<tool>` (it was `mcp__plugin_paprika3d_paprika3d__game_<tool>`); update permission
rules and prompts that name them. The game contract (`game_contract`, `game_check`) is gone. Update with
`claude plugin marketplace update paprika3d` and `claude plugin update paprika3d@paprika3d`, then restart Claude Code.
