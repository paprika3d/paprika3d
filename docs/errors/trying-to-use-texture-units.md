---
title: three.js warning Trying to use texture units while this GPU supports fewer: count the samplers
phrase: trying to use texture units while this gpu supports
description: What the three.js warning "THREE.WebGLTextures: Trying to use 33 texture units" means, how WebGLTextures counts the samplers of one material, when going over the limit breaks a draw and when it does not, and how a coding agent sees the warning with the paprika3d plugin's eval reply.
meta: three.js "THREE.WebGLTextures: Trying to use 33 texture units while this GPU supports only 32": what triggers it and how to fix it.
intent: error-texture-units
message: THREE.WebGLTextures: Trying to use 33 texture units while this GPU supports only 32
queries:
  - "Three.js running out of texture units"
  - "THREE.WebGLTextures: Trying to use 33 texture units while this GPU supports only 32"
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# `THREE.WebGLTextures: Trying to use 33 texture units while this GPU supports only 32`

three.js prints this warning while drawing a mesh whose material binds more textures than the GPU reports for one shader stage. Each sampler uniform in the material's shaders takes a texture unit, and three counts them as it uploads the uniforms. The two numbers are the count it reached and the limit it compared against. The usual fix is fewer samplers: pack several textures into one array texture or an atlas.

## Where three.js prints it

`src/renderers/webgl/WebGLTextures.js` (three r186) hands out units one by one, and warns when the next one is past the GPU's limit:

```js
function allocateTextureUnit() {

	const textureUnit = textureUnits;

	if ( textureUnit >= capabilities.maxTextures ) {

		warn( 'WebGLTextures: Trying to use ' + ( textureUnit + 1 ) + ' texture units while this GPU supports only ' + capabilities.maxTextures );

	}

	textureUnits += 1;

	return textureUnit;

}
```

`capabilities.maxTextures` is `gl.getParameter( gl.MAX_TEXTURE_IMAGE_UNITS )`, read in `WebGLCapabilities.js`: the number of samplers the fragment shader may use. The counter starts at zero for each object the renderer draws (`resetTextureUnits` in `setProgram`), and every sampler uniform of the program takes one unit, in the vertex shader as well as the fragment shader. A `sampler2D` array takes one unit per element. The warning appears during `renderer.render`, on the first draw and on each one after.

## Why a material runs out

- **A hand-written splat or layering shader** with one `sampler2D` per layer, the case in the Stack Overflow thread. Ten terrain layers with a colour, normal and roughness map each is already thirty samplers.
- **A built-in material with many maps and many shadowed lights.** Each map of a `MeshStandardMaterial` or `MeshPhysicalMaterial` is a sampler, the environment map is one more, and every light that casts a shadow adds a shadow map sampler.
- **Vertex textures.** A displacement or height map in the vertex shader counts toward the same total, so a fragment shader that is within its limit can still push the count past it.
- **A phone or an integrated GPU.** WebGL 2 promises 16 fragment samplers at least, and many mobile GPUs report exactly that; a material that fits a desktop's 32 can fail there.

What the warning means for the picture depends on which limit is crossed. If a single stage declares more samplers than its own limit, the shader does not compile and three prints a `Shader Error` instead. If each stage is within its limit and the warning fires because the two together exceed the fragment limit, the draw can still be correct, since the GPU's combined limit (`MAX_COMBINED_TEXTURE_IMAGE_UNITS`) is usually higher. Past the combined limit, WebGL rejects the extra units with an error, those textures are not bound, and the draw comes out wrong.

## A page that reproduces it

This terrain samples a height map in the vertex shader and 32 layers in the fragment shader:

```js
const LAYERS = 32;
uniforms: { height: { value: pixel(200) }, layers: { value: layers } },
// vertex:   uniform sampler2D height;
// fragment: uniform sampler2D layers[32]; ... c += texture2D(layers[i], vUv);
```

paprika3d is a Claude Code plugin and MCP server. It opens a three.js page in a headless Chrome that it drives itself, paused at frame 0. The calls below were made with its stable build on 2026-10-28, on a host that has no GPU. Each reply keeps the lines discussed here, word for word, and writes the folder as `<project>`.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:39911/index.html in 0.4 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["terrain"]}

look {"sample":[[640,450]]}

On screen (1):
terrain 21% [224, 283, 1055, 613] 4 × 4 units approximate (a sprite or its own shader: see the picture)
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (640, 450) #7c8380.

eval {"code":"const gl = renderer.getContext(); renderer.render(scene, camera); return [gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS), gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS), gl.getError()]"}

[32,32,64,0]
warn: THREE.WebGLTextures: Trying to use 33 texture units while this GPU supports only 32
```

`open` and `look` say nothing about it: the warning is printed while drawing, and these replies list console errors and set-up warnings, not warnings from a draw. An `eval` that renders a frame itself shows it on its `warn` line. The same call reads the limits: 32 fragment units, 32 vertex units and a combined 64, with no WebGL error after the draw. So on this machine the 33 units fit (32 in one stage, 1 in the other), and the sampled colour at the centre of the terrain is the same as with the fix below. On a GPU with 16 fragment units, the same 32-element array would not compile at all.

## The fix

Put the layers in one `DataArrayTexture` and sample it with a `sampler2DArray`: one unit for every layer, however many there are. The page then uses two units in all:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Terrain</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 5);
camera.lookAt(0, 0, 0);

// the 32 layers in one DataArrayTexture: one texture unit instead of 32
const LAYERS = 32;
const data = new Uint8Array(LAYERS * 4);
for (let i = 0; i < LAYERS; i++) data.set([i * 8, 255 - i * 8, 128, 255], i * 4);
const layers = new THREE.DataArrayTexture(data, 1, 1, LAYERS);
layers.needsUpdate = true;
const height = new THREE.DataTexture(new Uint8Array([200, 55, 128, 255]), 1, 1);
height.needsUpdate = true;

const material = new THREE.ShaderMaterial({
  name: 'splat',
  glslVersion: THREE.GLSL3,
  uniforms: { height: { value: height }, layers: { value: layers } },
  vertexShader: `uniform sampler2D height;
out vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position + normal * texture(height, uv).r * 0.3;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
  fragmentShader: `uniform highp sampler2DArray layers;
in vec2 vUv;
out vec4 colour;
void main() {
  vec4 c = vec4(0.0);
  for (int i = 0; i < ${LAYERS}; i++) c += texture(layers, vec3(vUv, float(i)));
  colour = vec4(c.rgb / float(${LAYERS}), 1.0);
}`
});
const terrain = new THREE.Mesh(new THREE.PlaneGeometry(4, 4, 32, 32), material);
terrain.rotation.x = -Math.PI / 2;
terrain.name = 'terrain';
scene.add(terrain);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The same rendering `eval` comes back with no `warn` line, and `look` reads the same colour at the same point:

```text
look {"sample":[[640,450]]}

On screen (1):
terrain 21% [224, 283, 1055, 613] 4 × 4 units approximate (a sprite or its own shader: see the picture)
Never visible: none
Colours (5 × 5 mean, in the page's pixels): (640, 450) #7c8380.

eval {"code":"renderer.render(scene, camera); return renderer.info.programs.length"}

2
```

All layers of an array texture share one size and format, so textures of different sizes need resizing first, or an atlas instead. For built-in materials, drop maps that add little (a separate metalness map on a material that is all one metal) and limit the lights that cast shadows; `renderer.capabilities.maxTextures` tells the page the limit of the device it runs on.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Three.js running out of texture units](https://stackoverflow.com/questions/34837407/three-js-running-out-of-texture-units) (Stack Overflow, 2,461 views, 2 answers)
