---
name: threejs-screenshot
description: Screenshot a three.js, React Three Fiber or WebGL page headless, with what is on screen and what never appears (a model at the wrong scale, out of view or not loaded). Use to see a 3D scene or canvas. paprika3d's open and look tools.
---

# Screenshot a three.js scene

1. `open` the page once: `cwd` and `url: "index.html"` (the folder is served over HTTP), or `command: "bunx vite"` for a dev server. The reply lists the files it loaded and any that failed.
2. `look`: the picture is in the reply, with the named objects on screen and a `Never visible:` line for each one no look has seen, with its size and where it is.

One mode per call: `target: "<name>"` for four views of one object, `cameras` for several positions in one picture, `sheet` for several moments or stages, `opening: true` for the first seconds after load, `zoom` for a box enlarged, `scroll` for a page driven by scrolling. After an edit, the next `look` reloads the page by itself and says which fault lines closed. What its `Lighting:`, `Surfaces:` and other lines mean, and how to close one: `../threejs-game/references/lighting.md`.

Building or changing the page: the `threejs-game` skill (`../threejs-game/SKILL.md`) says what every tool shows. If `open` and `look` are not among your tools, the paprika3d MCP server is not installed: it runs as `npx -y paprika3d serve` (stdio), and https://paprika3d.com/docs/install has each agent's line.
