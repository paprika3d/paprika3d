# Changelog

## 0.3.0 (2026-10-29)

A minor version because the tool list changes: the `optimize` tool folds into `perf` (below), so the stable build lists
15 tools. The stable build ships readable bundles and the TypeScript they are built from under `source/`, and CONTRIBUTING.md
takes outside changes with a DCO sign-off. `look`'s z-fighting check covers every mesh on a heavy page (all 103 of a
100-mesh test page in about 100 ms, where it checked 0 to 76) and, when it still reaches its limit, says `Surfaces: not
checked for N of M meshes` where the Surfaces line goes (#161). That check counts its work instead of timing itself, so a busy machine names the same fights as an idle one: timed, the Studio at load 20-36 named a fight in only 22-27 of 63 flicker cells (#196). Each open deletes the pictures and clips in all but the
newest 10 run folders (#74). A `perf` variant samples 2 s against the baseline's 4 s, so a 5-variant call takes about
28 s instead of 40 (#163). On a software renderer, each clock frame waits for the GPU, so looks stop hitting the 180 s
timeout (#25). The `look` and `interact` schemas are shorter (the tool list is 13% smaller) and the `threejs-game` skill
is about half its size, with the detail in `references/tools.md`. `paprika-make` asks its questions, has a subagent find
reference pictures the person confirms, and writes the brief before any page file; `paprika-loop` starts only when the
person types it. The `open` reply says geo.js and fx.js are replaced only when the plugin's copy changes. The README
puts the result and install first; the tool, skill and hook tables are on the docs site's plugin page. The after-edit
hook's once-per-session line that a three.js page has not been opened also comes for a page a shell command wrote (a
heredoc or a generator script), found under the session's folder as one changed since the session began (#188). `open`
loads at session start under Claude Code's tool search, which otherwise shows each MCP tool by name only until the agent
searches for it: its tools/list entry carries `_meta: {"anthropic/alwaysLoad": true}`, which Claude Code 2.1.285 and
later read. The `optimize` tool is now `perf` with `optimize: true`: it measures, tries the @paprika3d/three-runtime
switches (`resolution`, `defaults`, `instancing`, `lod`, `dispose`) one at a time, keeps those that help in
`game-runtime.json`, and ends with the final `test` of `game-tests.json` when the project has one. With
`optimize: true`, `perf` takes only `budget`, and the `switches` option is gone. The MCP server starts about a quarter
faster (117 to 85 ms on an M3 Air): it and the hooks run through Node's on-disk compile cache (Node 22.8 and later). A
`look` zoom on a scrolled page shows the box the look listed there, not the part of the page above it, and leaves the
page's scroll where it was (#193). The picture in a tool reply is at most 1,024 pixels wide, not 1,280,
about 850 tokens a look instead of 1,330 (a vision eval on 133 assets found Sonnet's defect recall no lower). The after-edit hook no longer says a three.js page has not been opened when an `open` of it ran in the same batch of tool calls as the write: it reads that `open`'s reply from the hook's own input, since Claude Code adds a batch's results to the transcript up to 100 ms after the hook starts (#194).

Once per install and per update, at the MCP client's first `initialize`, the server sends the install id, the plugin
version, OS and Node version and the client's name and version, so the team can count installs; nothing about the
project, and `DO_NOT_TRACK=1` or `PAPRIKA3D_TELEMETRY=0` turns it off, as for `send_feedback` (the README's what leaves
your machine and SECURITY.md say so). `perf` samples frames as a browser runs them, letting the GPU run at most two
frames behind, instead of waiting for the GPU every frame, which read a frame as its CPU and GPU time added (#191); its
pass times sync on a 1x1 framebuffer the harness owns, so the pass after a multisampled target's resolve is no longer
charged the heavy pass's GPU time; a WebGPURenderer with no device yet no longer stops every frame stamp; and a pass
whose material is three's ShaderPass default is named by its uniforms, not `(unspecified)`. `look` says a subject the
ID image cannot find (drawn by its own shader, or see-through) has its share not measured, instead of `drew no pixel`.
The `interact`, `look` and `perf` descriptions name their siblings and say what fails and what persists.
`paprika-make` and `paprika-loop` ask one question for each of what it is, what it must have, its controls and its
pictures that the request leaves open, so a detailed request gets one or two, and a request that names no pictures
starts the reference subagent before the first question. A `paprika-loop` judge marks a Next item it asked for before
`(asked again)` and names the one tool call that shows it done, and when the last three judges gave the same score the
next builder's prompt says so. The stable build carries SECURITY.md (founders@keeno.dev, the latest release only) and,
in the public repo, a Dockerfile so Glama can run the server and list its tools. `paprika3d check` prints an opt-in
`Tested with paprika3d` line under its plain report with `PAPRIKA3D_TESTED_WITH=1`, for a report pasted into a PR. Five
one-task skills, `threejs-screenshot`, `threejs-play`, `threejs-test`, `threejs-perf` and `threejs-glb-audit`, sit
beside `threejs-game`, so `npx skills add paprika3d/paprika3d --skill <name>` installs one. `asset_search`'s library
holds 57,732 models, with the 549 from Scenario's 3D Collection.

## 0.2.4 (2026-10-27)

`templates/viewer.html` sets `NeutralToneMapping` after `stage()`, so a swatch and the material it names read as one
colour, and `references/configurator.md` says why: `stage()`'s ACES default mutes and shifts saturated colours (#183).
Reply lines call the person at the page a viewer, never a player: `look`'s `It blends in` and `Dark` lines, `open`'s
slow-start line, `perf`'s p95 hitch line and the `opening` description (#64); the `threejs-game` skill's first-frame rule
says a page's own controls or labels over the canvas are not a cover.

## 0.2.3 (2026-10-27)

`perf { costs: true }`'s table header says which total is which when the reply's first line disagrees with it: the first
line counts the frame as drawn (the camera's view plus the shadow pass) and the textures on the GPU (the background and
environment included), the table the main scene's objects (#179). `feel` puts its `State changed during setup` line
right after the `Watched` line, above the HUD and sound lines that count only the watched frames (#182). The
`threejs-game` skill's reload list names an `interact` with `save`, which replays from a fresh reload (#180); its Rapier
paragraph says the project's copy and game-state's worker are separate, so their versions need not match, and which
file each version ships (#181); and the after-edit hook's recheck is explained once, in `references/lighting.md`, with
the skill and the server's instructions pointing there.

## 0.2.2 (2026-10-27)

One shorter description on every surface: "Three.js MCP server and Claude Code plugin: screenshot, play, test and
profile the three.js pages your coding agent builds." The README drops the publish banner, the install commands it
listed twice, the `window.__game` code and the runtime import (both on the docs site) and the lines about what is never
sent; what leaves your machine lists what each tool sends. `look`'s Hues line leaves out the one object over half the
frame, by name, so the other objects' colours show (#178), and `interact`'s Motion line takes its first sample at frame
1 when no frame has been drawn yet, so a save straight after a reload measures the same run as after a look (#176).
The `threejs-game` skill gains `templates/viewer.html`, a product viewer of named parts whose click cycles a variant, with
`observe` and `setState` for each one, and its goal paragraph is in plain sentences. `asset_search`'s `model` input says
it is optional and what it is sent with.

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
