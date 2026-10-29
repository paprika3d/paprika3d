// Performance budgets perf() measures a game against. v1 measures desktop web on this Mac only;
// the mobile and Quest entries are rough proxies kept for later and unused in v1.

/** Limits a game should stay within: frame time, download size, triangles, draw calls, texture size, pixel ratio; a site
    also its first scene frame (ms after navigation under fast-4g) and its script download (MB). */
export interface Budget { frameMs: number; assetMB: number; triangles: number; drawCalls: number; textureMax: number; pixelRatioMax: number; firstSceneFrameMs?: number; scriptMB?: number; proxy?: true }

/** Budgets by target; only desktop is measured in v1. Draw calls (a guide, #33): Khronos 3D Commerce's desktop web target
    is under 100, PlayCanvas puts low-end mobile at 100-200, Meta allows a Quest 500 (docs/research-nightly-web3d-quality-evals-2026-10-16.md). */
export const BUDGETS = {
  desktop: { frameMs: 16.7, assetMB: 5, triangles: 200_000, drawCalls: 100, textureMax: 2048, pixelRatioMax: 2 },
  mobile: { frameMs: 16.7, assetMB: 3, triangles: 100_000, drawCalls: 100, textureMax: 1024, pixelRatioMax: 2, proxy: true },
  quest: { frameMs: 13.9, assetMB: 10, triangles: 300_000, drawCalls: 500, textureMax: 2048, pixelRatioMax: 1, proxy: true },
  // a 3D website's first visit: the scene within 3 s on fast-4g (about 1 MB/s, so ~2.5 MB before the first frame), 1 MB
  // of script (a second of download before anything runs), 4 MB of assets in all; frame and triangles as desktop
  site: { frameMs: 16.7, assetMB: 4, triangles: 200_000, drawCalls: 100, textureMax: 2048, pixelRatioMax: 2, firstSceneFrameMs: 3000, scriptMB: 1 },
} satisfies Record<string, Budget>;

/** The budget keys a measurement exceeds, in the measurement's order; a key the budget has no limit for is not judged. */
export function overBudget(measured: Partial<Record<keyof Budget, number>>, budget: Partial<Budget>): (keyof Budget)[] {
  return (Object.keys(measured) as (keyof Budget)[]).filter(k => typeof budget[k] === "number" && measured[k]! > (budget[k] as number));
}
/** The keys a player or visitor feels when over (stutter, a slow download); the rest are guides to where a slow frame's
    cost may be. gpu-4x4-7: "over budget: triangles" at 429,000 triangles and 2.8 ms a frame, twice, and agents rightly
    ignored it. */
const FELT = new Set<keyof Budget>(["frameMs", "assetMB", "scriptMB", "firstSceneFrameMs"]);
const UNIT: Partial<Record<keyof Budget, [unit: string, what: string]>> = { frameMs: ["ms", "a frame"], assetMB: ["MB", "of assets"], scriptMB: ["MB", "of script"], firstSceneFrameMs: ["ms", "to the first scene frame"] };
/** `perf`'s verdict: "over budget: …" for felt keys only, each with what was measured and its limit; guide keys past
    their limit read as within budget, named. A verdict states the limits it judged by: "within budget" at budget:
    "mobile" named no number, and agents could not tell what a phone was held to (opinion-7). */
export function budgetText(over: (keyof Budget)[], budget: Partial<Budget>, measured: Partial<Record<keyof Budget, number>> = {}, name?: string): string {
  const felt = over.filter(k => FELT.has(k)), guide = over.filter(k => !FELT.has(k)), of = name ? `; ${name} budget` : "";
  const item = (k: keyof Budget, v = measured[k]) => v === undefined ? k : Number.isFinite(v) ? `${k} ${+v.toFixed(2)} of ${budget[k]} ${UNIT[k]![0]}` : `${k} never (limit ${budget[k]} ${UNIT[k]![0]})`;
  if (felt.length) return `over budget: ${felt.map(k => item(k)).join(", ")}${of}`;
  const limits = [...FELT].filter(k => typeof budget[k] === "number").map(k => `${budget[k]} ${UNIT[k]!.join(" ")}`).join(", ");
  return `within budget (${name ? `${name}: ` : ""}${limits}${guide.length ? `; ${guide.map(k => `${k} over the ${budget[k]} guide`).join(", ")}, which costs nothing while the frame time is in budget` : ""})`;
}
/** A software WebGL renderer: headless Chrome with no GPU (Linux, browser.ts) runs every game far over the frame budget.
    Firefox headless on Linux is llvmpipe, already named here (T1); Windows' are WARP and the Basic Render Driver. */
export const SOFTWARE_GL = /SwiftShader|llvmpipe|softpipe|software|Basic Render Driver|\bWARP\b/i;
/** Said instead of naming `perf` with optimize when the frame time was measured on a software renderer. */
export const SOFTWARE_NOTE = "software renderer (no GPU): frame time is no budget signal, do not optimize for it";
