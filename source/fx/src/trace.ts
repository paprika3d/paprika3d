// trace and heightfield: a picture to scene pieces. `trace` turns the pixels of one colour (or all but the background)
// into three.js Shapes with their holes, for ShapeGeometry or ExtrudeGeometry, and returns the mask it used; `heightfield`
// reads a picture's brightness as heights, a Field that `place({ on })` scatters on like `field`'s. The 2026-10-24 scene
// loops traced outlines and masks from their reference pictures in Python scripts of their own.
//   const { shapes } = await trace("refs/plan.png", { colour: "#000000", scale: 0.01 }); // 1 px = 1 cm
//   scene.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shapes, { depth: 3, bevelEnabled: false }).rotateX(-Math.PI / 2), wallMat));
//   const hills = await heightfield("refs/height.png", { size: 200, height: 30 });
//   scene.add(new THREE.Mesh(hills.geometry(128), grassMat));
import { Color, PlaneGeometry, Shape, Path, Vector2, Vector3 } from "three";
import type { Field } from "./place.ts";

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up, in picture pixels (y down)

/** Signed area of a ring in picture pixels: positive for an outline, negative for a hole (as `contours` returns them). */
export const ringArea = (p: number[][]) => p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]!; return s + x! * v! - u! * y!; }, 0) / 2;

/** Closed outlines of the set pixels (over 127) of a w × h mask, along pixel edges, simplified to within `simplify` px
    (Douglas–Peucker; 0 keeps every corner). Outlines run clockwise on screen, holes the other way; pixels touching only at
    a corner are separate pieces. */
export function contours(mask: ArrayLike<number>, w: number, h: number, simplify = 1): number[][][] {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x]! > 127;
  // each set pixel's sides that face an unset one, as edges from a corner in a direction, clockwise around the pixel
  const from: number[] = [], dir: number[] = [], out = new Map<number, number[]>(), W = w + 1;
  const edge = (vx: number, vy: number, d: number) => { const v = vy * W + vx; from.push(v); dir.push(d); (out.get(v) ?? out.set(v, []).get(v)!).push(from.length - 1); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    if (!on(x, y - 1)) edge(x, y, 0);
    if (!on(x + 1, y)) edge(x + 1, y, 1);
    if (!on(x, y + 1)) edge(x + 1, y + 1, 2);
    if (!on(x - 1, y)) edge(x, y + 1, 3);
  }
  const used = new Uint8Array(from.length), rings: number[][][] = [];
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue;
    const ring: number[][] = [];
    let e = e0;
    do {
      used[e] = 1;
      const d = dir[e]!, v = from[e]!, x = v % W + DIRS[d]![0]!, y = Math.floor(v / W) + DIRS[d]![1]!;
      ring.push([v % W, Math.floor(v / W)]);
      // at a corner two pieces share, turn right first, so each piece keeps its own outline
      const next = out.get(y * W + x)!.filter(n => !used[n] || n === e0);
      e = [(d + 1) % 4, d, (d + 3) % 4].map(t => next.find(n => dir[n] === t)).find(n => n !== undefined) ?? e0;
    } while (e !== e0);
    // corners only (a point where the outline turns), then simplified
    rings.push(simplifyRing(ring.filter((p, i) => { const a = ring[(i + ring.length - 1) % ring.length]!, b = ring[(i + 1) % ring.length]!; return (p[0]! - a[0]!) * (b[1]! - p[1]!) !== (p[1]! - a[1]!) * (b[0]! - p[0]!); }), simplify));
  }
  return rings;
}

/** Douglas–Peucker on a closed ring: split at the point farthest from the first, simplify both halves. */
function simplifyRing(p: number[][], tol: number): number[][] {
  if (tol <= 0 || p.length < 5) return p;
  const far = p.reduce((b, q, i) => Math.hypot(q[0]! - p[0]![0]!, q[1]! - p[0]![1]!) > Math.hypot(p[b]![0]! - p[0]![0]!, p[b]![1]! - p[0]![1]!) ? i : b, 0);
  const a = dp(p.slice(0, far + 1), tol), b = dp([...p.slice(far), p[0]!], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function dp(p: number[][], tol: number): number[][] {
  const [ax, ay] = p[0]!, [bx, by] = p[p.length - 1]!, len = Math.hypot(bx! - ax!, by! - ay!);
  let worst = 0, at = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const [x, y] = p[i]!, d = len ? Math.abs((bx! - ax!) * (ay! - y!) - (ax! - x!) * (by! - ay!)) / len : Math.hypot(x! - ax!, y! - ay!);
    if (d > worst) { worst = d; at = i; }
  }
  return worst > tol ? [...dp(p.slice(0, at + 1), tol).slice(0, -1), ...dp(p.slice(at), tol)] : [p[0]!, p[p.length - 1]!];
}

const inside = ([x, y]: number[], p: number[][]) => {
  let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if ((p[i]![1]! > y!) !== (p[j]![1]! > y!) && x! < (p[j]![0]! - p[i]![0]!) * (y! - p[i]![1]!) / (p[j]![1]! - p[i]![1]!) + p[i]![0]!) r = !r;
  return r;
};

/** `contours`' rings as Shapes: each outline a Shape, each hole on the smallest outline around it, in picture pixels × `scale`,
    y turned up when `flipY` (so the picture stands upright in the xy plane). */
export function shapesOf(rings: number[][][], { scale = 1, flipY = true } = {}): Shape[] {
  const v = (p: number[][]) => p.map(([x, y]) => new Vector2(x! * scale, (flipY ? -y! : y!) * scale));
  const outer = rings.filter(r => ringArea(r) > 0).sort((a, b) => ringArea(a) - ringArea(b)), shapes = outer.map(r => new Shape(v(r)));
  for (const hole of rings.filter(r => ringArea(r) < 0)) {
    const mid = [(hole[0]![0]! + hole[1]![0]!) / 2, (hole[0]![1]! + hole[1]![1]!) / 2], i = outer.findIndex(o => inside(mid, o));
    if (i >= 0) shapes[i]!.holes.push(new Path(v(hole)));
  }
  return shapes;
}

type Src = string | HTMLImageElement | HTMLCanvasElement;
/** The picture's pixels: a URL is loaded (same origin, or a server that allows it). */
async function pixels(src: Src) {
  let img: HTMLImageElement | HTMLCanvasElement = src as HTMLCanvasElement;
  if (typeof src === "string") { const i = new Image(); i.crossOrigin = "anonymous"; i.src = src; await i.decode(); img = i; }
  const w = (img as HTMLImageElement).naturalWidth || img.width, h = (img as HTMLImageElement).naturalHeight || img.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(img, 0, 0);
  return { data: x.getImageData(0, 0, w, h).data, w, h };
}

/** The outlines of one colour in a picture as Shapes (with holes), in picture pixels × `scale`, y up: the pixels within
    `tolerance` (RGB distance) of `colour`, or with no colour every pixel off the background (the commonest corner colour);
    `invert` swaps the two. Rings under `minArea` px² are dropped. `mask` is the mask used, white on black, to check. */
export async function trace(src: Src, { colour, tolerance = 40, invert = false, simplify = 1, minArea = 4, scale = 1 }: { colour?: number | string; tolerance?: number; invert?: boolean; simplify?: number; minArea?: number; scale?: number } = {}) {
  const { data, w, h } = await pixels(src), at = (i: number) => [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!];
  let ref: number[], match: boolean;
  if (colour !== undefined) { const hex = new Color(colour).getHex(); ref = [hex >> 16, (hex >> 8) & 255, hex & 255]; match = true; }
  else {
    const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(at), key = (c: number[]) => c.join();
    ref = corners.reduce((b, c) => corners.filter(d => key(d) === key(c)).length > corners.filter(d => key(d) === key(b)).length ? c : b); match = false;
  }
  const mask = new Uint8Array(w * h), m = document.createElement("canvas"); m.width = w; m.height = h;
  const mc = m.getContext("2d")!, md = mc.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = at(i), near = Math.hypot(r! - ref[0]!, g! - ref[1]!, b! - ref[2]!) <= tolerance;
    mask[i] = near === match !== invert ? 255 : 0;
    md.data.fill(mask[i]!, i * 4, i * 4 + 3); md.data[i * 4 + 3] = 255;
  }
  mc.putImageData(md, 0, 0);
  const rings = contours(mask, w, h, simplify).filter(r => Math.abs(ringArea(r)) >= minArea);
  return { shapes: shapesOf(rings, { scale }), mask: m, width: w, height: h };
}

/** A picture's brightness as heights over a `size`-wide area centred on the origin (its depth by the picture's aspect,
    the picture's top toward -z): black at `base`, white at `base + height`, bilinear between pixels. A Field, as
    `field` returns, so `place({ on })` scatters on it and `geometry(segments)` is its mesh. */
export async function heightfield(src: Src, { size, height, base = 0 }: { size: number; height: number; base?: number }): Promise<Field> {
  const { data, w, h } = await pixels(src), depth = size * h / w, hx = size / 2, hz = depth / 2;
  const H = (i: number, j: number) => { const k = (Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))) * 4; return base + height * (0.2126 * data[k]! + 0.7152 * data[k + 1]! + 0.0722 * data[k + 2]!) / 255; };
  const heightAt = (x: number, z: number) => {
    const u = Math.min(w - 1, Math.max(0, (x + hx) / size * (w - 1))), v = Math.min(h - 1, Math.max(0, (z + hz) / depth * (h - 1)));
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    return (H(i, j) * (1 - a) + H(i + 1, j) * a) * (1 - b) + (H(i, j + 1) * (1 - a) + H(i + 1, j + 1) * a) * b;
  };
  const e = size / w;
  return {
    area: [-hx, -hz, hx, hz],
    heightAt,
    normalAt: (x, z) => new Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize(),
    geometry(segments) {
      const g = new PlaneGeometry(size, depth, segments, Math.max(1, Math.round(segments * h / w))).rotateX(-Math.PI / 2), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
      g.computeVertexNormals();
      return g;
    },
  };
}
