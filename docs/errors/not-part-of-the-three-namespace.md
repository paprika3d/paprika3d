---
title: three.js in React Three Fiber, is not part of the THREE namespace? Extend the class or move the HTML out
phrase: is not part of the three namespace
description: Why React Three Fiber throws "R3F: Div is not part of the THREE namespace! Did you forget to extend?", the catalogue lookup in R3F 9 that throws it, the two usual causes (HTML inside the Canvas, an addon class never passed to extend), the TypeScript errors that go with them, and what the paprika3d plugin's open and look replies show.
meta: React Three Fiber "is not part of the THREE namespace! Did you forget to extend?": HTML inside the three.js Canvas, or an addon never passed to extend().
intent: error-not-part-of-the-three-namespace
message: "R3F: Div is not part of the THREE namespace! Did you forget to extend? See: https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively"
queries:
  - 'react-three fiber shows: "Uncaught Div is not part of the THREE namespace! Did you forget to extend?"'
  - "The React Three Fiber mesh tag is unrecognized in this browser"
  - "Property 'unrealBloomPass' does not exist on type 'JSX.IntrinsicElements'."
  - "Property 'primitive' does not exist on type 'JSX.IntrinsicElements'."
author: paprika3d agent
date: 2026-10-28
review: weekly
---
# R3F: Div is not part of the THREE namespace! Did you forget to extend? See: https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively

React Three Fiber throws this when a JSX element inside `<Canvas>` has no three.js class behind it. Inside the Canvas every lowercase tag is a three.js object: `<mesh>` is `new THREE.Mesh()`, `<boxGeometry>` is `new THREE.BoxGeometry()`. A tag R3F cannot match, such as an HTML `<div>` or an addon like `<roundedBoxGeometry>` that nobody registered, stops the render, and the whole Canvas unmounts with it. The name in the message is the tag with its first letter raised: `Div`, `RoundedBoxGeometry`, `UnrealBloomPass`.

## Where React Three Fiber throws it

R3F keeps a catalogue of constructors. At start-up it holds everything `three` exports, and `extend()` adds more. Each element's type is looked up there by its PascalCase name; this is `validateInstance` in `@react-three/fiber` 9.8.1:

```js
const catalogue = {};
const toPascalCase = type => `${type[0].toUpperCase()}${type.slice(1)}`;
function extend(objects) {
  if (isConstructor(objects)) {
    const Component = `${i++}`;
    catalogue[Component] = objects;
    return Component;
  } else {
    Object.assign(catalogue, objects);
  }
}
function validateInstance(type, props) {
  const name = toPascalCase(type);
  const target = catalogue[name];
  if (type !== 'primitive' && !target) throw new Error(`R3F: ${name} is not part of the THREE namespace! Did you forget to extend? See: https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively`);
```

So the check is one lookup. `div` becomes `Div`, which `three` does not export. `roundedBoxGeometry` becomes `RoundedBoxGeometry`, which lives in `three/addons/`, outside the core, so it joins the catalogue when `extend({ RoundedBoxGeometry })` runs, and not before. Importing the class is not enough: the import puts it in your module, not in R3F's catalogue. `<primitive object={...}>` skips the lookup, which is the other way to put an object you made yourself into the scene.

## Why the element is not in the catalogue

- **HTML inside the Canvas.** A label, a button or a loading message written as a `<div>` between `<Canvas>` and `</Canvas>`. React DOM never sees it: R3F's renderer does, and every tag it handles must name a three.js class.
- **An addon used as a tag without `extend`.** `OrbitControls`, `RoundedBoxGeometry`, `TextGeometry`, the post-processing passes and every other file in `three/addons/` (`examples/jsm/`) need registering first. A library such as drei wraps many of them as components and registers them itself, which is why the same tag works in one project and throws in another.
- **A misspelt or wrongly cased tag.** `<meshStandardMaterail>` or `<MeshBasicMaterial>` (capital M, which React reads as a component) find no class either.

## Three pages that show it

paprika3d is a Claude Code plugin and MCP server that runs an app's own dev server and opens the page in a headless Chrome of its own, paused at frame 0. These are replies from the stable build on 2026-10-28, with Vite, React 19, R3F 9.8.1 and three r186, on a host with no GPU. The run folder shows as `<project>`; replies are cut to the lines this page explains, none reworded. R3F 9.8.1 still creates a `THREE.Clock`, so each reply also has the [THREE.Clock deprecation warning](/errors/clock-module-has-been-deprecated), cut here.

**A `<div>` inside the Canvas,** next to a mesh:

```tsx
<Canvas camera={{ position: [2.5, 2, 3] }}>
  <hemisphereLight args={['#ffffff', '#334455', 2]} />
  <mesh name="button">
    <boxGeometry args={[1.6, 0.6, 1.6]} />
    <meshStandardMaterial color="#d9643a" />
  </mesh>
  <div className="label">Press to start</div>
</Canvas>
```

```text
open {"command":"bunx vite --port 5871 --strictPort","cwd":"<project>"}

Opened http://localhost:5871/ in 0.7 s, paused at frame 0.
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
R3F: Div is not part of the THREE namespace! Did you forget to extend? See: https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively (×2)

observe {}

{"entities":{},"harness":{"frame":0,"renderer":{"calls":0,"triangles":0,"textures":0,"geometries":0,"programs":0},"scene":{"objects":0,"meshes":0,"lights":0,"cameras":0},"errors":["R3F: Div is not part of the THREE namespace! Did you forget to extend? See: https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively (×2)"],"changed":null}}
```

The mesh written before the `<div>` is gone too: `observe` counts no objects at all in the scene, because the throw unmounted the Canvas's whole tree. The `×2` is React retrying the render once before it gives up.

**An addon tag with the class imported but not registered,** and a prop type from R3F 8:

```tsx
import type { MeshProps } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function Button(props: MeshProps) {
  return (
    <mesh {...props}>
      <roundedBoxGeometry args={[1.6, 0.6, 1.6, 4, 0.15]} />
      <meshStandardMaterial color="#d9643a" />
    </mesh>
  );
}
```

```text
open {"command":"bunx vite --port 5871 --strictPort","cwd":"<project>"}

Opened http://localhost:5871/ in 0.6 s, paused at frame 0.
src/main.tsx:3 uses MeshProps, removed in React Three Fiber 9: use ThreeElements['mesh'] (and so on for each element)
Page text outside the canvas: none
{"three":"186","scenes":1,"entities":[]}
Errors so far:
R3F: RoundedBoxGeometry is not part of the THREE namespace! Did you forget to extend? See: https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively (×2)
```

The `MeshProps` line is from `open` reading the project's source: R3F 9 dropped the per-element prop types, and since the import is a type, nothing at run time would ever mention it.

**The mirror case: three.js tags outside the Canvas.** A `<mesh>` placed after `</Canvas>` goes to React DOM, which knows no such HTML tag. The page runs, nothing draws, and React logs a warning per tag, which Vite's dev server echoes back into `open`'s reply:

```text
Dev server: 10:25:38 AM [vite] (client) [console.error] The tag <boxGeometry> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
Dev server: 10:25:38 AM [vite] (client) [console.error] The tag <mesh> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
{"three":"186","scenes":1,"entities":[]}
```

## The TypeScript twin

The same two mistakes fail the type check before they fail in the browser. paprika3d does not type-check: `open` runs the page, and the agent runs `tsc` itself. TypeScript's own output on the second page:

```text
src/main.tsx(3,15): error TS2305: Module '"@react-three/fiber"' has no exported member 'MeshProps'.
src/main.tsx(9,7): error TS2339: Property 'roundedBoxGeometry' does not exist on type 'JSX.IntrinsicElements'.
```

R3F's JSX types list the core classes and no addons. An extended class needs a matching entry in the `ThreeElements` interface, typed with `ThreeElement<typeof TheClass>`; that is also the fix for `unrealBloomPass` in the thread below. `primitive` is in R3F's own list (`ThreeElements` in `three-types.d.ts`), so when TypeScript reports it missing, the cause is that list not reaching the compiler rather than any `extend`.

## The fix

Register each addon once with `extend`, give its tag a `ThreeElements` entry, type props with `ThreeElements['mesh']`, and keep HTML outside the Canvas, layered over it with CSS (drei's `<Html>` puts DOM at a point in the scene, if drei is installed):

```tsx
// verify: inline
import { createRoot } from 'react-dom/client';
import { Canvas, extend, type ThreeElement, type ThreeElements } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// R3F's catalogue holds the core three classes; an addon is registered once, and its element is the camelCase name
extend({ RoundedBoxGeometry });

// the matching JSX element for TypeScript
declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: ThreeElement<typeof RoundedBoxGeometry>;
  }
}

function Button(props: ThreeElements['mesh']) {
  return (
    <mesh {...props}>
      <roundedBoxGeometry args={[1.6, 0.6, 1.6, 4, 0.15]} />
      <meshStandardMaterial color="#d9643a" />
    </mesh>
  );
}

const label = { position: 'absolute', top: 24, left: 24, color: '#fff', font: '16px sans-serif' } as const;

createRoot(document.getElementById('root')!).render(
  <>
    <Canvas camera={{ position: [2.5, 2, 3] }}>
      <color attach="background" args={['#1d2128']} />
      <hemisphereLight args={['#ffffff', '#334455', 2]} />
      <Button name="button" />
    </Canvas>
    <div style={label}>Press to start</div>
  </>,
);
```

`tsc` reports nothing on this file, and the page draws:

```text
open {"command":"bunx vite --port 5871 --strictPort","cwd":"<project>"}

Opened http://localhost:5871/ in 0.5 s, paused at frame 0.
Page text outside the canvas: 0 h1, 0 h2, 3 words
{"three":"186","scenes":1,"entities":["button"]}

look {}

HTML over the canvas: 1 (div via page), 0 overlap, 0 off-screen, 0 cut off: div "Press to start" [24, 24, 117, 41].
On screen (1):
button 2.9% [509, 329, 766, 500]
Never visible: none
```

The `button` mesh with its rounded box is on screen, and the label is listed as HTML over the canvas, with its box, where it belongs. paprika3d names the error and the stale type import; it does not register classes or move elements, which is the agent's edit.

## Where people ask about it

These threads quote the message or its TypeScript twin; each count was read on 2026-10-28.

- [react-three fiber shows: "Uncaught Div is not part of the THREE namespace! Did you forget to extend?"](https://stackoverflow.com/questions/68840056/react-three-fiber-shows-uncaught-div-is-not-part-of-the-three-namespace-did-y) (Stack Overflow, 10,924 views)
- [The React Three Fiber mesh tag is unrecognized in this browser](https://stackoverflow.com/questions/75655381/the-react-three-fiber-mesh-tag-is-unrecognized-in-this-browser) (Stack Overflow, 9,340 views)
- [Property 'unrealBloomPass' does not exist on type 'JSX.IntrinsicElements'.](https://discourse.threejs.org/t/property-unrealbloompass-does-not-exist-on-type-jsx-intrinsicelements/44797) (discourse.threejs.org, 5,147 views, 3 posts)
- [Property 'primitive' does not exist on type 'JSX.IntrinsicElements'.](https://github.com/pmndrs/react-three-fiber/issues/3420) (GitHub, 2 comments)
