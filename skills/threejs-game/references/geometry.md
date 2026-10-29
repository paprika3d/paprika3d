# Procedural geometry: three.js plus geo

Manifold (exact booleans, hull, extrude, revolve, level sets, smoothing) with three.js helpers, and a seeded `scatter`, in two places:

- **`model_run`**, the modelling scene the server keeps between calls: `THREE`, `scene`, `geo` (started), `scatter`, `find`, `stats`, `save`, `load` and `clear` are in scope, so the recipes below run there without their import lines, `const { Manifold, toGeometry } = geo` in place of `await geo()`. It is a modelling scene, as Blender is to a game, apart from the game's page, for a prop, a building, a vehicle or a piece of the set. `model_look` shows the result from the front, right and top at true size against a grid and from three-quarter, with each mesh's triangles, size, whether it is closed, its volume and genus. What the code adds stays for the next call (saved to `paprika3d/model/scene.glb`, so a restart loads it back). `save("assets/<name>.glb", find("<name>"))` puts it in the project and replies with the line that loads it in the game; `load("assets/x.glb")` brings a `.glb` (an `asset_search` pick, a model saved before) into the scene to cut, combine or measure.
- **The game's page**, for geometry the game makes while it runs: the `open` tool puts `geo.js` in the project root. Never read or edit it.

```js
import * as THREE from "three";
import { geo, scatter } from "./geo.js";        // "../geo.js" from src/ in a vite project
const { Manifold, CrossSection, toManifold, toGeometry, boolean } = await geo();   // once, before building
```

- `boolean(op, a, ...b)`: `"union"`, `"difference"` (a minus the rest) or `"intersection"` of closed three.js geometries; returns a new geometry.
- `toManifold(geometry)` and `toGeometry(manifold, { sharpAngle })` convert between the two; work in Manifold when a shape needs several steps.
- `scatter(target, geometry, material, count, { seed, scale: [min, max], align })` returns an InstancedMesh in `target`'s local space, so add it to `target`.
- Manifold is Z-up and its angles are degrees: `.rotate([-90, 0, 0])` turns its Z into three's Y.

After each step, name the mesh and check it: `return stats("wall")` (in `model_run`, or `eval` on the page) gives triangles, `closed`, volume and genus (a hole through the part adds 1). `model_look` with `object: "wall"`, or `look` with `target: "wall"` on the page, shows it alone from four sides in one picture, which catches a shape that only looks right from the game's camera.

## Scatter on a surface

```js
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), groundMat);
const cone = new THREE.ConeGeometry(0.4, 1.5).translate(0, 0.75, 0);   // base at the origin, so it stands on the surface
const trees = scatter(ground, cone, treeMat, 80, { seed: 1, scale: [0.7, 1.3], align: false });   // align: false keeps trees upright
trees.name = "trees"; ground.add(trees);
```

## Parametric array

One InstancedMesh draws every copy in one call; a loop of `Mesh`es sharing one geometry and material is fine for a few.

```js
const N = 12, posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 1, 0.2), postMat, N), m = new THREE.Matrix4();
for (let i = 0; i < N; i++) {
  const a = (i / N) * Math.PI * 2;
  posts.setMatrixAt(i, m.makeRotationY(-a).setPosition(Math.cos(a) * 5, 0.5, Math.sin(a) * 5));
}
posts.instanceMatrix.needsUpdate = true;
```

## Curve to mesh

```js
const path = new THREE.CatmullRomCurve3([new THREE.Vector3(-4, 0, 0), new THREE.Vector3(0, 2, 2), new THREE.Vector3(4, 0, 0)]);
const pipe = new THREE.TubeGeometry(path, 64, 0.2, 12, false);           // round section; its ends are open
const profile = new THREE.Shape().moveTo(-0.3, -0.1).lineTo(0.3, -0.1).lineTo(0.3, 0.1).lineTo(-0.3, 0.1);
const rail = new THREE.ExtrudeGeometry(profile, { steps: 64, extrudePath: path, bevelEnabled: false });   // any section, capped
```

## Boolean carve

Make cutters overshoot the faces they cut through; a cut flush with a face leaves a sliver.

```js
const wallGeo = boolean("difference",
  new THREE.BoxGeometry(4, 3, 0.4),
  new THREE.BoxGeometry(1, 2.1, 1).translate(-1, -0.55, 0),                    // door, open at the bottom
  new THREE.CylinderGeometry(0.4, 0.4, 1, 24).rotateX(Math.PI / 2).translate(1, 0.5, 0));   // round window: genus 1
const wall = new THREE.Mesh(wallGeo, wallMat); wall.name = "wall";
```

## Lathe or revolve

Start and end the profile on the axis (x = 0), or the shape is open at the poles.

```js
const pts = [[0, 0], [0.5, 0], [0.6, 0.2], [0.3, 0.9], [0.35, 1.2], [0, 1.2]];
const vase = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 32);   // three.js

const section = CrossSection.ofPolygons([pts]), spun = section.revolve(32), upright = spun.rotate([-90, 0, 0]);   // Manifold, for booleans next
const vase2 = toGeometry(upright);
section.delete(); spun.delete(); upright.delete();
```

## Three-lane pebble scatter

Three lanes over one surface, each with its own seed and scale range, so large, medium and small stones mix without one repeating pattern.

```js
const pebble = new THREE.IcosahedronGeometry(1, 1).scale(1, 0.55, 1);
for (const [lane, count, scale, seed] of [["large", 12, [0.25, 0.60], 11], ["medium", 40, [0.25, 0.45], 12], ["small", 120, [0.10, 0.35], 13]]) {
  const stones = scatter(ground, pebble, stoneMat, count, { seed, scale, align: true });
  stones.name = `pebbles-${lane}`; ground.add(stones);
}
```

## Hull and level sets

```js
const hull = Manifold.hull([[0, 0, 0], [1.2, 0.1, 0.2], [0.2, 1, 0.3], [0.5, 0.3, 1], [0.9, 0.8, 0.7], [-0.2, 0.4, 0.6]]);
const rock = toGeometry(hull, { sharpAngle: 0 }); hull.delete();          // faceted rock

// A signed-distance function, positive inside: two spheres blended (smooth min), inside the bounds' box.
const k = 0.4, d = (p, c, r) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
const sdf = p => { const a = d(p, [-0.6, 0, 0], 0.7), b = d(p, [0.6, 0, 0], 0.5), h = Math.max(k - Math.abs(a - b), 0) / k;
  return -(Math.min(a, b) - h * h * k / 4); };
const blob = Manifold.levelSet(sdf, { min: [-1.5, -1, -1], max: [1.5, 1, 1] }, 0.08);
const blobGeo = toGeometry(blob); blob.delete();
```

## Rounding a shape

`smoothOut(180)` curves every edge and `refine(n)` splits each edge into n, moving the new vertices onto that curve. The surface passes through the old vertices and bulges out between them, so it suits a low-poly shape turning into a pebble or blob; check its size with `stats`. Flat faces of three or more triangles stay flat, so it will not round a box's edges: hull spheres at the corners instead.

```js
const facets = Manifold.hull([[0, 0, 0], [1, 0.1, 0.2], [0.2, 0.6, 0.3], [0.5, 0.2, 0.9], [0.8, 0.5, 0.6]]);
const smooth = facets.smoothOut(180), fine = smooth.refine(6);
const pebbleGeo = toGeometry(fine);
facets.delete(); smooth.delete(); fine.delete();

const r = 0.15, ball = Manifold.sphere(r, 16), corners = [];   // a 2 x 1 x 1 box with edges rounded to r
for (const x of [-1, 1]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) corners.push(ball.translate([x - Math.sign(x) * r, y - Math.sign(y) * r, z - Math.sign(z) * r]));
const rounded = Manifold.hull(corners), boxGeo = toGeometry(rounded);
for (const c of [ball, rounded, ...corners]) c.delete();
```

## Pitfalls

- three's primitives split vertices at every face edge and UV seam; `toManifold` and `boolean` weld them, so a `BoxGeometry` counts as closed. An open shape (`PlaneGeometry`, a `TubeGeometry` with open ends) throws "the mesh is not closed".
- Every Manifold and CrossSection lives in wasm memory: call `.delete()` on each one you make, including every step of a chain (`a.smoothOut(180).refine(6)` leaks the middle one). `boolean` and `toGeometry` free what they make; a Manifold that `toManifold` returns is yours to delete.
- `boolean("difference", ...)` throws "difference removed nothing; does the cutter overlap?" when the cutter misses: move the cutter, do not catch it.
- `toGeometry` makes smooth normals but keeps edges sharper than 30 degrees hard; pass `{ sharpAngle: 0 }` for facets or `180` to smooth everything.
- Trust `volume` and `genus` only when `stats` says `closed`; an open mesh's volume means nothing.
- Pass `scatter` a `seed` (and keep other build randomness seeded) so the layout is the same on every load.
- Changes made in `eval` vanish on reload: write what works into the source.
