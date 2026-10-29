// Revision hook (PostToolUse, paprika-loop sessions only): hands the running session the pending revision of its brief.
// The loop driver (src/loop.ts) watches paprika-loop/PROMPT.md while a session runs and, when the person changes it,
// writes paprika-loop/.revision with the lines added and removed against what the session has seen; this hook prints that
// text as additionalContext at the session's next tool call and deletes the file, so each revision is said once. The
// driver passes it in each session's --settings behind `test -f .../paprika-loop/.revision`, never in hooks.json, so no
// other session starts it and a call with no revision pending runs only `test`. The Backrooms loop's hand-built inbox
// hook ran on every call and counted notes, and missed 5 of 17 (docs/trace-review-backrooms-ycse-2026-10-25.md).
// It prints the driver's text and nothing of its own.
import { readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { json } from "node:stream/consumers";

const input: any = await json(process.stdin).catch(() => null);
// the folder the driver's `test -f "${CLAUDE_PROJECT_DIR:-.}/..."` looked in, so a session that cd'd below it still gets the file
const file = join(process.env.CLAUDE_PROJECT_DIR || input?.cwd || ".", "paprika-loop", ".revision"), taken = `${file}.${process.pid}`;
// taken by a rename, not read then deleted: a revision the driver writes in between lands in a new .revision for the next call
try { renameSync(file, taken); } catch { process.exit(0); }
const text = readFileSync(taken, "utf8").trim();
rmSync(taken, { force: true });
if (text) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } }));
