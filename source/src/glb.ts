// `model_audit`: what a website or a Shopify listing judges a .glb or .gltf (or a USD file, usd.ts) on, read from its JSON and its images' headers
// alone, so a Draco or meshopt file reports without a decoder; then a verdict against a target, and `shrink`, which
// rewrites a file without its textures or with them capped (gltf-transform's core, bundled; textures resized in Chrome's
// canvas). In both builds.
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { Browser } from "puppeteer-core";
import { utilPage } from "./reference.ts";
import { assetFiles, imageSize } from "./perf.ts";
import { BUDGETS, overBudget, type Budget } from "./budgets.ts";
import { readUsd, USD } from "./usd.ts";

type At = (pos: number, len: number) => Buffer;
function withFile<T>(path: string, fn: (at: At) => T): T {
  const fd = openSync(path, "r");
  try { return fn((pos, len) => { const b = Buffer.alloc(len); return b.subarray(0, readSync(fd, b, 0, len, pos)); }); }
  finally { closeSync(fd); }
}

export interface Texture { w: number; h: number; format: string }
export interface ModelReport {
  path: string; bytes: number; glb: boolean; triangles: number; lineOrPointPrims: number; materials: number;
  textures: Texture[]; draco: boolean; meshopt: boolean; ktx2: boolean;
}

const FORMAT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp", "image/ktx2": "ktx2", "image/avif": "avif" };
const EXT: Record<string, string> = { png: ".png", jpeg: ".jpg", webp: ".webp", ktx2: ".ktx2" }; // the formats imageSize reads

/** A model file's facts, from its JSON (a .glb's first chunk) and its images' headers. Triangles come from accessor
    counts, which glTF keeps in the JSON even for a Draco-compressed primitive: indices (or positions) / 3 for triangles,
    count - 2 for strips and fans; points and lines add none. Each mesh counts once per node of the default scene. */
export function readModel(file: string): ModelReport {
  if (USD.test(file)) return readUsd(file);
  const glb = extname(file).toLowerCase() === ".glb";
  return withFile(file, at => {
    let gltf: any, bin = 0;
    if (glb) {
      const h = at(0, 20);
      if (h.length < 20 || h.toString("latin1", 0, 4) !== "glTF" || h.toString("latin1", 16, 20) !== "JSON") throw new Error(`${file}: not a GLB (no glTF header and JSON chunk)`);
      const len = h.readUInt32LE(12);
      if (len > statSync(file).size) throw new Error(`${file}: its JSON chunk runs past the end of the file`);
      gltf = JSON.parse(at(20, len).toString());
      bin = 20 + len + 8;
    } else gltf = JSON.parse(readFileSync(file, "utf8"));

    const decode = (u: string) => { try { return decodeURIComponent(u); } catch { return u; } };
    const uri = (u: unknown) => typeof u === "string" && !u.startsWith("data:") ? resolve(dirname(file), decode(u)) : null;
    const external = [...gltf.buffers ?? [], ...gltf.images ?? []].map(x => uri(x.uri)).filter((p): p is string => !!p && existsSync(p));
    const bytes = statSync(file).size + external.reduce((n, p) => n + statSync(p).size, 0);

    const textures = (gltf.images ?? []).map((img: any): Texture => {
      const loose = uri(img.uri), format = FORMAT[img.mimeType] ?? (loose ? extname(loose).slice(1).toLowerCase().replace(/^jpg$/, "jpeg") : "?");
      const ext = EXT[format], v = gltf.bufferViews?.[img.bufferView];
      let size: [number, number] = [0, 0];
      if (ext && glb && v && !gltf.buffers?.[v.buffer ?? 0]?.uri) size = imageSize(at, bin + (v.byteOffset ?? 0), ext);
      else if (ext && loose && existsSync(loose)) size = withFile(loose, a => imageSize(a, 0, ext));
      return { w: size[0], h: size[1], format };
    });

    let triangles = 0, lineOrPointPrims = 0;
    const countMesh = (m: number) => {
      for (const p of gltf.meshes?.[m]?.primitives ?? []) {
        const n = gltf.accessors?.[p.indices ?? p.attributes?.POSITION]?.count ?? 0, mode = p.mode ?? 4;
        if (mode === 4) triangles += Math.floor(n / 3);
        else if (mode === 5 || mode === 6) triangles += Math.max(0, n - 2);
        else lineOrPointPrims++;
      }
    };
    const scene = gltf.scenes?.[gltf.scene ?? 0];
    if (scene) { // glTF nodes form trees; seen guards a malformed file against a cycle
      const seen = new Set<number>(), stack: number[] = [...scene.nodes ?? []];
      while (stack.length) {
        const i = stack.pop()!;
        if (seen.has(i)) continue;
        seen.add(i);
        const node = gltf.nodes?.[i];
        if (node?.mesh !== undefined) countMesh(node.mesh);
        stack.push(...node?.children ?? []);
      }
    } else (gltf.meshes ?? []).forEach((_: unknown, m: number) => countMesh(m));

    const used: string[] = gltf.extensionsUsed ?? [];
    return {
      path: file, bytes, glb, triangles, lineOrPointPrims, materials: gltf.materials?.length ?? 0, textures,
      draco: used.includes("KHR_draco_mesh_compression"), meshopt: used.some(e => /^(EXT|KHR)_meshopt_compression$/.test(e)), ktx2: used.includes("KHR_texture_basisu"),
    };
  });
}

export type Target = "site" | "shopify";
// shopify: Shopify's 3D model page (research Part E1): about 4 MB, textures at most 2048 for mobile web, delivered as
// GLB, no triangle limit. Its 2048 is a texture's longest side; site judges a texture by its area, as `perf` does.
const TARGETS: Record<Target, Partial<Budget>> = { site: BUDGETS.site, shopify: { assetMB: 4, textureMax: 2048 } };

const mb = (bytes: number) => +(bytes / 2 ** 20).toFixed(2);
const texSide = (t: Texture, target: Target) => target === "shopify" ? Math.max(t.w, t.h) : Math.round(Math.sqrt(t.w * t.h));

/** One line: the target, then passes or fails with each limit the file is over. */
export function verdict(r: ModelReport, target: Target): string {
  const limits = TARGETS[target];
  const over = overBudget({ assetMB: mb(r.bytes), triangles: r.triangles, textureMax: Math.max(0, ...r.textures.map(t => texSide(t, target))) }, limits).map(k =>
    k === "assetMB" ? `${mb(r.bytes)} MB over ${target === "shopify" ? "about 4 MB" : `${limits.assetMB} MB (the site budget for all assets)`}`
    : k === "triangles" ? `${r.triangles.toLocaleString("en-US")} triangles over ${limits.triangles!.toLocaleString("en-US")}`
    : r.textures.filter(t => texSide(t, target) > limits.textureMax!).map(t => `${t.w}×${t.h} texture over ${limits.textureMax}`).join("; "));
  if (target === "shopify" && !r.glb) over.unshift("not a GLB (Shopify takes .glb)");
  return `${target}: ${over.length ? `fails, ${over.join("; ")}` : "passes"}`;
}

/** One file's facts on one line, `rel` as the reply calls it. */
function factsLine(rel: string, r: ModelReport): string {
  const tex = r.textures.length ? `textures: ${r.textures.map(t => `${t.w ? `${t.w}×${t.h}` : "?"} ${t.format}`).join(", ")}` : "no textures";
  return [rel, r.bytes < 2 ** 20 ? `${Math.ceil(r.bytes / 1024)} KB` : `${mb(r.bytes)} MB`, `${r.triangles.toLocaleString("en-US")} triangles${r.lineOrPointPrims ? ` (+${r.lineOrPointPrims} point or line primitives)` : ""}`,
    `${r.materials} material${r.materials === 1 ? "" : "s"}`, tex, ...USD.test(rel) ? [] : [`Draco ${r.draco ? "yes" : "no"}, meshopt ${r.meshopt ? "yes" : "no"}, KTX2 ${r.ktx2 ? "yes" : "no"}`]].join(" · ");
}

/** What makes a USD file at `rel` smaller: shrink rewrites glTF only. */
export const CONVERT = (rel: string) => `convert ${rel} to GLB (Blender's USD import, then its glTF export; or usd2gltf), which \`model_audit\` shrink can then make smaller.`;

/** The shrink call for a model at `rel` (relative to cwd) with each texture capped at `max` px: `model_audit`'s Fix line
    for a failing file, and `perf`'s for a download over budget whose largest file is a model. */
export function shrinkFix(rel: string, max: number): string {
  if (USD.test(rel)) return `Fix: ${CONVERT(rel)}`;
  const out = join(dirname(rel), `${basename(rel, extname(rel))}-opt.glb`);
  return `Fix: \`model_audit\` { path: ${JSON.stringify(rel)}, shrink: { textures: ${max} } } writes ${out} with each texture at most ${max} px (WebP; textures: false drops them); then \`look\` compare against a look saved before (save).`;
}

/** The report for a .glb/.gltf, or every one under a folder, relative to cwd: a facts line, the verdict and, for a failing
    file, the shrink call that fixes it. */
export function assetsText(cwd: string, path: string, target: Target): string {
  if (!TARGETS[target]) throw new Error(`target must be one of ${Object.keys(TARGETS).join(", ")}`);
  const abs = resolve(cwd, path);
  const files = statSync(abs).isDirectory() ? assetFiles(abs).map(f => f.path).filter(f => /\.gl(b|tf)$/i.test(f) || USD.test(f)) : [abs];
  if (!files.length) throw new Error(`no .glb, .gltf or USD file under ${path}`);
  return files.map(f => {
    const rel = relative(cwd, f);
    let r: ModelReport;
    try { r = readModel(f); } catch (e) { if (files.length === 1) throw e; return `${rel}: unreadable, ${(e as Error).message}`; } // one bad file in a folder leaves the rest
    const v = verdict(r, target), lines = [factsLine(rel, r), v], max = TARGETS[target].textureMax!;
    if (v.includes("fails")) lines.push(shrinkFix(rel, max) + (r.triangles > (TARGETS[target].triangles ?? Infinity) ? " Shrink keeps every triangle: for fewer, pick a lower-poly model." : ""));
    return lines.join("\n");
  }).join("\n\n");
}

// Runs in Chrome: a texture's image capped at `cap` px on its longer side, as WebP (base64), or null when it is no larger
const RESIZE = async (b64: string, cap: number) => {
  const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))]);
  const full = await createImageBitmap(blob), k = cap / Math.max(full.width, full.height);
  if (k >= 1) return null;
  const w = Math.max(1, Math.round(full.width * k)), h = Math.max(1, Math.round(full.height * k));
  const img = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: "high", colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c.toDataURL("image/webp", 0.9).split(",")[1]!;
};

/** Rewrites a .glb or .gltf smaller, to `out` (`<name>-opt.glb` beside it by default; `file` itself to replace it):
    `textures: false` drops every texture, a number caps each one's longer side at that many pixels, re-encoded as WebP in
    Chrome's canvas (`chrome`). Meshopt files stay meshopt; a Draco file is refused (no decoder in the plugin). */
export async function shrink(file: string, o: { textures?: false | number; out?: string }, chrome?: Promise<Browser>): Promise<{ out: string; before: ModelReport; after: ModelReport }> {
  const before = readModel(file), out = o.out ?? join(dirname(file), `${basename(file, extname(file))}-opt.glb`);
  if (before.draco) throw new Error(`model_audit: ${basename(file)} is Draco-compressed, which shrink cannot decode; shrink the source model before its Draco step`);
  if (typeof o.textures === "number" && !(o.textures >= 1)) throw new Error("model_audit: shrink's textures is false or a size in pixels, at least 1");
  const [{ NodeIO }, { ALL_EXTENSIONS, EXTTextureWebP }, { MeshoptDecoder }, { MeshoptEncoder }] = await Promise.all([
    import("@gltf-transform/core"), import("@gltf-transform/extensions"), import("meshoptimizer/decoder"), import("meshoptimizer/encoder")]);
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  const doc = await io.read(file), textures = doc.getRoot().listTextures();
  // the writer leaves out what nothing references, so a disposed texture's image goes with it
  if (o.textures === false) for (const t of textures) t.dispose();
  else if (typeof o.textures === "number") {
    if (!chrome) throw new Error("model_audit: resizing textures needs Chrome");
    const page = await utilPage(chrome);
    let webp = false;
    for (const t of textures) {
      const image = t.getImage();
      if (!image || t.getMimeType() === "image/ktx2") continue; // a GPU format no canvas decodes
      const small = await page.evaluate(RESIZE, Buffer.from(image).toString("base64"), o.textures);
      if (!small) continue;
      t.setImage(new Uint8Array(Buffer.from(small, "base64"))).setMimeType("image/webp");
      if (t.getURI()) t.setURI(t.getURI().replace(/\.\w+$/, ".webp"));
      webp = true;
    }
    if (webp) doc.createExtension(EXTTextureWebP).setRequired(true);
  }
  await io.write(out, doc);
  return { out, before, after: readModel(out) };
}

/** The reply for a shrink: the file before and after, and the new file's verdict. */
export function shrinkText(cwd: string, file: string, s: Awaited<ReturnType<typeof shrink>>, target: Target): string {
  return [`Before: ${factsLine(relative(cwd, file), s.before)}`, `After: ${factsLine(relative(cwd, s.out), s.after)}`, verdict(s.after, target)].join("\n");
}
