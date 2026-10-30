import { createRequire } from "node:module";
var __create = Object.create;
var { getPrototypeOf: __getProtoOf, defineProperty: __defProp, getOwnPropertyNames: __getOwnPropNames } = Object;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node, __toESMCache_esm, __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= /* @__PURE__ */ new WeakMap : __toESMCache_esm ??= /* @__PURE__ */ new WeakMap, cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  let to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: !0
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: !0,
      configurable: !0,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

import { closeSync as closeSync2, existsSync as existsSync2, mkdirSync, openSync as openSync2, readFileSync as readFileSync2, renameSync, rmSync, statSync as statSync2, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";
function harnessHome() {
  return process.env.PAPRIKA3D_HOME || join2(homedir(), ".paprika3d");
}
function readState(cwd) {
  try {
    return { ...empty(), ...JSON.parse(readFileSync2(file(cwd), "utf8")) };
  } catch {
    return empty();
  }
}
function harnessDir(cwd) {
  let dir = join2(cwd, "paprika3d"), ignore = join2(dir, ".gitignore");
  if (!existsSync2(ignore))
    mkdirSync(dir, { recursive: !0 }), writeFileSync(ignore, `*
`);
  return dir;
}
function updateState(cwd, change) {
  let path = file(cwd);
  harnessDir(cwd);
  let lock = `${path}.lock`, deadline = Date.now() + LOCK_WAIT_MS;
  for (;; )
    try {
      closeSync2(openSync2(lock, "wx"));
      break;
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      try {
        if (Date.now() - statSync2(lock).mtimeMs > LOCK_STALE_MS)
          rmSync(lock, { force: !0 });
      } catch {}
      if (Date.now() > deadline)
        throw Error(`state.json is locked: ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  try {
    let s = readState(cwd);
    return change(s), writeFileSync(`${path}.tmp`, JSON.stringify(s, null, 2)), renameSync(`${path}.tmp`, path), s;
  } finally {
    rmSync(lock, { force: !0 });
  }
}
function noteRun(cwd, fingerprint, run) {
  return updateState(cwd, (s) => {
    if (s.lastFingerprint !== fingerprint)
      s.iterations++;
    if (s.lastFingerprint = fingerprint, run.failing)
      setLastCheck(s, fingerprint, run.failing);
    s.runs = [...s.runs, run].slice(-MAX_RUNS);
  });
}
function setLastCheck(s, fingerprint, failing) {
  let before = s.lastCheck?.failing ?? [];
  s.lastCheck = { fingerprint, failing, changed: before.length !== failing.length || !failing.every((id) => before.includes(id)) };
}
function issueContract(cwd, contractHash, issued) {
  return updateState(cwd, (s) => {
    Object.assign(s, { contractHash, issued, lastFingerprint: null, lastCheck: null, iterations: 0 });
  });
}
function recordRun(r) {
  let end = /* @__PURE__ */ new Date, { cwd: _, ...detail } = r;
  writeFileSync(join2(statSync2(r.picture, { throwIfNoEntry: !1 })?.isDirectory() ? r.picture : dirname2(r.picture), "run.json"), JSON.stringify({ ...detail, start: new Date(end.getTime() - r.durationMs).toISOString(), end: end.toISOString() }, null, 2));
}
var MAX_RUNS = 200, LOCK_WAIT_MS = 1e4, LOCK_STALE_MS = 30000, empty = () => ({ contractHash: null, issued: null, lastFingerprint: null, lastCheck: null, iterations: 0, url: null, command: null, server: null, runs: [] }), file = (cwd) => join2(cwd, "paprika3d", "state.json");
var init_state = () => {};

import { appendFileSync, existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { platform } from "node:os";
import { join as join3, resolve } from "node:path";
function install() {
  if (id)
    return id;
  let f = join3(telemetryDir(), "id");
  try {
    id = readFileSync3(f, "utf8").trim();
  } catch {}
  if (!id)
    id = randomUUID(), mkdirSync2(telemetryDir(), { recursive: !0 }), writeFileSync2(f, id);
  return id;
}
function noteOpen(facts) {
  extra = facts;
}
function event(tool, args, r, ms, schema) {
  if (!FEEDBACK)
    return;
  try {
    let t = r?.content.find((c) => c.type === "text")?.text ?? "", flags = {};
    for (let [k, v] of Object.entries(args ?? {}))
      if (k !== "cwd" && k !== "game")
        flags[k] = schema?.properties?.[k]?.enum?.includes(v) ? v : !0;
    let ok = !!r && !r.isError, error = !ok ? r ? scrub(t) : "threw" : void 0;
    if (last = { tool, flags, ok, ...error && { error } }, !ON)
      return;
    let steps = {};
    for (let s of Array.isArray(args?.steps) ? args.steps : [])
      for (let k of Object.keys(s ?? {}))
        if (KINDS.includes(k))
          steps[k] = (steps[k] ?? 0) + 1;
    let faults = (t.match(/^(Lighting|Surfaces|Surface): (?!not checked)/gm) ?? []).length, pageErrors = Number(/Page errors since the last call \((\d+)\)/.exec(t)?.[1] ?? 0), e = {
      ...base(),
      project: createHash("sha256").update(install() + resolve(String(args?.cwd ?? "."))).digest("hex").slice(0, 12),
      tool,
      ms,
      ok,
      ...error && { error },
      bytes: t.length,
      flags,
      ...Object.keys(steps).length && { steps },
      ...faults && { faults },
      ...pageErrors && { pageErrors },
      .../answered nothing for|without finishing|did not answer/.test(t) && { hung: !0 },
      ...extra
    };
    extra = {}, mkdirSync2(telemetryDir(), { recursive: !0 }), appendFileSync(join3(telemetryDir(), `${run}.jsonl`), `${JSON.stringify(e)}
`);
  } catch {}
}
function reportTool(a, runDir) {
  if (!REPORT_TOOL.inputSchema.properties.kind.enum.includes(a.kind) || typeof a.text !== "string" || !a.text.trim())
    throw Error('kind: "bug", "feedback" or "criticism", and text saying what happened');
  return report(a.kind, a.text, runDir);
}
async function report(kind, text, runDir) {
  if (++reports > 5)
    return "Not sent: at most 5 reports a session. Carry on with the task.";
  let body = JSON.stringify({ id: randomUUID(), ...base(), kind, text: text.slice(0, 2000), last }), copy = join3(runDir ?? telemetryDir(), `report-${Date.now()}.json`);
  try {
    mkdirSync2(runDir ?? telemetryDir(), { recursive: !0 }), writeFileSync2(copy, body);
  } catch {}
  if (await post("/report", body))
    return "Sent to the paprika3d team. Carry on with the task.";
  if (!ON)
    return `Not sent: the team's server did not answer. A copy is in ${copy}. Carry on with the task.`;
  try {
    writeFileSync2(join3(telemetryDir(), `${randomUUID()}.report.json`), body);
  } catch {}
  return `Saved in ${copy}; it is sent when the session stops. Carry on with the task.`;
}
async function installed(client) {
  if (!FEEDBACK)
    return;
  try {
    let f = join3(telemetryDir(), "pinged"), body = JSON.stringify({ ...base(), client: client.slice(0, 64) }), version = "0.3.2";
    if (existsSync3(f) && readFileSync3(f, "utf8") === "0.3.2")
      return;
    if (await post("/install", body))
      writeFileSync2(f, "0.3.2");
  } catch {}
}
function told() {
  return "";
}
function stopEvent(asked) {
  if (!ON)
    return;
  try {
    mkdirSync2(telemetryDir(), { recursive: !0 }), appendFileSync(join3(telemetryDir(), `stop-${run}.jsonl`), `${JSON.stringify({ ...base(), tool: "stop", asked })}
`);
  } catch {}
}
var off, ON = !1, FEEDBACK, URL = "https://paprika3d-telemetry.paprika3d.workers.dev", KEY = "9cf6093e07a2c1cc94161e84dbdb59268440ff04d06b7be9", telemetryDir = () => join3(harnessHome(), "telemetry"), run, KINDS, id = "", base = () => ({ v: 1, at: (/* @__PURE__ */ new Date()).toISOString(), install: install(), run, version: "0.3.2", os: platform(), node: process.versions.node.split(".")[0] }), scrub = (s) => (s.split(`
`)[0] ?? "").replace(/[a-z]+:\/\/\S+/gi, "<url>").replace(/(?:[A-Za-z]:\\|~?\/)[^\s:'"`,)]+/g, "<path>").slice(0, 160), extra, last = null, post = (path, body) => !URL ? Promise.resolve(!1) : fetch(URL + path, { method: "POST", headers: { "content-type": "application/json", "x-paprika3d-key": KEY }, body, signal: AbortSignal.timeout(3000) }).then((r) => r.ok, () => !1), REPORT_TOOL, reports = 0, REPORT_ASK;
var init_telemetry = __esm(() => {
  init_state();
  off = /^(1|true)$/i.test(process.env.DO_NOT_TRACK ?? "") || process.env.PAPRIKA3D_TELEMETRY === "0", FEEDBACK = !off, run = randomUUID().slice(0, 8), KINDS = ["key", "mouse", "wheel", "resize", "scroll", "touch", "wait", "clock", "state", "until", "action"];
  extra = {};
  REPORT_TOOL = {
    name: "send_feedback",
    description: "Sends the paprika3d team a bug, feedback or criticism about the harness itself (not about the user's page): a reply that was wrong or unclear, a tool that hung, errored or got in your way, a check you disagree with, or something you needed and no tool gave. It attaches the last tool call's name, options and error, never the page's code or files. One line back; carry on with the task after it.",
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["bug", "feedback", "criticism"] }, text: { type: "string", description: "What happened and what you expected, in a few sentences (2,000 characters at most)." } }, required: ["kind", "text"] }
  };
  REPORT_ASK = FEEDBACK ? "\nIf a paprika3d reply was wrong, unclear or got in your way, say so once with `send_feedback`." : "";
});

import { existsSync as existsSync4, readFileSync as readFileSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join4, relative, resolve as resolve2 } from "node:path";
import { json } from "node:stream/consumers";

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
var mtime = (f) => {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
};
function sessionRuns(transcript, sessionId, batch = []) {
  if (typeof transcript !== "string" || !existsSync(transcript))
    return null;
  let sub = join(dirname(transcript), sessionId, "subagents"), files = [transcript, ...existsSync(sub) ? readdirSync(sub).filter((f) => f.endsWith(".jsonl")).map((f) => join(sub, f)) : []], ids = /* @__PURE__ */ new Set, runs = /* @__PURE__ */ new Set, named = (json) => {
    for (let m of json.matchAll(/(?:Run folder|Picture): (\/[^"\\]*?\/paprika3d\/runs\/[^"\\/]+)/g))
      runs.add(m[1]);
  };
  for (let c of batch)
    if (c.tool_name.startsWith("mcp__plugin_paprika3d_paprika__"))
      named(JSON.stringify(c.tool_response ?? ""));
  for (let f of files) {
    let text = readFileSync(f, "utf8");
    for (let m of text.matchAll(/"type":"tool_use","id":"([^"]+)","name":"mcp__plugin_paprika3d_paprika__\w+"/g))
      ids.add(m[1]);
    for (let line of text.split(`
`)) {
      let at = line.indexOf('"tool_result"');
      if (at < 0 || line.includes('"tool_result"', at + 1))
        continue;
      let id = /"tool_use_id":"([^"]+)"/.exec(line)?.[1];
      if (!id || !ids.has(id))
        continue;
      named(line);
    }
  }
  return [...runs];
}
var SOURCE = /\.(html?|m?js|jsx|tsx?|css|glsl|vert|frag|wgsl)$/, SKIP = /* @__PURE__ */ new Set(["node_modules", "dist", "build", "paprika3d", "paprika-loop", "Library"]), COPIES = /* @__PURE__ */ new Set(["three-runtime.js", "geo.js", "fx.js", "game-state.js", "physics-worker.js"]);
function sourcesSince(root, since, keep = () => !0, max = 21) {
  let found = [], seen = 0;
  return function walk(d, depth) {
    if (depth > 6)
      return;
    for (let e of (() => {
      try {
        return readdirSync(d, { withFileTypes: !0 });
      } catch {
        return [];
      }
    })()) {
      if (found.length >= max || ++seen > 5000)
        return;
      if (e.name.startsWith(".") || SKIP.has(e.name))
        continue;
      let p = join(d, e.name);
      if (e.isDirectory())
        walk(p, depth + 1);
      else if (SOURCE.test(e.name) && !COPIES.has(e.name) && mtime(p) > since && keep(p))
        found.push(p);
    }
  }(root, 0), found;
}
function sessionBegan(transcript) {
  try {
    let f = String(transcript), head = Buffer.alloc(65536), fd = openSync(f, "r"), n = readSync(fd, head, 0, head.length, 0);
    closeSync(fd);
    let at = [...head.toString("utf8", 0, n).matchAll(/"timestamp":"([^"]+)"/g)].map((m) => Date.parse(m[1])).concat(statSync(f).birthtimeMs).filter((t) => t > 0);
    return at.length ? Math.min(...at) : 0;
  } catch {
    return 0;
  }
}

init_telemetry();
var input = await json(process.stdin).catch(() => null);
if (!input || input.stop_hook_active)
  process.exit(0);
var session = String(input.session_id ?? ""), mark = join4(tmpdir(), `paprika3d-stop-${session.replace(/[^\w.-]/g, "_")}`);
if (existsSync4(mark))
  process.exit(0);
var mine = sessionRuns(input.transcript_path, session)?.filter((r) => existsSync4(r)) ?? [];
if (!mine.length)
  process.exit(0);
var tests = mine.map((run2) => {
  try {
    return { run: run2, ...JSON.parse(readFileSync4(join4(run2, "last-test.json"), "utf8")) };
  } catch {
    return null;
  }
}).filter((t) => t !== null).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), last2 = tests[0], root = last2 && resolve2(last2.run, "..", "..", ".."), changed = root && last2 ? sourcesSince(root, Date.parse(last2.at)).map((p) => relative(root, p)) : [], todo = [], asked = [], ask = (key, line) => {
  todo.push(line), asked.push(key);
};
if (!last2)
  ask("unplayed", "This session opened the game but never played or looked at it (`interact`, `look`).");
else if (changed.length)
  ask("changed", `${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ` and ${changed.length - 5} more` : ""} changed after your last \`interact\` or \`look\`: the final version was never played or seen.`);
if (last2?.faults.length)
  ask("faults", `Your last \`look\` reported:
${last2.faults.map((f) => `  ${f}`).join(`
`)}`);
stopEvent(asked);
if (!todo.length)
  process.exit(0);
writeFileSync3(mark, "");
console.log(JSON.stringify({ decision: "block", reason: `paprika3d notes, once:
- ${todo.join(`
- `)}${ON ? REPORT_ASK : ""}` }));
