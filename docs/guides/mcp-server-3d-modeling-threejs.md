---
title: MCP server for 3D modeling with three.js: build a model in code, see it from four sides, save a GLB
phrase: mcp server for 3d modeling
description: What an MCP server for 3D modeling gives a coding agent, as the Blender MCP does for Blender, and how the paprika3d plugin's model_run and model_look do it for three.js: a modelling scene kept between calls and across restarts, four true-size views with each part's measurements, a table whose top floats above its legs until the picture shows it, and a GLB saved into the project that the page loads.
meta: An MCP server for 3D modeling in three.js: your agent builds a model in code, sees it from four sides at true size, and saves a GLB your page loads.
intent: mcp-server-for-3d-modelling
queries:
  - "Show HN: MCP server for Blender that builds 3D scenes via natural language"
  - "BlenderMCP: Blender Model Context Protocol Integration"
  - "Show HN: A 3D mesh playground for coding agents (three.js + manifold-3d)"
  - "Hello3DMCP - AI Driven 3D Interactive App"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# MCP server for 3D modeling with three.js: build a model in code, see it from four sides, save a GLB

## What a modelling MCP server gives an agent

The Blender MCP made the pattern familiar: an MCP server connects a coding agent to a running Blender, the agent sends Python, Blender runs it, and the agent asks for the scene's objects and a screenshot of the viewport. The model stays in Blender between requests, so the agent builds it a step at a time and looks after each step.

A three.js project needs the same loop, with one difference: the model ends up in a web page. paprika3d is a Claude Code plugin and MCP server that keeps a three.js modelling scene in its own headless Chrome between calls. `model_run` runs the agent's JavaScript against that scene, with `THREE`, Manifold (as `geo`), `find`, `stats`, `save`, `load` and `clear` in scope. `model_look` pictures it from the front, right and top at true size on a grid, and from three-quarter, with one line per object: its place, material, triangles, size, and whether it is closed. `save` writes a GLB into the project with the line that loads it, and the scene itself is kept in the project's `paprika3d/model/scene.glb`, so a restart finds it where it was.

No Blender install is involved, and the model is three.js geometry from the first call, so what the agent measures in the modelling scene is what the page draws. Cutting holes with booleans has [a guide of its own](/guides/threejs-csg-boolean-subtract); this one is about the loop, and about a common fault in a model built from code: parts that are the right size in the wrong place.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

Other MCP clients register the npm package as a stdio server (`npx -y paprika3d serve`); `model_run` and `model_look` need no page open.

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); the geometry and its numbers do not depend on the renderer. Run folder paths are shortened to `<project>`.

**1. A table, built the way it is described.** A top 1.2 by 0.8 m at a height of 0.75 m, and four legs 0.73 m long under its corners. The code returns where each part's geometry starts and ends in height:

```text
model_run {"cwd": "<project>", "code": "clear();\nconst wood = new THREE.MeshStandardMaterial({ color: 0x9a6b43, roughness: 0.7 });\nconst table = new THREE.Group();\ntable.name = 'table';\nconst top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.8), wood);\ntop.name = 'top';\ntop.position.y = 0.75;\ntable.add(top);\nfor (const [i, x, z] of [[1, -0.55, -0.35], [2, 0.55, -0.35], [3, -0.55, 0.35], [4, 0.55, 0.35]]) {\n  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.73, 0.05), wood);\n  leg.name = `leg-${i}`;\n  leg.position.set(x, 0, z);\n  table.add(leg);\n}\nscene.add(table);\nconst y = (name) => { const b = new THREE.Box3().setFromObject(find(name)); return [+b.min.y.toFixed(3), +b.max.y.toFixed(3)]; };\nreturn { top: y('top'), leg: y('leg-1') }"}

{"top":[0.73,0.77],"leg":[-0.365,0.365]}
```

A `BoxGeometry` is centred on its origin, so a leg placed at height 0 runs from -0.365 to 0.365, and the top's underside is at 0.73. The legs are the right length and in the wrong place.

**2. The four views.**

```text
model_look {"cwd": "<project>"}

table Group, at [0, 0, 0], 5 children
  top Mesh, at [0, 0.75, 0], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 1.2 × 0.04 × 0.8, closed, volume 0.038, genus 0
  leg-1 Mesh, at [-0.55, 0, -0.35], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 0.05 × 0.73 × 0.05, closed, volume 0.002, genus 0
  leg-2 Mesh, at [0.55, 0, -0.35], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 0.05 × 0.73 × 0.05, closed, volume 0.002, genus 0
  leg-3 Mesh, at [-0.55, 0, 0.35], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 0.05 × 0.73 × 0.05, closed, volume 0.002, genus 0
  leg-4 Mesh, at [0.55, 0, 0.35], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 0.05 × 0.73 × 0.05, closed, volume 0.002, genus 0
Picture: front, right and top (orthographic, true to size) and three-quarter (perspective), framed to the whole scene, under a neutral studio light with a grid on the ground.
```

In the front and right views the top hangs in the air, a gap of half the legs' length above them; in the three-quarter view it floats over four posts. The grid is drawn at height 0, or lower when part of the scene goes below 0, so here it sits at the legs' feet and the legs seem to stand on it. Every line in the list is correct, and none of them shows the fault: a line gives each part's origin and size, and the fault is where the geometry sits around its origin. The bounding box in step 1 and the picture are what show it.

**3. Move each leg's geometry up by half its length, and look at the table alone.** `object` frames the picture to one object and its parts:

```text
model_run {"cwd": "<project>", "code": "for (const leg of find('table').children.filter(o => o.name.startsWith('leg-'))) {\n  leg.geometry.translate(0, 0.73 / 2, 0); // BoxGeometry is centred on its origin: move its base to y = 0\n}\nconst y = (name) => { const b = new THREE.Box3().setFromObject(find(name)); return [+b.min.y.toFixed(3), +b.max.y.toFixed(3)]; };\nreturn { top: y('top'), leg: y('leg-1') }"}

{"top":[0.73,0.77],"leg":[0,0.73]}

model_look {"cwd": "<project>", "object": "table"}

table Group, at [0, 0, 0], 5 children
  top Mesh, at [0, 0.75, 0], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 1.2 × 0.04 × 0.8, closed, volume 0.038, genus 0
  leg-1 Mesh, at [-0.55, 0, -0.35], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 0.05 × 0.73 × 0.05, closed, volume 0.002, genus 0
  leg-2 Mesh, at [0.55, 0, -0.35], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 0.05 × 0.73 × 0.05, closed, volume 0.002, genus 0
  leg-3 Mesh, at [-0.55, 0, 0.35], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 0.05 × 0.73 × 0.05, closed, volume 0.002, genus 0
  leg-4 Mesh, at [0.55, 0, 0.35], MeshStandardMaterial #9a6b43 roughness 0.7 metalness 0, 12 tri, size 0.05 × 0.73 × 0.05, closed, volume 0.002, genus 0
Picture: front, right and top (orthographic, true to size) and three-quarter (perspective), framed to table, under a neutral studio light with a grid on the ground.
```

The legs now run from 0 to 0.73 and meet the top's underside, and the picture shows a table standing on the grid. The list is the same as before, line for line, which is the point of step 2: the list gives sizes, materials and closed shapes, and the picture gives arrangement.

**4. Save it into the project.**

```text
model_run {"cwd": "<project>", "code": "return save('assets/table.glb', find('table'))"}

{"saved":"assets/table.glb","bytes":9384,"triangles":60}
Saved assets/table.glb (10 KB, 60 triangles). The game loads it with:
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const model = (await new GLTFLoader().loadAsync("assets/table.glb")).scene; // where it stood in the modelling scene
scene.add(model);
```

**5. A new session finds the scene where it was.** After the server restarted, the first call reports that it loaded the scene back from the project:

```text
model_run {"cwd": "<project>", "code": "return scene.children.map(o => `${o.name}: ${o.children.length} parts`)"}

The modelling scene was loaded back from paprika3d/model/scene.glb (1 object at the top): the page holding it was new (the server restarted or Chrome closed), so variables from earlier runs are gone.
["table: 5 parts"]
```

Objects come back; JavaScript variables do not, so later calls reach parts by name with `find`, which is one reason to name every object made.

## The page that loads it

The page uses the line `save` replied with. The GLB is inlined as a data URL here so the block runs on its own; in a project it is the file `assets/table.glb`.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Table</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// In a project this is the file model_run saved, 'assets/table.glb'. Inlined so the page runs on its own.
const TABLE = 'data:model/gltf-binary;base64,Z2xURgIAAACoJAAAJBQAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAiLCJnZW5lcmF0b3IiOiJUSFJFRS5HTFRGRXhwb3J0ZXIgcjE4NiJ9LCJzY2VuZXMiOlt7Im5hbWUiOiJBdXhTY2VuZSIsIm5vZGVzIjpbMF19XSwic2NlbmUiOjAsIm5vZGVzIjpbeyJuYW1lIjoidGFibGUiLCJjaGlsZHJlbiI6WzEsMiwzLDQsNV19LHsibWF0cml4IjpbMSwwLDAsMCwwLDEsMCwwLDAsMCwxLDAsMCwwLjc1LDAsMV0sIm5hbWUiOiJ0b3AiLCJtZXNoIjowfSx7Im1hdHJpeCI6WzEsMCwwLDAsMCwxLDAsMCwwLDAsMSwwLC0wLjU1LDAsLTAuMzUsMV0sIm5hbWUiOiJsZWctMSIsIm1lc2giOjF9LHsibWF0cml4IjpbMSwwLDAsMCwwLDEsMCwwLDAsMCwxLDAsMC41NSwwLC0wLjM1LDFdLCJuYW1lIjoibGVnLTIiLCJtZXNoIjoyfSx7Im1hdHJpeCI6WzEsMCwwLDAsMCwxLDAsMCwwLDAsMSwwLC0wLjU1LDAsMC4zNSwxXSwibmFtZSI6ImxlZy0zIiwibWVzaCI6M30seyJtYXRyaXgiOlsxLDAsMCwwLDAsMSwwLDAsMCwwLDEsMCwwLjU1LDAsMC4zNSwxXSwibmFtZSI6ImxlZy00IiwibWVzaCI6NH1dLCJidWZmZXJWaWV3cyI6W3siYnVmZmVyIjowLCJieXRlT2Zmc2V0IjowLCJieXRlTGVuZ3RoIjoyODgsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjEyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6Mjg4LCJieXRlTGVuZ3RoIjoyODgsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjEyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6NTc2LCJieXRlTGVuZ3RoIjoxOTIsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjh9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo3NjgsImJ5dGVMZW5ndGgiOjcyLCJ0YXJnZXQiOjM0OTYzfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6ODQwLCJieXRlTGVuZ3RoIjoyODgsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjEyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTEyOCwiYnl0ZUxlbmd0aCI6Mjg4LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjoxMn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjE0MTYsImJ5dGVMZW5ndGgiOjE5MiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6OH0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjE2MDgsImJ5dGVMZW5ndGgiOjcyLCJ0YXJnZXQiOjM0OTYzfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTY4MCwiYnl0ZUxlbmd0aCI6Mjg4LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjoxMn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjE5NjgsImJ5dGVMZW5ndGgiOjI4OCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6MTJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoyMjU2LCJieXRlTGVuZ3RoIjoxOTIsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjh9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoyNDQ4LCJieXRlTGVuZ3RoIjo3MiwidGFyZ2V0IjozNDk2M30seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjI1MjAsImJ5dGVMZW5ndGgiOjI4OCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6MTJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoyODA4LCJieXRlTGVuZ3RoIjoyODgsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjEyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MzA5NiwiYnl0ZUxlbmd0aCI6MTkyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4fSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MzI4OCwiYnl0ZUxlbmd0aCI6NzIsInRhcmdldCI6MzQ5NjN9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjozMzYwLCJieXRlTGVuZ3RoIjoyODgsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjEyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MzY0OCwiYnl0ZUxlbmd0aCI6Mjg4LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjoxMn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjM5MzYsImJ5dGVMZW5ndGgiOjE5MiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6OH0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjQxMjgsImJ5dGVMZW5ndGgiOjcyLCJ0YXJnZXQiOjM0OTYzfV0sImJ1ZmZlcnMiOlt7ImJ5dGVMZW5ndGgiOjQyMDB9XSwiYWNjZXNzb3JzIjpbeyJidWZmZXJWaWV3IjowLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsIm1heCI6WzAuNjAwMDAwMDIzODQxODU3OSwwLjAxOTk5OTk5OTU1Mjk2NTE2NCwwLjQwMDAwMDAwNTk2MDQ2NDVdLCJtaW4iOlstMC42MDAwMDAwMjM4NDE4NTc5LC0wLjAxOTk5OTk5OTU1Mjk2NTE2NCwtMC40MDAwMDAwMDU5NjA0NjQ1XSwidHlwZSI6IlZFQzMifSx7ImJ1ZmZlclZpZXciOjEsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMSwxLDFdLCJtaW4iOlstMSwtMSwtMV0sInR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3IjoyLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsIm1heCI6WzEsMV0sIm1pbiI6WzAsMF0sInR5cGUiOiJWRUMyIn0seyJidWZmZXJWaWV3IjozLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsIm1heCI6WzIzXSwibWluIjpbMF0sInR5cGUiOiJTQ0FMQVIifSx7ImJ1ZmZlclZpZXciOjQsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC4wMjUwMDAwMDAzNzI1MjkwMywwLjczMDAwMDAxOTA3MzQ4NjMsMC4wMjUwMDAwMDAzNzI1MjkwM10sIm1pbiI6Wy0wLjAyNTAwMDAwMDM3MjUyOTAzLC05LjUzNjc0Mjk1MDg5OTY4ZS05LC0wLjAyNTAwMDAwMDM3MjUyOTAzXSwidHlwZSI6IlZFQzMifSx7ImJ1ZmZlclZpZXciOjUsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMSwxLDFdLCJtaW4iOlstMSwtMSwtMV0sInR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3Ijo2LCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsIm1heCI6WzEsMV0sIm1pbiI6WzAsMF0sInR5cGUiOiJWRUMyIn0seyJidWZmZXJWaWV3Ijo3LCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsIm1heCI6WzIzXSwibWluIjpbMF0sInR5cGUiOiJTQ0FMQVIifSx7ImJ1ZmZlclZpZXciOjgsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC4wMjUwMDAwMDAzNzI1MjkwMywwLjczMDAwMDAxOTA3MzQ4NjMsMC4wMjUwMDAwMDAzNzI1MjkwM10sIm1pbiI6Wy0wLjAyNTAwMDAwMDM3MjUyOTAzLC05LjUzNjc0Mjk1MDg5OTY4ZS05LC0wLjAyNTAwMDAwMDM3MjUyOTAzXSwidHlwZSI6IlZFQzMifSx7ImJ1ZmZlclZpZXciOjksImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMSwxLDFdLCJtaW4iOlstMSwtMSwtMV0sInR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3IjoxMCwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjI0LCJtYXgiOlsxLDFdLCJtaW4iOlswLDBdLCJ0eXBlIjoiVkVDMiJ9LHsiYnVmZmVyVmlldyI6MTEsImNvbXBvbmVudFR5cGUiOjUxMjMsImNvdW50IjozNiwibWF4IjpbMjNdLCJtaW4iOlswXSwidHlwZSI6IlNDQUxBUiJ9LHsiYnVmZmVyVmlldyI6MTIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC4wMjUwMDAwMDAzNzI1MjkwMywwLjczMDAwMDAxOTA3MzQ4NjMsMC4wMjUwMDAwMDAzNzI1MjkwM10sIm1pbiI6Wy0wLjAyNTAwMDAwMDM3MjUyOTAzLC05LjUzNjc0Mjk1MDg5OTY4ZS05LC0wLjAyNTAwMDAwMDM3MjUyOTAzXSwidHlwZSI6IlZFQzMifSx7ImJ1ZmZlclZpZXciOjEzLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsIm1heCI6WzEsMSwxXSwibWluIjpbLTEsLTEsLTFdLCJ0eXBlIjoiVkVDMyJ9LHsiYnVmZmVyVmlldyI6MTQsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMSwxXSwibWluIjpbMCwwXSwidHlwZSI6IlZFQzIifSx7ImJ1ZmZlclZpZXciOjE1LCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsIm1heCI6WzIzXSwibWluIjpbMF0sInR5cGUiOiJTQ0FMQVIifSx7ImJ1ZmZlclZpZXciOjE2LCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsIm1heCI6WzAuMDI1MDAwMDAwMzcyNTI5MDMsMC43MzAwMDAwMTkwNzM0ODYzLDAuMDI1MDAwMDAwMzcyNTI5MDNdLCJtaW4iOlstMC4wMjUwMDAwMDAzNzI1MjkwMywtOS41MzY3NDI5NTA4OTk2OGUtOSwtMC4wMjUwMDAwMDAzNzI1MjkwM10sInR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3IjoxNywiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjI0LCJtYXgiOlsxLDEsMV0sIm1pbiI6Wy0xLC0xLC0xXSwidHlwZSI6IlZFQzMifSx7ImJ1ZmZlclZpZXciOjE4LCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsIm1heCI6WzEsMV0sIm1pbiI6WzAsMF0sInR5cGUiOiJWRUMyIn0seyJidWZmZXJWaWV3IjoxOSwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjM2LCJtYXgiOlsyM10sIm1pbiI6WzBdLCJ0eXBlIjoiU0NBTEFSIn1dLCJtYXRlcmlhbHMiOlt7InBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuMzIzMTQzMjA5MTAyMjI4NSwwLjE0NzAyNzI2NjQ4NzY3MDE0LDAuMDU2MTI4NDkwMDQyNDExMjEsMV0sIm1ldGFsbGljRmFjdG9yIjowLCJyb3VnaG5lc3NGYWN0b3IiOjAuN319XSwibWVzaGVzIjpbeyJwcmltaXRpdmVzIjpbeyJtb2RlIjo0LCJhdHRyaWJ1dGVzIjp7IlBPU0lUSU9OIjowLCJOT1JNQUwiOjEsIlRFWENPT1JEXzAiOjJ9LCJpbmRpY2VzIjozLCJtYXRlcmlhbCI6MH1dfSx7InByaW1pdGl2ZXMiOlt7Im1vZGUiOjQsImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjQsIk5PUk1BTCI6NSwiVEVYQ09PUkRfMCI6Nn0sImluZGljZXMiOjcsIm1hdGVyaWFsIjowfV19LHsicHJpbWl0aXZlcyI6W3sibW9kZSI6NCwiYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6OCwiTk9STUFMIjo5LCJURVhDT09SRF8wIjoxMH0sImluZGljZXMiOjExLCJtYXRlcmlhbCI6MH1dfSx7InByaW1pdGl2ZXMiOlt7Im1vZGUiOjQsImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjEyLCJOT1JNQUwiOjEzLCJURVhDT09SRF8wIjoxNH0sImluZGljZXMiOjE1LCJtYXRlcmlhbCI6MH1dfSx7InByaW1pdGl2ZXMiOlt7Im1vZGUiOjQsImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjE2LCJOT1JNQUwiOjE3LCJURVhDT09SRF8wIjoxOH0sImluZGljZXMiOjE5LCJtYXRlcmlhbCI6MH1dfV19IGgQAABCSU4AmpkZPwrXozzNzMw+mpkZPwrXozzNzMy+mpkZPwrXo7zNzMw+mpkZPwrXo7zNzMy+mpkZvwrXozzNzMy+mpkZvwrXozzNzMw+mpkZvwrXo7zNzMy+mpkZvwrXo7zNzMw+mpkZvwrXozzNzMy+mpkZPwrXozzNzMy+mpkZvwrXozzNzMw+mpkZPwrXozzNzMw+mpkZvwrXo7zNzMw+mpkZPwrXo7zNzMw+mpkZvwrXo7zNzMy+mpkZPwrXo7zNzMy+mpkZvwrXozzNzMw+mpkZPwrXozzNzMw+mpkZvwrXo7zNzMw+mpkZPwrXo7zNzMw+mpkZPwrXozzNzMy+mpkZvwrXozzNzMy+mpkZPwrXo7zNzMy+mpkZvwrXo7zNzMy+AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAACAAEAAgADAAEABAAGAAUABgAHAAUACAAKAAkACgALAAkADAAOAA0ADgAPAA0AEAASABEAEgATABEAFAAWABUAFgAXABUAzczMPEjhOj/NzMw8zczMPEjhOj/NzMy8zczMPArXI7LNzMw8zczMPArXI7LNzMy8zczMvEjhOj/NzMy8zczMvEjhOj/NzMw8zczMvArXI7LNzMy8zczMvArXI7LNzMw8zczMvEjhOj/NzMy8zczMPEjhOj/NzMy8zczMvEjhOj/NzMw8zczMPEjhOj/NzMw8zczMvArXI7LNzMw8zczMPArXI7LNzMw8zczMvArXI7LNzMy8zczMPArXI7LNzMy8zczMvEjhOj/NzMw8zczMPEjhOj/NzMw8zczMvArXI7LNzMw8zczMPArXI7LNzMw8zczMPEjhOj/NzMy8zczMvEjhOj/NzMy8zczMPArXI7LNzMy8zczMvArXI7LNzMy8AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAACAAEAAgADAAEABAAGAAUABgAHAAUACAAKAAkACgALAAkADAAOAA0ADgAPAA0AEAASABEAEgATABEAFAAWABUAFgAXABUAzczMPEjhOj/NzMw8zczMPEjhOj/NzMy8zczMPArXI7LNzMw8zczMPArXI7LNzMy8zczMvEjhOj/NzMy8zczMvEjhOj/NzMw8zczMvArXI7LNzMy8zczMvArXI7LNzMw8zczMvEjhOj/NzMy8zczMPEjhOj/NzMy8zczMvEjhOj/NzMw8zczMPEjhOj/NzMw8zczMvArXI7LNzMw8zczMPArXI7LNzMw8zczMvArXI7LNzMy8zczMPArXI7LNzMy8zczMvEjhOj/NzMw8zczMPEjhOj/NzMw8zczMvArXI7LNzMw8zczMPArXI7LNzMw8zczMPEjhOj/NzMy8zczMvEjhOj/NzMy8zczMPArXI7LNzMy8zczMvArXI7LNzMy8AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAACAAEAAgADAAEABAAGAAUABgAHAAUACAAKAAkACgALAAkADAAOAA0ADgAPAA0AEAASABEAEgATABEAFAAWABUAFgAXABUAzczMPEjhOj/NzMw8zczMPEjhOj/NzMy8zczMPArXI7LNzMw8zczMPArXI7LNzMy8zczMvEjhOj/NzMy8zczMvEjhOj/NzMw8zczMvArXI7LNzMy8zczMvArXI7LNzMw8zczMvEjhOj/NzMy8zczMPEjhOj/NzMy8zczMvEjhOj/NzMw8zczMPEjhOj/NzMw8zczMvArXI7LNzMw8zczMPArXI7LNzMw8zczMvArXI7LNzMy8zczMPArXI7LNzMy8zczMvEjhOj/NzMw8zczMPEjhOj/NzMw8zczMvArXI7LNzMw8zczMPArXI7LNzMw8zczMPEjhOj/NzMy8zczMvEjhOj/NzMy8zczMPArXI7LNzMy8zczMvArXI7LNzMy8AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAACAAEAAgADAAEABAAGAAUABgAHAAUACAAKAAkACgALAAkADAAOAA0ADgAPAA0AEAASABEAEgATABEAFAAWABUAFgAXABUAzczMPEjhOj/NzMw8zczMPEjhOj/NzMy8zczMPArXI7LNzMw8zczMPArXI7LNzMy8zczMvEjhOj/NzMy8zczMvEjhOj/NzMw8zczMvArXI7LNzMy8zczMvArXI7LNzMw8zczMvEjhOj/NzMy8zczMPEjhOj/NzMy8zczMvEjhOj/NzMw8zczMPEjhOj/NzMw8zczMvArXI7LNzMw8zczMPArXI7LNzMw8zczMvArXI7LNzMy8zczMPArXI7LNzMy8zczMvEjhOj/NzMw8zczMPEjhOj/NzMw8zczMvArXI7LNzMw8zczMPArXI7LNzMw8zczMPEjhOj/NzMy8zczMvEjhOj/NzMy8zczMPArXI7LNzMy8zczMvArXI7LNzMy8AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAIA/AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAgD8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AACAPwAAgD8AAAAAAAAAAAAAgD8AAAAAAAACAAEAAgADAAEABAAGAAUABgAHAAUACAAKAAkACgALAAkADAAOAA0ADgAPAA0AEAASABEAEgATABEAFAAWABUAFgAXABUA';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8dde4);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(1.8, 1.4, 2.4);
camera.lookAt(0, 0.45, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 4, 3);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a8f96 }));
floor.name = 'floor';
scene.add(floor);

const table = (await new GLTFLoader().loadAsync(TABLE)).scene; // where it stood in the modelling scene
scene.add(table);

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

Opened http://127.0.0.1:34267/index.html in 0.3 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["floor","AuxScene"]}

look {}

On screen (6):
floor 54% [0, 309, 1279, 799] 6 × 6 units
top 3.4% [384, 248, 902, 371] 1.2 × 0.8 units
leg-* ×4 2.2% [398, 304, 888, 656] 0.73 × 0.05 units
Never visible: none

eval {"code": "const b = new THREE.Box3().setFromObject(find('table'));\nreturn { min: b.min.toArray().map(v => +v.toFixed(3)), max: b.max.toArray().map(v => +v.toFixed(3)) }"}

{"min":[-0.6,0,-0.4],"max":[0.6,0.77,0.4]}
```

The replies are cut to the lines discussed here, with nothing reworded. The top and the four legs are on screen by name, and the table stands from 0 to 0.77 on the page's floor, as it did in the modelling scene. `AuxScene` is the name three.js's GLTF exporter gives the scene it wraps an export in; `table` and its parts are inside it.

## Blender or the modelling scene

They suit different parts of the work. Blender has sculpting, UV unwrapping, rigging, animation, modifiers and its own renderers, and the Blender MCP lets an agent use them; the result comes into a three.js page through the glTF exporter. `model_run` suits parts that are easier to write than to draw: furniture, buildings, props made of measured pieces, cut-outs with booleans, repeated parts placed by a rule. It shares the page's coordinate system and units, and `stats` and `model_look` read the same numbers the page will.

## What paprika3d does not do

- **It does not drive Blender, Unity or another 3D application,** and it does not open `.blend` files. It works with three.js and GLB.
- **It does not generate a model from a sentence or a picture.** The agent writes the code that builds it. For an existing model, `asset_search` finds one in a hosted library of CC0 models, and `load` brings a `.glb` from the project into the modelling scene to measure or combine.
- **It does not sculpt, unwrap UVs or rig.** three.js's own primitives come with texture coordinates; geometry from Manifold's booleans has none.
- **Its pictures use a studio light of its own.** `model_look` shows shape and arrangement, not how the page lights the model; `look` on the page shows that.
- **It does not change the page.** The page changes when the agent writes the loading code into it.

## Pitfalls

- **A position is an origin.** three.js primitives are centred on theirs. For a part that stands on something, move the geometry so its base is at 0 (`translate(0, height / 2, 0)`), then place the part by its base.
- **A shared geometry moves for every mesh that uses it.** `translate` changes the geometry itself; four legs sharing one `BoxGeometry` and translated in a loop would each move it again.
- **Name every part.** `model_look` lists objects by name, and `find` is how a later call reaches them.
- **Read the picture for arrangement and the lines for size.** Step 2's list was right and the table was wrong.
- **Metres, y up.** The modelling scene uses three.js's axes and metres; Manifold's own functions use z up and degrees, which the CSG guide covers.

## Without paprika3d

Build the model in a function in the page, and log `new THREE.Box3().setFromObject(part)` for each part while you work; a min and max per part catches the floating top in step 1. three.js's online editor at threejs.org/editor places primitives by hand and exports GLB. `GLTFExporter` from `three/addons/exporters/GLTFExporter.js` writes a GLB from any object in a script. For a model that needs sculpting, texturing or rigging, Blender with its glTF exporter is the usual route, with or without an MCP server in front of it.
