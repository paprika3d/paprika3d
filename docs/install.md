---
title: Install paprika3d: a three.js test harness plugin for Claude Code
description: How to install paprika3d, the Claude Code plugin and MCP server that makes any coding agent a better three.js developer, and how to run its MCP server from Cursor, Codex or Gemini CLI.
meta: Install paprika3d, the three.js MCP server and Claude Code plugin, or run its MCP server from Cursor, Codex or Gemini CLI.
---
# Install paprika3d

Two commands in Claude Code, one line in any other MCP client. From then on your agent sees, plays and measures every three.js page it writes.

## Requirements

- Google Chrome. The harness runs the page in a headless instance of it, found at its usual install path on macOS and Linux, on PATH, or in Playwright's or Puppeteer's cache. Anywhere else, set `PAPRIKA3D_CHROME` to its path.
- Node 20.11 or later.
- For the Claude Code plugin, Claude Code 2.1.118 or later.
- Optional: Firefox, for `open`'s `browser: "firefox"`; the one installed on the machine is used (or `PAPRIKA3D_FIREFOX`). With no Chrome, a plain open falls back to it.

## Limits

- **No GPU needed.** Without one, Chrome draws WebGL in software: every tool works, first frames take seconds, and `open` and `perf` say those frame times are no budget signal.
- **Headless Chrome:** sizes and pixel ratios are emulated, and no sound plays (the tools report the sounds a page started).
- The after-edit hook runs on Claude Code's `PostToolBatch` event, which versions before 2.1.118 lack.

## Claude Code

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

The plugin adds the [tools](/tools) (`open`, `look`, `interact` and the rest; their full names start `mcp__plugin_paprika3d_paprika__`), the skills and the hooks to Claude Code. After installing, ask the agent to build or fix a three.js page, or start one with `/paprika3d:paprika-make <request>`, which asks a few questions for a short brief first. The `threejs-game` skill, which Claude loads by itself, says what each tool shows.

## Other agent products

Cursor, Codex, Gemini CLI and any other client that speaks MCP run the server from npm, where it is published as [`paprika3d`](https://www.npmjs.com/package/paprika3d) with provenance:

```bash
npx -y paprika3d serve
```

Register that command as a stdio MCP server in the client's configuration (`"command": "npx", "args": ["-y", "paprika3d", "serve"]`). For the Codex CLI: `codex mcp add paprika -- npx -y paprika3d serve`; for the Gemini CLI: `gemini mcp add paprika npx -y paprika3d serve`. The tools are the same; the hooks and slash commands are Claude Code features. To give Cursor, Codex, OpenCode and other agents the skills too, add them next to the server:

```bash
npx skills add paprika3d/paprika3d
```

Among them are `threejs-game` (the method) and one skill per task: `threejs-screenshot`, `threejs-play`, `threejs-test`, `threejs-perf` and `threejs-glb-audit`. `--skill <name>` adds one alone.

Without the skill, the agent needs to be told to open and look at its page (the [tools page](/tools) and the [skill](/skill) say how).
