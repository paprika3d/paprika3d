---
title: three.js THREE.OBJLoader: Unexpected line <!DOCTYPE html>, the server sent a page instead of the OBJ
phrase: objloader: unexpected line
description: What three.js means by "THREE.OBJLoader: Unexpected line" followed by a line of HTML, why a dev server answers a missing OBJ file with its index page, where the file has to go, and how a coding agent spots the HTML answer with the paprika3d plugin's open and eval replies.
meta: How to fix three.js "THREE.OBJLoader: Unexpected line: '<!doctype html>'": what triggers it, the line that prints it, and the fix in code.
intent: error-objloader-unexpected-line
message: THREE.OBJLoader: Unexpected line: "<!doctype html>"
queries:
  - "Uncaught Error: THREE.OBJLoader: Unexpected line: <!DOCTYPE html>"
  - "OBJ model cannot be loaded Error:Unexpected line: <!DOCTYPE html>"
  - "OBJLoader with React, THREE, Parcel and react-three-fiber"
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# THREE.OBJLoader: Unexpected line: "<!doctype html>"

OBJLoader reads its file line by line and warns about every line that is not an OBJ statement. When the line it quotes is `<!doctype html>` or `<html>`, the file it received is a web page: the URL did not reach the OBJ file, and the server answered with its own HTML instead. The loader still calls `onLoad`, with an empty group, so the scene gets an object with nothing in it. Older three.js versions threw this as an error (`Uncaught Error`), which is the form many threads quote; r186 warns and carries on.

## Where three.js prints it

`OBJLoader.parse()` in `examples/jsm/loaders/OBJLoader.js` (three r186) splits the text on newlines, skips blank lines and `#` comments, and matches each line by its first character: `v`, `f`, `l`, `p`, `o` or `g`, `usemtl`, `mtllib` and `s`. A line that matches none of them reaches the last branch:

```js
} else {

	// Handle null terminated files without exception
	if ( line === '\0' ) continue;

	console.warn( 'THREE.OBJLoader: Unexpected line: "' + line + '"' );

}
```

There is one warning per line, so an HTML answer prints a warning for most of its lines. The browser groups repeats, which is why the console often shows a handful of these with a count beside them.

## Why OBJLoader gets HTML

- **A single-page-app dev server.** Vite (as the capture below shows), Create React App and Parcel answer a path they cannot find with `index.html` and status 200, so the page's own HTML comes back as the "model". Nothing fails at the network level, and there is no 404 to see.
- **The file is outside the folder the server serves.** In a Vite or React project, a model next to the source files is bundled when code imports it, and a plain URL string needs the file in `public/`. A model in `src/` is the usual cause.
- **A relative URL from a nested route.** `models/chair.obj` on a page at `/shop/item` resolves to `/shop/item/models/chair.obj`. Starting the URL with a slash, `/models/chair.obj`, avoids that.
- **Server-side rendering.** A framework that renders pages on the server can answer a missing asset with a rendered page too.

Lines that are not HTML have other causes: free-form curve statements (`cstype`, `curv`, `parm`, `end`) that three does not read, or a binary file (an FBX or GLB) given an `.obj` name, which prints garbage characters in the quotes.

## A page that reproduces it

The page loads `models/chair.obj` with OBJLoader. The project runs on Vite's dev server and has no such file:

```js
new OBJLoader().load('models/chair.obj', (obj) => {
  obj.name = 'chair';
  scene.add(obj);
});
```

paprika3d is a Claude Code plugin and MCP server that opens a three.js page in its own headless Chrome, paused at frame 0, here through the project's own dev server with `open` and `command`. The replies below are from the stable build on 2026-10-28, on a machine with no GPU, with the folder written as `<project>`, the path to the vite binary written as `npx vite`, and the lines this page does not use left out; no line is reworded.

```text
open {"command": "npx vite --port 5317 --strictPort", "cwd": "<project>"}

Opened http://localhost:5317/ in 0.2 s, paused at frame 0.
three.js warned: THREE.OBJLoader: Unexpected line: "<!doctype html>"
three.js warned: THREE.OBJLoader: Unexpected line: "<html><head>"
three.js warned: THREE.OBJLoader: Unexpected line: "<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>"
three.js warned: THREE.OBJLoader: Unexpected line: "<script type="module" src="/@vite/client"></script>"
three.js warned: THREE.OBJLoader: Unexpected line: "<meta charset="utf-8"><title>Chair</title>"
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["chair"]}

look {}

On screen (0):
Never visible: none

eval {"code": "const r = await fetch(\"models/chair.obj\"); return { status: r.status, type: r.headers.get(\"content-type\"), children: find(\"chair\").children.length }"}

{"status":200,"type":"text/html","children":0}
```

`open` lists the warnings because they fire while the page sets up, before frame 0, and the lines it quotes are this very page's `index.html`, including the `/@vite/client` script that Vite adds to the pages it serves. There is no `Failed to load` line, since the request succeeded. `entities` lists `chair`, because `onLoad` ran, but `look` finds nothing on screen. The `eval` reply settles it: status 200, content type `text/html`, and a `chair` group with no children.

## The fix

Put the file where the server serves it as a file. In a Vite project that is `public/models/chair.obj`, which the dev server and `vite build` both serve at `/models/chair.obj`; Create React App and Parcel have the same kind of folder. With the file there, the same `open` through Vite gives:

```text
open {"command": "npx vite --port 5317 --strictPort", "cwd": "<project>"}

Opened http://localhost:5317/ in 0.2 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":["chair"]}

look {}

On screen (1):
chair 5.4% [488, 208, 792, 558]
Never visible: none

eval {"code": "const r = await fetch(\"models/chair.obj\"); return { status: r.status, type: r.headers.get(\"content-type\"), children: find(\"chair\").children.length }"}

{"status":200,"type":"model/obj","children":1}
```

No warnings, the chair on screen, and the content type is now `model/obj`. To keep the next wrong path from passing silently, fetch the file yourself and refuse an HTML answer before parsing it. The page below does that, with the OBJ inlined so it runs on its own:

```html
<!-- verify -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Chair</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2e36);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.2, 1.8, 3);
camera.lookAt(0, 0.5, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 4);
scene.add(sun);

// In a project this is 'models/chair.obj', kept in public/models/ so the dev server and the build
// both serve the file itself. Inlined here so the page runs on its own.
const CHAIR_OBJ = `# chair: a seat, a back and four legs
o chair
v -0.5 0.45 -0.5
v 0.5 0.45 -0.5
v 0.5 0.45 0.5
v -0.5 0.45 0.5
v -0.5 0.55 -0.5
v 0.5 0.55 -0.5
v 0.5 0.55 0.5
v -0.5 0.55 0.5
v -0.5 0.55 -0.5
v 0.5 0.55 -0.5
v 0.5 0.55 -0.4
v -0.5 0.55 -0.4
v -0.5 1.3 -0.5
v 0.5 1.3 -0.5
v 0.5 1.3 -0.4
v -0.5 1.3 -0.4
v -0.45 0 -0.45
v -0.35 0 -0.45
v -0.35 0 -0.35
v -0.45 0 -0.35
v -0.45 0.45 -0.45
v -0.35 0.45 -0.45
v -0.35 0.45 -0.35
v -0.45 0.45 -0.35
v -0.45 0 0.35
v -0.35 0 0.35
v -0.35 0 0.45
v -0.45 0 0.45
v -0.45 0.45 0.35
v -0.35 0.45 0.35
v -0.35 0.45 0.45
v -0.45 0.45 0.45
v 0.35 0 -0.45
v 0.45 0 -0.45
v 0.45 0 -0.35
v 0.35 0 -0.35
v 0.35 0.45 -0.45
v 0.45 0.45 -0.45
v 0.45 0.45 -0.35
v 0.35 0.45 -0.35
v 0.35 0 0.35
v 0.45 0 0.35
v 0.45 0 0.45
v 0.35 0 0.45
v 0.35 0.45 0.35
v 0.45 0.45 0.35
v 0.45 0.45 0.45
v 0.35 0.45 0.45
f 1 2 3 4
f 5 8 7 6
f 4 3 7 8
f 2 1 5 6
f 3 2 6 7
f 1 4 8 5
f 9 10 11 12
f 13 16 15 14
f 12 11 15 16
f 10 9 13 14
f 11 10 14 15
f 9 12 16 13
f 17 18 19 20
f 21 24 23 22
f 20 19 23 24
f 18 17 21 22
f 19 18 22 23
f 17 20 24 21
f 25 26 27 28
f 29 32 31 30
f 28 27 31 32
f 26 25 29 30
f 27 26 30 31
f 25 28 32 29
f 33 34 35 36
f 37 40 39 38
f 36 35 39 40
f 34 33 37 38
f 35 34 38 39
f 33 36 40 37
f 41 42 43 44
f 45 48 47 46
f 44 43 47 48
f 42 41 45 46
f 43 42 46 47
f 41 44 48 45
`;
const MODEL = 'data:model/obj,' + encodeURIComponent(CHAIR_OBJ);

// Refuse an HTML answer before OBJLoader reads it line by line.
async function loadOBJ(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '') || text.trimStart().startsWith('<')) {
    throw new Error(`${url.slice(0, 60)}: the server sent ${res.status} ${res.headers.get('content-type')}, not an OBJ file`);
  }
  return new OBJLoader().parse(text);
}

const chair = await loadOBJ(MODEL);
chair.name = 'chair';
scene.add(chair);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
</body></html>
```

With a check like this, a missing model stops the page with one error that names the URL, the status and the content type, instead of a run of warnings and an empty group.

## Where people ask about it

These threads quote the message; each count was read on 2026-10-28.

- [Uncaught Error: THREE.OBJLoader: Unexpected line: "\<!DOCTYPE html\>"](https://discourse.threejs.org/t/uncaught-error-three-objloader-unexpected-line-doctype-html/8604) (discourse.threejs.org, 6,687 views, 11 posts)
- [Error with SSR Three.js Objects](https://discourse.threejs.org/t/error-with-ssr-three-js-objects/8643) (discourse.threejs.org, 5,577 views, 35 posts)
- [OBJLoader with React, THREE, Parcel and react-three-fiber](https://stackoverflow.com/questions/56568535/objloader-with-react-three-parcel-and-react-three-fiber) (Stack Overflow, 4,291 views, 1 answer)
- [import LOCAL .obj to load with Three.js OBJLoader using React](https://stackoverflow.com/questions/48311840/import-local-obj-to-load-with-three-js-objloader-using-react) (Stack Overflow, 3,580 views, 1 answer)
- [OBJ model cannot be loaded Error:Unexpected line: "\<!DOCTYPE html\>"](https://discourse.threejs.org/t/obj-model-cannot-be-loaded-error-unexpected-line-doctype-html/13952) (discourse.threejs.org, 2,010 views, 3 posts)
