// @paprika3d/game-geo: procedural geometry for games, on Manifold (booleans, hull, extrude, revolve), plus seeded scattering.
// Call `await geo()` once; it starts the wasm engine, which the build inlines into dist/geo.js, so nothing is fetched, and
// returns Manifold's classes with the three.js helpers `toManifold`, `toGeometry` and `boolean`. Helpers return new
// geometries and never mutate their inputs. Every Manifold and CrossSection lives in wasm memory and must be freed with
// `.delete()` when done, or memory leaks; the helpers free every Manifold they make. `scatter` needs no wasm and is a
// plain export. Nothing here reads `Math.random`: scattering is seeded, so the same call gives the same layout.
import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Quaternion, Vector3, type Material, type Mesh as ThreeMesh } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import Module, { type Manifold } from "manifold-3d";
import wasm, { gzipped } from "./wasm.ts";

/** A boolean operation `boolean()` takes, e.g. `"difference"` (the first geometry minus the rest). */
export type Op = "union" | "difference" | "intersection";
const OPS: readonly Op[] = ["union", "difference", "intersection"];

/** manifold.wasm's bytes: decoded from base64 (natively where the browser has Uint8Array.fromBase64) and, in dist/geo.js,
    inflated from gzip. */
async function wasmBytes(): Promise<Uint8Array> {
  const from = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64;
  let bytes: Uint8Array;
  if (from) bytes = from(wasm);
  else { const s = atob(wasm); bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i); }
  if (!gzipped) return bytes;
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

/** The engine plus helpers, built once by `geo()`. */
async function start() {
  // manifold.d.ts types the config as `{ locateFile }` only; `wasmBinary` is the Emscripten option it also reads.
  const m = await Module({ wasmBinary: await wasmBytes() } as never);
  m.setup();
  const { Manifold, CrossSection, Mesh } = m;

  /** A closed three.js geometry as a new Manifold (free it with `.delete()`), e.g. `toManifold(new BoxGeometry())`; split vertices (BoxGeometry's per-face copies) are welded first. */
  // An indexed geometry goes to Manifold as it is: Mesh.merge() welds the vertices split along its open edges (uv seams,
  // BoxGeometry's faces), and three's mergeVertices, which hashes every vertex as a string, made a 131k-triangle sphere
  // 156 ms instead of 94. A triangle soup still goes through mergeVertices, which is faster there.
  const toManifold = (geometry: BufferGeometry): Manifold => {
    if (!geometry?.isBufferGeometry) throw new Error("toManifold: pass a three BufferGeometry; this is already a Manifold, or toGeometry turns one into a geometry");
    const a = geometry.getAttribute("position");
    let w: BufferGeometry = geometry;
    if (!geometry.index) w = mergeVertices(new BufferGeometry().setAttribute("position", a));
    const pos = w.getAttribute("position");
    const vertProperties = pos.array instanceof Float32Array && pos.itemSize === 3 && !(pos as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute
      ? pos.array.slice(0, pos.count * 3) : Float32Array.from({ length: pos.count * 3 }, (_, i) => pos.getComponent(Math.floor(i / 3), i % 3));
    const mesh = new Mesh({ numProp: 3, vertProperties, triVerts: Uint32Array.from(w.index!.array) });
    mesh.merge();
    // manifold.js's constructor throws a ManifoldError whose `code` is the status when it is not NoError.
    try { return new Manifold(mesh); } catch (e) {
      throw new Error(`toManifold: the mesh is not closed (${(e as { code?: string }).code ?? e}); every edge must join exactly two triangles, so build it with Manifold or close its holes`);
    }
  };

  /** A Manifold as a new indexed BufferGeometry with smooth normals that stay sharp across edges over `sharpAngle` degrees (0 is faceted, 180 smooths all), e.g. `toGeometry(Manifold.cylinder(2, 1, 1, 32))`. */
  const toGeometry = (manifold: Manifold, { sharpAngle = 30 }: { sharpAngle?: number } = {}): BufferGeometry => {
    if (!manifold?.isEmpty) throw new Error("toGeometry: pass a Manifold; toManifold turns a BufferGeometry into one");
    if (manifold.isEmpty()) throw new Error("toGeometry: the result has no triangles");
    const n = manifold.calculateNormals(0, sharpAngle);
    try {
      const { numProp: k, vertProperties: v, triVerts } = n.getMesh(), count = v.length / k, pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) for (let j = 0; j < 3; j++) { pos[i * 3 + j] = v[i * k + j]!; nor[i * 3 + j] = v[i * k + 3 + j]!; }
      return new BufferGeometry().setAttribute("position", new BufferAttribute(pos, 3)).setAttribute("normal", new BufferAttribute(nor, 3)).setIndex(new BufferAttribute(triVerts, 1));
    } finally { n.delete(); }
  };

  /** Combines closed geometries into a new one, e.g. `boolean("difference", box, hole)`; a difference that cuts nothing throws, so a missed cutter fails out loud. */
  const boolean = (op: Op, a: BufferGeometry, ...b: BufferGeometry[]): BufferGeometry => {
    if (!OPS.includes(op)) throw new Error(`boolean: op must be union, difference or intersection, got ${op}`);
    const made: Manifold[] = [];
    try {
      for (const g of [a, ...b]) made.push(toManifold(g));
      const r = Manifold[op](made); made.push(r);
      const before = made[0]!.volume();
      if (op === "difference" && Math.abs(r.volume() - before) <= 1e-6 * before) throw new Error("boolean: difference removed nothing; does the cutter overlap?");
      return toGeometry(r);
    } finally { for (const x of made) x.delete(); }
  };

  return { Manifold, CrossSection, Mesh, toManifold, toGeometry, boolean };
}

let ready: ReturnType<typeof start> | undefined;

/** Manifold's classes and the three.js helpers, after starting the engine once, e.g. `const { Manifold, toGeometry } = await geo(); toGeometry(Manifold.cube([1, 1, 1], true))`. */
export function geo() { return ready ??= start().catch(e => { ready = undefined; throw e; }); } // a failed start can be tried again

/** A seeded random in [0, 1), the same sequence for the same seed, e.g. `mulberry32(1)()`. */
const mulberry32 = (a: number) => () => {
  a = a + 0x6d2b79f5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

/** Options for `scatter`: the seed, the scale range, and whether each instance's up axis follows the surface normal. */
export interface ScatterOptions {
  /** Seeds the layout; the same seed gives the same matrices, e.g. `7`. */
  seed?: number;
  /** The uniform scale range each instance draws from, e.g. `[0.5, 1.5]`. */
  scale?: [number, number];
  /** True tilts each instance's +Y to the surface normal (rocks); false keeps it upright (trees on a slope). */
  align?: boolean;
}

/** `count` instances of `source` on `target`'s surface, in `target`'s local space, each with a random scale and spin about its up axis, e.g. `ground.add(scatter(ground, rockGeo, rockMat, 50, { seed: 3 }))`. */
export function scatter(target: ThreeMesh, source: BufferGeometry, material: Material | Material[], count: number, { seed = 1, scale = [1, 1], align = true }: ScatterOptions = {}): InstancedMesh {
  // @types/three 0.186 leaves out setRandomGenerator, which three's MeshSurfaceSampler has.
  const rand = mulberry32(seed), sampler = (new MeshSurfaceSampler(target) as MeshSurfaceSampler & { setRandomGenerator(f: () => number): MeshSurfaceSampler }).setRandomGenerator(rand).build();
  const out = new InstancedMesh(source, material, count);
  const p = new Vector3(), n = new Vector3(), s = new Vector3(), q = new Quaternion(), spin = new Quaternion(), m = new Matrix4(), UP = new Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    sampler.sample(p, n);
    q.identity(); if (align) q.setFromUnitVectors(UP, n.normalize());
    q.multiply(spin.setFromAxisAngle(UP, rand() * 2 * Math.PI));
    out.setMatrixAt(i, m.compose(p, q, s.setScalar(scale[0] + (scale[1] - scale[0]) * rand())));
  }
  out.instanceMatrix.needsUpdate = true;
  return out;
}
