---
title: three.js WARNING: Multiple instances of Three.js being imported, find the second copy
phrase: multiple instances of three.js being imported
description: What the three.js warning "Multiple instances of Three.js being imported" means, the check in Three.Core.js that prints it, the import paths that load three twice, and how the paprika3d plugin's open and eval replies name both copies.
meta: How to fix three.js "THREE.WARNING: Multiple instances of Three.js being imported": what triggers it, the line that prints it, and the fix in code.
intent: error-multiple-instances
message: THREE.WARNING: Multiple instances of Three.js being imported.
queries:
  - "WARNING: Multiple instances of Three.js being imported"
  - "Threejs custom lib usage generate `WARNING: Multiple instances of Three.js being imported.`"
  - "`import from 'three/tsl'`, WARNING: Multiple instances of Three.js being imported"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.WARNING: Multiple instances of Three.js being imported.

This console warning means the browser evaluated the core of three.js twice on one page, from two different URLs. Each copy has its own classes, its own `ColorManagement` and `Cache` settings and its own shader cache, and the page downloads the library twice. Many pages keep working with the warning, which is why it is easy to ignore, but code that compares classes across the two copies breaks in ways that are hard to trace.

## Where three.js prints it

The last lines of `src/Three.Core.js` (three r186) run once each time the module is evaluated. The first copy writes its revision to `window.__THREE__`; any later copy finds it there and warns:

```js
if ( typeof window !== 'undefined' ) {

	if ( window.__THREE__ ) {

		warn( 'WARNING: Multiple instances of Three.js being imported.' );

	} else {

		window.__THREE__ = REVISION;

	}

}
```

`warn()` from `src/utils.js` prefixes `THREE.`, which gives the doubled `THREE.WARNING:` people search for. In r186 that code ships inside `build/three.core.js`, which `three.module.js` and `three.webgpu.js` both import with the relative path `./three.core.js`. Loading both of those from the same folder is therefore fine: the browser evaluates a module once per URL. The warning appears when the same file is reached under two URLs, so the check is about paths, not about how many entry files the page imports.

## Why three ends up loaded twice

- **A local copy next to an import map or a bundler.** Code imports `./js/three.module.js`, a file copied into the project, while the addons import the bare name `three`, which the import map or the bundler resolves to `node_modules`. Two URLs, two cores.
- **A CDN URL mixed with a package.** One file imports from `https://cdn.jsdelivr.net/npm/three@0.186.0/...` and another from `three`. Different versions in the two URLs make it worse, since the addon and the core then disagree about the API.
- **A library that bundles three inside itself.** A component library or viewer built with three included, rather than marked as external or as a peer dependency, carries its own core. The thread about a custom library is this case.
- **Mismatched map entries for the WebGPU build.** Mapping `three` to one folder or version and `three/webgpu` or `three/tsl` to another loads two `three.core.js` files.

## A page that reproduces it

The page maps `three` and `three/addons/` to `node_modules` in its import map, as the addons expect, but its own code imports a copy of the build that was placed in `js/`:

```js
import * as THREE from './js/three.module.js'; // a copied build, not the import map's three
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // imports 'three': the node_modules copy
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome on a paused clock. The calls here ran on 2026-10-28 with the stable build, on a machine with no GPU; the run folder is shortened to `<project>` and replies are cut to the lines this page talks about, with no line reworded.

```text
open {"url": "index.html", "cwd": "<project>"}

Opened http://127.0.0.1:37005/index.html in 0.2 s, paused at frame 0.
three.js warned: THREE.WARNING: Multiple instances of Three.js being imported.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["lamp"]}

look {}

On screen (1):
lamp 8.9% [488, 225, 783, 597]
Never visible: none
```

The warning fires while modules load, before the first frame, so `open` reports it as a `three.js warned:` line. `look` then shows the rounded box drawn normally, which matches what people report: the scene looks right and the warning seems harmless. To see the two copies, `eval` reads the browser's list of loaded files:

```text
eval {"code": "return performance.getEntriesByType(\"resource\").filter(e => /three\\.(module|core)/.test(e.name)).map(e => new URL(e.name).pathname + \" \" + (e.decodedBodySize / 1e6).toFixed(2) + \" MB\")"}

["/js/three.module.js 0.66 MB","/node_modules/three/build/three.module.js 0.66 MB","/js/three.core.js 1.46 MB","/node_modules/three/build/three.core.js 1.46 MB"]
```

Both cores came in, so the page parsed 1.46 MB of core twice. A second `eval` shows the class split. The mesh was made by the copy in `js/`, while the geometry came from the addon, which used the import map's copy, and `THREE` inside `eval` is the import map's copy:

```text
eval {"code": "const m = find(\"lamp\"); return { meshFromOtherCopy: !(m instanceof THREE.Mesh), isMesh: m.isMesh, geometryFromImportMap: m.geometry instanceof THREE.BufferGeometry }"}

{"meshFromOtherCopy":true,"isMesh":true,"geometryFromImportMap":true}
```

The `isMesh` flag still reads true, and three's own code mostly checks flags like it, which is why the scene draws. An `instanceof THREE.Mesh` test in game code, or a setting such as `THREE.ColorManagement.enabled` changed on one copy, silently disagrees with objects from the other. The replies do not say which import line pulled in the second copy; the two paths in the resource list are what point at it.

## The fix

Import three through one name everywhere, here the import map's `three`, and delete the copied build so nothing can reach it again. In a bundled project, mark three as external or a peer dependency in any library you build, and check that the lockfile lists one version of `three`.

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Lamp</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2128);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 1.5, 3);
const controls = new OrbitControls(camera, renderer.domElement);

const lamp = new THREE.Mesh(new RoundedBoxGeometry(1, 1.4, 1, 4, 0.15), new THREE.MeshStandardMaterial({ color: 0xe0b050 }));
lamp.name = 'lamp';
scene.add(lamp);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
</script>
</body></html>
```

With one import path, `open` prints no `three.js warned:` line, `look` shows the same `lamp 8.9%`, and the resource list holds one copy of each file:

```text
eval {"code": "return performance.getEntriesByType(\"resource\").filter(e => /three\\.(module|core)/.test(e.name)).map(e => new URL(e.name).pathname)"}

["/node_modules/three/build/three.module.js","/node_modules/three/build/three.core.js"]
```

A warning that remains after this comes from a dependency: search the built files or `node_modules` for a second file that sets `window.__THREE__`, and make that package use the project's three.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [WARNING: Multiple instances of Three.js being imported. (?)](https://discourse.threejs.org/t/warning-multiple-instances-of-three-js-being-imported/24191) (discourse.threejs.org, 21,582 views, 4 posts)
- [WARNING: Multiple instances of Three.js being imported](https://stackoverflow.com/questions/67271915/warning-multiple-instances-of-three-js-being-imported) (Stack Overflow, 10,821 views, 2 answers)
- [Threejs custom lib usage generate `WARNING: Multiple instances of Three.js being imported.`](https://discourse.threejs.org/t/threejs-custom-lib-usage-generate-warning-multiple-instances-of-three-js-being-imported/35292) (discourse.threejs.org, 6,020 views, 4 posts)
- [`import from 'three/tsl'`, WARNING: Multiple instances of Three.js being imported](https://discourse.threejs.org/t/import-from-three-tsl-warning-multiple-instances-of-three-js-being-imported/70303) (discourse.threejs.org, 2,575 views, 16 posts)
- ["Multiple instances of Three.js being imported" from CDN](https://github.com/mrdoob/three.js/issues/21167) (GitHub, 8 comments)
