// place: rule-based layout for scenes a game otherwise hand-writes or gets from WebGPU-only generators (the addons'
// Terrain/Forest/City). `field` is one seeded height function shared by the terrain mesh and everything placed on it:
// once `geometry(segments)` has built the mesh, `heightAt` follows that mesh's triangles, so things placed after it sit
// exactly on what is drawn (placed before it, they follow the smooth noise and float or sink up to the mesh's error).
// `place` returns points `{ x, y, z, ry, s, rx, rz, sx, sz }` scattered at random (`place(150, …)`, rejected by height,
// slope, an `avoid` test or `spacing`; when the rules fit fewer than asked it returns those and logs a console error
// naming both counts) or on a grid that spans `area` edge to edge (`place([4, 4], …)`, its border only with
// `edge: true`: block corners, trees along a street; `place([5, 1], { area: [0, 0, 8, 0] })` is 5 points along x).
// `instances` turns points into one named InstancedMesh. `area` is [x0, z0, x1, z1] in world units; the same `seed`
// gives the same points, never Math.random.
//   const land = field(100, { seed: 2, height: 5, basins: [[8, 6, 12, 7]] }); // a lake 7 deep at (8, 6)
//   scene.add(new THREE.Mesh(land.geometry(160), grassMat));
//   const pts = place(150, { on: land, seed: 3, minHeight: 0, maxSlope: 30, scale: [0.8, 1.6], rotate: true });
//   scene.add(instances(treeGeo, treeMat, pts, "trees"));
import { Euler, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3, type BufferGeometry, type Material } from "three";

/** `ry` yaw and `rx`, `rz` tilt in radians; `s` the scale, `sx` and `sz` its stretch along x and z. */
export type Point = { x: number; y: number; z: number; ry: number; s: number; rx: number; rz: number; sx: number; sz: number };
export type Field = { area: number[]; heightAt(x: number, z: number): number; normalAt(x: number, z: number): Vector3; geometry(segments: number): PlaneGeometry };

/** mulberry32: a seeded generator of numbers in [0, 1). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PI = Math.PI, lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A `size` x `size` height field centred on the origin: `octaves` of seeded value noise, the first `height` high with
    features `scale` wide (halving each octave), lifted by `base`, minus Gaussian `basins` [x, z, radius, depth].
    `geometry(segments)` also makes `heightAt` (and `normalAt`) interpolate that mesh's triangles inside its square. */
export function field(size: number, { seed = 1, octaves = 4, height = 5, scale = 50, base = 0, basins = [] as number[][] } = {}): Field {
  const hash = (i: number, j: number) => rng(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ seed)() * 2 - 1;
  const noise = (x: number, z: number) => {
    const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    return lerp(lerp(hash(i, j), hash(i + 1, j), a), lerp(hash(i, j + 1), hash(i + 1, j + 1), a), b);
  };
  const smooth = (x: number, z: number) => {
    let h = base;
    for (let o = 0, a = height, f = 1 / scale; o < octaves; o++, a /= 2, f *= 2) h += noise(x * f, z * f) * a;
    for (const [bx, bz, r, d] of basins) h -= d * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (r * r));
    return h;
  };
  // the mesh's triangles: PlaneGeometry splits cell (i, j) on its (i, j+1)-(i+1, j) diagonal; mirror into the far triangle
  let seg = 0, w = size / 2;
  const heightAt = (x: number, z: number) => {
    const c = size / seg, u = (x + w) / c, v = (z + w) / c; // no mesh yet: c is Infinity, u and v 0
    if (!(u > 0 && v > 0 && u < seg && v < seg)) return smooth(x, z);
    const H = (a: number, b: number) => smooth(a * c - w, b * c - w), k = +(u % 1 + v % 1 > 1), p = Math.floor(u) + k, q = Math.floor(v) + k, t = 1 - 2 * k, h = H(p, q);
    return lerp(h, H(p + t, q), Math.abs(u - p)) + (H(p, q + t) - h) * Math.abs(v - q);
  };
  const e = 0.1;
  return {
    area: [-w, -w, w, w],
    heightAt,
    normalAt: (x, z) => new Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize(),
    geometry(segments) {
      const g = new PlaneGeometry(size, size, segments, segments).rotateX(-PI / 2), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, smooth(p.getX(i), p.getZ(i)));
      g.computeVertexNormals();
      seg = segments;
      return g;
    },
  };
}

export type PlaceOptions = {
  area?: number[]; seed?: number; on?: Field; minHeight?: number; maxHeight?: number;
  maxSlope?: number; // degrees from flat, read from `on`
  avoid?: (x: number, z: number) => boolean; spacing?: number;
  jitter?: number; // grid only: random offset as a fraction of a cell
  edge?: boolean; scale?: number[];
  tilt?: number; // most random tilt about x and z, in degrees
  stretch?: number; // most random stretch along x and z, a fraction of the scale
  rotate?: boolean | number; // true a random yaw, a number that yaw in radians
};

/** `n` random points that pass every rule (fewer, with a console error, when 30 tries per point do not find them), or an [nx, nz] grid of points
    spanning `area` with its corners on the area's corners (one point on an axis sits at the middle). `y` is `on`'s height,
    else 0. `area` defaults to `on`'s, else [-10, -10, 10, 10]. */
export function place(n: number | number[], o: PlaceOptions = {}): Point[] {
  const { on, seed = 1, minHeight = -Infinity, maxHeight = Infinity, maxSlope = 90, avoid, spacing = 0, jitter = 0, edge, scale = [1, 1], rotate, tilt = 0, stretch = 0 } = o;
  const [x0, z0, x1, z1] = o.area ?? on?.area ?? [-10, -10, 10, 10], r = rng(seed), out: Point[] = [];
  const at = (k: number, m: number, a: number, b: number) => lerp(a, b, m > 1 ? (k + d(jitter / 2)) / (m - 1) : 0.5);
  const cos = Math.cos((maxSlope * PI) / 180), d = (m: number) => m && (r() * 2 - 1) * m, T = (tilt * PI) / 180;
  const add = (x: number, z: number) => {
    const y = on ? on.heightAt(x, z) : 0;
    if (y < minHeight || y > maxHeight || (on && on.normalAt(x, z).y < cos) || avoid?.(x, z) || (spacing && out.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < spacing * spacing))) return;
    out.push({ x, y, z, ry: rotate === true ? r() * PI * 2 : +(rotate ?? 0), s: lerp(scale[0], scale[1], r()),
      rx: d(T), rz: d(T), sx: 1 + d(stretch), sz: 1 + d(stretch) });
  };
  if (typeof n === "number") {
    for (let t = 0; out.length < n && t < n * 30; t++) add(lerp(x0, x1, r()), lerp(z0, z1, r()));
    if (out.length < n) console.error(`place: only ${out.length} of ${n} fit`);
  } else {
    const [nx, nz] = n;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++)
      if (!edge || !(i % (nx - 1)) || !(j % (nz - 1))) add(at(i, nx, x0, x1), at(j, nz, z0, z1)); // a 1-wide axis: x % 0 is NaN, so all edge
  }
  return out;
}

/** One InstancedMesh named `name`, an instance per point, each moved to it, turned by `rx`, `ry`, `rz` and scaled by `s` (times `sx`, `sz` along x and z). */
export function instances(geometry: BufferGeometry, material: Material | Material[], points: Point[], name: string): InstancedMesh {
  const m = new InstancedMesh(geometry, material, points.length), M = new Matrix4(), q = new Quaternion(), E = new Euler(), v = new Vector3(), s = new Vector3();
  points.forEach((p, i) => m.setMatrixAt(i, M.compose(v.set(p.x, p.y, p.z), q.setFromEuler(E.set(p.rx ?? 0, p.ry, p.rz ?? 0)), s.set(p.s * (p.sx ?? 1), p.s, p.s * (p.sz ?? 1)))));
  m.name = name;
  return m;
}
