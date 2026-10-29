// Dispose guard: a game that removes objects from its scene and never disposes them leaves their geometries, materials
// and textures on the GPU, which most games forget. This patches the game's own Object3D.prototype.remove (found from a
// scene it renders, so it is the game's copy of three) to note what was removed. Once no remove has happened for 10
// frames (or 60 frames after the first, so a game that removes every frame is still checked), it walks every scene
// rendered meanwhile and disposes whatever the removed subtrees used that no rendered object uses. three uploads a
// disposed resource again when it is next drawn, so an object the game sets aside and adds back still draws.
// `userData.keep` on an object (and so its subtree), a geometry, a material or a texture opts it out.
// shortcut: an object kept outside every scene (a pool, a template to clone) pays the upload again when it is reused;
// mark such objects userData.keep if that shows in frame times.
import type { Object3D, Scene } from "three";
import type { Switch } from "./index.ts";

const SETTLE = 10, MAX_WAIT = 60;

let proto: any = null, remove: ((...o: Object3D[]) => Object3D) | null = null;
let removed = new Set<Object3D>(), scenes = new Set<Scene>(), quiet = 0, waited = 0;
let disposed = { geometries: 0, materials: 0, textures: 0 };

const kept = (x: any) => !!x?.userData?.keep;

/** Adds o's geometry, materials and their textures (properties and uniforms) to out. A material already in out is not
    scanned again: games share a few materials across thousands of meshes (5,000 meshes: 5.5 ms → 0.08 ms a sweep). */
function uses(o: any, out: Set<any>) {
  if (o.geometry) out.add(o.geometry);
  const ms = o.material;
  if (!ms) return;
  for (const m of Array.isArray(ms) ? ms : [ms]) {
    if (!m || out.has(m)) continue;
    out.add(m);
    for (const k in m) if (m[k]?.isTexture) out.add(m[k]);
    const u = m.uniforms;
    if (u) for (const k in u) if (u[k]?.value?.isTexture) out.add(u[k].value);
  }
}

/** Disposes what the removed subtrees use and no object in a rendered scene does. */
function sweep() {
  const used = new Set<any>(), gone = new Set<any>();
  for (const s of scenes) {
    s.traverse((o) => uses(o, used));
    for (const t of [s.background, s.environment]) if ((t as any)?.isTexture) used.add(t);
    if (s.overrideMaterial) uses({ material: s.overrideMaterial }, used);
  }
  const walk = (o: Object3D) => { if (kept(o)) return; uses(o, gone); for (const c of o.children) walk(c); };
  for (const o of removed) walk(o);
  for (const x of gone) {
    if (used.has(x) || kept(x) || x.isRenderTargetTexture) continue;
    x.dispose();
    disposed[x.isTexture ? "textures" : x.isMaterial ? "materials" : "geometries"]++;
  }
  removed.clear();
  scenes.clear();
  quiet = waited = 0;
}

/** The `dispose` switch: frees GPU resources of objects removed from the scene and not used anywhere rendered. */
export const dispose: Switch = {
  enable() { disposed = { geometries: 0, materials: 0, textures: 0 }; },
  disable() {
    if (proto) proto.remove = remove;
    proto = remove = null;
    removed.clear();
    scenes.clear();
  },
  before(_r, scene) {
    if (!proto) {
      let p = Object.getPrototypeOf(scene);
      while (p && !Object.hasOwn(p, "remove")) p = Object.getPrototypeOf(p);
      if (!p) return;
      proto = p;
      const own = remove = p.remove;
      p.remove = function (this: Object3D, ...objects: Object3D[]) {
        for (const o of objects) if (o?.isObject3D && o.parent === this) removed.add(o);
        quiet = 0;
        return own!.apply(this, objects);
      };
    }
    scenes.add(scene);
  },
  after() {
    if (!removed.size) { scenes.clear(); return; }
    if (++quiet >= SETTLE || ++waited >= MAX_WAIT) sweep();
  },
  status: () => ({ disposed, pending: removed.size }),
};
