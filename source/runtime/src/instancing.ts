// Auto-instancing: many meshes sharing one geometry and one material that stand still are drawn as one
// InstancedMesh2 (@three.ez/instanced-mesh, with per-instance frustum culling over a BVH) instead of one draw each.
// The originals stay in the scene as they were (not hidden, same layers), so the game's children, child lights,
// traverseVisible and raycasts behave as before; three's culling leaves them out of its render and shadow lists instead
// (the game's Mesh.prototype.intersectsFrustum, three r186+), and renderBufferDirect, which draws every object and every
// shadow, skips the rest (frustumCulled = false originals, older three). The instanced mesh is not raycastable, so
// nothing is hit twice.
// Every frame each grouped original is checked against what its instance shows: a moved, removed or re-materialled
// original is ejected (its instance removed, the original drawn again), and its visibility (with its ancestors') is
// copied to its instance. Every 120 frames, ungrouped meshes whose world matrix has not changed since the last pass
// are grouped, 20 or more per group. Scenes made by react-three-fiber are skipped: drei's <Instances> is the way there.
// The library is loaded when the switch is first enabled, since it patches three's shader chunks on load; its morph
// patch is then limited to its own meshes, so a game's morphed InstancedMesh still compiles.
// A group's geometry shares the originals' attributes and index (only the library's instanceIndex is its own), so a
// game that edits the shared geometry in place sees the edit on the instances too.
// shortcut: an attribute replaced with setAttribute on the shared geometry is not followed, and the group's bounds
// (for culling) are not recomputed after an edit that grows it; compare attribute objects in mirror() if a game does that.
// shortcut: on three before r186 (no intersectsFrustum) and for frustumCulled = false originals, a CPU cost stays per
// original (three still lists, sorts and calls onBeforeRender for each); patch projectObject's other test if that matters.
import { BufferGeometry, Object3D, ShaderChunk, type Mesh, type Scene, type WebGLRenderer } from "three";
import type { InstancedMesh2 } from "@three.ez/instanced-mesh";
import type { Switch } from "./index.ts";
import { freshen } from "./fresh.ts";

const PASS_EVERY = 120, MIN_GROUP = 20;

/** A group and what its members must still share with it to stay grouped (the fields `key` names, held directly so the
    per-frame mirror compares references instead of building a key string per member). */
interface Group { scene: Scene; key: string; members: Mesh[]; geometry: unknown; material: unknown; flags: number; mask: number; order: number }
interface Entry { im: InstancedMesh2; id: number; m: number[]; vis: boolean }

let IM: typeof InstancedMesh2 | null = null;
let draw: WebGLRenderer["renderBufferDirect"] | null = null;
let frame = 0, bypass = false, loading = false, error = "";
let groups = new Map<InstancedMesh2, Group>();
let grouped = new Map<Mesh, Entry>();
let still = new WeakMap<Mesh, number[]>(); // ungrouped candidates' world matrices at the last pass
let late = new WeakMap<Mesh, number[]>(); // and one frame before this pass, so something that moves and comes back by the pass is not still
let scenes = new Set<Scene>(); // scenes already checked this frame
let changes: Record<string, unknown>[] = [];
let cull: { proto: any; own: (f: unknown) => boolean } | null = null; // the patched intersectsFrustum and three's own

const BASE = Object3D.prototype as any;
/** What a group shares; a member whose key changes no longer looks like its instance. */
const key = (o: any) => `${o.geometry.uuid}|${o.material.uuid}|${+o.material.transparent}${+o.castShadow}${+o.receiveShadow}${+o.frustumCulled}|${o.layers.mask}|${o.renderOrder}`;
const flags = (o: any) => +o.castShadow | +o.receiveShadow << 1 | +o.frustumCulled << 2;
/** Whether o no longer looks like its group's instance: the same test as comparing `key`, without the string. */
const differs = (o: any, g: Group) => o.geometry !== g.geometry || o.material !== g.material || !!o.material?.transparent
  || flags(o) !== g.flags || o.layers.mask !== g.mask || o.renderOrder !== g.order;
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => { for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false; return true; };
const note = (c: Record<string, unknown>) => { changes = [...changes, { frame, ...c }].slice(-20); };

/** A plain static-able mesh: one non-shader, opaque material, no morphs, skinning or per-draw callbacks of its own. */
function candidate(o: any): o is Mesh {
  const m = o.material;
  return o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.isBatchedMesh && !grouped.has(o) && !Array.isArray(m)
    && !m.isShaderMaterial && !m.transparent && !o.morphTargetInfluences?.length
    && o.onBeforeRender === BASE.onBeforeRender && o.onBeforeShadow === BASE.onBeforeShadow;
}

/** Whether three would draw o (it and every ancestor visible), or null when it no longer hangs from scene. */
function shown(o: Object3D, scene: Scene): boolean | null {
  let vis = o.visible;
  while (o.parent) { o = o.parent; vis &&= o.visible; }
  return o === scene ? vis : null;
}

/** The `instancing` switch: groups static duplicates into InstancedMesh2s and skips the originals' draws. */
export const instancing: Switch = {
  enable(r) {
    // the originals' draws are skipped in WebGLRenderer.renderBufferDirect, which WebGPURenderer has not: the switch stays off there
    if (!r.renderBufferDirect) { error = "off on WebGPURenderer: the switch skips draws in WebGLRenderer.renderBufferDirect"; return; }
    if (!loading) {
      loading = true;
      const chunks: Record<string, string> = ShaderChunk, morph = chunks.morphinstance_vertex; // not in three's types
      import("@three.ez/instanced-mesh").then((m) => {
        IM = m.InstancedMesh2;
        // The library reads instanceIndex in place of gl_InstanceID for every morphed InstancedMesh; keep three's own
        // chunk for all but the library's meshes (USE_INSTANCING_INDIRECT is its define).
        if (morph) chunks.morphinstance_vertex = `#ifdef USE_INSTANCING_INDIRECT\n${chunks.morphinstance_vertex}\n#else\n${morph}\n#endif`;
      }).catch((e) => { error = `instanced-mesh did not load: ${e?.message ?? e}`; });
    }
    draw = r.renderBufferDirect;
    r.renderBufferDirect = function (...a) {
      if (bypass ? groups.has(a[4] as any) : grouped.has(a[4] as Mesh)) return;
      draw!.apply(r, a);
    };
    frame = 0;
  },
  disable(r) {
    if (draw) r.renderBufferDirect = draw;
    draw = null;
    if (cull) cull.proto.intersectsFrustum = cull.own;
    cull = null;
    for (const im of groups.keys()) drop(im);
    groups = new Map();
    grouped = new Map();
    still = new WeakMap();
    late = new WeakMap();
    scenes = new Set();
  },
  before(r, scene) {
    if (!draw || (scene as any).__r3f || scenes.has(scene)) return;
    scenes.add(scene);
    freshen(scene); // compared before this render, so bring matrices up to date first
    for (const [im, g] of groups) if (g.scene === scene) mirror(im, g);
    if (frame % PASS_EVERY === PASS_EVERY - 1) recent(scene);
    if (frame % PASS_EVERY === 0) pass(r, scene);
  },
  after() { frame++; scenes.clear(); },
  status: () => ({ groups: groups.size, instanced: grouped.size, changes, ...(error && { error }) }),
};

/** Whether o is a group this switch made: its originals stay in the scene and show every move and hide. */
export const isGroup = (o: object) => groups.has(o as InstancedMesh2);

/** Removes a group's mesh and frees what is its own, leaving the attributes it shares with its originals alone. */
function drop(im: InstancedMesh2) {
  im.removeFromParent();
  const geo = im.geometry;
  geo.index = null;
  for (const name of Object.keys(geo.attributes)) if (name !== "instanceIndex") geo.deleteAttribute(name);
  geo.dispose(); im.dispose();
}

/** Copies each member's visibility to its instance and ejects members that moved, left the scene or changed. */
function mirror(im: InstancedMesh2, g: Group) {
  let kept = 0;
  for (const o of g.members) {
    const e = grouped.get(o)!, vis = shown(o, g.scene);
    const why = vis === null ? "removed" : !same(o.matrixWorld.elements, e.m) ? "moved" : differs(o, g) ? "changed" : "";
    if (!why) {
      if (vis !== e.vis) im.setVisibilityAt(e.id, e.vis = vis!);
      g.members[kept++] = o; // compacted in place: no new array a frame
      continue;
    }
    im.removeInstances(e.id);
    grouped.delete(o);
    still.set(o, [...o.matrixWorld.elements]);
    note({ ejected: o.name || o.type, why });
  }
  g.members.length = kept;
  if (kept) return;
  groups.delete(im);
  drop(im);
}

/** Notes the ungrouped candidates' matrices one frame before a pass. */
function recent(scene: Scene) {
  scene.traverse((o) => { if (candidate(o)) late.set(o, [...o.matrixWorld.elements]); });
}

/** Groups the scene's ungrouped meshes that stood still since the last pass by what they share. */
function pass(r: WebGLRenderer, scene: Scene) {
  const byKey = new Map<string, Mesh[]>();
  scene.traverse((o) => {
    if (!candidate(o)) return;
    const prev = still.get(o), before = late.get(o), m = o.matrixWorld.elements;
    still.set(o, [...m]);
    // still at the last pass and a frame ago: a mesh that bobs with a period near PASS_EVERY frames was regrouped and
    // ejected every pass (a new InstancedMesh2 and BVH each time) when only the two passes were compared
    if (!prev || !same(prev, m) || !before || !same(before, m)) return;
    const k = key(o);
    byKey.get(k)?.push(o) ?? byKey.set(k, [o]);
  });
  if (!IM) return;
  const any = byKey.values().next().value?.[0];
  if (!cull && any) {
    // the game's own Mesh class (its copy of three): three r186+ culls through object.intersectsFrustum in projectObject
    // and the shadow map, so a grouped original never reaches the render list; older three has none and is left alone
    let p = Object.getPrototypeOf(any);
    while (p && !Object.hasOwn(p, "intersectsFrustum")) p = Object.getPrototypeOf(p);
    if (p) {
      const own = p.intersectsFrustum;
      cull = { proto: p, own };
      p.intersectsFrustum = function (this: Mesh, f: unknown) { return (bypass || !grouped.has(this)) && own.call(this, f); };
    }
  }
  for (const [k, list] of byKey) {
    if (list.length < MIN_GROUP) continue;
    const first = list[0];
    // Its own geometry over the shared attributes: the library adds an instanceIndex attribute to it.
    const src = first.geometry, geo = new BufferGeometry();
    geo.index = src.index;
    for (const name in src.attributes) geo.setAttribute(name, src.attributes[name]);
    geo.drawRange = src.drawRange;
    const im = new IM(geo, first.material, { capacity: list.length, renderer: r }); // renderer: drawn from its first frame
    im.matrixAutoUpdate = im.matrixWorldAutoUpdate = false; // identity, so instance matrices are world matrices
    im.castShadow = first.castShadow; im.receiveShadow = first.receiveShadow; im.frustumCulled = first.frustumCulled;
    im.layers.mask = first.layers.mask; im.renderOrder = first.renderOrder;
    im.raycast = () => {};
    im.addInstances(list.length);
    list.forEach((o, id) => {
      const vis = shown(o, scene)!;
      im.setMatrixAt(id, o.matrixWorld);
      im.setVisibilityAt(id, vis);
      grouped.set(o, { im, id, m: [...o.matrixWorld.elements], vis });
    });
    im.computeBVH();
    scene.add(im);
    groups.set(im, { scene, key: k, members: list, geometry: first.geometry, material: first.material, flags: flags(first), mask: first.layers.mask, order: first.renderOrder });
    note({ grouped: list.length, like: first.name || first.type });
  }
}

/** Runs draw with grouped originals drawn instead of their instances, so look()'s ID image names each original. */
export function originals<T>(draw: () => T): T {
  bypass = true;
  try { return draw(); } finally { bypass = false; }
}
