#!/usr/bin/env bun
// paprika3d command line. One case per subcommand on process.argv; plain text out, errors to stderr with exit 1.
// `serve` is the MCP server (src/server.ts). `check` is what the after-edit hook runs: it asks the running server over
// its control socket when state.json names one that answers, so Chrome keeps a single owner, and otherwise opens its
// own Chrome, checks and closes it. `contract-lint` checks contract files' format for the benchmark and the fixtures; it and
// `bench` run from the repo only: the published builds define PAPRIKA3D_CHANNEL and leave both out.
// A plugin copy in Claude Code's cache has no node_modules, so puppeteer-core is imported only after selfInstall().
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validateContract } from "./contract.ts";
import { askServer, type CheckReply } from "./control.ts";
import { readState } from "./state.ts";
import type { LoopOptions } from "./loop.ts";

/** Installs the locked dependencies and builds runtime/dist, geo/dist, fx/dist and state/dist once, when this copy lacks them (a cached plugin copy).
    Their output goes to stderr: stdout may be the MCP channel. */
function selfInstall() {
  const root = join(import.meta.dirname, "..");
  const run = (cmd: string[]) => {
    if (spawnSync(cmd[0]!, cmd.slice(1), { cwd: root, stdio: ["ignore", 2, 2] }).status !== 0) { console.error(`paprika3d: ${cmd.join(" ")} failed in ${root}`); process.exit(1); }
  };
  if (!existsSync(join(root, "node_modules", "puppeteer-core"))) run([process.execPath, "install", "--frozen-lockfile"]);
  if (!existsSync(join(root, "runtime", "dist", "index.js"))) run([process.execPath, "runtime/build.ts"]);
  if (!existsSync(join(root, "geo", "dist", "studio.js"))) run([process.execPath, "geo/build.ts"]); // writes geo.js too
  if (!existsSync(join(root, "fx", "dist", "fx.js"))) run([process.execPath, "fx/build.ts"]);
  if (!existsSync(join(root, "state", "dist", "physics-worker.js"))) run([process.execPath, "state/build.ts"]);
}
// the Node build (src/cli.js) is bundled with its dependencies and ships the built runtime, geo, fx and store
if (import.meta.filename.endsWith(".ts")) selfInstall();
const { openGame } = await import("./browser.ts");
const { guarded, runCheck, serve } = await import("./server.ts");

const REPO = !process.env.PAPRIKA3D_CHANNEL;
const USAGE = `usage: paprika3d <command>
  serve                      the MCP server on stdin/stdout
  check [--cwd DIR] [--url URL | --command CMD] [--edit-ref ID --edit-file PATH --edit-time ISO --session ID] [--ci] [--json]
                             rerun the project's saved checks, game-tests.json (its game-contract.json instead, when it has
                             one), and exit 1 on failures; --json adds whether the failing
                             keypoints changed since the check before, for the after-edit hook;
                             PAPRIKA3D_TESTED_WITH=1 ends the plain report with a "Tested with paprika3d" line (never with --json)
${REPO ? `  contract-lint <files...>   check game contract files against the format (no hash check)
  bench --tasks a,b [--runs 1] [--models opus] [--conditions with,without,lean,feel,store] [--parallel 1] [--run-id ID] [--demand TEXT]
                             run the benchmark grid in /tmp/paprika3d-bench and write bench/out/results-<run-id>.md;
                             --demand adds TEXT to the plugin arms' prompt (with, lean, feel), for models that never pick the plugin up by themselves
` : ""}  loop --minutes N (--prompt TEXT | --prompt-file PATH) [--cwd DIR] [--model ID] [--builder-turns 40] [--judge-turns 20]
       [--builder-prompt FILE] [--judge-prompt FILE] [--idle-stop] [--builder-no-plugin] [--claude CMD] [--builder-claude CMD]
                             build the request over N minutes in fresh claude -p sessions, one improvement each, judged and
                             committed; the agents' notes land in paprika-loop/PROGRESS.md (the paprika-loop skill).
                             The request is kept as paprika-loop/PROMPT.md: edited while the loop runs, the running session
                             gets the changed lines at its next tool call and later sessions start from the new text.
                             --builder-prompt and --judge-prompt replace skills/paprika-loop/builder.md and judge.md
                             (builder-scene.md and judge-scene.md rebuild the scene in the pictures in refs/); --idle-stop
                             stops after two sessions in a row that change nothing; by default the loop runs to its time
                             limit; --builder-no-plugin runs the builder without paprika3d (the judge keeps it), the no-plugin arm of an A/B; --claude runs each session through
                             a command ("bun bench/pool.ts claude --" for the bench account pool), and --builder-claude the builder's sessions
                             alone (a sandboxed one, the judge outside it). With
                             CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=30 in the environment a session compacts at 30% of its
                             window, for --builder-turns above 40.
`;

const [cmd, ...args] = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

switch (REPO || !["contract-lint", "bench"].includes(cmd!) ? cmd : undefined) {
  case "serve":
    await serve();
    break;
  case "check": {
    const dir = resolve(value("--cwd") ?? "."), url = value("--url"), command = value("--command"), ci = flag("--ci"), json = flag("--json");
    const ref = value("--edit-ref");
    const edit = ref ? { ref, file: value("--edit-file") ?? "", time: value("--edit-time") ?? new Date().toISOString(), session: value("--session") ?? "" } : undefined;
    try {
      const s = readState(dir);
      // the server's game is this check's game unless the command line names another
      const r = (!url || url === s.url) && (!command || command === s.command) ? await askServer(dir, { edit, ci }, s.server) : null;
      // the opt-in "Tested with paprika3d" footer (src/tested-with.ts), loaded only when the switch is set
      const footer = process.env.PAPRIKA3D_TESTED_WITH ? (await import("./tested-with.ts")).testedWith(process.env, json) : "";
      const print = (r: CheckReply) => console.log(json ? JSON.stringify({ passed: r.passed, failed: r.failed, changed: r.changed, text: r.text }) : r.text + footer);
      if (r) { print(r); process.exit(r.failed ? 1 : 0); }
      // Chrome only, never the fallback engine: a hook's check downloads nothing, and the exit below ends only Chrome
      const game = await openGame({ url: url ?? (command ? undefined : s.url ?? undefined), command: command ?? (url ? undefined : s.command ?? undefined), cwd: dir, engine: "chromium" });
      const own = await guarded(runCheck(game, dir, { edit, ci, reload: false }), "check", () => game).catch(async e => { await game.close(); throw e; });
      print(own);
      // no reload or close: puppeteer's exit hook kills Chrome and removes its profile, the static server and a dev
      // command's watcher die with this process
      process.exit(own.failed ? 1 : 0);
    } catch (e) {
      // hooks/after-batch.ts matches "paprika3d check: game not ready" (browser.ts's message) to stay silent
      console.error(`paprika3d check: ${(e as Error).message}`);
      process.exit(1);
    }
    break;
  }
  case "contract-lint": {
    if (!args.length) { console.error(USAGE); process.exit(1); }
    let bad = 0;
    for (const f of args) {
      let errs: string[];
      try { errs = validateContract(JSON.parse(readFileSync(f, "utf8"))); } catch (e) { errs = [(e as Error).message]; }
      if (errs.length) { bad++; console.error(`${f}:\n  ${errs.join("\n  ")}`); } else console.log(`ok ${f}`);
    }
    process.exit(bad ? 1 : 0);
  }
  case "bench": {
    const list = (name: string, fallback = "") => (value(name) ?? fallback).split(",").filter(Boolean);
    try {
      const { bench } = await import("../bench/run.ts"); // only the benchmark loads the runner
      const path = await bench({ tasks: list("--tasks"), runs: Number(value("--runs") ?? 1), models: list("--models", "opus"),
        conditions: list("--conditions", "with,without"), parallel: Number(value("--parallel") ?? 1), runId: value("--run-id"), demand: value("--demand") });
      console.log(`results: ${path}`);
    } catch (e) {
      console.error(`paprika3d bench: ${(e as Error).message}`);
      process.exit(1);
    }
    break;
  }
  case "loop": {
    const file = value("--prompt-file"), prompt = value("--prompt") ?? (file ? readFileSync(file, "utf8") : undefined), minutes = Number(value("--minutes"));
    if (!prompt || !(minutes > 0)) { console.error(USAGE); process.exit(1); }
    const { loop } = await import("./loop.ts");
    const path = (name: string) => { const v = value(name); return v ? resolve(v) : undefined; };
    // a flag left out is a key left out: loop() spreads these over its defaults, and an undefined value would replace one
    const opts: LoopOptions = { cwd: resolve(value("--cwd") ?? "."), prompt, minutes, model: value("--model"), builderTurns: Number(value("--builder-turns") ?? 40), judgeTurns: Number(value("--judge-turns") ?? 20),
      builderPrompt: path("--builder-prompt"), judgePrompt: path("--judge-prompt"), idleStop: flag("--idle-stop") || undefined, builderPlugin: !flag("--builder-no-plugin"), claude: value("--claude"), builderClaude: value("--builder-claude") };
    for (const k of Object.keys(opts) as (keyof LoopOptions)[]) if (opts[k] === undefined) delete opts[k];
    const r = await loop(opts);
    console.log(r.text);
    break;
  }
  default:
    console.error(USAGE);
    process.exit(1);
}
