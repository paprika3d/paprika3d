import { readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { json } from "node:stream/consumers";
var input = await json(process.stdin).catch(() => null), file = join(process.env.CLAUDE_PROJECT_DIR || input?.cwd || ".", "paprika-loop", ".revision"), taken = `${file}.${process.pid}`;
try {
  renameSync(file, taken);
} catch {
  process.exit(0);
}
var text = readFileSync(taken, "utf8").trim();
rmSync(taken, { force: !0 });
if (text)
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } }));
