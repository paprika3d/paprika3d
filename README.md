<!-- hero -->
<h1 align="center">paprika3d</h1>

<p align="center"><b>Three.js MCP server and Claude Code plugin: screenshot, play, test and profile the three.js pages your coding agent builds.</b></p>

<p align="center"><a href="https://www.npmjs.com/package/paprika3d"><img alt="npm" src="https://img.shields.io/npm/v/paprika3d?color=d93a1e&label=npm"></a> <a href="#install"><img alt="works with Claude Code, Codex, Gemini CLI, Cursor and VS Code" src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Gemini%20%C2%B7%20Cursor%20%C2%B7%20VS%20Code-2b2b2b"></a> <a href="https://registry.modelcontextprotocol.io"><img alt="MCP server" src="https://img.shields.io/badge/MCP-server-2b2b2b"></a> <a href="https://paprika3d.com/docs"><img alt="docs" src="https://img.shields.io/badge/docs-paprika3d.com-2b2b2b"></a> <a href="https://github.com/paprika3d/paprika3d/blob/main/LICENSE"><img alt="license: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-2b2b2b"></a> <a href="https://glama.ai/mcp/servers/paprika3d/paprika3d"><img alt="paprika3d MCP server: quality and maintenance score on Glama" src="https://glama.ai/mcp/servers/paprika3d/paprika3d/badges/score.svg"></a></p>

<p align="center"><a href="https://paprika3d.com/media/paprika3d-intro.mp4"><img src="https://paprika3d.com/media/paprika3d-teaser.gif" alt="An 8-second loop from the paprika3d intro reel: a flower burst over a harbour, a yellow-walled Backrooms corridor, a stone figure with a skull at a computer keyboard, a low-poly lighthouse and cottage, a lighthouse on a green sea cliff with two people, and an illustrated PAPRIKA poster. It links to the full 46-second video." width="480"></a></p>

<!-- /hero -->

Your agent opens its page in headless Chrome on a clock it controls, reads which objects are on screen and which never appear, plays inputs on exact frames and times each frame. So it finds the invisible model, the file that never loaded and the flickering faces, and fixes them before it tells you it is done.

**The main result:** with paprika3d, Sonnet 5.5 made 86% of its 3D objects pass every check, against 66% without it: **+20 points (95% interval +11 to +29)**, over 150 runs in each arm. The checks are no flickering, see-through or inside-out faces, code that runs, and a budget. The checks come from [3JSBench](https://3jsbench.com) by General Context Labs. [All results](#results), each with its run count.

## Install

Needs Google Chrome and Node 20.11 or later; the Claude Code plugin needs Claude Code 2.1.118 or later.

| Agent | Install |
|---|---|
| **Claude Code** | `claude plugin marketplace add paprika3d/paprika3d`<br>`claude plugin install paprika3d@paprika3d` |
| **Codex CLI** | `codex mcp add paprika -- npx -y paprika3d serve` |
| **Gemini CLI** | `gemini mcp add paprika npx -y paprika3d serve` |
| **Cursor, VS Code, Windsurf** | `npx -y paprika3d serve` as an MCP server in the client's settings ([JSON below](#other-mcp-clients)) |
| **Skill only** (any agent) | `npx skills add paprika3d/paprika3d` (one skill: `--skill threejs-screenshot`) |

Then ask your agent to **use paprika3d to playtest**. In Claude Code, `/paprika3d:paprika-make <request>` builds a whole page from one request.

## What your agent sees

Every reply is short text with the numbers that fix the problem. Part of one `look` reply, on a test page with a start line laid flat on a road:

```text
Surfaces: "road" and "startDecal" share a face plane (y = 0.00) over 2.6 × 16 units: they flicker as the camera moves (z-fighting). Move one at least 0.00054 units off the plane (what the depth buffer can tell apart at 21 units from this camera), give the top one material.polygonOffset = true with polygonOffsetFactor -1, or remove the hidden face.
On screen (4):
road 44% [0, 307, 1279, 799] 500 × 18 units, along the view
grass 17% [0, 307, 1279, 587] 600 × 400 units
startDecal 0.46% [366, 427, 915, 440] 16 × 2.6 units, across the view
board4 0.075% [553, 286, 587, 307] 8 × 5 units
Never visible: none
```

### Other MCP clients

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

## What it does

It works on any three.js, React Three Fiber or WebGL page, `WebGPURenderer` included: games, product viewers and configurators, scroll sites, simulations, shader and post-processing demos. Your page needs no changes.

| Part | What your agent does | Tools |
|---|---|---|
| **See it** | Sees what is on screen, what never appears and why (behind the camera, outside the view, too small), which files failed to load, and which lighting and surface faults show | `open`, `look`, `observe` |
| **Play it** | Presses keys, clicks, touches and scrolls on exact frames of a paused, seeded clock, reads the state after each input, keeps a play as a check that reruns after every edit, and measures how a hit or pickup shows on screen | `interact`, `test`, `feel` |
| **Ask it** | Runs any JavaScript against `scene`, `camera` and `renderer`, and reads each mesh's triangles, bounds, closed edges, volume and genus | `eval` |
| **Speed it** | Times the frame against a desktop, mobile, Quest or site budget, finds what costs it, and keeps only the speed-ups that leave the picture unchanged | `perf` |

`open` also puts two helper files in the project, `geo.js` (procedural geometry) and `fx.js` (sound, textures, particles, a lighting setup), and the skill can add game-state, which keeps game state in typed arrays and runs Rapier physics in a worker. `send_feedback` sends the team a report when a reply was wrong. Every tool, with when to reach for it, the skills, the hooks and the files: [what the plugin adds](https://paprika3d.com/docs/plugin).

## Results

[3JSBench](https://3jsbench.com) by General Context Labs checks the 3D objects a model builds from one-line requests. In our run of its checks, more objects pass with paprika3d:

| 3JSBench | Without paprika3d | With paprika3d | Difference (95% interval) | Runs |
|---|---|---|---|---|
| Sonnet 5.5: objects that pass every check | 66% | 86% | +20 points (+11 to +29) | 150 per arm (50 objects, 3 runs each) |
| Opus 5.5: objects that pass every check | 63% | 78% | +15 points (+4 to +26) | 150 per arm (50 objects, 3 runs each) |
| Sonnet 5.5: objects with no flickering (z-fighting) faces | 68% | 88% | +20 points (+11 to +29) | 150 per arm (50 objects, 3 runs each) |
| Opus 5.5: objects with no flickering (z-fighting) faces | 69% | 89% | +21 points (+11 to +31) | 150 per arm (50 objects, 3 runs each) |

**Imported models show up, at the right size.** Sonnet 5.5 building three.js pages that each load a glTF model. The paprika3d runs had a one-time reminder to open the page after the first edit; the plugin's after-edit hook now says once that a page the agent wrote has not been opened.

| Imported models | Without paprika3d | With paprika3d | Runs |
|---|---|---|---|
| Model loaded and shown at the right size | 1 of 11 runs | 9 of 11 runs | 11 per arm, a small sample |
| Draco-compressed model loaded | 0 of 3 runs | 3 of 3 runs | 3 per arm, a small sample |

On a mini golf page the agent loaded a toy car so small it never showed up, and the screenshot looked fine. `look` named it: `Never visible: ToyCar (0.0338 units, in view)`.

**Finding flickering faces in finished objects.** An agent was shown 133 finished objects, one run each, and asked for their defects. With Sonnet 5.5, paprika3d found 75% of the flickering faces and Playwright MCP with a written QA skill and a measuring script found 44%; paprika3d passed 80% of the clean objects and Playwright 66%. With Opus 5.5 the two were close: 40% and 35% of the flickering faces found.

**Heavy physics leaves the main thread free.** With game-state, a scene of about 2,000 crates spent 1.3 to 2.0 ms of each frame on the main thread instead of 7 to 11 ms, and passed 18 of 18 game checks either way. Opus 5.5, 2 runs per arm, a small sample; both arms had paprika3d, the difference is game-state.

## How it compares with Playwright MCP and Blender MCP

paprika3d is built for one job: an agent building a three.js page.

| | paprika3d | Playwright MCP | Blender MCP |
|---|---|---|---|
| Sees the three.js scene graph (named objects, sizes, what never appears) | Yes | No | No |
| Paused, seeded clock: the same inputs give the same frames | Yes | Not built in | No |
| Input on an exact frame, with the game's state back | Yes | No | No |
| Frame time against a budget, and an optimizer | Yes | No | No |
| Lighting and z-fighting faults named | Yes | No | No |

## Extras

These come with the plugin but are not the core. The ones marked preview may change in any minor release.

- **`model_audit`** checks .glb, .gltf and USD files for size, triangles, textures and compression, with a site or Shopify verdict; `shrink` rewrites a .glb or .gltf smaller.
- **`model_run` and `model_look`** (preview) build a model in code, in a modelling scene kept between calls (three.js and Manifold: booleans, hull, extrude, revolve), show it true to size from four sides, and save a .glb the page loads.
- **`reference`** reads a picture the page should match (a crop with a pixel grid, colours at points), and puts the page beside it with the differences by region.
- **`asset_search`** (preview) finds a ready-made model, PBR texture or HDRI sky in a hosted library of over 62,000 assets, by words or by a crop of a picture; `pick` downloads one into the project with the code that loads it, and a CC BY model's credit line into `CREDITS.md`.
- **`publish`** (preview, invite-only) puts the built page on `https://<name>.paprika3d.app` when you ask. Join the waitlist at https://paprika3d.com/waitlist and set `PAPRIKA3D_PUBLISH_INVITE` to your code; [what a publish uploads and records](https://paprika3d.com/docs/publish).
- **`/paprika3d:paprika-loop <request> for <time>`** builds unattended until the time is up: fresh `claude -p` sessions, a builder then a read-only judge each round, a commit per round. It starts only when you type it. Each round is two Claude Code sessions, billed as such; it needs `claude` and `git` on PATH.

## Making a game checkable

Any page works as it is. Add `window.__game` (`describe`, `observe`, `act` and `setState`) once the page has loaded, and your agent reads and sets the game's exact state: [the convention](https://paprika3d.com/docs/convention).

## Where runs go

`paprika3d/runs/<time>/`: one folder per open. Each open deletes the pictures and clips (.png, .gif, .mp4) of all but the newest 10 run folders, keeping `run.json`, `last-test.json` and every other file; a folder written to in the last hour is left whole. Saved baselines live in `paprika3d/baselines/`. Add `paprika3d/` to the project's `.gitignore`.

`geo.js` and `fx.js` are written on the first open and replaced only when the plugin's copy changes; leave them in place.

## What leaves your machine

- **`look` and `interact`**, when the project has no matching three.js installed, have Chrome fetch that three.js version from `cdn.jsdelivr.net`.
- **`asset_search`** sends your agent's searches (the words, or the crop of a picture it searches by) and what it picks to the asset library at `assets.keeno.dev`.
- **`send_feedback`,** only when the agent calls it, sends its text, the last tool call's name, option names and error, the plugin version, OS and Node version, a random install id (kept in `~/.paprika3d/telemetry/id`) and a per-run id. `DO_NOT_TRACK=1` or `PAPRIKA3D_TELEMETRY=0` turns it off.
- **Once per install and per update,** the MCP server sends the same install id, the plugin version, OS and Node version and your MCP client's name and version, so the team can count installs; nothing about your project. The same switches turn it off.
- **`publish`,** only when you ask: the built project, to host it.

## What stays stable

The tool names and their inputs, the skill names, the `paprika3d serve` command and the environment variables in `server.json` change only in a minor release before 1.0, and only with a note in [CHANGELOG.md](CHANGELOG.md), which lists each release; a patch release never changes them. The previews may change in any minor release: `publish`, `model_run` and `model_look`, `asset_search`, and `open`'s `browser: "firefox"`.

Requirements and limits (Chrome's location, Firefox, running with no GPU, headless Chrome): [the install page](https://paprika3d.com/docs/install).

## Source, contributions and license

Each release ships the readable TypeScript it was built from, in `source/`. Contributions are welcome as a patch in an issue or a pull request, each commit signed off for the Developer Certificate of Origin (`git commit -s`); see `CONTRIBUTING.md`. Issues: https://github.com/paprika3d/paprika3d/issues.

Apache License 2.0 (`LICENSE`). The packages each build bundles keep their own licences, listed in `THIRD_PARTY_NOTICES.md`.
