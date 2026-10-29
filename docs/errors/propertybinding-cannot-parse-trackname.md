---
title: three.js PropertyBinding: Cannot parse trackName, give the track a property
phrase: cannot parse trackname
description: Why three.js throws "THREE.PropertyBinding: Cannot parse trackName" when an AnimationClip starts, the track name syntax parseTrackName() accepts, the names that fail it (no property, empty brackets), and how the paprika3d plugin's open, look and eval replies show a page stopped by the throw.
meta: How to fix three.js "THREE.PropertyBinding: Cannot parse trackName: fan": what triggers it, the line that prints it, and the fix in code.
intent: error-propertybinding-parse
message: THREE.PropertyBinding: Cannot parse trackName: fan
queries:
  - "Threejs: PropertyBinding: Cannot parse trackName: .bones[].position"
  - "THREE.PropertyBinding: Cannot parse trackName"
author: paprika3d agent
date: 2026-11-11
review: weekly
---
# THREE.PropertyBinding: Cannot parse trackName: fan

Unlike most three.js messages, this one is an exception, not a log line. three throws it when an animation action starts and one of the clip's keyframe tracks has a name that does not follow the `node.property` pattern. Anything after the throw in the same function does not run, so when `play()` sits in a page's setup code, the render loop is never started and the canvas stays blank. The text after `trackName:` is the name as written, here the bare node name `fan` with no property after it.

## Where three.js prints it

`PropertyBinding.parseTrackName()` in `src/animation/PropertyBinding.js` (three r186) matches the name against one regular expression and throws when it does not match:

```js
static parseTrackName( trackName ) {

	const matches = _trackRe.exec( trackName );

	if ( matches === null ) {

		throw new Error( 'THREE.PropertyBinding: Cannot parse trackName: ' + trackName );

	}
```

The expression, built at the top of the same file, reads an optional path of parent names ending in `/` or `:`, an optional node name, an optional object such as `.material` or `.bones[Hips]`, and then a required `.property` with an optional `[index]`. The characters `[`, `]`, `.`, `:` and `/` are reserved for that syntax. A bracketed accessor must hold at least one character. The parse runs when `AnimationMixer` creates the bindings for an action, which happens when the action is first played, not when the `KeyframeTrack` or the `AnimationClip` is constructed. That is why the stack points at `play()`.

## Why the track name does not parse

- **No property at all.** A track named after the object alone, such as `'fan'`, `'door'` or `bone.name`, has nothing for the required `.property` part to match. The name must say what is animated: `fan.rotation[z]`, `door.position`, `Hips.quaternion`.
- **Empty brackets.** A name assembled in code as `.bones[${name}].position` with an empty or missing bone name becomes `.bones[].position`, which the accessor rule rejects. This is the case in the thread that quotes the message.
- **A reserved character as the last thing in the name**, such as a trailing `.` or `/` left by string concatenation.
- **A property path with a dot.** This one is different: `fan.rotation.z` parses, as a node named `fan.rotation` and a property `z`, and then binds to nothing, printing the "No target node found for track" warning instead of this exception.

## A page that reproduces it

A three-bladed fan is meant to make one turn every two seconds, but its track carries the node name and nothing else:

```js
const spin = new THREE.AnimationClip('spin', 2, [
  new THREE.NumberKeyframeTrack(fan.name, [0, 2], [0, Math.PI * 2]), // 'fan': no property
]);
const mixer = new THREE.AnimationMixer(fan);
mixer.clipAction(spin).play(); // throws here, before setAnimationLoop runs
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. These calls ran on 2026-10-28 with the stable build, on a machine with no GPU, with run folder paths shown as `<project>`; lines not discussed were dropped from the replies and none were reworded.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:42179/index.html in 3.1 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["fan"]}
Errors so far:
THREE.PropertyBinding: Cannot parse trackName: fan (index.html:34:7)

look {}

look: the game has not drawn a three.js scene after 5 s of stepping frames; if it is still loading or building, step it with `interact` { steps: [{ wait: frames }] } and look again

observe {}

{"entities":{"fan":{"type":"Group","position":[0,0,0]}},"harness":{"frame":101,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":5,"meshes":3,"lights":1,"cameras":0},"errors":["THREE.PropertyBinding: Cannot parse trackName: fan (index.html:34:7)"],"changed":null}}
```

The uncaught exception reaches `open` as a page error, with the page's own line and column: line 34 of `index.html` is the `play()` call. The scene was built before the throw, so `observe` finds the fan and its three blades, but the renderer has made zero draw calls after 101 frames, because `setAnimationLoop` comes later in the module and never ran. `look` waited for a frame that was never going to come and suggests waiting longer; for this page, the line under `Errors so far` is the one to act on, and waiting changes nothing.

`eval` can try names against the parser without editing the page:

```text
eval {"code": "return [\"fan\", \".bones[].position\", \"fan.rotation.z\", \"Fan Blade.position\"].map(n => { try { THREE.PropertyBinding.parseTrackName(n); return n + \": ok\"; } catch (e) { return e.message; } })"}

["THREE.PropertyBinding: Cannot parse trackName: fan","THREE.PropertyBinding: Cannot parse trackName: .bones[].position","fan.rotation.z: ok","Fan Blade.position: ok"]
```

Spaces are allowed by the parser, so `Fan Blade.position` passes, although three's loaders turn spaces in node names into underscores and such a track would then miss its node.

## The fix

Name the property the track drives. A `NumberKeyframeTrack` writes one number, so it addresses one component of the rotation with an index in brackets; a `VectorKeyframeTrack` on `.rotation` or a `QuaternionKeyframeTrack` on `.quaternion` would write all components at once:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Fan</title>
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
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

const fan = new THREE.Group();
fan.name = 'fan';
for (let i = 0; i < 3; i++) {
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.05), new THREE.MeshStandardMaterial({ color: 0xd0d4dc }));
  blade.geometry.translate(0, 0.7, 0);
  blade.rotation.z = i * Math.PI * 2 / 3;
  blade.position.z = i * 0.01; // apart in depth where the blades cross at the hub
  fan.add(blade);
}
scene.add(fan);

// one turn of the fan every 2 s, on the node's rotation about z
const spin = new THREE.AnimationClip('spin', 2, [
  new THREE.NumberKeyframeTrack(fan.name + '.rotation[z]', [0, 2], [0, Math.PI * 2]),
]);
const mixer = new THREE.AnimationMixer(fan);
mixer.clipAction(spin).play();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  mixer.update(1 / 60);
  renderer.render(scene, camera);
});
</script>
</body></html>
```

The page now opens with no errors and the fan turns:

```text
interact {"steps": [{"wait": 30}]}

{"after":null,"changed":{}}

eval {"code": "return +find(\"fan\").rotation.z.toFixed(3)"}

1.623

observe {}

{"entities":{"fan":{"type":"Group","position":[0,0,0]}},"harness":{"frame":31,"renderer":{"calls":3,"triangles":36,"textures":1,"geometries":3,"programs":2},"scene":{"objects":5,"meshes":3,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

After 31 frames the clock is at 31/60 of a second, and the rotation matches the clip: 31/60 × π is 1.623. The renderer now draws the three blades each frame. For track names built from data, `parseTrackName()` inside a `try` at load time, as in the `eval` above, rejects a bad name with its own message before the clip ever reaches the mixer.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Threejs: PropertyBinding: Cannot parse trackName: .bones().position](https://stackoverflow.com/questions/49033022/threejs-propertybinding-cannot-parse-trackname-bones-position) (Stack Overflow, 896 views, 1 answer)
