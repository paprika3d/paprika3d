---
name: threejs-perf
description: Profile a three.js or WebGL page from a coding agent - frame time (fps), draw calls, triangles and asset size against a budget, and which objects or settings cost the frame. Use when it stutters, has low fps or loads slowly. paprika3d's perf tool.
---

# Profile a three.js page

After `open`, `perf` measures the frame against a budget (`desktop` by default; `site` for a 3D website, which also times the first scene frame and counts script and asset megabytes):

- `costs: true` lists triangles, shadow casters, draw calls and texture megabytes by named group.
- `variants` measures each change on a fresh page against the baseline, in one call: `{ label: "no trees", hide: ["trees"] }`, a `pixelRatio`, `code` run with `renderer` and `scene` (shadows off, a material swapped), or a `query` the page reads at load.
- `throttle: 4` slows the page's JavaScript as on a weak laptop.

`perf` with `optimize: true` is for a frame `perf` says is over budget, or a user who asks about performance: it tries the `@paprika3d/three-runtime` switches, keeps those that help without changing the picture and writes `game-runtime.json` (`../threejs-game/references/optimize.md`). A page that opens with no `Slow start` line and stays within budget needs neither.

If `open` and `perf` are not among your tools, the paprika3d MCP server is not installed: it runs as `npx -y paprika3d serve` (stdio), and https://paprika3d.com/docs/install has each agent's line.
