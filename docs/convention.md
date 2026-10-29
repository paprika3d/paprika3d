---
title: The window.__game convention | paprika3d docs
description: The window.__game convention a three.js game exposes so paprika3d can read and set its exact state, send it actions and name what the game is about.
---
# The window.__game convention

Any three.js, React Three Fiber or WebGL page can be opened, looked at and driven without it: `open`, `look`, `observe` (which falls back to the page's named three.js objects), `eval`, `interact` with keys, mouse and touch, `feel` and `perf` work on a page that knows nothing about the harness. To read and set a game's exact state, the game also exposes `window.__game`.

<!-- include: skills/threejs-game/SKILL.md#The `window.__game` convention -->

The harness sends keys, mouse and touch as real browser events, so the game's own listeners receive them. An `{ action, ...args }` object reaches `__game.act` whole.

