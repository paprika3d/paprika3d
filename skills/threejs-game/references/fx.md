# Game effects: fx.js

The `open` tool puts `fx.js` in the project root, next to `geo.js`. It holds a first-load setup (`stage`), canvas textures (`tex`), terrain and rule-based placement (`field`, `place`, `instances`), synthesized sound (`sfx`), particles (`burst`), camera shake (`shake`), metre-scale texture coordinates (`uv`), a reference picture's camera with its pixel-to-world maps (`picture`), a subtree baked to GLB bytes (`bake`), and a picture's outlines and heights (`trace`, `heightfield`). Pure JS with no files to load. Nothing in it reads `Math.random`: the same `seed` gives the same pixels, points, particles and samples. Never edit it; this page lists its API.

```js
import * as THREE from "three";
import { stage, tex, field, place, instances, sfx, burst, shake, uv, picture, bake, trace, heightfield } from "./fx.js";   // "../fx.js" from src/ in a vite project
```

## stage

`stage(container = document.body, { env, exposure, key, shadow, ground, background, fit })` returns `{ renderer, scene, camera, key, ground, fit }`. It gives ACES tone mapping, sRGB output, a pixel ratio capped at 2, a studio environment, a key light with a shadow, a ground, a camera (a `PerspectiveCamera` with a 40° vertical fov at (3, 2.5, 5) looking at the origin, near 0.1 and far 1000 until `fit`) and a resize that follows the container: the setup faults `look` names are already fixed. It starts no render loop.

- `env`: a colour for a flat environment, `false` for none; default the studio box. `exposure`: tone mapping exposure, default 1.
- `key`: key light intensity, default 1.5, `0` for none. `shadow`: default `true`.
- `ground`: default a shadow catcher (shows only shadows); a colour for a solid ground; `false` to bring your own.
- `background`: default `0xe8e8e8`; `null` is transparent.
- `fit(object or Box3, margin = 1.2)` frames the camera on the content from the direction it already looks along, sizes the key light's shadow camera to it and puts the ground under it; it returns the content's centre. Pass the content, not the scene. Call it again when the content grows.

```js
const { renderer, scene, camera, fit } = stage(document.body, { background: 0x1a2030, ground: false, key: 3 });
scene.environmentIntensity = 0.4;   // a game's own lit ground: the full studio light washes out the shadows
scene.add(level); fit(level);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

Orbit controls are two lines of your own (the import map needs `"three/addons/"`):
`import { OrbitControls } from "three/addons/controls/OrbitControls.js"; new OrbitControls(camera, renderer.domElement).target.copy(fit(model));`

## picture

`picture({ position, lookAt, fov, size })` is the camera a reference picture was taken or painted from (its entry in `refs/cameras.json`; `fov` is the vertical field of view in degrees, `size` the picture's pixels) and the maps between the picture's pixels and the world, so what the picture shows is built where it stands. It returns `{ camera, at, ground, px, fit }`; the pose is kept, so moving `camera` later (OrbitControls) changes none of the maps.

- `at(px, py, depth)`: the world point under a picture pixel, `depth` metres in front of the camera. `ground(px, py, y = 0)`: the point under a pixel on the horizontal plane at `y`, or `null` above the horizon. `px(point)`: the picture pixel under a world point, or `null` behind the camera.
- `fit(width, height, cam = camera)` sets the camera to show the whole picture's frame on a canvas of that size: the picture's own view at its aspect, with room beside or above it otherwise. Call it on resize.

```js
const cams = await (await fetch("refs/cameras.json")).json(), pic = picture(cams["01.jpg"]);
const { camera, at, ground, px } = pic; pic.fit(innerWidth, innerHeight);
tower.position.copy(ground(1708, 742));          // its foot, where the picture has it on the ground
lantern.position.copy(at(1776, 250, 180));       // 180 m away, under that pixel
const [u, v] = px(tower.position);                // where the page puts it, to check against the picture
```

## bake

`bake(object, { animations })` is `object` and its children as GLB bytes (an `ArrayBuffer`), the root at its world transform, so a baked piece loads where it stood. `eval` with `save` writes it into the project: bake a geo.js solid once and load the GLB (no manifold wasm at load), or a mesh with a painted canvas texture. It loads `GLTFExporter` from `three/addons/`, which the import map must have.

```js
// eval { save: "assets/arch.glb" }
const { bake } = await import("./fx.js"); return bake(find("arch"));
```

## trace, heightfield

`trace(src, { colour, tolerance, invert, simplify, minArea, scale })` turns one colour of a picture (a URL, image or canvas) into `THREE.Shape`s with their holes, for `ShapeGeometry` or `ExtrudeGeometry`: the pixels within `tolerance` (RGB distance, 40) of `colour`, or with no colour every pixel off the background (the commonest corner colour); `invert` swaps them. Outlines are simplified to within `simplify` px (1), pieces under `minArea` px² (4) are dropped, and points are picture pixels × `scale` with y up. It returns `{ shapes, mask, width, height }`, `mask` the canvas it traced (white on black).

`heightfield(src, { size, height, base })` reads a picture's brightness as heights over a `size`-wide area centred on the origin (its depth by the picture's aspect, the picture's top toward -z): black at `base`, white at `base + height`. It returns a field like `field`'s, so `place({ on })` scatters on it.

```js
const { shapes } = await trace("refs/plan.png", { colour: "#1a1a1a", scale: 0.02 }); // walls drawn black, 1 px = 2 cm
scene.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shapes, { depth: 3, bevelEnabled: false }).rotateX(-Math.PI / 2), wallMat));
const hills = await heightfield("refs/height.png", { size: 200, height: 30 });
scene.add(new THREE.Mesh(hills.geometry(128), grassMat));
```

## tex

Each builder returns a `THREE.CanvasTexture`. Colour maps come tagged sRGB; `normal` is a data map and is not. `noise`, `wood`, `bricks` and `windows` tile (`RepeatWrapping`), so set `map.repeat` or use `uv`. Colours are anything `THREE.Color` takes.

- `tex.noise({ size, scale, colors: [a, b], octaves, seed })`: stone, sand, grass, dirt. `scale` is blobs across.
- `tex.wood({ size, color, rings, seed })`, `tex.bricks({ size, rows, cols, brick, mortar, jitter, seed })`.
- `tex.windows({ size, cols, rows, lit, frame, glass, wall, seed })`: a facade, a seeded `lit` share of windows warm.
- `tex.label(text, { size, color, background, font, padding })`: text sized to its ink; `t.image.width / t.image.height` is its aspect.
- `tex.glow(color, { size, falloff, opacity })`: a radial blob, for a glow (additive) or a contact shadow (black).
- `tex.dots(text, { cols, rows, on, off, dot }, into)`: an LED display; pass the last texture as `into` to redraw it in place.
- `tex.normal(texture, { strength, invert })`: relief from brightness; bricks set `invert` for you.
- `tex.rng(seed)`: the seeded generator they use, for your own randomness.

```js
const map = tex.bricks({ rows: 8, cols: 4 }); map.repeat.set(4, 2);
wall.material = new THREE.MeshStandardMaterial({ map, normalMap: tex.normal(map) });
```

## field, place, instances

- `field(size, { seed, octaves, height, scale, base, basins: [[x, z, radius, depth]] })` is a height function centred on the origin: `{ area, heightAt(x, z), normalAt(x, z), geometry(segments) }`. Build the mesh with `geometry(segments)` before placing things, so `heightAt` follows the drawn triangles.
- `place(n, options)` scatters `n` random points that pass every rule (fewer, with a console error, when they do not fit); `place([nx, nz], options)` is a grid spanning `area` corner to corner. Options: `area: [x0, z0, x1, z1]`, `seed`, `on` (a field), `minHeight`, `maxHeight`, `maxSlope` (degrees), `avoid(x, z)`, `spacing`, `jitter` (grid), `edge` (grid border only), `scale: [min, max]`, `rotate` (true or a yaw), `tilt` (degrees), `stretch`. Each point is `{ x, y, z, ry, s, rx, rz, sx, sz }`.
- `instances(geometry, material, points, name)` turns the points into one named `InstancedMesh`.

```js
const land = field(100, { seed: 2, height: 5, basins: [[8, 6, 12, 7]] });   // a lake 7 deep at (8, 6)
scene.add(new THREE.Mesh(land.geometry(160), grassMat));
scene.add(instances(treeGeo, treeMat, place(150, { on: land, seed: 3, minHeight: 0, maxSlope: 30, scale: [0.8, 1.6], rotate: true }), "trees"));
```

## sfx

Sound effects synthesized in code (a port of ZzFX), no audio files. Presets: `coin`, `jump`, `hit`, `explode`, `shoot`, `laser`, `powerup`, `blip`, `bounce`, `thud`, `roll`.

- `sfx.play(sound, volume = 1, when = 0)`: a preset name or a params object, `when` seconds from now (a note sequence needs no `setTimeout`). Returns the source node (set `loop`, `playbackRate`, call `stop()`), or `undefined` when audio is locked or missing. It never throws for blocked audio; an unknown preset name throws.
- `sfx.define(name, params)` adds a preset. Params: `volume`, `frequency`, `attack`, `sustain`, `release`, `shape` (0 sine, 1 triangle, 2 saw, 3 tan, 4 noisy sine, 5 square), `slide`, `pitchJump`, `pitchJumpTime`, `repeatTime`, `noise`, `filter` (negative low-pass), `decay`, `sustainVolume`, `delay`, `bitCrush`, `tremolo`, `seed` and more.
- `sfx.check(sound)` returns `{ duration, peak, rms, clipped, hz }`: hear a sound through `eval` (`return (await import("./fx.js")).sfx.check("door")`: `sfx` is not in its scope). `peak` over 1 clips; noise reads as a high `hz`.
- `sfx.log` holds every play call `{ name, time, audible }`; `sfx.presets()` lists the names; `sfx.render(sound)` gives the samples.

```js
sfx.define("door", { frequency: 90, shape: 2, release: 0.3, slide: -1 }); sfx.play("door");
const r = sfx.play("roll"); if (r) { r.loop = true; r.playbackRate.value = speed; }   // a looping voice needs release: 0, as roll has
```

## burst and shake

`burst({ max = 500, seed = 1, size = 0.1, additive = true, ...defaults })` returns a `Burst`: one `THREE.Points` pool of soft round dots, positions in its own space. The other options are defaults for `emit`.

- `emit(at, { count, speed, life, gravity, drag, color, spread, up })` starts particles at a `Vector3`. Defaults: 20, 4 units a second, 1 s, 9.8 along -y (a number, or `[x, y, z]` for a z-up game), no drag, white, `spread` Math.PI (a sphere; it is the cone's half-angle around `up`), `up` +y (a `Vector3` or `[x, y, z]`). Past `max`, the rest are dropped; speed and life vary by up to half.
- `update(dt)` moves, ages and fades every particle; call it once per frame. `alive` is the live count.
- `shake(object, { seed = 1, decay = 6 })` returns `{ kick(strength), update(dt) }`: a seeded, decaying shake for a camera or any object. Call `update` after placing the object each frame.

```js
const sparks = burst({ max: 300, seed: 1, size: 0.1 }); sparks.name = "sparks"; scene.add(sparks);
sparks.emit(hit.point, { count: 40, speed: 6, spread: Math.PI / 4, color: 0xffaa33 });
const cam = shake(camera); cam.kick(0.3);
// each frame, after placing the camera: sparks.update(dt); cam.update(dt);
```

## uv

`uv(geometry, metresPerRepeat = 1, offset = 0)` writes box-projected texture coordinates in the geometry's own units, so one tiling texture shows at the same real size on a floor, a wall, terrain and geo.js's boolean output (which has no UVs). It returns the geometry; call it before the first render. `offset` shifts u by that many metres, so buildings sharing a `tex.windows` tile do not show the same lit windows.

```js
floor.geometry = uv(new THREE.BoxGeometry(6, 0.1, 5), 2);   // tex.wood repeats every 2 m
```

## Pitfalls

- Name every burst and instanced mesh, so `look` lists it. A burst with no live particles is left out of `look`'s lists until it emits.
- Before the page's first click or key, audio is locked: `play` logs `audible: false` and plays nothing. Read `sfx.log` or `sfx.check`, not the speakers.
- Give each builder its own fixed `seed`: two with the same seed draw the same pattern.
- `uv` works in the geometry's units: a `mesh.scale` stretches the metres.
