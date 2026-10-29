---
title: three.js Material is not a property of THREE.ShaderMaterial: a constructor option the class does not have
phrase: is not a property of three
description: What three.js means by "THREE.Material: 'map' is not a property of THREE.ShaderMaterial." and the same warning for any option and material class, the check in Material.setValues() that drops the value, the usual causes (uniforms for ShaderMaterial, an option from another material, a typo, a removed property) and the paprika3d open reply that lists it.
meta: How to fix three.js "THREE.Material: 'map' is not a property of THREE.ShaderMaterial": what triggers it, the line that prints it, and the fix in code.
intent: error-material-not-a-property
message: THREE.Material: 'map' is not a property of THREE.ShaderMaterial.
queries:
  - "THREE.Material: 'map' is not a property of THREE.ShaderMaterial."
  - "(SOLVED) How do we use map uniform with custom ShaderMaterial?"
  - "r72: messed up OBJMTL loader"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.Material: 'map' is not a property of THREE.ShaderMaterial.

three.js prints this warning when a material is created, or given values through `setValues()`, with an option its class does not define. The quoted word is the option and the class name follows, so the same check would print `'roughness' is not a property of THREE.MeshBasicMaterial.` or `'colour' is not a property of THREE.MeshStandardMaterial.` three skips the option and builds the material without it, so the page runs and something is missing: a texture that never shows, a colour that stays white, a setting with no effect.

## Where three.js prints it

`setValues()` in `src/materials/Material.js` (three r186) copies each key of the object passed to it onto the material. Every built-in material class calls it from its constructor (`this.setValues( parameters )`), after it has given its own properties their defaults, so a key the class never declared reads as `undefined`:

```js
for ( const key in values ) {

	const newValue = values[ key ];

	if ( newValue === undefined ) {

		warn( `Material: parameter '${ key }' has value of undefined.` );
		continue;

	}

	const currentValue = this[ key ];

	if ( currentValue === undefined ) {

		warn( `Material: '${ key }' is not a property of THREE.${ this.type }.` );
		continue;

	}
```

`warn()` is three's logger in `src/utils.js`; it adds `THREE.` and calls `console.warn`. The `continue` is the part that matters: the value is not stored anywhere. The first branch is the sibling warning, `parameter 'map' has value of undefined.`, printed when the key exists but its value is `undefined`, usually a texture variable read before it was set. Assigning a property after construction (`material.foo = 1`) goes around `setValues()` and prints nothing, whether or not the class uses it.

## Why the option is not a property

- **ShaderMaterial options that belong in uniforms.** `ShaderMaterial` has no `map`, `color` or `opacity` of its own: the shader reads what is in `uniforms`. Passing `map: texture` next to `vertexShader` and `fragmentShader` prints this warning, and the `sampler2D` in the shader gets nothing. This is the case in the long thread about using a map uniform with a custom ShaderMaterial.
- **An option from another material class.** `roughness` and `metalness` exist on `MeshStandardMaterial` and `MeshPhysicalMaterial`, `shininess` and `specular` on `MeshPhongMaterial`, and `emissive` is missing from `MeshBasicMaterial`. Switching a material's class while keeping its options prints one line for each that does not carry over.
- **A spelling mistake.** `colour`, `transparant` and `wireFrame` are each dropped with this line, while the property meant (`color`, `transparent`, `wireframe`) keeps its default.
- **Properties removed in an upgrade.** Code written for an older release may pass `skinning: true` or `morphTargets: true`, which r186 materials no longer declare; three works those out from the mesh. Loaders that build materials from a file (the OBJ/MTL thread) print the same line when they pass a key the material lacks.

## A page that reproduces it

A card drawn with a custom shader, its texture passed as a material option:

```js
const material = new THREE.ShaderMaterial({
  map: tex, // a material property, not a uniform
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
});
const card = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
card.name = 'card';
scene.add(card);
```

paprika3d is a Claude Code plugin and MCP server: it opens a three.js page in its own headless Chrome and keeps it paused until a tool steps it. The replies were recorded with the stable build on 2026-10-28 on a machine with no GPU; `<project>` stands for the run folder, and each reply shows the lines discussed here exactly as printed.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:32997/index.html in 0.8 s, paused at frame 0.
three.js warned: THREE.Material: 'map' is not a property of THREE.ShaderMaterial.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["card"]}

eval {"code":"const m = find(\"card\").material; return { uniforms: Object.keys(m.uniforms), map: m.map }"}

{"uniforms":[]}

look {}

Pixels: brightness 22%, colour saturation 25%, 0% near black, 10% blown out.
Hues: blue 90%, grey 10% of the frame; over the objects (10.2% of it): grey 100%.
On screen (1):
card 10% [466, 233, 813, 548] 2 × 2 units approximate (a sprite or its own shader: see the picture)
```

This warning comes from a constructor, so it is printed while the page sets up, and `open` lists it under `three.js warned:` before anything is drawn. A warning printed later, at the first frame, would not be in `open`'s reply, and `look` does not list warnings at all.

The `eval` confirms what the warning means: the material has no uniforms, and `map` is missing from the returned object because its value is `undefined` (JSON leaves such keys out). `look` sees the card as plain light grey, partly blown out, where the texture's orange and blue squares should be: the shader samples a texture unit with nothing bound. Its `approximate` note is about the size, which it cannot measure exactly for a mesh with its own shader.

## The fix

Put the texture in `uniforms`, under the same name as the `uniform sampler2D` in the shader, and read it as `material.uniforms.map.value` from then on:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Card</title>
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
camera.position.set(0, 1.5, 5);
camera.lookAt(0, 0, 0);

const tex = new THREE.DataTexture(new Uint8Array([255, 120, 40, 255, 40, 90, 200, 255, 40, 90, 200, 255, 255, 120, 40, 255]), 2, 2);
tex.colorSpace = THREE.SRGBColorSpace;
tex.needsUpdate = true;

// a ShaderMaterial reads its textures from uniforms
const material = new THREE.ShaderMaterial({
  uniforms: { map: { value: tex } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
});
const card = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
card.name = 'card';
scene.add(card);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The fixed page's replies:

```text
open {"url":"fixed.html","cwd":"<project>"}

Opened http://127.0.0.1:46865/fixed.html in 0.8 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["card"]}

look {}

Hues: blue 95%, red 5% of the frame; over the objects (10.2% of it): red 50%, blue 50%.
```

There is no `three.js warned:` line, and the card shows the two colours of its texture. For the other causes, the class name in the message tells you where to look: open the documentation page of that class, check that the option is listed, and either rename it or move to the class that has it.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [(SOLVED) How do we use map uniform with custom ShaderMaterial?](https://discourse.threejs.org/t/solved-how-do-we-use-map-uniform-with-custom-shadermaterial/1919) (discourse.threejs.org, 15,331 views, 23 posts)
- [r72: messed up OBJMTL loader ](https://github.com/mrdoob/three.js/issues/7252) (GitHub, 28 comments)
