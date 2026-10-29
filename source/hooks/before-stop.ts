// Finish notes (Stop): the first time an agent that opened a game this session tries to stop, it is told once, as facts,
// what it never ran: source files changed after the last `interact` or `look` (the final version never played or seen,
// from the session's run folders) and the last plain look's fault lines (last-test.json, written by the server). AA-3D
// gpu-short-1: with the plugin, agents stopped about a minute after their first draft with a Lighting fault still open and
// a reply with no fault lines read as done. It once asked for zoom and opening looks, a longer play, a saved-check rerun and
// "the one thing a viewer would notice", and later "Do these, or say why they do not apply"; JC's playtest and the Door
// Dash post-mortem (2026-10-20) found those read as demands the agent met instead of improving the game (one spliced in
// rivals and scenery to 1,062 draw calls), so it states facts and asks nothing. Silent when nothing applies or on a second stop.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { json } from "node:stream/consumers";
import { sessionRuns, sourcesSince } from "./session.ts";
import { ON, REPORT_ASK, stopEvent } from "../src/telemetry.ts";

const input: any = await json(process.stdin).catch(() => null);
if (!input || input.stop_hook_active) process.exit(0);
const session = String(input.session_id ?? "");
const mark = join(tmpdir(), `paprika3d-stop-${session.replace(/[^\w.-]/g, "_")}`);
if (existsSync(mark)) process.exit(0);

// the run folders this session's own calls named (session.ts); one deleted since would read as never played
const mine = sessionRuns(input.transcript_path, session)?.filter(r => existsSync(r)) ?? [];
if (!mine.length) process.exit(0);

const tests = mine.map(run => { try { return { run, ...(JSON.parse(readFileSync(join(run, "last-test.json"), "utf8")) as { at: string; faults: string[] }) }; } catch { return null; } })
  .filter(t => t !== null).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const last = tests[0];
// a run is <project>/paprika3d/runs/<run>, so the sources are the last-tested game's wherever the shell cd'd (gpu-4x4-4
// bowling stopped in node_modules/…/dist), and each of two games opened in two folders has its own
const root = last && resolve(last.run, "..", "..", "..");
const changed = root && last ? sourcesSince(root, Date.parse(last.at)).map(p => relative(root, p)) : [];

const todo: string[] = [], asked: string[] = []; // asked: the items by key, for the dev build's telemetry (src/telemetry.ts)
const ask = (key: string, line: string) => { todo.push(line); asked.push(key); };
if (!last) ask("unplayed", "This session opened the game but never played or looked at it (`interact`, `look`).");
else if (changed.length) ask("changed", `${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ` and ${changed.length - 5} more` : ""} changed after your last \`interact\` or \`look\`: the final version was never played or seen.`);
if (last?.faults.length) ask("faults", `Your last \`look\` reported:\n${last.faults.map(f => `  ${f}`).join("\n")}`);
stopEvent(asked);
if (!todo.length) process.exit(0);
writeFileSync(mark, "");
console.log(JSON.stringify({ decision: "block", reason: `paprika3d notes, once:\n- ${todo.join("\n- ")}${ON ? REPORT_ASK : ""}` }));
