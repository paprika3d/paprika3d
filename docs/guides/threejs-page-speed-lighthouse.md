---
title: three.js page speed and Lighthouse: what a 3D hero costs the rest of the page
phrase: three.js page speed
description: Why a landing page with a three.js hero scores badly in Lighthouse or lags on scroll, and what a coding agent can measure before running Lighthouse with the paprika3d plugin: the script and asset megabytes against a website budget with perf, and whether the hero keeps drawing after the visitor scrolls past it, counted with interact and eval, then stopped with an IntersectionObserver.
meta: three.js page speed: weigh the hero's script against a site budget, and stop the render loop once the visitor scrolls past the 3D.
intent: threejs-page-speed-lighthouse
queries:
  - "Threejs Landing page - Photoreal 3D with 100% Lighthouse score"
  - "Why my three js code is working slow in lighthouse and on mobile phone?"
  - "How to download textures before JS parsing?"
  - "Lag on scroll when use threejs into html page"
  - "Want to increase my page speed by optimizing three js code"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js page speed and Lighthouse: what a 3D hero costs the rest of the page

## What a 3D hero does to a page

Lighthouse loads a page as a first visit on a throttled connection with a slowed CPU, and scores what a visitor waits through: when the first content and the largest content appear, how long the main thread is blocked by long tasks, and how much the layout shifts. A three.js hero reaches every one of those in three ways:

- **Its script.** three.js served from `node_modules` without a build is megabytes of JavaScript, downloaded and parsed before the scene can start.
- **Its start-up work.** Building the scene, compiling shaders, decoding a model and its textures all run on the main thread, in tasks that block clicks and scrolling while they run.
- **Its render loop.** `setAnimationLoop` draws every frame for as long as the tab is open, including while the visitor is reading the text three screens below the hero. That is the lag on scroll in the threads: the page scrolls while the main thread and the GPU are still drawing a scene nobody can see.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome. `perf` with `budget: "site"` times a first visit on Chrome's fast 4G preset and holds the page to a website's budget: the first scene frame within three seconds, 1 MB of script and 4 MB of assets, naming the largest scripts. `interact` scrolls the page on its paused clock, and `eval` reads how many times the renderer drew, so whether the hero stops drawing off screen is a count. It does not run Lighthouse and gives no score; the URL that `open` serves is the one to hand to Lighthouse once these are fixed.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
npm install three
```

## A lamp's landing page

A full-screen hero with a turning lamp, then three sections of text. The hero's height is set in CSS, so the text below never moves when the scene appears. With `?pause`, an `IntersectionObserver` stops the render loop while the hero is out of view.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Lumen lamp</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{margin:0;font:18px/1.6 system-ui,sans-serif;color:#222;background:#f4f1ec}
#hero{position:relative;height:100vh}
#hero canvas{display:block;width:100%;height:100%}
#hero h1{position:absolute;left:6vw;bottom:10vh;margin:0;font-size:48px}
section{max-width:720px;margin:0 auto;padding:80px 24px}
</style></head>
<body>
<div id="hero"><h1>Lumen, a lamp that follows the sun</h1></div>
<section id="story"><h2>Made to last</h2><p>Lumen is turned from one block of oak and finished with oil. Its shade is hand-blown glass, and its arm moves on a brass joint that never needs tightening.</p></section>
<section id="specs"><h2>Specifications</h2><p>Height 46 cm. Shade 22 cm across. Warm white light, dimmable, with a cable in cotton braid.</p></section>
<section id="order"><h2>Order</h2><p>Ships in two weeks from the workshop.</p></section>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// ?pause stops drawing while the hero is scrolled out of view.
const PAUSE = new URLSearchParams(location.search).has('pause');

const hero = document.getElementById('hero');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(hero.clientWidth, hero.clientHeight);
hero.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1ec);
const camera = new THREE.PerspectiveCamera(35, hero.clientWidth / hero.clientHeight, 0.1, 50);
camera.position.set(0, 1.2, 6);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x998877, 2.5));

// The lamp: a base, an arm and a glass shade.
const lamp = new THREE.Group();
lamp.name = 'lamp';
const oak = new THREE.MeshStandardMaterial({ color: 0xa0703c, roughness: 0.6 });
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.2, 48), oak);
base.position.y = 0.1;
const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 16), oak);
arm.position.y = 1;
const shade = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd28a, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
shade.position.y = 1.8;
shade.rotation.x = Math.PI;
lamp.add(base, arm, shade);
scene.add(lamp);

const draw = () => { lamp.rotation.y += 0.01; renderer.render(scene, camera); };
renderer.setAnimationLoop(draw);
if (PAUSE) {
  // Draw only while some of the hero is on screen.
  new IntersectionObserver(([entry]) => renderer.setAnimationLoop(entry.isIntersecting ? draw : null)).observe(hero);
}
addEventListener('resize', () => {
  renderer.setSize(hero.clientWidth, hero.clientHeight);
  camera.aspect = hero.clientWidth / hero.clientHeight;
  camera.updateProjectionMatrix();
});
</script>
</body></html>
```

## The tool calls, in order

These replies were captured on 2026-10-28 on a Linux server with no GPU, so Chrome drew the page in software (SwiftShader). The megabytes and the render counts do not depend on that. The frame times in the `perf` reply are a software renderer's and are not used, and the network timings are Chrome's throttling of this host's connection, not a phone's network. Run folder paths are shortened to `<project>`, and replies are cut to the lines this guide discusses, with nothing reworded.

**1. Weigh the first visit.**

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:37435/index.html in 0.2 s, paused at frame 0.
Page text outside the canvas: 1 h1, 3 h2, 65 words

perf {"budget": "site"}

21.5 ms median frame (p95 33.6 ms, 46 fps on average), 3 draw calls, 2512 triangles, 0 MB assets; over budget: frameMs 21.5 of 16.7 ms, scriptMB 2.02 of 1 MB; site budget; software renderer (no GPU): frame time is no budget signal, do not optimize for it
Largest scripts: three.core.js 1.39 MB, three.module.js 0.63 MB. Fix: serve a production build (vite build minifies three.js and drops what the page does not import), compressed.
First scene frame: 2.7 s after navigation on fast-4g, a first visit with no cache (scripts 2.02 MB by 2.7 s).
```

The page's own text is 65 words; its script is 2.02 MB of three.js, twice the site budget, and the scene's first frame waits for all of it. The frame time is over budget because this host has no GPU, as the reply says. The fix the reply names, a production build, is shown step by step with its before and after in [three.js model loading slow](/guides/threejs-model-loading-slow), which also covers a model too large for the asset budget; this page has no model file.

**2. Count the draws after the visitor scrolls past.** Thirty frames at the top, then a scroll to the specifications and sixty frames more, reading the renderer's count of `render()` calls before and after:

```text
interact {"steps": [{"wait": 30}]}

eval {"code": "return { framesDrawn: renderer.info.render.frame, scrollY: Math.round(scrollY) }"}

{"framesDrawn":30,"scrollY":0}

interact {"steps": [{"scroll": {"to": "#specs"}}, {"wait": 60}]}

{"after":null,"changed":{}}
Scroll: 971 of 971 px (100%)

eval {"code": "return { framesDrawn: renderer.info.render.frame, scrollY: Math.round(scrollY) }"}

{"framesDrawn":91,"scrollY":971}
```

The hero is a full screen tall and the page is scrolled 971 pixels, so the hero is out of view, and the renderer drew 61 more frames of it: one for every frame after the scroll. On a phone that is the GPU and the main thread busy for the whole time the visitor reads.

**3. The same calls with the pause.** On `index.html?pause`:

```text
interact {"steps": [{"wait": 30}]}

eval {"code": "return { framesDrawn: renderer.info.render.frame, scrollY: Math.round(scrollY) }"}

{"framesDrawn":30,"scrollY":0}

interact {"steps": [{"scroll": {"to": "#specs"}}, {"wait": 60}]}

{"after":null,"changed":{}}
Scroll: 971 of 971 px (100%)

eval {"code": "return { framesDrawn: renderer.info.render.frame, scrollY: Math.round(scrollY) }"}

{"framesDrawn":30,"scrollY":971}
```

No draw after the scroll. The observer is one statement in the page: it hands `setAnimationLoop` the draw function while any part of the hero is on screen and `null` while none is. Scrolling back up starts it again. A hero that animates nothing by itself (a model the visitor turns by dragging) can go further and draw on demand, by calling `render()` from the controls' `change` event instead of running a loop at all.

## Other levers, and which tool shows each

| Lever | What it changes | Shown by |
|---|---|---|
| A production build, compressed by the host | the script's megabytes | `perf` with `budget: "site"` (`scriptMB`, `Largest scripts`) |
| A smaller model and textures | the assets' megabytes | `perf` (`assetMB`) and `model_audit` with `shrink` |
| Pausing the loop off screen | draws while the visitor reads | `interact` with `scroll`, then `eval` of `renderer.info.render.frame` |
| The hero's size set in CSS | layout shift when the scene appears | `look` with `opening: true`, which pictures the first seconds |
| `<link rel="preload">` for the model | when the model's download starts | `open` or `perf` with `network`, whose first-frame line lists the bytes by when they arrived |
| Loading three.js when the 3D section nears the viewport (`import()` from an `IntersectionObserver`) | the script a visitor downloads before reading | the same first-frame line |

The last three were not measured on this page. The preload and the deferred import change when bytes arrive on a throttled link, so judge them with the first-frame line on the deployed site rather than from first principles: on a slow link a preloaded model also competes with the script for the same bandwidth.

## What paprika3d does not do

- It does not run Lighthouse, PageSpeed Insights or any web vitals measure, and gives no score. It has no figure for the largest content, the blocked time or the layout shift. The skill's configurator reference names Lighthouse for scores, on the URL that `open` serves.
- Its network presets are Chrome's throttling of the machine it runs on, and its server sends files uncompressed, so the script megabytes are an upper bound for a host that compresses.
- It does not test on a phone. The `mobile` budget is a set of limits applied to a frame measured on the machine's own GPU, and the reply says so.
- It does not change the page. The agent adds the observer or the build and measures again.

## Pitfalls

- **Pause the loop, not the page.** `setAnimationLoop(null)` stops the drawing; the scene, the renderer and the GPU memory stay, so scrolling back shows the hero at once.
- **Size the hero in CSS.** A hero whose height is set by the script takes no room until the script runs, then pushes the text down when the renderer sets its size.
- **Count the hero's work once the page is read, not just at load.** A loop that keeps drawing after the visitor scrolls away is invisible in a first-visit timing, and it is what the scroll lag threads describe.
- **A capped pixel ratio still matters.** The hero is usually the largest element on the page, so its drawing buffer is the largest thing the GPU fills each frame; `Math.min(devicePixelRatio, 2)`, as in the page above, keeps a phone from drawing it at three times its CSS size.

## Without paprika3d

Lighthouse in Chrome, or `npx lighthouse <url>`, gives the score and the metrics, and its diagnostics name the long tasks and the largest scripts. The browser's performance panel, recording while you scroll, shows whether animation frames keep firing with the hero off screen. In the page, logging `renderer.info.render.frame` before and after a scroll gives the same count as steps 2 and 3. A bundle analyser (`vite build` with `rollup-plugin-visualizer`) shows what the script's megabytes are made of.
