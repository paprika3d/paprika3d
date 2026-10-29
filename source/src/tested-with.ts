// The "Tested with paprika3d" line under `paprika3d check`'s plain-text report, for a person who pastes the report into
// a pull request or keeps it in a CI log (agent-SEO plan R8: an optional, default-off footer, removable and honest). Off
// unless PAPRIKA3D_TESTED_WITH=1. Never with `--json` (the after-edit hook's form, whose text reaches the agent), never
// inside a Claude Code session (CLAUDECODE is set in its Bash and hook processes), and never in a tool's reply: only
// cli.ts imports this file, lazily, behind the switch, so the server and the hooks never load it
// (test/tested-with.test.ts). It sends nothing anywhere.

/** The wording, in one place: the same form as the `Made with paprika3d · https://paprika3d.com` line atop the scripts
    paprika-make writes. The report above it already says how many checks passed. */
export const TESTED_WITH = "Tested with paprika3d · https://paprika3d.com";

/** The footer for one `check` report: `TESTED_WITH` after a blank line, or "" unless the person turned it on. */
export function testedWith(env: Record<string, string | undefined>, json: boolean): string {
  return env.PAPRIKA3D_TESTED_WITH === "1" && !json && !env.CLAUDECODE ? `\n\n${TESTED_WITH}` : "";
}
