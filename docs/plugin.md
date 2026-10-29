---
title: What the paprika3d plugin adds for three.js: tools, skills, hooks and project files
description: Everything the paprika3d plugin and MCP server add to a three.js project: the 15 tools and when to reach for each, the skills, the Claude Code hooks, the files it writes, where runs go and the hosted asset library.
meta: The paprika3d plugin's 15 three.js tools and when to use each, its skills, Claude Code hooks, project files, run folders and asset library.
---
# What the paprika3d plugin adds

The stable build lists 15 tools, nine skills, two Claude Code hooks, and a few files in your project. This page lists them all; the [tools page](/tools) has each tool's full description, as the server registers it.

## The 15 tools

In Claude Code a tool's full name is `mcp__plugin_paprika3d_paprika__<tool>`; from a project's `.mcp.json` it is `mcp__paprika__<tool>`.

| Tool | Reach for it when | What it does |
|---|---|---|
| `open` | A three.js, R3F or WebGL page has been written or changed | Runs the page (a file or folder, an http URL or a dev-server command) in headless Chrome on a paused, seeded clock, and reports the files that loaded and failed, dev-server errors, an unsized canvas and old or removed three.js APIs. Up to 4 pages at once; `browser: "firefox"` uses the installed Firefox (preview) |
| `look` | You need to see what a viewer sees | Shows a screenshot and names every object on screen and every one never seen, with its size and where it is, plus the lighting, z-fighting, canvas and HTML-overlay faults. Modes: `target`, `cameras`, `sheet`, `viewports`, `scroll`, `zoom`, `sample`, `at`, `opening`, `save`, `compare` |
| `interact` | You need to play an interaction the request names | Plays keys, mouse, touch, wheel, scroll, resize and clock steps on exact frames, and reports what changed in the state. `{ state }`, `until`, `trace` and `expect` steps; `save` keeps the play as a check; `record: true` makes a real-time GIF |
| `observe` | You need the state without acting | Reads the state as JSON (`window.__game.observe()`, or the named three.js objects), with renderer counts, new console errors and what changed |
| `eval` | You need a number the other tools do not give, or to try a change before writing it | Runs any JavaScript in the page with `scene`, `camera`, `renderer`, `find` and `stats` in scope; `save` writes what it returns to a file |
| `feel` | You need to know whether a hit, pickup or win lands on screen | Measures camera shake, scale pops, eased moves versus teleports, flashes, particles, spawns, HUD ticks and sounds after the steps |
| `test` | After an edit that could break an earlier feature | Reruns every saved check from a fresh reload, one pass or fail line each |
| `perf` | A reply says the frame is over budget, or the user asks about speed | Times the frame: frame time, draw calls, triangles and asset size against a budget; `variants` in one call, `costs` by named group, `throttle`, `network`. With `optimize: true` it speeds the page up instead: tries the runtime's switches (resolution, defaults, instancing, LOD, dispose) one at a time, keeps in `game-runtime.json` only the ones that help without changing the picture, and ends with the final `test` when the project has saved checks |
| `reference` | The page should match a picture | Reads the picture with no page open (a crop with a pixel grid, colours at points); `compare` puts the page beside it, with the differences by region |
| `model_audit` | The page loads .glb, .gltf or USD files | Checks each file's size, triangles, textures and compression, with a site or Shopify verdict; `shrink` rewrites a .glb or .gltf smaller |
| `model_run` | A model is faster to build in code than to find | Builds it in a modelling scene kept between calls (three.js and Manifold: booleans, hull, extrude, revolve) and saves a .glb the page loads (preview) |
| `model_look` | You need to see that model true to size | Shows the modelling scene from the front, right, top and three-quarter against a grid, with each object's size, triangles, closed or open edges, volume and genus (preview) |
| `asset_search` | The page needs a ready-made model, PBR texture or HDRI sky | Finds one by words or by a crop of a picture, with a contact sheet; `pick` downloads it into the project with its loading code (preview) |
| `publish` | Only when the user asks for a public link | Puts the built page on `https://<name>.paprika3d.app` (preview, invite-only) |
| `send_feedback` | A paprika3d reply was wrong, unclear or got in the way | Sends the paprika3d team a bug or criticism, with the last tool call's name, options and error |

## The skills

| Skill | What it does |
|---|---|
| `threejs-game` | Loads by itself for any three.js page: build the first version whole and as impressive as it can be, then what each tool shows; the `window.__game` convention, and references for lighting, geometry, effects, performance and model files |
| `/paprika3d:paprika-make <request>` | Asks a few questions, one at a time, gathers the pictures to work from (when you have none, a subagent finds some and you confirm them), writes a short brief to `BRIEF.md`, and builds the page in this session |
| `/paprika3d:paprika-loop <request> for <time>` | Starts only when you type it. Builds from the same brief, unattended until the time is up: fresh `claude -p` sessions, a builder then a read-only judge each round, a commit per round and the best tagged `paprika-loop/best`. Edit `paprika-loop/PROMPT.md` while it runs to change the request. Each round is two Claude Code sessions, billed as such; needs `claude` and `git` on PATH |
| `paprika-publish` | Tells the agent when to publish and what to tell you |
| `threejs-screenshot`, `threejs-play`, `threejs-test`, `threejs-perf`, `threejs-glb-audit` | One task each, for an agent that searches for it: which tool sees the scene (`open`, `look`), plays it (`interact`), keeps and reruns checks (`interact` `save`, `test`), times the frame (`perf`) or checks model files (`model_audit`), with `threejs-game` for the method |

The slash commands, automatic skill loading and the hooks are Claude Code features; other agents get the same method from `AGENTS.md` and `skills/threejs-game/SKILL.md`.

## The hooks (Claude Code)

| Hook | What it does for you |
|---|---|
| After each batch of edits | Reruns the checks saved with `interact`'s `save` and rechecks the page's `Lighting:` and `Surfaces:` lines on the reloaded page; it speaks only when one starts or stops failing. Once per session it says a three.js page the agent wrote has not been opened |
| On the first stop | States once the edits never played or looked at and the faults still open |

## The files it puts in your project

| File | Written by | What it is |
|---|---|---|
| `geo.js` | `open` | Procedural geometry with Manifold built in: booleans, hull, extrude, revolve, seeded scatter |
| `fx.js` | `open` | Sound effects made in code, canvas textures, particle bursts, a first-load stage (tone mapping, environment, shadowed light, resize), metre-scale texture coordinates, placement rules, a reference picture's camera |
| `game-state.js`, `physics-worker.js` | the agent, as the skill says | Game state in typed arrays with a generated `window.__game`, rewind, and Rapier physics in a worker |
| `three-runtime.js` | `perf` with `optimize: true` | The switches it keeps, read from `game-runtime.json` |

`geo.js` and `fx.js` are written on the first open and replaced only when the plugin's copy changes; leave them in place.

## Where runs go

`paprika3d/runs/<time>/`: one folder per open. Each open deletes the pictures and clips (.png, .gif, .mp4) of all but the newest 10 run folders, keeping `run.json`, `last-test.json` and every other file; a folder written to in the last hour is left whole. Saved baselines live in `paprika3d/baselines/`. Add `paprika3d/` to the project's `.gitignore`.

## The asset library

`asset_search` reaches a hosted library at `assets.keeno.dev`, with over 62,000 assets:

| Kind | Count | Licence | Source |
|---|---|---|---|
| Models | 57,732 | CC BY 4.0 or CC0 | Objaverse, web-ready; 549 AI-generated, from Scenario's 3D Collection |
| PBR textures | 3,545 | CC0 | |
| HDRI skies | 1,430 | CC0 | |

- `pick` puts the file in `assets/` (`public/assets/` with Vite) and replies with the code that loads it, a model at its real-world size.
- A CC BY model's credit line goes into `CREDITS.md`, as the licence requires.
