// optimize(): find which @paprika3d/three-runtime switches help this game, keep those, and write game-runtime.json.
// Switches are tried one at a time in the runtime's own fixed order, each on top of the ones already kept, on a page
// reloaded with window.__harnessConfig naming them, so the game needs nothing but its one runtime import.
// Gains (instancing, lod) must earn their place: a median frame-time gain above the noise floor, or 20% fewer draw
// calls with frame time no worse. Guards (resolution, defaults, dispose) protect against what a game may do later, so
// they stay unless they break a keypoint or make frames slower beyond the noise floor. A page whose first measure is
// pacing-bound (perf's WORK: the frame interval is the display's tick, not its work) is judged on its work per frame
// throughout, or every switch read 17.2 -> 17.2 ms on a WebGPU page that took 2 ms a frame (#132).
// Each switch is checked against the contract (a keypoint that passed without it and fails with it reverts it) and
// pictured at the same fake-clock frame without and with it: instancing, defaults and dispose must not change the
// picture (over 0.5% of pixels differ reverts them); resolution and lod may, so a kept one whose pictures differ is
// marked lookChanged with its before and after pictures. The pictures are screenshots of the
// game's own last frame, not look()'s redraw: look() draws through the unwrapped render, which skips the runtime's
// per-frame work (lod's geometry swap). A switch that breaks the page (it will not load, draw or run frames) is reverted
// with its error. The run is recorded in Paprika.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Game } from "./browser.ts";
import type { Contract } from "./contract.ts";
import { BUDGETS, SOFTWARE_NOTE, type Budget } from "./budgets.ts";
import { check, type CheckResult } from "./check.ts";
import { perf, type PerfResult } from "./perf.ts";
import { listAssets, type AssetIssue } from "./assets.ts";
import { fingerprint } from "./fingerprint.ts";
import { noteRun, recordRun } from "./state.ts";
import { pictureDiff } from "./look.ts";

/** The runtime's switches in the order it runs them, and how each is judged. */
export const SWITCHES = { resolution: "guard", defaults: "guard", instancing: "gain", lod: "gain", dispose: "guard" } as const;
export type SwitchName = keyof typeof SWITCHES;

/** One switch's before/after row. `before` is the kept set without it; pictures are screenshots at the same frame.
    `median` is the frame time judged: perf's median, or its work per frame on a pacing-bound page. */
export interface SwitchResult {
  name: SwitchName;
  kind: "gain" | "guard";
  kept: boolean;
  reason?: "check failed" | "picture changed" | "no gain" | "slower" | "error";
  /** With reason "error": the first line of what the page threw with the switch on. */
  error?: string;
  before: { median: number; calls: number };
  after?: { median: number; calls: number };
  noiseMs?: number;
  /** Share of pixels that differ between the two pictures. */
  pictureDiff?: number;
  pictures?: { before: string; after: string };
  /** A kept switch that may change the picture and did. */
  lookChanged?: true;
  /** Titles of keypoints that passed without the switch and failed with it. */
  failing?: string[];
}

/** What optimize() kept, the row per switch, perf before and after, and the runner-style `text`. */
export interface OptimizeResult {
  kept: Record<string, unknown>;
  switches: SwitchResult[];
  before: PerfResult;
  after: PerfResult;
  check: CheckResult | null;
  assets: { assetMB: number; issues: AssetIssue[] };
  written: string[];
  picture: string;
  durationMs: number;
  iteration: number;
  text: string;
}

const FILE = "game-runtime.json";
const SAME_PICTURE = new Set<SwitchName>(["instancing", "defaults", "dispose"]);
const PICTURE_LIMIT = 0.005; // share of pixels that may differ before a switch "changed the picture"
const LOOK_FRAMES = 240; // past two instancing passes (every 120 frames) and the defaults' 60-frame shadow freeze
const FEWER_CALLS = 0.8;


/** Tries each switch (default: all five) on the open game, keeps what helps, counts the assets under `cwd`, writes game-runtime.json there (and in
    public/ when it exists, since vite copies only public/), leaves the game reloaded with the kept switches, and records
    the run. Switches not tried keep their entry in an existing game-runtime.json. */
export function optimize(game: Game, opts: { contract?: Contract | null; budget?: Budget; switches?: SwitchName[]; cwd?: string;
  /** perf()'s sample and warm-up lengths, for tests that judge no timing (default 2 s and 1,000 ms) */ sample?: { seconds: number; warmMs: number } } = {}): Promise<OptimizeResult> {
  const { contract = null, budget = BUDGETS.desktop, cwd = game.root } = opts;
  const names = (Object.keys(SWITCHES) as SwitchName[]).filter(n => !opts.switches || opts.switches.includes(n));
  return game.queue(async () => {
    const start = Date.now();
    let kept: Record<string, unknown> = {};
    try {
      const prev = JSON.parse(readFileSync(join(cwd, FILE), "utf8")).switches ?? {};
      for (const n of Object.keys(SWITCHES) as SwitchName[]) if (prev[n] && !names.includes(n)) kept[n] = prev[n];
    } catch {} // no file yet, or not JSON: start from nothing

    const at = (switches: Record<string, unknown>) => game.reload({ runtime: { switches } });
    // check() and perf() reload first, so their switches need only be set: a reload here as well was one wasted per call
    const set = (switches: Record<string, unknown>) => game.configure({ runtime: { switches } });
    const key = (s: Record<string, unknown>) => JSON.stringify(s);
    const checks = new Map<string, CheckResult>(), looks = new Map<string, string>();
    let shots = 0;
    const checkAt = async (s: Record<string, unknown>) => {
      if (!checks.has(key(s))) { await set(s); checks.set(key(s), await check(game, contract!, { cwd })); }
      return checks.get(key(s))!;
    };
    const lookAt = async (s: Record<string, unknown>) => {
      if (!looks.has(key(s))) {
        await at(s);
        await game.page.evaluate(`__clock.step(${LOOK_FRAMES})`);
        const path = join(game.runDir, `optimize-${++shots}.png`);
        await game.page.screenshot({ path }); // the frame just drawn through the runtime's wrapped render
        looks.set(key(s), path);
      }
      return looks.get(key(s))!;
    };
    const perfAt = async (s: Record<string, unknown>) => { await set(s); return perf(game, budget, { ...opts.sample, work: true }); };

    try {
      if (contract) await checkAt(kept);
      const first = await perfAt(kept);
      let base = first;
      // the frame time a switch is judged on: the work per frame when the first measure's interval was pacing (#132)
      const paced = !!first.work?.paced, cost = (p: PerfResult) => paced ? p.work?.ms ?? p.median : p.median;
      const ms = (p: PerfResult) => ({ median: cost(p), calls: p.calls });
      const rows: SwitchResult[] = [];
      // shortcut: a game at under a fifth of its frame budget gains nothing worth 90 s of trials, so the guards are skipped
      // too; upgrade when a guard (dispose) proves to matter on its own
      // on a software renderer frame time says nothing of a GPU, so only a non-frame key over budget is worth trials
      const soft = game.software && first.overBudget.every(k => k === "frameMs");
      const idle = !opts.switches && (soft || (cost(first) < budget.frameMs / 5 && !first.overBudget.length));
      for (const name of idle ? [] : names) {
        const kind = SWITCHES[name];
        const cand = { ...kept, [name]: name === "resolution" ? { frameMs: budget.frameMs } : true };
        const row: SwitchResult = { name, kind, kept: false, before: ms(base) };
        rows.push(row);
        try {
          if (contract) {
            const was = checks.get(key(kept))!, now = await checkAt(cand);
            const passedBefore = new Set(was.outcomes.filter(o => o.outcome === "passed").map(o => o.id));
            const failing = now.outcomes.filter(o => o.outcome !== "passed" && passedBefore.has(o.id)).map(o => o.title);
            if (failing.length) { Object.assign(row, { reason: "check failed", failing }); continue; }
          }
          const pictures = { before: await lookAt(kept), after: await lookAt(cand) };
          row.pictures = pictures;
          row.pictureDiff = +pictureDiff(pictures.before, pictures.after).toPrecision(3);
          if (SAME_PICTURE.has(name) && row.pictureDiff > PICTURE_LIMIT) { row.reason = "picture changed"; continue; }
          const p = await perfAt(cand);
          const noise = Math.max(base.noiseMs, p.noiseMs);
          Object.assign(row, { after: ms(p), noiseMs: noise });
          const faster = cost(base) - cost(p) > noise, notWorse = cost(p) <= cost(base) + noise;
          // on a software renderer frame time is no signal (SOFTWARE_NOTE), so fewer calls alone is the gain: 500 instanced calls
          // to 1 with the same picture read "no gain" at 15.3 -> 17.3 ms (#33)
          if (kind === "gain" && !faster && !(p.calls <= base.calls * FEWER_CALLS && (notWorse || game.software))) { row.reason = "no gain"; continue; }
          if (kind === "guard" && !notWorse) { row.reason = "slower"; continue; }
          row.kept = true;
          if (!SAME_PICTURE.has(name) && row.pictureDiff) row.lookChanged = true; // nothing to review when the pictures match
          kept = cand;
          base = p;
        } catch (e) { // the page would not load, draw or run frames with this switch on
          Object.assign(row, { reason: "error", error: String((e as Error)?.message ?? e).split("\n")[0] });
        }
      }

      const ordered = Object.fromEntries((Object.keys(SWITCHES) as SwitchName[]).filter(n => n in kept).map(n => [n, kept[n]]));
      const written = [join(cwd, FILE), ...(existsSync(join(cwd, "public")) ? [join(cwd, "public", FILE)] : [])];
      for (const f of written) writeFileSync(f, JSON.stringify({ switches: ordered }, null, 2) + "\n");
      const picture = await lookAt(kept);
      const final = contract ? checks.get(key(kept))! : null;
      await at(kept); // leave the game running what was kept

      // every file under the project folder, loaded or not: files to resize, not the download `perf` counts (pageAssets)
      const assets = listAssets(cwd, budget);
      const big = assets.issues.slice(0, 10).map(a => `${a.path} (${a.dim} px, ${a.MB} MB)`);
      const text = [
        ...rows.map(r => `${r.kept ? "✓" : "✗"} ${r.name} (${r.kind})${r.reason ? `: ${r.reason}${r.failing ? ` — ${r.failing.join("; ")}` : ""}${r.error ? ` — ${r.error}` : ""}` : ""}` +
          (r.after ? ` — ${r.before.median} → ${r.after.median} ms, ${r.before.calls} → ${r.after.calls} calls` : "") +
          (r.lookChanged ? `; changed the picture: compare ${r.pictures!.before} and ${r.pictures!.after}` : "")),
        ...(paced ? [`The ${first.median} ms between frames was pacing, not work (a frame that presents nothing new waits for the 60 Hz tick here), so every time here is the work per frame: paused frames timed to the end of their GPU work.`] : []),
        ...(idle ? [soft ? `${first.median} ms median frame on a ${SOFTWARE_NOTE}; nothing to optimize, no switch tried.`
          : `${cost(first)} ms ${paced ? "of work a" : "median"} frame of a ${budget.frameMs} ms budget and nothing over budget: nothing to optimize, no switch tried.`] : []),
        `Kept ${Object.keys(ordered).join(", ") || "nothing"}: ${cost(first)} → ${cost(base)} ms ${paced ? "work" : "median"}, ${first.calls} → ${base.calls} calls; wrote ${written.join(", ")}`,
        // computed for the report but never shown before: no switch shrinks a texture, so this is the agent's to fix
        ...(big.length ? [`Textures over ${budget.textureMax} px, to resize or compress: ${big.join(", ")}${assets.issues.length > 10 ? ` and ${assets.issues.length - 10} more` : ""}`] : []),
      ].join("\n");
      const durationMs = Date.now() - start, print = fingerprint(cwd), passed = final?.passed ?? 0, failed = final?.failed ?? 0;
      const state = noteRun(cwd, print, { ts: new Date().toISOString(), kind: "optimize", passed, failed, durationMs });
      recordRun({
        cwd, kind: "optimize", picture, contractHash: state.contractHash, passed, failed, outcomes: final?.outcomes ?? [],
        perf: { before: first, after: base }, switches: rows, durationMs, iteration: state.iterations,
        elapsedMs: state.issued ? Date.now() - Date.parse(state.issued) : 0, // since the contract was issued: time spent on this game
        fingerprint: print,
      });
      return { kept: ordered, switches: rows, before: first, after: base, check: final, assets,
        written, picture, durationMs, iteration: state.iterations, text };
    } catch (e) {
      await at(kept).catch(() => {}); // never leave the game on a candidate's switches
      throw e;
    }
  });
}
