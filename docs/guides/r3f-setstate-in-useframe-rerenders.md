---
title: React Three Fiber setState in useFrame: count the re-renders in a three.js scene, then switch to refs
phrase: setstate in useframe
description: Why a React Three Fiber scene that calls setState in useFrame renders React every frame and leaks a geometry each time it makes one in the component body, how a coding agent counts both with the paprika3d plugin's interact trace and observe's renderer counts instead of guessing from frame times, and the fix with refs, useMemo and a HUD written straight to the DOM.
meta: React Three Fiber setState in useFrame re-renders every frame: count the renders and leaked geometries in your three.js scene, then move the value to a ref.
intent: r3f-rerenders-usestate-in-useframe
queries:
  - "Low frame rate in React based Three.js application"
  - "Can I use ref and useFrame to handle my states more optimally than using useState?"
  - "Why so many rerenders?"
  - "Getting double render by error"
  - "Why does scrolling trigger lag in onFrame()?"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# React Three Fiber setState in useFrame: count the re-renders in a three.js scene, then switch to refs

## What a setState in useFrame costs

`useFrame` runs once per frame, outside React's rendering. A `setState` inside it asks React to render the component that owns the state, and everything below it, again. When the state lives high up so that a heading or a HUD can show it, that is the whole tree: the `<Canvas>`'s children are rendered again too, and every line in their function bodies runs again.

Two costs follow. The first is React's own work, every frame, for a value three.js could have taken directly. The second is easy to miss: anything the component body makes with `new` is made again on each render. A `new THREE.TorusKnotGeometry(...)` in the body gives React Three Fiber a new geometry each time; it swaps it in, three.js uploads it to the GPU the next time it draws, and the old one stays there, since nothing disposed it. The scene looks the same, and the frame rate sinks the longer it runs.

Frame times are a poor way to find this: they vary by machine, and on the server these replies were captured on they come from a software renderer. Two counts find it on any machine. A counter in the component tells how often React rendered it, and three.js's own `renderer.info.memory.geometries` tells how many geometries sit on the GPU. paprika3d is a Claude Code plugin and MCP server that opens the page in its own headless Chrome on a paused clock: `interact` with `trace` reads values from the page every frame while it plays frames, and `observe` reports the renderer's counts.

React Three Fiber's own documentation lists this under its performance pitfalls; this guide is about seeing it in your scene and confirming the fix.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three @react-three/fiber
```

## The scene

A knot that turns, with its angle in a HUD. The angle is state in `App` so the HUD can show it, `useFrame` adds to it every frame, and the knot's geometry is made in the component body. A module counter counts `Spinner`'s renders, and a small `window.__game` reports it with the renderer's geometry count:

```tsx
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

let renders = 0; // how many times React has rendered <Spinner />

function Spinner({ angle, onTurn }: { angle: number; onTurn: (delta: number) => void }) {
  renders++;
  const geometry = new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16);
  useFrame((_, delta) => onTurn(Math.min(delta, 0.1)));
  return (
    <mesh name="knot" geometry={geometry} rotation-y={angle}>
      <meshStandardMaterial color="#e07a3f" />
    </mesh>
  );
}

function App() {
  const [angle, setAngle] = useState(0); // in state so the HUD can show it
  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 4] }}
        onCreated={({ gl, scene }) => {
          (window as any).__game = {
            describe: () => ({ name: 'spinner', units: 'radians' }),
            observe: () => ({ renders, angle: +(scene.getObjectByName('knot')?.rotation.y ?? 0).toFixed(3), geometries: gl.info.memory.geometries }),
            setState: () => {},
          };
        }}
      >
        <color attach="background" args={['#1d2230']} />
        <hemisphereLight args={['#ffffff', '#445566', 2.5]} />
        <Spinner angle={angle} onTurn={(d) => setAngle((a) => a + d)} />
      </Canvas>
      <div style={{ position: 'fixed', top: 16, left: 20, font: '600 22px system-ui', color: '#fff' }}>
        {Math.floor(THREE.MathUtils.radToDeg(angle)) % 360}°
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

## The tool calls, in order

These replies were captured on 2026-10-28 with React 19, React Three Fiber 9 and three r186 under Vite, on a Linux server with no GPU, where Chrome draws in software (SwiftShader); nothing below depends on frame times. Run folder paths are shortened to `<project>`.

**1. Open it.**

```text
open {"command": "bunx vite --port 5294 --strictPort", "cwd": "<project>"}

Opened http://localhost:5294/ in 0.7 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
three.js warned: THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
Dev server: 10:29:33 AM [vite] (client) [console.warn] THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
Page text outside the canvas: 0 h1, 0 h2, 1 words
{"name":"spinner","units":"radians"}
```

The `THREE.Clock` warning comes from React Three Fiber 9 itself and needs no change.

**2. Play 120 frames, drawing each, and trace the counts.** `draw: true` draws every frame; without it a `wait` draws its last frame alone, and an undrawn geometry is never uploaded, so the leak would not show in the count:

```text
interact {"steps": [{"wait": 120, "draw": true}], "trace": ["renders", "geometries", "angle"]}

{"changed":{"renders":24,"angle":2.083,"geometries":11}}
renders: 2 → 22 at frame 119; first changed at frame 12
geometries: 0 → 11 at frame 119; first changed at frame 1
angle: 0 → 1.917 at frame 119; first changed at frame 12

observe {}

{"renders":24,"angle":2.083,"geometries":11,"harness":{"frame":120,"renderer":{"calls":1,"triangles":4096,"textures":1,"geometries":11,"programs":1},"scene":{"objects":2,"meshes":1,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

Three things to read. `renders` climbs for as long as the scene runs, although nothing about the knot changes but its rotation; in development the counter goes up by two per render (Strict Mode, below), so 22 is 11 renders. `geometries` climbs with it, to the same 11, against one mesh: each render's new knot was uploaded and kept, and `observe`'s renderer line shows the same 11 beside one draw call and 4096 triangles, a scene that should cost the GPU almost nothing. And the knot's rotation trails the state: the mesh read 1.917 at frame 119 while the state had reached 2.083, because the rotation reaches three.js through a render, so the knot moves when React renders, not when the frame runs.

The number of renders per frame is not a rate to quote. Under the paused clock the harness steps frames faster than real time, and React batches the updates that arrive between its renders, so here it rendered less than once a frame. On a person's machine, how often it keeps up depends on how long each render takes; the stutter in the threads is the frames where it does not. The point is that the count moves at all.

**3. The fix: refs for the frame, state for what React shows rarely.** The rotation goes on the mesh through a ref, the geometry is made once with `useMemo`, and the HUD's text is written to its DOM node from `useFrame` when the whole degree changes. After the edit the next call reloads the page by itself:

```text
interact {"steps": [{"wait": 120, "draw": true}], "trace": ["renders", "geometries", "angle"]}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.2 s).
{"changed":{"angle":2.083,"geometries":1}}
renders: 2 throughout the 120 frames
geometries: 0 → 1 at frame 1; first changed at frame 1
angle: 0 → 2.083 at frame 120; first changed at frame 1

look {}

HTML over the canvas: 1 (div via page), 0 overlap, 0 off-screen, 0 cut off: div "119°" [20, 16, 72, 40].
On screen (1):
knot 6.8% [532, 200, 799, 595]
Never visible: none
```

`renders` stays at 2 for all 120 frames, `geometries` at 1, and the knot turns from the first frame, reaching 2.083 with no lag behind anything. The HUD still shows the angle. The `look` reply is cut to the lines discussed, with nothing reworded.

The 2 is one render counted twice. In development, React's Strict Mode calls each component's function twice per render, to surface side effects in a render, and production builds call it once; that is the "double render" thread, and it is not a fault. A count that keeps climbing after the mount is.

## The fixed scene

```tsx
// verify: inline
import { StrictMode, useMemo, useRef, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

let renders = 0; // how many times React has rendered <Spinner />

function Spinner({ label }: { label: RefObject<HTMLDivElement | null> }) {
  renders++;
  const mesh = useRef<THREE.Mesh>(null!);
  const geometry = useMemo(() => new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16), []); // made once, kept across renders
  const shown = useRef(-1);
  useFrame((_, delta) => {
    mesh.current.rotation.y += Math.min(delta, 0.1); // a ref: three.js changes, React does not render
    const degrees = Math.floor(THREE.MathUtils.radToDeg(mesh.current.rotation.y)) % 360;
    if (degrees !== shown.current && label.current) {
      shown.current = degrees;
      label.current.textContent = `${degrees}°`; // the HUD text, written straight to the DOM
    }
  });
  return (
    <mesh ref={mesh} name="knot" geometry={geometry}>
      <meshStandardMaterial color="#e07a3f" />
    </mesh>
  );
}

function App() {
  const label = useRef<HTMLDivElement>(null);
  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 4] }}
        onCreated={({ gl, scene }) => {
          (window as any).__game = {
            describe: () => ({ name: 'spinner', units: 'radians' }),
            observe: () => ({ renders, angle: +(scene.getObjectByName('knot')?.rotation.y ?? 0).toFixed(3), geometries: gl.info.memory.geometries }),
            setState: () => {},
          };
        }}
      >
        <color attach="background" args={['#1d2230']} />
        <hemisphereLight args={['#ffffff', '#445566', 2.5]} />
        <Spinner label={label} />
      </Canvas>
      <div ref={label} style={{ position: 'fixed', top: 16, left: 20, font: '600 22px system-ui', color: '#fff' }} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

## What paprika3d does not do

- **It does not name the component that rendered.** The counts are what the page reports: a counter you add and the renderer's own numbers. The React DevTools Profiler lists each component that rendered and why, and pairs well with these counts.
- **It does not time React here.** On a machine with a GPU, `perf` gives the frame time beside the draw calls and triangles, and `perf` with `throttle` slows the page's JavaScript as a weak laptop would, which makes a stutter from renders plain. This guide uses no frame times, because its replies come from a software renderer, where `perf` itself reports that frame times are no budget signal.
- **It does not change your components.** The agent makes the change and plays the same steps again.

## Pitfalls

- **Per-frame values go in refs.** Mutate the three.js object (`mesh.current.rotation.y += delta`) in `useFrame`; keep state for what changes on a click, a load or a score.
- **Nothing made with `new` in the component body.** Use `useMemo`, or React Three Fiber's own elements (`<torusKnotGeometry args={[0.8, 0.25, 128, 16]} />`), which it makes once and disposes on unmount.
- **State high in the tree renders everything under it.** A HUD that needs a per-frame value can take it through a ref to its DOM node, as above, or from a store that the HUD alone subscribes to.
- **Scroll and pointer handlers are the same case.** A handler that sets state on every scroll event renders on every scroll event; keep the value in a ref and read it in `useFrame`.
- **Cap the first delta.** Under paprika3d's clock the first `useFrame` delta spans the page's load; `Math.min(delta, 0.1)` keeps the first frame from jumping.

## Without paprika3d

Put a counter in the component and log it once a second, or turn on "Highlight updates when components render" in the React DevTools settings and watch the canvas's components flash. Log `gl.info.memory.geometries` and `gl.info.memory.textures` from `useThree` now and then: a count that grows while the scene stays the same is a `new` in a render path or a missing `dispose()`. `r3f-perf` shows the same renderer counts in an overlay on the page.
