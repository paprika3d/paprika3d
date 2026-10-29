---
title: three.js PointerLockControls: Unable to use Pointer Lock API, lock on a click
phrase: unable to use pointer lock api
description: Why three.js PointerLockControls prints "THREE.PointerLockControls: Unable to use Pointer Lock API", the pointerlockerror listener behind it, the browser rules that refuse a lock (a missing user gesture above all), and the paprika3d plugin's open, interact and eval replies before and after moving lock() into a click.
meta: How to fix three.js "THREE.PointerLockControls: Unable to use Pointer Lock API": what triggers it, the line that prints it, and the fix in code.
intent: error-pointer-lock-api
message: THREE.PointerLockControls: Unable to use Pointer Lock API
queries:
  - "Unable to use Pointer Lock API"
  - "THREE.PointerLockControls: Unable to use Pointer Lock API"
  - "How to activate/deactivate PointerLockControls?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.PointerLockControls: Unable to use Pointer Lock API

`PointerLockControls` prints this console error when the browser refuses to capture the mouse. The message comes from the addon, but the decision is the browser's: three asked for a lock with `requestPointerLock()`, and the document answered with a `pointerlockerror` event. Mouse look stays off, `controls.isLocked` stays false, and the camera does not turn when the mouse moves.

## Where three.js prints it

`examples/jsm/controls/PointerLockControls.js` (three r186) listens on the document when the controls connect, and the error handler is one line:

```js
connect( element ) {

	super.connect( element );

	this.domElement.ownerDocument.addEventListener( 'mousemove', this._onMouseMove );
	this.domElement.ownerDocument.addEventListener( 'pointerlockchange', this._onPointerlockChange );
	this.domElement.ownerDocument.addEventListener( 'pointerlockerror', this._onPointerlockError );

}

// ...

function onPointerlockError() {

	console.error( 'THREE.PointerLockControls: Unable to use Pointer Lock API' );

}
```

`lock()` calls `this.domElement.requestPointerLock( { unadjustedMovement } )` and nothing else, so the addon never knows why the request failed. The message does not mean the browser lacks the API; Chrome, Firefox and desktop Safari all have it. In Chrome, `requestPointerLock()` also returns a promise, and its rejection carries the reason, which is the line to read next to three's.

## Why the browser refuses the lock

- **No user gesture.** Calling `controls.lock()` on page load, or from a timer, a loader callback or the animation loop that no click or key press started, is refused. The lock has to be requested inside a click or another input handler. This is the cause in most threads.
- **Asking again right after Esc.** When the player leaves the lock with Esc, Chrome refuses a new request for a short time, so a game that relocks the moment it sees `unlock` gets the error.
- **An iframe without permission.** A game embedded in a sandboxed iframe needs `allow-pointer-lock` in its `sandbox` attribute; editors and site builders often leave it out.
- **Raw mouse input the platform cannot give.** `lock(true)` asks for `unadjustedMovement`, which some systems refuse with a `NotSupportedError`.
- **A touch device.** iOS and iPadOS browsers expose no pointer lock for touch, so a first-person page needs touch controls there.

## A page that reproduces it

The page below builds a floor and a pillar for a first-person walk and calls `lock()` as soon as the controls exist:

```js
const controls = new PointerLockControls(camera, renderer.domElement);
controls.lock(); // asked for on load, before any click
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. The calls in this section ran on 2026-10-28 with the stable build, on a machine with no GPU; the run folder is shortened to `<project>` and the replies are trimmed to the lines discussed below without rewording.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:44039/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["floor","pillar"]}
Errors so far:
THREE.PointerLockControls: Unable to use Pointer Lock API
NotAllowedError: A user gesture is required to request Pointer Lock.

eval {"code": "return [document.pointerLockElement === null]"}

[true]
```

Headless Chrome applies the same activation rule as a desktop window, so the refusal happens during setup and `open` lists two errors. The first is three's. The second is the rejected promise from `requestPointerLock()`, and it names the reason: no user gesture. The `eval` confirms that nothing holds the lock. `observe` repeats both lines under `harness.errors`. These replies come from one cause; a refusal inside an iframe or after Esc prints three's line with a different second line, and the reason text is Chrome's, so Firefox words it differently.

## The fix

Request the lock from a click on the canvas, and listen for `lock` and `unlock` to show or hide a "click to play" overlay. The page below sets the document title instead, which keeps it short:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Walk</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb8de);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 2));
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 1.6, 5);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x557744 }));
floor.rotation.x = -Math.PI / 2;
floor.name = 'floor';
scene.add(floor);
const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshStandardMaterial({ color: 0xcc8844 }));
pillar.position.set(0, 1.5, 0);
pillar.name = 'pillar';
scene.add(pillar);

const controls = new PointerLockControls(camera, renderer.domElement);
renderer.domElement.addEventListener('click', () => controls.lock()); // inside the click's user gesture
controls.addEventListener('lock', () => { document.title = 'Walk (locked)'; });
controls.addEventListener('unlock', () => { document.title = 'Walk'; });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

The page now opens without errors. `interact` clicks the canvas, which counts as a user gesture, and a relative mouse move then turns the camera:

```text
interact {"steps": [{"mouse": "click", "x": 640, "y": 400, "frames": 2}]}

{"after":null,"changed":{}}
mouse click at (640, 400): over pillar (Mesh, 4.5 units)

eval {"code": "return { locked: document.pointerLockElement === renderer.domElement, title: document.title }"}

{"locked":true,"title":"Walk (locked)"}

interact {"steps": [{"mouse": "move", "relative": [200, 0], "frames": 2}]}

{"after":null,"changed":{}}

eval {"code": "return camera.rotation.y.toFixed(3)"}

-0.400
```

The lock belongs to the canvas, the `lock` event ran, and 200 pixels of sideways movement turned the camera by 0.4 radians, which is `PointerLockControls`' default sensitivity of 0.002 per pixel. `changed` stays empty because no named object moved; the camera is not one of the page's entities. In a real game, also keep the click handler from relocking on the same frame the `unlock` event fires, so a player who pressed Esc to reach a menu is not pulled back in.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Unable to use Pointer Lock API](https://discourse.threejs.org/t/unable-to-use-pointer-lock-api/11092) (discourse.threejs.org, 5,164 views, 5 posts)
- [THREE.PointerLockControls: Unable to use Pointer Lock API](https://discourse.threejs.org/t/three-pointerlockcontrols-unable-to-use-pointer-lock-api/18321) (discourse.threejs.org, 4,378 views, 8 posts)
- [How to activate/deactivate PointerLockControls?](https://discourse.threejs.org/t/how-to-activate-deactivate-pointerlockcontrols/33618) (discourse.threejs.org, 2,703 views, 4 posts)
- [Pointer Lock Controls and iPad](https://discourse.threejs.org/t/pointer-lock-controls-and-ipad/17898) (discourse.threejs.org, 1,659 views, 5 posts)
- [Pointer lock controls error unlocking](https://github.com/mrdoob/three.js/issues/20329) (GitHub, 8 comments)
