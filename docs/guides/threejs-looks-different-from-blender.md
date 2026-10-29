---
title: three.js looks different from Blender? Measure the page against the render, then fix the light units, tone mapping and world
phrase: three.js looks different from blender
description: Why a three.js page draws a Blender scene flatter, darker or blown out next to its Cycles render, and how a coding agent puts the render beside the page with the paprika3d plugin's reference compare, reads the causes in look's Lighting lines, and switches tone mapping, light intensity and the HDRI environment with eval until the share of differing pixels drops.
meta: three.js looks different from Blender? Compare the page with the render, then match light units, tone mapping and the world lighting.
intent: threejs-match-blender-render
queries:
  - "Effect Composer Gamma Output Difference"
  - "Photorealistic render comparison, why does three.js look so bad?"
  - "ACESFilmicToneMapping leading to low-contrast textures"
  - "What makes an image darker in the visualizer than in three.js editor?"
  - "How get exact lighting and quality in threejs"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js looks different from Blender? Measure the page against the render, then fix the light units, tone mapping and world

## Why the page and the render differ

A GLB carries meshes, materials, cameras and (when asked) lights. Three things that shape a Blender render do not travel with it, and one travels in different units:

- **The view transform.** Blender 4.x renders through the AgX view transform unless the scene says otherwise (`view_settings.view_transform` reads `AgX` in a factory-settings Blender 4.5). A three.js `WebGLRenderer` starts with `NoToneMapping`, so bright surfaces clip to white and the rest has a different curve. three.js r186 has `THREE.AgXToneMapping`, which its shader source describes as based on Filament's version of Blender's AgX.
- **The world.** Blender's World (an HDRI, or a colour) lights every surface and is what metal reflects. glTF has no place for it, so the exporter writes none, and the page has nothing to reflect until `scene.environment` is set.
- **Light units.** With the exporter's default Lighting Mode (Standard), a sun's strength in W/m² is multiplied by 683 lumens per watt into lux. `GLTFLoader` puts that number into `DirectionalLight.intensity` as it is, so a sun of strength 2 arrives as an intensity of 1366, hundreds of times what three.js's lighting expects for the same brightness.
- **Path tracing.** Cycles follows light as it bounces between objects. A three.js material is lit by its lights and its environment map alone: a mirror ball reflects the HDRI, not the floor it stands on, and shadows come from shadow maps that each light must be told to cast.

The short fix for the first three:

```js
renderer.toneMapping = THREE.AgXToneMapping;           // Blender 4.x's default view transform
sun.intensity /= 683;                                  // or export with Lighting Mode: Unitless
scene.environment = pmrem.fromEquirectangular(sky).texture; // the same HDRI file as the World
scene.background = sky;                                // when the render shows the World
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `reference` with `compare: true` puts the render, the page and a picture of their differences side by side, and says what share of pixels differ, overall and in a grid of regions, with the colour at each `sample` point on both. `look` names setup faults on its Lighting lines, `eval` changes the live page, and `asset_search` with `kind: "hdri"` puts the HDRI in the project that Blender and the page both read. Each change below is judged by a number, not by eye.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The Blender scene and its render

The reference is a real Cycles render, made for this guide with Blender 4.5.15 LTS (the official Linux build from download.blender.org) run headless. The scene is a grey ground, a chrome ball (Metallic 1, Roughness 0.2), a red plastic box (Metallic 0, Roughness 0.45), a sun lamp of strength 2, a 40 mm camera, and a World lit by Poly Haven's CC0 "Overcast Soil" HDRI, which `asset_search` picked into the project's `assets/hdri/` first so both renderers read the same file:

```text
asset_search {"cwd": "<project>", "kind": "hdri", "pick": "polyhaven-overcast_soil"}

Saved assets/hdri/polyhaven-overcast_soil.hdr (Overcast Soil, CC0-1.0)
```

The render settings: Cycles on the CPU, 48 samples with the OpenImageDenoise denoiser, Blender's default 12 light bounces, 1280 × 800 so the picture has the page's aspect, view transform AgX with no look and exposure 0 (the factory defaults). The same script exports the GLB with the exporter's Cameras and Punctual Lights boxes ticked, both of which are off by default:

```python
# blender -b --factory-startup --python scene.py -- <hdri> <out.png> <out.glb> <samples>
import sys, math
import bpy
from mathutils import Vector

hdri, out_png, out_glb, samples = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def material(name, color, metallic, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    return m

bpy.ops.mesh.primitive_plane_add(size=12)
bpy.context.object.name = "ground"
bpy.context.object.data.materials.append(material("ground", (0.3, 0.3, 0.3), 0.0, 0.8))
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.5, location=(-0.65, 0.1, 0.5))
bpy.context.object.name = "chrome_ball"
bpy.ops.object.shade_smooth()
bpy.context.object.data.materials.append(material("chrome", (0.9, 0.9, 0.92), 1.0, 0.2))
bpy.ops.mesh.primitive_cube_add(size=0.8, location=(0.7, -0.1, 0.4), rotation=(0, 0, math.radians(30)))
bpy.context.object.name = "red_box"
bpy.context.object.data.materials.append(material("red_plastic", (0.8, 0.06, 0.04), 0.0, 0.45))

bpy.ops.object.light_add(type="SUN", location=(2, -2, 4))
sun = bpy.context.object; sun.name = "sun"
sun.data.energy = 2.0                                   # W/m²
sun.rotation_euler = (math.radians(45), 0, math.radians(35))

cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
scene.collection.objects.link(cam)
cam.location = (0.4, -4.6, 1.4)
cam.rotation_euler = (Vector((0, 0, 0.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 40
scene.camera = cam

scene.world = bpy.data.worlds.new("world")
scene.world.use_nodes = True
env = scene.world.node_tree.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(hdri)
scene.world.node_tree.links.new(env.outputs["Color"], scene.world.node_tree.nodes["Background"].inputs["Color"])

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(samples)                    # 48
scene.cycles.use_denoising = True                      # OpenImageDenoise
scene.render.resolution_x, scene.render.resolution_y = 1280, 800
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = out_png                        # refs/blender.png

bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", export_cameras=True,
                          export_lights=True, export_texcoords=False)   # models/scene.glb, 13,832 bytes
bpy.ops.render.render(write_still=True)
```

The exported camera keeps the render's framing: `yfov` 0.548 radians at an `aspectRatio` of 1.6. The sun arrives as `"intensity": 1366`.

## The page, as a first attempt writes it

The page loads the GLB, renders through Blender's camera and keeps three.js's defaults: no tone mapping, no environment. The GLB is small enough to inline as a data URL so the block runs on its own; in a project it is `models/scene.glb`.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Blender scene</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// In a project this is a file, 'models/scene.glb', as Blender 4.5's glTF exporter writes it with
// Cameras and Punctual Lights ticked: a ground, a chrome ball, a red box, the sun lamp and the camera.
// Inlined so the page runs on its own.
const MODEL = 'data:model/gltf-binary;base64,Z2xURgIAAAAINgAAqA0AAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6Iktocm9ub3MgZ2xURiBCbGVuZGVyIEkvTyB2NC41LjUxIiwidmVyc2lvbiI6IjIuMCJ9LCJleHRlbnNpb25zVXNlZCI6WyJLSFJfbGlnaHRzX3B1bmN0dWFsIl0sImV4dGVuc2lvbnNSZXF1aXJlZCI6WyJLSFJfbGlnaHRzX3B1bmN0dWFsIl0sImV4dGVuc2lvbnMiOnsiS0hSX2xpZ2h0c19wdW5jdHVhbCI6eyJsaWdodHMiOlt7ImNvbG9yIjpbMSwxLDFdLCJpbnRlbnNpdHkiOjEzNjYsInR5cGUiOiJkaXJlY3Rpb25hbCIsIm5hbWUiOiJTdW4ifV19fSwic2NlbmUiOjAsInNjZW5lcyI6W3sibmFtZSI6IlNjZW5lIiwibm9kZXMiOlswLDEsMiwzLDRdfV0sIm5vZGVzIjpbeyJtZXNoIjowLCJuYW1lIjoiZ3JvdW5kIn0seyJtZXNoIjoxLCJuYW1lIjoiY2hyb21lX2JhbGwiLCJ0cmFuc2xhdGlvbiI6Wy0wLjY0OTk5OTk3NjE1ODE0MjEsMC41LC0wLjEwMDAwMDAwMTQ5MDExNjEyXX0seyJtZXNoIjoyLCJuYW1lIjoicmVkX2JveCIsInJvdGF0aW9uIjpbMCwwLjI1ODgxOTA3MzQzODY0NDQsMCwwLjk2NTkyNTkzMTkzMDU0Ml0sInRyYW5zbGF0aW9uIjpbMC42OTk5OTk5ODgwNzkwNzEsMC40MDAwMDAwMDU5NjA0NjQ1LDAuMTAwMDAwMDAxNDkwMTE2MTJdfSx7ImV4dGVuc2lvbnMiOnsiS0hSX2xpZ2h0c19wdW5jdHVhbCI6eyJsaWdodCI6MH19LCJuYW1lIjoic3VuIiwicm90YXRpb24iOlstMC4zNjQ5NzE2Mzc3MjU4MzAxLDAuMjc3ODE1OTA4MTkzNTg4MjYsMC4xMTUwNzUxMTg4Mzk3NDA3NSwwLjg4MTExOTYwODg3OTA4OTRdLCJ0cmFuc2xhdGlvbiI6WzIsNCwyXX0seyJjYW1lcmEiOjAsIm5hbWUiOiJjYW1lcmEiLCJyb3RhdGlvbiI6Wy0wLjA5NjAxMjQ4ODAwNzU0NTQ3LDAuMDQzMTU0OTA2NDgxNTA0NDQsMC4wMDQxNjY2MDEyMjU3MzM3NTcsMC45OTQ0MzU0ODkxNzc3MDM5XSwidHJhbnNsYXRpb24iOlswLjQwMDAwMDAwNTk2MDQ2NDUsMS4zOTk5OTk5NzYxNTgxNDIsNC41OTk5OTk5MDQ2MzI1NjhdfV0sImNhbWVyYXMiOlt7Im5hbWUiOiJjYW1lcmEiLCJwZXJzcGVjdGl2ZSI6eyJhc3BlY3RSYXRpbyI6MS42LCJ5Zm92IjowLjU0ODMzNDg4OTM1NTM0NzEsInpmYXIiOjEwMDAsInpuZWFyIjowLjEwMDAwMDAwMTQ5MDExNjEyfSwidHlwZSI6InBlcnNwZWN0aXZlIn1dLCJtYXRlcmlhbHMiOlt7ImRvdWJsZVNpZGVkIjp0cnVlLCJuYW1lIjoiZ3JvdW5kIiwicGJyTWV0YWxsaWNSb3VnaG5lc3MiOnsiYmFzZUNvbG9yRmFjdG9yIjpbMC4zMDAwMDAwMTE5MjA5Mjg5NiwwLjMwMDAwMDAxMTkyMDkyODk2LDAuMzAwMDAwMDExOTIwOTI4OTYsMV0sIm1ldGFsbGljRmFjdG9yIjowLCJyb3VnaG5lc3NGYWN0b3IiOjAuODAwMDAwMDExOTIwOTI5fX0seyJkb3VibGVTaWRlZCI6dHJ1ZSwibmFtZSI6ImNocm9tZSIsInBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuODk5OTk5OTc2MTU4MTQyMSwwLjg5OTk5OTk3NjE1ODE0MjEsMC45MjAwMDAwMTY2ODkzMDA1LDFdLCJyb3VnaG5lc3NGYWN0b3IiOjAuMjAwMDAwMDAyOTgwMjMyMjR9fSx7ImRvdWJsZVNpZGVkIjp0cnVlLCJuYW1lIjoicmVkX3BsYXN0aWMiLCJwYnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLjgwMDAwMDAxMTkyMDkyOSwwLjA1OTk5OTk5ODY1ODg5NTQ5LDAuMDM5OTk5OTk5MTA1OTMwMzMsMV0sIm1ldGFsbGljRmFjdG9yIjowLCJyb3VnaG5lc3NGYWN0b3IiOjAuNDQ5OTk5OTg4MDc5MDcxMDR9fV0sIm1lc2hlcyI6W3sibmFtZSI6IlBsYW5lIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxfSwiaW5kaWNlcyI6MiwibWF0ZXJpYWwiOjB9XX0seyJuYW1lIjoiU3BoZXJlIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MywiTk9STUFMIjo0fSwiaW5kaWNlcyI6NSwibWF0ZXJpYWwiOjF9XX0seyJuYW1lIjoiQ3ViZSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjYsIk5PUk1BTCI6N30sImluZGljZXMiOjgsIm1hdGVyaWFsIjoyfV19XSwiYWNjZXNzb3JzIjpbeyJidWZmZXJWaWV3IjowLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6NCwibWF4IjpbNiwwLDZdLCJtaW4iOlstNiwwLC02XSwidHlwZSI6IlZFQzMifSx7ImJ1ZmZlclZpZXciOjEsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50Ijo0LCJ0eXBlIjoiVkVDMyJ9LHsiYnVmZmVyVmlldyI6MiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjYsInR5cGUiOiJTQ0FMQVIifSx7ImJ1ZmZlclZpZXciOjMsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNjYsIm1heCI6WzAuNDk5OTk5OTEwNTkzMDMyODQsMC41LDAuNDk5OTk5ODUwOTg4Mzg4MDZdLCJtaW4iOlstMC40OTk5OTk3MzE3NzkwOTg1LC0wLjUsLTAuNV0sInR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3Ijo0LCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjY2LCJ0eXBlIjoiVkVDMyJ9LHsiYnVmZmVyVmlldyI6NSwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjE1ODQsInR5cGUiOiJTQ0FMQVIifSx7ImJ1ZmZlclZpZXciOjYsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC40MDAwMDAwMDU5NjA0NjQ1LDAuNDAwMDAwMDA1OTYwNDY0NSwwLjQwMDAwMDAwNTk2MDQ2NDVdLCJtaW4i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0x+Dvn0Hb7+lMGa+m6P9vgXOVr850zy+fKIzv8AtML+wpwa+v31cv6tJ+76siY6975J2v632hL4AAAAAV5J2Py+sib4AAAAAEn5cP8oSAr8AAAAAtqEzP3xlNr8AAAAAEn5cv8oSAr8AAAAAV5J2vy+sib4AAAcBCAAAAAgACQAJAQgBDwAJAQ8AEAAFAYsABgAEAAMADAAEAAwADQABAAAACQABAAkACgAyAAkBEAAGAQUBBgAGAQYABwAFAAQADQAFAA0ADgACAAEACgACAAoACwAHAQYBBwAHAQcACAAIAQUADgAIAQ4ADwADAAIACwADAAsADAAHAAYAEQAHABEAEgAOAA0AGAAOABgAGQALAAoAFQALABUAFgAIAAcAEgAIABIAEwAPAA4AGQAPABkAGgAMAAsAFgAMABYAFwAJAAgAEwAJABMAFAAQAA8AGgAQABoAGwAGAIsAEQANAAwAFwANABcAGAAKAAkAFAAKABQAFQAyABAAGwAbABoAJQAbACUAJgARAIsAHAAYABcAIgAYACIAIwAVABQAHwAVAB8AIAAyABsAJgASABEAHAASABwAHQAZABgAIwAZACMAJAAWABUAIAAWACAAIQATABIAHQATAB0AHgAaABkAJAAaACQAJQAXABYAIQAXACEAIgAUABMAHgAUAB4AHwAeAB0AKAAeACgAKQAlACQALwAlAC8AMAAiACEALAAiACwALQAfAB4AKQAfACkAKgAmACUAMAAmADAAMQAcAIsAJwAjACIALQAjAC0ALgAgAB8AKgAgACoAKwAyACYAMQAdABwAJwAdACcAKAAkACMALgAkAC4ALwAhACAAKwAhACsALAAyADEAPQAoACcAMwAoADMANAAvAC4AOgAvADoAOwAsACsANwAsADcAOAApACgANAApADQANQAwAC8AOwAwADsAPAAtACwAOAAtADgAOQAqACkANQAqADUANgAxADAAPAAxADwAPQAnAIsAMwAuAC0AOQAuADkAOgArACoANgArADYANwA2ADUAQAA2AEAAQQA9ADwARwA9AEcASAAzAIsAPgA6ADkARAA6AEQARQA3ADYAQQA3AEEAQgAyAD0ASAA0ADMAPgA0AD4APwA7ADoARQA7AEUARgA4ADcAQgA4AEIAQwA1ADQAPwA1AD8AQAA8ADsARgA8AEYARwA5ADgAQwA5AEMARABAAD8ASgBAAEoASwBHAEYAUQBHAFEAUgBEAEMATgBEAE4ATwBBAEAASwBBAEsATABIAEcAUgBIAFIAUwA+AIsASQBFAEQATwBFAE8AUABCAEEATABCAEwATQAyAEgAUwA/AD4ASQA/AEkASgBGAEUAUABGAFAAUQBDAEIATQBDAE0ATgBNAEwAVwBNAFcAWAAyAFMAXgBKAEkAVABKAFQAVQBRAFAAWwBRAFsAXABOAE0AWABOAFgAWQBLAEoAVQBLAFUAVgBSAFEAXABSAFwAXQBPAE4AWQBPAFkAWgBMAEsAVgBMAFYAVwBTAFIAXQBTAF0AXgBJAIsAVABQAE8AWgBQAFoAWwBXAFYAYQBXAGEAYgBeAF0AaABeAGgAaQBUAIsAXwBbAFoAZQBbAGUAZgBYAFcAYgBYAGIAYwAyAF4AaQBVAFQAXwBVAF8AYABcAFsAZgBcAGYAZwBZAFgAYwBZAGMAZABWAFUAYABWAGAAYQBdAFwAZwBdAGcAaABaAFkAZABaAGQAZQBkAGMAbgBkAG4AbwBhAGAAawBhAGsAbABoAGcAcgBoAHIAcwBlAGQAbwBlAG8AcABiAGEAbABiAGwAbQBpAGgAcwBpAHMAdABfAIsAagBmAGUAcABmAHAAcQBjAGIAbQBjAG0AbgAyAGkAdABgAF8AagBgAGoAawBnAGYAcQBnAHEAcgBuAG0AeABuAHgAeQAyAHQAfwBrAGoAdQBrAHUAdgByAHEAfAByAHwAfQBvAG4AeQBvAHkAegBsAGsAdgBsAHYAdwBzAHIAfQBzAH0AfgBwAG8AegBwAHoAewBtAGwAdwBtAHcAeAB0AHMAfgB0AH4AfwBqAIsAdQBxAHAAewBxAHsAfAB7AHoAhQB7AIUAhgB4AHcAggB4AIIAgwB/AH4AiQB/AIkAigB1AIsAgAB8AHsAhgB8AIYAhwB5AHgAgwB5AIMAhAAyAH8AigB2AHUAgAB2AIAAgQB9AHwAhwB9AIcAiAB6AHkAhAB6AIQAhQB3AHYAgQB3AIEAggB+AH0AiAB+AIgAiQCFAIQAkACFAJAAkQCCAIEAjQCCAI0AjgCJAIgAlACJAJQAlQCGAIUAkQCGAJEAkgCDAIIAjgCDAI4AjwCKAIkAlQCKAJUAlgCAAIsAjACHAIYAkgCHAJIAkwCEAIMAjwCEAI8AkAAyAIoAlgCBAIAAjACBAIwAjQCIAIcAkwCIAJMAlACTAJIAnQCTAJ0AngCQAI8AmgCQAJoAmwAyAJYAoQCNAIwAlwCNAJcAmACUAJMAngCUAJ4AnwCRAJAAmwCRAJsAnACOAI0AmACOAJgAmQCVAJQAnwCVAJ8AoACSAJEAnACSAJwAnQCPAI4AmQCPAJkAmgCWAJUAoACWAKAAoQCMAIsAlwCdAJwApwCdAKcAqACaAJkApACaAKQApQChAKAAqwChAKsArACXAIsAogCeAJ0AqACeAKgAqQCbAJoApQCbAKUApgAyAKEArACYAJcAogCYAKIAowCfAJ4AqQCfAKkAqgCcAJsApgCcAKYApwCZAJgAowCZAKMApACgAJ8AqgCgAKoAqwCqAKkAtACqALQAtQCnAKYAsQCnALEAsgCkAKMArgCkAK4ArwCrAKoAtQCrALUAtgCoAKcAsgCoALIAswClAKQArwClAK8AsACsAKsAtgCsALYAtwCiAIsArQCpAKgAswCpALMAtACmAKUAsACmALAAsQAyAKwAtwCjAKIArQCjAK0ArgCtAIsAuAC0ALMAvgC0AL4AvwCxALAAuwCxALsAvAAyALcAwgCuAK0AuACuALgAuQC1ALQAvwC1AL8AwACyALEAvACyALwAvQCvAK4AuQCvALkAugC2ALUAwAC2AMAAwQCzALIAvQCzAL0AvgCwAK8AugCwALoAuwC3ALYAwQC3AMEAwgDBAMAAywDBAMsAzAC+AL0AyAC+AMgAyQC7ALoAxQC7AMUAxgDCAMEAzADCAMwAzQC4AIsAwwC/AL4AyQC/AMkAygC8ALsAxgC8AMYAxwAyAMIAzQC5ALgAwwC5AMMAxADAAL8AygDAAMoAywC9ALwAxwC9AMcAyAC6ALkAxAC6AMQAxQDEAMMAzgDEAM4AzwDLAMoA1QDLANUA1gDIAMcA0gDIANIA0wDFAMQAzwDFAM8A0ADMAMsA1gDMANYA1wDJAMgA0wDJANMA1ADGAMUA0ADGANAA0QDNAMwA1wDNANcA2ADDAIsAzgDKAMkA1ADKANQA1QDHAMYA0QDHANEA0gAyAM0A2ADYANcA4gDYAOIA4wDOAIsA2QDVANQA3wDVAN8A4ADSANEA3ADSANwA3QAyANgA4wDPAM4A2QDPANkA2gDWANUA4ADWAOAA4QDTANIA3QDTAN0A3gDQAM8A2gDQANoA2wDXANYA4QDXAOEA4gDUANMA3gDUAN4A3wDRANAA2wDRANsA3ADbANoA5QDbAOUA5gDiAOEA7ADiAOwA7QDfAN4A6QDfAOkA6gDcANsA5gDcAOYA5wDjAOIA7QDjAO0A7gDZAIsA5ADgAN8A6gDgAOoA6wDdANwA5wDdAOcA6AAyAOMA7gDaANkA5ADaAOQA5QDhAOAA6wDhAOsA7ADeAN0A6ADeAOgA6QAyAO4A+QDlAOQA7wDlAO8A8ADsAOsA9gDsAPYA9wDpAOgA8wDpAPMA9ADmAOUA8ADmAPAA8QDtAOwA9wDtAPcA+ADqAOkA9ADqAPQA9QDnAOYA8QDnAPEA8gDuAO0A+ADuAPgA+QDkAIsA7wDrAOoA9QDrAPUA9gDoAOcA8gDoAPIA8wDyAPEA/ADyAPwA/QD5APgAAwH5AAMBBAHvAIsA+gD2APUAAAH2AAABAQHzAPIA/QDzAP0A/gAyAPkABAHwAO8A+gDwAPoA+wD3APYAAQH3AAEBAgH0APMA/gD0AP4A/wDxAPAA+wDxAPsA/AD4APcAAgH4AAIBAwH1APQA/wD1AP8AAAH8APsABgH8AAYBBwEDAQIBBQADAQUACAEAAf8AAgAAAQIAAwD9APwABwH9AAcBAAAEAQMBCAEEAQgBCQH6AIsABQEBAQABAwABAQMABAD+AP0AAAD+AAAAAQAyAAQBCQH7APoABQH7AAUBBgECAQEBBAACAQQABQD/AP4AAQD/AAEAAgDNzMy+zczMvs3MzD7NzMy+zczMvs3MzD7NzMy+zczMvs3MzD7NzMy+zczMPs3MzD7NzMy+zczMPs3MzD7NzMy+zczMPs3MzD7NzMy+zczMvs3MzL7NzMy+zczMvs3MzL7NzMy+zczMvs3MzL7NzMy+zczMPs3MzL7NzMy+zczMPs3MzL7NzMy+zczMPs3MzL7NzMw+zczMvs3MzD7NzMw+zczMvs3MzD7NzMw+zczMvs3MzD7NzMw+zczMPs3MzD7NzMw+zczMPs3MzD7NzMw+zczMPs3MzD7NzMw+zczMvs3MzL7NzMw+zczMvs3MzL7NzMw+zczMvs3MzL7NzMw+zczMPs3MzL7NzMw+zczMPs3MzL7NzMw+zczMPs3MzL4AAAAAAAAAAAAAgD8AAAAAAACAvwAAAAAAAIC/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAACAPwAAAAAAAIC/AAAAAAAAAAAAAAAAAAAAAAAAgL8AAAAAAACAvwAAAAAAAIC/AAAAAAAAAAAAAAAAAAAAAAAAgL8AAAAAAACAPwAAAAAAAIC/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAACAvwAAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAACAPwAAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAgL8AAAAAAACAvwAAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAgL8AAAAAAACAPwAAAAAAAIA/AAAAAAAAAAACAAUACwACAAsACAAGAAkAFQAGABUAEgAUABcAEQAUABEADgAMAA8AAwAMAAMAAAAHABMADQAHAA0AAQAWAAoABAAWAAQAEAA=';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);

new GLTFLoader().load(MODEL, (gltf) => {
  scene.add(gltf.scene);
  camera = gltf.cameras[0]; // Blender's camera, with the render's field of view
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}, undefined, (err) => console.error('scene.glb did not load:', err));

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

These replies were captured on 2026-10-28 on a Linux server with no GPU (Chrome on SwiftShader); colours and pixel shares do not depend on the GPU, and nothing here reads a frame time. Run folder paths are shortened to `<project>`, and replies are cut to the lines discussed, with nothing reworded. The seven `sample` points are the same in every call: the sky, the soil behind the ground, the lower half of the ball, the box's left and right faces, the ball's shadow and the open ground.

**1. Open the page and look.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:39933/index.html in 0.2 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.

look {"sample": [[640, 30], [640, 230], [450, 430], [740, 450], [930, 450], [330, 505], [200, 700]]}

Pixels: brightness 58%, colour saturation 0%, 41% near black, 56% blown out. Much of it is blown out to white. Pale: little colour.
Lighting: no tone mapping (renderer.toneMapping is NoToneMapping): bright colours clip to white; ACESFilmicToneMapping, AgXToneMapping or NeutralToneMapping avoid it, and ACES also mutes saturated colours, which a bright stylised look may not want.
Lighting: 1 metallic materials with no environment map (scene.environment unset): metal reflects nothing and draws black. Bake a RoomEnvironment through PMREMGenerator, or call stage() from fx.js.
Colours (5 × 5 mean, in the page's pixels): (640, 30) #000000, (640, 230) #000000, (450, 430) #ffffff, (740, 450) #000000, (930, 450) #ffffff, (330, 505) #ffffff, (200, 700) #ffffff.
```

Two `Lighting:` lines name two of the four causes. The metal line is the one [the glTF model too dark guide](/guides/threejs-gltf-model-too-dark) walks through. Neither line can name the third cause, the light's units, but the Pixels line points at it: more than half the frame is blown out to white.

**2. Put the render beside the page.**

```text
reference {"cwd": "<project>", "file": "refs/blender.png", "compare": true, "sample": [[640, 30], [640, 230], [450, 430], [740, 450], [930, 450], [330, 505], [200, 700]]}

refs/blender.png is 1280 × 800 px.
Shown: the picture, the page's look (1280 × 800) and their differences in red, each 480 px tall.
99% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 100% 100% 100% 100% / 100% 98% 100% 100% / 100% 88% 100% 100% / 100% 100% 100% 100%. Most different: top left (100%).
Colours (5 × 5 mean): (640, 30): picture #6f6253, page #000000, off by -111 -98 -83; (640, 230): picture #2e2824, page #000000, off by -46 -40 -36; (450, 430): picture #b0b0b1, page #ffffff, off by +79 +79 +78; (740, 450): picture #bf5548, page #000000, off by -191 -85 -72; (930, 450): picture #d56c5e, page #ffffff, off by +42 +147 +161; (330, 505): picture #9f9f9f, page #ffffff, off by +96 +96 +96; (200, 700): picture #b2b2b2, page #ffffff, off by +77 +77 +77.
```

The page is a black sky over a white world: the box's sunlit face is pure white and its other face pure black. The camera is right, which the comparison needs, since it works pixel by pixel; the reply says so when the canvas and the picture have different aspects.

**3. Read what the scene holds.**

```text
eval {"code": "const lights = [];\nscene.traverse((o) => { if (o.isLight) lights.push(`${o.type} ${o.name}: intensity ${o.intensity}`); });\nreturn { toneMapping: renderer.toneMapping, environment: scene.environment, background: scene.background, lights }"}

{"toneMapping":0,"environment":null,"background":null,"lights":["DirectionalLight sun: intensity 1366"]}
```

**4. The World: the same HDRI as environment and background.** This is the loading code `asset_search` replied with at the pick, run in the page:

```text
eval {"code": "const { HDRLoader } = await import('three/addons/loaders/HDRLoader.js');\nconst sky = await new HDRLoader().loadAsync('assets/hdri/polyhaven-overcast_soil.hdr');\nsky.mapping = THREE.EquirectangularReflectionMapping;\nconst pmrem = new THREE.PMREMGenerator(renderer);\nscene.environment = pmrem.fromEquirectangular(sky).texture;\nscene.background = sky;\npmrem.dispose();\nreturn 'environment and background set'"}

environment and background set

interact {"steps": [{"wait": 1}]}

reference {"cwd": "<project>", "file": "refs/blender.png", "compare": true, "sample": [[640, 30], [640, 230], [450, 430], [740, 450], [930, 450], [330, 505], [200, 700]]}

62% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 5% 4% 0% 2% / 47% 61% 48% 41% / 100% 89% 97% 100% / 100% 100% 100% 100%. Most different: bottom left (100%).
Colours (5 × 5 mean): (640, 30): picture #6f6253, page #706456, off by +1 +2 +3; (640, 230): picture #2e2824, page #39302b, off by +7 +7 +7; (450, 430): picture #b0b0b1, page #ffffff, off by +79 +79 +78; (740, 450): picture #bf5548, page #ad372e, off by -18 -30 -26; (930, 450): picture #d56c5e, page #ffffff, off by +42 +147 +161; (330, 505): picture #9f9f9f, page #ffffff, off by +96 +96 +96; (200, 700): picture #b2b2b2, page #ffffff, off by +77 +77 +77.
```

The top row of regions now matches: the sky is within 3 levels a channel. Blender and three.js map an equirectangular image the same way round here, so no rotation was needed. The lower half is still white, because the sun is still 1366. The `interact` step lets the page draw a frame of its own after the change, before the compare pictures it; the same step ran after each `eval` below and is left out of the transcripts.

**5. The light units.** Divide by the exporter's 683:

```text
eval {"code": "find('sun').intensity /= 683; // the exporter's lux back to Blender's W/m²\nreturn find('sun').intensity"}

2

reference {"cwd": "<project>", "file": "refs/blender.png", "compare": true, "sample": [[640, 30], [640, 230], [450, 430], [740, 450], [930, 450], [330, 505], [200, 700]]}

60% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 5% 4% 0% 2% / 46% 54% 48% 41% / 100% 98% 97% 100% / 75% 89% 99% 98%. Most different: lower-middle left (100%).
Colours (5 × 5 mean): (640, 30): picture #6f6253, page #706456, off by +1 +2 +3; (640, 230): picture #2e2824, page #39302b, off by +7 +7 +7; (450, 430): picture #b0b0b1, page #38322e, off by -120 -126 -131; (740, 450): picture #bf5548, page #ad372e, off by -18 -30 -26; (930, 450): picture #d56c5e, page #e74a3e, off by +18 -34 -32; (330, 505): picture #9f9f9f, page #cccbcb, off by +45 +44 +44; (200, 700): picture #b2b2b2, page #cccbcb, off by +25 +24 +24.
```

The share barely moves, but the samples do: the ground went from white to `#cccbcb` and the box's sunlit face from white to a saturated `#e74a3e`. What is left is the tone curve.

**6. Blender's view transform.**

```text
eval {"code": "renderer.toneMapping = THREE.AgXToneMapping;\nreturn 'AgX'"}

AgX

reference {"cwd": "<project>", "file": "refs/blender.png", "compare": true, "sample": [[640, 30], [640, 230], [450, 430], [740, 450], [930, 450], [330, 505], [200, 700]]}

5% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 0% 0% 0% / 1% 4% 3% 0% / 2% 59% 4% 0% / 0% 0% 0% 0%. Most different: lower-middle centre-left (59%).
Colours (5 × 5 mean): (640, 30): picture #6f6253, page #7a6f61, off by +11 +13 +14; (640, 230): picture #2e2824, page #39302b, off by +11 +8 +7; (450, 430): picture #b0b0b1, page #3c342f, off by -116 -124 -130; (740, 450): picture #bf5548, page #af4e41, off by -16 -7 -7; (930, 450): picture #d56c5e, page #ce6c5c, off by -7 0 -2; (330, 505): picture #9f9f9f, page #b6b6b6, off by +23 +23 +23; (200, 700): picture #b2b2b2, page #b6b5b6, off by +4 +3 +4.
```

From 99% to 5%. The open ground is within 4 levels, and the box's sunlit face within 7. The difference left sits in one region, the one holding the ball.

**7. ACES, the tone mapping most forum answers suggest, against the same render.**

```text
eval {"code": "renderer.toneMapping = THREE.ACESFilmicToneMapping;\nreturn 'ACES'"}

ACES

reference {"cwd": "<project>", "file": "refs/blender.png", "compare": true, "sample": [[640, 30], [640, 230], [450, 430], [740, 450], [930, 450], [330, 505], [200, 700]]}

64% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 16% 9% 3% 4% / 46% 57% 48% 41% / 100% 98% 100% 100% / 100% 100% 100% 100%. Most different: bottom left (100%).
Colours (5 × 5 mean): (640, 30): picture #6f6253, page #766754, off by +7 +5 +1; (640, 230): picture #2e2824, page #241e1a, off by -10 -10 -10; (450, 430): picture #b0b0b1, page #28211d, off by -136 -143 -148; (740, 450): picture #bf5548, page #bb2825, off by -4 -45 -35; (930, 450): picture #d56c5e, page #eb523f, off by +22 -26 -31; (330, 505): picture #9f9f9f, page #cecece, off by +47 +47 +47; (200, 700): picture #b2b2b2, page #cecece, off by +28 +28 +28.
```

ACES is a different curve from AgX: brighter ground, darker soil, a more saturated red. A Blender 4.x render compared with an ACES page differs on 64% of its pixels for that reason alone. (A render from Blender 3.x went through Filmic by default, and three.js has no Filmic tone mapping.)

**8. Split the tone curve from the lighting.** Rendering the scene once more in Blender with the view transform set to Standard (no tone curve) and comparing it with the page on `NoToneMapping` tests the lighting alone:

```text
eval {"code": "renderer.toneMapping = THREE.NoToneMapping;\nreturn 'no tone mapping'"}

no tone mapping

reference {"cwd": "<project>", "file": "refs/blender-standard.png", "compare": true, "sample": [[640, 30], [640, 230], [450, 430], [740, 450], [930, 450], [330, 505], [200, 700]]}

9% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 0% 0% 0% / 1% 4% 16% 0% / 4% 69% 42% 1% / 0% 0% 4% 0%. Most different: lower-middle centre-left (69%).
Colours (5 × 5 mean): (640, 30): picture #706455, page #706456, off by 0 0 +1; (640, 230): picture #352f2b, page #352f2b, off by 0 0 0; (450, 430): picture #c8c8ca, page #38322e, off by -144 -150 -156; (740, 450): picture #cf4e46, page #ad372e, off by -34 -23 -24; (930, 450): picture #ff5b50, page #e74a3e, off by -24 -17 -18; (330, 505): picture #a8a8a8, page #cccbcb, off by +36 +35 +35; (200, 700): picture #cdcdcd, page #cbcaca, off by -2 -3 -3.
```

Without a tone curve on either side, the sky and soil match to within one level and the open ground to within 3. So the sun at 2 and the HDRI at strength 1 light the ground as Cycles does, and the sky's offset of 11 to 14 levels in step 6 comes from the two AgX implementations, not from the lighting.

**9. Shadows.** The glTF file does not say which lights cast shadows, so the page turns them on itself:

```text
eval {"code": "renderer.toneMapping = THREE.AgXToneMapping;\nrenderer.shadowMap.enabled = true;\nconst sun = find('sun');\nsun.castShadow = true;\nsun.shadow.mapSize.set(2048, 2048);\nsun.shadow.normalBias = 0.02;\nObject.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });\nsun.shadow.camera.updateProjectionMatrix();\nscene.traverse((o) => { if (o.isMesh) { o.castShadow = o.name !== 'ground'; o.receiveShadow = true; o.material.needsUpdate = true; } });\nreturn 'shadows on'"}

shadows on

reference {"cwd": "<project>", "file": "refs/blender.png", "compare": true, "sample": [[640, 30], [640, 230], [450, 430], [740, 450], [930, 450], [330, 505], [200, 700]]}

4% of pixels differ by more than 24/255 in a channel at 480 px tall. By region (4 × 4), rows top to bottom and cells left to right: 0% 0% 0% 0% / 1% 4% 3% 0% / 1% 57% 2% 0% / 0% 0% 0% 0%. Most different: lower-middle centre-left (57%).
Colours (5 × 5 mean): (640, 30): picture #6f6253, page #7a6f61, off by +11 +13 +14; (640, 230): picture #2e2824, page #39302b, off by +11 +8 +7; (450, 430): picture #b0b0b1, page #3c342f, off by -116 -124 -130; (740, 450): picture #bf5548, page #af4e41, off by -16 -7 -7; (930, 450): picture #d56c5e, page #ce6c5c, off by -7 0 -2; (330, 505): picture #9f9f9f, page #ababab, off by +12 +12 +12; (200, 700): picture #b2b2b2, page #b6b5b6, off by +4 +3 +4.
```

A last `look` has no Lighting line left. The changes from steps 4, 5, 6 and 9 go into the page's source, after the GLB loads.

## What is still different, and why

The last comparison leaves 4% of pixels apart, and each sample says where:

- **The lower half of the ball** (`#b0b0b1` in the render, `#3c342f` on the page). In the render the chrome reflects the grey ground plane under it and the red box beside it. On the page it reflects the environment map, which is the HDRI's dark soil below the horizon, and no other object. This is the region that stays at 57%. A rasterizer needs a reflection probe (a `CubeCamera` rendering the scene into the ball's `envMap`) or screen-space reflections to come closer.
- **The box's shaded face** (16 levels darker in red with AgX, 34 without any tone mapping). Cycles adds light that the bright ground bounces onto the box; three.js computes no bounces, so the face gets the sun and the environment map alone.
- **The soft dark under the ball** (12 levels lighter on the page). The shadow map darkens where the sun is blocked; Cycles also darkens where the ball hides the sky from the ground. Baked ambient occlusion or an SSAO pass approximates it.
- **The sky, 11 to 14 levels brighter.** Step 8 shows this is the tone curve: three.js's AgX and Blender's are not the same function.

## What paprika3d does not do

It does not run Blender or read a .blend file: the render is a picture made in Blender and saved in the project. It does not change the page: the agent makes each change with `eval` and then in the source. `reference` measures how far two pictures differ at a threshold of 24/255 a channel; it does not say which setting caused a difference, which is why the steps above change one thing at a time. It does not path trace, so a three.js page can come close to a Cycles render in light and colour but not in bounced light and reflections of other objects.

## Pitfalls

- **Tick Cameras and Punctual Lights in the glTF exporter.** Both are off by default; without the camera the page cannot reuse the render's framing, and without the lights the page is lit by whatever it adds.
- **Lighting Mode: Unitless exports a sun's strength as is.** A sun of strength 2 then reads `"intensity": 2` in the file, with no division needed on the page. Standard mode is the glTF specification's physical units, which three.js does not scale back.
- **Set `camera.aspect` from the canvas.** The exported camera's `yfov` is correct for the render's 1.6 aspect; a page of another shape crops it, and `reference` cannot compare pixel by pixel.
- **Shadow acne.** Without `normalBias` the box's sunlit face read `#c36050` in place of `#ce6c5c`, speckled by its own shadow. three.js r186 also warns that `PCFSoftShadowMap` has been removed and uses `PCFShadowMap`.
- **Texture colour space is a separate question.** A colour texture not tagged sRGB washes out whatever the tone mapping; [the colours washed out guide](/guides/threejs-colors-washed-out) covers it.

## Without paprika3d

Save the page's canvas with `renderer.domElement.toDataURL()` right after a render (or with `preserveDrawingBuffer: true`), and lay it over the Blender render in an image editor in difference mode; ImageMagick's `compare -metric AE -fuzz 10%` counts differing pixels from the command line. The three.js editor and the Khronos glTF Sample Viewer open a GLB with an environment and a choice of tone mapping, a quick way to see how much of the gap is the page's setup. In Blender, the Color Management panel under Render Properties shows the view transform the render used.
