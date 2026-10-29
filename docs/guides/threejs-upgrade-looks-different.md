---
title: three.js upgrade looks different? Measure what each change did, between the old version and the new
phrase: three.js upgrade looks different
description: Why a scene looks darker or differently coloured after a three.js upgrade, and how a coding agent saves the old version's picture with the paprika3d plugin's look, compares the new version against it at the same frame, and closes the difference one change at a time, colour space, legacy lights and colour management, with the share of differing pixels and sampled colours after each fix.
meta: three.js upgrade looks different? Save the old look, compare the new version at the same frame, and fix colour space, lights and colours one at a time.
intent: upgrade-threejs-version-looks-different
queries:
  - "Strange differences between different three.js versions"
  - "I cannot show as expected color after upgrade to r118 from r110"
  - "Shadow and color problems going from v64 to v161"
  - "Upgrading three.js from 131 to 132 causes error in fragment shader for ShaderMaterial"
  - "Three.js migration from 127 -> 128 performance issues"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# three.js upgrade looks different? Measure what each change did, between the old version and the new

## Why one version bump changes several things at once

A jump of a few dozen three.js releases rarely breaks a page outright. It changes how the page looks, through two kinds of change that need different tools to find:

- **Removed API.** Code that names something gone, such as `renderer.outputEncoding` or `THREE.sRGBEncoding`, is in the source and can be found by reading it.
- **Changed defaults.** Code that names nothing gets a new behaviour anyway. Between r150 and r160, `THREE.ColorManagement.enabled` became `true`, so hex colours are now read as sRGB and converted, and r155 made physically correct lights the default, so light intensities tuned on the legacy lights draw dimmer. No line of the old page mentions either, so no search of the source finds them.

The way to separate them is a picture of the old version kept from before the upgrade, compared with the new one at the same frame, with one change fixed at a time and the comparison run again after each.

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, on a paused clock. `look` with `save` keeps a picture as a named baseline at its frame, `look` with `compare` reloads the page, steps to that frame and replies with the share of pixels that differ and a diff picture, and `look` with `sample` reads colours at points. `open` names removed three.js API by file and line and says which release is installed. The general use of baselines is in the [visual regression guide](/guides/visual-regression-test-threejs); this one is about crossing versions.

## Install

paprika3d needs Google Chrome and Node 20.11 or later, and the Claude Code plugin needs Claude Code 2.1.118 or later.

```bash
claude plugin marketplace add paprika3d/paprika3d
claude plugin install paprika3d@paprika3d
```

## 1. Save the old look before upgrading

A display scene written for r150: a floor, a plinth and a vase under an ambient, a directional and a point light, all tuned by eye on that release, and a sign painted in a canvas. Its colour lines are the r150 way:

```js
renderer.outputEncoding = THREE.sRGBEncoding;
scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const key = new THREE.DirectionalLight(0xffffff, 0.8);
const lamp = new THREE.PointLight(0xffd9a0, 0.9);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x8a8f99 }));
label.encoding = THREE.sRGBEncoding;
```

These replies were captured on 2026-10-28 with the stable build, on a Linux server with no GPU, with the project's `node_modules/three` at r150 for this step and at r186 for every later one. Run folder paths are shortened to `<project>`; replies are cut to the lines this guide discusses, none reworded.

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:45849/index.html in 0.2 s, paused at frame 0.
three r150 installed (current r186).
index.html:11 uses outputEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:11 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:50 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
{"three":"150","scenes":1,"entities":["floor","plinth","vase","sign"]}

look {"save":"r150"}

Saved as baseline r150: <project>/paprika3d/baselines/r150.png
Pixels: brightness 66%, colour saturation 12%, 0% near black, 1% blown out.
On screen (4):
floor 60% [0, 272, 1279, 799] 40 × 40 units
sign 4.7% [424, 7, 855, 118] 3 × 0.75 units, across the view
plinth 4.2% [502, 378, 777, 558]
vase 2.6% [563, 211, 716, 415]
Never visible: none
```

The baseline is a file in the project, so it outlives the old `node_modules`. One line in this reply is wrong for r150: the colour texture line. That check reads `texture.colorSpace`, which r150 textures do not have (they carry `encoding`), so on releases before r152 the line counts a correctly tagged texture; the picture shows the sign in its painted red. On a project already upgraded, install the old release for this one step (`npm install three@0.150.0`), save, and install the new one again.

## 2. Upgrade and compare

With r186 installed and no line of the page changed:

```text
open {"url":"index.html","cwd":"<project>"}

Opened http://127.0.0.1:35201/index.html in 0.2 s, paused at frame 0.
index.html:11 uses outputEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:11 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
index.html:50 uses sRGBEncoding, deprecated in r152 and removed in r162: use colorSpace (renderer.outputColorSpace, texture.colorSpace = SRGBColorSpace)
Lighting: 1 colour textures not tagged sRGB (texture.colorSpace = SRGBColorSpace): they draw washed out.
{"three":"186","scenes":1,"entities":["floor","plinth","vase","sign"]}

look {"compare":"r150"}

Compare: 72% of pixels differ from r150 (saved 2026-10-28, frame 1, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T10-36-25-103Z/look-1-diff.png
Pixels: brightness 30%, colour saturation 16%, 0% near black, 0% blown out.

look {"sample":[[200,650],[640,500],[640,300],[440,60]]}

Colours (5 × 5 mean, in the page's pixels): (200, 650) #515256, (640, 500) #716d66, (640, 300) #15355a, (440, 60) #e18272.
```

Nearly three quarters of the picture changed, and brightness fell from the r150 picture's 66% to 30%: the "darker after the upgrade" of the threads below. Here the texture line is right: on r186 the old `encoding` assignment sets nothing, and the sign drew washed out. The samples are the floor in the lamp's pool of light, the front of the plinth, the vase, and the sign's red.

## 3. Fix one change at a time

After each edit to the source, the next `look` reloads the page, and `compare` runs at the baseline's frame again:

| | floor | plinth | vase | sign | pixels that differ |
|---|---|---|---|---|---|
| r150 baseline | `#fcf7f0` | `#f1e9db` | `#85bce0` | `#c0392b` | |
| r186, page unchanged | `#515256` | `#716d66` | `#15355a` | `#e18272` | 72% |
| + colour space lines | `#515256` | `#716d66` | `#15355a` | `#c0392b` | 67% |
| + lights scaled as legacy | `#b4aca5` | `#e2d1b9` | `#3970a9` | `#c0392b` | 67% |
| + r150 colours read as linear | `#f8f3ec` | `#eee5d7` | `#83b9dc` | `#c0392b` | 0.046% |

**Colour space lines.** `renderer.outputEncoding` is deleted (the output is sRGB by default) and `label.encoding = THREE.sRGBEncoding` becomes `label.colorSpace = THREE.SRGBColorSpace`. The reply's stale lines and the texture line close, and the sign is its painted `#c0392b` again. The share falls by about the sign's area, since nothing else used a texture:

```text
Compare: 67% of pixels differ from r150 (saved 2026-10-28, frame 1, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T10-36-47-683Z/look-1-diff.png
```

**Lights.** r150's legacy lights multiplied every intensity by π, and its point light had no falloff with distance (`distance` 0). Nothing in the source names this, because the old page relied on a default. Scaling each intensity by `Math.PI` and giving the point light `decay` 0 restores the old light:

```text
Compare: 67% of pixels differ from r150 (saved 2026-10-28, frame 1, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T10-36-58-637Z/look-1-diff.png
```

The share did not move, and the samples show why: every surface came most of the way back (the floor from `#515256` to `#b4aca5`), but not close enough to count as the same pixel. A share of differing pixels says whether two pictures match; sampled colours say how far apart they are, which is the measure to watch while a fix is half done.

**Colours.** r150 ran with colour management off and read `0x8a8f99` as three linear numbers; r186 reads it as sRGB and converts it, which darkens every mid tone. Declaring each colour picked on r150 as linear gives the old numbers back without turning colour management off for the rest of the page:

```text
Compare: 0.046% of pixels differ from r150 (saved 2026-10-28, frame 1, 1280x800@1); diff at <project>/paprika3d/runs/2026-10-28T10-38-46-652Z/look-1-diff.png

look {"sample":[[200,650],[640,500],[640,300],[440,60],[100,150]]}

Colours (5 × 5 mean, in the page's pixels): (200, 650) #f8f3ec, (640, 500) #eee5d7, (640, 300) #83b9dc, (440, 60) #c0392b, (100, 150) #2a2f38.
```

The pixels left are the shadow's edge and the vase's rim in the diff picture, where the shadow filter itself changed between the releases. The background colour is left as a plain hex: a clear colour is not lit, so its hex showed as given on r150 too, and declaring it linear made the background the one region still red in the diff. Setting `THREE.ColorManagement.enabled = false` gave the same 0.046% in a separate run; the per-colour form keeps r186's handling for everything added later.

Whether to restore the old look at all is a design choice. Keeping the old numbers is right when the old picture is the approved one; for a page still being tuned, the r186 defaults are the ones three's docs, loaders and examples assume, and retuning lights and colours under them is the longer-lived fix. The comparison gives either choice a number.

## The migrated page

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Display</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';

// a colour picked on r150, which read hex values as linear numbers; colours picked from now on are plain sRGB hex
const r150 = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2f38); // a clear colour is not lit: its hex showed as given on r150 too
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 7);
camera.lookAt(0, 0.8, 0);

// lights tuned by eye on r150, scaled as its legacy lights were
scene.add(new THREE.AmbientLight(0xffffff, 0.25 * Math.PI));
const key = new THREE.DirectionalLight(0xffffff, 0.8 * Math.PI);
key.position.set(3, 5, 3);
key.castShadow = true;
scene.add(key);
const lamp = new THREE.PointLight(r150(0xffd9a0), 0.9 * Math.PI, 0, 0); // no falloff, as legacy lights had
lamp.position.set(-2, 2.5, 2);
scene.add(lamp);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: r150(0x8a8f99) }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.name = 'floor';
const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.6), new THREE.MeshStandardMaterial({ color: r150(0xe8e2d6) }));
plinth.position.y = 0.4;
plinth.castShadow = plinth.receiveShadow = true;
plinth.name = 'plinth';
const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.2, 48), new THREE.MeshStandardMaterial({ color: r150(0x2f6db5), roughness: 0.35 }));
vase.position.y = 1.4;
vase.castShadow = true;
vase.name = 'vase';

// the sign above, painted in a canvas
const c = document.createElement('canvas');
c.width = 256; c.height = 64;
const g = c.getContext('2d');
g.fillStyle = '#c0392b'; g.fillRect(0, 0, 256, 64);
g.fillStyle = '#f5e6c8'; g.fillRect(16, 16, 224, 32);
const label = new THREE.CanvasTexture(c);
label.colorSpace = THREE.SRGBColorSpace;
const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshBasicMaterial({ map: label }));
sign.position.set(0, 3, -1);
sign.name = 'sign';
scene.add(floor, plinth, vase, sign);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

## Shader errors and speed

A `ShaderMaterial` that includes a chunk three renamed fails to compile after the bump: the console names the include, and `open` reports the error; [Can not resolve #include](/errors/can-not-resolve-include) covers the renamed chunks. For speed, `perf` run before and after the bump on the same machine gives the frame time, draw calls and triangles on each release. This guide shows no frame times: the host draws in software, where they say nothing about a GPU.

## What paprika3d does not do

- It does not know three.js's migration guide. `open` names removed API in the source; a changed default shows as a difference in the comparison and nowhere else, and finding which default it was is the agent's work, as above.
- It sets no threshold. `compare` reports the share and the diff picture, and the agent decides what is close enough.
- It compares pictures of one size: open the page at the baseline's size and pixel ratio.

## Without paprika3d

Two browser tabs, one with each release through an import map, and a screenshot of each at the same moment, compared with an image diff tool, give the same share if the animation and any randomness are held still. three.js's migration guide on its GitHub wiki lists each release's breaking changes, and the release notes give the defaults that changed. For colours, `color.setHex(hex, THREE.LinearSRGBColorSpace)` and `renderer.useLegacyLights` (on releases that still have it) let one change be switched at a time.

## Where people ask about it

- [Upgrading three.js from 131 to 132 causes error in fragment shader for ShaderMaterial](https://discourse.threejs.org/t/upgrading-three-js-from-131-to-132-causes-error-in-fragment-shader-for-shadermaterial/29781) (discourse.threejs.org, 5,226 views, 7 posts)
- [Strange differences between different three.js versions](https://discourse.threejs.org/t/strange-differences-between-different-three-js-versions/1490) (discourse.threejs.org, 2,288 views, 7 posts)
- [Three.js migration from 127 -> 128 performance issues](https://discourse.threejs.org/t/three-js-migration-from-127-128-performance-issues/42083) (discourse.threejs.org, 1,651 views, 12 posts)
- [I cannot show as expected color after upgrade to r118 from r110](https://discourse.threejs.org/t/i-cannot-show-as-expected-color-after-upgrade-to-r118-from-r110/17265) (discourse.threejs.org, 1,213 views, 7 posts)
- [Shadow and color problems going from v64 to v161](https://discourse.threejs.org/t/shadow-and-color-problems-going-from-v64-to-v161/61640) (discourse.threejs.org, 664 views, 6 posts)
