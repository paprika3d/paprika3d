// After-edit hook (PostToolBatch, asyncRewake): once per batch of tool calls that edited files, rerun the project's
// saved checks (game-tests.json, from `interact`'s `save`), or its game contract when started with `--contract`, and tell
// the agent only when the set of failing checks changed (new failures or fixes), naming them, so silence means "same as
// the last report". Without `--contract` the running server also rechecks the page's fault lines (`Lighting:`,
// `Surfaces:`) on the freshly reloaded page, in any project `open` has run (its paprika3d/state.json), saved checks or
// not, and the hook names the lines that closed or opened since the last look or recheck, again only when one did: a
// fresh install that never saved a check gets the recheck too, on a page this session opened (another session's page
// is not reloaded from here). A batch counts when it edited a file or ran a shell command (which may have written
// one). Before the first `open` call (state.json has no url or command) it runs no check and records nothing.
// Sources the last check already saw (one fingerprint, the same that counts iterations) exit at once. A project with
// nothing to rerun (no saved checks, and no server running this session's page) gets one factual line per session, after
// the first write of a page or script that loads three.js, by an edit or by a shell command (a page under the session's
// folder changed since the session began), when this session has not opened it: with the tools installed and no line at
// all, Sonnet opened its page in 0 of 6 runs (docs/results-assets-2026-10-13.md). It states what the
// tools show and asks for nothing: the old cadence of look reminders (every 10k-100k characters, "stop writing new
// parts") made agents grow a small first draft instead of building the whole page (JC's playtest and the Door Dash
// post-mortem, 2026-10-20). The check goes through the running MCP server's control socket when there is one, so Chrome
// keeps a single owner; only without one, and only for saved checks, does it run `paprika3d check` in a Chrome of its own.
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { json } from "node:stream/consumers";
import { fingerprint } from "../src/fingerprint.ts";
import { readState, setLastCheck, updateState } from "../src/state.ts";
import { askServer, type CheckReply } from "../src/control.ts";
import { sessionBegan, sessionRuns, sourcesSince } from "./session.ts";

const FILE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
type Call = { tool_name: string; tool_input?: Record<string, unknown>; tool_use_id?: string; tool_response?: unknown };

const input: any = await json(process.stdin).catch(() => null);
if (!input) process.exit(0);
// PostToolBatch carries tool_calls; a PostToolUse input (the fallback event) is one call
const calls: Call[] = input.tool_calls ?? (input.tool_name ? [input] : []);
const edits = calls.filter(c => FILE_TOOLS.has(c.tool_name)).map(c => ({ ref: c.tool_use_id ?? "", file: String(c.tool_input?.file_path ?? c.tool_input?.notebook_path ?? "") })).filter(e => e.file);
// Agents write much of a game from the shell (heredocs, python, sed: 36 of 44 edits in one AA-3D cell), so a Bash batch
// counts too, with no file named; the fingerprint below skips it when it changed no source
const shell = calls.filter(c => c.tool_name === "Bash");
const session = input.agent_id ? `${input.session_id}/${input.agent_id}` : String(input.session_id ?? "");

const REMIND = "paprika3d: this three.js page has not been opened in this session. `open` runs it in headless Chrome on a paused clock, `look` shows what a viewer sees, and `interact` plays it and returns the state.";
// a page or script that loads three.js (an import, an import map entry, a script src), not one that only mentions it: a
// benchmark runner whose comments say "three.js" got the reminder before
const THREE = /from\s*["'](?:three|three\/[^"']+|@react-three\/[^"']+)["']|import\s*\(\s*["']three["']|require\(\s*["']three["']\)|["']three["']\s*:|three\.module(?:\.min)?\.js|\/build\/three\./;
const readOr = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };

if (!edits.length && !shell.length) process.exit(0);

// only the bench's contract arm runs contracts (its hooks.json passes --contract); the plugin reruns the saved checks
const CONTRACT = process.argv.includes("--contract"), FILE = CONTRACT ? "game-contract.json" : "game-tests.json";
/** The nearest folder at or above `from` that holds FILE or, without --contract, the paprika3d/state.json `open` writes
    (a fresh install's project, with no check saved), or null. */
function project(from: string): string | null {
  for (let d = resolve(from); ; d = dirname(d)) {
    if (existsSync(join(d, FILE)) || !CONTRACT && existsSync(join(d, "paprika3d", "state.json"))) return d;
    if (dirname(d) === d) return null;
  }
}
const dir = edits.map(e => project(dirname(resolve(input.cwd ?? ".", e.file)))).find(Boolean) ?? project(input.cwd ?? ".");
/** Wakes the agent with `text`. How depends on how Claude Code ran this hook: in the background (interactive, or a
    session with streaming input) exit 2 wakes the model with stderr; inline (`claude -p` with a plain prompt, where
    exit 2 would end the session) it goes back as additionalContext with exit 0. */
function deliver(text: string): never {
  // shortcut: Claude Code (2.1.296) gives hooks no flag for "ran inline", so this reads the session's command line;
  // replace it if Claude Code ever passes that in the hook input or environment
  const parent = process.env.CLAUDE_PID ? spawnSync("ps", ["-o", "args=", "-p", process.env.CLAUDE_PID], { encoding: "utf8" }).stdout : "";
  const inline = /(^|\s)(-p|--print)(\s|$)/.test(parent) && !/--input-format[ =]stream-json/.test(parent);
  if (inline) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: input.hook_event_name ?? "PostToolBatch", additionalContext: text } }));
    process.exit(0);
  }
  console.error(text);
  process.exit(2);
}

const real = (p: string) => { try { return realpathSync(p); } catch { return p; } }; // /tmp and /private/tmp name one folder
const projectOf = (run: string) => real(resolve(run, "..", "..", "..")); // a run is <project>/paprika3d/runs/<run>
/** The projects this session's own paprika3d calls opened (session.ts), this batch's included, or null with no
    transcript to read. Read only when asked: a transcript runs to 60 MB, and most batches never ask. */
let runs: string[] | null | undefined; // read once: the transcript can be tens of MB, and remind() asks again
const opened = () => runs !== undefined ? runs : (runs = sessionRuns(input.transcript_path, String(input.session_id ?? ""), calls)?.map(projectOf) ?? null);
/** What a project with nothing to rerun gets: one line per session after the first write of a page or script that loads
    three.js, by an edit or by a shell command, when this session has not opened it, and otherwise nothing. */
function remind(): never {
  const mark = join(tmpdir(), `paprika3d-reminded-${session.replace(/[^\w.-]/g, "_")}`);
  if (existsSync(mark)) process.exit(0);
  const cwd = resolve(input.cwd ?? "."), page = (f: string) => /\.(html|jsx?|tsx?)$/.test(f) && THREE.test(readOr(f));
  const pages = edits.map(e => resolve(cwd, e.file)).filter(page);
  // a shell command names no file it wrote (a heredoc, a generator script): a page under cwd written since the session
  // began; not from inside a package a shell cd'd into (before-stop's gpu-4x4-4 bowling stopped in node_modules)
  const since = !pages.length && shell.length && !cwd.split(sep).includes("node_modules") ? sessionBegan(input.transcript_path) : 0;
  if (since) pages.push(...sourcesSince(cwd, since, page, 1));
  if (!pages.length) process.exit(0);
  writeFileSync(mark, "");
  // a project this session already opened (one of its own runs' projects, at the session's cwd or above the page) needs
  // no line; with no transcript to read, the line comes
  const roots = [cwd, ...pages.map(p => dirname(p))], mine = opened();
  const ran = !!mine && roots.some(r => { const p = real(r); return mine.some(o => p === o || p.startsWith(o + sep)); });
  if (ran) process.exit(0);
  deliver(REMIND);
}

if (!dir) remind();
// with no saved checks only the fault lines are left to recheck, and only on this session's own page in the running
// server: a project whose server is gone (closed, or never opened) has nothing to rerun, and neither has one this
// session never opened, since another session opened its page and a reload would reset that session's game; with no
// transcript to read (null), it asks
const state = readState(dir), saved = existsSync(join(dir, FILE));
if (!saved && (!state.server || opened()?.includes(real(dir)) === false)) remind();
// before the first `open` call (no url or command recorded) there is no game to check: the CLI would guess index.html and
// run a whole check in its own Chrome next to the agent's work (an 89 s one in the AA-3D black hole opus cell)
if (!state.url && !state.command) process.exit(0);
// only a shortcut past sources already checked; whether to speak is decided when the result is written (below)
const print = fingerprint(dir);
if (state.lastCheck?.fingerprint === print) process.exit(0);

const edit = edits.at(-1) ?? { ref: shell.at(-1)!.tool_use_id ?? "", file: "" };
const ref = { ref: edit.ref, file: edit.file ? resolve(input.cwd ?? ".", edit.file) : "", time: new Date().toISOString(), session };
// the running MCP server answers in-process, so the common case starts no second process; only without one does the
// CLI open its own Chrome, for the saved checks only (cli.ts beside this source under Bun, cli.js beside the Node build's
// after-batch.js)
let out = "", err = "", status: number | null = 0;
try { const r = await askServer(dir, { edit: ref, ...(!CONTRACT && { tests: saved, faults: true }) }, state.server); if (r) out = JSON.stringify(r); }
catch (e) { err = `paprika3d check: ${(e as Error).message}`; status = 1; } // the same line cli.ts prints for it
if (!out && !err) {
  if (!saved) remind(); // no server answered for this project, and the fault lines are never rechecked in a second Chrome
  const cli = join(import.meta.dirname, "../src", `cli${extname(import.meta.filename)}`);
  const p = spawnSync(process.execPath, [cli, "check", "--cwd", dir, "--json",
    "--edit-ref", ref.ref, ...(ref.file ? ["--edit-file", ref.file] : []), "--edit-time", ref.time, "--session", session],
    // Claude Code kills this hook at its 180 s timeout (hooks.json) but not the check under it, which ran on in its own Chrome;
    // SIGKILL ends Chrome (its pipe closes) and a dev command (its watcher) with it
    { encoding: "utf8", maxBuffer: 64 << 20, timeout: 170_000, killSignal: "SIGKILL" });
  ({ stdout: out = "", stderr: err = "", status } = p);
  if (p.signal === "SIGKILL") { out = ""; err = `paprika3d check: did not finish in 170 s: a keypoint's page may hang; run \`${CONTRACT ? "check" : "test"}\` to see which`; }
}

// `changed` compares with the check recorded just before this one, under the state lock, so two hooks whose checks
// overlap never both report one change, and a later check that undoes an earlier one is still reported; a check whose
// sources changed while it ran is never `changed`, since the batch that changed them runs its own
let changed: boolean, report: string, faults: CheckReply["faults"];
if (out.trim()) { // the check ran and recorded its failing set
  ({ changed, text: report, faults } = JSON.parse(out) as CheckReply);
} else if (err.includes("paprika3d check: game not ready")) { // no game is open yet and the page is not a game yet: nothing to say
  process.exit(0);
} else { // it could not run (a hand-edited contract): report the reason once, like a failing set
  // with no saved checks only the fault lines were asked for: say nothing and record nothing, so the next batch asks again
  if (!saved) process.exit(0);
  report = err.trim().split("\n").filter(l => l.startsWith("paprika3d")).join("\n") || err.trim() || `paprika3d check exited ${status}`;
  changed = updateState(dir, s => setLastCheck(s, print, [report])).lastCheck!.changed;
}
// with no saved checks the server reran only the fault lines, so its failing set says nothing
changed &&= saved;
const f = (faults?.closed.length || faults?.opened.length) ? faults : undefined;
if (!changed && !f) process.exit(0);

const after = edit.file ? "edit" : "shell command";
// the saved checks' ✓ and ✗ lines, each said against the check before: `jump now fails (player.y 1.4, expected ≥ 2); pickup still passes`
// (the CLI's own check, with no server, picks the saved checks only when the project has no game-contract.json)
const was = new Set(state.lastCheck?.failing ?? []);
const said = CONTRACT ? [] : report.split("\n").flatMap(l => { const m = /^([✓✗]) ([\w-]+)(?:: (.*))?$/.exec(l);
  return !m ? [] : m[1] === "✗" ? [`${m[2]} ${was.has(m[2]!) ? "still fails" : "now fails"} (${m[3]})`] : [`${m[2]} ${was.has(m[2]!) ? "now passes" : "still passes"}`]; });
// the frame line is left out unless it is over budget, since the hook reports keypoint changes, not performance
const lines = report.split("\n").filter(l => !l.startsWith("Frames:") || l.includes("over budget"));
const checks = !changed ? [] : said.length ? [`game-tests.json after your ${after}: ${said.join("; ")}. \`test\` reruns them.`]
  : [`${CONTRACT ? "Game contract" : "Saved checks (game-tests.json)"} after your ${after} (the failing ${CONTRACT ? "keypoints" : "checks"} changed):`, ...lines];
// a line the edit opened is said once, as new
const recheck = !f ? [] : [`Fault lines after your ${after}, on the freshly reloaded page, without a picture (a fault that needs play to show is not seen here):`,
  ...f.closed.map(l => `  closed: ${l}`), ...f.opened.map(l => `  new: ${l}`), ...f.open.filter(l => !f.opened.includes(l)).map(l => `  still open: ${l}`)];
deliver([...checks, ...recheck].join("\n"));
