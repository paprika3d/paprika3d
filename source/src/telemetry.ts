// Dev build only (docs/decisions-2026-10-18.md): which tools ran, with which options, on what kind of page, how long they
// took and whether they failed, one JSON line per call in $PAPRIKA3D_HOME/telemetry/<run>.jsonl, which hooks/telemetry.ts
// uploads at each stop. Both builds (docs/decisions-2026-10-25.md): `send_feedback`, the agent's bug, feedback or criticism,
// with the last call's names kept in memory only. Stable build only (docs/decisions-2026-10-28.md): one ping per install
// and version, to count public installs (`installed()`). Names, counts and the schema's own enum values only: never an argument's
// value, code, a path, page text or a picture. On only when the build names its channel, so a source checkout, the bench
// arms and the tests send nothing; DO_NOT_TRACK=1 or PAPRIKA3D_TELEMETRY=0 turns both off. Nothing here throws: telemetry
// never reaches a reply.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { platform } from "node:os";
import { join, resolve } from "node:path";
import { harnessHome } from "./state.ts";

const off = /^(1|true)$/i.test(process.env.DO_NOT_TRACK ?? "") || process.env.PAPRIKA3D_TELEMETRY === "0";
export const ON = process.env.PAPRIKA3D_CHANNEL === "dev" && !off;
/** `send_feedback` and the failed-reply ask: both builds. */
export const FEEDBACK = (process.env.PAPRIKA3D_CHANNEL === "dev" || process.env.PAPRIKA3D_CHANNEL === "stable") && !off;
const URL = process.env.PAPRIKA3D_TELEMETRY_URL ?? "", KEY = process.env.PAPRIKA3D_TELEMETRY_KEY ?? "";
export const telemetryDir = () => join(harnessHome(), "telemetry");
const run = randomUUID().slice(0, 8); // this server process
// src/input.ts's step kinds, copied since importing input.ts would bundle look.ts into the hooks; test/telemetry.test.ts checks they match
export const KINDS = ["key", "mouse", "wheel", "resize", "scroll", "touch", "wait", "clock", "state", "until", "action"];

let id = "";
function install(): string {
  if (id) return id;
  const f = join(telemetryDir(), "id");
  try { id = readFileSync(f, "utf8").trim(); } catch {}
  if (!id) { id = randomUUID(); mkdirSync(telemetryDir(), { recursive: true }); writeFileSync(f, id); }
  return id;
}
const base = () => ({ v: 1, at: new Date().toISOString(), install: install(), run, version: process.env.PAPRIKA3D_VERSION ?? "0.0.0-src", os: platform(), node: process.versions.node.split(".")[0] });

/** A failed reply's first line with paths and URLs taken out. */
export const scrub = (s: string) => (s.split("\n")[0] ?? "").replace(/[a-z]+:\/\/\S+/gi, "<url>").replace(/(?:[A-Za-z]:\\|~?\/)[^\s:'"`,)]+/g, "<path>").slice(0, 160);

type Schema = { properties?: Record<string, { enum?: unknown[] }> };
type Reply = { content: { type: string; text?: string }[]; isError?: boolean } | null;
let extra: Record<string, unknown> = {}, last: Record<string, unknown> | null = null;

/** Facts `open` learned about the page, sent with its event. */
export function noteOpen(facts: Record<string, unknown>) { extra = facts; }

/** One line for one tool call: the argument names the agent passed (an argument's value only when it is one of its schema's enum values). */
export function event(tool: string, args: Record<string, any>, r: Reply, ms: number, schema?: Schema) {
  if (!FEEDBACK) return;
  try {
    const t = r?.content.find(c => c.type === "text")?.text ?? "";
    const flags: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args ?? {})) if (k !== "cwd" && k !== "game") flags[k] = schema?.properties?.[k]?.enum?.includes(v) ? v : true;
    const ok = !!r && !r.isError, error = !ok ? (r ? scrub(t) : "threw") : undefined;
    last = { tool, flags, ok, ...(error && { error }) };
    if (!ON) return; // the stable build keeps only `last`, for a report
    const steps: Record<string, number> = {};
    for (const s of Array.isArray(args?.steps) ? args.steps : []) for (const k of Object.keys(s ?? {})) if (KINDS.includes(k)) steps[k] = (steps[k] ?? 0) + 1;
    const faults = (t.match(/^(Lighting|Surfaces|Surface): (?!not checked)/gm) ?? []).length, pageErrors = Number(/Page errors since the last call \((\d+)\)/.exec(t)?.[1] ?? 0);
    const e = { ...base(), project: createHash("sha256").update(install() + resolve(String(args?.cwd ?? "."))).digest("hex").slice(0, 12), tool, ms, ok,
      ...(error && { error }), bytes: t.length, flags, ...(Object.keys(steps).length && { steps }),
      ...(faults && { faults }), ...(pageErrors && { pageErrors }), ...(/answered nothing for|without finishing|did not answer/.test(t) && { hung: true }), ...extra };
    extra = {};
    mkdirSync(telemetryDir(), { recursive: true });
    appendFileSync(join(telemetryDir(), `${run}.jsonl`), `${JSON.stringify(e)}\n`);
  } catch {}
}

/** POSTs to the team's Worker within 3 s; false when it is unset, down or slow. */
export const post = (path: string, body: string) => !URL ? Promise.resolve(false)
  : fetch(URL + path, { method: "POST", headers: { "content-type": "application/json", "x-paprika3d-key": KEY }, body, signal: AbortSignal.timeout(3_000) }).then(r => r.ok, () => false);

export const REPORT_TOOL = { name: "send_feedback", description: "Sends the paprika3d team a bug, feedback or criticism about the harness itself (not about the user's page): a reply that was wrong or unclear, a tool that hung, errored or got in your way, a check you disagree with, or something you needed and no tool gave. It attaches the last tool call's name, options and error, never the page's code or files. One line back; carry on with the task after it.",
  inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["bug", "feedback", "criticism"] }, text: { type: "string", description: "What happened and what you expected, in a few sentences (2,000 characters at most)." } }, required: ["kind", "text"] } };

/** `send_feedback`'s handler; a wrong kind or no text throws, as the other tools' bad arguments do. */
export function reportTool(a: Record<string, any>, runDir?: string): Promise<string> {
  if (!REPORT_TOOL.inputSchema.properties.kind.enum.includes(a.kind) || typeof a.text !== "string" || !a.text.trim()) throw new Error('kind: "bug", "feedback" or "criticism", and text saying what happened');
  return report(a.kind, a.text, runDir);
}

let reports = 0;
/** `send_feedback`: sends the agent's report with the last call's event, keeps a copy beside the run, and returns the one-line reply. */
export async function report(kind: string, text: string, runDir?: string): Promise<string> {
  if (++reports > 5) return "Not sent: at most 5 reports a session. Carry on with the task.";
  const body = JSON.stringify({ id: randomUUID(), ...base(), kind, text: text.slice(0, 2_000), last }); // id: a resend is stored once
  const copy = join(runDir ?? telemetryDir(), `report-${Date.now()}.json`);
  try { mkdirSync(runDir ?? telemetryDir(), { recursive: true }); writeFileSync(copy, body); } catch {}
  if (await post("/report", body)) return "Sent to the paprika3d team. Carry on with the task.";
  if (!ON) return `Not sent: the team's server did not answer. A copy is in ${copy}. Carry on with the task.`; // no upload hook in the stable build
  try { writeFileSync(join(telemetryDir(), `${randomUUID()}.report.json`), body); } catch {} // the upload hook sends it at the next stop
  return `Saved in ${copy}; it is sent when the session stops. Carry on with the task.`;
}

/** The stable build's ping, once per install and version, at the client's first `initialize`: the install id, version, os, node and the MCP client's name. Sent again next start when the Worker does not answer. */
export async function installed(client: string) {
  if (process.env.PAPRIKA3D_CHANNEL !== "stable" || !FEEDBACK) return; // folds at build time: the dev bundle holds no ping
  try {
    const f = join(telemetryDir(), "pinged"), body = JSON.stringify({ ...base(), client: client.slice(0, 64) }); // base() makes the folder
    const version = process.env.PAPRIKA3D_VERSION ?? "0.0.0-src";
    if (existsSync(f) && readFileSync(f, "utf8") === version) return;
    if (await post("/install", body)) writeFileSync(f, version);
  } catch {}
}

/** The disclosure, once per install, for `open`'s reply. */
export function told(): string {
  if (process.env.PAPRIKA3D_CHANNEL !== "dev" || !ON) return ""; // the channel test folds at build time, so the stable bundle holds no dev disclosure
  try {
    const f = join(telemetryDir(), "told");
    if (existsSync(f)) return "";
    mkdirSync(telemetryDir(), { recursive: true });
    writeFileSync(f, new Date().toISOString());
  } catch { return ""; }
  return "\npaprika3d dev build: it sends the team which tools ran, with which options, how long they took and their errors; never your code, files or pictures. PAPRIKA3D_TELEMETRY=0 turns it off. `send_feedback` sends the team a bug or feedback.";
}

/** A failed reply's last sentence in both builds, and the stop hook's in the dev build. */
export const REPORT_ASK = FEEDBACK ? "\nIf a paprika3d reply was wrong, unclear or got in your way, say so once with `send_feedback`." : "";

/** The stop hook's event: which items it asked about. */
export function stopEvent(asked: string[]) {
  if (!ON) return;
  try { mkdirSync(telemetryDir(), { recursive: true }); appendFileSync(join(telemetryDir(), `stop-${run}.jsonl`), `${JSON.stringify({ ...base(), tool: "stop", asked })}\n`); } catch {}
}
