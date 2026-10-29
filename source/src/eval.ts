// evaluate(): runs the agent's JavaScript in the open game's page and returns what it returns as short text, the
// three.js counterpart of Blender's execute code tool. The code is an async function body with scene (the main scene,
// the one with the most children), camera, renderer, find(name), stats(target, opts) (__harness.stats from
// inject/geometry.js), realNow() (real milliseconds: performance.now is the harness's clock) and window in scope.
// It steps the clock only while the code awaits a timer or animation frame. Changes made by eval vanish on reload, so put what works into the game's source. THREE is in scope
// when the code names it on an import-map page (the page's own module, so instanceof holds); a bundled (vite) page has no
// bare "three" to import, so there use the constructors of objects already in the scene (`new (find("player").geometry.constructor)()`).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { NOT_GAME, printedLines, uniq, type Game } from "./browser.ts";
import { FIRST } from "./look.ts";

export interface EvalResult { text: string; failed?: true; stepped?: number; saved?: { path: string; bytes: number } }

const EVAL_CHARS = 2_048; // the same cap as observe; agents act on little of what tools return
const HEAD = 1_500;

// Runs in the page: turns the returned value into text there, so a stray `return scene` never crosses as a dump.
// JSON.stringify calls toJSON before the replacer sees a value (Object3D.toJSON is the whole scene), so the replacer
// looks at the raw value on its holder, this[k].
export const FORMAT = `(v) => {
  if (typeof v === "string") return v;
  if (v?.kind === "stats" && Array.isArray(v.meshes)) {
    const n = x => x.toLocaleString("en-US");
    const lines = v.meshes.map(m => [m.name || "(" + m.type + ")", n(m.vertices) + " v", n(m.triangles) + " tri",
      m.instances != null ? n(m.instances) + " instances" : null,
      m.closed ? "closed" : "open (" + m.openEdges + " edges)",
      m.volume != null ? "vol " + m.volume : null, m.genus != null ? "genus " + m.genus : null,
      m.parts > 1 ? m.parts + " parts" : null,
      "size " + m.bounds.size.join("×"), "[" + m.attributes.map(a => a.split(":")[0]).join(", ") + "]"].filter(x => x != null).join("  "));
    lines.unshift("total  " + n(v.total.meshes) + " meshes  " + n(v.total.vertices) + " v  " + n(v.total.triangles) + " tri");
    if (v.cut) lines.push("… " + v.cut + " meshes");
    return lines.join("\\n");
  }
  const seen = new WeakSet();
  const s = JSON.stringify(v, function (k, x) {
    const o = this[k];
    if (typeof o === "number") return Number.isInteger(o) ? o : Number.isFinite(o) ? +o.toFixed(3) : String(o); // JSON writes NaN as null
    if (typeof o === "bigint") return o + "n";
    if (typeof o === "function") return "<function " + (o.name || "anonymous") + ">";
    if (o && typeof o === "object") {
      if (o.isObject3D || o.isBufferGeometry || o.isMaterial || o.isTexture) return "<" + (o.type || o.constructor?.name) + (o.name ? " " + o.name : "") + ">";
      if (o instanceof Map || o instanceof Set) return { ["<" + o.constructor.name + " " + o.size + ">"]: [...o] };
      if (o instanceof Error) return "<" + o.name + ": " + o.message + ">";
      if (o instanceof RegExp) return String(o);
      if (o.nodeType === 1) return "<" + o.localName + (o.id ? "#" + o.id : "") + ">";
      if (ArrayBuffer.isView(o)) return "<" + o.constructor.name + " " + (o.length ?? o.byteLength) + ">";
      if (seen.has(o)) return "<seen>"; // cycles, and objects already printed
      seen.add(o);
    }
    return x;
  });
  return s ?? String(v);
}`;

// Runs in the page for `save`: the returned value as [base64, MIME type]. The scene loops wrote a local server or a
// Python script to get a baked GLB or a painted mask out of the page.
const SAVE_MAX = 64 * 1024 * 1024;
const SAVE = `async (v) => {
  if (v instanceof HTMLCanvasElement) v = v.toDataURL("image/png");
  else if (typeof OffscreenCanvas !== "undefined" && v instanceof OffscreenCanvas) v = await v.convertToBlob();
  let mime = "application/octet-stream", b64, bytes;
  if (typeof v === "string" && v.startsWith("data:")) {
    const comma = v.indexOf(","), head = v.slice(5, comma), body = v.slice(comma + 1);
    mime = head.split(";")[0] || "text/plain";
    if (head.endsWith(";base64")) b64 = body; else v = new TextEncoder().encode(decodeURIComponent(body));
  }
  if (v instanceof Blob) { mime = v.type || mime; v = await v.arrayBuffer(); }
  if (!b64) {
    bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null;
    if (!bytes) throw new Error("save needs an ArrayBuffer, typed array, Blob, canvas or data URL to write; the code returned " + (v === null ? "null" : typeof v === "object" ? (v.constructor?.name ?? "an object") : typeof v === "string" ? "a string that is not a data URL" : typeof v));
  }
  const size = bytes ? bytes.length : b64.length * 0.75;
  if (size > ${SAVE_MAX}) throw new Error("the result is " + (size / 1048576).toFixed(1) + " MB; save at most 64 MB per eval");
  if (!b64) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); b64 = btoa(s); }
  return [b64, mime];
}`;

let spills = 0;
// the most a pending eval steps the clock: 60 s of game time, or 120 s of real time on a slow scene (under the 180 s
// protocol timeout, so the reply is the harness's own)
const STEP_MAX = 3600, STEP_MS = 120_000;
// what to do instead when eval code waits too long (AA-3D: agents loaded and waited in real time here, then wrote Playwright rigs)
const INSTEAD = "The code keeps running in the page. To let the game run, use `interact` { steps: [{ wait: N }] } and then `look`; for frame cost use `perf`; to time a piece of code use realNow().";

/** Run in the page after guarded() (server.ts) stopped an `eval`'s script with Runtime.terminateExecution: ends the eval's
    evaluate when the task stopped was the code's own after an await (after `import("three")` for THREE, a fetch), which
    would leave it waiting for ever, and is false when the stop cut a clock step short (code that awaited a timer or frame,
    or the game's frame): a stopped script runs no `finally`, so the clock would stay mid-step and frames undrawn. */
export const AFTER_STOP = "window.__harness?.stopEval?.(), window.__clock.paused()";

/** Runs `code` as an async function body in the page and returns its value as text under 2 KB (the full text spills to
    the run folder), followed by up to 5 console log/warn/info lines the code printed and up to 5 console errors raised
    during the call. With `save` (a path under `cwd`), the value is written there as bytes and the reply gives its size. */
export function evaluate(game: Game, code: string, save?: string, cwd = game.root): Promise<EvalResult> {
  const target = save ? resolve(cwd, save) : "";
  if (save && (!relative(cwd, target) || relative(cwd, target).startsWith(".."))) throw new Error(`save: ${save} is outside the project (${cwd}); give a path under it, e.g. assets/baked.glb`);
  return game.queue(async () => {
    const before = game.errors.length, logs = printedLines(game.page);
    let out: string, stepped: number, mime = "", r: [string, number, string] | null;
    try {
      // a const cannot be declared conditionally in the page, so ask first whether "three" imports there
      const three = /\bTHREE\b/.test(code) && await game.page.evaluate(`import("three").then(() => true, () => false)`);
      // camera and renderer come from the first frame drawn: after a reload there is none, and an eval straight after
      // open or feel threw on camera (opinion-9: 4 of 9 agents), so step to one first, as a look does
      if (!await game.page.evaluate("!!__harness.main()?.[1].screen")) await game.page.evaluate(FIRST);
      // Code that awaits a timer or an animation frame waits on the paused clock, which nothing moves: it hung until the
      // 180 s protocol timeout in two AA-3D cells. When the code is still pending and has scheduled a timer or frame,
      // the clock steps a frame at a time until it settles, and the reply says how far it moved. It races stopEval (AFTER_STOP).
      r = await game.page.evaluate(`(() => {
  let stopped = false;
  const stop = new Promise(ok => { window.__harness.stopEval = () => { stopped = true; ok(null); }; });
  return Promise.race([stop, (async () => {
  const h = window.__harness, scene = h.mainScene(),
    view = h.views.get(scene), camera = view?.camera, renderer = view?.renderer ?? h.renderers[0], // a renderer before any frame drew (AA-3D colosseum: getPixelRatio of undefined)
    find = n => scene?.getObjectByName(n), stats = (t, o) => h.stats(t, o), c = window.__clock, realNow = c.realNow;
  ${three ? 'const THREE = await import("three");' : ""}
  const from = c.scheduled(), start = realNow();
  let done = false, value, error, stepped = 0;
  const [, self, mark] = /^\\s*at (?:async )?(.*):(\\d+):\\d+$/.exec(String(new Error().stack).split("\\n")[1]) ?? []; // this script's url, and this line: the code starts two lines down
  (async () => {
${code}
  })().then(v => { value = v; }, e => { error = e; }).finally(() => { done = true; });
  while (!done && !stopped) {
    await (stepped ? c.realTick() : c.realSleep(20)); // a real task between frames lets guarded()'s pings in, without setTimeout's 4 ms clamp
    // checked on every pass: a running clock or a real-time promise skips the stepping below and ran into the 180 s protocol timeout
    if (!done && realNow() - start > ${STEP_MS}) throw new Error("the code still waits after ${STEP_MS / 1000} s of real time; the clock was " + (c.paused() ? "paused" : "running") + ", the code scheduled " + (c.scheduled() - from) + " timers or frames, and the harness stepped " + stepped + " frames. It awaits something real (a fetch, a decode, a real-time promise). " + ${JSON.stringify(INSTEAD)});
    if (done || stopped || !c.paused() || (!stepped && c.scheduled() === from)) continue; // waits on something real (a fetch, a decode)
    if (stepped >= ${STEP_MAX}) throw new Error("the code still waits after the harness stepped the clock " + stepped + " frames (" + (stepped / 60).toFixed(1) + " s of game time), the most one \`eval\` steps. A loop over more frames than that ends here (gpu-4x4-7 kart: a 75 s bot drive), as does one waiting for a state the game never reaches: split a long run into calls under 60 s (the next call carries on where this one left the page; keep what you need on window), or cap the loop and return the state it reached. " + ${JSON.stringify(INSTEAD)});
    window.__harness.skip = true; try { await c.step(1); } finally { window.__harness.skip = false; } stepped++; // no draw, as interact's steps
  }
  if (error) { // the harness learns camera from the first render call
    // puppeteer reports a thrown plain object as "Object" and a cyclic one as nothing: show its JSON, or its keys
    if (typeof error === "object" && !(error instanceof Error)) { let j; try { j = JSON.stringify(error); } catch { j = "{" + Object.keys(error).join(", ") + "} (cyclic)"; } throw new Error("threw object: " + j); }
    if (!view && error instanceof TypeError) error.message += " (camera and renderer are undefined: the page drew no three.js frame in 5 s of stepping)";
    if (error instanceof ReferenceError && /THREE is not defined/.test(error.message)) error.message += " (this page bundles three, so it has no bare \\"three\\" to import: use the constructors of objects in the scene, e.g. new (find(\\"player\\").geometry.constructor)())";
    // find(name) returns undefined for a name not in the scene, and agents read .parent off it (AA-3D 2026-10-15)
    else if (error instanceof TypeError && /reading '(parent|position|children|material|geometry)'/.test(error.message)) error.message += " (find(name) returns undefined for a name not in the scene; list names with scene.children.map(c => c.name))";
    // where it threw, as an agent opens it: up to three frames in the code's lines or the page's own files (#167: one
    // error repeated ten times in a scene loop with nothing but its message)
    const top = +mark + 2, end = top + ${code.split(/\r\n?|\n/).length}, o = location.origin, where = [];
    for (const l of error instanceof Error ? String(error.stack).split("\\n").slice(1) : []) {
      const i = self ? l.indexOf(self + ":") : -1, m = /(https?:\\/\\/\\S+?):(\\d+):(\\d+)\\)?$/.exec(l), u = m?.[1].replace(/[?#].*/, "");
      if (i >= 0) { const [L, C] = l.slice(i + self.length + 1).split(":").map(parseFloat); if (L >= top && L < end) where.push("at line " + (L - top + 1) + ":" + C + " of the eval code"); }
      else if (u?.startsWith(o + "/") && !${NOT_GAME}.test(u.slice(o.length))) where.push("at " + u.slice(o.length + 1).replace(/(^|\\/)$/, "$1index.html") + ":" + m[2] + ":" + m[3]); // a folder serves its index.html
      if (where.length === 3) break;
    }
    throw where.length ? new Error(String(error.message).split("\\n")[0] + "\\n" + where.join("\\n")) : error; // a new Error: a DOMException's message is read-only
  }
  ${save ? `const [b64, mime] = await (${SAVE})(value); return [b64, stepped, mime];` : `return [(${FORMAT})(value), stepped];`}
})()]);
})()`) as [string, number, string] | null;
    } catch (e) {
      const message = String((e as Error)?.message ?? e).split("\n").slice(0, 4).join("\n"); // the message and where it threw
      // the code navigated the page (location.reload(), location.href = …): call() in server.ts puts the game back (#29); a
      // script guarded() stopped (Runtime.terminateExecution) ends its evaluate with V8's bare Internal error: guarded() answers
      if (/Execution context was destroyed|Cannot find context with specified id|\(Runtime\.evaluate\): Internal error/.test(message)) throw e;
      // puppeteer's own advice ("Increase the 'protocolTimeout'…") is nothing the agent can do
      if (/Runtime\.evaluate timed out/.test(message)) return { text: [`eval threw: the code ran past 180 s, the longest one \`eval\` waits for. ${INSTEAD}`, ...logs()].join("\n"), failed: true };
      return { text: [`eval threw: ${message}`, ...logs()].join("\n"), failed: true };
    }
    if (!r) throw new Error("eval stopped by the harness"); // AFTER_STOP ended code stopped after an await: guarded() answers
    [out, stepped, mime] = r;
    let saved: EvalResult["saved"];
    if (save) {
      const data = Buffer.from(out, "base64");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
      saved = { path: target, bytes: data.length };
      out = `Saved ${relative(cwd, target)} (${Math.ceil(data.length / 1024).toLocaleString("en-US")} KB, ${mime})`;
    } else if (out.length > EVAL_CHARS) {
      const path = join(game.runDir, `eval-${++spills}.txt`);
      writeFileSync(path, out);
      out = `${out.slice(0, HEAD)}\n… cut: ${out.length} characters, full result in ${path}\n${out.slice(out.lastIndexOf("\n") + 1).slice(-300)}`;
    }
    const errors = uniq(game.errors.slice(before).map(e => e.split("\n")[0]!), 5).map(e => `errors: ${e}`);
    const clock = stepped ? [`(the code awaited the paused clock, so the harness stepped it ${stepped} frames, ${(stepped / 60).toFixed(2)} s of game time, without drawing, until the code finished)`] : [];
    return { text: [out, ...clock, ...logs(), ...errors].join("\n"), stepped, ...saved && { saved } };
  });
}
