// perf(): measure a game's frame time and load against a budget (budgets.ts).
// The game is reloaded with its current config, then its clock runs at real speed (Chrome is uncapped by
// --disable-frame-rate-limit, so frame times are the real cost, not vsync, while each frame draws something new: WORK).
// After a 1 s warm-up one sample runs until its two halves agree (SETTLED), or `seconds` × 2 at most; the halves' medians' spread is the noise floor optimize() compares gains against.
// The asset size is what the page and its running workers fetched (their Resource Timing entries for asset files), with
// the largest texture among them (a loose file or one inside a .glb) read from the file the URL serves.
import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Game, HarnessPage } from "./browser.ts";
import { overBudget, type Budget } from "./budgets.ts";
import { usdzImageDim } from "./usd.ts";

/** What perf() measured; times in ms, sizes in MB, overBudget names the budget keys exceeded. */
export interface PerfResult {
  median: number; p95: number; fps: number;
  calls: number; triangles: number; textureMB: number; programs: number;
  longTasks: number; gcPauses: number; heapMB: number | null; noiseMs: number;
  /** MB of asset files the page fetched (pageAssets()), its largest three, and how many of them gave no size. */
  assetMB: number; assets: Assets["assets"]; unsized: number;
  textureMax: number; pixelRatio: number;
  /** With `work` (WORK): paused frames timed from their step to the end of their GPU work. `ms` is the median of the
      frames that drew (all of them when none called three's render), `cpuMs` its frame code alone, `meanMs` the mean of
      every frame stepped (the cost per 60 Hz frame whatever the render cadence), `maxMs` the slowest; `drew` of `frames`
      drew. `paced` when the frame interval is the display's tick, not this work. */
  work?: { ms: number; cpuMs: number; meanMs: number; maxMs: number; drew: number; frames: number; paced: boolean };
  /** Main-thread busy ms (Chrome's TaskDuration) per frame with frames paced at 60 Hz; only with `clock`, and only in Chrome. */
  mainMsPerFrame?: number;
  /** Game seconds per real second while paced at 60 Hz (1 when the game keeps up); only with `clock`. */
  gameSpeed?: number;
  /** Each top-level render call of one frame, in order, timed to the end of its GPU work; only with `passes` and a
      frame of more than one call. Syncing stops the GPU overlapping passes, so they add up to more than the median. */
  passes?: Pass[];
  /** The first visit under `network`, before the measure. */
  firstFrame?: FirstFrame;
  /** What covered the canvas when the warm-up ended (covers()), and the real ms from the clock's start until it cleared
      (`cleared`) or until the wait gave up; absent when nothing covered it. */
  overlay?: { what: string; ms: number; cleared: boolean };
  /** With `costs` (COSTS): the main scene's visible content by named group, read after the sample. */
  costs?: Cost[] | null;
  overBudget: (keyof Budget)[];
}

export interface Pass { pass: string; ms: number; calls: number; triangles: number }

// Three paused frames with every top-level render call synced and timed (devtools.js); the frame with the median total
// is kept. Agents profiled their passes in Playwright scripts of their own: an aurora `perf` said 320 ms and nothing
// of where, and the agent timed its aurora, sky, land and composite passes by hand next.
export const PASSES = `(async () => {
  await __harness.sync(); __harness.track(true); __harness.timing = [];
  try { await __clock.step(3); await __harness.gpuTimes(); return __harness.timing; } finally { __harness.timing = null; __harness.track(false); }
})()`;

/** The pass list of the frame whose passes add up to the median of the timed frames, or undefined for a frame of one call. */
export function medianFrame(timed: (Pass & { frame: number })[]): Pass[] | undefined {
  const frames = [...Map.groupBy(timed, t => t.frame).values()].sort((a, b) => a.reduce((s, x) => s + x.ms, 0) - b.reduce((s, x) => s + x.ms, 0));
  const f = frames[Math.floor((frames.length - 1) / 2)];
  return f && f.length > 1 ? f.map(({ pass, ms, calls, triangles }) => ({ pass, ms: round(ms), calls, triangles })) : undefined;
}

/** `perf`'s lines for the passes: the costliest twelve in frame order, the rest summed. */
export function passesText(passes: Pass[]): string {
  const total = passes.reduce((s, p) => s + p.ms, 0), keep = new Set([...passes].sort((a, b) => b.ms - a.ms).slice(0, 12));
  const rest = passes.filter(p => !keep.has(p));
  return [`Passes in one frame, each timed to the end of its GPU work (${round(total)} ms in all: synced passes do not overlap):`,
    ...passes.filter(p => keep.has(p)).map((p, i) => `  ${p.pass}: ${p.ms} ms, ${p.calls} draw calls, ${p.triangles} triangles`),
    ...rest.length ? [`  … ${rest.length} more: ${round(rest.reduce((s, p) => s + p.ms, 0))} ms`] : []].join("\n");
}

/** One named group of the main scene: its triangles, the ones that cast shadows, its draw calls and its textures' bytes. */
export interface Cost { name: string; triangles: number; shadow: number; calls: number; bytes: number }
// The main scene's visible content by named group, read in one evaluate that draws nothing, the table agents built by hand
// in five scene loops (bloom/opus-1 it. 11, call 100). An object goes by its nearest named ancestor, as `look` names it;
// triangles as stats() counts them (h.tris) within the geometry's draw range, times an instanced mesh's count; a draw call
// per material drawn (one per geometry group for a material array; an instanced mesh is one); casting shadows only when the
// renderer's shadow map is on and a visible light casts; textures as STOP sizes them, each counted once in the table.
export const COSTS = `(() => { const h = __harness, scene = h.mainScene();
  if (!scene) return null;
  const r = h.views.get(scene)?.renderer ?? h.renderers[0], groups = new Map(), seen = new Set();
  let shadows = false;
  h.depth++;
  try {
    scene.traverseVisible(o => { shadows ||= !!(o.isLight && o.castShadow); });
    shadows &&= !!r?.shadowMap?.enabled;
    const add = (t, g) => {
      if (Array.isArray(t)) return t.forEach(x => add(x, g));
      if (!t?.isTexture || seen.has(t)) return;
      seen.add(t);
      for (const img of [t.image ?? {}].flat()) g.bytes += (img.videoWidth ?? img.width ?? 0) * (img.videoHeight ?? img.height ?? 0) * (img.depth ?? 1) * 4 * (t.generateMipmaps ? 4 / 3 : 1);
    };
    scene.traverseVisible(o => {
      if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
      const m = o.material, geo = o.geometry, n = o.isInstancedMesh ? o.count : 1;
      const calls = !n ? 0 : Array.isArray(m) ? (geo?.groups ?? []).filter(x => m[x.materialIndex]?.visible).length : m?.visible ? 1 : 0;
      if (!calls) return; // three draws nothing for it
      let name = o.type;
      for (let a = o; a && a !== scene; a = a.parent) if (a.name) { name = a.name; break; }
      const g = groups.get(name) ?? groups.set(name, { name, triangles: 0, shadow: 0, calls: 0, bytes: 0 }).get(name);
      const tri = o.isSprite ? 2 : o.isMesh && geo?.attributes ? Math.max(0, Math.floor(Math.min(h.tris(geo) * 3 - geo.drawRange.start, geo.drawRange.count) / 3)) * n : 0;
      g.triangles += tri; g.calls += calls;
      if (shadows && o.castShadow) g.shadow += tri;
      for (const x of [m].flat()) if (x) { for (const v of Object.values(x)) add(v, g); for (const u of Object.values(x.uniforms ?? {})) add(u?.value, g); }
    });
  } finally { h.depth--; }
  return [...groups.values()];
})()`;

/** `perf { costs }`'s table: the twelve groups with the most triangles, then the rest in one line. `frame` is the reply's
    first line (the frame as drawn) and the GPU's texture total: when the table's totals differ, the header says which
    number is which, since both read as the scene's (opinion-13 and opinion-14, #179). */
export function costsText(rows: Cost[] | null, frame?: { calls: number; triangles: number; textureMB: number }): string {
  if (!rows?.length) return "Costs: the main scene draws no visible object.";
  const sum = (name: string, l: Cost[]) => l.reduce((s, c) => ({ name, triangles: s.triangles + c.triangles, shadow: s.shadow + c.shadow, calls: s.calls + c.calls, bytes: s.bytes + c.bytes }), { name, triangles: 0, shadow: 0, calls: 0, bytes: 0 });
  const what = (c: Cost) => `${c.triangles} triangles, ${c.shadow} casting shadows, ${c.calls} draw calls, ${round(c.bytes / 2 ** 20)} MB of textures`;
  const by = [...rows].sort((a, b) => b.triangles - a.triangles || b.calls - a.calls), rest = by.slice(12), all = sum("", rows);
  const differs = [frame && (frame.triangles !== all.triangles || frame.calls !== all.calls) && `the first line's ${frame.triangles} triangles and ${frame.calls} draw calls are the frame as drawn, the camera's view plus the shadow pass`,
    frame && round(frame.textureMB) !== round(all.bytes / 2 ** 20) && `the ${round(frame.textureMB)} MB on the GPU adds the background and environment`].filter(Boolean);
  return [`Costs by named group: the main scene's visible objects, each under its nearest named ancestor as \`look\` names it, counted, not timed, and with no frustum culling (the frame draws only what its camera sees, plus a shadow pass per casting light); \`variants\` with \`hide\` times a group. In all ${what(all)}${differs.length ? ` (${differs.join("; ")})` : ""}:`,
    ...by.slice(0, 12).map(c => `  ${c.name}: ${what(c)}`), ...rest.length ? [`  … ${rest.length} more: ${what(sum("", rest))}`] : []].join("\n");
}

// every file type a game downloads besides its code: models, textures, environment maps, audio, video, fonts, wasm
// (only .glb, .gltf and four image types counted before, so an 8 MB .hdr or the game's music passed the download budget)
const ASSET_EXTS = new Set([".glb", ".gltf", ".bin", ".fbx", ".obj", ".usd", ".usda", ".usdc", ".usdz", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".ktx2",
  ".basis", ".dds", ".hdr", ".exr", ".mp3", ".ogg", ".wav", ".m4a", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".otf", ".wasm"]);
const DIM_EXTS = new Set([".glb", ".usdz", ".png", ".jpg", ".jpeg", ".ktx2", ".webp"]); // the ones imageDim reads a texture side from

/** A resource the page fetched, from Resource Timing: its URL, body bytes as sent, and HTTP status (0 when unknown). */
export interface Fetched { url: string; bytes: number; status: number }
// data: and blob: URLs are no download. A response revalidated with a 304 (the harness's server answers a reload with
// 304s) has a body size of 0, so a file this origin serves is sized from disk then (fetchedAssets).
const FETCHED = `performance.getEntriesByType("resource").filter(e => /^https?:/.test(e.name))
  .map(e => ({ url: e.name, bytes: e.encodedBodySize || e.decodedBodySize || 0, status: e.responseStatus ?? 0 }))`;

/** What fetchedAssets() makes of a load: MB, the largest three (with the file on disk when this origin serves it), the
    count with no size, the largest texture side, and every sized file by URL path with its texture side (0 when not read). */
export interface Assets { assetMB: number; assets: { name: string; MB: number; file?: string }[]; unsized: number; textureMax: number; files: { path: string; MB: number; dim: number }[] }

/** The asset files the page's last load fetched (fetchedAssets()): the window's Resource Timing and each running
    worker's own, since a worker's fetch (a loader decoding a .glb or its wasm in a worker) is in neither the window's
    list nor the page's CDP Network events; a worker that has ended is not counted. */
export async function pageAssets(game: Game): Promise<Assets> {
  let workers: ReturnType<HarnessPage["workers"]> = [];
  try { workers = game.page.workers(); } catch {} // an engine with none to list
  const lists = await Promise.all([game.page.evaluate(FETCHED), ...workers.map(w => w.evaluate(FETCHED).catch(() => []))]) as Fetched[][];
  return fetchedAssets(game.root, new URL(game.page.url()).origin, lists.flat());
}

/** The asset files (ASSET_EXTS: models, textures, environment maps, audio, video, fonts, wasm, never scripts, so a dev
    server's prebundled dependencies do not count) in what the page fetched, one per URL path (a `?v=` or Vite's `?import`
    twin is the same file): their MB, the largest three, how many gave no size (another origin's with no
    Timing-Allow-Origin or revalidated from the cache), and the largest texture side. A file this origin serves is found
    under `root` (or `root/public`, Vite's) for its texture side, and for its size when the response gave none or came in
    Range parts (206: an <audio> or <video> streams a long file in several, whose sizes add up for another origin's). The
    served folder was counted before, so 990 MB of raw downloads the page never requested read as its download (Backrooms, #131). */
export function fetchedAssets(root: string, origin: string, fetched: Fetched[]): Assets {
  const by = new Map<string, number>(), parts = new Set<string>();
  for (const f of fetched) {
    let u: URL; try { u = new URL(f.url); } catch { continue; }
    if (f.status >= 400 || !ASSET_EXTS.has(extname(u.pathname).toLowerCase())) continue; // a 404's body is a page, not the file
    const k = u.origin + u.pathname;
    if (f.status === 206) parts.add(k);
    by.set(k, f.status === 206 ? (by.get(k) ?? 0) + f.bytes : Math.max(by.get(k) ?? 0, f.bytes));
  }
  /** The file a URL of this origin serves, or undefined. */
  const fileOf = (k: string) => {
    const u = new URL(k);
    if (u.origin !== origin) return;
    try {
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
      return [join(root, rel), join(root, "public", rel)].find(p => !relative(root, p).startsWith("..") && statSync(p, { throwIfNoEntry: false })?.isFile());
    } catch { return; } // a malformed path
  };
  const dims = new Map<string, number>(), local = new Map<string, string>();
  for (const [k, bytes] of by) {
    const file = fileOf(k);
    if (!file) continue;
    local.set(k, file);
    if (!bytes || parts.has(k)) by.set(k, statSync(file).size);
    if (DIM_EXTS.has(extname(file).toLowerCase())) try { dims.set(k, imageDim(file)); } catch {} // unreadable: no side
  }
  const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
  const sizes = [...by].sort((a, b) => b[1] - a[1]);
  return {
    assetMB: sizes.reduce((n, [, b]) => n + b, 0) / 2 ** 20,
    assets: sizes.filter(([, b]) => b > 0).slice(0, 3).map(([k, b]) => ({ name: decode(k.split("/").pop()!), MB: round(b / 2 ** 20), file: local.get(k) })),
    unsized: sizes.filter(([, b]) => b === 0).length,
    textureMax: Math.max(0, ...dims.values()),
    files: sizes.filter(([, b]) => b > 0).map(([k, b]) => ({ path: decode(new URL(k).pathname.replace(/^\/+/, "")), MB: round(b / 2 ** 20), dim: dims.get(k) ?? 0 })),
  };
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "paprika3d"]); // dependencies, build output, harness runs

// Records every frame's timestamp (virtual time runs at real speed, scale 1) and counts long tasks. Each frame leaves a
// GPU fence, and a frame whose fence from two frames back has not passed syncs (`late`), so the GPU runs at most two
// frames behind, as a browser's frame pipeline lets it. A sync every frame stopped the CPU and GPU overlapping (12 ms
// of CPU and 9 of GPU a frame read 21.3 ms, 12.2 overlapped), and no sync let a light page queue 10,000 frames a second,
// then stall 3 s (#191). WebGL 1 and WebGPU have no fence here and sync every frame, as before. On a software
// renderer the running clock syncs each of its frames itself (clock.js): there a frame once read as its JavaScript alone.
export const START = `(() => {
  const p = window.__perf = { t: [], c: [], g: [], long: 0, on: true }, h = __harness, own = !window.__harnessConfig?.software, fences = [];
  new PerformanceObserver(l => { p.long += l.getEntries().length; }).observe({ type: "longtask" });
  const late = () => {
    const gls = h.renderers.map(r => r.isWebGLRenderer ? r.getContext() : null); // a WebGPURenderer's throws with no device yet
    if (!gls.length || gls.some(gl => typeof gl?.fenceSync !== "function" || gl.isContextLost())) return true;
    fences.push(gls.map(gl => [gl, gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)]));
    if (fences.length <= 2) return false;
    let behind = false;
    for (const [gl, f] of fences.shift()) { const s = f && gl.clientWaitSync(f, 0, 0); if (s !== gl.ALREADY_SIGNALED && s !== gl.CONDITION_SATISFIED) behind = true; if (f) gl.deleteSync(f); }
    return behind;
  };
  // each frame's stamp and its work (draw calls and triangles, shader programs), which SETTLED compares
  const tick = t => { if (p.on) { if (own && late()) h.sync(); p.t.push(t); p.c.push((h.frameInfo?.calls ?? 0) * 1e9 + (h.frameInfo?.triangles ?? 0)); p.g.push(h.renderers[0]?.info.programs?.length ?? 0); requestAnimationFrame(tick); } };
  requestAnimationFrame(tick);
  __clock.timescale(1);
  __clock.resume();
})()`;

// Stops the clock, then reads renderer.info, the scenes' textures and the JS heap.
// shortcut: texture memory is width × height × 4 (+⅓ for mipmaps), so compressed textures are overcounted; read their mip data if that matters.
export const STOP = `(() => {
  __perf.on = false;
  __clock.pause();
  const r = __harness.renderers[0];
  const seen = new Set(); let bytes = 0, dim = 0;
  const add = t => {
    if (Array.isArray(t)) return t.forEach(add); // uniform arrays of textures
    if (!t?.isTexture || seen.has(t)) return;
    seen.add(t);
    for (const img of [t.image ?? {}].flat()) { // a CubeTexture's image is its 6 faces
      const w = img.videoWidth ?? img.width ?? 0, h = img.videoHeight ?? img.height ?? 0;
      bytes += w * h * (img.depth ?? 1) * 4 * (t.generateMipmaps ? 4 / 3 : 1);
      dim = Math.max(dim, Math.round(Math.sqrt(w * h))); // a square's side of the same area: a 4096 × 1 lookup table is 64
    }
  };
  for (const s of __harness.scenes) {
    add(s.background); add(s.environment);
    s.traverse(o => {
      for (const m of [o.material].flat()) if (m) {
        for (const v of Object.values(m)) add(v);
        for (const u of Object.values(m.uniforms ?? {})) add(u?.value); // ShaderMaterial / RawShaderMaterial
      }
    });
  }
  return {
    calls: __harness.frameInfo?.calls ?? r?.info.render.drawCalls ?? r?.info.render.calls ?? 0, triangles: __harness.frameInfo?.triangles ?? r?.info.render.triangles ?? 0, programs: r?.info.programs?.length ?? 0,
    pixelRatio: r?.getPixelRatio?.() ?? devicePixelRatio, textureMB: bytes / 2 ** 20, textureDim: dim,
    heapMB: performance.memory ? performance.memory.usedJSHeapSize / 2 ** 20 : null,
  };
})()`;

// The page's own work per frame, apart from the frame interval: paused frames stepped one at a time, each timed in real
// time from its step to the end of its GPU work (__harness.sync awaited: WebGL's 1-pixel read, WebGPU's
// onSubmittedWorkDone), with no wait for the display, and whether it called three's render (frameNo moved); until 8
// frames drew, or 32 frames, or 1 s. A page that draws one frame in four had a median of the frames between, 0.1 ms
// against 1.3 for a drawn one, so a 25 ms draw every fourth frame would have read 0.1. Headless Chrome here (--disable-frame-rate-limit)
// runs frames back to back only while each one draws something new; a frame that presents nothing new waits for the 60 Hz
// tick (a blank page reads 17 ms, a WebGPU canvas drawn one frame in four 17.3 ms, drawn every frame 0.1 ms; Chrome 155 on
// an M4 Max, with or without --disable-gpu-vsync). So the Backrooms build read 17.8 ms for every variant, a 1-draw-call one
// too, while its own tick took 2.0 ms (#132).
const WORK = `(async () => { const c = __clock, h = __harness, all = [], cpu = [], drew = []; await h.sync();
  for (const end = c.realNow() + 1000; drew.filter(Boolean).length < 8 && all.length < 32 && (!all.length || c.realNow() < end);) {
    const n = h.frameNo, t = c.realNow(); await c.step(1); const s = c.realNow(); await h.sync();
    cpu.push(s - t); all.push(c.realNow() - t); drew.push(h.frameNo !== n);
  }
  return { all, cpu, drew }; })()`;
/** WORK's frames as PerfResult's `work`, less `paced`: the frames that drew (all of them when none did) give the median. */
export function workOf(w: { all: number[]; cpu: number[]; drew: boolean[] }) {
  const at = w.drew.some(Boolean) ? w.all.flatMap((_, i) => w.drew[i] ? [i] : []) : w.all.map((_, i) => i);
  return { ms: round(pick(sortNum(at.map(i => w.all[i]!)), 0.5)), cpuMs: round(pick(sortNum(at.map(i => w.cpu[i]!)), 0.5)),
    meanMs: round(w.all.reduce((a, b) => a + b, 0) / w.all.length), maxMs: round(Math.max(...w.all)), drew: w.drew.filter(Boolean).length, frames: w.all.length };
}
/** The frame interval is the display's tick, not the page's work: over 12 ms (no uncapped frame waits that long but for
    the tick or real work) and more than twice the work. */
export const pacingBound = (median: number, workMs: number) => median > 12 && workMs < median / 2;

const round = (n: number) => Math.round(n * 100) / 100;
const pick = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
const sortNum = (a: number[]) => [...a].sort((x, y) => x - y);

// Comparing a variant with the baseline over several page runs (one statistic a run): run-to-run spread between loads is
// larger than the spread within one load's sample, so a variant is judged on an interval over runs, not on noiseMs.
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
  2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042]; // 95% two-sided t quantiles for df 1 to 30; past 30, 1.96
/** The variant's statistic over the baseline's as a ratio with its 95% interval: Welch's t interval on the difference of
    the means of log(x), turned back with exp, Welch–Satterthwaite df floored (the larger quantile). Zero spread on both
    sides gives a point interval (lo = hi = ratio); fewer than two runs a side gives 0 to Infinity. */
export function ratioInterval(base: number[], variant: number[]): { ratio: number; lo: number; hi: number } {
  const stats = (x: number[]) => { const l = x.map(Math.log), m = l.reduce((s, v) => s + v, 0) / l.length;
    return { m, v: l.reduce((s, v) => s + (v - m) ** 2, 0) / (l.length - 1) / l.length, n: l.length }; }; // v: the mean's variance
  const a = stats(base), b = stats(variant), ratio = Math.exp(b.m - a.m), se2 = a.v + b.v;
  if (a.n < 2 || b.n < 2) return { ratio, lo: 0, hi: Infinity };
  const df = se2 ** 2 / (a.v ** 2 / (a.n - 1) + b.v ** 2 / (b.n - 1)); // NaN when se2 is 0, and then the half-width is 0 anyway
  const half = (T95[Math.floor(df) - 1] ?? 1.96) * Math.sqrt(se2);
  return { ratio, lo: Math.exp(b.m - a.m - half), hi: Math.exp(b.m - a.m + half) };
}
/** A ratio interval settles the question: its half-width is at most `width` percent of the ratio (precise enough to say
    "no clear change" or the size of one), or it lies wholly more than `floor` percent above or below 1. */
export const decided = (r: { ratio: number; lo: number; hi: number }, { width, floor }: { width: number; floor: number }) =>
  (r.hi - r.lo) / 2 / r.ratio * 100 <= width || r.lo > 1 + floor / 100 || r.hi < 1 - floor / 100;

// `perf` with variants, from the Studio calibration (docs/optimize-log.md, 2026-10-29, T1 of the perf-runs plan):
export const RUN_S = 0.25; // a variant samples 0.25 s, the baseline 0.5 s: a 250 ms window spreads across loads as much as a 2 s one
export const RUN_WARM_MS = 300; // frames were within 2% of steady from 300 ms on every page measured
export const RUNS_FLOOR = 3; // a 20% change decided in 3.5 rounds on average; floors of 4 and 5 bought no fewer false changes
export const RUNS_CAP = 5; // a no-op runs to the cap and reads "no clear change" either way; 8 made a 5-variant call 42-44 s (JC, 2026-10-29)
export const CALL_CAP_S = 45; // about twice a 5-variant call on the 11 ms bloom page before runs repeated (23.5 s)
export const DECIDED_WIDTH = 10, DECIDED_FLOOR = 5; // percent: 0-4% of no-ops read as a change in the replay, at 4.7-5.2 rounds
const STEP_MS = 0.1; // Chrome's frame stamp step: a 0.2 ms page with no spread read one step as ±50% on a zero-width interval

/** A variant's run statistics against the baseline's: whether more runs would tell more (`settled` when the interval is
    decided, or says the change is within one frame stamp step), and the words for its row. A change is said only when
    settled, its interval excludes 1 and it moves the frame by more than one step; anything else is "no clear change". */
export function compare(base: number[], variant: number[], work = false): { settled: boolean; text: string } {
  const r = ratioInterval(base, variant), mid = sortNum(base)[base.length >> 1]!;
  const settled = decided(r, { width: DECIDED_WIDTH, floor: DECIDED_FLOOR }) || Math.max(r.hi - 1, 1 - r.lo) * mid <= STEP_MS;
  const pct = (x: number) => { const v = Math.round((x - 1) * 100); return v < 0 ? `−${-v}%` : `+${v}%`; };
  const runs = `${variant.length} run${variant.length > 1 ? "s" : ""}`;
  if (settled && (r.lo > 1 || r.hi < 1) && Math.abs(r.ratio - 1) * mid > STEP_MS) return { settled, text: `${pct(r.ratio)} ${work ? "work " : ""}(${pct(r.lo)} to ${pct(r.hi)}) vs baseline over ${runs}` };
  return { settled, text: `no clear change${work ? " in work" : ""} (${Number.isFinite(r.hi) ? `${pct(r.lo)} to ${pct(r.hi)}, ` : "too few for an interval, "}${runs})` };
}

// A sample has settled when its frames split into two halves of at least SETTLE_FRAMES whose frame-time medians agree
// (within 1%, so the same 0.1 ms step of Chrome's frame stamps on a fast scene: at 5% the cubes fixture stopped while its
// GPU still sped up and read 4.8 ms against 4.7) and whose draw calls, triangles and shader programs are the same. A sample
// ended at 300 frames read kart's race at 0.9 ms against 1.1 (its light countdown came first), so a scene still changing
// (a countdown then a race, new shaders compiling) does not settle and runs to the timeout.
const SETTLE_FRAMES = 100;
const SETTLED = `(() => { const p = __perf, n = p.t.length - 1, h = n >> 1;
  if (h < ${SETTLE_FRAMES}) return false;
  const med = (a, i, j) => a.slice(i, j).sort((x, y) => x - y)[(j - i) >> 1];
  const f = p.t.slice(1).map((x, i) => x - p.t[i]), a = med(f, 0, h), b = med(f, h, n);
  return Math.abs(a - b) <= Math.max(0.01 * Math.max(a, b), 0.05) && med(p.c, 1, h + 1) === med(p.c, h + 1, n + 1) && p.g[0] === p.g[n]; })()`;

/** Frame times (ms) from now until they settle (SETTLED) or `timeoutMs` passes, as two halves, and the long tasks seen meanwhile. */
async function sample(page: HarnessPage, timeoutMs: number) {
  await page.evaluate("__perf.t = [], __perf.c = [], __perf.g = [], __perf.long = 0");
  for (const end = Date.now() + timeoutMs; Date.now() < end && !await page.evaluate(SETTLED);) await sleep(50);
  const read = () => page.evaluate("({ t: __perf.t, long: __perf.long })") as Promise<{ t: number[]; long: number }>;
  let r = await read();
  // a frame slower than the window leaves one stamp: wait up to 15 s for the next, so only a page that draws nothing has no frames
  for (let i = 0; r.t.length < 2 && i < 15; i++) { await sleep(1000); r = await read(); }
  const frames = r.t.slice(1).map((x, i) => x - r.t[i]!), h = frames.length >> 1;
  return { a: frames.slice(0, h), b: frames.slice(h), long: r.long };
}

// Why no frame was timed: no renderer, a page that never asks for a frame (scheduled flat), or one stamp (a frame over 15 s).
const NO_FRAMES = `(() => { const c = __clock; return "clock " + (c.paused() ? "paused" : "running") + " at " + Math.round(c.now()) + " ms, "
  + c.scheduled() + " timers and frames ever scheduled, " + __perf.t.length + " stamps, page " + (document.hidden ? "hidden" : "visible")
  + ", " + __harness.renderers.length + " renderers"; })()`;

// Display-paced cost: frames capped at 60 Hz in the page, as on a real screen, since uncapped frames reward a game whose
// logic waits on a worker with draws that would never happen; measured last because the cap stays until the next reload.
const PACE = `(() => { const raf = requestAnimationFrame.bind(window); let last = -1e9; __perf.paced = 0;
  window.requestAnimationFrame = cb => raf(function f(t) { if (t === last || t - last >= 16.6) { if (t !== last) __perf.paced++; last = t; cb(t); } else raf(f); }); })()`;
async function pacedCost(page: HarnessPage, clock: string, seconds: number) {
  await page.evaluate(PACE);
  await sleep(500);
  const read = async () => ({ ms: ((await page.metrics()).TaskDuration ?? NaN) * 1000, at: performance.now(),
    ...await page.evaluate(k => ({ t: Number((window as any).__game.observe()[k]), n: (window as any).__perf.paced as number }), clock) });
  const a = await read();
  await sleep(seconds * 1000);
  const b = await read(), game = b.t - a.t, frames = b.n - a.n;
  // an engine with no TaskDuration (engines.ts) gives no main-thread number, not 0
  return frames > 0 ? { ...!Number.isNaN(b.ms - a.ms) && { mainMsPerFrame: round((b.ms - a.ms) / frames) }, gameSpeed: round(game / ((b.at - a.at) / 1000)) } : null;
}

const MIME: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/ktx2": ".ktx2", "image/webp": ".webp" };

/** Width and height of a PNG, JPEG, KTX2 or WebP file from its header, or the largest texture embedded in a .glb or .usdz; 0 when it
    cannot tell. Reads only header bytes (and a .glb's JSON chunk). */
// A texture's size against textureMax is the side of a square of the same area, not its longest side: a 4096 × 1
// lookup table (16 KB) read as over budget and an AA-3D agent halved it.
const side = (w: number, h: number) => Math.round(Math.sqrt(w * h));

export function imageDim(path: string): number {
  const ext = extname(path).toLowerCase();
  if (ext === ".gltf") return 0; // its textures are loose files, which the asset walk measures on their own
  if (ext === ".usdz") return usdzImageDim(path);
  const fd = openSync(path, "r");
  const at = (pos: number, len: number) => { const b = Buffer.alloc(len); return b.subarray(0, readSync(fd, b, 0, len, pos)); };
  try {
    if (ext !== ".glb") return side(...imageSize(at, 0, ext));
    // A .glb: 12-byte header, a JSON chunk whose bufferViews place each image in the binary chunk that follows it.
    const h = at(12, 8);
    const len = h.length === 8 ? h.readUInt32LE(0) : 0, bin = 20 + len + 8;
    if (h.toString("latin1", 4, 8) !== "JSON" || len > statSync(path).size) return 0;
    let gltf: any;
    try { gltf = JSON.parse(at(20, len).toString()); } catch { return 0; }
    // images by uri are loose files, which the asset walk measures on their own
    return Math.max(0, ...(gltf.images ?? []).map((img: any) => {
      const v = gltf.bufferViews?.[img.bufferView];
      return v && MIME[img.mimeType] ? side(...imageSize(at, bin + (v.byteOffset ?? 0), MIME[img.mimeType]!)) : 0;
    }));
  } finally { closeSync(fd); }
}

/** Width and height of the image of type ext (.png, .jpg/.jpeg, .ktx2, .webp) starting at byte base; [0, 0] when it cannot tell. */
export function imageSize(at: (pos: number, len: number) => Buffer, base: number, ext: string): [number, number] {
  if (ext === ".png") { const b = at(base + 16, 8); return b.length === 8 ? [b.readUInt32BE(0), b.readUInt32BE(4)] : [0, 0]; }
  if (ext === ".ktx2") { const b = at(base + 20, 8); return b.length === 8 ? [b.readUInt32LE(0), b.readUInt32LE(4)] : [0, 0]; }
  if (ext === ".webp") { // RIFF, then the first chunk: lossy VP8, lossless VP8L or extended VP8X, each keeps the size its own way
    const b = at(base + 12, 18), kind = b.length === 18 ? b.toString("latin1", 0, 4) : "";
    if (kind === "VP8 ") return [b.readUInt16LE(14) & 0x3fff, b.readUInt16LE(16) & 0x3fff];
    if (kind === "VP8L") { const n = b.readUInt32LE(9); return [(n & 0x3fff) + 1, ((n >>> 14) & 0x3fff) + 1]; }
    if (kind === "VP8X") return [b.readUIntLE(12, 3) + 1, b.readUIntLE(15, 3) + 1];
    return [0, 0];
  }
  // JPEG: hop from marker to marker until a start-of-frame segment, which holds height and width.
  for (let i = base + 2, b = at(i, 9); b.length === 9 && b[0] === 0xff; b = at(i, 9)) {
    const m = b[1]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(7), b.readUInt16BE(5)];
    i += 2 + b.readUInt16BE(2);
  }
  return [0, 0];
}

/** Every asset file under dir (dependencies, build output and harness runs skipped): its path, size and texture dimension. */
export function assetFiles(dir: string): { path: string; bytes: number; dim: number }[] {
  const out: { path: string; bytes: number; dim: number }[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
      const ext = extname(e.name).toLowerCase();
      if (e.isFile() && ASSET_EXTS.has(ext)) out.push({ path: p, bytes: statSync(p).size, dim: DIM_EXTS.has(ext) ? imageDim(p) : 0 });
    }
  };
  walk(dir);
  return out;
}

/** Chrome DevTools' own network presets (front_end/core/sdk/NetworkManager.ts): download and upload in bytes/s, latency
    in ms. 3g: 500 kbps × 0.8, 2,000 ms; slow-4g: 1.6 Mbps × 0.9 down, 750 kbps × 0.9 up, 562.5 ms; fast-4g: 9 Mbps × 0.9
    down, 1.5 Mbps × 0.9 up, 165 ms. */
export const NETWORKS = {
  "3g": { download: 500_000 / 8 * 0.8, upload: 500_000 / 8 * 0.8, latency: 400 * 5 },
  "slow-4g": { download: 1_600_000 / 8 * 0.9, upload: 750_000 / 8 * 0.9, latency: 150 * 3.75 },
  "fast-4g": { download: 9_000_000 / 8 * 0.9, upload: 1_500_000 / 8 * 0.9, latency: 60 * 2.75 },
};
export type Network = keyof typeof NETWORKS;

/** What a first visit on a network waits on: the first scene frame (real ms after navigation, null when none came), the
    script MB downloaded, and the reply line. */
export interface FirstFrame { ms: number | null; scriptMB: number; line: string; /** the largest three, for an over-budget script */ scripts: { name: string; MB: number }[] }

const FIRST_POLL = `(() => { const h = window.__harness; return h ? { now: Performance.prototype.now.call(performance), first: h.firstFrameAt ?? null,
  covers: h.covers().filter(c => c.over).map(c => c.what) } : null; })()`;

/** How long the sample waits for an overlay to go: real ms from the clock's start, the warm-up included (JC, 2026-10-25). */
const OVERLAY_MS = 5_000;
/** Waits, the clock running, until no element covers the canvas (FIRST_POLL's covers, polled every 100 ms) or `limitMs` from
    `from` has passed: a judge's `perf` timed a loading poster as the scene, "1 draw calls, 2 triangles" (bloom/opus-2
    it. 23, judge call 18; #164). What covered it, and when it went or the wait ended; undefined when nothing covered it. */
async function overlayOf(page: HarnessPage, from: number, limitMs: number): Promise<PerfResult["overlay"]> {
  const over = async () => (await page.evaluate(FIRST_POLL) as { covers: string[] } | null)?.covers ?? [];
  const what = await over();
  if (!what.length) return undefined;
  let left = what;
  while (left.length && Date.now() - from < limitMs) { await sleep(100); left = await over(); }
  return { what: what.join(", "), ms: Date.now() - from, cleared: !left.length };
}
/** `perf`'s words on the overlay it waited for, after the load line; "" when nothing covered the canvas. */
export const overlayText = (o: PerfResult["overlay"]) => !o ? "" : o.cleared
  ? ` Waited ${(o.ms / 1000).toFixed(1)} s for the loading overlay (${o.what}) to clear before sampling.`
  : ` Sampled under an overlay: ${o.what} (still up after ${(o.ms / 1000).toFixed(1)} s).`;
const KINDS: [string, RegExp][] = [["scripts", /\.m?js$/], ["models", /\.(glb|gltf|bin|fbx|obj|drc|usd[acz]?)$/], ["textures", /\.(png|jpe?g|webp|avif|gif|ktx2|basis|hdr|exr|dds)$/], ["fonts", /\.(woff2?|ttf|otf)$/]];
const CDP_KIND: Record<string, string> = { Script: "scripts", Image: "textures", Font: "fonts" };

/** Loads the page as a visitor's first visit does: real time (unpaused), Chrome's cache off and `network`'s throughput and
    latency, and times the first render to the screen (`__harness.firstFrameAt`) and when each element over the canvas
    (`covers()`, sampled every 100 ms) stops showing, from navigation. Bytes per kind are CDP's encoded (on the wire)
    lengths. The game is left reloaded, paused at frame 0, with neither. A page served from this host is otherwise instant,
    and the paused clock would put the first frame at the first step, so both are lifted for this load only. */
export function firstFrame(game: Game, network: Network): Promise<FirstFrame> {
  return game.queue(async () => {
    const cdp = await game.page.createCDPSession(), n = NETWORKS[network];
    const reqs = new Map<string, { url: string; type: string }>(), got: { url: string; type: string; bytes: number; at: number }[] = [];
    let t0: number | undefined, first: number | null = null, now = 0, start = Date.now();
    const loadMs = game.loadMs; // the open's own load time, which the reload below would replace
    const covered = new Map<string, number | null>(); // what showed over the canvas → when it stopped (page ms), null while it shows
    cdp.on("Network.requestWillBeSent", e => { reqs.set(e.requestId, { url: e.request.url, type: e.type ?? "" }); if (e.type === "Document") t0 ??= e.timestamp; });
    cdp.on("Network.loadingFinished", e => { const r = reqs.get(e.requestId); if (r) got.push({ ...r, bytes: e.encodedDataLength, at: e.timestamp }); });
    try {
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: n.latency, downloadThroughput: n.download, uploadThroughput: n.upload });
      await game.configure({ paused: false });
      game.page.reload({ timeout: 0 }).catch(() => {}); // not awaited: boot's 10 s limit and the load event are too soon on 3g
      start = Date.now();
      for (;;) {
        await sleep(100);
        const s = await game.page.evaluate(FIRST_POLL).catch(() => null) as { now: number; first: number | null; covers: string[] } | null;
        if (s) {
          now = s.now; first ??= s.first;
          for (const c of s.covers) covered.set(c, null);
          for (const [c, gone] of covered) if (gone === null && !s.covers.includes(c)) covered.set(c, s.now);
        }
        // a frame and nothing over it, or 10 s of an overlay after the frame, or a minute with no frame
        if (first !== null && ([...covered.values()].every(g => g !== null) || now - first > 10_000)) break;
        if (Date.now() - start > 60_000) break;
      }
    } finally {
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: false }).catch(() => {});
      await cdp.detach().catch(() => {});
      await game.reload({ paused: true });
      game.loadMs = loadMs;
    }
    const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`, mb = (b: number) => `${round(b / 2 ** 20)} MB`;
    const kinds = Map.groupBy(got.filter(g => g.type !== "Document" && !g.url.startsWith("data:")), g => {
      const path = g.url.split(/[?#]/)[0]!.toLowerCase();
      return KINDS.find(([, re]) => re.test(path))?.[0] ?? CDP_KIND[g.type] ?? "other";
    });
    const bytes = [...kinds].map(([kind, l]) => ({ kind, l, total: l.reduce((a, g) => a + g.bytes, 0), at: Math.max(...l.map(g => g.at)) }))
      .sort((a, b) => a.at - b.at).map(({ kind, l, total, at }) =>
        `${l.length === 1 ? decodeURIComponent(l[0]!.url.split(/[?#]/)[0]!.split("/").pop()!) : `${kind}`} ${mb(total)} by ${s((at - (t0 ?? at)) * 1000)}`);
    const covers = [...covered].map(([c, gone]) => gone === null ? `${c} still over the canvas at ${s(now)}` : `${c} over the canvas gone at ${s(gone)}`);
    const head = first === null ? `No scene frame within ${s(Date.now() - start)} after navigation` : `First scene frame: ${s(first)} after navigation`;
    return {
      ms: first, scriptMB: round((kinds.get("scripts") ?? []).reduce((a, g) => a + g.bytes, 0) / 2 ** 20),
      scripts: [...kinds.get("scripts") ?? []].sort((a, b) => b.bytes - a.bytes).slice(0, 3).map(g => ({ name: decodeURIComponent(g.url.split(/[?#]/)[0]!.split("/").pop()!), MB: round(g.bytes / 2 ** 20) })),
      line: `${head} on ${network}, a first visit with no cache${bytes.length ? ` (${bytes.join(", ")})` : ""}${covers.length ? `; ${covers.join("; ")}` : ""}.`,
    };
  });
}

/** Runs in the page: the main scene's lights that draw (visible), by kind, and how many cast shadows, with their largest map side. */
export const LIGHTS = `(() => {
  const n = { point: 0, spot: 0, directional: 0, shadows: 0, map: 0 };
  window.__harness.mainScene()?.traverseVisible(o => {
    if (!o.isLight || !(o.isPointLight || o.isSpotLight || o.isDirectionalLight || o.isRectAreaLight)) return; // ambient, hemisphere and probes cost next to nothing
    n[o.isPointLight ? "point" : o.isSpotLight || o.isRectAreaLight ? "spot" : "directional"]++;
    if (o.castShadow) { n.shadows++; n.map = Math.max(n.map, o.shadow?.mapSize?.x ?? 0); }
  });
  return n;
})()`;
export interface Lights { point: number; spot: number; directional: number; shadows: number; map: number }
/** Many lights: over 8 point and spot lights, or over 2 shadow casters (first guesses; AA-3D warehouse had 18 point lights). */
export const manyLights = (l: Lights | null): l is Lights => !!l && (l.point + l.spot > 8 || l.shadows > 2);
/** The Lights line for a scene with many, or "": with `cost`, what turning them off saved (`perf`); without, a pointer to it (`open`). */
export function lightsText(l: Lights | null, cost?: { ms: number; frame: number; noise: number; what: string }): string {
  if (!manyLights(l)) return "";
  const kinds = [l.point && `${l.point} point`, l.spot && `${l.spot} spot`, l.directional && `${l.directional} directional`].filter(Boolean).join(", ");
  const head = `Lights: ${kinds} lights${l.shadows ? `, ${l.shadows} casting shadows (${l.map} maps)` : ""}`;
  if (!cost) return `${head}: every lit material pays for each one; \`perf\` measures what they cost.`;
  if (cost.ms <= cost.noise) return `${head}; turning off the ${cost.what} saved no more than the noise (${cost.noise} ms).`;
  // advice only when they are a real share of the frame: AA-3D warehouse's 15 point lights cost 0.5 ms of 10.4 on an M3
  if (cost.ms < 0.2 * cost.frame) return `${head}; the ${cost.what} cost ${cost.ms} ms of a ${cost.frame} ms frame.`;
  return `${head}; the ${cost.what} cost ${cost.ms} ms of a ${cost.frame} ms frame. Light with a few real lights and make decorative lamps emissive materials; each shadow-casting point light draws the scene 6 more times.`;
}

/** One `perf` variant: objects to hide by name, a pixel ratio, code run in the page (with `renderer` and `scene`), and
    a query the page loads with (`noshadow&pr=0.5`, for switches the game reads at load). */
export interface Variant { label?: string; hide?: string[]; pixelRatio?: number; code?: string; query?: string }

/** `home` with its query replaced by the variant's, or `home` itself for a variant without one. */
export function variantUrl(home: string, v: Variant): string {
  if (v.query === undefined) return home;
  const u = new URL(home);
  u.search = v.query.replace(/^\?/, "");
  return u.href;
}

/** The page code that applies a variant after a reload; it throws when a named object is not in any scene. */
export function variantSetup(v: Variant): string {
  return `(() => { const h = window.__harness, renderer = h.renderers[0], scene = h.mainScene(), hide = new Set(${JSON.stringify(v.hide ?? [])}), seen = new Set();
    // pinned hidden: a game that sets visible every frame would show it again (the page is reloaded after the measure)
    for (const s of h.scenes) s.traverse(o => { if (hide.has(o.name)) { Object.defineProperty(o, "visible", { get: () => false, set() {}, configurable: true }); seen.add(o.name); } });
    const missing = [...hide].filter(n => !seen.has(n));
    if (missing.length) throw new Error("perf: no object named " + missing.join(", "));
    ${v.pixelRatio ? `renderer.setPixelRatio(${Number(v.pixelRatio)});` : ""}
    ${v.code ? `(new Function("renderer", "scene", ${JSON.stringify(v.code)}))(renderer, scene);` : ""}
  })()`;
}

/** Reloads the game, runs it at real speed and measures it against budget; the game is left paused.
    The assets are the files this reload fetched (pageAssets()); `work` adds the page's work per frame (WORK), which
    judges frameMs in place of the interval when the interval is pacing-bound. `state` is set after the
    reload (to keep a game from ending mid-measure); `clock` names the observe() key holding game seconds, which adds
    mainMsPerFrame and gameSpeed at a 60 Hz pace: a fair cost for a game whose logic waits on a worker. `throttle` slows the
    page's JavaScript that many times (CDP CPU throttling, a weak laptop), as AA-3D agents did in scripts of their own;
    GPU work is not slowed. `network` first times a first visit on that network (firstFrame(), under the same throttle);
    the budget's firstSceneFrameMs is judged only on fast-4g, the network it is set for. After the warm-up, the sample
    waits for an element over the canvas to go (overlayOf()), at most `overlayMs` from the clock's start (0: no wait);
    `costs` reads the scene's content by named group after the sample (COSTS). */
export function perf(game: Game, budget: Budget, { seconds = 2, warmMs = 1000, state, clock, setup, url, passes = false, work = false, throttle, network, costs = false, overlayMs = OVERLAY_MS }: { seconds?: number; warmMs?: number; state?: object; clock?: string; setup?: string; url?: string; passes?: boolean; work?: boolean; throttle?: number; network?: Network; costs?: boolean; overlayMs?: number } = {}): Promise<PerfResult> {
  return game.queue(async () => {
    if (!throttle || throttle <= 1) return measure();
    const cdp = await game.page.createCDPSession();
    try { await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle }); return await measure(); }
    finally { await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {}); await cdp.detach().catch(() => {}); }
  });
  async function measure(): Promise<PerfResult> {
    const first = network ? await firstFrame(game, network) : undefined;
    await game.reload(undefined, url);
    if (state) await game.page.evaluate(s => (window as any).__game.setState(s), state);
    await game.page.evaluate(START);
    const ran = Date.now();
    await sleep(warmMs); // warm-up: shader compiles and first uploads
    const overlay = overlayMs ? await overlayOf(game.page, ran, overlayMs) : undefined;
    // a `perf` variant, once the game has built its scene: hide objects, lower the pixel ratio, run the agent's code
    if (setup) { await game.page.evaluate(setup); await sleep(300); }
    // a variant samples one baseline half (the span the noise is measured over), not both: on an animated page every
    // sample runs to its limit, and 4 s a variant made a 5-variant call 40 s (#163; a no-op variant read the same either way)
    const { a, b, long } = await sample(game.page, (setup ? seconds : seconds * 2) * 1000);
    const all = sortNum([...a, ...b]);
    const why = all.length ? "" : await game.page.evaluate(NO_FRAMES) as string; // before STOP pauses the clock
    const paced = clock ? await pacedCost(game.page, clock, seconds * 2) : null;
    const info = await game.page.evaluate(STOP) as { calls: number; triangles: number; programs: number; pixelRatio: number; textureMB: number; textureDim: number; heapMB: number | null };
    const table = costs ? await game.page.evaluate(COSTS) as Cost[] | null : undefined; // the scene as sampled, before PASSES and WORK step it
    const timed = passes ? medianFrame(await game.page.evaluate(PASSES) as (Pass & { frame: number })[]) : undefined;
    if (!all.length) throw new Error(`perf: no frames ran; is the page rendering with requestAnimationFrame? (${why})`);
    const median = pick(all, 0.5);
    const w = work ? workOf(await game.page.evaluate(WORK) as { all: number[]; cpu: number[]; drew: boolean[] }) : undefined;
    const workMs = w?.ms;
    const tick = workMs !== undefined && pacingBound(median, workMs);
    const assets = await pageAssets(game);
    const textureMax = Math.max(assets.textureMax, info.textureDim);
    const measured = { frameMs: tick ? workMs : median, triangles: info.triangles, drawCalls: info.calls, assetMB: assets.assetMB, textureMax, pixelRatioMax: info.pixelRatio,
      ...first && { scriptMB: first.scriptMB }, ...first && network === "fast-4g" && { firstSceneFrameMs: first.ms ?? Infinity } };
    return {
      median: round(median),
      p95: round(pick(all, 0.95)),
      fps: Math.round(all.length / (all.reduce((s, x) => s + x, 0) / 1000)), // "1536.78 fps" was false precision (opinion-9)
      calls: info.calls,
      triangles: info.triangles,
      textureMB: round(info.textureMB),
      programs: info.programs,
      longTasks: long,
      gcPauses: all.filter(x => x > Math.max(3 * median, budget.frameMs)).length, // frames over 3× the median that also miss the budget, most often a GC pause
      heapMB: info.heapMB === null ? null : round(info.heapMB),
      noiseMs: round(Math.max(0.3, Math.abs(pick(sortNum(a), 0.5) - pick(sortNum(b), 0.5)))),
      assetMB: round(assets.assetMB),
      assets: assets.assets,
      unsized: assets.unsized,
      textureMax,
      ...w && { work: { ...w, paced: tick } },
      pixelRatio: info.pixelRatio,
      ...paced,
      ...timed ? { passes: timed } : {},
      ...first && { firstFrame: first },
      ...overlay && { overlay },
      ...table !== undefined && { costs: table },
      overBudget: overBudget(measured, budget),
    };
  }
}
