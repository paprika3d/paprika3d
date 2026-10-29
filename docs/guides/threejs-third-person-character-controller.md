---
title: three.js third person character controller with Rapier, checked frame by frame on slopes, stairs and a long fall
phrase: three.js third person character controller
description: A third person character in three.js and React Three Fiber on Rapier's kinematic character controller, with gravity in code, a slope limit, steps, snap to ground and a follow camera; and how a coding agent with the paprika3d plugin measures the jump height and airtime with an interact trace, sees a held key climb a ramp or stop at a steep slope, and finds the landing frame of a long fall with until.
meta: three.js third person character controller on Rapier: jump, slopes, stairs and a follow camera, each measured in frames with paprika3d's interact.
intent: third-person-character-controller
queries:
  - "Third person character controller"
  - "R3F & Rapier third person controller and follow camera"
  - "Character Controller"
  - "Third person controller with keyboard + joystick (No mouse)"
  - "Where can man find the Character Controller for THREE.js ?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js third person character controller with Rapier, checked frame by frame on slopes, stairs and a long fall

## The controller is Rapier's, the rules are yours

three.js has no character controller of its own: it draws, and the walking, jumping and colliding come from a physics library. Rapier, through `@react-three/rapier` in React Three Fiber or `@dimforge/rapier3d-compat` in plain three.js, has one built in. `world.createCharacterController(offset)` returns an object that takes the move a character wants to make this step and gives back the move it can make: it slides along walls, climbs slopes up to an angle, steps over small ledges and keeps the character on the ground going down a slope. The character itself is a kinematic body with a capsule collider, which nothing pushes; each step the code asks the controller for the move and sets the body's next position.

What the controller leaves to the code:

- **Gravity.** It applies none. The code keeps a vertical speed, adds gravity to it each step and puts it in the wanted move.
- **Jumping.** A jump is a vertical speed set when `computedGrounded()` was true on the last move.
- **The camera.** A follow camera is a few lines that place the camera behind and above the body each frame.
- **Moving platforms.** The controller does not carry the character on one; the code adds the platform's move to the wanted move.

The other route is a dynamic capsule with its rotations locked, moved by setting its velocity. It needs no gravity code, but slopes, steps and staying on the ground going downhill are then the code's work too.

paprika3d is a Claude Code plugin and MCP server that opens the page in its own headless Chrome on a paused clock, one step of 1/60 s per frame. Its `interact` tool holds keys for a number of frames and traces values from `window.__game.observe()`, so a jump is a height and a frame count, and a held key up a slope either climbs or stops in its Motion line. The `threejs-game` skill's `rapier.ts` template is the `window.__game` bridge for a Rapier world, and its header carries the controller's notes: no gravity, no ride on a moving platform.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three @react-three/fiber @react-three/rapier react react-dom
```

## A course with a ramp, a steep slope and stairs

The page is `src/main.tsx` of a Vite project, with `@react-three/rapier` 2.2.0. The player is a capsule on a `kinematicPosition` body. To its right a 25 degree ramp leads up to a ledge, to its left a 55 degree slope is steeper than the controller climbs, and straight ahead three steps of 0.2 m each go up and over. The keys and the jump feed one `act()`, so the harness and the keyboard take the same path, and `observe()` returns the capsule's centre, whether it is grounded and its vertical speed.

```tsx
// verify: inline act=ArrowRight
import { Suspense, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { CapsuleCollider, Physics, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';

// Game state in a plain module, outside React, so observe() and setState never wait for a render.
const SPEED = 4, JUMP = 6, GRAVITY = 20;       // metres per second, and per second squared
const held = new Set<string>();
const state = { jump: false, vy: 0, grounded: false, facing: 0 };
const toKey = (k: string) => (k === ' ' ? 'Space' : k);
function act({ key, down = true }: { key: string; down?: boolean }) {
  const k = toKey(key);
  if (k === 'Space' && down && !held.has(k)) state.jump = true;   // once per press
  if (down) held.add(k); else held.delete(k);
}

function Player() {
  const body = useRef<RapierRigidBody>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const { world } = useRapier();
  const controller = useRef<ReturnType<typeof world.createCharacterController>>();

  useEffect(() => {
    const c = world.createCharacterController(0.01);   // a 1 cm gap kept between the capsule and the world
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(45));
    c.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(50));
    c.enableAutostep(0.3, 0.2, true);                   // steps up to 0.3 m, with 0.2 m of floor beyond
    c.enableSnapToGround(0.3);
    controller.current = c;
    const down = (e: KeyboardEvent) => { if (!e.repeat) act({ key: e.code }); };
    const up = (e: KeyboardEvent) => act({ key: e.code, down: false });
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    const r2 = (n: number) => +n.toFixed(2);
    (window as any).__game = {
      subject: 'player',
      describe: () => ({ name: 'controller', units: 'metres, y up; player is the capsule centre, 0.86 above its feet',
        keys: { ArrowRight: 'hold: walk +x (to the gentle ramp)', ArrowLeft: 'hold: walk -x (to the steep ramp)', ArrowUp: 'hold: walk -z (up the stairs)', Space: 'jump' } }),
      observe: () => { const p = body.current!.translation(); return { player: { x: r2(p.x), y: r2(p.y), z: r2(p.z) }, grounded: state.grounded, vy: r2(state.vy), facing: Math.round(state.facing) }; },
      act,
      setState: (s: { player?: { x?: number; y?: number; z?: number }; vy?: number }) => {
        if (s.player) {
          body.current!.setTranslation({ ...body.current!.translation(), ...s.player }, true);
          world.propagateModifiedBodyPositionsToColliders();   // the controller queries colliders: move them now, not at the next step
        }
        if (s.player || s.vy !== undefined) { state.vy = s.vy ?? 0; state.grounded = false; }
      },
    };
    return () => { world.removeCharacterController(c); removeEventListener('keydown', down); removeEventListener('keyup', up); delete (window as any).__game; };
  }, [world]);

  // One move per physics step (1/60 s): the controller applies no gravity, so the code does.
  useBeforePhysicsStep(() => {
    const c = controller.current, b = body.current;
    if (!c || !b) return;
    const dt = 1 / 60;
    const x = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
    const z = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, z) || 1;
    if (state.grounded && state.jump) state.vy = JUMP;
    state.jump = false;
    state.vy -= GRAVITY * dt;
    c.computeColliderMovement(b.collider(0), { x: (x / len) * SPEED * dt, y: state.vy * dt, z: (z / len) * SPEED * dt });
    const m = c.computedMovement(), p = b.translation();
    b.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    state.grounded = c.computedGrounded();
    if (state.grounded && state.vy < 0) state.vy = 0;
    if (x || z) state.facing = THREE.MathUtils.radToDeg(Math.atan2(x, z));
  });

  // Turn the capsule to face its way, and follow it with the camera from behind and above.
  useFrame(({ camera }) => {
    const b = body.current;
    if (!b || !mesh.current) return;
    mesh.current.rotation.y = THREE.MathUtils.degToRad(state.facing);
    const p = b.translation();
    camera.position.set(p.x, p.y + 3, p.z + 7);
    camera.lookAt(p.x, p.y + 0.5, p.z);
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, 0.88, 2]}>
      <CapsuleCollider args={[0.5, 0.35]} />
      <mesh ref={mesh} name="player"><capsuleGeometry args={[0.35, 1, 8, 16]} /><meshStandardMaterial color="#e07040" /></mesh>
    </RigidBody>
  );
}

function Block({ name, position, size, tilt = 0, color = '#5a6b7d' }: { name: string; position: [number, number, number]; size: [number, number, number]; tilt?: number; color?: string }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position} rotation={[0, 0, THREE.MathUtils.degToRad(tilt)]}>
      <mesh name={name}><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>
    </RigidBody>
  );
}

function App() {
  return (
    <Canvas camera={{ position: [0, 4, 9], fov: 50 }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; }}>
      <color attach="background" args={['#1d2128']} />
      <fog attach="fog" args={['#1d2128', 20, 40]} />
      <hemisphereLight args={['#ffffff', '#445566', 2]} />
      <directionalLight position={[5, 10, 5]} intensity={2} />
      <Suspense>
        <Physics timeStep={1 / 60}>
          <Player />
          <Block name="ground" position={[0, -0.25, 0]} size={[80, 0.5, 80]} color="#3a4a3a" />
          <gridHelper args={[80, 80, '#5a6a5a', '#4a5a4a']} position={[0, 0.005, 0]} />
          {/* a 25 degree ramp up to a ledge on the right, a 55 degree slope on the left */}
          <Block name="gentleRamp" position={[3.86, 0.75, 2]} size={[4, 0.2, 3]} tilt={25} />
          <Block name="ledge" position={[7.35, 0.85, 2]} size={[3.5, 1.7, 2.9]} />
          <Block name="steepRamp" position={[-3.23, 1.58, 2]} size={[4, 0.2, 3]} tilt={-55} />
          {/* three steps of 0.2 m, straight ahead */}
          <Block name="step1" position={[0, 0.1, -0.25]} size={[3, 0.2, 0.5]} color="#7a6a5a" />
          <Block name="step2" position={[0, 0.2, -0.75]} size={[3, 0.4, 0.5]} color="#7a6a5a" />
          <Block name="step3" position={[0, 0.3, -1.5]} size={[3, 0.6, 1]} color="#7a6a5a" />
        </Physics>
      </Suspense>
    </Canvas>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, where Chrome draws in software (SwiftShader); every number below is a position or a frame count, none is a frame time. Run folder paths are shortened to `<project>`, and the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out.

**1. Open the dev server, and look.**

```text
open {"command":"bunx vite --port 5391 --strictPort","cwd":"<project>"}

Opened http://localhost:5391/ in 0.4 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
three.js warned: THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
Dev server: 10:38:15 AM [vite] (client) [console.warn] THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
Dev server: 10:38:15 AM [vite] (client) [console.warn] using deprecated parameters for the initialization function; pass a single object instead
Page text outside the canvas: none
{"name":"controller","units":"metres, y up; player is the capsule centre, 0.86 above its feet","keys":{"ArrowRight":"hold: walk +x (to the gentle ramp)","ArrowLeft":"hold: walk -x (to the steep ramp)","ArrowUp":"hold: walk -z (up the stairs)","Space":"jump"}}
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-38-15-245Z

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-38-15-245Z/look-1.png
Pixels: brightness 27%, colour saturation 28%, 0% near black, 0% blown out.
Hues: green 45%, blue 42%, grey 9% of the frame; over the objects but ground (25% of it): blue 80%, orange 12%, grey 8%.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler ran.
Surface: "ground" covers 54% with almost no detail (0.47 of 255): it reads as flat colour. Unless the user asked for flat colour, add texture, normal detail or lighting variation.
Subject: player takes 1.3% of the picture [600, 360, 679, 542]; 1 of its 1 named parts show.
Stands out: subject brightness 43% against 33% around it, colour 75% against 27%, edge contrast 0.073.
This camera shows little of the subject: try other views with `look` camera, then move the page's own camera to the best (said once).
On screen (9):
ground 54% [0, 168, 1279, 799] 80 × 80 units
steepRamp 10% [0, 159, 454, 635] 4 × 3 units
gentleRamp 8.7% [826, 320, 1279, 635] 4 × 3 units
GridHelper 2.7% [0, 167, 1279, 787] 80 × 80 units
player 1.3% [600, 360, 679, 542]
step* ×3 1.8% [507, 353, 772, 452] 3 × 0.5–1 units, across the view
ledge 0.26% [1193, 320, 1279, 561]
Never visible: none
```

The two warnings come from the libraries, not this page's code: the page has no `THREE.Clock`, and the initialization notice is printed when Rapier's WebAssembly loads. Every part of the course is on screen. The ground's flat colour line is right about this test course, and the subject line is the follow camera's choice: 7 m behind and 3 m up, it frames the course around the capsule, and a game's camera would sit closer.

**2. Jump.**

```text
interact {"steps":[{"key":"Space"},{"wait":60}],"trace":["player.y","grounded"]}

{"after":{"player":{"x":0,"y":0.86,"z":2},"grounded":true,"vy":0,"facing":0},"changed":{}}
Motion (player): travelled 1.7 units (0.00000544 from start to end), its direction of travel turned 572° left.
player.y: 0.86 → peak 1.71 at frame 18 → 0.86 at frame 36; first changed at frame 2
grounded: true until frame 2, false until frame 36, then true
```

With a jump speed of 6 and gravity of 20, the capsule rises 0.85 m, peaks on frame 18 and lands on frame 36: 36 frames in the air, 0.6 s. `grounded` is false for exactly that span, so a second press in the air does nothing. The Motion line's turn means nothing here: the capsule moved straight up and down, and its sideways drift was 0.00000544 units.

**3. Hold right, up the ramp.**

```text
interact {"steps":[{"key":"ArrowRight","frames":150}],"trace":["player.x","player.y"]}

{"changed":{"player":{"x":8.99,"y":2.56},"facing":90}}
player.x: 0 → 8.99 at frame 150; first changed at frame 1
player.y: 0.86 → 2.56 at frame 98; first changed at frame 5
```

The capsule reaches y = 2.56 on frame 98 and keeps it: its centre sits 0.86 above the ledge's top at 1.7. The 25 degree ramp is under the 45 degree climb limit, so the controller turned the wanted move along the slope and up.

**4. Hold left, into the steep slope.**

```text
interact {"steps":[{"state":{"player":{"x":0,"y":0.86,"z":2}}},{"key":"ArrowLeft","frames":120}],"trace":["player.x","player.y"]}

{"changed":{"player":{"x":-1.82,"y":0.86},"facing":-90}}
Motion (player): travelled 1.82 units, it stopped at frame 28 and did not move again.
player.x: 0 → -1.82 at frame 112; first changed at frame 1
player.y: 0.86 → low 0.85 at frame 4 → 0.86 at frame 11; first changed at frame 4
```

The 55 degree slope is over the limit, and the capsule stops at its foot, on the ground, with the key still held. The Motion line puts the stop at frame 28; x still changes in its last digit until frame 112, which the Motion line does not count as moving. A capsule that walked up this slope would show y rising here, as it did on the ramp.

**5. Hold up, over the stairs.**

```text
interact {"steps":[{"state":{"player":{"x":0,"y":0.86,"z":2}}},{"key":"ArrowUp","frames":90}],"trace":["player.z","player.y"]}

{"changed":{"player":{"x":0,"z":-3.8},"facing":180}}
player.z: 2 → -3.8 at frame 90; first changed at frame 1
player.y: 0.86 → low 0.85 at frame 17 → peak 1.46 at frame 47 → 0.86 at frame 80; first changed at frame 3
```

y climbs to 1.46, the top step's 0.6 plus 0.86, on frame 47, and comes back to 0.86 by frame 80 on the far side. `enableAutostep(0.3, 0.2, true)` lets the controller step up to 0.3 m, so the steps of 0.2 m are climbed without a jump.

**6. Drop from 20 m and wait for the landing.**

```text
interact {"steps":[{"state":{"player":{"x":0,"y":20,"z":2}}},{"until":{"grounded":true},"max":300}],"trace":["player.y","vy"]}

{"changed":{"player":{"z":2}}}
until: grounded == true held at frame 81
player.y: 19.99 → 0.86 at frame 81; first changed at frame 1
vy: -0.33 → low -27.33 at frame 80 → 0 at frame 81; first changed at frame 1
```

`until` stops the steps when `grounded` turns true, and the landing is frame 81, at 27.33 m/s on the frame before. At that speed the capsule moves nearly half a metre a step, close to the ground's 0.5 m thickness, and it lands on top: the controller sweeps the capsule along the whole move, so a fast fall does not pass through.

**The same drop, before one line was added.** The first version of this page's `setState` moved the body with `setTranslation` and nothing after it. The same call then gave:

```text
interact {"steps":[{"state":{"player":{"x":0,"y":20,"z":2}}},{"until":{"grounded":true},"max":300}],"trace":["player.y","vy"]}

{"changed":{"player":{"y":20,"z":2}}}
until: grounded == true held at frame 0
player.y: 20 throughout the 0 frames
```

The player was 20 m up and `grounded` was already true. `setTranslation` moves the body, but its collider stays where it was until the world steps, and the controller asks about the collider: in the first step after the teleport, it tested the capsule where it had been, on the ground past the stairs, and answered grounded. `world.propagateModifiedBodyPositionsToColliders()` after the teleport, the line now in `setState`, moves the colliders at once. A respawn or a teleport in the game has the same stale step: `grounded` comes back true with the player in the air, and a jump pressed then fires.

## The follow camera, and input without a mouse

The camera here is placed in `useFrame` from the body's position, a fixed offset behind and above, looking at the capsule. Smoothing is `camera.position.lerp(target, 1 - Math.exp(-8 * delta))` toward the same point, and a camera that turns with the character takes the offset rotated by `state.facing`. A keyboard and a joystick need no mouse: a joystick gives a direction, which goes where `x` and `z` are made from the held keys, and the rest of the step is the same. A trace of the camera's position beside the player's, put in `observe()`, shows a camera that lags or jumps.

## What paprika3d does not do

- It does not ship a character controller. The controller is Rapier's, and the code that drives it is the agent's; the tools measure what that code does, frame by frame.
- It does not say whether a jump of 0.85 m or a climb limit of 45 degrees is right for the game. It gives the numbers, and the game's design decides.
- It does not judge how the camera feels. `look` shows what the camera frames, and a trace shows where it is.

## Pitfalls

- **Move once per physics step, not per render frame.** `useBeforePhysicsStep` runs at the physics rate; a move in `useFrame` runs at the screen's rate, so the character walks faster on a 120 Hz screen.
- **Ask for grounded after the move.** `computedGrounded()` describes the move just computed; zero the vertical speed when it is true and the speed points down, or gravity keeps adding to it on the ground.
- **Move a kinematic body with `setNextKinematicTranslation`.** `setTranslation` is a teleport, which is right for a respawn, followed by `propagateModifiedBodyPositionsToColliders()`.
- **Keep the capsule's collider and mesh the same size.** `CapsuleCollider args={[0.5, 0.35]}` is a half height and a radius, and `capsuleGeometry args={[0.35, 1]}` a radius and a full length; the page's values match.
- **A moving platform needs code.** Move the platform by position, and add its move this step to the player's wanted move.

For a character on Rapier in a worker, with the game's state in typed arrays, the [physics in a web worker](/guides/threejs-physics-web-worker) page covers the game-state package.

## Without paprika3d

`<Physics debug>` in `@react-three/rapier` draws every collider as lines, which shows a capsule that does not match its mesh or a step collider that is not where its box is drawn. Logging y and `computedGrounded()` once per step while jumping gives the same height and airtime as the trace, read from the console; for the teleport above, logging `grounded` on the step after `setTranslation` shows the stale answer.
