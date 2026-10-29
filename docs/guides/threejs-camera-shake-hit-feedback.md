---
title: three.js camera shake and hit feedback that reads, and the shake that is a bug
phrase: three.js camera shake
description: How to make a hit or an explosion read in a three.js game (camera shake, a flash, a scale pop, particles, debris, a sound and the HUD, on the same frame), why a shake can vanish under the follow camera, and how a world that jitters while walking comes from moving the camera in its own timer, measured with the paprika3d plugin's feel and interact trace.
meta: three.js camera shake and hit feedback: shake, flash, pop, particles and sound measured frame by frame, and the camera jitter that is a bug.
intent: hit-feedback-shake-explosion
queries:
  - "Screen Shake tool"
  - 'Camera Shake or "Much Damage, Such WoW"'
  - "Model Explosion Effect"
  - "Camera target.set(...) causing world shake/jittering"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js camera shake and hit feedback that reads, and the shake that is a bug

## What a hit is made of

A hit reads when several things answer it at once, on the frame of the hit or the few after it: the camera shakes, the thing hit flashes and swells for a moment, particles fly from the contact point, a sound plays, and the HUD changes. An explosion is the same pieces, larger: a harder kick, more particles flying further, debris that spawns and clears, and the object gone. Each piece is a few lines; the faults are in how they meet the rest of the frame.

Camera shake in three.js is an offset added to where the camera should be, and three rules keep it working:

1. **Shake last.** Place the camera first (the follow code, the controls), then add the shake, then render. Code that places the camera after the shake erases it every frame.
2. **Decay by time.** Each kick adds strength, and the strength falls by elapsed time each frame, so the shake fades the same at any frame rate.
3. **Shake from a resting place.** Keep the camera's unshaken position in a variable of its own (a rig) and copy it to the camera each frame, so the follow code never smooths toward a shaken position.

`open` puts `fx.js` in the project, a file of effects made in code with no files to load: `burst` is a pool of particles, `shake` a decaying shake for any object, and `sfx` synthesized sounds.

```js
import { burst, shake, sfx } from './fx.js';
const sparks = burst({ max: 300, seed: 1, size: 0.12 });
scene.add(sparks);
const cam = shake(camera, { seed: 2 });
// on a hit:
sparks.emit(crate.position, { count: 25, speed: 5, color: 0xffcc66, life: 0.4 });
cam.kick(0.08);
sfx.play('hit');
// each frame, after the camera is placed: sparks.update(dt); cam.update(dt);
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `feel` sends the input that causes an event on a fresh reload, then watches the next frames (45 unless `frames` says otherwise) and lists what reacted, each with the frame it came on: the camera's shake and whether it came back, scale pops, colour flashes, a particle pool's count, objects spawned and removed, HUD text changes and the sounds started. `interact` with `trace` reads values from the page's `window.__game.observe()` every frame of the steps, for what happens between pictures.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A crate range

A player who walks left and right with the arrow keys, a crate ahead, and Space to hit it. A hit flashes the crate white, swells it by 15% and eases it back, throws sparks, kicks the camera and plays a sound; the third hit explodes it into eight chunks with a bigger burst and kick. The HUD counts the crate down. The follow camera lives in `rig`; the shake goes on last. `observe()` reports the crate's hit points, the player's place and whether the follow camera moved this frame.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Crate range</title>
<style>html,body{margin:0;height:100%;overflow:hidden;font:16px sans-serif}canvas{display:block}
#hud{position:absolute;top:16px;left:16px;color:#fff;background:#0008;padding:6px 10px;border-radius:4px}</style></head>
<body>
<div id="hud">Crate 3/3</div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { burst, shake, sfx } from './fx.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb4c8);
scene.fog = new THREE.Fog(0x9fb4c8, 15, 40);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(4, 8, 3);
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x6d8f5a }));
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
const player = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.6), new THREE.MeshStandardMaterial({ color: 0x2f6fd0 }));
player.name = 'player';
player.position.y = 0.5;
const crateMat = new THREE.MeshStandardMaterial({ color: 0xa8743a, emissive: 0x000000 });
const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
crate.name = 'crate';
crate.position.set(0, 0.6, -6);
scene.add(ground, player, crate);

// The effects: sparks and debris from fx.js's burst pool, a decaying camera shake, synthesized sounds.
const sparks = burst({ max: 300, seed: 1, size: 0.12 });
sparks.name = 'sparks';
scene.add(sparks);
const rig = new THREE.Vector3(0, 3, 6);   // where the follow camera stands before the shake
const cam = shake(camera, { seed: 2 });
const was = rig.clone();
let moved = false;                         // did the follow camera move this frame
const chunks = [];

const game = { hp: 3, flash: 0, pop: 0 };
const hud = document.getElementById('hud');
function hit() {
  if (game.hp <= 0) return;
  game.hp--;
  hud.textContent = `Crate ${game.hp}/3`;
  if (game.hp > 0) {
    game.flash = 0.1; game.pop = 0.15;                 // white for 0.1 s, a 15% swell that eases back
    sparks.emit(crate.position, { count: 25, speed: 5, color: 0xffcc66, life: 0.4 });
    cam.kick(0.08);
    sfx.play('hit');
  } else {
    crate.visible = false;                             // the explosion: debris, a big burst, a big kick
    sparks.emit(crate.position, { count: 120, speed: 9, color: 0xff7722, life: 0.8 });
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), crateMat);
      c.name = 'chunk';
      c.position.copy(crate.position);
      c.userData.v = new THREE.Vector3((i & 1 ? 1 : -1) * 3, 4 + (i % 3), (i & 2 ? 1 : -1) * 3);
      c.userData.life = 1;
      scene.add(c);
      chunks.push(c);
    }
    cam.kick(0.4);
    sfx.play('explode');
  }
}

const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space' && !e.repeat) hit(); });
addEventListener('keyup', (e) => keys.delete(e.code));

let last = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - (last || t)) / 1000, 0.1);
  last = t;
  player.position.x += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * 4 * dt;

  game.flash = Math.max(0, game.flash - dt);
  crateMat.emissive.setScalar(game.flash > 0 ? 1 : 0);
  game.pop = Math.max(0, game.pop - dt * 0.75);
  crate.scale.setScalar(1 + game.pop);
  for (const c of chunks) {
    c.userData.v.y -= 9.8 * dt;
    c.position.addScaledVector(c.userData.v, dt);
    c.userData.life -= dt;
    if (c.userData.life <= 0 && c.parent) scene.remove(c);
  }
  sparks.update(dt);

  // Follow the player smoothly, frame-rate independent; then place the camera and shake it last.
  rig.lerp(new THREE.Vector3(player.position.x, 3, 6), 1 - Math.exp(-8 * dt));
  moved = !rig.equals(was);
  was.copy(rig);
  camera.position.copy(rig);
  camera.lookAt(rig.x, 0.8, -3);
  cam.update(dt);
  renderer.render(scene, camera);
});

const r = (v) => Math.round(v * 1000) / 1000;
window.__game = {
  subject: 'player',
  describe: () => ({ name: 'crate range', keys: { Space: 'hit the crate', ArrowLeft: 'walk left', ArrowRight: 'walk right' } }),
  observe: () => ({ crate: { hp: game.hp }, player: { x: r(player.position.x) }, camera: { moved } }),
  setState: (s) => {
    if (s.crate?.hp !== undefined) { game.hp = s.crate.hp; hud.textContent = `Crate ${game.hp}/3`; crate.visible = game.hp > 0; }
    if (s.player?.x !== undefined) { player.position.x = s.player.x; rig.x = s.player.x; }
  },
};
</script>
</body></html>
```

The calls below were made on 2026-10-28. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded. The machine had no GPU (Chrome drew with SwiftShader); nothing here depends on frame times, since the harness steps the page's clock 1/60 s a frame.

## One hit, then the explosion

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:42009/index.html in 0.2 s, paused at frame 0.
{"name":"crate range","keys":{"Space":"hit the crate","ArrowLeft":"walk left","ArrowRight":"walk right"}}

feel {"steps": [{"key": "Space"}]}

Watched the steps' 1 frames and 45 frames after them, counted from the first step.
Camera: shook up to 0.068 at frame 6 and came back.
Scale pops (scale changed over 2+ frames and came back): 1 (crate at frame 2).
Smooth moves (a new position on 3+ consecutive frames): 0.
Colour flashes (colour, emissive or a page overlay's opacity changed and came back): 1 (crate at frame 1).
Particles: sparks 0 → 25 at frame 1, 0 left at the end.
No change in: teleports, spawns, removals.
HUD text: changed in one frame.
Sounds started: 1 (hit).
State: crate.hp 3 → 2.
```

Every piece answered: the crate flashed on frame 1 and swelled from frame 2, 25 sparks came on frame 1 and were gone by the end, the camera shook to 0.068 units from its rest and settled, the `hit` sound started and the HUD changed. The `State` line says the hit happened (hit points 3 to 2), so a quiet reply would mean missing feedback, not a missed hit.

The explosion, with the crate set to its last hit point first by a `{ state }` step and 60 frames watched:

```text
feel {"steps": [{"state": {"crate": {"hp": 1}}}, {"key": "Space"}], "frames": 60}

Watched the steps' 1 frames and 60 frames after them, counted from the first step.
Camera: shook up to 0.342 at frame 6 and came back.
Smooth moves (a new position on 3+ consecutive frames): 8 (chunk).
Particles: sparks 0 → 120 at frame 1, 0 left at the end.
Spawned: up to 8 new objects at once, 8 of 8 gone by the end (chunk).
Removed: 1 objects there before the steps are gone.
No change in: scale (no pops), teleports, colour (no flashes).
HUD text: changed in one frame.
Sounds started: 1 (explode).
State: crate.hp 1 → 0.
```

Larger in each part: a shake five times the hit's, 120 sparks, eight chunks flying on smooth paths and all cleared within the watched second, and the crate removed. The `No change in` line names what the explosion lacks next to the hit: no flash and no pop, because the crate is hidden on the frame it explodes. A white flash over the screen (a page overlay whose opacity rises and falls) would show on the `Colour flashes` line, as `feel` watches overlays too.

## Bug 1: the shake never shows

The same page with `cam.update(dt)` moved above the follow code, so the camera is placed after the shake:

```text
feel {"steps": [{"key": "Space"}]}

Watched the steps' 1 frames and 45 frames after them, counted from the first step.
Scale pops (scale changed over 2+ frames and came back): 1 (crate at frame 2).
Smooth moves (a new position on 3+ consecutive frames): 0.
Colour flashes (colour, emissive or a page overlay's opacity changed and came back): 1 (crate at frame 1).
Particles: sparks 0 → 25 at frame 1, 0 left at the end.
No change in: camera (no shake), teleports, spawns, removals.
HUD text: changed in one frame.
Sounds started: 1 (hit).
State: crate.hp 3 → 2.
```

Everything else still answers, and `camera (no shake)` is in the `No change in` line: the kick ran, and the follow code put the camera back before the frame was drawn. A picture taken after the hit cannot show this, since a shake is gone in a few frames either way. Move the shake's update after everything that places the camera, `controls.update()` included.

## Bug 2: the world jitters while walking

The answers in the thread "Camera target.set(...) causing world shake/jittering" point to frame order: set the camera's position and the target, call `controls.update()`, then render, all in the same frame. The same kind of fault, made by moving the player and the camera in a timer of their own, 50 times a second, while the page draws 60 frames a second:

```js
setInterval(() => {
  player.position.x += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * 4 / 50;
  rig.set(player.position.x, 3, 6);
}, 1000 / 50);
```

`trace` on `camera.moved` while walking, first on the crate range, then on this version:

```text
interact {"steps": [{"key": "ArrowRight", "frames": 30}], "trace": ["camera.moved", "player.x"]}

{"changed":{"player":{"x":1.933},"camera":{"moved":true}}}
camera.moved: false until frame 2, then true
player.x: 0 → 1.933 at frame 30; first changed at frame 2

interact {"steps": [{"key": "ArrowRight", "frames": 30}], "trace": ["camera.moved", "player.x"]}

{"changed":{"player":{"x":1.92}}}
camera.moved: false until frame 2, true until frame 6, false until frame 7, true until frame 12, false until frame 13, true until frame 18, false until frame 19, true until frame 24, … (10 changes)
player.x: 0 → 1.92 at frame 29; first changed at frame 2
```

On the crate range the camera moves on every frame once the walk starts. With the timer, five frames move and the sixth stands still, over and over: the timer ran five times in six frames, and on the frame it did not run the camera drew the world where it was. The player stays put on screen, since the camera follows it in the same timer, so the whole world stutters around it. `feel` on the same walk lists `camera (no shake)` under `No change in`: the camera never turns back, it stops, which is a stutter rather than a shake, so the per-frame trace is where it shows.

The fix is to move the player and the camera in the frame loop by the elapsed time, as the crate range does. A game that needs a fixed physics step runs its steps from the frame loop with an accumulator, and draws a position between the last two steps; [three.js physics in a web worker](/guides/threejs-physics-web-worker) covers stepping physics on the page's frames.

## What to read in the replies

- `feel`, `Camera`: how far the camera shook from its rest, on which frame, and whether it came back. `no shake` after a hit means something placed the camera after the shake.
- `feel`, `Scale pops`, `Colour flashes`, `Particles`, `Spawned`, `Removed`: each reaction with its frame. A hit whose pieces land many frames apart reads as late.
- `feel`, `State`: proof the event happened. With it, a missing reaction is missing feedback.
- `interact` with `trace` on a boolean: its runs, frame by frame. A value that should change on every frame and holds for one is a stutter.

## What paprika3d does not do

It measures and does not judge: whether 0.068 units is enough shake for this game is a decision for the request and the person. It counts the sounds started and hears none of them (see [three.js audio not playing](/guides/threejs-audio-not-playing) for reading the audio graph). Effects drawn inside a shader or a post-processing pass are not objects, so `feel` does not see them; it says so for objects drawn by their own shaders, and `look` pictures before and after show them. It does not write the effects; the agent writes them and plays the event again.

## Without paprika3d

Log the camera's position and the hit object's scale, colour and the particle count each frame for a second after the hit, and check that each changes and comes back. Record the screen while walking and step through the video frame by frame: a frame that repeats the one before is the stutter. Tune shake with a keyboard shortcut that kicks it, so its size can be judged on its own.
