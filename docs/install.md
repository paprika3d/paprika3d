---
title: Install paprika3d: a three.js test harness plugin for Claude Code
description: How to install paprika3d, the Claude Code plugin and MCP server that makes any coding agent a better three.js developer, and how to run its MCP server from Cursor, Codex or Gemini CLI.
---
# Install paprika3d

## Requirements

- Google Chrome. The harness runs the page in a headless instance of it. On Linux or Windows set `PAPRIKA3D_CHROME` to its path.
- Node 20.11 or later.

## Claude Code

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

The plugin adds the paprika3d tools (`open`, `look`, `interact` and the rest), the `threejs-game` skill and the hooks to Claude Code. After installing, ask the agent to build or fix a three.js page: the skill tells it to open and look at the page before saying it is done.

## Other agent products

Cursor, Codex, Gemini CLI and any other client that speaks MCP run the server from npm, where it is published as [`paprika3d`](https://www.npmjs.com/package/paprika3d) with provenance:

```bash
npx -y paprika3d serve
```

Register that command as a stdio MCP server in the client's configuration (`"command": "npx", "args": ["-y", "paprika3d", "serve"]`). For the Codex CLI: `codex mcp add paprika -- npx -y paprika3d serve`. The tools are the same; the hooks are a Claude Code feature. To give Cursor, Codex, OpenCode and other agents the `threejs-game` skill too, add it next to the server:

```bash
npx skills add paprika3d/paprika3d
```

Without the skill, the agent needs to be told to open and look at its page (the [tools page](/tools) and the [skill](/skill) say how).
