<!-- hero -->
<h1 align="center">paprika3d</h1>

<p align="center">
  <b>paprika3d gives your coding agent eyes and hands inside three.js.</b><br>
  It sees what's really in the scene, plays the page and measures every frame, instead of guessing from a screenshot.
  So it catches the invisible model, the file that never loaded and the flickering faces, and fixes them before it
  tells you it's done.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/paprika3d"><img alt="npm" src="https://img.shields.io/npm/v/paprika3d?color=d93a1e&label=npm"></a>
  <a href="#install"><img alt="works with Claude Code, Codex, Gemini CLI, Cursor and VS Code" src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Gemini%20%C2%B7%20Cursor%20%C2%B7%20VS%20Code-2b2b2b"></a>
  <a href="https://registry.modelcontextprotocol.io"><img alt="MCP server" src="https://img.shields.io/badge/MCP-server-2b2b2b"></a>
  <a href="https://paprika3d.com/docs"><img alt="docs" src="https://img.shields.io/badge/docs-paprika3d.com-2b2b2b"></a>
  <a href="https://github.com/paprika3d/paprika3d/blob/main/LICENSE"><img alt="license: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-2b2b2b"></a>
</p>

<p align="center">
  <a href="https://paprika3d.com/media/paprika3d-intro.mp4"><img src="https://paprika3d.com/media/paprika3d-teaser.gif" alt="An 8-second loop from the paprika3d intro reel: a flower burst over a harbour, a yellow-walled Backrooms corridor, a stone figure with a skull at a computer keyboard, a low-poly lighthouse and cottage, a lighthouse on a green sea cliff with two people, and an illustrated PAPRIKA poster. It links to the full 46-second video." width="480"></a>
</p>

<!-- /hero -->

## Install

Needs Google Chrome and Node 20.11 or later; the Claude Code plugin needs Claude Code 2.1.118 or later.

| Agent | Install |
|---|---|
| **Claude Code** | `claude plugin marketplace add paprika3d/paprika3d`<br>`claude plugin install paprika3d@paprika3d` |
| **Codex CLI** | `codex mcp add paprika -- npx -y paprika3d serve` |
| **Gemini CLI** | `gemini mcp add paprika npx -y paprika3d serve` |
| **Cursor, VS Code, Windsurf** | `npx -y paprika3d serve` as an MCP server in the client's settings (JSON below) |
| **Skill only** (any agent) | `npx skills add paprika3d/paprika3d` |

Cursor (`.cursor/mcp.json`), Windsurf and any other MCP client take this entry; VS Code's `.vscode/mcp.json` takes the same entry under `servers` instead of `mcpServers`:

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

Then ask your agent to **use paprika3d to playtest**. In Claude Code, `/paprika3d:paprika-make <request>` builds a whole page from one request.

## The results: what changes with paprika3d

**More 3D objects come out clean, with no flickering faces.** 3JSBench: 50 one-line requests for a 3D object, 3 runs each, every object checked from every side for flicker, see-through and inside-out faces, broken code and budget.

| | Without paprika3d | With paprika3d | Difference (95% interval) |
|---|---|---|---|
| Sonnet 5.5: objects that pass every check | 66% | 86% | +20 points (+11 to +29) |
| Opus 5.5: objects that pass every check | 63% | 78% | +15 points (+4 to +27) |
| Sonnet 5.5: objects with no flickering (z-fighting) faces | 68% | 88% | +20 points (+11 to +29) |
| Opus 5.5: objects with no flickering (z-fighting) faces | 69% | 89% | +21 points (+10 to +30) |

**Imported models show up, at the right size.** Sonnet 5.5 building three.js pages that each load a glTF model.

| | Without paprika3d | With paprika3d |
|---|---|---|
| Model loaded and shown at the right size | 1 of 11 runs | 9 of 11 runs |
| Draco-compressed model loaded | 0 of 3 runs | 3 of 3 runs |

For example, on a mini golf page the agent loaded a toy car so small it never showed up, and the screenshot looked fine. paprika3d's `look` named the missing car:

```
Never visible: ToyCar (0.0338 units, in view)
```

**Games with heavy physics stay smooth.** paprika3d's game-state runs Rapier physics in a worker, off the main thread, so a scene of about 2,000 crates spends 1.3 to 2.0 ms of each frame on the main thread instead of 7 to 11 ms. That leaves the frame free for rendering, and the game still passes every check. Opus 5.5, 2 runs each; both columns had paprika3d, the difference is game-state.

| | paprika3d, Rapier on the main thread | paprika3d with game-state (Rapier in a worker) |
|---|---|---|
| Main-thread time per frame | 7 to 11 ms | 1.3 to 2.0 ms |
| Game checks passed | 18 of 18 | 18 of 18 |

## What your agent can finally see

**Three.js MCP server and Claude Code plugin: screenshot, play, test and profile the three.js pages your coding agent builds.**

paprika3d works inside the canvas, with the scene itself. Your agent opens its page on a clock it controls, sees every named object on screen and every one that never appears, presses keys on exact frames and reads the state back, measures each mesh and times the frame against a budget. Every reply is short text with the number that fixes the problem, so the agent fixes it before it hands the page over.

It works on any three.js, React Three Fiber or WebGL page, `WebGPURenderer` included: games, product viewers and configurators, scroll sites, simulations, shader and post-processing demos. Your page needs no changes.

## What your agent can do with it

| Part | What your agent does | Tools |
|---|---|---|
| **See it** | Sees what is on screen, what never appears and why (behind the camera, outside the view, too small), which files failed to load, and which lighting and surface faults show | `open`, `look`, `observe`, `reference` |
| **Play it** | Presses keys, clicks, touches and scrolls on exact frames of a paused, seeded clock, reads the state after each input, keeps a play as a check that reruns after every edit, and measures how an event feels | `interact`, `test`, `feel` |
| **Ask it** | Runs any JavaScript against `scene`, `camera` and `renderer`, and reads each mesh's triangles, bounds, closed edges, volume and genus | `eval` |
| **Build it** | Builds models in code with three.js and Manifold and saves them as .glb, checks model files against a budget, and pulls in ready-made models, textures and skies | `model_run`, `model_look`, `model_audit`, `asset_search`, `geo.js`, `fx.js` |
| **Speed it** | Times the frame against a desktop, mobile, Quest or site budget, finds what costs it, and keeps only the switches that help without changing the picture | `perf`, `optimize`, `three-runtime.js`, game-state |
| **Publish it** | Puts the built page on a public link (preview, invite-only) | `publish` |

## Everything that comes with it

### The 16 tools

In Claude Code a tool's full name is `mcp__plugin_paprika3d_paprika__<tool>`; from a project's `.mcp.json` it is `mcp__paprika__<tool>`. Every tool's full description: [paprika3d.com/docs/tools](https://paprika3d.com/docs/tools).

| Tool | Reach for it when | What it does |
|---|---|---|
| `open` | A three.js, R3F or WebGL page has been written or changed | Runs the page (a file or folder, an http URL or a dev-server command) in headless Chrome on a paused, seeded clock, and reports the files that loaded and failed, dev-server errors, an unsized canvas and old or removed three.js APIs. Up to 4 pages at once; `browser: "firefox"` uses the installed Firefox (preview) |
| `look` | You need to see what a viewer sees | Shows a screenshot and names every object on screen and every one never seen, with its size and where it is, plus the lighting, z-fighting, canvas and HTML-overlay faults. Modes: `target`, `cameras`, `sheet`, `viewports`, `scroll`, `zoom`, `sample`, `at`, `opening`, `save`, `compare` |
| `interact` | You need to play an interaction the request names | Plays keys, mouse, touch, wheel, scroll, resize and clock steps on exact frames, and reports what changed in the state. `{ state }`, `until`, `trace` and `expect` steps; `save` keeps the play as a check; `record: true` makes a real-time GIF |
| `observe` | You need the state without acting | Reads the state as JSON (`window.__game.observe()`, or the named three.js objects), with renderer counts, new console errors and what changed |
| `eval` | You need a number the other tools do not give, or to try a change before writing it | Runs any JavaScript in the page with `scene`, `camera`, `renderer`, `find` and `stats` in scope; `save` writes what it returns to a file |
| `feel` | You need to know whether a hit, pickup or win lands on screen | Measures camera shake, scale pops, eased moves versus teleports, flashes, particles, spawns, HUD ticks and sounds after the steps |
| `test` | After an edit that could break an earlier feature | Reruns every saved check from a fresh reload, one pass or fail line each |
| `perf` | A reply says the frame is over budget, or the user asks about speed | Times the frame: frame time, draw calls, triangles and asset size against a budget; `variants` in one call, `costs` by named group, `throttle`, `network` |
| `optimize` | The frame is over budget | Speeds the page up: tries the runtime's switches (resolution, defaults, instancing, LOD, dispose) and keeps only the ones that help without changing the picture, in `game-runtime.json` |
| `reference` | The page should match a picture | Reads the picture with no page open (a crop with a pixel grid, colours at points); `compare` puts the page beside it, with the differences by region |
| `model_audit` | The page loads .glb, .gltf or USD files | Checks each file's size, triangles, textures and compression, with a site or Shopify verdict; `shrink` rewrites a .glb or .gltf smaller |
| `model_run` | A model is faster to build in code than to find | Builds it in a modelling scene kept between calls (three.js and Manifold: booleans, hull, extrude, revolve) and saves a .glb the page loads (preview) |
| `model_look` | You need to see that model true to size | Shows the modelling scene from the front, right, top and three-quarter against a grid, with each object's size, triangles, closed or open edges, volume and genus (preview) |
| `asset_search` | The page needs a ready-made model, PBR texture or HDRI sky | Finds one by words or by a crop of a picture, with a contact sheet; `pick` downloads it into the project with its loading code (preview) |
| `publish` | Only when the user asks for a public link | Puts the built page on `https://<name>.paprika3d.app` (preview, invite-only) |
| `send_feedback` | A paprika3d reply was wrong, unclear or got in the way | Sends the paprika3d team a bug or criticism, with the last tool call's name, options and error |

### The skills

| Skill | What it does |
|---|---|
| `threejs-game` | Loads by itself for any three.js page: build the first version whole and as impressive as it can be, then what each tool shows; the `window.__game` convention, and references for lighting, geometry, effects, performance and model files |
| `/paprika3d:paprika-make <request>` | Asks a few questions, one at a time, for a short brief (what it is, what it must have, the pictures to work from), writes `BRIEF.md`, and builds the page in this session |
| `/paprika3d:paprika-loop <request> for <time>` | Builds from the same brief, unattended until the time is up: fresh `claude -p` sessions, a builder then a read-only judge each round, a commit per round and the best tagged `paprika-loop/best`. Edit `paprika-loop/PROMPT.md` while it runs to change the request. Each round is two Claude Code sessions, billed as such; needs `claude` and `git` on PATH |
| `paprika-publish` | Tells the agent when to publish and what to tell you |

The slash commands, automatic skill loading and the hooks are Claude Code features; other agents get the same method from `AGENTS.md` and `skills/threejs-game/SKILL.md`.

### The hooks (Claude Code)

| Hook | What it does for you |
|---|---|
| After each batch of edits | Reruns the checks saved with `interact`'s `save` and rechecks the page's `Lighting:` and `Surfaces:` lines on the reloaded page; it speaks only when one starts or stops failing. Once per session it says a three.js page the agent wrote has not been opened |
| On the first stop | States once the edits never played or looked at and the faults still open |

### The files it puts in your project

| File | Written by | What it is |
|---|---|---|
| `geo.js` | `open` | Procedural geometry with Manifold built in: booleans, hull, extrude, revolve, seeded scatter |
| `fx.js` | `open` | Sound effects made in code, canvas textures, particle bursts, a first-load stage (tone mapping, environment, shadowed light, resize), metre-scale texture coordinates, placement rules, a reference picture's camera |
| `game-state.js`, `physics-worker.js` | the agent, as the skill says | Game state in typed arrays with a generated `window.__game`, rewind, and Rapier physics in a worker |
| `three-runtime.js` | `optimize` | The switches `optimize` keeps, read from `game-runtime.json` |

`open` rewrites `geo.js` and `fx.js` on every open; leave them in place.

## The asset library: over 62,000 ready-made assets

`asset_search` reaches a hosted library at `assets.keeno.dev`:

| Kind | Count | Licence | Source |
|---|---|---|---|
| Models | 57,183 | CC BY 4.0 or CC0 | Objaverse, web-ready |
| PBR textures | 3,545 | CC0 | |
| HDRI skies | 1,430 | CC0 | |

- `pick` puts the file in `assets/` (`public/assets/` with Vite) and replies with the code that loads it, a model at its real-world size.
- A CC BY model's credit line goes into `CREDITS.md`, as the licence requires.

## How it compares: paprika3d, Playwright MCP and Blender MCP

paprika3d is built for one job: an agent building a three.js page.

| | paprika3d | Playwright MCP | Blender MCP |
|---|---|---|---|
| Sees the three.js scene graph (named objects, sizes, what never appears) | Yes | No | No |
| Paused, seeded clock: the same inputs give the same frames | Yes | Not built in | No |
| Input on an exact frame, with the game's state back | Yes | No | No |
| Frame time against a budget, and an optimizer | Yes | No | No |
| Lighting and z-fighting faults named | Yes | No | No |

**Measured side by side** (3JSBench, the same 50 objects; objects that pass every check):

| | Sonnet 5.5 | Opus 5.5 |
|---|---|---|
| Agent alone | 66% | 63% |
| With Playwright MCP | 66% | 56% |
| With Blender MCP | 70% | 74% |
| With paprika3d | 86% | 78% |

**Finding defects in finished objects** (133 objects, Sonnet 5.5):

| | paprika3d | Playwright MCP + QA skill |
|---|---|---|
| Flickering faces found | 75% | 44% |
| Clean objects correctly passed | 80% | 66% |

## Making a game checkable

Any page works as it is. Add `window.__game` (`describe`, `observe`, `act` and `setState`) once the page has loaded, and your agent reads and sets the game's exact state: [the convention](https://paprika3d.com/docs/convention).

## What stays stable

The tool names and their inputs, the skill names, the `paprika3d serve` command and the environment variables in `server.json` change only in a minor release before 1.0, and only with a note in [CHANGELOG.md](CHANGELOG.md), which lists each release; a patch release never changes them. Previews, which may change in any minor release: `publish` (invite-only), `model_run` and `model_look`, `asset_search`, and `open`'s `browser: "firefox"`.

## What leaves your machine

- **`look` and `interact`**, when the project has no matching three.js installed, have Chrome fetch that three.js version from `cdn.jsdelivr.net`.
- **`asset_search`** sends your agent's searches (the words, or the crop of a picture it searches by) and what it picks to the asset library at `assets.keeno.dev`.
- **`send_feedback`,** only when the agent calls it, sends its text, the last tool call's name, option names and error, the plugin version, OS and Node version, a random install id (kept in `~/.paprika3d/telemetry/id`) and a per-run id. `DO_NOT_TRACK=1` or `PAPRIKA3D_TELEMETRY=0` turns it off.
- **`publish`,** only when you ask: the built project, to host it ([what a publish uploads and records](https://paprika3d.com/docs/publish)).

## Publishing (preview, invite-only)

When you ask, your agent puts the page on a public link, `https://<name>.paprika3d.app`. Publishing is a preview, open by invite only: join the waitlist at https://paprika3d.com/waitlist and set `PAPRIKA3D_PUBLISH_INVITE` to your code.

## Where runs go

Each run's pictures and `run.json` go in `<project>/paprika3d/runs/`; add `paprika3d/` to the project's `.gitignore`.

## Requirements and limits

- **Google Chrome**, found at its usual install path on macOS and Linux, on PATH, or in Playwright's or Puppeteer's cache; anywhere else, set `PAPRIKA3D_CHROME`. `open`'s `browser: "firefox"` uses the installed Firefox (or `PAPRIKA3D_FIREFOX`); with no Chrome, a plain open falls back to it.
- **Node 20.11 or later.**
- **Claude Code 2.1.118 or later** for the plugin: the after-edit hook runs on `PostToolBatch`, which older versions lack.
- **No GPU needed.** Without one, Chrome draws WebGL in software: every tool works, first frames take seconds, and `open` and `perf` say those frame times are no budget signal.
- **Headless Chrome:** sizes and pixel ratios are emulated, and no sound plays (the tools report the sounds a page started).

## License

Apache License 2.0 (`LICENSE`). The packages each build bundles keep their own licences, listed in
`THIRD_PARTY_NOTICES.md`. Issues are welcome at https://github.com/paprika3d/paprika3d/issues; see `CONTRIBUTING.md` for code.
