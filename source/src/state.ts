// The project's harness state, `<cwd>/paprika3d/state.json`: the issued contract, the iteration count, how to reach
// the running server and the last 200 runs. The hook's CLI and the MCP server both write it, so every change is a
// read-modify-write under a lock file, and the file is replaced by rename so a reader never sees half of it.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** One harness run, as kept in state.json; a check whose sources did not change while it ran also gives the ids of its
    failing keypoints, which become the last check. */
export interface RunEntry { ts: string; kind: string; passed: number; failed: number; durationMs: number; failing?: string[] }

/** The whole state.json. */
export interface State {
  contractHash: string | null;
  issued: string | null;
  lastFingerprint: string | null;
  /** The last check's sources and failing keypoint ids, and whether that set differs from the check before it (decided
      under the lock, so overlapping checks each compare with the one written just before): the after-edit hook skips
      sources already checked and wakes the agent only when `changed`. */
  lastCheck: { fingerprint: string; failing: string[]; changed: boolean } | null;
  iterations: number;
  url: string | null;
  command: string | null;
  server: { port: number; token: string } | null;
  runs: RunEntry[];
}

/** $PAPRIKA3D_HOME, else ~/.paprika3d: issued contracts, the asset catalog and the model cache. */
export function harnessHome(): string {
  return process.env.PAPRIKA3D_HOME || join(homedir(), ".paprika3d");
}

const MAX_RUNS = 200;
const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 30_000; // a holder that died mid-update; an update itself takes milliseconds

const empty = (): State => ({ contractHash: null, issued: null, lastFingerprint: null, lastCheck: null, iterations: 0, url: null, command: null, server: null, runs: [] });
const file = (cwd: string) => join(cwd, "paprika3d", "state.json");

/** The current state, or an empty one when there is none yet (or it can't be read). */
export function readState(cwd: string): State {
  try {
    return { ...empty(), ...JSON.parse(readFileSync(file(cwd), "utf8")) };
  } catch {
    return empty();
  }
}

/** `<cwd>/paprika3d`, made on first use with a `.gitignore` of `*`, so the project's git never sees the runs and the
    agent need not edit the project's own .gitignore (a line of the skill and an edit per project). */
export function harnessDir(cwd: string): string {
  const dir = join(cwd, "paprika3d"), ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) { mkdirSync(dir, { recursive: true }); writeFileSync(ignore, "*\n"); }
  return dir;
}

/** Reads the state, lets `change` edit it in place, and writes it back, all under the lock. Returns the new state. */
export function updateState(cwd: string, change: (s: State) => void): State {
  const path = file(cwd);
  harnessDir(cwd);
  const lock = `${path}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { force: true });
      } catch {} // released between the two calls
      if (Date.now() > deadline) throw new Error(`state.json is locked: ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); // a 5 ms synchronous sleep
    }
  }
  try {
    const s = readState(cwd);
    change(s);
    writeFileSync(`${path}.tmp`, JSON.stringify(s, null, 2));
    renameSync(`${path}.tmp`, path);
    return s;
  } finally {
    rmSync(lock, { force: true });
  }
}

/** Records one run: a fingerprint that differs from the last run's starts a new iteration. Returns the new state. */
export function noteRun(cwd: string, fingerprint: string, run: RunEntry): State {
  return updateState(cwd, (s) => {
    if (s.lastFingerprint !== fingerprint) s.iterations++;
    s.lastFingerprint = fingerprint;
    if (run.failing) setLastCheck(s, fingerprint, run.failing);
    s.runs = [...s.runs, run].slice(-MAX_RUNS);
  });
}

/** Records a check's failing set inside an update, with whether it differs from the set it replaces. */
export function setLastCheck(s: State, fingerprint: string, failing: string[]) {
  const before = s.lastCheck?.failing ?? [];
  s.lastCheck = { fingerprint, failing, changed: before.length !== failing.length || !failing.every(id => before.includes(id)) };
}

/** A newly issued contract starts counting iterations again. */
export function issueContract(cwd: string, contractHash: string, issued: string): State {
  return updateState(cwd, (s) => {
    Object.assign(s, { contractHash, issued, lastFingerprint: null, lastCheck: null, iterations: 0 });
  });
}

/** What one harness run records in run.json. `edit` is the Claude Code edit that triggered it, when the hook ran it. */
export interface Run {
  cwd: string;
  kind: string; // "check", "perf" or "optimize"
  picture: string; // the run's picture (`look` or `kp-*.png`) in paprika3d/runs/<ts>/, or that folder itself when the run took none
  contractHash: string | null;
  passed: number;
  failed: number;
  outcomes: unknown[];
  perf?: unknown;
  switches?: unknown;
  durationMs: number;
  iteration: number;
  elapsedMs: number;
  fingerprint: string;
  edit?: { ref: string; file: string; time: string; session: string };
}

/** Writes the run's run.json beside its picture, or inside its run folder when it took none. */
export function recordRun(r: Run) {
  const end = new Date(), { cwd: _, ...detail } = r;
  writeFileSync(join(statSync(r.picture, { throwIfNoEntry: false })?.isDirectory() ? r.picture : dirname(r.picture), "run.json"),
    JSON.stringify({ ...detail, start: new Date(end.getTime() - r.durationMs).toISOString(), end: end.toISOString() }, null, 2));
}
