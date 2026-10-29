// `model_audit` for USD (.usd, .usda, .usdc, .usdz), which three r183+ loads with USDLoader: the file's size, triangles,
// materials and textures in glb.ts's ModelReport, read by three's own two layer parsers (no imports, so the bundle takes
// none of three's core). A .usdz is a zip whose entries are stored, as the format asks, or deflated; every USD layer in it
// is read, and its images are its textures.
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { USDAParser } from "three/examples/jsm/loaders/usd/USDAParser.js";
import { USDCParser } from "three/examples/jsm/loaders/usd/USDCParser.js";
import { imageSize } from "./perf.ts";
import type { ModelReport, Texture } from "./glb.ts";

export const USD = /\.usd[acz]?$/i;
const LAYER = /\.usd[ac]?$/i, IMAGE = /\.(png|jpe?g|webp|ktx2|avif)$/i;
type Specs = Record<string, { specType: number; fields: Record<string, any> }>;

/** A zip's files by name, from its central directory: stored entries as they are, deflated ones inflated. */
function unzip(b: Buffer): Map<string, Buffer> {
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip (no end of central directory)");
  const files = new Map<string, Buffer>();
  for (let i = b.readUInt32LE(end + 16), n = b.readUInt16LE(end + 10); n--; ) {
    const method = b.readUInt16LE(i + 10), size = b.readUInt32LE(i + 20), nameLen = b.readUInt16LE(i + 28), local = b.readUInt32LE(i + 42);
    const name = b.toString("utf8", i + 46, i + 46 + nameLen);
    const data = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), raw = b.subarray(data, data + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    i += 46 + nameLen + b.readUInt16LE(i + 30) + b.readUInt16LE(i + 32);
  }
  return files;
}

const parse = (b: Buffer): Specs => b.toString("latin1", 0, 8) === "PXR-USDC"
  ? new USDCParser().parseData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer).specsByPath
  : new USDAParser().parseData(b.toString("utf8")).specsByPath;

const texture = (b: Buffer, name: string): Texture => {
  const ext = extname(name).toLowerCase(), [w, h] = imageSize((pos, len) => b.subarray(pos, pos + len), 0, ext);
  return { w, h, format: ext === ".jpg" ? "jpeg" : ext.slice(1) };
};

/** A .usdz's images, the textures its layers use. */
const packed = (file: string) => [...unzip(readFileSync(file))].filter(([n]) => IMAGE.test(n));

/** A USD file's facts, in the report `model_audit` gives a .glb. Triangles are each Mesh prim's faces fanned, n - 2 for a
    face of n corners; materials are its Material prims; textures are a .usdz's images, or the files a loose layer's
    texture shaders name, beside it. */
export function readUsd(file: string): ModelReport {
  const zip = extname(file).toLowerCase() === ".usdz", files = zip ? unzip(readFileSync(file)) : null;
  let layers: Specs[];
  try { layers = files ? [...files].filter(([n]) => LAYER.test(n)).map(([, b]) => parse(b)) : [parse(readFileSync(file))]; }
  catch (e) { throw new Error(`${file}: three's USD parser could not read it: ${(e as Error).message}`); }
  if (zip && !layers.length) throw new Error(`${file}: a .usdz with no USD layer in it`);
  let triangles = 0, materials = 0;
  const named: string[] = [];
  // shortcut: counts each Mesh prim once, so a mesh referenced or instanced many times counts once, and a layer a loose file references is not read; count through USDComposer's instancing if a real file shows it matters
  for (const specs of layers) for (const [path, s] of Object.entries(specs)) {
    if (s.fields.typeName === "Material") materials++;
    const [prim, attr] = path.split(".");
    if (attr === "faceVertexCounts" && specs[prim!]?.fields.typeName === "Mesh")
      for (const n of Array.from(s.fields.default ?? []) as number[]) triangles += Math.max(0, n - 2);
    if (!files && (attr === "inputs:file" || attr === "inputs:filename")) {
      const v = s.fields.default, asset = typeof v === "string" ? v : v?.path ?? v?.assetPath;
      if (asset) named.push(asset);
    }
  }
  const textures = files ? [...files].filter(([n]) => IMAGE.test(n)).map(([n, b]) => texture(b, n))
    : [...new Set(named)].map(a => { try { return texture(readFileSync(resolve(dirname(file), a)), a); } catch { return { w: 0, h: 0, format: extname(a).slice(1) || "?" }; } });
  return { path: file, bytes: statSync(file).size, glb: false, triangles, lineOrPointPrims: 0, materials, textures, draco: false, meshopt: false, ktx2: false };
}

/** The largest texture inside a .usdz, as perf's imageDim measures one (the side of a square of its area); 0 when none. */
export const usdzImageDim = (file: string) => {
  try { return Math.max(0, ...packed(file).map(([n, b]) => { const t = texture(b, n); return Math.round(Math.sqrt(t.w * t.h)); })); }
  catch { return 0; }
};
