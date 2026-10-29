---
title: three.js PropertyBinding: No target node found for track, match the clip to the rig
phrase: no target node found for track
description: What the three.js warning "THREE.PropertyBinding: No target node found for track" means, how AnimationMixer looks up the node a track names, why Mixamo and other clips miss it (prefixes, renamed bones, the wrong mixer root), and how the paprika3d plugin's open, interact and eval replies show the clip doing nothing.
meta: three.js "THREE.PropertyBinding: No target node found for track: mixamorigHips.quaternion": what triggers it and how to fix it.
intent: error-propertybinding-no-target
message: THREE.PropertyBinding: No target node found for track: mixamorigHips.quaternion.
queries:
  - "THREE.PropertyBinding: No target node found for track:"
  - "Mismatch in Mixamo Animation on GLB and FBX"
  - "Error: THREE.PropertyBinding: No target node found for track when applying Mixamo animation to Sketchfab model"
author: paprika3d agent
date: 2026-11-04
review: weekly
---
# THREE.PropertyBinding: No target node found for track: mixamorigHips.quaternion.

three.js prints this warning once per track when an animation clip is started on a model that has no node with the name the track gives. The text after `track:` is the track's full name: the node name before the last dot, the animated property after it. A track without a target is skipped, so a clip whose tracks all miss plays without moving anything, and a clip where some miss moves part of the body while the rest stays in its rest pose.

## Where three.js prints it

`PropertyBinding.bind()` in `src/animation/PropertyBinding.js` (three r186) searches for the node the first time the binding is used, then gives up with a warning:

```js
if ( ! targetObject ) {

	targetObject = PropertyBinding.findNode( this.rootNode, parsedPath.nodeName );

	this.node = targetObject;

}

// set fail state so we can just 'return' on error
this.getValue = this._getValue_unavailable;
this.setValue = this._setValue_unavailable;

// ensure there is a value node
if ( ! targetObject ) {

	warn( 'PropertyBinding: No target node found for track: ' + this.path + '.' );
	return;

}
```

`findNode()` returns the mixer's root itself when the node name is empty or equals the root's `name` or `uuid`. Otherwise it asks the root's skeleton for a bone of that name, if the root is a `SkinnedMesh`, and then walks every descendant comparing `name` and `uuid` exactly. The search starts at the object passed to `new AnimationMixer(root)`, so a node outside that subtree is never found. The binding happens when an action starts, which for `mixer.clipAction(clip).play()` is the `play()` call itself.

## Why the clip names a node the model lacks

- **A different bone prefix.** Mixamo rigs name bones `mixamorig:Hips`, and three's loaders drop the colon with `PropertyBinding.sanitizeNodeName()`, giving `mixamorigHips`. A model rigged elsewhere, or re-exported from Blender, may call the same bone `Hips`, `mixamorig1Hips` or `Armature_Hips`, and a clip from one file then misses every bone of the other.
- **Renamed nodes.** `sanitizeNodeName()` turns spaces into underscores and removes `.`, `:`, `/`, `[` and `]`. Code that renames bones after loading, or a clip whose track names were written by hand with the original spaces, no longer matches.
- **The wrong mixer root.** A mixer built on a child mesh, or on the `gltf` result object rather than `gltf.scene`, searches a subtree that does not hold the bones.
- **Extra tracks for nodes the model never had**, such as finger bones, an `Armature` scale track or a camera. These warnings are harmless, and filtering those tracks out of the clip silences them.

## A page that reproduces it

The page builds a small rig, a group named `robot` holding a `Hips` node with a torso under it, and plays a sway clip written for a rig whose hips are called `mixamorigHips`:

```js
const sway = new THREE.AnimationClip('sway', 2, [
  new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1, 2], [/* -0.3, 0.3, -0.3 rad about z */]),
]);
const mixer = new THREE.AnimationMixer(robot);
mixer.clipAction(sway).play(); // binds now: robot has "Hips", not "mixamorigHips"
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. The calls shown were made on 2026-10-28 with the stable build, on a machine with no GPU; the run folder appears as `<project>`, and each reply keeps the lines discussed, unchanged.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:42663/index.html in 0.2 s, paused at frame 0.
three.js warned: THREE.PropertyBinding: No target node found for track: mixamorigHips.quaternion.
{"three":"186","scenes":1,"entities":["robot"]}

interact {"steps": [{"wait": 60}]}

{"after":null,"changed":{}}

eval {"code": "const names = []; find(\"robot\").traverse(o => names.push(o.name)); return { names, hipsZ: +find(\"Hips\").rotation.z.toFixed(3) }"}

{"names":["robot","Hips","torso"],"hipsZ":0}

observe {}

{"entities":{"robot":{"type":"Group","position":[0,0,0]}},"harness":{"frame":61,"renderer":{"calls":1,"triangles":12,"textures":1,"geometries":1,"programs":2},"scene":{"objects":4,"meshes":1,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

`play()` runs during setup, so `open` reports the warning as a `three.js warned:` line. `interact` with a `wait` step lets 60 frames pass on the paused clock, a full second of the clip. The `eval` then lists every name under the mixer root next to the track's node name, which makes the mismatch plain, and reads the hips' rotation: still 0 after a second of a clip that should have tilted them by 0.3 radians. `observe` shows an empty `errors` list, because three logged a warning, not an error; after `open`, no reply mentions it again. The replies do not say which file the clip came from or which rig it was made for; that has to come from the code that loaded it.

## The fix

Rename the tracks to the model's bone names before the mixer binds them, and check for tracks that still have no node. For a Mixamo clip on a rig without the prefix, removing `mixamorig` is enough; a rig with other names needs a lookup table, or `SkeletonUtils.retargetClip()` from the addons when the two skeletons differ in more than names.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Robot</title>
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
camera.position.set(0, 1.2, 5);
camera.lookAt(0, 1, 0);

// the model's rig: node names as the model file has them
const robot = new THREE.Group();
robot.name = 'robot';
const hips = new THREE.Object3D();
hips.name = 'Hips';
hips.position.y = 1;
const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x66aadd }));
torso.name = 'torso';
torso.position.y = 0.6;
hips.add(torso);
robot.add(hips);
scene.add(robot);

// a sway clip from another file, whose rig called the same node "mixamorigHips"
const sway = new THREE.AnimationClip('sway', 2, [
  new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1, 2], [
    ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.3).toArray(),
    ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.3).toArray(),
    ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.3).toArray(),
  ]),
]);
// rename each track's node to the model's name before the mixer binds it
for (const track of sway.tracks) track.name = track.name.replace(/^mixamorig/, '');
const missing = sway.tracks.filter(t => !robot.getObjectByName(THREE.PropertyBinding.parseTrackName(t.name).nodeName));
if (missing.length) console.warn('sway: no node for', missing.map(t => t.name).join(', '));
const mixer = new THREE.AnimationMixer(robot);
mixer.clipAction(sway).play();

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

With the names matched, `open` prints no `three.js warned:` line, and the same calls show the hips moving:

```text
look {}

On screen (1):
torso 3.1% [571, 172, 771, 421]
Never visible: none

interact {"steps": [{"wait": 60}]}

{"after":null,"changed":{}}

eval {"code": "const names = []; find(\"robot\").traverse(o => names.push(o.name)); return { names, hipsZ: +find(\"Hips\").rotation.z.toFixed(3) }"}

{"names":["robot","Hips","torso"],"hipsZ":0.29}

look {}

On screen (1):
torso 3.1% [508, 172, 708, 421]
Never visible: none
```

At one second the clip is at its middle key, 0.3 radians, and the hips read 0.29 because the 61st frame lands a little past it on the way back. The second `look` shows the torso's screen box moved left of where the first `look` found it, as the torso leans the other way. The check in the fixed page prints its own warning naming any track that still has no node, which helps when a clip from a new source arrives with a few bones named differently.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Mismatch in Mixamo Animation on GLB and FBX](https://discourse.threejs.org/t/mismatch-in-mixamo-animation-on-glb-and-fbx/59981) (discourse.threejs.org, 1,568 views, 6 posts)
- [THREE.PropertyBinding: No target node found for track:](https://discourse.threejs.org/t/three-propertybinding-no-target-node-found-for-track/70245) (discourse.threejs.org, 1,081 views, 3 posts)
- [Error: "THREE.PropertyBinding: No target node found for track" when applying Mixamo animation to Sketchfab model](https://discourse.threejs.org/t/error-three-propertybinding-no-target-node-found-for-track-when-applying-mixamo-animation-to-sketchfab-model/70898) (discourse.threejs.org, 820 views, 1 post)
