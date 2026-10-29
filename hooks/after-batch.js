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

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { createHash } from "node:crypto";
function fingerprints(cwd, { assets = !1 } = {}) {
  let h = createHash("sha256"), ha = createHash("sha256");
  return sourceFiles(cwd, (path, binary) => {
    if (!binary) {
      h.update(`${path}\x00`), h.update(readFileSync(join(cwd, path))), h.update("\x00");
      return;
    }
    let st = statSync(join(cwd, path)), line = `${path}\x00${st.size}\x00${st.mtimeMs}\x00`;
    if (h.update(line), assets)
      ha.update(line);
  }), { sources: h.digest("hex"), assets: ha.digest("hex") };
}
function sourceFiles(cwd, visit) {
  let real, linked = /* @__PURE__ */ new Set, follow = (path) => {
    try {
      let st = statSync(join(cwd, path));
      if (!st.isDirectory())
        return { dir: !1, file: st.isFile() };
      let to = realpathSync(join(cwd, path)), root = real ??= realpathSync(cwd);
      if (to === root || to.startsWith(root + sep) || linked.has(to))
        return { dir: !1, file: !1 };
      return linked.add(to), { dir: !0, file: !1 };
    } catch {
      return { dir: !1, file: !1 };
    }
  }, walk = (rel) => {
    let entries = readdirSync(join(cwd, rel), { withFileTypes: !0 }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (let e of entries) {
      let path = rel ? `${rel}/${e.name}` : e.name;
      if (SKIP_TOP.has(path) || isStoreCopy(e.name, entries) || /\.md$/i.test(e.name))
        continue;
      let { dir, file } = e.isSymbolicLink() ? follow(path) : { dir: e.isDirectory(), file: e.isFile() };
      if (dir) {
        if (!e.name.startsWith(".") && !SKIP_DIRS.has(e.name))
          walk(path);
      } else if (file)
        visit(path, BINARY.has(extname(e.name).toLowerCase()));
    }
  };
  walk("");
}
var SKIP_DIRS, SKIP_TOP, isStoreCopy = (name, entries) => name === "game-state.js" || name === "physics-worker.js" && entries.some((e) => e.name === "game-state.js"), BINARY, fingerprint = (cwd) => fingerprints(cwd).sources;
var init_fingerprint = __esm(() => {
  SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", "dist", "build"]), SKIP_TOP = /* @__PURE__ */ new Set(["paprika3d", "paprika-loop", "geo.js", "fx.js", "three-runtime.js", "game-contract.json", "game-tests.json", "game-runtime.json", "public/game-runtime.json"]), BINARY = /* @__PURE__ */ new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".avif",
    ".bmp",
    ".ico",
    ".ktx2",
    ".basis",
    ".dds",
    ".hdr",
    ".exr",
    ".glb",
    ".gltf",
    ".bin",
    ".fbx",
    ".obj",
    ".blend",
    ".mp3",
    ".ogg",
    ".wav",
    ".m4a",
    ".mp4",
    ".webm",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".wasm",
    ".zip"
  ]);
});

import { closeSync, existsSync, mkdirSync, openSync, readFileSync as readFileSync2, renameSync, rmSync, statSync as statSync2, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join as join2 } from "node:path";
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
  if (!existsSync(ignore))
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
      closeSync(openSync(lock, "wx"));
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
function noteRun(cwd, fingerprint2, run) {
  return updateState(cwd, (s) => {
    if (s.lastFingerprint !== fingerprint2)
      s.iterations++;
    if (s.lastFingerprint = fingerprint2, run.failing)
      setLastCheck(s, fingerprint2, run.failing);
    s.runs = [...s.runs, run].slice(-MAX_RUNS);
  });
}
function setLastCheck(s, fingerprint2, failing) {
  let before = s.lastCheck?.failing ?? [];
  s.lastCheck = { fingerprint: fingerprint2, failing, changed: before.length !== failing.length || !failing.every((id) => before.includes(id)) };
}
function issueContract(cwd, contractHash, issued) {
  return updateState(cwd, (s) => {
    Object.assign(s, { contractHash, issued, lastFingerprint: null, lastCheck: null, iterations: 0 });
  });
}
function recordRun(r) {
  let end = /* @__PURE__ */ new Date, { cwd: _, ...detail } = r;
  writeFileSync(join2(statSync2(r.picture, { throwIfNoEntry: !1 })?.isDirectory() ? r.picture : dirname(r.picture), "run.json"), JSON.stringify({ ...detail, start: new Date(end.getTime() - r.durationMs).toISOString(), end: end.toISOString() }, null, 2));
}
var MAX_RUNS = 200, LOCK_WAIT_MS = 1e4, LOCK_STALE_MS = 30000, empty = () => ({ contractHash: null, issued: null, lastFingerprint: null, lastCheck: null, iterations: 0, url: null, command: null, server: null, runs: [] }), file = (cwd) => join2(cwd, "paprika3d", "state.json");
var init_state = () => {};

init_fingerprint();
init_state();
import { existsSync as existsSync3, readFileSync as readFileSync4, realpathSync as realpathSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as dirname3, extname as extname2, join as join4, resolve, sep as sep2 } from "node:path";
import { spawnSync } from "node:child_process";
import { json } from "node:stream/consumers";

init_state();
async function askServer(dir, body, s = readState(dir).server) {
  if (!s)
    return null;
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${s.port}/check`, { method: "POST", body: JSON.stringify({ token: s.token, ...body }) });
  } catch {
    return null;
  }
  if (res.status === 500)
    throw Error((await res.json()).error);
  return res.ok ? await res.json() : null;
}

import { closeSync as closeSync2, existsSync as existsSync2, openSync as openSync2, readdirSync as readdirSync2, readFileSync as readFileSync3, readSync, statSync as statSync3 } from "node:fs";
import { dirname as dirname2, join as join3 } from "node:path";
var mtime = (f) => {
  try {
    return statSync3(f).mtimeMs;
  } catch {
    return 0;
  }
};
function sessionRuns(transcript, sessionId, batch = []) {
  if (typeof transcript !== "string" || !existsSync2(transcript))
    return null;
  let sub = join3(dirname2(transcript), sessionId, "subagents"), files = [transcript, ...existsSync2(sub) ? readdirSync2(sub).filter((f) => f.endsWith(".jsonl")).map((f) => join3(sub, f)) : []], ids = /* @__PURE__ */ new Set, runs = /* @__PURE__ */ new Set, named = (json) => {
    for (let m of json.matchAll(/(?:Run folder|Picture): (\/[^"\\]*?\/paprika3d\/runs\/[^"\\/]+)/g))
      runs.add(m[1]);
  };
  for (let c of batch)
    if (c.tool_name.startsWith("mcp__plugin_paprika3d_paprika__"))
      named(JSON.stringify(c.tool_response ?? ""));
  for (let f of files) {
    let text = readFileSync3(f, "utf8");
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
        return readdirSync2(d, { withFileTypes: !0 });
      } catch {
        return [];
      }
    })()) {
      if (found.length >= max || ++seen > 5000)
        return;
      if (e.name.startsWith(".") || SKIP.has(e.name))
        continue;
      let p = join3(d, e.name);
      if (e.isDirectory())
        walk(p, depth + 1);
      else if (SOURCE.test(e.name) && !COPIES.has(e.name) && mtime(p) > since && keep(p))
        found.push(p);
    }
  }(root, 0), found;
}
function sessionBegan(transcript) {
  try {
    let f = String(transcript), head = Buffer.alloc(65536), fd = openSync2(f, "r"), n = readSync(fd, head, 0, head.length, 0);
    closeSync2(fd);
    let at = [...head.toString("utf8", 0, n).matchAll(/"timestamp":"([^"]+)"/g)].map((m) => Date.parse(m[1])).concat(statSync3(f).birthtimeMs).filter((t) => t > 0);
    return at.length ? Math.min(...at) : 0;
  } catch {
    return 0;
  }
}

var FILE_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "NotebookEdit"]), input = await json(process.stdin).catch(() => null);
if (!input)
  process.exit(0);
var calls = input.tool_calls ?? (input.tool_name ? [input] : []), edits = calls.filter((c) => FILE_TOOLS.has(c.tool_name)).map((c) => ({ ref: c.tool_use_id ?? "", file: String(c.tool_input?.file_path ?? c.tool_input?.notebook_path ?? "") })).filter((e) => e.file), shell = calls.filter((c) => c.tool_name === "Bash"), session = input.agent_id ? `${input.session_id}/${input.agent_id}` : String(input.session_id ?? ""), REMIND = "paprika3d: this three.js page has not been opened in this session. `open` runs it in headless Chrome on a paused clock, `look` shows what a viewer sees, and `interact` plays it and returns the state.", THREE = /from\s*["'](?:three|three\/[^"']+|@react-three\/[^"']+)["']|import\s*\(\s*["']three["']|require\(\s*["']three["']\)|["']three["']\s*:|three\.module(?:\.min)?\.js|\/build\/three\./, readOr = (f) => {
  try {
    return readFileSync4(f, "utf8");
  } catch {
    return "";
  }
};
if (!edits.length && !shell.length)
  process.exit(0);
var CONTRACT = process.argv.includes("--contract"), FILE = CONTRACT ? "game-contract.json" : "game-tests.json";
function project(from) {
  for (let d = resolve(from);; d = dirname3(d)) {
    if (existsSync3(join4(d, FILE)) || !CONTRACT && existsSync3(join4(d, "paprika3d", "state.json")))
      return d;
    if (dirname3(d) === d)
      return null;
  }
}
var dir = edits.map((e) => project(dirname3(resolve(input.cwd ?? ".", e.file)))).find(Boolean) ?? project(input.cwd ?? ".");
function deliver(text) {
  let parent = process.env.CLAUDE_PID ? spawnSync("ps", ["-o", "args=", "-p", process.env.CLAUDE_PID], { encoding: "utf8" }).stdout : "";
  if (/(^|\s)(-p|--print)(\s|$)/.test(parent) && !/--input-format[ =]stream-json/.test(parent))
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: input.hook_event_name ?? "PostToolBatch", additionalContext: text } })), process.exit(0);
  console.error(text), process.exit(2);
}
var real = (p) => {
  try {
    return realpathSync2(p);
  } catch {
    return p;
  }
}, projectOf = (run) => real(resolve(run, "..", "..", "..")), runs, opened = () => runs !== void 0 ? runs : runs = sessionRuns(input.transcript_path, String(input.session_id ?? ""), calls)?.map(projectOf) ?? null;
function remind() {
  let mark = join4(tmpdir(), `paprika3d-reminded-${session.replace(/[^\w.-]/g, "_")}`);
  if (existsSync3(mark))
    process.exit(0);
  let cwd = resolve(input.cwd ?? "."), page = (f) => /\.(html|jsx?|tsx?)$/.test(f) && THREE.test(readOr(f)), pages = edits.map((e) => resolve(cwd, e.file)).filter(page), since = !pages.length && shell.length && !cwd.split(sep2).includes("node_modules") ? sessionBegan(input.transcript_path) : 0;
  if (since)
    pages.push(...sourcesSince(cwd, since, page, 1));
  if (!pages.length)
    process.exit(0);
  writeFileSync2(mark, "");
  let roots = [cwd, ...pages.map((p) => dirname3(p))], mine = opened();
  if (!!mine && roots.some((r) => {
    let p = real(r);
    return mine.some((o) => p === o || p.startsWith(o + sep2));
  }))
    process.exit(0);
  deliver(REMIND);
}
if (!dir)
  remind();
var state = readState(dir), saved = existsSync3(join4(dir, FILE));
if (!saved && (!state.server || opened()?.includes(real(dir)) === !1))
  remind();
if (!state.url && !state.command)
  process.exit(0);
var print = fingerprint(dir);
if (state.lastCheck?.fingerprint === print)
  process.exit(0);
var edit = edits.at(-1) ?? { ref: shell.at(-1).tool_use_id ?? "", file: "" }, ref = { ref: edit.ref, file: edit.file ? resolve(input.cwd ?? ".", edit.file) : "", time: (/* @__PURE__ */ new Date()).toISOString(), session }, out = "", err = "", status = 0;
try {
  let r = await askServer(dir, { edit: ref, ...!CONTRACT && { tests: saved, faults: !0 } }, state.server);
  if (r)
    out = JSON.stringify(r);
} catch (e) {
  err = `paprika3d check: ${e.message}`, status = 1;
}
if (!out && !err) {
  if (!saved)
    remind();
  let cli = join4(import.meta.dirname, "../src", `cli${extname2(import.meta.filename)}`), p = spawnSync(process.execPath, [
    cli,
    "check",
    "--cwd",
    dir,
    "--json",
    "--edit-ref",
    ref.ref,
    ...ref.file ? ["--edit-file", ref.file] : [],
    "--edit-time",
    ref.time,
    "--session",
    session
  ], { encoding: "utf8", maxBuffer: 67108864, timeout: 170000, killSignal: "SIGKILL" });
  if ({ stdout: out = "", stderr: err = "", status } = p, p.signal === "SIGKILL")
    out = "", err = `paprika3d check: did not finish in 170 s: a keypoint's page may hang; run \`${CONTRACT ? "check" : "test"}\` to see which`;
}
var changed, report, faults;
if (out.trim())
  ({ changed, text: report, faults } = JSON.parse(out));
else if (err.includes("paprika3d check: game not ready"))
  process.exit(0);
else {
  if (!saved)
    process.exit(0);
  report = err.trim().split(`
`).filter((l) => l.startsWith("paprika3d")).join(`
`) || err.trim() || `paprika3d check exited ${status}`, changed = updateState(dir, (s) => setLastCheck(s, print, [report])).lastCheck.changed;
}
changed &&= saved;
var f = faults?.closed.length || faults?.opened.length ? faults : void 0;
if (!changed && !f)
  process.exit(0);
var after = edit.file ? "edit" : "shell command", was = new Set(state.lastCheck?.failing ?? []), said = CONTRACT ? [] : report.split(`
`).flatMap((l) => {
  let m = /^([✓✗]) ([\w-]+)(?:: (.*))?$/.exec(l);
  return !m ? [] : m[1] === "✗" ? [`${m[2]} ${was.has(m[2]) ? "still fails" : "now fails"} (${m[3]})`] : [`${m[2]} ${was.has(m[2]) ? "now passes" : "still passes"}`];
}), lines = report.split(`
`).filter((l) => !l.startsWith("Frames:") || l.includes("over budget")), checks = !changed ? [] : said.length ? [`game-tests.json after your ${after}: ${said.join("; ")}. \`test\` reruns them.`] : [`${CONTRACT ? "Game contract" : "Saved checks (game-tests.json)"} after your ${after} (the failing ${CONTRACT ? "keypoints" : "checks"} changed):`, ...lines], recheck = !f ? [] : [
  `Fault lines after your ${after}, on the freshly reloaded page, without a picture (a fault that needs play to show is not seen here):`,
  ...f.closed.map((l) => `  closed: ${l}`),
  ...f.opened.map((l) => `  new: ${l}`),
  ...f.open.filter((l) => !f.opened.includes(l)).map((l) => `  still open: ${l}`)
];
deliver([...checks, ...recheck].join(`
`));
