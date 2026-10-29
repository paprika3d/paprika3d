// uv: texture coordinates in metres, so one tiling texture (tex.wood, tex.bricks, tex.windows) shows at the same
// real-world size on a floor, a wall, a building of any height, terrain, and geo's boolean output, which has no UVs at
// all. Each triangle is projected onto the box face its vertex normals point at most (top, side or front), in the
// geometry's own units: 1 unit is metresPerRepeat⁻¹ of a texture repeat, so no `map.repeat` to tune per mesh. Units are
// the geometry's, so a mesh.scale or an InstancedMesh's per-instance scale stretches the metres. Writes `uv` in place
// (and `normal` when missing) and returns it; call it before the first render. An indexed geometry stays indexed: only
// a vertex shared by triangles that face different ways (a smooth corner, a terrain slope crossing 45°) is copied.
// `offset` shifts u by that many metres, so buildings sharing one tex.windows tile don't show the same lit windows.
//   floor.geometry = uv(new THREE.BoxGeometry(6, 0.1, 5), 2); // tex.wood repeats every 2 m: 3 × 2.5 repeats
import { BufferAttribute, type BufferGeometry } from "three";

/** Box-projected UVs on `g`, one texture repeat per `metresPerRepeat` units, e.g. `uv(boolean("difference", a, b), 1)`. */
export function uv<G extends BufferGeometry>(g: G, metresPerRepeat = 1, offset = 0): G {
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, nr = g.attributes.normal, ix = g.index, n0 = p.count, src: number[] = [], idx: number[] = [], out: number[] = Array(n0 * 2).fill(0);
  const own = new Int8Array(n0).fill(-1), copies = new Map<number, number>(); // own: the face each vertex was first used on
  for (let i = 0; i + 2 < (ix ? ix.count : n0); i += 3) {
    const vs = [i, i + 1, i + 2].map(k => ix ? ix.getX(k) : k), n = [0, 1, 2].map(c => vs.reduce((s, v) => s + nr.getComponent(v, c), 0));
    const m = n.map(Math.abs), ax = m[0] > m[1] && m[0] > m[2] ? 0 : m[1] > m[2] ? 1 : 2, d = n[ax] < 0 ? -1 : 1, f = ax * 2 + (d + 1) / 2; // 0..5, one per box face
    for (const v of vs) {
      // a triangle facing another way than a vertex's first one gets a copy of it with its own uv
      let o = own[v] < 0 ? (own[v] = f, v) : own[v] === f ? v : copies.get(v * 6 + f) ?? -1;
      if (o < 0) copies.set(v * 6 + f, o = n0 + src.push(v) - 1);
      idx.push(o);
      const x = p.getX(v) / metresPerRepeat, y = p.getY(v) / metresPerRepeat, z = p.getZ(v) / metresPerRepeat;
      // u runs to the viewer's right on every face, v up on walls and away (-z) on floors: text and bricks are not mirrored
      out[o * 2] = (ax ? x * (ax > 1 ? d : 1) : -z * d) + offset / metresPerRepeat;
      out[o * 2 + 1] = ax === 1 ? -z * d : y;
    }
  }
  if (src.length) {
    const grow = (a: BufferAttribute) => {
      const b = new BufferAttribute(new (a.array.constructor as Float32ArrayConstructor)((n0 + src.length) * a.itemSize), a.itemSize, a.normalized);
      for (let j = 0; j < b.count; j++) for (let c = 0; c < a.itemSize; c++) b.setComponent(j, c, a.getComponent(j < n0 ? j : src[j - n0], c));
      return b;
    };
    for (const k in g.attributes) g.setAttribute(k, grow(g.attributes[k] as BufferAttribute));
    const morph = g.morphAttributes as Record<string, BufferAttribute[]>;
    for (const k in morph) morph[k] = morph[k].map(grow);
    g.setIndex(idx);
  }
  g.setAttribute("uv", new BufferAttribute(new Float32Array(out), 2));
  return g;
}
