// The game contract: what the user's prompt promises, as keypoints the harness can check (precondition through
// setState, a bounded list of inputs, predicates over observe()). A fresh subagent writes it from the prompt; the harness
// validates and saves it as `<project>/game-contract.json` and keeps its hash in `$PAPRIKA3D_HOME/issued.json`,
// outside the project, so a contract the coding agent edits by hand is refused at load. The agent is never told the hash.
// The same format holds the agent's own saved checks, `<project>/game-tests.json` (`interact` `save`): no prompt or schema,
// any step play() takes, and `interact`'s shorthand for expected values turned into predicates.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { harnessHome } from "./state.ts";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

/** One check over observe(): `path` is dotted (`head.x`, `body.length`, `body.0.x`). */
export interface Predicate { path: string; op: Op; value?: unknown }
/** A Hoare-style triple: set `state`, run `actions` (`interact` steps), step `frames` (default 60), then every `expect` must hold. */
export interface Keypoint { id: string; title: string; state: Record<string, unknown>; actions: Record<string, unknown>[]; frames?: number; expect: Predicate[] }
/** The whole game-contract.json. `schema` mirrors observe(): leaves are type strings, arrays hold one item shape. */
export interface Contract { v: 1; prompt: string; issued: string; schema: Record<string, unknown>; keypoints: Keypoint[]; budget?: Record<string, unknown> }

/** Predicate operators; `exists` takes no value, the rest compare with `value` (`==`/`!=` compare deeply, `in` holds when any of its list is `==`). */
export const OPS = ["==", "!=", "<", "<=", ">", ">=", "in", "exists"] as const;
export type Op = (typeof OPS)[number];

const FILE = "game-contract.json";
const MAX_FRAMES = 600; // bounded: ten seconds at 60 fps per keypoint
/** The page size every game runs at, in CSS pixels; mouse and touch actions use it. */
export const VIEWPORT = { width: 1280, height: 800 };
/** `look` `viewports` presets: [width, height, device pixel ratio]. */
export const VIEWPORTS: Record<string, [number, number, number]> = { phone: [390, 844, 3], tablet: [820, 1180, 2], laptop: [1440, 900, 2], desktop: [1920, 1080, 1] };
const ACTION_KINDS = ["key", "mouse", "touch", "wait", "action"];
// a saved check replays an `interact` call, so it takes every step play() does
const TEST_KINDS = [...ACTION_KINDS, "state", "until", "wheel", "scroll", "resize"];
const TESTS_FILE = "game-tests.json";
const HAND_EDITED = `${FILE} was changed by hand; run \`contract\` again with the user's prompt`;

const issuedFile = () => join(harnessHome(), "issued.json");
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isCount = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;

/** Whether a dotted path resolves in the schema: object keys, then on arrays an index or `length`. */
function inSchema(node: unknown, parts: string[]): boolean {
  if (!parts.length) return true;
  const [p, ...rest] = parts;
  if (Array.isArray(node)) return p === "length" ? !rest.length : /^\d+$/.test(p) && inSchema(node[0], rest);
  return isObj(node) && Object.hasOwn(node, p) && inSchema(node[p], rest);
}

/** Every problem with a contract, each naming its keypoint; empty when it is valid. `tests`: the agent's saved checks,
    which need no prompt or schema and take every `interact` step. */
export function validateContract(c: unknown, { tests = false } = {}): string[] {
  if (!isObj(c)) return ["the contract must be a JSON object"];
  const errs: string[] = [], kinds = tests ? TEST_KINDS : ACTION_KINDS;
  if (c.v !== 1) errs.push("v must be 1");
  if (!tests && (typeof c.prompt !== "string" || !c.prompt.trim())) errs.push("prompt must be the user's prompt");
  // optional here: contracts are written without it and saveContract stamps it
  if (c.issued !== undefined && typeof c.issued !== "string") errs.push("issued must be an ISO time");
  if (c.budget !== undefined && !isObj(c.budget)) errs.push("budget must be an object");
  const schema = c.schema;
  if (!tests && (!isObj(schema) || !Object.keys(schema).length)) errs.push("schema must describe the keys observe() returns");
  if (!Array.isArray(c.keypoints) || !c.keypoints.length) return [...errs, "keypoints must be a non-empty list"];
  const ids = new Set<string>();
  c.keypoints.forEach((k: unknown, i: number) => {
    const at = isObj(k) && typeof k.id === "string" && k.id ? `keypoint "${k.id}"` : `keypoint ${i + 1}`;
    if (!isObj(k)) return errs.push(`${at} must be an object`);
    if (typeof k.id !== "string" || !k.id) errs.push(`${at}: id must be a non-empty string`);
    else if (ids.has(k.id)) errs.push(`${at}: id is used twice`);
    else ids.add(k.id);
    if (typeof k.title !== "string" || !k.title) errs.push(`${at}: title must be a non-empty string`);
    if (!isObj(k.state)) errs.push(`${at}: state must be an object for setState`);
    else if (!tests) for (const key of Object.keys(k.state)) if (!inSchema(schema, [key])) errs.push(`${at}: state key "${key}" is not in schema`);
    if (!Array.isArray(k.actions)) errs.push(`${at}: actions must be a list (may be empty)`);
    else k.actions.forEach((a: unknown, j: number) => {
      const kind = isObj(a) ? kinds.filter(n => n in a) : [];
      if (kind.length !== 1) errs.push(`${at}: action ${j + 1} needs exactly one of ${kinds.join(", ")}`);
      else if (kind[0] === "wait" && !isCount((a as Record<string, unknown>).wait)) errs.push(`${at}: action ${j + 1} wait must be a frame count`);
      else if ((kind[0] === "state" || kind[0] === "until") && !isObj((a as Record<string, unknown>)[kind[0]])) errs.push(`${at}: action ${j + 1} ${kind[0]} must be an object`);
    });
    if (k.frames !== undefined && (!isCount(k.frames) || (k.frames as number) > MAX_FRAMES)) errs.push(`${at}: frames must be 0..${MAX_FRAMES}`);
    if (!Array.isArray(k.expect) || !k.expect.length) return errs.push(`${at}: expect needs at least one predicate`);
    for (const p of k.expect) {
      if (!isObj(p) || typeof p.path !== "string") { errs.push(`${at}: each predicate needs a path`); continue; }
      if (!tests && !inSchema(schema, p.path.split("."))) errs.push(`${at}: expect path "${p.path}" is not in schema`);
      if (!OPS.includes(p.op as Op)) errs.push(`${at}: "${p.path}" op must be one of ${OPS.join(" ")}`);
      else if (p.op !== "exists" && !("value" in p)) errs.push(`${at}: "${p.path}" ${p.op} needs a value`);
      else if (p.op === "in" && !Array.isArray(p.value)) errs.push(`${at}: "${p.path}" in needs a list of values`);
    }
  });
  return errs;
}

/** JSON with object keys sorted at every level, so the hash ignores formatting and key order. */
const canonical = (x: unknown): string =>
  Array.isArray(x) ? `[${x.map(canonical).join(",")}]`
  : isObj(x) ? `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}`
  : JSON.stringify(x);
const hashOf = (c: unknown) => createHash("sha256").update(canonical(c)).digest("hex");

interface Issued { project: string; hash: string; issued: string }
function readIssued(): Issued[] {
  try { const r = JSON.parse(readFileSync(issuedFile(), "utf8")); return Array.isArray(r) ? r : []; } catch { return []; }
}

/** Validates, stamps `issued`, writes `<cwd>/game-contract.json` and records its hash outside the project. */
export function saveContract(cwd: string, contract: Omit<Contract, "issued"> & { issued?: string }): Contract {
  // validate and hash exactly what loadContract will read back (JSON drops undefined keys)
  const c: Contract = JSON.parse(JSON.stringify({ ...contract, issued: new Date().toISOString() }));
  const errs = validateContract(c);
  if (errs.length) throw new Error(`game contract is not valid:\n${errs.join("\n")}`);
  const project = realpathSync(cwd);
  // shortcut: read-modify-write without a lock; two projects issuing in the same millisecond could drop one record
  const records = readIssued().filter(r => r.project !== project);
  records.push({ project, hash: hashOf(c), issued: c.issued });
  mkdirSync(dirname(issuedFile()), { recursive: true });
  writeFileSync(join(project, FILE), JSON.stringify(c, null, 2) + "\n");
  writeFileSync(issuedFile(), JSON.stringify(records, null, 2) + "\n");
  return c;
}

/** Reads `<cwd>/game-contract.json` (or `file`, such as the agent's own game-tests.json); refuses the contract when it
    differs from what was issued here, unless `ci` (no record on CI). Another file has no issued record to check. */
export function loadContract(cwd: string, opts: { ci?: boolean; file?: string } = {}): Contract {
  const project = realpathSync(cwd), file = opts.file ?? FILE;
  const path = join(project, file);
  if (!existsSync(path)) throw new Error(file === FILE ? `no ${FILE} in ${project}; run \`contract\` with the user's prompt` : `no ${file} in ${project}`);
  let c: unknown;
  try { c = JSON.parse(readFileSync(path, "utf8")); } catch (e) { throw new Error(`${file} is not JSON: ${(e as Error).message}`); }
  const rec = opts.ci || file !== FILE ? undefined : readIssued().find(r => r.project === project);
  if (rec && rec.hash !== hashOf(c)) throw new Error(HAND_EDITED);
  const errs = validateContract(c, { tests: file !== FILE });
  if (errs.length) throw new Error(`${file} is not valid:\n${errs.join("\n")}`);
  return c as Contract;
}

/** `interact`'s shorthand for one expected value: a number, string or boolean is ==, [min, max] a range, any other list
    one of its values, null exists. Two numbers are always a range. */
export type Expected = number | string | boolean | null | [min: number, max: number] | (number | string | boolean)[];

/** The predicates a shorthand object (`expect`, `until`) stands for; throws on a value the shorthand cannot hold. */
export function predicates(e: unknown, field = "expect"): Predicate[] {
  if (!isObj(e) || !Object.keys(e).length) throw new Error(`${field} must be an object of dotted paths into observe() and their values, as { score: 1, "player.x": [2.9, 3.1] }`);
  return Object.entries(e).flatMap(([path, v]): Predicate[] => {
    if (v === null) return [{ path, op: "exists" }];
    if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number")) return [{ path, op: ">=", value: v[0] }, { path, op: "<=", value: v[1] }];
    if (Array.isArray(v) && v.length) return [{ path, op: "in", value: v }];
    if (["number", "string", "boolean"].includes(typeof v)) return [{ path, op: "==", value: v }];
    throw new Error(`${field} "${path}": use a number, string or boolean (equal), [min, max] (a range; two numbers are always a range), a list of other values (one of them) or null (exists)`);
  });
}

/** The value at a dotted path (`head.x`, `body.length`, `body.0.x`), or undefined. */
export const pathValue = (o: unknown, path: string) => path.split(".").reduce<any>((v, k) => v?.[k], o);
// a value in a reply line, clipped: a list-valued key (a snake's body, a board) printed whole could fill the reply
export const show = (v: unknown) => { const s = v === undefined ? "nothing" : JSON.stringify(v) ?? String(v); return s.length > 200 ? `${s.slice(0, 200)}…` : s; };

/** Whether the predicate holds for the value at its path; numbers are equal within 1e-6, as setState's are. */
export function holds(p: Predicate, got: unknown): boolean {
  const v = p.value as any, g = got as any;
  const eq = (x: unknown) => typeof g === "number" && typeof x === "number" ? Math.abs(g - x) < 1e-6 : isDeepStrictEqual(got, x);
  return p.op === "exists" ? got !== undefined
    : p.op === "in" ? Array.isArray(v) && v.some(eq)
    : p.op === "==" || p.op === "!=" ? eq(v) === (p.op === "==")
    : got === undefined ? false
    : p.op === "<" ? g < v : p.op === "<=" ? g <= v : p.op === ">" ? g > v : g >= v;
}

const SYM: Record<string, string> = { "!=": "not", "<": "<", "<=": "≤", ">": ">", ">=": "≥" };
/** Each path's verdict over `state`: the value seen, whether every predicate on it holds, and what was expected, as
    `2 to 3` for a range (`want`) and `== true` or `exists` as a condition (`cond`). */
export function verdicts(preds: Predicate[], state: unknown) {
  const by = new Map<string, Predicate[]>();
  for (const p of preds) by.set(p.path, [...by.get(p.path) ?? [], p]);
  return [...by].map(([path, ps]) => {
    const got = pathValue(state, path), lo = ps.find(p => p.op === ">="), hi = ps.find(p => p.op === "<=");
    const want = ps.length === 2 && lo && hi ? `${show(lo.value)} to ${show(hi.value)}`
      : ps.map(p => p.op === "exists" ? "to exist" : p.op === "==" ? show(p.value) : p.op === "in" ? `one of ${(p.value as unknown[]).map(show).join(", ")}` : `${SYM[p.op]} ${show(p.value)}`).join(" and ");
    const cond = want === "to exist" ? "exists" : ps.length === 1 && ps[0]!.op === "==" ? `== ${want}` : want;
    return { path, ok: ps.every(p => holds(p, got)), got, want, cond };
  });
}

/** Writes one `interact` call as a keypoint of `<cwd>/game-tests.json` (made when missing), replacing one of the same id,
    and returns how many checks the file holds. Its leading { state } steps become the keypoint's state (their frames a
    wait after it) and the rest its actions, so it replays the call from a fresh reload. */
export function saveTest(cwd: string, id: string, steps: Record<string, unknown>[], expect: Predicate[]): number {
  const path = join(cwd, TESTS_FILE);
  let c: Record<string, any> = { v: 1, keypoints: [] };
  // a file that is not JSON is the agent's own: refused, never written over
  if (existsSync(path)) try { c = JSON.parse(readFileSync(path, "utf8")); } catch (e) { throw new Error(`${TESTS_FILE} is not JSON (${(e as Error).message}); fix it before saving another check`); }
  const lead = steps.findIndex(s => !isObj(s) || !("state" in s)), n = lead < 0 ? steps.length : lead;
  const state = Object.assign({}, ...steps.slice(0, n).map(s => s.state)), wait = steps.slice(0, n).reduce((t, s) => t + Number(s.frames ?? 1), 0);
  const k: Keypoint = { id, title: id, state, actions: [...wait ? [{ wait }] : [], ...steps.slice(n)], frames: 0, expect };
  c.keypoints = [...(Array.isArray(c.keypoints) ? c.keypoints : []).filter((x: Keypoint) => x?.id !== id), k];
  const errs = validateContract(c, { tests: true });
  if (errs.length) throw new Error(`${TESTS_FILE} would not be valid, so the check was not saved:\n${errs.join("\n")}`);
  writeFileSync(path, JSON.stringify(c, null, 2) + "\n");
  return c.keypoints.length;
}

const EXAMPLE = {
  v: 1, prompt: "Snake on a 20x20 grid that moves one cell per frame, with two portals.",
  schema: { frame: "number: frames since load", score: "number: food eaten", alive: "boolean",
    head: { x: "number: column 0..19", y: "number: row 0..19, up is +y" }, body: [{ x: "number", y: "number" }],
    food: { x: "number", y: "number" }, portals: [{ x: "number", y: "number" }], dir: "string: up | down | left | right" },
  keypoints: [
    { id: "eat-grows", title: "eating food grows the snake by one", frames: 1, actions: [],
      state: { alive: true, score: 0, dir: "right", head: { x: 3, y: 3 }, body: [{ x: 2, y: 3 }, { x: 1, y: 3 }], food: { x: 4, y: 3 } },
      expect: [{ path: "score", op: "==", value: 1 }, { path: "body.length", op: "==", value: 3 }] },
    { id: "turn-up", title: "ArrowUp turns the snake up", frames: 2, actions: [{ key: "ArrowUp" }],
      state: { alive: true, dir: "right", head: { x: 3, y: 3 }, body: [{ x: 2, y: 3 }, { x: 1, y: 3 }], food: { x: 10, y: 10 } },
      expect: [{ path: "dir", op: "==", value: "up" }, { path: "head.y", op: "==", value: 6 }] },
  ],
};

/** What the contract-writing subagent is given: the format, the rules and an example, around the user's prompt. */
export function contractInstructions(prompt: string): string {
  return `Write a game contract for this prompt, as one JSON object. Do not write any game code.

PROMPT:
${prompt}

FORMAT (TypeScript):
interface Contract { v: 1; prompt: string; schema: Schema; keypoints: Keypoint[] }
type Schema = { [key: string]: string | Schema | [Schema | string] }   // mirrors window.__game.observe(); leaves are "type: meaning", arrays hold one item shape
interface Keypoint {
  id: string;                    // unique, kebab-case
  title: string;                 // what the player would notice, e.g. "eating food grows the snake by one"
  state: object;                 // passed to window.__game.setState() on a freshly loaded page; top-level keys must be in schema
  actions: Action[];             // bounded inputs, each advances one frame unless it says frames
  frames?: number;               // frames stepped after the actions, 0..${MAX_FRAMES} (default 60)
  expect: { path: string; op: ${OPS.map(o => `"${o}"`).join(" | ")}; value?: any }[];   // at least one; path is dotted (head.x, body.length, body.0.x)
}
type Action = { key: string; down?: boolean; frames?: number } | { mouse: "click" | "down" | "up" | "move"; x: number; y: number; button?: string }
  | { touch: "start" | "move" | "end"; x: number; y: number } | { wait: number } | { action: string; [arg: string]: any };   // an action reaches __game.act whole, with its arguments
// mouse and touch x, y are page coordinates on a ${VIEWPORT.width}x${VIEWPORT.height} CSS pixels page, the game's canvas filling it

RULES:
- Constructible: setState alone must reach each keypoint's starting point. Set every value the outcome depends on (positions, direction, food, alive), so no keypoint depends on another or on the starting layout.
- Bounded: a fixed, small number of frames. Count them: the game advances exactly one frame per action and per frame stepped.
- Verifiable: every expect.path names a key of observe() that is in schema, with an exact value or a bound. Nothing about looks or feel, and no key that only says something is drawn (visible, glowing, lensed): the game reports it whether or not it is drawn. A scene that is mostly to look at gets few keypoints: its controls and what they change.
- Bounds, not derivations: where the prompt states a number, expect it; elsewhere expect a direction or a generous range (speed > 0, score increased), never a value you had to compute.
- 8 to 20 keypoints, one behaviour each, covering every rule the prompt states (movement, scoring, winning, losing, special mechanics) and its edge cases.
- The schema is also the contract for the game code: the game must expose window.__game = { describe, observe, act, setState } returning exactly these keys.
- Keep the user's prompt verbatim in "prompt". Leave out "issued"; the harness sets it.
- This brief is all you need: do not read the harness's source or any other file, and do not run code to work out values. Write the draft in a few minutes.

EXAMPLE (two of its keypoints):
${JSON.stringify(EXAMPLE, null, 2)}`;
}
