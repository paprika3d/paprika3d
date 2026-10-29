// paprika-loop: builds a request over a set time in fresh `claude -p` sessions, as many improvements as fit in each, a read-only judge
// session after each, and a git commit per iteration. A fresh session per iteration is what resets the context: nothing
// in a session can clear it and no hook sees how full it is (.planning/grounding/2026-10-19-paprika-make-and-paprika-loop.md),
// so a turn cap ends each session well before its window fills, and loop.json keeps each session's tokens so the cap can
// be tuned. The judge exists because a builder grading its own work scores it high and repeats itself: the judge's Next
// list is the next builder's task, and its score picks the best commit (tag paprika-loop/best). Everything the loop
// writes goes under <cwd>/paprika-loop/, which the fingerprint skips: PROMPT.md, PROGRESS.md (the agents' notes, one
// section per session), LATEST.md (its last builder and judge sections, the handoff each session reads), judge-<n>.md,
// stream-<n>.jsonl, judge-stream-<n>.jsonl and judge-stream-<n>-verdict.jsonl (the raw streams), loop.json, REPORT.md, and
// .revision (a change to PROMPT.md the running session has not been handed yet). The loop runs until the time is up: the
// person owns PROMPT.md and may change it at any time, and a page that meets it is where going beyond it starts.
// Node APIs only: the published builds run this on Node.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, unwatchFile, watchFile, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, sep } from "node:path";

const PLUGIN_TOOL = "mcp__plugin_paprika3d_paprika__";
const ALLOWED = `Bash,Edit,Write,Read,Glob,Grep,${PLUGIN_TOOL}*`;
// an unattended session never publishes: nobody asked, and `publish` puts the project on a public link
const NO_PUBLISH = `${PLUGIN_TOOL}publish`;
const JUDGE_DISALLOWED = `Edit,Write,NotebookEdit,Bash,${NO_PUBLISH}`; // the judge changes nothing: the driver appends its reply to PROGRESS.md
// the installed builds' names; --settings switches them off for a builder without the plugin
const NO_PLUGIN = { enabledPlugins: { "paprika3d@paprika3d": false, "paprika3d@paprika3d-dev": false } };
const GRACE_MS = 5 * 60_000; // a session still running this long past the deadline is stopped
const EXIT_MS = 10_000; // a session still running this long after its result line is stopped: a background server it started kept one alive 75 minutes (#143)

export interface LoopOptions {
  cwd: string; prompt: string; minutes: number; model?: string;
  /** Turn caps per session: the builder's (40) ends it before its context fills; the judge's (20) is a look, a play and a verdict (the first dry run's judges took 11 to 15 turns). */
  builderTurns?: number; judgeTurns?: number;
  /** No session starts with fewer minutes left than this (5). */
  minIterationMinutes?: number;
  /** The `claude` to run (`claude` on PATH), or a command line that takes claude's own arguments after its last word
      (`bun bench/pool.ts claude --` runs each session on the bench account pool, rerun on the next account at a limit),
      and the plugin folder to load for a session; by default this plugin's root when it is a clone, and nothing when it
      is an installed plugin, which every session loads by itself. */
  claude?: string; pluginDir?: string;
  /** false runs the builder with no paprika3d at all (no --plugin-dir, the installed plugin switched off), the judge still with it: the no-plugin arm of an A/B (true). */
  builderPlugin?: boolean;
  /** The `claude` for builder sessions only (`claude` by default): a wrapper that seals the builder in a sandbox, the judge left outside it. */
  builderClaude?: string;
  /** The sessions' `--append-system-prompt-file` files: by default `builder.md` and `judge.md` in skills/paprika-loop/,
      or another pair for another kind of build (`builder-scene.md` and `judge-scene.md` rebuild a room from photos). */
  builderPrompt?: string; judgePrompt?: string;
  /** Stop after two sessions in a row that change nothing (false: the loop runs until the time is up). */
  idleStop?: boolean;
}
export interface Iteration { n: number; turns: number; tokens: number; costUsd: number; minutes: number; commit: string | null; score: number | null; judgeTurns: number; judgeTokens: number }
/** `best.brief` keys the brief its judge scored against (`briefKey`): a score for another brief does not compare (#128, #147). */
export interface LoopResult { iterations: Iteration[]; best: { n: number; commit: string; score: number; brief?: string } | null; text: string }

const ROOT = join(import.meta.dirname, "..");
// The hook that hands a running session the changed lines of its brief (hooks/revision.ts) rides in each session's --settings
// behind a `test -f`, never in hooks.json: there it would start a process on every tool call of every session, and here only
// `test` runs until the driver writes .revision. A watched file, not counted notes: the Backrooms inbox hook counted lines and
// missed 5 of 17 notes (analysis/loop-driver.md §8). The Node build has the .js, a clone the .ts; `|| true` keeps a call with
// no revision pending a success, not a hook error.
const HOOK = existsSync(join(ROOT, "hooks", "revision.js")) ? `node '${join(ROOT, "hooks", "revision.js")}'` : `bun run '${join(ROOT, "hooks", "revision.ts")}'`;
const SETTINGS = (plugin: boolean) => JSON.stringify({ ...plugin ? {} : NO_PLUGIN, hooks: { PostToolUse: [{ hooks: [{ type: "command", command: `test -f "\${CLAUDE_PROJECT_DIR:-.}/paprika-loop/.revision" && exec ${HOOK} || true`, timeout: 5 }] }] } });
const BUILDER_PROMPT = (n: number, left: number, first: boolean, changed: boolean, flat = "") => `This is session ${n} of a loop that builds the request in paprika-loop/PROMPT.md; about ${left} minutes of the loop are left, and this session does as many of the improvements as fit in it. First read paprika-loop/LATEST.md (the last builder's section and the last judge's verdict; PROGRESS.md holds every session's, for history) and run \`git log --oneline -5\`. ${first
  ? "Nothing is built yet: write the page whole and as impressive as you can make it from the request, risks welcome, then run and polish it with the tools."
  : "The latest \"Judge\" section's Next list is the judge's three next improvements; the tools show what each change did."}${changed
  ? " paprika-loop/PROMPT.md changed since the last session: LATEST.md shows the changed lines, and the Judge's Next list was written before them." : ""}${flat} Then append a section \`## Iteration ${n}\` to paprika-loop/PROGRESS.md with four short parts: Did, Saw (the look's numbers and fault lines), Next, Open. Write it while you still have room, then stop: no summary.`;
const JUDGE_PROMPT = (n: number) => `You judge session ${n} of a loop that builds the request in paprika-loop/PROMPT.md. Read it and paprika-loop/LATEST.md (PROGRESS.md holds every session's section), open the page with the \`open\` tool and judge it as your instructions say. Reply with a section the next builder will read: the scores from 1 to 10, one line each with the evidence in the page's own object names; then "Next:" and the three improvements your instructions ask for, concrete enough to start on (each checked against the last Iteration's Did and Open: what was done there is not asked again, and what its Open records as found nothing or impossible needs a different way); then, on its own last line, \`SCORE: n\` with the mean to one decimal.`;
const VERDICT_PROMPT = "Your turns are up. Write the verdict now from what you saw: the score lines, Next, and `SCORE: n` on the last line.";
const SCORE_LINE = /^[\s*_`]*SCORE:\**\s*(\d+(?:\.\d+)?)/m; // judges bolded it (**SCORE: 7.3**) or put it in backticks; a quoted `> SCORE:` is not theirs
const VERDICT_END = /^[\s*_`]*SCORE:\**\s*\d+(?:\.\d+)?(?:\s*\/\s*10)?[\s*_`.]*$/; // a verdict's last line is its score and nothing else
const EMPTY_TREE = (cwd: string) => spawnSync("git", ["hash-object", "-t", "tree", "--stdin"], { cwd, input: "", encoding: "utf8" }).stdout.trim();

// The handoff a session reads: PROGRESS.md reached 333-401 KB in the 24-hour scene loops, past Read's 256 KB limit (78 failed
// Reads), so after every session the driver cuts LATEST.md from it: the last builder's section, the last judge's, and the
// request-changed note until a judge follows it. A section ends at the next heading the loop writes, not at any heading, so
// a session's own sub-headings stay in it (a judge put its own `### Judge 19` inside its verdict in lighthouse/opus-1).
function latestOf(progress: string) {
  const sections = progress.split(/^(?=## Iteration \d|### Judge \d|## The request changed)/m), last = (head: string) => sections.findLastIndex(s => s.startsWith(head));
  const builder = last("## Iteration"), judge = last("### Judge"), note = last("## The request changed");
  const keep = [builder, judge, note > judge ? note : -1].filter(i => i >= 0).sort((a, b) => a - b);
  return ["The last builder's section and the last judge's verdict; paprika-loop/PROGRESS.md holds every session's.", ...keep.map(i => sections[i]!.trim())].join("\n\n") + "\n";
}
const lines = (s: string) => s.split("\n").map(l => l.trimEnd()).filter(Boolean);
/** What changed in the brief, as `+ line` for each non-blank line now in it that was not and `- line` for each gone, counted, so
    one of two equal lines removed is a change: "" when only blank lines or the order changed. */
function diffLines(was: string, now: string) {
  const left = lines(was), added: string[] = [];
  for (const l of lines(now)) { const i = left.indexOf(l); if (i >= 0) left.splice(i, 1); else added.push(l); }
  return [...added.map(l => `+ ${l}`), ...left.map(l => `- ${l}`)].join("\n");
}
const briefKey = (s: string) => createHash("sha1").update(lines(s).join("\n")).digest("hex").slice(0, 12);

const sum = (usage: Record<string, any> = {}) => Object.values(usage).reduce((n: number, u: any) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0), 0);

/** One `claude -p` session, or with `resume` more of a saved one: its stream goes to `file`, its last reply text, totals and session id come back; `ok` is false when it ended with no result line,
    and `limit` is the result's text when the API refused it for a usage or rate limit (429), which every later session would hit too (#144).
    `scored` is the last reply that ended on a SCORE line: a hook's reminder made judges reply once more after their verdict ("My verdict above stands"), which as `text` lost the score. */
function session(o: Required<Pick<LoopOptions, "cwd" | "claude">> & Pick<LoopOptions, "model" | "pluginDir" | "builderPlugin" | "builderClaude">, prompt: string, systemFile: string, turns: number, file: string, judge: boolean, killAt: number, resume?: string) {
  const plugin = judge || o.builderPlugin !== false, claude = !judge && o.builderClaude || o.claude;
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--max-turns", String(turns), "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED,
    "--append-system-prompt-file", systemFile, "--disallowedTools", judge ? JUDGE_DISALLOWED : NO_PUBLISH, ...o.model ? ["--model", o.model] : [], "--settings", SETTINGS(plugin), ...plugin && o.pluginDir ? ["--plugin-dir", o.pluginDir] : [], ...resume ? ["--resume", resume] : []];
  const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...env } = process.env; // the skill starts the loop from inside a session
  return new Promise<{ ok: boolean; text: string; scored: string | null; turns: number; tokens: number; costUsd: number; limit: string | null; sessionId?: string }>(resolve => {
    const [bin, ...pre] = claude.split(" ").filter(Boolean) as [string, ...string[]];
    const proc = spawn(bin, [...pre, ...args], { cwd: o.cwd, env, stdio: ["ignore", "pipe", "pipe"] }), out = createWriteStream(file);
    let buf = "", text = "", scored: string | null = null, result: any = null, err = "", done = false, exit: ReturnType<typeof setTimeout> | undefined, sessionId: string | undefined;
    const line = (l: string) => {
      let msg: any; try { msg = JSON.parse(l); } catch { return; }
      if (msg?.type === "system" && msg.subtype === "init") sessionId ??= msg.session_id;
      // the CLI's own limit message arrives as an assistant turn with `error` set: not the agent's reply
      if (msg?.type === "assistant" && !msg.parent_tool_use_id && !msg.error) {
        const t = (msg.message?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
        if (t) text = t;
        if (t && VERDICT_END.test(t.trimEnd().split("\n").at(-1)!)) scored = t; // a SCORE line quoted above the verdict's end is not one
      }
      if (msg?.type === "result") { result = msg; exit ??= setTimeout(() => proc.kill("SIGTERM"), EXIT_MS); }
    };
    proc.stdout.on("data", (d: Buffer) => { if (done) return; out.write(d); buf += d.toString(); const parts = buf.split("\n"); buf = parts.pop()!; parts.forEach(line); });
    proc.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    const timer = setTimeout(() => proc.kill("SIGTERM"), Math.max(killAt - Date.now(), 1000));
    const finish = () => {
      if (done) return; done = true; clearTimeout(timer); clearTimeout(exit); if (buf) line(buf); out.end();
      if (!result && err.trim()) console.error(`paprika-loop: ${err.trim().split("\n").at(-1)}`);
      resolve({ ok: !!result, text, scored, turns: result?.num_turns ?? 0, tokens: sum(result?.modelUsage), costUsd: result?.total_cost_usd ?? 0,
        limit: result?.is_error && result.api_error_status === 429 ? String(result.result || "usage limit") : null, sessionId });
    };
    // a child left running (the background server) can hold stdout open past the exit, so the result line is enough
    proc.on("exit", () => { if (result) finish(); });
    proc.on("close", finish);
  });
}

const git = (cwd: string, ...args: string[]) => { const r = spawnSync("git", args, { cwd, encoding: "utf8" }); if (r.status !== 0) throw new Error(`git ${args[0]}: ${r.stderr.trim()}`); return r.stdout.trim(); };
const writeJson = (file: string, data: unknown) => { writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2) + "\n"); renameSync(`${file}.tmp`, file); };

/** Runs the loop until the time is up (or two sessions in a row crash, or one hits a usage limit, or with idleStop two in a row change nothing) and returns what it made. */
export async function loop(opts: LoopOptions): Promise<LoopResult> {
  const o = { builderTurns: 40, judgeTurns: 20, minIterationMinutes: 5, claude: "claude", idleStop: false, builderPrompt: join(ROOT, "skills", "paprika-loop", "builder.md"), judgePrompt: join(ROOT, "skills", "paprika-loop", "judge.md"),
    pluginDir: ROOT.includes(`${sep}plugins${sep}cache${sep}`) ? undefined : ROOT, ...opts };
  const dir = join(o.cwd, "paprika-loop"), progress = join(dir, "PROGRESS.md"), status = join(dir, "loop.json"), promptFile = join(dir, "PROMPT.md");
  const handoff = () => writeFileSync(join(dir, "LATEST.md"), latestOf(readFileSync(progress, "utf8")));
  const brief = () => existsSync(promptFile) ? readFileSync(promptFile, "utf8") : ""; // the person's file: deleted, every line is gone
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore"), ignored = existsSync(ignore) ? readFileSync(ignore, "utf8") : "*.jsonl\n";
  if (!/^\.revision\*$/m.test(ignored)) writeFileSync(ignore, ignored.trimEnd() + "\n.revision*\n"); // the hook's taken copy too, should it die holding one
  // a second run in the folder goes on from the last one's loop.json (#147): numbers follow on, so no stream or judge file is overwritten
  // and its first builder is not told nothing is built
  const before: { iterations?: Iteration[]; best?: LoopResult["best"]; brief?: string } = existsSync(status) ? JSON.parse(readFileSync(status, "utf8")) : {};
  // The run's request is PROMPT.md from here on. What changed since the brief the last session started with (the person's edit
  // between runs, a new --prompt, or one made while a session ran) is a note before the next builder: 35 iterations followed a
  // stale brief when a second run kept the old PROMPT.md (#128). A loop.json from before `brief` was kept compares the old file.
  const previous = existsSync(promptFile) ? readFileSync(promptFile, "utf8") : null;
  if (previous?.trim() !== o.prompt.trim()) writeFileSync(promptFile, o.prompt.trim() + "\n");
  if (!existsSync(progress)) writeFileSync(progress, `# Progress\n\nThe request is in PROMPT.md. Each session of the loop appends one section here: a builder's \`## Iteration n\` (Did, Saw, Next, Open) and the judge's \`### Judge n\` (its scores, Next). LATEST.md holds the last of each, rewritten by the loop after every session; the next builder reads the latest Judge's Next there first.\n`);
  handoff(); // a second run's first builder gets the last sections
  // A change the person makes to PROMPT.md while a session runs goes to .revision within a second, as the lines added and removed
  // against what that session has seen: PROMPT.md at its start, or at the last revision the hook handed it (and deleted). A new
  // session reads PROMPT.md itself, so .revision goes at every session start; a change between sessions is a PROGRESS.md note.
  const revision = join(dir, ".revision");
  let lastPrompt = before.brief ?? previous ?? brief(), seen = "", written: string | null = null;
  const fresh = () => { rmSync(revision, { force: true }); seen = brief(); written = null; };
  watchFile(promptFile, { interval: 1000 }, () => {
    const now = brief();
    if (written !== null && !existsSync(revision)) seen = written; // the hook handed the last one over
    const changes = diffLines(seen, now);
    if (!changes) { rmSync(revision, { force: true }); written = null; return; } // back to what the session has
    writeFileSync(revision, `paprika-loop/PROMPT.md changed while this session runs; what changed is what the person wants next:\n${changes}\n`);
    written = now;
  }).unref(); // a loop that throws must not be kept alive by its watcher
  if (spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: o.cwd, stdio: "ignore" }).status !== 0) git(o.cwd, "init", "-q");
  const start = Date.now(), deadline = start + o.minutes * 60_000;
  const iterations: Iteration[] = before.iterations ?? [], earlier = iterations.length;
  let best: LoopResult["best"] = before.best ?? null, stale = 0, crashes = 0, stopped = "", briefFrom = 0;
  if (best && spawnSync("git", ["cat-file", "-e", `${best.commit}^{commit}`], { cwd: o.cwd }).status !== 0) { best = null; spawnSync("git", ["tag", "-d", "paprika-loop/best"], { cwd: o.cwd, stdio: "ignore" }); } // the history was rewritten since
  const save = () => writeJson(status, { deadline: new Date(deadline).toISOString(), minutes: o.minutes, model: o.model ?? null, iterations, best, brief: lastPrompt });
  save();
  for (let n = (iterations.at(-1)?.n ?? 0) + 1; (deadline - Date.now()) / 60_000 >= o.minIterationMinutes; n++) {
    const t0 = Date.now(), left = Math.round((deadline - t0) / 60_000);
    // what the builder's work is diffed against: builders that ran `git commit` themselves left an empty index and read as "changed nothing"
    const head0 = spawnSync("git", ["rev-parse", "-q", "--verify", "HEAD"], { cwd: o.cwd, encoding: "utf8" }).stdout.trim() || EMPTY_TREE(o.cwd);
    // the brief changed since the last session started: the note reaches this builder and, in LATEST.md until a judge follows it, this iteration's judge
    const now = brief(), changes = diffLines(lastPrompt, now);
    lastPrompt = now;
    if (changes) { writeFileSync(progress, readFileSync(progress, "utf8").trimEnd() + `\n\n## The request changed\n\npaprika-loop/PROMPT.md changed before session ${n}; the Next lists above were written before it. Changed lines:\n${changes}\n`); handoff(); }
    if (changes) briefFrom = iterations.length;
    // the same score from three judges in a row, for this brief: said as a fact, and the loop runs on to its time (docs/decisions-2026-10-26.md);
    // the 2026-10-28 demo's iterations 27 to 30 all scored 8.6, about $4 that moved nothing
    const last3 = iterations.slice(briefFrom).filter(i => i.score !== null).slice(-3);
    const flat = last3.length === 3 && last3.every(i => i.score === last3[0]!.score)
      ? ` The last three judges (iterations ${last3[0]!.n} to ${last3[2]!.n}) each scored ${last3[0]!.score}: what those sessions changed did not move the score.` : "";
    fresh();
    const b = await session(o, BUILDER_PROMPT(n, left, iterations.length === 0, !!changes, flat), o.builderPrompt, o.builderTurns, join(dir, `stream-${n}.jsonl`), false, deadline + GRACE_MS);
    if (b.ok) crashes = 0; else if (++crashes > 1) { console.error("paprika-loop: two sessions in a row ended without a result; stopping"); break; }
    // refused at its first request: nothing to commit, and every later session would be refused at once too (#144)
    if (b.limit && b.turns <= 1) { stopped = b.limit; break; }
    // the handoff is the builder's to write; a builder that stopped without it leaves its last reply under the heading
    if (!new RegExp(`^## Iteration ${n}\\b`, "m").test(readFileSync(progress, "utf8"))) writeFileSync(progress, readFileSync(progress, "utf8").trimEnd() + `\n\n## Iteration ${n}\n\n${b.text.trim() || "(no reply)"}\n`);
    handoff();
    // a builder's `bun add three` left 1,274 files in the first dry run's first commit
    if (existsSync(join(o.cwd, "node_modules")) && spawnSync("git", ["check-ignore", "-q", "node_modules"], { cwd: o.cwd }).status !== 0) writeFileSync(join(o.cwd, ".gitignore"), (existsSync(join(o.cwd, ".gitignore")) ? readFileSync(join(o.cwd, ".gitignore"), "utf8").trimEnd() + "\n" : "") + "node_modules/\n");
    // a builder that committed node_modules before the line above existed: untracked again, or it rides along in every commit
    if (spawnSync("git", ["ls-files", "--error-unmatch", "node_modules"], { cwd: o.cwd, stdio: "ignore" }).status === 0) git(o.cwd, "rm", "-r", "-q", "--cached", "node_modules");
    git(o.cwd, "add", "-A");
    // the page changed, not only the notes (the driver itself writes under paprika-loop/): what the judge and the stale count go by
    const changed = spawnSync("git", ["diff", "--cached", "--quiet", head0, "--", ".", ":!paprika-loop"], { cwd: o.cwd }).status === 1;
    if (spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: o.cwd }).status === 1) git(o.cwd, "commit", "-qm", `paprika-loop ${n}: ${(b.text.split("\n").find(l => l.trim()) ?? "iteration").trim().slice(0, 72)}`);
    const commit = changed ? git(o.cwd, "rev-parse", "--short", "HEAD") : null;
    const it: Iteration = { n, turns: b.turns, tokens: b.tokens, costUsd: b.costUsd, minutes: 0, commit, score: null, judgeTurns: 0, judgeTokens: 0 };
    iterations.push(it);
    if (b.limit) { stopped = b.limit; it.minutes = Math.round((Date.now() - t0) / 6_000) / 10; save(); break; }
    if (!changed && ++stale > 1 && o.idleStop) { it.minutes = Math.round((Date.now() - t0) / 6_000) / 10; save(); console.error("paprika-loop: two sessions in a row changed nothing; stopping"); break; }
    if (changed) {
      stale = 0;
      fresh();
      const judged = briefKey(brief()); // the brief this judge scores against
      let j = await session(o, JUDGE_PROMPT(n), o.judgePrompt, o.judgeTurns, join(dir, `judge-stream-${n}.jsonl`), true, deadline + GRACE_MS);
      // a judge that used every turn mid-investigation wrote no SCORE (both judges of a big page, #123): the session resumed once, two turns, for its verdict.
      // A resumed session's tokens and cost are the whole session's so far, its turns only its own (docs/results-loop-2026-10-12.md)
      if (j.ok && !j.limit && j.sessionId && !j.scored) {
        fresh();
        const more = await session(o, VERDICT_PROMPT, o.judgePrompt, 2, join(dir, `judge-stream-${n}-verdict.jsonl`), true, deadline + GRACE_MS, j.sessionId);
        // a resume killed at the deadline before its result line has text and zero totals: the judge's own stay
        // a resume that only says the verdict stands leaves the judge's own text when that has a score
        const keep = !more.scored && SCORE_LINE.test(j.text) ? { text: j.text } : {};
        if (more.text.trim()) j = { ...more, ok: true, turns: j.turns + more.turns, ...more.ok ? {} : { tokens: j.tokens, costUsd: j.costUsd }, ...keep };
      }
      if (j.limit) { stopped = j.limit; it.minutes = Math.round((Date.now() - t0) / 6_000) / 10; save(); break; }
      const verdict = (j.scored ?? j.text).replace(/^#+\s*Judge[^\n]*\n/, "").trim(); // the heading is the driver's; judges wrote their own too
      writeFileSync(join(dir, `judge-${n}.md`), verdict + "\n");
      writeFileSync(progress, readFileSync(progress, "utf8").trimEnd() + `\n\n### Judge ${n}\n\n${verdict || "(no reply)"}\n`);
      handoff();
      it.judgeTurns = j.turns; it.judgeTokens = j.tokens; it.costUsd += j.costUsd;
      it.score = Number([...verdict.matchAll(new RegExp(SCORE_LINE, "gm"))].at(-1)?.[1] ?? NaN) || null; // its own, not one it quoted
      // a score for another brief does not compare: the first one for a changed brief is the best until one beats it
      if (it.score !== null && (!best || best.brief !== judged || it.score > best.score)) { best = { n, commit: commit!, score: it.score, brief: judged }; git(o.cwd, "tag", "-f", "paprika-loop/best", commit!); }
      git(o.cwd, "add", "-A"); if (spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: o.cwd }).status === 1) git(o.cwd, "commit", "-qm", `paprika-loop ${n}: judge`);
    }
    it.minutes = Math.round((Date.now() - t0) / 6_000) / 10;
    save();
  }
  unwatchFile(promptFile); rmSync(revision, { force: true }); // every break lands here; a watcher left on would keep the process alive
  const run = iterations.slice(earlier), cost = run.reduce((s, i) => s + i.costUsd, 0), latest = iterations.findLast(i => i.commit)?.commit;
  const text = [`# paprika-loop report`, "", `${run.length} iteration${run.length === 1 ? "" : "s"} in ${Math.round((Date.now() - start) / 60_000)} minutes, $${cost.toFixed(2)}.`, "",
    "| n | min | turns | tokens | commit | score |", "|---|---|---|---|---|---|", ...run.map(i => `| ${i.n} | ${i.minutes} | ${i.turns} | ${i.tokens} | ${i.commit ?? "none"} | ${i.score ?? "-"} |`), "",
    best ? `Best: iteration ${best.n} at ${best.commit} (score ${best.score}), tagged paprika-loop/best${latest && latest !== best.commit ? `; the latest is ${latest}. \`git checkout paprika-loop/best\` shows the best one` : ""}.` : "No iteration was scored.",
    ...stopped ? [`Stopped early: the API refused a session for a usage limit ("${stopped}").`] : [],
    "The agents' notes are in paprika-loop/PROGRESS.md."].join("\n");
  if (stopped) console.error(`paprika-loop: stopped, usage limit: ${stopped}`);
  writeFileSync(join(dir, "REPORT.md"), text + "\n");
  return { iterations, best, text };
}
