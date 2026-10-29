---
title: Build a three.js game with an AI agent, and check what it made before you trust it
phrase: build a three.js game with an ai agent
description: What changes when a coding agent that builds a three.js game can open, see, play and measure it, with the paprika3d plugin for Claude Code: the measured results, what the skill and hooks have the agent check, a game whose rule passes while its pickup has no reaction until feel says so, and what the plugin does not judge.
meta: Build a three.js game with an AI agent like Claude Code, then check what it made: the model on screen, the controls and the feel, with the paprika3d tools.
intent: ai-agent-threejs-game
queries:
  - "Using ChatGPT AI and Three.JS to Help Code 3D Games"
  - "Three.js AI code generator"
  - "Vibe codding... I don't get it!"
  - "AI - trustworthy or not?"
  - "Providing a `llms.txt` file for better AI support."
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# Build a three.js game with an AI agent, and check what it made before you trust it

## Where AI-written three.js games go wrong

A coding agent writes three.js code that runs. Where it goes wrong is in what nobody looked at: a model that loaded at the wrong scale, a Draco-compressed model that never loaded, a scene too dark to read, a pickup that adds to the score with nothing on screen to say so. The code has no error, the agent reports the work as done, and the person finds the problem on first play. The agent could not have seen it: the game is a canvas, and the agent reads text.

paprika3d is a Claude Code plugin and MCP server that gives the agent its own headless Chrome to open the page in, on a paused, seeded clock. With it, the agent sees the page (`look`: the picture, the objects on screen, the ones that never appear), plays it (`interact`: keys and clicks on exact frames, the state after), checks how an event reacts (`feel`), and measures it (`eval`, `perf`). A skill, `threejs-game`, loads by itself for any three.js page and tells the agent what each tool shows; hooks rerun its saved checks after edits.

## What it changes, measured

On paprika3d's own benchmarks of Claude Sonnet 5.5 building three.js pages that each load a glTF model, the model was left at the wrong scale or not loaded in 10 of 11 runs without the plugin and 2 of 11 runs with it. A Draco-compressed model never loaded in 3 of 3 runs without the plugin and in 0 of 3 runs with it. Game logic was right in every arm on those tasks: the gain is in what looking at the page shows and a test of the code does not.

The agent has to use the tools for any of this to happen. With the tools installed and no reminder, the agent opened its page in 0 of 6 runs; the plugin now says once per session when a page the agent wrote has not been opened. These are small samples, a few runs per task with one model. On paprika3d's own benchmark, 3JSBench (150 runs per arm and model, 2026-10-23), with Sonnet 5.5 a run with the plugin cost 1.9 times the dollars and 3.3 times the minutes of a run without it, since the agent spends turns looking at what it built; with Opus 5.5 it cost 1.2 times the dollars in about the same time. The front page of the docs site lists the current results.

## Install and ask

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

Then ask for the game in your own words; the skill loads when the agent works on a three.js page. `/paprika3d:paprika-make <request>` first asks a few questions, one at a time, for a short brief (what it is, what it must have, pictures to work from), writes it to `BRIEF.md`, and builds from it. `/paprika3d:paprika-loop <request> for <time>` builds from the same brief unattended, with a builder session and a read-only judge session each round, each billed as a Claude Code session. Other coding agents get the method from the plugin's `AGENTS.md` and the skill's `SKILL.md`; the slash commands, automatic skill loading and hooks are Claude Code's.

For an agent that reads documentation, the docs site serves `/llms.txt`, and each page as Markdown at the same address with `.md`.

## One check the agent makes, end to end

A small game an agent might write for "a runner that collects gems": the player slides along a lane with the arrow keys, and touching the gem adds one to the HUD's count and hides the gem. It follows the `window.__game` convention the skill asks for, so its state can be read.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Gem lane</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}#score{position:fixed;top:16px;left:20px;font:600 22px system-ui;color:#fff}</style></head>
<body>
<div id="score">Gems: 0</div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

const SPEED = 3;                 // units per second
const held = new Set();
let x = 0, gems = 0, taken = false;
const GEM_X = 4;

function act({ key, down = true }) { if (down) held.add(key); else held.delete(key); }
addEventListener('keydown', e => act({ key: e.key }));
addEventListener('keyup', e => act({ key: e.key, down: false }));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x161a2a);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 3, 8);
camera.lookAt(2, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x303050, 2.5));
const lane = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 2), new THREE.MeshStandardMaterial({ color: 0x3a4060 }));
lane.name = 'lane';
lane.position.set(2, -0.6, 0);
scene.add(lane);
const player = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x50d0ff }));
player.name = 'player';
scene.add(player);
const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: 0xff50c0 }));
gem.name = 'gem';
gem.position.x = GEM_X;
scene.add(gem);
const hud = document.getElementById('score');

function step(dt) {
  x += ((held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)) * SPEED * dt;
  if (!taken && Math.abs(x - GEM_X) < 0.6) {
    taken = true;
    gems++;
    gem.visible = false;
    hud.textContent = `Gems: ${gems}`;
  }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
let last = null;
renderer.setAnimationLoop((now) => {
  step(last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1));
  last = now;
  player.position.x = x;
  gem.rotation.y = now / 500;
  renderer.render(scene, camera);
});

window.__game = {
  describe: () => ({ name: 'gem lane', units: 'world units', keys: { ArrowRight: 'hold to move right', ArrowLeft: 'hold to move left' } }),
  observe: () => ({ x: +x.toFixed(3), gems, taken }),
  act,
  setState: (s) => { ({ x = x, gems = gems, taken = taken } = s); },
  subject: player,
};
</script>
</body></html>
```

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); none of them depends on frame times. Run folder paths are shortened to `<project>`.

**1. Open it and look.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:35031/index.html in 0.1 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
Page text outside the canvas: 0 h1, 0 h2, 2 words
{"name":"gem lane","units":"world units","keys":{"ArrowRight":"hold to move right","ArrowLeft":"hold to move left"}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T05-54-43-094Z
```

(The reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out here.)

```text
look {}

Picture: <project>/paprika3d/runs/2026-10-28T05-54-43-094Z/look-1.png
Pixels: brightness 12%, colour saturation 49%, 0% near black, 0% blown out. Dark: a viewer sees little.
Hues: blue 96% of the frame; over the objects (13.4% of it): blue 69%, grey 20%, cyan 9%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
HTML over the canvas: 1 (div via page), 0 overlap, 0 off-screen, 0 cut off: div#score "Gems: 0" [20, 16, 111, 40].
Subject: player takes 1.2% of the picture [351, 343, 468, 459]; 1 of its 1 named parts show.
Stands out: subject brightness 55% against 13% around it, colour 69% against 51%, edge contrast 0.296.
This camera shows little of the subject: try other views with `look` camera, then move the page's own camera to the best (said once).
On screen (3):
lane 12% [20, 412, 1259, 523] 10 × 2 units, across the view
player 1.2% [351, 343, 468, 459]
gem 0.26% [836, 363, 897, 435]
Never visible: none
```

The gem and the player are on screen and the HUD reads `Gems: 0`. The reply also says the picture is dark and the camera shows little of the player: two notes a person would make on first sight, given to the agent as text.

**2. Play the rule.** Set the player beside the gem and hold the key for 20 frames:

```text
interact {"steps": [{"state": {"x": 2.5}}, {"key": "ArrowRight", "frames": 20}], "expect": {"gems": 1}}

{"changed":{"x":3.5,"gems":1,"taken":true}}
Expect: gems 1 ✓
```

The rule works. A test of the code would stop here.

**3. Ask how the pickup feels.** `feel` replays the same steps on a fresh reload and watches the frames after them for what reacted on screen:

```text
feel {"steps": [{"state": {"x": 2.5}}, {"key": "ArrowRight", "frames": 20}]}

Watched the steps' 20 frames and 45 frames after them, counted from the first step.
Moved during the steps: player 1 units.
Smooth moves (a new position on 3+ consecutive frames): 1 (player).
Removed: 1 objects there before the steps are gone.
No change in: camera (no shake), scale (no pops), teleports, colour (no flashes), spawns.
HUD text: changed in one frame.
Sounds started: 0.
State: x 2.5 → 3.5, gems 0 → 1, taken false → true.
```

The gem vanished and the number changed, and nothing else: no pop, no flash, nothing spawned, no sound. The pickup is correct and gives the player nothing to feel.

**4. Add a reaction and ask again.** A quarter-second pop and glow on the player at the pickup:

```diff
-let x = 0, gems = 0, taken = false;
+let x = 0, gems = 0, taken = false, pop = 0;
     hud.textContent = `Gems: ${gems}`;
+    pop = 0.25;                  // seconds of reaction left
   }
+  if (pop > 0) pop = Math.max(0, pop - dt);
+  const k = pop / 0.25;          // 1 at the pickup, 0 when it is over
+  player.scale.setScalar(1 + 0.5 * k);
+  player.material.emissive.setRGB(k, k, k);
 }
```

```text
feel {"steps": [{"state": {"x": 2.5}}, {"key": "ArrowRight", "frames": 20}]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.1 s).
Watched the steps' 20 frames and 45 frames after them, counted from the first step.
Moved during the steps: player 1 units.
Scale pops (scale changed over 2+ frames and came back): 1 (player at frame 19).
Smooth moves (a new position on 3+ consecutive frames): 1 (player).
Colour flashes (colour, emissive or a page overlay's opacity changed and came back): 1 (player at frame 19).
Removed: 1 objects there before the steps are gone.
No change in: camera (no shake), teleports, spawns.
HUD text: changed in one frame.
Sounds started: 0.
State: x 2.5 → 3.5, gems 0 → 1, taken false → true.
```

A scale pop and a colour flash on the player, on frame 19, the frame of the pickup. The agent can now say the pickup reacts, with the reply to show for it.

## What runs without being asked

- **After each batch of edits**, a hook reruns the checks saved with `interact`'s `save` and rechecks the page's lighting and surface lines, and speaks when one starts or stops failing. Once per session it says that a three.js page the agent wrote has not been opened.
- **On the first stop** of a session that opened a game, a hook states once, as facts, the edits that were never played or looked at and the faults still open. It asks for nothing; the agent decides.

## What it does not judge

- It does not decide whether the game is fun or matches your taste. It reports what is on screen, what the state did and what reacted; whether that is the game you wanted is yours to say.
- It checks what the agent asks it to check. An event nobody plays is an event nobody tested, which is why the stop hook lists edits that were never played.
- It does not replace reading the code. A per-frame mover, a secret in the page or a licence on a model are things to read, not to see.
- Frame times on a machine with no GPU say nothing about a player's machine, and every reply that times a frame says when it was measured that way.

## Without paprika3d

The same habits help any agent. Ask it to put the game's state in plain variables behind a small `window.__game` object, so a script can read it. Give it a way to run and see the page: a browser automation script that opens the page, waits for frames, takes a screenshot and reads `window.__game.observe()`, which the agent can run after each change. Ask it to name every mesh, and to state each rule as a check it can rerun. Give it the three.js version's own documentation, since import paths and APIs change between releases and an agent's memory of them may be out of date.
