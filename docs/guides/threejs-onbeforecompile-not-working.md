---
title: three.js onBeforeCompile not working? Read the shader each material compiled to see which patch it got
phrase: three.js onbeforecompile not working
description: Why a MeshStandardMaterial patch made with onBeforeCompile in three.js r186 can land on one material and not the others (programs are cached by the function's source text, so a value baked into the GLSL is the first material's everywhere), why a patch can do nothing at all (a chunk renamed since the tutorial), and how a coding agent checks both with the paprika3d plugin, reading each mesh's compiled fragment shader with eval, sampling the drawn colours with look, and seeing the page's own error line after a source edit.
meta: three.js onBeforeCompile patch shows on one material, or on none? Read the shader each mesh compiled, then use a uniform and a guard.
intent: onbeforecompile-patch-standard-material
queries:
  - "Chainable onBeforeCompile + Uniforms per Mesh"
  - "Viewing a material's compiled shader code in THREE.js?"
  - "Custom StandardMaterial"
  - "Enabling extension with onBeforeCompile"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js onBeforeCompile not working? Read the shader each material compiled to see which patch it got

## How a patch reaches the GPU, and two ways it does not

three.js assembles `MeshStandardMaterial`'s shaders from chunks, one `#include <name>` line each. `material.onBeforeCompile(shader)` is handed `shader.vertexShader`, `shader.fragmentShader` and `shader.uniforms` just before the program is compiled, and the usual patch is a `String.replace` on one of those include lines. Two things in r186's `WebGLRenderer` explain most of the threads:

1. **Programs are cached by a key worked out before `onBeforeCompile` runs.** Part of the key is `material.customProgramCacheKey()`, which by default returns `onBeforeCompile.toString()`: the function's source text. Materials made by one factory function share that text, so the first one compiled sets the program and the rest reuse it. Their own `onBeforeCompile` still runs, and three keeps the `uniforms` it set, but the GLSL text it built is thrown away. A colour or a number pasted into the GLSL string is the first material's on every material.
2. **`replace` with a target that is not there changes nothing.** The string comes back as it was, the material compiles as a plain `MeshStandardMaterial`, and nothing is logged. Chunk names change between releases: a tutorial that inserts after `#include <output_fragment>` patches nothing in r186, where that chunk is `#include <opaque_fragment>`.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. `eval` runs code on the open page, here reading each mesh's program and the fragment shader source WebGL compiled for it, so a patch that did not land is a string search; `look` with `sample` reads the colours drawn at points; and an error the page logs while loading shows in the next tool reply.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A pottery shelf

Three vases from one `striped(stripe)` factory, meant to have red, blue and yellow bands, and a bust with a blue rim light from an older tutorial.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Pottery shelf</title>
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
scene.background = new THREE.Color(0x2a2c33);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(0, 1.6, 5);
camera.lookAt(0, 0.6, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444044, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(2, 4, 3);
scene.add(sun);

const shelf = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
shelf.name = 'shelf';
shelf.position.y = -0.05;
scene.add(shelf);

// A cream glaze with painted bands of one colour, patched into MeshStandardMaterial.
function striped(stripe) {
  const material = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.5 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vPos;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vPos = position;');
    shader.fragmentShader = 'varying vec3 vPos;\n' + shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n  // stripes\n  if (fract(vPos.y * 5.0) < 0.4) diffuseColor.rgb = vec3(' + stripe.join(', ') + ');');
  };
  return material;
}
const profile = [[0, 0], [0.28, 0], [0.36, 0.3], [0.33, 0.7], [0.2, 1.0], [0.24, 1.2]].map(([x, y]) => new THREE.Vector2(x, y));
const vaseGeometry = new THREE.LatheGeometry(profile, 48);
const glazes = { red: [0.75, 0.16, 0.12], blue: [0.12, 0.3, 0.7], yellow: [0.85, 0.62, 0.1] };
Object.entries(glazes).forEach(([name, stripe], i) => {
  const vase = new THREE.Mesh(vaseGeometry, striped(stripe));
  vase.name = name + '_vase';
  vase.position.set(-1.7 + i * 1.1, 0, 0);
  scene.add(vase);
});

// A bust with a blue rim light, from an older tutorial.
const bustMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.4 });
bustMaterial.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>',
    '#include <output_fragment>\n  // rim light\n  gl_FragColor.rgb += vec3(0.3, 0.6, 1.0) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);');
};
const bust = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 4), bustMaterial);
bust.name = 'bust';
bust.position.set(1.6, 0.45, 0);
scene.add(bust);

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

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader). This guide reads colours and shader source, neither of which depends on the GPU. Run folder paths are shortened to `<project>`, the `eval` code repeated in steps 3 and 5 to `<the same code as step 2>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Open the page and look.** The points sampled are a band on each vase, `(275, 400)`, `(511, 400)` and `(747, 400)`, then the bust's left edge, `(893, 430)`, and its middle, `(985, 430)`.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:33519/index.html in 0.2 s, paused at frame 0.
{"three":"186","scenes":1,"entities":["shelf","red_vase","blue_vase","yellow_vase","bust"]}

look {"sample": [[275, 400], [511, 400], [747, 400], [893, 430], [985, 430]]}

Picture: <project>/paprika3d/runs/2026-10-28T10-50-18-743Z/look-1.png
On screen (5):
shelf 7.6% [94, 489, 1185, 589] 4.6 × 1.2 units, across the view
red_vase 3.5% [195, 270, 356, 542] approximate (a sprite or its own shader: see the picture)
blue_vase 3.3% [434, 270, 588, 542] approximate (a sprite or its own shader: see the picture)
yellow_vase 3.3% [670, 270, 823, 542] approximate (a sprite or its own shader: see the picture)
bust 3% [885, 335, 1086, 527] approximate (a sprite or its own shader: see the picture)
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (275, 400) #d26f5f, (511, 400) #d06b5b, (747, 400) #cc6656, (893, 430) #595959, (985, 430) #8c8c8c.
```

All three vases have red bands (`#d26f5f`, `#d06b5b`, `#cc6656`), and the bust's edge is a darker grey than its middle, with no blue in it. `look` marks a mesh approximate when its material has its own `onBeforeCompile`, since a patch can move vertices where its ID image does not; these patches change colour alone, and the boxes match the picture.

**2. Which program and which patch each mesh drew with.** `renderer.properties` is three's internal state for each material; reading it is fine for a diagnosis and not something game code should depend on.

```text
eval {"code": "const gl = renderer.getContext();\nconst meshes = [];\nscene.traverse(o => {\n  if (!o.isMesh) return;\n  const props = renderer.properties.get(o.material);\n  const src = gl.getShaderSource(props.currentProgram.fragmentShader);\n  const stripe = src.match(/diffuseColor\\.rgb = ([^;]*);/);\n  meshes.push({ name: o.name, program: props.currentProgram.id, patch: stripe ? stripe[1] : src.includes(\"// rim light\") ? \"rim light\" : \"none\", uStripe: props.uniforms.uStripe?.value.toArray() });\n});\nreturn meshes"}

[{"name":"shelf","program":0,"patch":"none"},{"name":"red_vase","program":1,"patch":"vec3(0.75, 0.16, 0.12)"},{"name":"blue_vase","program":1,"patch":"vec3(0.75, 0.16, 0.12)"},{"name":"yellow_vase","program":1,"patch":"vec3(0.75, 0.16, 0.12)"},{"name":"bust","program":2,"patch":"none"}]
```

Both faults are in this reply. The three vases share program 1, and its source has the red band's `vec3(0.75, 0.16, 0.12)`, so the blue and yellow strings never reached the GPU. The bust has a program of its own, and the text `// rim light` is not in it: the patch did not land.

**3. One program, a uniform per material.** The band colour moves out of the GLSL text into a uniform. The program stays shared, which is what three wants, and each material brings its own value:

```js
function striped(stripe) {
  const material = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.5 });
  material.userData.stripe = { value: new THREE.Color(...stripe) }; // this material's own value; the program is shared
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uStripe = material.userData.stripe;
    shader.vertexShader = 'varying vec3 vPos;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vPos = position;');
    shader.fragmentShader = 'uniform vec3 uStripe;\nvarying vec3 vPos;\n' + shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n  // stripes\n  if (fract(vPos.y * 5.0) < 0.4) diffuseColor.rgb = uStripe;');
  };
  return material;
}
```

```text
look {"sample": [[275, 400], [511, 400], [747, 400], [893, 430], [985, 430]]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Picture: <project>/paprika3d/runs/2026-10-28T10-50-18-743Z/look-2.png
Colours (5 × 5 mean, in the page's pixels): (275, 400) #d26f5f, (511, 400) #5f8fc4, (747, 400) #cebc61, (893, 430) #595959, (985, 430) #8c8c8c.

eval {"code": "<the same code as step 2>"}

[{"name":"shelf","program":0,"patch":"none"},{"name":"red_vase","program":1,"patch":"uStripe","uStripe":[0.75,0.16,0.12]},{"name":"blue_vase","program":1,"patch":"uStripe","uStripe":[0.12,0.3,0.7]},{"name":"yellow_vase","program":1,"patch":"uStripe","uStripe":[0.85,0.62,0.1]},{"name":"bust","program":2,"patch":"none"}]
```

The bands read red, blue and yellow (`#d26f5f`, `#5f8fc4`, `#cebc61`), the red one unchanged, and the `eval` shows why: still one program, three uniform values. Setting `material.customProgramCacheKey = () => stripe.join()` would also give three colours, by compiling three programs; keep that for when the GLSL text itself must differ, such as a different loop count, and use a uniform when a value does. Because the uniform object is kept in `userData`, setting `material.userData.stripe.value` later recolours a vase with no recompile.

**4. Make a missing chunk say so.** A small helper replaces the bare `replace` in the bust's patch, and logs an error when the chunk is not in the shader:

```js
// Insert code after a chunk, and say so when the chunk is not there: three renames chunks between releases.
function patch(source, chunk, code) {
  if (!source.includes(chunk)) console.error(`onBeforeCompile: ${chunk} is not in this three.js release; patch skipped`);
  return source.replace(chunk, chunk + '\n' + code);
}
bustMaterial.onBeforeCompile = (shader) => {
  shader.fragmentShader = patch(shader.fragmentShader, '#include <output_fragment>',
    '  // rim light\n  gl_FragColor.rgb += vec3(0.3, 0.6, 1.0) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);');
};
```

```text
look {}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Picture: <project>/paprika3d/runs/2026-10-28T10-50-18-743Z/look-3.png
Page errors since the last call (1):
onBeforeCompile: #include <output_fragment> is not in this three.js release; patch skipped
```

**5. Name the chunk this release has.** The fragment shader of `MeshStandardMaterial` is `THREE.ShaderLib.standard.fragmentShader`, and its include lines are the names a patch can target; in r186 the line that writes `gl_FragColor` is `#include <opaque_fragment>`. With that one name changed:

```text
look {"sample": [[275, 400], [511, 400], [747, 400], [893, 430], [985, 430]]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Picture: <project>/paprika3d/runs/2026-10-28T10-50-18-743Z/look-4.png
Colours (5 × 5 mean, in the page's pixels): (275, 400) #d26f5f, (511, 400) #5f8fc4, (747, 400) #cebc61, (893, 430) #7c90a4, (985, 430) #8c8c8c.

eval {"code": "<the same code as step 2>"}

[{"name":"shelf","program":0,"patch":"none"},{"name":"red_vase","program":1,"patch":"uStripe","uStripe":[0.75,0.16,0.12]},{"name":"blue_vase","program":1,"patch":"uStripe","uStripe":[0.12,0.3,0.7]},{"name":"yellow_vase","program":1,"patch":"uStripe","uStripe":[0.85,0.62,0.1]},{"name":"bust","program":2,"patch":"rim light"}]
```

The bust's edge turns blue, `#595959` to `#7c90a4`, its middle stays `#8c8c8c` (the rim term falls to nothing where the surface faces the camera), and its program now holds the rim light code. The page logged no error on this load, so the helper stayed quiet.

## What paprika3d does not do

- **It does not write or check GLSL.** It shows which source compiled and what colour came out; whether the patch does what was meant is the agent's call.
- **It has no report of patches.** The `eval` in step 2 is code written for this page, reading three's internal `renderer.properties`; paprika3d does not list which materials are patched or where.
- **A missing chunk is silent unless something looks for it.** The source search in step 2 found it, and the helper in step 4 turned it into an error line; without either, the sign is a picture without the effect.
- **A patch that breaks the shader is a different reply.** A GLSL error fails the compile, and the tool reply carries the shader log; the [ShaderMaterial uniform guide](/guides/threejs-shadermaterial-uniform-not-updating) shows that reply.

## Pitfalls

- **Assigning `onBeforeCompile` replaces the patch before it.** To add a patch to a material another module has patched, keep the first and call it: `const before = material.onBeforeCompile; material.onBeforeCompile = (shader, renderer) => { before.call(material, shader, renderer); /* the second patch */ };`. Then set `customProgramCacheKey` to name both patches: the default key is the outer function's text, which is the same for every material wrapped this way.
- **Keep the uniform object, not the shader.** `shader` does not exist until the material has compiled; a uniform object made beforehand and handed to `shader.uniforms`, as in step 3, can be changed from the first frame.
- **Extensions.** r186 draws with WebGL 2, whose shading language has `dFdx`, `fwidth` and `gl_FragDepth` built in, so the `#extension` lines older answers add for them are not needed. `ShaderMaterial.extensions` keeps two switches, `clipCullDistance` and `multiDraw`.
- **Declarations go at the top of the string.** A `uniform` or `varying` prepended to `shader.fragmentShader`, as in step 3, compiles: three adds its own header, the `#version` line included, before the string it is given.

## Without paprika3d

Log `shader.fragmentShader` inside `onBeforeCompile` after the `replace`, and search it for the code you inserted. For the program each mesh drew with, `renderer.properties.get(mesh.material).currentProgram.id` in the browser console after a frame, and `renderer.getContext().getShaderSource(program.fragmentShader)` for the source WebGL compiled. Compile errors are printed to the console while `renderer.debug.checkShaderErrors` is on, as it is by default.
