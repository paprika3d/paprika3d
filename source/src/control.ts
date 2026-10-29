// The client half of the MCP server's control socket (server.ts answers it): what the after-edit hook and the CLI use
// to ask the running server for a check. Kept apart from server.ts so the hook can ask without loading puppeteer.
import { readState } from "./state.ts";

/** The Claude Code edit that triggered a check, when the hook ran it. */
export interface Edit { ref: string; file: string; time: string; session: string }

/** What a check returns to the CLI: counts, whether the failing set changed, and the runner text; when asked with
    `faults`, the Lighting and Surfaces lines on the reloaded page against the last look's (or the last recheck's) at the
    same frame: closed, opened and all open now (left out when the page drew nothing to check). */
export type CheckReply = { passed: number; failed: number; changed: boolean; text: string; faults?: { closed: string[]; opened: string[]; open: string[] } };

/** Asks the server named in the project's state.json to run a check (of the saved checks in game-tests.json with
    `tests`, and a recheck of the fault lines with `faults`); null when none answers for this project. */
export async function askServer(dir: string, body: { edit?: Edit; ci?: boolean; tests?: boolean; faults?: boolean }, s = readState(dir).server): Promise<CheckReply | null> {
  if (!s) return null; // `s`: the caller's already-read state.server, so state.json is parsed once per run
  let res: Response;
  try { res = await fetch(`http://127.0.0.1:${s.port}/check`, { method: "POST", body: JSON.stringify({ token: s.token, ...body }) }); }
  catch { return null; } // nobody listens: the server is gone
  if (res.status === 500) throw new Error(((await res.json()) as { error: string }).error); // it ran and the check itself failed to start
  return res.ok ? await res.json() as CheckReply : null; // 403 or 409: not this project's open game
}
