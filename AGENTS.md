# paprika3d (the three.js toolset for coding agents)

This is the paprika3d plugin: an MCP server, `paprika`, whose tools let a coding agent open, look at, play, measure and fix
three.js, React Three Fiber and WebGL pages in headless Chrome (or Firefox: `open`'s `browser`) on a paused, seeded clock. Use it on any such page you
write or change (a game, a product viewer, a simulation, a shader demo). The page needs no changes to be opened, looked
at and driven. Build the first version whole and as impressive as you can, risks welcome: these tools make debugging
and polishing it cheap.

When the user says "use paprika3d to playtest" (or "playtest it", "look at it", "check the scene"), run the loop below.

## The loop: open, look, interact, eval

1. **Open:** `open` with `cwd` (the project folder) and `url: "index.html"` (the folder is served) or
   `command: "bunx vite"`. Read the `Loaded:` and `Failed to load:` lines.
2. **Look:** `look`. Read `Never visible:`: an object of 0.07 units in a scene 8 units wide is at the wrong scale;
   `behind the camera` or `outside the view` is a framing problem. Open the picture it saves.
3. **Interact:** for each interaction the request names, `interact` (keys, mouse, touch or `__game.act` actions, frame by
   frame) and read the state before and after; a `{ wait }` step steps time.
4. **Eval:** `eval` runs JavaScript in the page with `scene`, `camera`, `renderer`, `find(name)` and
   `stats(target)` in scope, to check sizes, materials and positions or try a change before writing it into the source.
5. Fix, then look again. `perf` when performance matters, with `optimize: true` only when a reply says the frame is over
   budget or the user asks.

## The `window.__game` convention

Any page can be opened and looked at. To read and set a game's state, the page sets, once loaded:

```js
window.__game = {
  describe(),        // name, controls, units
  observe(),         // the state as plain JSON
  act(input),        // one input: { key, down? } or { action, ...args }
  setState(partial), // sets any of observe()'s keys at once
};
```

It starts playing on load (no title screen, no click to start, nothing over the first frame), takes time only from `requestAnimationFrame` /
`performance.now` and randomness only from `Math.random`; paprika3d fakes and seeds both. Keys listen on `window` and
match `event.code`.

## More

- The full method, its reference files (plain three.js, React Three Fiber, Rapier) and rules: `skills/threejs-game/SKILL.md`,
  with `references/geometry.md` and `references/optimize.md` beside it. One task each: `skills/threejs-screenshot/`,
  `threejs-play/`, `threejs-test/`, `threejs-perf/` and `threejs-glb-audit/`.
- The `open` tool puts `geo.js` (booleans, hull, extrude, revolve, seeded scatter) and `fx.js` (sound effects, canvas
  textures, particle bursts, a first-load stage, texture coordinates, placement rules) in the project.
- With no page open: `reference` reads a picture the page should match (`compare` puts the open page beside it),
  `model_audit` reports .glb, .gltf and USD files against a site or Shopify budget, `model_run` and `model_look` build
  and picture a model in code (three.js and Manifold) and save it as a .glb, and `asset_search` finds a ready-made
  model (CC BY or CC0), PBR texture or HDRI sky in the hosted library and puts it in the project with its loading code
  and credit line.
- `send_feedback` sends the paprika3d team a bug or criticism of the harness itself, never the user's code or files.
- Runs are saved in `<project>/paprika3d/runs/`; add `paprika3d/` to the project's `.gitignore`.
- Publishing (`publish`, a preview, invite-only) is only for when the user asks for a paprika3d.app link. Never read,
  print or paste `~/.config/paprika3d/credentials.json` or `PAPRIKA3D_PUBLISH_KEY`: `publish` reads the key itself, and
  whatever you print lands in the transcript.
