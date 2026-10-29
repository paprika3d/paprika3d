---
name: threejs-play
description: Play a three.js or WebGL game or interactive page from a coding agent - keys, mouse, touch and scroll on exact frames of a paused, seeded clock, the state read back as JSON. Use to playtest its controls. paprika3d's interact tool.
---

# Play a three.js page

After `open`, `interact` sends `steps` frame by frame and replies with what changed in the state:

- `{ key: "ArrowRight", frames: 30 }` holds a key that many frames; a mouse or touch step (`{ mouse: "click", x, y }`) says which named object is under it.
- `{ state: { ... } }` sets a moment up first (through `window.__game.setState`); `{ until: { "player.grounded": true }, max: 120 }` steps until the state holds and says the frame.
- `trace: ["player.y"]` gives a path's peak, first change and landing with their frames; `look: true` adds the picture after the steps.

`observe` reads the state without playing; `feel` says what reacted on screen to an event (pops, flashes, shakes, particles, sounds, teleports). The state is exact when the page sets `window.__game` (the convention, and the rest of the method: `../threejs-game/SKILL.md`). To keep a play as a check, see the `threejs-test` skill.

If `open` and `interact` are not among your tools, the paprika3d MCP server is not installed: it runs as `npx -y paprika3d serve` (stdio), and https://paprika3d.com/docs/install has each agent's line.
