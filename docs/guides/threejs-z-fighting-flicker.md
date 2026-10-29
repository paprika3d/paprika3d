---
title: three.js z-fighting flicker? Find the faces that share a plane, and check the fix from every side
phrase: three.js z-fighting flicker
description: Why a rug on a floor or a decal on a wall flickers in three.js, and how a coding agent gets the coplanar pairs named by the paprika3d plugin's look, sees the stripes from four cameras and a zoom, tries polygon offset, a lift, a camera near plane and transparency with depthWrite off in eval, and sees the line close after the edit.
meta: three.js z-fighting flicker? Find the faces that share a plane, fix them with an offset or polygonOffset, and check from every side.
intent: threejs-z-fighting-flicker
queries:
  - "How can I solve z-fighting using Three.js"
  - "three.js - Overlapping layers flickering"
  - "three.js: What is more efficient to layer and resolve z-fighting: using polygonOffsetFactor or transparency with depthWrite disabled?"
  - "Z-fighting flickering issue"
  - "Jagged and flickering intersection"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js z-fighting flicker? Find the faces that share a plane, and check the fix from every side

## Why two faces on one plane flicker

three.js draws with a depth buffer: each pixel keeps the depth of the nearest surface drawn so far, and a later surface replaces it when it is nearer. Two faces in the same plane, a rug laid on a floor or a poster flat on a wall, have the same depth up to rounding, so which one wins is decided pixel by pixel by how each face's depth rounds. The rounding changes as the camera moves, and the two faces trade places in stripes and patches: z-fighting.

A perspective depth buffer has less precision the farther a surface is from the camera, and much less when the camera's `near` is small, so a gap that is enough at one distance or near plane is not enough at another. The usual fixes, in the order they are usually tried:

- **Polygon offset on the top layer.** `material.polygonOffset = true` with a negative `polygonOffsetFactor` pulls that material's depth toward the camera when it is drawn, without moving its geometry. On the rug, two properties on its material.
- **Move one face off the plane** by more than the depth buffer can tell apart at that distance.
- **A larger `near`** on the camera, as large as the scene allows; or `logarithmicDepthBuffer` on the renderer, for scenes that span a huge depth range.
- **Remove the face that is hidden** when the top layer covers it completely.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. Every `look` reply ends with the setup faults it finds in the live scene, and one of them is a `Surfaces` line: two meshes with faces in one plane, facing the same way and overlapping, found from the geometry rather than the picture, with the gap the depth buffer can tell apart at their distance from the camera. That matters because a single screenshot of a z-fight often looks clean: one face wins everywhere at that one camera. `look` with `cameras` pictures the scene from up to nine places at once, `look` with `zoom` and `camera` enlarges the seam from one of them, and `eval` tries a fix on the open page before it goes into the source.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A rug on a floor, a poster on a wall

A room with the two cases the threads ask about: a rug laid at the floor's height, and a poster placed exactly on the wall's front face.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Room</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242a);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 6);
camera.lookAt(0, 0.6, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 6, 4);
scene.add(sun);

// A floor, and a rug laid on it at the same height: both faces are in the plane y = 0.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0xa08060 }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), new THREE.MeshStandardMaterial({ color: 0x9a2a30 }));
rug.name = 'rug';
rug.rotation.x = -Math.PI / 2;

// A wall, and a poster on its face: both in the plane z = -3.
const wall = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.2), new THREE.MeshStandardMaterial({ color: 0xd8d4cc }));
wall.name = 'wall';
wall.position.set(0, 2, -3.1);
const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x2a5a9a }));
poster.name = 'poster';
poster.position.set(-1.5, 2, -3);

scene.add(floor, rug, wall, poster);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). Which face wins a tie can differ between GPUs, so the stripes on another machine fall elsewhere; the coplanar pairs and the gaps in the `Surfaces` lines come from the geometry and the camera and do not depend on it. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page and look.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:45481/index.html in 0.4 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["floor","rug","wall","poster"]}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-1.png
Surfaces: "floor" and "rug" share a face plane (y = 0.00) over 2.5 × 4 units: they flicker as the camera moves (z-fighting). Move one at least 0.000049 units off the plane (what the depth buffer can tell apart at 6.4 units from this camera), give the top one material.polygonOffset = true with polygonOffsetFactor -1, or remove the hidden face.
Surfaces: "wall" and "poster" share a face plane (z = -3.00) over 1.1 × 1.6 units: they flicker as the camera moves (z-fighting). Move one at least 0.000099 units off the plane (what the depth buffer can tell apart at 9.1 units from this camera), give the top one material.polygonOffset = true with polygonOffsetFactor -1, or remove the hidden face.
On screen (3):
floor 45% [0, 382, 1279, 799] 12 × 12 units
wall 44% [19, 0, 1260, 381] 12 × 4 units, across the view
rug 6.6% [308, 429, 971, 549] 4 × 2.5 units
Never visible: poster (1.6 units, in view, behind wall)
```

The picture shows a clean red rug and a bare wall. From this camera the rug wins every pixel of its tie and the poster loses every pixel of its own, so the picture alone reads as "the poster is missing", which is a different bug report from "it flickers". The two `Surfaces` lines name both pairs anyway, with the plane, the size of the overlap, and how far apart the faces would have to be at this distance.

**2. The same moment from four cameras.** Labelled cameras are kept, so later calls can name them.

```text
look {"cameras": [{"position": [0, 2.2, 6], "lookAt": [0, 0.6, 0], "label": "page"}, {"position": [5, 0.5, 4], "lookAt": [0, 0, 0], "label": "low"}, {"position": [0, 9, 0.5], "lookAt": [0, 0, 0], "label": "above"}, {"position": [-1.5, 2, 2], "lookAt": [-1.5, 2, -3], "label": "poster"}]}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-5-cameras.png (4 cameras, left to right, top to bottom, at frame 1, no reload; the game's own camera is not moved)
Kept as `camera` names for look, zoom and reference compare: "page", "low", "above", "poster" (paprika3d/cameras.json).
```

Here the flicker shows. From `low` the rug is a thin red sliver with most of it eaten by the floor, and the poster is a ragged blue patch. From `above` the rug is cut by a diagonal into a solid red half and a half of red and floor-coloured stripes. From `poster`, face on, the poster draws whole. Same scene, same frame: which face wins depends on where the camera stands.

**3. The seam, enlarged.** `zoom` takes a box in the page's pixels; with `camera` it is read from that kept view.

```text
look {"camera": "above", "zoom": [420, 260, 860, 540]}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-6-zoom.png ([420, 260, 860, 540] at 2.86×, from camera) of the live page at frame 1, not a saved picture or sheet
```

The enlarged rug: horizontal bands of floor through its left half, thin floor-coloured lines through its right half. This zoom is the picture each fix below is judged by.

**4. Lift the rug and the poster by a millimetre.** The lines asked for 0.000049 and 0.000099 units; a millimetre is far more than either at this near plane.

```text
eval {"code": "find('rug').position.y = 0.001;\nfind('poster').position.z = -2.999;\nreturn 'lifted 1 mm'"}

lifted 1 mm

look {}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-7.png
On screen (4):
floor 45% [0, 382, 1279, 799] 12 × 12 units
wall 42% [19, 0, 1260, 381] 12 × 4 units, across the view
rug 6.6% [308, 429, 971, 549] 4 × 2.5 units
poster 1.7% [411, 135, 571, 245] 1.6 × 1.1 units
```

Both `Surfaces` lines are gone and the poster is on screen.

**5. A smaller near plane undoes the lift.** Cameras are often given a tiny `near` so that nothing clips when the camera gets close:

```text
eval {"code": "camera.near = 0.0001;\ncamera.updateProjectionMatrix();\nreturn `near ${camera.near}`"}

near 0.0001

look {}

Surfaces: "floor" and "rug" share a face plane (y = 0.00) over 2.5 × 4 units: they flicker as the camera moves (z-fighting). Move one at least 0.049 units off the plane (what the depth buffer can tell apart at 6.4 units from this camera), give the top one material.polygonOffset = true with polygonOffsetFactor -1, or remove the hidden face.
Surfaces: "wall" and "poster" share a face plane (z = -3.00) over 1.1 × 1.6 units: they flicker as the camera moves (z-fighting). Move one at least 0.099 units off the plane (what the depth buffer can tell apart at 9.1 units from this camera), give the top one material.polygonOffset = true with polygonOffsetFactor -1, or remove the hidden face.

look {"camera": "above", "zoom": [420, 260, 860, 540]}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-9-zoom.png ([420, 260, 860, 540] at 2.86×, from camera) of the live page at frame 1, not a saved picture or sheet
```

The same faces at the same distances now need 0.049 units, nearly five centimetres in a scene in metres, instead of a few hundredths of a millimetre, and the zoom shows three wide bands of floor cutting across the rug. A lift that is enough is enough for one near plane: when the flicker comes back after a camera change, compare the camera's `near` before anything else.

**6. Transparency with depthWrite off, on the top layer.** This is the alternative one of the threads weighs against polygon offset. The near plane and the positions go back first:

```text
eval {"code": "camera.near = 0.1;\ncamera.updateProjectionMatrix();\nfind('rug').position.y = 0;\nfind('poster').position.z = -3;\nconst m = find('rug').material;\nm.transparent = true;\nm.depthWrite = false;\nreturn 'rug transparent, depthWrite off'"}

rug transparent, depthWrite off

look {}

Surfaces, Surface: the same 3 lines as the last look, still open.

look {"camera": "above", "zoom": [420, 260, 860, 540]}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-11-zoom.png ([420, 260, 860, 540] at 2.86×, from camera) of the live page at frame 1, not a saved picture or sheet
```

The zoom is the same striped rug as in step 3. `depthWrite` decides whether the rug writes its own depth; it does not stop the rug from being tested against the depth the floor wrote first, so wherever the rug's depth rounds behind the floor's, the rug still loses. `transparent` moves the rug to the pass three.js draws after the opaque meshes, which changes nothing here because the opaque floor was drawn first already.

**7. depthWrite off on the bottom layer, drawn first.** The version of that idea that does work turns it around:

```text
eval {"code": "const m = find('rug').material;\nm.transparent = false;\nm.depthWrite = true;\nconst floor = find('floor');\nfloor.material.depthWrite = false;\nfloor.renderOrder = -1;\nreturn 'floor depthWrite off, drawn first'"}

floor depthWrite off, drawn first

look {"camera": "above", "zoom": [420, 260, 860, 540]}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-12-zoom.png ([420, 260, 860, 540] at 2.86×, from camera) of the live page at frame 1, not a saved picture or sheet

look {}

Surfaces, Surface: the same 3 lines as the last look, still open.
```

The zoom is a solid red rug: the floor draws first and leaves no depth behind, so the rug has nothing to fight. The `Surfaces` line stays open, because the check reads geometry and materials and counts polygon offset or a material with `depthTest` off as settled, not `depthWrite` and `renderOrder`; with this fix, the pictures are the evidence. The cost is that the floor now hides nothing drawn after it.

So, for the thread that asks which to use: on this page, transparency with `depthWrite` off on the top layer did not stop the flicker, `depthWrite` off on the bottom layer with a `renderOrder` that draws it first did, and polygon offset on the top layer, in step 8 below, did as well. This host has no GPU, so this guide does not time them.

**8. Polygon offset on the top layers.** The fix the line suggests:

```text
eval {"code": "const floor = find('floor');\nfloor.material.depthWrite = true;\nfloor.renderOrder = 0;\nfor (const name of ['rug', 'poster']) {\n  const m = find(name).material;\n  m.polygonOffset = true;\n  m.polygonOffsetFactor = -1;\n}\nreturn 'polygon offset on rug and poster'"}

polygon offset on rug and poster

look {"camera": "above", "zoom": [420, 260, 860, 540]}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-14-zoom.png ([420, 260, 860, 540] at 2.86×, from camera) of the live page at frame 1, not a saved picture or sheet
```

Solid red again, with the floor writing depth as before. No geometry moved, so nothing changes where the rug sits for raycasts or physics.

**9. Write it into the source and look again.** The two materials in the page become:

```js
const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), new THREE.MeshStandardMaterial({ color: 0x9a2a30, polygonOffset: true, polygonOffsetFactor: -1 }));
const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x2a5a9a, polygonOffset: true, polygonOffsetFactor: -1 }));
```

The next `look` reloads the page by itself and names what the edit closed:

```text
look {}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.2 s).
Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-15.png
Closed since the last look: Surfaces: "floor" and "rug" share a face plane (y = 0.00) over 2.5 × 4 units: they flicker as the camera moves (z-fighting). Move one at least 0.000049 units off the plane (what the depth buffer can tell apart at 6.4 units from this camera), give the top one material.polygonOffset = true with polygonOffsetFactor -1, or remove the hidden face.
Closed since the last look: Surfaces: "wall" and "poster" share a face plane (z = -3.00) over 1.1 × 1.6 units: they flicker as the camera moves (z-fighting). Move one at least 0.000099 units off the plane (what the depth buffer can tell apart at 9.1 units from this camera), give the top one material.polygonOffset = true with polygonOffsetFactor -1, or remove the hidden face.

look {"cameras": ["page", "low", "above", "poster"]}

Picture: <project>/paprika3d/runs/2026-10-28T06-47-22-135Z/look-19-cameras.png (4 cameras, left to right, top to bottom, at frame 1, no reload; the game's own camera is not moved)
page: on screen: floor, wall, rug; world's edge 3% of the picture; pixels: brightness 54%, colour saturation 29%, 0% near black, 0% blown out
low: on screen: floor, wall, poster, rug; world's edge 2% of the picture; pixels: brightness 47%, colour saturation 30%, 0% near black, 0% blown out
```

All four views draw a whole rug and a whole poster, including the page's own camera, where the poster was missing in step 1. A `Closed since the last look` line is printed after an edit to the source, seen from the page's own camera at the same frame; changes made with `eval` show as lines that are simply gone.

## What paprika3d does not do

- **It does not change the page.** It names the pairs and pictures them; the agent edits the source and looks again.
- **The gap in the line assumes a standard depth buffer.** With `logarithmicDepthBuffer` set on the renderer, the near plane at 0.0001 and the millimetre lift, the four views on this page drew clean in a separate run while the `Surfaces` lines still asked for 0.049 and 0.099 units.
- **It counts polygon offset as the fix without checking its sign.** A positive `polygonOffsetFactor` on the rug pushes it behind the floor, and the line closes all the same; the cameras grid shows which face wins.
- **It does not judge `depthWrite` and `renderOrder` fixes**, as step 7 shows: the line stays open after one that works.
- **It skips some meshes:** skinned and morphing meshes, `ShaderMaterial` and materials with an `onBeforeCompile`, since those place their vertices in the shader. It checks up to a fixed amount of work (about 300 ms on a laptop, the same on a busy machine) and says `Surfaces: not checked for N of M meshes` when it stopped early.
- **The object lists can miss a polygon-offset face.** In step 9, the `page` cell's on-screen list leaves out the poster that its picture shows: the pass that tells objects apart draws without the materials' polygon offset. Trust the picture there.

## Pitfalls

- **Offset the top layer toward the camera.** A negative `polygonOffsetFactor` brings a face forward; a positive one sends it back. `polygonOffsetUnits` adds a constant amount on top of the factor, which scales with how steeply the face is seen.
- **renderOrder alone does not settle a tie.** In a separate run on this page, `renderOrder` 1 on the rug and the poster left all four views exactly as striped as before: drawing last wins a pixel just where the depths come out exactly equal.
- **Size a lift for the whole camera range.** The gap in the line is for this camera's distance; a camera that pulls back or a smaller `near` needs more, as step 5 shows. Raising `near` helps more than lowering `far`.
- **Decals merged into one mesh fight too.** Two faces of the same mesh in one plane, a road marking merged into the road, are named as one mesh with two faces in one plane.
- **Faces turned away from the camera are named separately**, in a `Surfaces out of view:` line that says where they would be seen from.

## Without paprika3d

Orbit the camera in a browser and watch the seam at grazing angles and from far away, where z-fighting shows most. three.js ships an example of `logarithmicDepthBuffer` beside a standard buffer (`webgl_camera_logarithmicdepthbuffer`), which shows how precision falls with distance. To find coplanar pairs without the tool, compare each mesh's world-space face planes: for planes from `PlaneGeometry` the mesh's world normal and position give the plane, and two meshes whose planes match within the depth step and whose boxes overlap are a pair.
