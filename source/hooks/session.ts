// Which run folders are this session's, for both hooks: the ones its own paprika3d calls named in their replies, read
// from its transcript. Not by folder time: a loop child or a second terminal in the same folder made runs newer than
// this session's start, and the start read from the transcript could be hours late (dev #113, #134); before that, the
// transcript's birthtime read 0 on filesystems without one (RunPod's FUSE mount) and every old run counted (#42).
// Runs are still never dated by time; `sessionBegan` is for dating files only (`sourcesSince`).
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const mtime = (f: string) => { try { return statSync(f).mtimeMs; } catch { return 0; } };

/** The run folders this session's own paprika3d calls named: `Run folder: <path>` in an `open` reply or a reopen note
    and `Picture: <path>/look-N.png` in a look's, read from the session's transcript and its subagents'
    (`<dir>/<session>/subagents/*.jsonl`), joined to the session's own `mcp__plugin_paprika3d_paprika__*` tool_use ids so
    a Bash `cat` of another session's stream counts nothing, and from the replies of those calls in a hook's own `batch`.
    null when no transcript can be read (the caller keeps its no-transcript behaviour). */
export function sessionRuns(transcript: unknown, sessionId: string, batch: { tool_name: string; tool_response?: unknown }[] = []): string[] | null {
  if (typeof transcript !== "string" || !existsSync(transcript)) return null;
  const sub = join(dirname(transcript), sessionId, "subagents");
  const files = [transcript, ...existsSync(sub) ? readdirSync(sub).filter(f => f.endsWith(".jsonl")).map(f => join(sub, f)) : []];
  const ids = new Set<string>(), runs = new Set<string>();
  // the folder by its shape, whatever follows a picture's name; JSON text, so a path holding `"` or `\` comes out cut
  const named = (json: string) => { for (const m of json.matchAll(/(?:Run folder|Picture): (\/[^"\\]*?\/paprika3d\/runs\/[^"\\/]+)/g)) runs.add(m[1]!); };
  // Claude Code appends results to the transcript on a 100 ms timer and starts PostToolBatch hooks sooner, but passes
  // each call's reply in the hook's input: an `open` in the batch of the page's Write was not in the transcript yet (#194)
  for (const c of batch) if (c.tool_name.startsWith("mcp__plugin_paprika3d_paprika__")) named(JSON.stringify(c.tool_response ?? ""));
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/"type":"tool_use","id":"([^"]+)","name":"mcp__plugin_paprika3d_paprika__\w+"/g)) ids.add(m[1]!);
    for (const line of text.split("\n")) {
      // one result a line: an api-request-blob line repeats several, each also on a line of its own
      const at = line.indexOf('"tool_result"');
      if (at < 0 || line.includes('"tool_result"', at + 1)) continue;
      const id = /"tool_use_id":"([^"]+)"/.exec(line)?.[1];
      if (!id || !ids.has(id)) continue;
      named(line);
    }
  }
  return [...runs];
}

// what an agent edits: not packages, build output, the harness's own folders or the copies the `open` tool makes
const SOURCE = /\.(html?|m?js|jsx|tsx?|css|glsl|vert|frag|wgsl)$/, SKIP = new Set(["node_modules", "dist", "build", "paprika3d", "paprika-loop", "Library"]); // Library: a session started in a home folder must not walk macOS's protected folders
const COPIES = new Set(["three-runtime.js", "geo.js", "fx.js", "game-state.js", "physics-worker.js"]);
/** Source files under `root`, 6 folders deep at most, changed after `since` (ms) and passing `keep`: `max` at most. */
export function sourcesSince(root: string, since: number, keep: (path: string) => boolean = () => true, max = 21): string[] {
  const found: string[] = [];
  let seen = 0; // shortcut: 5,000 entries at most, so a session started in a home folder stays cheap; a page past them is missed
  (function walk(d: string, depth: number) {
    if (depth > 6) return;
    for (const e of (() => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } })()) {
      if (found.length >= max || ++seen > 5000) return;
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (SOURCE.test(e.name) && !COPIES.has(e.name) && mtime(p) > since && keep(p)) found.push(p);
    }
  })(root, 0);
  return found;
}

/** When the session began, for dating files (never runs: sessionRuns): the earlier of its transcript's birth time and the
    earliest timestamp in the transcript's first 64 KB, where a nested one can come first and read late. So a late
    timestamp cannot make it late while the birth time is known; a filesystem without one gives 0 (#42), and then the
    timestamps decide alone. 0 when there is neither. */
export function sessionBegan(transcript: unknown): number {
  try {
    const f = String(transcript), head = Buffer.alloc(65536), fd = openSync(f, "r"), n = readSync(fd, head, 0, head.length, 0);
    closeSync(fd);
    const at = [...head.toString("utf8", 0, n).matchAll(/"timestamp":"([^"]+)"/g)].map(m => Date.parse(m[1]!)).concat(statSync(f).birthtimeMs).filter(t => t > 0);
    return at.length ? Math.min(...at) : 0;
  } catch { return 0; }
}
