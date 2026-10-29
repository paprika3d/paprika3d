// Level of detail: a mesh over 10,000 triangles also gets a 50% and a 20% version (meshoptimizer's simplifier from three's
// examples, bundled into the runtime, at 1% error), drawn once the camera is 10× and 30× the mesh's bounding radius away.
// A single mesh keeps its place in the game's scene graph: before each render its geometry is swapped for the level its
// distance calls for, and put back once the frame ends, so the game's references, parents and raycasts only ever see
// the original. (THREE.LOD would have to take the mesh's place in its parent, breaking game code that moves or removes it.)
// An auto-instanced group (InstancedMesh2) gets the same two levels with addLOD, which picks a level per instance.
// The simplifier's WebAssembly starts when the switch is first enabled; if it fails to, only this switch fails
// (status().lod.error), not the game.
// shortcut: geometries with material groups or morph targets, and skinned meshes, are skipped; split them by material
// if a game needs them.
// shortcut: originals the instancing switch grouped are swapped too (harmless, their draws are skipped, but counted in
// `reduced`); ask instancing for its members if that count misleads.
import { BufferAttribute, BufferGeometry, Sphere, Vector3, type Mesh, type Object3D, type Scene } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js"; // static, so the bundle keeps only this function
import type { Switch } from "./index.ts";

const MIN_TRIANGLES = 10_000, RATIOS = [0.5, 0.2], FAR = [10, 30], ERROR = 0.01, RESCAN = 120;
// Simplifying takes 6–12 ms at 10k triangles and over 200 ms at 400k, so a frame starts no new geometry once it has
// spent this long; the rest wait for the next frames (drawn at full detail meanwhile) instead of one long frame.
const BUDGET_MS = 4;
// The fake clock replaces performance.now with virtual time; the prototype's is still the real one.
const realNow = () => Performance.prototype.now.call(performance);
let budgetEnd = 0, deferred = false;

let simplifier: any = null, error = "";
let made = new WeakMap<BufferGeometry, BufferGeometry[] | null>(), ours = new WeakSet<BufferGeometry>();
let scans = new WeakMap<Scene, { at: number; meshes: Mesh[]; deferred: boolean }>();
let swapped = new Map<Mesh, BufferGeometry>(), groups: any[] = [], frame = 0, reduced = 0;
let found: { name: string; triangles: number; levels: number[] }[] = [];
const sphere = new Sphere(), eye = new Vector3();

const triangles = (g: BufferGeometry) => (g.index ?? g.attributes.position!).count / 3;

/** The 50% and 20% versions of g sharing its attributes (each kept only when it has fewer triangles), or null. */
function levelsOf(g: BufferGeometry): BufferGeometry[] | null {
  if (made.has(g)) return made.get(g)!;
  let out: BufferGeometry[] | null = null;
  if (!ours.has(g) && g.attributes.position && !g.groups.length && !g.morphAttributes.position && triangles(g) > MIN_TRIANGLES) {
    if (realNow() > budgetEnd) { deferred = true; return null; } // this frame's budget is spent: a later frame makes them
    const src = g.index ? g : mergeVertices(g); // the simplifier collapses shared vertices, so a triangle soup is welded first
    const pos = src.attributes.position!, xyz = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { xyz[i * 3] = pos.getX(i); xyz[i * 3 + 1] = pos.getY(i); xyz[i * 3 + 2] = pos.getZ(i); }
    // Normals and UVs steer the collapse too (weights per meshoptimizer's README), so shading and texture seams survive.
    const chans = [["normal", 1], ["uv", 10]].filter(([k]) => src.attributes[k as string]) as [string, number][];
    const stride = chans.reduce((n, [k]) => n + src.attributes[k]!.itemSize, 0), attrs = new Float32Array(pos.count * stride);
    const weights = chans.flatMap(([k, w]) => Array(src.attributes[k]!.itemSize).fill(w));
    for (let i = 0, o = 0; i < pos.count; i++) for (const [k] of chans) { const a = src.attributes[k]!; for (let c = 0; c < a.itemSize; c++) attrs[o++] = a.getComponent(i, c); }
    const index = src.index!.array;
    let last = index.length;
    out = [];
    for (const r of RATIOS) {
      const target = Math.floor(index.length * r / 3) * 3;
      const [idx] = simplifier.simplifyWithAttributes(index, xyz, 3, attrs, stride, weights, null, target, ERROR, chans.length ? ["Permissive"] : []);
      if (idx.length >= last) continue;
      last = idx.length;
      const l = new BufferGeometry();
      for (const k in src.attributes) l.setAttribute(k, src.attributes[k]!);
      l.setIndex(new BufferAttribute(idx, 1));
      l.boundingSphere = g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere);
      l.boundingBox = g.boundingBox;
      ours.add(l);
      out.push(l);
    }
    if (!out.length) out = null;
    // When the game disposes the original, the levels go with it.
    else g.addEventListener("dispose", () => { for (const l of out!) l.dispose(); made.delete(g); });
    if (out) found = [...found, { name: (g as any).name || g.uuid, triangles: triangles(g), levels: out.map(triangles) }].slice(-20);
  }
  made.set(g, out);
  return out;
}

/** The single meshes in scene with levels; adds levels to auto-instanced groups on the way. */
function scan(scene: Scene): Mesh[] {
  const meshes: Mesh[] = [];
  scene.traverse((o: Object3D) => {
    const m = o as any;
    if (m.isInstancedMesh2) {
      if (m._parentLOD || m.LODinfo?.render || groups.includes(m)) return;
      const l = levelsOf(m.geometry);
      if (!l) return;
      const r = m.geometry.boundingSphere.radius;
      l.forEach((g, i) => m.addLOD(g, m.material, r * FAR[i]!));
      groups.push(m);
      return;
    }
    if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || m.isBatchedMesh || m.morphTargetInfluences?.length) return;
    if (levelsOf(swapped.get(m) ?? m.geometry)) meshes.push(m);
  });
  return meshes;
}

/** Puts every swapped mesh's own geometry back. */
function restore() {
  for (const [m, g] of swapped) m.geometry = g;
  swapped.clear();
}

/** The `lod` switch: two simplified levels for meshes over 10,000 triangles, chosen by camera distance. */
export const lod: Switch = {
  enable() {
    error = "";
    made = new WeakMap();
    found = [];
    // @ts-expect-error three ships no types for its meshoptimizer build
    import("three/addons/libs/meshopt_simplifier.module.js")
      .then(async (m) => { await m.MeshoptSimplifier.ready; simplifier = m.MeshoptSimplifier; })
      .catch((e) => { error = `simplifier did not load: ${e?.message ?? e}`; });
  },
  disable() {
    restore();
    for (const m of groups) {
      const levels = m.LODinfo?.render?.levels ?? [];
      for (let i = levels.length - 1; i > 0; i--) {
        const o = levels[i].object;
        m.removeLOD(i, false); // removeLOD would dispose the material too, which is the game's
        m.remove(o);
        o.dispose();
      }
    }
    groups = [];
    scans = new WeakMap();
    simplifier = null;
  },
  before(_r, scene, camera) {
    if (!simplifier) return;
    let s = scans.get(scene);
    budgetEnd = realNow() + BUDGET_MS;
    if (!s || frame - s.at >= RESCAN || s.deferred) {
      deferred = false;
      const meshes = scan(scene);
      scans.set(scene, s = { at: frame, meshes, deferred });
    }
    // after() puts the geometries back; a task that draws only to render targets (look's ID pass) has no after(), so
    // its microtask does, before the instancing switch next compares its originals' geometry.
    if (!swapped.size) queueMicrotask(restore);
    camera.updateMatrixWorld();
    eye.setFromMatrixPosition(camera.matrixWorld);
    for (const m of s.meshes) {
      const own = swapped.get(m) ?? m.geometry, levels = levelsOf(own);
      if (!levels) continue;
      sphere.copy(own.boundingSphere!).applyMatrix4(m.matrixWorld);
      const d = sphere.center.distanceTo(eye);
      let i = 0;
      while (i < levels.length && d >= sphere.radius * FAR[i]!) i++;
      m.geometry = i ? levels[i - 1]! : own;
      if (i) swapped.set(m, own); else swapped.delete(m);
    }
  },
  after() {
    frame++;
    reduced = swapped.size;
    restore();
  },
  /** reduced: single meshes drawn at a lower level in the last frame. */
  status: () => ({ meshes: found, groups: groups.length, reduced, ...(error && { error }) }),
};
