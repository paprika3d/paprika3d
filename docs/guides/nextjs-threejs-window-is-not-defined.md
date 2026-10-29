---
title: "three.js: window is not defined in Next.js, and the blank canvas after the fix"
phrase: window is not defined in next.js
description: Why three.js code in a Next.js client component fails with ReferenceError window is not defined, why next/dynamic with ssr false is refused in a Server Component, and how a coding agent finds both and the 0 px tall canvas that leaves the page blank after the fix, with the paprika3d plugin's open tool running next dev and look showing the canvas.
meta: "three.js window is not defined in Next.js: move the scene into useEffect, give the canvas a height, and see each fault with next dev running."
intent: nextjs-window-is-not-defined
queries:
  - "How to load OrbitControls in a Nextjs page"
  - "How to import the PLYLoader in next.js app? ( with react-three-fiber )"
  - "Getting window is not defined when I use the three-fatline npm package in my nextjs project"
  - "Not working on nextjs projects"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js: window is not defined in Next.js, and the blank canvas after the fix

## Why a client component still runs on the server

`'use client'` at the top of a file marks where Next.js's client bundle starts. It does not keep the component off the server: Next renders client components to HTML on the server for the first response, and again when it prerenders a page at build time. Everything at the top level of the module, and everything in the component's body, runs there, where there is no `window` and no `document`.

three.js code written for a plain page does exactly that. `window.innerWidth / window.innerHeight` for the camera's aspect, and `new THREE.WebGLRenderer()` at module scope, which makes its canvas with `document`, are the usual first lines. A package that reads `window` when it is imported fails the same way, which is what the three-fatline and loader threads are about. Code inside `useEffect` runs in the browser after the page hydrates, and never on the server.

The fix has a second half that the threads reach next: a renderer sized from its container, in a container with no height, draws into a canvas 0 px tall, and the page is blank with no error at all.

paprika3d is a Claude Code plugin and MCP server that opens a page in its own headless Chrome. Its `open` tool takes the dev-server command, runs it in the project, and reports what the server printed as an error, a canvas with no height, and the page's console errors; `look` returns the picture with what is on screen.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## The component as written

An App Router page with a product viewer, written the way a plain three.js page is: scene, camera and renderer at module scope, and the mounting in an effect.

```tsx
// app/page.tsx
import Viewer from './Viewer';

export default function Page() {
  return (
    <main>
      <h1 style={{ position: 'absolute', margin: 16, font: '600 20px system-ui' }}>Mug, 350 ml</h1>
      <Viewer />
    </main>
  );
}
```

```tsx
// app/Viewer.tsx
'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 4);
const renderer = new THREE.WebGLRenderer({ antialias: true });

export default function Viewer() {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mount.current!;
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 1, 48), new THREE.MeshStandardMaterial({ color: 0xc8553d }));
    mug.name = 'mug';
    scene.add(mug, new THREE.HemisphereLight(0xffffff, 0x444444, 3));
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => { renderer.setAnimationLoop(null); controls.dispose(); el.removeChild(renderer.domElement); };
  }, []);
  return <div ref={mount} style={{ width: '100%', height: '100%' }} />;
}
```

## The tool calls, in order

These replies were captured on 2026-10-28 with Next.js 16.4.3, React 19.3.1 and three r186, on a Linux server with no GPU, where Chrome draws in software (SwiftShader); none of what follows depends on frame times. On that server `node` runs Bun, so the dev server was started with `bunx next dev` (`npx next dev` elsewhere). Run folder paths are shortened to `<project>`, and the `open` reply's lines about the `geo.js` and `fx.js` helpers it writes into the project are left out.

**1. Open it with the dev server.**

```text
open {"command": "bunx next dev --port 3381", "cwd": "<project>"}

Opened http://localhost:3381 in 3.8 s, paused at frame 0.
GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). A software renderer (no GPU): frame times here say nothing of a real GPU's.
The page took 3.8 s to its first frame; expected on this software renderer, nothing to do.
Dev server: ReferenceError: window is not defined (app/Viewer.tsx:7)
Canvas: 0 px tall on the page (html has no height), so the scene does not show.
Page text outside the canvas: 1 h1, 0 h2, 3 words
{"three":"186","scenes":1,"entities":["mug"]}
Errors so far:
Failed to load resource: the server responded with a status of 500 (Internal Server Error) 
Next: `look` to see it, then `interact` for each interaction the request names.

Run folder: <project>/paprika3d/runs/2026-10-28T10-20-27-708Z

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-20-27-708Z/look-1.png
Pixels: brightness 100%, colour saturation 0%, 0% near black, 99% blown out. Much of it is blown out to white. Pale: little colour.
Hues: grey 100%.
Canvas: 1280x0 buffer for 1280x0 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames). The canvas is 0 px tall, so nothing shows: give it (or its container) a size, then call renderer.setSize.
No three.js scene: a raw WebGL page gets the picture only, no object list.
```

The `Dev server:` line is the server render failing at line 7, the camera's `window.innerWidth`. The server answered 500, and in development Next then rendered the page in the browser, where `window` exists, so the mug was made (`entities`) and the page shows the heading and an issue badge. The `Canvas:` line is the second fault, already there underneath: the canvas is 0 px tall. In a browser it is a white page with a title, an issue badge and one console error, the 500.

**2. The `next/dynamic` answer, from a Server Component.** The usual reply in the threads is to load the viewer with `next/dynamic` and `ssr: false`. Written in `app/page.tsx`, which is a Server Component, Next refuses it:

```tsx
// app/page.tsx
import dynamic from 'next/dynamic';

const Viewer = dynamic(() => import('./Viewer'), { ssr: false });
```

```text
open {"command": "bunx next dev --port 3382", "cwd": "<project>"}

game not ready after 10 s: no window.__game, three.js renderer or WebGL canvas on http://localhost:3382/
Failed to load resource: the server responded with a status of 500 (Internal Server Error) 
./app/page.tsx:3:16 (_next/static/chunks/node_modules_next_dist_1gdrd03q-xsfc._.js:1948:15)
Error: `ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component.
  1 | import dynamic from 'next/dynamic';
  2 |
> 3 | const Viewer = dynamic(() => import('./Viewer'), { ssr: false });
    |                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  4 |
  5 | export default function Page() {
  6 |   return (

Ecmascript file had an error
```

The reply printed the same compile error three times; it is shown once here. `ssr: false` works from a file that starts with `'use client'`, a small wrapper that the page imports in place of the viewer, here with the viewer still as written at the start:

```tsx
// app/ViewerClient.tsx
'use client';
import dynamic from 'next/dynamic';

export default dynamic(() => import('./Viewer'), { ssr: false });
```

```text
open {"command": "bunx next dev --port 3387", "cwd": "<project>"}

Opened http://localhost:3387 in 5.0 s, paused at frame 0.
Canvas: 0 px tall on the page (html has no height), so the scene does not show.
Page text outside the canvas: 1 h1, 0 h2, 3 words
{"three":"186","scenes":1,"entities":["mug","mug"]}
```

The server error is gone, since the viewer's module is no longer loaded on the server. Two faults remain. The canvas is still 0 px tall, and there are two mugs: in development React mounts a component twice (Strict Mode), and the scene at module scope outlived the first mount, so the effect added a second mug to it. The wrapper is the tool for a package that reads `window` the moment it is imported. For code you write yourself, moving it into the effect fixes the server error and the double mount at once, and keeps the page's HTML rendered on the server.

**3. Move the three.js code into the effect.** The scene, camera and renderer are made when the component mounts in the browser and disposed when it unmounts:

```text
open {"command": "bunx next dev --port 3385", "cwd": "<project>"}

Opened http://localhost:3385 in 3.4 s, paused at frame 0.
Page text outside the canvas: 1 h1, 0 h2, 3 words
{"three":"186","scenes":2,"entities":["mug"]}

look {}

Picture: <project>/paprika3d/runs/2026-10-28T10-23-26-003Z/look-1.png
Pixels: brightness 100%, colour saturation 0%, 0% near black, 100% blown out. Much of it is blown out to white. Pale: little colour.
Canvas: 1280x0 buffer for 1280x0 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames). The canvas is 0 px tall, so nothing shows: give it (or its container) a size, then call renderer.setSize.
No three.js scene: a raw WebGL page gets the picture only, no object list.

eval {"code": "return [...document.querySelectorAll('canvas')].map(c => ({ width: c.clientWidth, height: c.clientHeight }))"}

[{"width":1280,"height":0}]
```

No `Dev server:` line and no error: the server render passes. The page is still blank, and `look` says why: the renderer took its size from the container, a div sized to 100% of a `<main>` and a `<body>` with no height of their own, so its `clientHeight` was 0. `scenes` is 2 because React mounts a component twice in development (Strict Mode), and the effect's cleanup disposed the first renderer.

**4. Give the container a height.** `height: '100vh'` (and `width: '100vw'`), and the next call reloads the page by itself:

```text
look {}

Reloaded (sources changed), ran on the new code from frame 0 (ready in 0.5 s).
Pixels: brightness 2%, colour saturation 5%, 92% near black, 0% blown out; 100% of the picture changed since the last look. Mostly black: the objects cover 7.6% of the frame.
Canvas: 1280x800 buffer for 1280x800 CSS at DPR 1 (renderer pixel ratio 1); resize handler did not run: the canvas kept its size when the page shrank (a debounced one waits for frames).
HTML over the canvas: 1 (h1 via page), 0 overlap, 0 off-screen, 0 cut off: h1 "Mug, 350 ml" [16, 16, 147, 38].
On screen (1):
mug 7.6% [503, 248, 776, 571]
Never visible: none

observe {}

{"entities":{"mug":{"type":"Mesh","position":[0,0,0]}},"harness":{"frame":1,"renderer":{"calls":1,"triangles":192,"textures":0,"geometries":0,"programs":0},"scene":{"objects":2,"meshes":1,"lights":1,"cameras":0},"errors":[],"changed":null}}
```

The mug is on screen, the heading sits over the canvas without covering it, and `observe` has no errors. The replies in steps 2 to 4 are cut to the lines discussed, with nothing reworded. The `resize handler did not run` line in step 4 is not right for this component, and the next section says why.

## The fixed component

`app/page.tsx` stays as it was at the start. `app/Viewer.tsx` with everything in the effect and the container sized; here it is rendered by Vite's React instead of Next, in Strict Mode as Next's development server does, so the block runs on its own:

```tsx
// verify: inline
'use client';
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default function Viewer() {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Effects run in the browser only, after hydration: window and document exist here, never on the server.
    const el = mount.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(0, 1.2, 4);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 1, 48), new THREE.MeshStandardMaterial({ color: 0xc8553d }));
    mug.name = 'mug';
    scene.add(mug, new THREE.HemisphereLight(0xffffff, 0x444444, 3));
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      // React runs this on unmount, and once more in development (Strict Mode mounts twice)
      window.removeEventListener('resize', onResize);
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);
  return <div ref={mount} style={{ width: '100vw', height: '100vh' }} />;
}

// In the Next project, app/page.tsx renders <Viewer />; here Vite's React mounts it.
createRoot(document.getElementById('root')!).render(<StrictMode><Viewer /></StrictMode>);
```

## What paprika3d does not do

- **It does not change your Next.js code or config.** It runs the dev server you give it and reports; the agent makes the change.
- **It reads the dev server's output for errors and warnings,** up to 5 distinct lines, with the file and line from the stack frame under each. A compile error from the bundler comes back as the page's console error instead, as in step 2.
- **Under React Strict Mode, two lines read the first renderer.** In development React mounts the component, unmounts it and mounts it again, so the page makes two renderers and the cleanup disposes the first. paprika3d follows the first, so `open` printed no `Canvas:` line in step 3 for the 0 px canvas that `look` caught, and `look` says the resize handler did not run although it does: with `reactStrictMode: false` in `next.config.mjs`, the same component gets `scenes` 1 and `resize handler ran`. The picture, `On screen` and `observe` read the live page either way.
- **It does not run `next build` for you.** A page Next prerenders at build time renders on the server there too, so check the build as well as the dev server; `open` can open the started production server (`next start`) with `command` the same way.

## Pitfalls

- **Nothing at module scope that touches the browser.** No `window`, `document`, `new THREE.WebGLRenderer()` or `new OrbitControls()` outside the effect; `import * as THREE from 'three'` itself is safe on the server.
- **`ssr: false` belongs in a client component.** In App Router, a Server Component that tries it gets the error in step 2.
- **Clean up in the effect.** Strict Mode mounts twice in development; without `renderer.dispose()` and removing the canvas, the page keeps two canvases and two render loops.
- **Size the container, not just the canvas.** A canvas sized from a parent with no height is 0 px tall; `100vh`, a fixed height, or a parent chain with heights all work.
- **React Three Fiber's `<Canvas>` makes its renderer in an effect,** so it renders on the server without touching `window`. What breaks there is a package imported at module scope that reads `window`; load that one with `next/dynamic` from a client component.

## Without paprika3d

Watch the terminal running `next dev` as well as the browser console: the server render's `window is not defined` is printed there, while the browser shows a page that may look loaded. Search the component for `window.`, `document.` and `new THREE.WebGLRenderer` outside `useEffect`. For the blank page after the fix, check the canvas's size in the browser's element inspector: a 0 px height means the parent chain has no height. Run `next build` before deploying, since prerendering runs the server render for every static page.
