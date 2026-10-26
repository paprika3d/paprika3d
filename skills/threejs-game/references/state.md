# game-state

The skill's game-state library: state in typed arrays, a generated `window.__game`, rewind, and Rapier in a worker (`state/` in the plugin). SKILL.md says when to use it.

game-state writes `window.__game` for you. Copy its files first, as SKILL.md says; import from `./game-state.js`; `three` stays the game's own import.

```js
import { createState, list, physics, loop } from './game-state.js';
const state = createState({                       // the observe() schema's shape, with defaults: observe() is state.toJSON()
  player: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: false },
  platforms: list(256, { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 }), // list(capacity, item defaults): numbers and booleans only
  coins: list(256, { x: 0, y: 0, z: 0 }),
  collected: 0, won: false,
  held: { left: false, right: false, jump: false }, // held keys live in the state too; extra keys beside the schema's are fine
});
// read and write it in that shape: state.player.x += 1; const c = state.coins.push({ x: 3 }); state.coins.remove(c);
const world = await physics(state, {              // Rapier, in a worker; leave physics out if the game needs none
  player: { size: [0.6, 1.8, 0.6], lockRotations: true }, // FULL sizes, as three.js: box [w, h, d], sphere [diameter], capsule [height, diameter]
  platforms: { size: p => [p.w, p.h, p.d], type: 'fixed' },
  coins: { shape: 'sphere', size: [0.8], sensor: true },
});
loop({ state, physics: world, tick, render, describe });
```

- `tick(inputs)` is the game's rules for one frame. `inputs` are the key events since the last frame (`{ key }` on press, `{ key, down: false }` on release) and `act()` objects. Read and write only `state` and `world`. Use `state.random()`, never `Math.random`. `tick` runs once per 1/60 s of game time whatever the display's rate (twice a frame at 30 fps, every other frame at 120), so treat one tick as 1/60 s and never read time. Only the first tick of a frame gets that frame's inputs.
- Lists iterate in order and have `length`, `at(i)`, `push(item)` (returns the item) and `remove(item)`; spread one (`[...state.coins]`) to `map` or `filter`. Removing the current item inside `for (const c of state.coins)` is safe.
- Bodies follow their item's `x/y/z`, `vx/vy/vz` and `qx/qy/qz/qw` when it has them; `push` and `remove` on a bound list add and remove bodies. `world.setVelocity(item, v)`, `world.impulse(item, v)`, `world.teleport(item, p)`. `world.events` lists the step's sensor overlaps, and contacts of bodies given `events: true`, as `{ a, b, started, sensor }` with items, so `e.a === state.player` works. `world.ray({ from: item, dir, maxToi })` is answered next frame in `world.hits` (an item or null), in the order queued.
- `render()` draws from the state each frame. Give meshes names, as usual.
- `loop` sets `window.__game`, listens for keys, and keeps a short rewind in memory: `back(n)` on what it returns. `setState` on a body's `x/y/z` teleports it and stops it, unless the same state gives `vx/vy/vz`. Nothing is written to disk.
