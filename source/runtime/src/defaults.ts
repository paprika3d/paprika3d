// Safe defaults most games leave on the table: cap the pixel ratio at 2 (retina phones and laptops report 3),
// compile every shader once up front with compileAsync so the first frames do not stall, and stop redrawing
// shadow maps while nothing that casts a shadow moves. Every scene rendered in a frame is checked, so post-processing
// (the game's scene to a render target, a quad to the screen) still sees the game's casters and compiles its scene.
// A game that runs shadow updates by hand (autoUpdate false, needsUpdate when it wants) is left alone.
// Skinned, morph, instanced and batched casters keep a constant matrixWorld while they animate, so any of them
// keeps shadows live. The instancing switch's groups are the exception: their originals stay in the scene, so a move
// or hide shows on them.
// shortcut: a caster that changes only its geometry or material while frozen keeps a stale shadow; set
// renderer.shadowMap.needsUpdate after such a change, or disable this switch.
import type { Object3D, Scene, WebGLRenderer } from "three";
import type { Switch } from "./index.ts";
import { isGroup } from "./instancing.ts";
import { freshen } from "./fresh.ts";

const CAP = 2, STILL_FRAMES = 60;

let setPixelRatio: WebGLRenderer["setPixelRatio"] | null = null;
let asked = 1, compiled = false, frozen = false, still = 0, moved = false;
let warm = new WeakSet<Scene>(), last = new WeakMap<Scene, { buf: Float64Array; n: number }>();

const animates = (o: any) => o.isSkinnedMesh || (o.isInstancedMesh && !isGroup(o)) || o.isBatchedMesh || !!o.morphTargetInfluences?.length;

/** The `defaults` switch: pixel ratio cap, one compileAsync warm-up, shadow freeze. */
export const defaults: Switch = {
  enable(r) {
    setPixelRatio = r.setPixelRatio;
    asked = r.getPixelRatio();
    r.setPixelRatio = (v: number) => { asked = v; setPixelRatio!.call(r, Math.min(v, CAP)); };
    r.setPixelRatio(asked);
    compiled = frozen = moved = false;
    still = 0;
    warm = new WeakSet();
    last = new WeakMap();
  },
  disable(r) {
    if (setPixelRatio) { r.setPixelRatio = setPixelRatio; r.setPixelRatio(asked); }
    setPixelRatio = null;
    if (frozen) r.shadowMap.autoUpdate = true;
    frozen = false;
  },
  before(r, scene, camera) {
    if (!warm.has(scene)) { warm.add(scene); r.compileAsync(scene, camera).then(() => { compiled = true; }, () => {}); }
    if (!r.shadowMap.enabled) return;
    freshen(scene); // matrices are compared before this render, so bring them up to date first
    // The casters' ids and matrices are compared with last frame's and written over them in one reused buffer, so a
    // still frame allocates nothing (5,000 casters: an 85,000-number array a frame before).
    const prev = last.get(scene);
    let buf = prev?.buf ?? new Float64Array(256), n = 0, changed = !prev, animating = false;
    const put = (v: number) => {
      if (n === buf.length) { const b = new Float64Array(buf.length * 2); b.set(buf); buf = b; }
      if (buf[n] !== v) { buf[n] = v; changed = true; }
      n++;
    };
    scene.traverseVisible((o: Object3D) => {
      if (!o.castShadow) return;
      if (animates(o)) animating = true;
      put(o.id);
      for (const v of o.matrixWorld.elements) put(v);
      // A directional or spot light's aim, read as is: one in the scene was just updated with it, and one outside it
      // keeps the matrix three's render uses (three never updates it), so updating it here would move the shadow.
      const target = (o as any).target as Object3D | undefined;
      if (target) for (const v of target.matrixWorld.elements) put(v);
    });
    if (n !== prev?.n) changed = true;
    last.set(scene, { buf, n });
    if (!animating && !changed) return;
    moved = true;
    if (frozen) { frozen = false; r.shadowMap.autoUpdate = true; } // before this render, so its shadows are redrawn
  },
  after(r) {
    still = moved ? 0 : still + 1;
    moved = false;
    if (!frozen && still >= STILL_FRAMES && r.shadowMap.enabled && r.shadowMap.autoUpdate) { frozen = true; r.shadowMap.autoUpdate = false; }
  },
  status: () => ({ pixelRatioCap: CAP, compiled, shadowsFrozen: frozen }),
};
