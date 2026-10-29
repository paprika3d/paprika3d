// check(): run a game contract against the open game, one keypoint at a time, each on a freshly reloaded page.
// A reload costs about 0.1 s and gives every keypoint the same seed and a clean start, so a keypoint that kills the
// player or moves the level can never leak into the next one. Each keypoint: reload, setState (confirmed in observe()
// before any frame runs), its actions, its frames, then its predicates over __game.observe(). A picture is saved only
// for a failing keypoint. The result carries the source fingerprint, so a caller can tell when it went stale. With
// `tests` (the agent's saved checks, game-tests.json) the text is one ✓ or ✗ line per check, with the value seen and
// the value expected.
import { join } from "node:path";
import type { Game } from "./browser.ts";
import { holds, pathValue, show, verdicts, type Contract, type Keypoint, type Predicate } from "./contract.ts";
import { gameUp, play, GAME_LATE, type Step } from "./input.ts";
import { fingerprint } from "./fingerprint.ts";
import { BUDGETS, SOFTWARE_NOTE } from "./budgets.ts";

/** Why a keypoint failed, or `passed`. */
export type Outcome = "passed" | "launch_failed" | "state_not_realized" | "actions_incomplete" | "outcome_mismatch";

/** One keypoint's outcome; `picture` is the saved page, only when it failed. */
export interface KeypointResult { id: string; title: string; outcome: Outcome; detail: string; picture?: string }

/** `text` is the runner-style report: one `✗` line per failed keypoint and a summary line. */
export interface CheckResult { passed: number; failed: number; outcomes: KeypointResult[]; durationMs: number; fingerprint: string; text: string }

const DEFAULT_FRAMES = 60;
const NO_GAME = `no window.__game.setState and observe ${GAME_LATE}`;
const STATE_TRIES = 3; // once, then retry twice
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const firstLine = (e: unknown) => (e as Error).message.split("\n")[0]!;

/** Whether every part of `want` is in `got`: object keys recursively, arrays item by item, numbers within 1e-6. */
function realized(want: unknown, got: unknown): boolean {
  if (typeof want === "number" && typeof got === "number") return Math.abs(want - got) < 1e-6;
  if (Array.isArray(want)) return Array.isArray(got) && got.length === want.length && want.every((w, i) => realized(w, got[i]));
  if (want && typeof want === "object") return !!got && typeof got === "object" && Object.entries(want).every(([k, w]) => realized(w, (got as any)[k]));
  return want === got;
}

/** null when the predicate holds, else `expected head.x == 3, got 4`. */
function failure(p: Predicate, state: unknown): string | null {
  const got = pathValue(state, p.path);
  return holds(p, got) ? null : `expected ${p.path} ${p.op === "exists" ? "to exist" : `${p.op} ${show(p.value)}`}, got ${show(got)}`;
}

/** Runs one keypoint on the already reloaded page. */
// `wait`: false once a keypoint of this check waited in vain, so a page with no __game costs the wait once, not per keypoint
async function runKeypoint(game: Game, k: Keypoint, stepped: { ms: number; frames: number }, tests: boolean, wait: { on: boolean }): Promise<{ outcome: Outcome; detail: string }> {
  const { page } = game;
  if (wait.on) wait.on = await gameUp(game, ["setState", "observe"]);
  let missing = "";
  for (let i = 0; i < STATE_TRIES; i++) {
    if (i) await sleep(50); // lets a game that applies setState asynchronously (React) catch up, without stepping a frame
    let got: Record<string, unknown> | "no game" | null;
    try {
      got = await page.evaluate(s => {
        const g = (window as any).__game;
        if (!g?.setState || !g?.observe) return "no game";
        g.setState(s);
        return g.observe();
      }, k.state as any) as Record<string, unknown> | "no game" | null;
    } catch (e) { return { outcome: "state_not_realized", detail: `setState or observe() threw: ${firstLine(e)}` }; }
    // the page's own error says why there is no game; the fixed text sent agents hunting for a missing hook (build-review-1, #78)
    if (got === "no game") return { outcome: "state_not_realized", detail: game.errors.length ? `the page threw before window.__game existed: ${game.errors.at(-1)!.split("\n")[0]}` : NO_GAME };
    if (!got) return { outcome: "state_not_realized", detail: "observe() returned nothing after setState" };
    missing = Object.keys(k.state).filter(key => !realized(k.state[key], got[key]))
      .map(key => `${key} set to ${show(k.state[key])}, observe() has ${show(got[key])}`).join("; ");
    if (!missing) break;
  }
  if (missing) return { outcome: "state_not_realized", detail: missing };

  try { await play(game, k.actions as Step[]); }
  catch (e) { return { outcome: "actions_incomplete", detail: (e as Error).message }; }
  const frames = k.frames ?? DEFAULT_FRAMES;
  // the frames, a GPU sync and the observe() after them in one round trip; a throw from observe comes back as { threw }.
  // Without the sync the frame line counts only the CPU side: an AA-3D black hole read 3 to 4 ms a frame against 50 to 130 ms real.
  const t = performance.now();
  let after: { state?: unknown; threw?: string };
  try {
    after = await page.evaluate(`(async () => { ${frames ? `await __clock.step(${frames}); await __harness.sync();` : ""}
      try { return { state: __game.observe() }; } catch (e) { return { threw: String(e?.message ?? e) }; } })()`) as typeof after;
  } catch (e) { return { outcome: "outcome_mismatch", detail: `stepping or observe() failed: ${firstLine(e)}` }; }
  if (frames) { stepped.ms += performance.now() - t; stepped.frames += frames; }
  if (after.threw !== undefined) return { outcome: "outcome_mismatch", detail: `observe() threw: ${after.threw.split("\n")[0]}` };
  const state = after.state;
  const wrong = tests ? verdicts(k.expect, state).filter(v => !v.ok).map(v => `${v.path} ${show(v.got)}, expected ${v.want}`) : k.expect.map(p => failure(p, state)).filter(Boolean);
  return wrong.length ? { outcome: "outcome_mismatch", detail: wrong.join("; ") } : { outcome: "passed", detail: "" };
}


/** "Frames: N stepped at X ms each (budget B ms)", naming `perf` with optimize when X is over B on a real GPU; "" when nothing stepped. */
function frameLine({ ms, frames }: { ms: number; frames: number }, budget: number, software: boolean): string {
  if (!frames) return "";
  const each = ms / frames;
  return `\nFrames: ${frames} stepped at ${each.toFixed(2)} ms each (budget ${budget} ms)${each <= budget ? "" : software ? `; ${SOFTWARE_NOTE}` : "; over budget (`perf` with optimize: true tries the runtime switches)"}`;
}

/** Runs every keypoint of the contract on its own reloaded page, on the game's queue. `cwd` is the project fingerprinted;
    `print` is its fingerprint when the caller just took it; `tests`: the contract is the agent's saved checks. */
export function check(game: Game, contract: Contract, { cwd = game.root, print = "", tests = false } = {}): Promise<CheckResult> {
  return game.queue(async () => {
    const start = Date.now();
    print ||= fingerprint(cwd); // the sources this result describes
    const outcomes: KeypointResult[] = [];
    let launch = "";
    const stepped = { ms: 0, frames: 0 }, wait = { on: true }; // the frames the keypoints step anyway: frame time with no extra measuring
    for (const k of contract.keypoints) {
      const base = { id: k.id, title: k.title };
      if (!launch) {
        try { await game.reload(); }
        catch (e) { launch = firstLine(e); }
      }
      // a page that will not load fails every keypoint left the same way, instead of waiting 10 s for each
      if (launch) { outcomes.push({ ...base, outcome: "launch_failed", detail: launch }); continue; }
      const r = await runKeypoint(game, k, stepped, tests, wait);
      if (r.outcome === "passed") { outcomes.push({ ...base, ...r }); continue; }
      const picture = join(game.runDir, `kp-${k.id}.png`);
      const saved = await game.page.screenshot({ path: picture }).then(() => true, () => false);
      outcomes.push({ ...base, ...r, ...(saved ? { picture } : {}) });
    }
    const passed = outcomes.filter(o => o.outcome === "passed").length, failed = outcomes.length - passed;
    const durationMs = Date.now() - start;
    // a failure shows its keypoint's setup, so the agent need not open the contract or the run folder to see it
    const setup = (k: Keypoint) => { const s = `state ${JSON.stringify(k.state)}; actions ${JSON.stringify(k.actions)}; frames ${k.frames ?? 60}`; return s.length > 700 ? `${s.slice(0, 700)}…` : s; };
    // a failure that is the page's, not the keypoint's (it would not load, or has no __game), reads the same for every
    // keypoint: one line for all of them, without setups, instead of the same reason and up to 700 characters per keypoint
    const pageWide = (o: KeypointResult) => o.outcome === "launch_failed" || o.detail === NO_GAME;
    const lines: string[] = [], grouped = new Set<string>();
    outcomes.forEach((o, i) => {
      if (o.outcome === "passed") return; // the ✗ lines and the "N of M passed" count say which passed
      const same = pageWide(o) ? outcomes.filter(x => x.outcome === o.outcome && x.detail === o.detail) : [o];
      if (same.length > 1) {
        const key = `${o.outcome}\0${o.detail}`;
        if (!grouped.has(key)) { grouped.add(key); lines.push(`✗ ${same.length} keypoints — ${o.outcome}: ${o.detail} (${same.map(x => x.title).join("; ")})`); }
        return;
      }
      lines.push(`✗ ${o.title} — ${o.outcome === "outcome_mismatch" ? "" : `${o.outcome}: `}${o.detail}\n    ${setup(contract.keypoints[i]!)}`);
    });
    const why = (o: KeypointResult) => `${o.outcome === "outcome_mismatch" ? "" : `${o.outcome}: `}${o.detail}`;
    const text = [
      ...tests ? outcomes.map(o => o.outcome === "passed" ? `✓ ${o.id}` : `✗ ${o.id}: ${why(o)}`) : lines,
      `${passed} of ${outcomes.length} ${tests ? "saved checks" : "keypoints"} passed in ${(durationMs / 1000).toFixed(1)} s`,
    ].join("\n") + frameLine(stepped, Number(contract.budget?.frameMs ?? BUDGETS.desktop.frameMs), game.software);
    return { passed, failed, outcomes, durationMs, fingerprint: print, text };
  });
}
