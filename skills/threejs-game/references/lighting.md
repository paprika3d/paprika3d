# Lighting and composition

For any three.js page: a game, a product viewer, a data scene, a landing page. Every `look` reports the lines named below.

## Reading a look

The fault lines (`Lighting:`, `Surfaces:`, `Surface:`) name a setup error: fix each one before judging the picture, unless you broke the rule on purpose (see the end of this page). The other lines are information to act on.

### Closing a fault line

Each fault line names what to change. The `Surfaces:` line and the shadow caster line also name the objects, where they are and the numbers (the plane and the gap the depth buffer needs, the edge each caster is past and the shadow camera's extent), so the fix is a number. The steps that close one, and what each shows:

1. `look { zoom: [left, top, right, bottom] }` on the box the `On screen` list gives for an object the line names: the fault enlarged up to 4× (the stripes where two faces fight, a caster with no shadow).
2. `look { save: "before" }`: the picture as it is, kept as the baseline `before` with its frame.
3. One change in the source, the one the line names (`polygonOffset`, a position off the plane by the gap given, a shadow camera edge widened past the caster).
4. `look`: `Closed since the last look: Surfaces: …` for each line that is gone, when the sources changed since the last look and both were taken at the same frame without moving the camera; a fault line that repeats the last look's is said once, as `Surfaces: the same line as the last look, still open.` The after-edit hook rechecks the `Lighting:` and `Surfaces:` lines on the freshly reloaded page after every edit, without a picture, and speaks only when one closes or opens against the last recheck or a look from that same freshly reloaded frame; a fault that needs play to show is not seen there.
5. `look { compare: "before" }`: the share of pixels that differ from the baseline and a diff picture, so a fix that moved more than its object shows.
6. `test` reruns the saved checks, when the change touched play.

A glitch no line names (a seam, a missing shadow, an object through another, HUD text over the subject, a control that does nothing when `interact` clicks it) is closed the same way from the critic's description or your own: `zoom` on it, one change, `look` again.

### What every line means

- `On screen` and `Never visible`: each named object's share of the frame and its box in pixels, and the named objects no look has seen. A subject under about 2% of the frame is too small to play.
- `Subject` and `Stands out:` the object `window.__game.subject` names: its share, the parts something covers, and its brightness and colour against a ring around it.
- `Depth:` the nearest third of named objects against the farthest third (9 or more on screen).
- `Pixels:` brightness, colour saturation, near-black and blown-out shares of the frame, and how much changed since the last look. When these numbers and `Stands out:` are within 5 points of the last look's and flag nothing, one line says so (`Pixels, Hues, Stands out: as the last look`): what you changed did not move them.
- `Hues:` the whole frame's hues, then the hues over the pixels the objects drew, with their share of the frame; when one object covers over half the frame (a ground, a sky), the objects' part leaves it out and names it ("over the objects but ground"), so the colours of what stands on it show. On a dark scene with small bright objects, read the objects' part: "Mostly black: the objects cover N% of the frame" means a dark background with lit objects, not a blank frame.
- `Lighting:` tone mapping, colour spaces, metal with no environment, shadow casters outside the shadow camera. `Surfaces:` faces on one plane, of two meshes or inside one merged mesh, that flicker against each other (z-fighting), with the gap the depth buffer needs at that distance; `Surfaces: not checked for N of M meshes` means the check reached its work or triangle limit first, so a fight on those meshes is not named. `Surface:` the largest object's texture repeats, reads as noise or as flat colour.
- `Canvas:` the drawing buffer against the CSS size and pixel ratio, and whether a resize handler ran or the buffer is a fixed size CSS scales at its own shape (left out when it repeats the last look's).
- `Known, intentional:` how many lines and never-visible names `window.__game.intentional` left out, per piece (a piece of 6+ characters matches a line's words after its `Kind:`; a name must be exact); new faults still print in full.
- After an `interact`: `Motion` when the subject turned, or stopped while a key was still held (a test that ended against a wall is a test to rerun), and `Sound` with how many sounds the steps started, since none can be heard.

## Setup first

Setup faults flatten a picture whatever the art; the `Lighting:` lines (from `look`) and the OutputPass line (from `open`) name them. `stage()` from `fx.js` sets the setup up in one call: ACES tone mapping (set `renderer.toneMapping` after it for another, or `NoToneMapping` for flat bright colours), a PMREM environment and a key light whose shadow camera `fit(object)` sizes to the content.

```js
import { stage } from "./fx.js";
const { renderer, scene, camera, fit } = stage(); scene.add(level); fit(level);
```

By hand:

- Tone mapping: `renderer.toneMapping = THREE.ACESFilmicToneMapping` (or `AgXToneMapping`, or `NeutralToneMapping`, which keeps colours true but darkens a dark scene). Without it bright colours clip to white; ACES also mutes saturated colours, so a candy-bright stylised scene may want Neutral or none.
- With an `EffectComposer`, make `new OutputPass()` the last pass; since r155 tone mapping and the output colour space apply only there.
- Colour textures (`map`, `emissiveMap`) get `texture.colorSpace = THREE.SRGBColorSpace`; data textures (normal, roughness, metalness, ao) keep `NoColorSpace`.
- Metal and gloss need an environment map: bake a `RoomEnvironment` through `PMREMGenerator` into `scene.environment`, or metal draws black.
- Fit each shadow light's `shadow.camera` (left, right, top, bottom, near, far) to the content; a caster outside it casts no shadow. The line names each such caster with the edge it is past (`past its -z edge`, `beyond its far plane`) and the camera's extent, position and direction, so the fix is a number, not a search. In a large world, keep a small shadow camera around the player and move the light and `light.target` with it: `look` names only casters on screen that miss their shadow and are no farther from the camera, across the light and along the ground, than the shadow camera reaches.

## Four principles

- **The subject stands out from its surroundings.** The `Stands out:` line gives the subject's brightness and colour against a ring around it, and its edge contrast. It says "It blends in" when brightness and colour each differ by under 10 points and edge contrast is under 0.08; then light the subject brighter or darker than what is around it, or give it a colour the background lacks.
- **Don't light everything the same; the important thing is brightest.** Compare the subject's brightness on the `Stands out:` line with the frame's on the `Pixels:` line, and let other objects differ from each other.
- **Silhouettes read against the background.** A low edge contrast on the `Stands out:` line means the outline is lost: add a rim light behind the subject, or change the background's brightness.
- **Far things are lighter and paler than near ones.** The `Depth:` line compares the nearest third of objects with the farthest third. When depth does not read, add `scene.fog = new THREE.Fog(background, near, far)` in the background's colour, or lighten distant colours. A sky dome over a fogged scene bands at the horizon because fog is mixed in after tone mapping (three r186): give the dome material `toneMapped: false` and `fog: false` and colour its horizon with `scene.fog.color`, or use `scene.background = scene.fog.color` and no dome.

Check the `Hues:` line against the colours the request names: a "red" that reads as `magenta` or `grey` needs more saturation or a different light colour.

## When to break them

A low-key or horror scene, noir, a stylized flat look or a stealth game may want a dark frame, a subject that hides, or no fog. Break the principle on purpose, say so in a code comment, and move on.
