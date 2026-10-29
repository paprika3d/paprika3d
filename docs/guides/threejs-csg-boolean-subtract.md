---
title: three.js CSG boolean subtract: cut a window or hole through a mesh, and check that it goes through
phrase: three.js csg boolean subtract
description: How to cut a window, a door or a hole out of a three.js mesh with a boolean subtract, union or intersection, and how a coding agent builds the cut with Manifold in the paprika3d plugin's model_run, reads from stats whether the hole goes through (genus 1) or left a sealed pocket (genus 0, 2 parts), checks the four views in model_look, and saves a GLB the page loads.
meta: three.js CSG boolean subtract: cut a window or hole through a mesh, and check the cut goes all the way through instead of sealing a cavity.
intent: threejs-csg-boolean-hole
queries:
  - "Geometry - subtract, union, intersection?"
  - "Looking for Updated plug-in for CSG"
  - "How create window, holes or subtract geometry in three.js"
  - "3D Boolean operations with Three CSG"
  - "Constructive Solid Geometry (CSG) Support"
  - "CSG subtraction fills inner mesh instead of creating through-hole"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js CSG boolean subtract: cut a window or hole through a mesh, and check that it goes through

## What three.js has, and what a cut needs

three.js itself has no boolean operations: no subtract, union or intersection on a `BufferGeometry`. The original ThreeCSG plug-in and its ports stopped following three.js releases, which is what the long "updated plug-in" threads are about. Two that are maintained today: `three-bvh-csg`, which works on three.js geometries directly (a `Brush` per mesh and an `Evaluator` with `SUBTRACTION`, `ADDITION` and `INTERSECTION`), and Manifold (`manifold-3d` on npm), a WebAssembly library whose results are always closed solids. Both want closed meshes as input.

The rule that decides whether a subtract makes a hole is the same in every library: **the cutter has to come out of both faces.** A box cutter thinner than the wall, or one placed off centre so that it stops inside, still removes volume, but it leaves a pocket or a sealed cavity, and from outside the wall looks uncut. That is the "fills inner mesh instead of creating through-hole" thread. A count tells the two apart without a picture: a hole that goes through gives the solid a genus of 1, and a pocket or cavity leaves it at 0.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `model_run` keeps a modelling scene in that Chrome between calls, as Blender keeps its scene, with Manifold already started as `geo` and `stats` in scope; `stats` reports each mesh's triangles, whether it is closed, its volume, its genus and how many separate parts it has. `model_look` pictures the scene from the front, right and top on a ground grid, true to size, and `save` in `model_run` writes a GLB into the project with the line that loads it. [The bounding box guide](/guides/threejs-bounding-box-triangle-count) explains the closed, volume and genus columns; this guide is about the cut.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); the geometry and its numbers do not depend on the renderer. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. A wall with a window, and two mistakes.** Manifold's `cube` takes a size and whether to centre it, `translate` moves it, and `subtract` is the boolean. The wall is 4 wide, 0.2 thick and 2.5 tall, written the way Manifold's own examples are, with z as height. The window cutter is 0.1 thick.

```text
model_run {"cwd": "<project>", "code": "clear();\nconst { Manifold, toGeometry } = geo;\nconst wall = Manifold.cube([4, 0.2, 2.5], true);\nconst cutter = Manifold.cube([1, 0.1, 1.2], true).translate([0, 0, 0.2]);\nconst cut = wall.subtract(cutter);\nconst mesh = new THREE.Mesh(toGeometry(cut), new THREE.MeshStandardMaterial({ color: 0xd8d4cc }));\nmesh.name = 'wall';\nscene.add(mesh);\nfor (const m of [wall, cutter, cut]) m.delete();\nreturn stats(mesh)"}

total  1 meshes  48 v  24 tri
wall  48 v  24 tri  closed  vol 1.88  genus 0  2 parts  size 4×0.2×2.5  [position, normal]
```

The volume went down from 2 to 1.88, so the subtract removed something, but the genus is 0: there is no hole through the wall. `2 parts` says what happened instead. The cutter sat inside the wall's thickness, so the result is the wall's outer surface plus a second, closed surface around an empty box inside it. Nothing shows from outside.

**2. The four views.**

```text
model_look {"cwd": "<project>"}

wall Mesh, at [0, 0, 0], MeshStandardMaterial #d8d4cc roughness 1 metalness 0, 24 tri, size 4 × 0.2 × 2.5, closed, volume 1.88, genus 0, 2 parts
Picture: front, right and top (orthographic, true to size) and three-quarter (perspective), framed to the whole scene, under a neutral studio light with a grid on the ground.
```

The picture shows the second mistake: the wall is lying on the grid. Seen from the front it is a thin strip, and seen from the top it is a solid slab, with no window in any view. The size reads 4 × 0.2 × 2.5 in three.js's x, y and z, so the wall is 0.2 tall. Manifold works with z up and three.js with y up; geometry made in Manifold's frame needs turning before three.js shows it.

**3. The fix: a cutter that comes out of both faces, and the turn.** The cutter is now 0.4 thick, twice the wall, the wall stands on the ground, and `rotate` (in degrees, about x) turns Manifold's z into three.js's y:

```text
model_run {"cwd": "<project>", "code": "clear();\nconst { Manifold, toGeometry } = geo;\nconst wall = Manifold.cube([4, 0.2, 2.5], true).translate([0, 0, 1.25]);\nconst cutter = Manifold.cube([1, 0.4, 1.2], true).translate([0, 0, 1.4]);\nconst cut = wall.subtract(cutter).rotate([-90, 0, 0]);\nconst mesh = new THREE.Mesh(toGeometry(cut), new THREE.MeshStandardMaterial({ color: 0xd8d4cc }));\nmesh.name = 'wall';\nscene.add(mesh);\nfor (const m of [wall, cutter, cut]) m.delete();\nreturn stats(mesh)"}

total  1 meshes  48 v  32 tri
wall  48 v  32 tri  closed  vol 1.76  genus 1  size 4×2.5×0.2  [position, normal]

model_look {"cwd": "<project>"}

wall Mesh, at [0, 0, 0], MeshStandardMaterial #d8d4cc roughness 1 metalness 0, 32 tri, size 4 × 2.5 × 0.2, closed, volume 1.76, genus 1
```

Genus 1, one part, and the volume is the wall less the full window (1 × 1.2 × 0.2). The picture shows the wall standing, with the window through it in the front and three-quarter views, and the front view's grid of 1 m squares puts the window's sill and head where the code put them.

**4. Booleans on three.js geometries, and two errors.** `geo.boolean` takes three.js geometries, in three.js's own frame, so a `BoxGeometry` or `CylinderGeometry` can be cut without converting it by hand. Its operation names are `union`, `difference` and `intersection`; `subtract` is the name of Manifold's method, not of this one:

```text
model_run {"cwd": "<project>", "code": "const wall = find('wall');\nconst porthole = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 24).translate(-1.3, 1.4, 0);\nreturn geo.boolean('subtract', wall.geometry, porthole)"}

model_run threw: boolean: op must be union, difference or intersection, got subtract
at line 3:12 of the code
```

A cutter that misses the wall altogether, here 2 units in front of it, throws rather than return the wall unchanged:

```text
model_run {"cwd": "<project>", "code": "const wall = find('wall');\nconst porthole = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 24).translate(-1.3, 1.4, 2);\nreturn geo.boolean('difference', wall.geometry, porthole)"}

model_run threw: boolean: difference removed nothing; does the cutter overlap?
at line 3:12 of the code
```

An open geometry is refused too. A `PlaneGeometry` sign, which has no inside, cannot take part in a union:

```text
model_run {"cwd": "<project>", "code": "const wall = find('wall');\nconst sign = new THREE.PlaneGeometry(0.6, 0.4).translate(-1.3, 2, 0.2);\nreturn geo.boolean('union', wall.geometry, sign)"}

model_run threw: toManifold: the mesh is not closed (NotManifold); every edge must join exactly two triangles, so build it with Manifold or close its holes
at line 3:12 of the code
```

**5. A porthole, a doorway and a sill.** A `CylinderGeometry` stands along y, so it is turned to run through the wall along z. The doorway is cut from the bottom edge, and the sill is added with `union`:

```text
model_run {"cwd": "<project>", "code": "const wall = find('wall');\n// three's CylinderGeometry stands along y: turn it to run through the wall along z\nconst porthole = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 24).rotateX(Math.PI / 2).translate(-1.3, 1.4, 0);\nconst door = new THREE.BoxGeometry(0.9, 2.1, 0.5).translate(1.3, 1.0, 0);\nconst sill = new THREE.BoxGeometry(1.2, 0.06, 0.3).translate(0, 0.8, 0.05);\nwall.geometry = geo.boolean('union', geo.boolean('difference', wall.geometry, porthole, door), sill);\nreturn stats(wall)"}

total  1 meshes  196 v  172 tri
wall  196 v  172 tri  closed  vol 1.348  genus 2  size 4×2.5×0.3  [position, normal]

model_look {"cwd": "<project>"}

wall Mesh, at [0, 0, 0], MeshStandardMaterial #d8d4cc roughness 1 metalness 0, 172 tri, size 4 × 2.5 × 0.3, closed, volume 1.348, genus 2
```

Genus 2: the window and the porthole. The doorway goes through the wall too, but it is open at the bottom, so it is a notch in the outline rather than a hole with wall all the way round it, and it adds nothing to the genus. When a count is the check, expect one per opening that is closed all round. The size's depth of 0.3 is the sill standing out in front.

**6. Save it as a GLB.**

```text
model_run {"cwd": "<project>", "code": "return save('models/wall.glb', find('wall'))"}

{"saved":"models/wall.glb","bytes":7812,"triangles":172}
Saved models/wall.glb (8 KB, 172 triangles). The game loads it with:
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const model = (await new GLTFLoader().loadAsync("models/wall.glb")).scene; // where it stood in the modelling scene
scene.add(model);
```

The modelling scene is also kept in the project's `paprika3d/model/scene.glb` after each run that changed it, so a later session finds the wall where it was.

## The page that loads it

The page loads the saved wall with `GLTFLoader`. The GLB is inlined as a data URL here so the block runs on its own; in a project it is the file `models/wall.glb`.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Wall</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// In a project this is the file model_run saved, 'models/wall.glb': a 4 × 2.5 m wall with a window,
// a porthole, a doorway and a sill, cut with Manifold. Inlined so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAACEHgAA+AMAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAiLCJnZW5lcmF0b3IiOiJUSFJFRS5HTFRGRXhwb3J0ZXIgcjE4NiJ9LCJzY2VuZXMiOlt7Im5hbWUiOiJBdXhTY2VuZSIsIm5vZGVzIjpbMF19XSwic2NlbmUiOjAsIm5vZGVzIjpbeyJuYW1lIjoid2FsbCIsIm1lc2giOjB9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6MjM1MiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6MTJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoyMzUyLCJieXRlTGVuZ3RoIjoyMzUyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjoxMn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjQ3MDQsImJ5dGVMZW5ndGgiOjIwNjQsInRhcmdldCI6MzQ5NjN9XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6Njc2OH1dLCJhY2Nlc3NvcnMiOlt7ImJ1ZmZlclZpZXciOjAsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoxOTYsIm1heCI6WzIsMi41LDAuMjAwMDAwMDAyOTgwMjMyMjRdLCJtaW4iOlstMiwwLC0wLjEwMDAwMDAwODk0MDY5NjcyXSwidHlwZSI6IlZFQzMifSx7ImJ1ZmZlclZpZXciOjEsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoxOTYsIm1heCI6WzEsMSwxXSwibWluIjpbLTEsLTEsLTFdLCJ0eXBlIjoiVkVDMyJ9LHsiYnVmZmVyVmlldyI6MiwiY29tcG9uZW50VHlwZSI6NTEyNSwiY291bnQiOjUxNiwibWF4IjpbMTk1XSwibWluIjpbMF0sInR5cGUiOiJTQ0FMQVIifV0sIm1hdGVyaWFscyI6W3sicGJyTWV0YWxsaWNSb3VnaG5lc3MiOnsiYmFzZUNvbG9yRmFjdG9yIjpbMC42ODY2ODUzMTI0Mjg4ODY0LDAuNjU4Mzc0ODE3MjcyNTM0NiwwLjYwMzgyNzMzODg0NzU0MDgsMV0sIm1ldGFsbGljRmFj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mplZPwAAAADNzMw9AADgPwAAAADNzMy9AAAAQAAAAADNzMy9AAAAQAAAAADNzMw9AADgPwAAAADNzMw9AADgPwAAAADNzMy9AADgPzMzA0DNzMy9AAAAQAAAAADNzMy9AADgPwAAAADNzMy9AADgPwAAAADNzMw9AADgPzMzA0DNzMy9AAAAQAAAAADNzMy9AAAAQAAAIEDNzMw9AAAAQAAAAADNzMw9mpkZP7geRT/NzMw9AAAAPwAAAEDNzMw9AAAAP+F6VD/NzMw9mpkZP+F6VD/NzMw9mplZPzMzA0DNzMw9AADgPwAAAADNzMw9AAAAQAAAAADNzMw9mplZPzMzA0DNzMy9mplZPzMzA0DNzMy9AAAAPwAAAEDNzMw9AAAAPwAAAEDNzMy9AAAAQAAAIEDNzMy9AAAAQAAAIEDNzMy9AAAAQAAAIEDNzMy9AADgPzMzA0DNzMw9mplZPzMzA0DNzMy9AADgPzMzA0DNzMy9AADgPzMzA0DNzMw9mplZPzMzA0DNzMw9AADgPzMzA0DNzMw9AAAAv+F6VD/NzMy9AAAAv+F6VD/NzMw9AAAAP+F6VD/NzMy9mpkZv+F6VD/NzEw+mpkZv7geRT/NzEw+mpkZv+F6VD/NzMw9mpkZv7geRT/NzMw9mpkZv+F6VD/NzMw9mpkZv+F6VD/NzEw+mpkZv7geRT/NzEw+mpkZv7geRT/NzMw9mpkZP7geRT/NzEw+mpkZv7geRT/NzEw+mpkZP+F6VD/NzEw+mpkZv+F6VD/NzEw+AAAAP+F6VD/NzMw9mpkZP7geRT/NzMw9mpkZP+F6VD/NzMw9mpkZP+F6VD/NzEw+mpkZP7geRT/NzEw+mpkZP+F6VD/NzEw+mpkZP7geRT/NzMw9mpkZP+F6VD/NzMw9mpkZP7geRT/NzEw+NUUqsRHHr7AAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAAAAAAAAAAAAAIC/8wQ1P/MENT8AAAAA2rNdP/j//z4AAAAA2rNdP/j//z4AAAAAAAAAAAAAAAAAAIC/dfUasuTk7TEAAIC/BgAAP9SzXT8AAAAABgAAP9SzXT8AAAAA54OEPutGdz8AAAAA8wQ1P/MENT8AAAAA54OEPutGdz+LaVMiClXVswAAgD+JaVMiClXVswAAgD+MaVMi6oOEvutGdz+OaVMi6oOEvutGdz8AAAAABgAAv9SzXT8AAAAABgAAv9SzXT8AAAAA8wQ1v/MENT8AAAAA8wQ1v/MENT8AAAAA1LNdvwYAAD8AAAAA1LNdvwYAAD8AAAAAAAAAAAAAAAAAAIC/kZLHMciI6bEAAIC/AAAAAAAAgL8AAAAAx/s+smUx0TEAAIC/H/N5smLiTjEAAIC/rwORsB62LTEAAIC/g7OFMwTMhDUAAIC/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/60Z3P+uDhD6LaVOi60Z3P+uDhD4AAAAAAACAP6hV1TOLaVOiAACAP6hV1TOPaVOi6kZ3P/KDhL4AAAAA6kZ3P/KDhL6JaVOi27NdP/P//74AAAAA27NdP/P//74AAAAAAAAAAAAAAAAAAIC/8gQ1P/UENb8AAAAA8gQ1P/UENb8AAAAA60Z3v+qDhD4AAAAA60Z3v+qDhD6OaVOiAACAvwpV1TOMaVOi6kZ3v/CDhL6MaVOiAACAvwpV1TOJaVOi6kZ3v/CDhL6PaVOj1bNdvwQAAL+MaVOj+///PtmzXb8AAAAA+///PtmzXb8AAAAA/4OEPuhGd7+KaVMi/4OEPuhGd78AAAAAqFXVswAAgL+PaVMiqFXVswAAgL+LaVMiAoSEvuhGd78AAAAAAoSEvuhGd7+NaVMi+///vtmzXb8AAAAA+///vtmzXb8AAAAA8gQ1v/UENb8AAAAA8gQ1v/UENb8AAAAA1bNdvwQAAL8AAAAAAACAvwAAAAAAAAAAAAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AACAPwAAAAAAAAAA9JWwrfuFfy8AAIC/AAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/Sl0Ps0AykzMAAIC/AACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AACAPwAAAAAAAAAAAACAvwAAAAAAAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIC/AAAAAAAAgD8AAAAAAACAPwAAAAAAAAAAAACAvwAAAAAAAAAA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';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242a);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.5, 2, 6);
camera.lookAt(0, 1.2, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 4);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x6a7060 }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

new GLTFLoader().load(MODEL, (gltf) => scene.add(gltf.scene), undefined, (err) => console.error('wall did not load:', err));

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:36959/index.html in 0.2 s, paused at frame 0.

look {}

On screen (2):
ground 36% [0, 438, 1279, 799] 10 × 10 units
wall 14% [382, 193, 957, 613] 4 × 2.5 units

eval {"code": "return stats('wall')"}

total  1 meshes  196 v  172 tri
wall  196 v  172 tri  closed  vol 1.348  genus 2  size 4×2.5×0.3  [position, normal]

look {"at": [[640, 330], [470, 365], [450, 480]]}

At (640, 330): background.
At (470, 365): background.
At (450, 480): wall 7.26 m at [-1.47, 0.55, 0.1]; behind it ground 9.98 m; background beyond.
```

The wall arrives in the page with the same triangles, volume and genus it had in the modelling scene. `look` with `at` lists what is drawn at a pixel: the middle of the window and the middle of the porthole show the background behind the wall, and a point beside them is the wall itself.

## Cutting in the page at run time

A hole the player makes, or a wall whose openings come from data, has to be cut while the page runs. `open` writes `geo.js` into the project, the same Manifold build `model_run` uses, and a page can import it with an import map for `three`:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Runtime cut</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { geo } from './geo.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242a);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 2, 6);
camera.lookAt(0, 1.2, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));

const { boolean } = await geo();
const wall = new THREE.BoxGeometry(4, 2.5, 0.2).translate(0, 1.25, 0);
const opening = new THREE.BoxGeometry(1, 1.2, 0.4).translate(0, 1.4, 0);
const mesh = new THREE.Mesh(boolean('difference', wall, opening), new THREE.MeshStandardMaterial({ color: 0xd8d4cc }));
mesh.name = 'wall';
scene.add(mesh);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

```text
open {"url": "index.html", "cwd": "<project>"}

{"three":"186","scenes":1,"entities":["wall"]}
Wrote geo.js and fx.js here, rewritten on each open (each starts with the plugin version that wrote it): they are the plugin's, part of the project like node_modules: leave them in place.

eval {"code": "return stats('wall')"}

total  1 meshes  48 v  32 tri
wall  48 v  32 tri  closed  vol 1.76  genus 1  size 4×2.5×0.2  [position, normal]
```

The page cut its own window at load, with genus 1. The cost is the file, which carries Manifold's WebAssembly inside it:

```text
$ ls -l geo.js
-rw-rw-rw- 1 jc jc 327405 Oct 28 07:46 geo.js
```

For a shape that does not change, the saved GLB is the lighter choice: the page then ships 172 triangles and no boolean code.

## What paprika3d does not do

- **It does not texture the result.** `toGeometry` returns positions and normals, as the `[position, normal]` in every `stats` line shows, with no texture coordinates; a textured wall needs them added after the cut.
- **It does not keep material groups.** A cut returns one geometry for one material. A wall with a different material inside the window's reveal needs the pieces split, or two meshes.
- **It does not repair open meshes.** Inputs to a boolean must be closed, as the plane in step 4 shows; a scanned or downloaded model with holes has to be closed first.
- **It does not change your page.** `model_run` builds in its own scene; the page changes when the agent writes the loading code into it.
- **The pictures are a studio view.** `model_look` lights the model with a neutral light of its own, not the page's lights; `look` on the page shows it as the page draws it.

## Pitfalls

- **Overshoot on both sides.** Make a cutter clearly longer than the wall is thick and centred on it, as in step 3, rather than exactly as thick as the wall: it then still cuts through after the wall's thickness changes.
- **Mind the axes.** Manifold's `cylinder` and `extrude` run along z, three.js's `CylinderGeometry` along y. Turn the cutter so its length runs through the wall.
- **Degrees and radians.** Manifold's `rotate` takes degrees; three.js's `rotateX` and `rotation` take radians.
- **Free what you make.** Every Manifold lives in WebAssembly memory until `.delete()` is called on it; `geo.boolean` frees the ones it makes, Manifold's own methods leave that to you.
- **Read the genus, not the picture.** A sealed cavity looks like an uncut wall from every side, as in step 2. The genus and the part count settle it.

## Without paprika3d

`three-bvh-csg` cuts three.js geometries in the page, and its examples include a live subtract; Manifold runs in a page or in Node from `manifold-3d`, and its `genus()` and `volume()` methods give the same check as `stats`. In Blender, the Boolean modifier with the Exact solver does the same cut, and the glTF exporter writes the result as a GLB. Without any library, the genus of a closed mesh follows from its counts: with V vertices (after welding by position), E edges, F faces and C separate shells, the genus is C minus (V − E + F) / 2.
