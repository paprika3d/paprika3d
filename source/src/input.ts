// act(): drive a game with keys, mouse, touch or its own named actions, frame by frame on the fake clock.
// Input goes in through puppeteer's keyboard, mouse and touchscreen, which send CDP Input.dispatchKeyEvent,
// dispatchMouseEvent and dispatchTouchEvent, so the game sees real trusted events. After each step the clock
// advances by its frames (default 1): a key without `down` is held for those frames and released after them,
// since games that read held keys per frame would otherwise never see it down. A `state` step sets the game up through
// its own setState; an `until` step steps a frame at a time until the state holds. A trace reads chosen paths of
// observe() every frame (a frame callback of its own, as the Motion line's), and `expect` checks the state after.
import type { KeyInput, MouseButton } from "puppeteer-core";
import { NAV_LOST, type Game } from "./browser.ts";
import { FIRST, look, threeUrl } from "./look.ts";
import { predicates, show, verdicts, type Expected } from "./contract.ts";
import { REC_FRAMES, RECORD_MAX_S, startRecording, startVideo, VIDEO_MAX_S, type Clip, type Video } from "./record.ts";

/** One input step; `frames` is how many frames the clock advances after it (default 1). An `action` step reaches
 *  `__game.act` whole, minus `frames`, so it can carry arguments such as `{ action: "swap", from, to }`. */
export type Step = (
  | { key: string; down?: boolean; frames?: number }
  | { mouse: "move" | "down" | "up" | "click" | "dblclick"; x: number; y: number; button?: MouseButton; frames?: number }
  | { mouse: "move"; relative: [dx: number, dy: number]; frames?: number }
  | { wheel: number; x?: number; y?: number; frames?: number }
  | { resize: [width: number, height: number]; frames?: number }
  | { scroll: number | { progress: number } | { to: string }; frames?: number }
  | { touch: "start" | "move" | "end" | "tap"; x: number; y: number; frames?: number }
  | { wait: number }
  | { clock: { timescale?: number; paused?: boolean }; frames?: number }
  | { state: Record<string, unknown>; frames?: number }
  | { until: Record<string, Expected>; max?: number }
  | { action: string; frames?: number; [arg: string]: unknown }) & { draw?: boolean }; // draw: true draws every frame, not only the step's last

/** One traced path: its first and last value, min and max as [value, frame], the first frame it differed from its first,
    and the series thinned to at most 24 evenly spaced points (booleans as 0 and 1). */
export type Trace = { first: number; last: number; min: [number, number]; max: [number, number]; changed: number | null; values: number[] };

/** The game's state before and after the steps (its __game.observe(), or null without one) and what changed, and the
    Motion line when the subject turned or stopped; with `trace`, each path's series and line; with `expect`, its line
    and whether every entry held. */
export interface ActResult { before: unknown; after: unknown; changed: Record<string, unknown>; hint?: string; motion?: string; sound?: string;
  trace?: Record<string, Trace>; traceText?: string; expect?: string; passed?: boolean; framesRun: number; clip?: Clip; video?: Video }

const STATE = "window.__game?.observe ? __game.observe() : null";

// The Motion line: how the subject moved over the steps, from its world pose each frame (a frame callback of its own,
// run after the game's): AA-3D kart-race's one drift test hit a wall and the agent never saw it. y is up; distance and stops
// count all three axes (a player that only climbed or jumped read as stopped), turns are seen from above, positive to the left. Without window.__game.subject, the subject is the object where the state puts its player (the
// shallowest within a few cm), else the best-ranked name, not the first met: AA-3D's AI karts (kart_ruby) were built
// before the player's (player).
const NAMES = ["player", "hero", "avatar", "kart", "car", "vehicle", "ship", "plane", "boat"];
const motionStart = (at: [number, number] | null) => `(() => {
  const s0f = window.__game?.subject, s0 = typeof s0f === "function" ? (() => { try { return s0f(); } catch {} })() : s0f, scene = window.__harness.mainScene(), at = ${JSON.stringify(at)}, NAMES = ${JSON.stringify(NAMES)};
  const o = s0?.isObject3D ? s0 : typeof s0 === "string" ? scene?.getObjectByName(s0) : null;
  let subject = o, best = Infinity;
  if (!subject && at) { scene.updateMatrixWorld(); scene.traverse(x => { if (x === scene || x.isLight || x.isCamera || !x.isMesh && !x.children.length) return;
    const e = x.matrixWorld.elements, d = Math.hypot(e[12] - at[0], e[14] - at[1]); let depth = 0; for (let q = x; q.parent; q = q.parent) depth++;
    if (d < Math.max(0.05, 0.002 * Math.hypot(...at)) && depth < best) { best = depth; subject = x; } }); }
  let rank = NAMES.length;
  if (!subject) scene?.traverse(x => { const i = NAMES.findIndex(n => x.name?.toLowerCase().startsWith(n)); if (i >= 0 && i < rank) { rank = i; subject = x; } });
  // each sample updates the subject's world matrix first: a pose set since the last render is not in it yet
  let f = 0; // frames from the start of the steps, as trace and until count (opinion-4: 7 of 9 saw two counts)
  const samples = [], sample = () => { subject.updateWorldMatrix(true, false); const e = subject.matrixWorld.elements; samples.push([e[12], e[13], e[14], f]); };
  let on = !!subject;
  const tick = () => { f++; if (on) { sample(); requestAnimationFrame(tick); } };
  // no frame drawn yet (a save's or an edit's reload, or straight after open): a pose the loop sets each frame is not in
  // the scene until frame 1, and sampling the pose before it added a false first step (#176: 4.34 units for a 4-unit run)
  if (on) { if (window.__harness.main()?.[1].screen) sample(); requestAnimationFrame(tick); }
  window.__harnessMotion = { end: () => { on = false; delete window.__harnessMotion; return subject ? { name: subject.name || subject.type, samples } : null; } };
})()`;

/** Where the state puts its player: the best-ranked NAMES key holding { x, z }, { position: { x, z } } or { position: [x, y, z] }. */
function statePos(state: unknown): [number, number] | null {
  if (!state || typeof state !== "object") return null;
  const keys = Object.keys(state);
  for (const n of NAMES) for (const k of keys) if (k.toLowerCase().startsWith(n)) {
    const v = (state as Record<string, any>)[k], q = Array.isArray(v?.position) ? { x: v.position[0], z: v.position[2] } : v?.position ?? v;
    if (typeof q?.x === "number" && typeof q?.z === "number") return [q.x, q.z];
  }
  return null;
}

/** The Motion line from the subject's samples ([x, y, z, frame]), or undefined when it went straight and kept moving. */
/** `released`: the frame the steps' last key went up; a stop from that frame on is the release, not a wall (#69). */
export function motionText(m: { name: string; samples: number[][] } | null, released?: number): string | undefined {
  const TURN = 15; // degrees; a first guess
  if (!m || m.samples.length < 3) return;
  const s = m.samples, wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const seg = s.slice(1).map((b, i) => { const a = s[i]!, dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, dz = b[2]! - a[2]!;
    return { d: Math.hypot(dx, dy, dz), h: Math.hypot(dx, dz), dir: Math.atan2(-dx, -dz), at: b }; });
  const path = seg.reduce((t, g) => t + g.d, 0), most = Math.max(...seg.map(g => g.d)), flat = Math.max(...seg.map(g => g.h));
  if (!path || most < 1e-6) return;
  const moving = seg.filter(g => g.h > 0.2 * flat && g.h > 1e-6);
  const turn = Math.round(moving.slice(1).reduce((t, g, i) => t + wrap(g.dir - moving[i]!.dir), 0) * 180 / Math.PI);
  const last = seg.findLastIndex(g => g.d > 0.05 * most), stopped = seg.filter(g => g.d > 0.2 * most).length >= 5 && last < seg.length - 10 && !(released !== undefined && seg[last]!.at[3]! >= released) ? seg[last]!.at[3] : null; // moved over 5 frames or more, then still for 10 or more (a one-frame step is not a stop)
  const out: string[] = [];
  if (Math.abs(turn) >= TURN) out.push(`its direction of travel turned ${Math.abs(turn)}° ${turn > 0 ? "left" : "right"}`);
  if (stopped !== null) out.push(`it stopped at frame ${stopped} and did not move again`);
  if (!out.length) return;
  // the path's length and the straight line, apart: a box hopping in place "moved 23 units" (opinion-5, feel-4)
  const a = s[0]!, b = s.at(-1)!, net = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
  return `Motion (${m.name}): travelled ${+path.toPrecision(3)} units${+net.toPrecision(3) === +path.toPrecision(3) ? "" : ` (${+net.toPrecision(3)} from start to end)`}, ${out.join("; ")}.`;
}

/** Leaves of `after` that differ from `before`, nested like `after`; arrays compare whole. */
export function diff(before: unknown, after: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!after || typeof after !== "object" || Array.isArray(after)) return out;
  const b = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(after)) {
    if (v && typeof v === "object" && !Array.isArray(v) && b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
      const d = diff(b[k], v);
      if (Object.keys(d).length) out[k] = d;
    } else if (JSON.stringify(v) !== JSON.stringify(b[k])) out[k] = v;
  }
  return out;
}

// sounds the page has started (Web Audio sources and media play(), counted by devtools.js): headless Chrome plays
// nothing an agent can hear, so the count is how it knows a sound fired (gpu-4x4-5 kart: music added, never heard)
// with the sfx preset names fx.js pushed to __harness.sounds since, when it played any (build-review-1, #85)
const AUDIO = "[window.__harness?.audio ?? 0, window.__harness?.sounds?.length ?? 0]";
/** The Sound line: how many sounds the steps started, and the names of those that have one, only for a page that has started one. */
export const soundText = (before: number, after: number, names: string[] = []) => !after ? "" : after > before
  ? `Sound: ${after - before} started during these steps${names.length ? ` (${names.join(", ")})` : ""}.` : `Sound: none started during these steps (${after} since load).`;

// The trace: each path read from observe() every frame, after the game's own frame callback, as the Motion sampler is;
// row 0 is the state before the first frame. Numbers, strings, booleans and null are kept, a missing path as {} and
// anything else as { type } (build-review-1, #76: a null or string state read "a object").
const TRACE_MAX = 600;
const traceStart = (paths: string[]) => `(() => {
  const paths = ${JSON.stringify(paths)}, rows = [], get = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
  const sample = () => { let s; try { s = window.__game?.observe?.(); } catch {}
    rows.push(paths.map(p => { const v = get(s, p); return v === null || ["number", "string", "boolean"].includes(typeof v) ? v : v === undefined ? {} : { type: typeof v }; })); };
  let on = true;
  const tick = () => { if (on && rows.length <= ${TRACE_MAX}) { sample(); requestAnimationFrame(tick); } };
  sample(); requestAnimationFrame(tick);
  window.__harnessTrace = { end: () => { on = false; delete window.__harnessTrace; return rows; } };
})()`;

const num = (v: number) => +v.toPrecision(4);
/** One path's Trace and line from its column of samples (frame = index; undefined where the path is missing, { type } for
    an object), or only a line when it cannot be traced; a column of strings or nulls gets its runs alone. */
export function traceOf(path: string, col: unknown[]): { trace?: Trace; line: string } {
  // a path that appears later (an item spawned mid-play) is traced from its first frame (feel-3, feel-2)
  const f0 = col.findIndex(v => v !== undefined);
  if (f0 > 0 && col.slice(f0).every(v => v !== undefined)) {
    const r = traceOf(path, col.map(v => v === undefined ? col[f0] : v));
    return { ...r, line: r.line.replace(`${path}: `, `${path} (in observe() from frame ${f0}): `) };
  }
  const frames = col.length - 1, gone = col.indexOf(undefined), odd = col.find(v => v !== null && typeof v === "object") as { type: string } | undefined;
  if (gone >= 0) return { line: `${path}: not in observe()${f0 >= 0 ? ` at frame ${gone}` : ""}` };
  if (odd) return { line: `${path}: ${/^[aeiou]/.test(odd.type) ? "an" : "a"} ${odd.type}, not a number, string or boolean` };
  // runs: `grounded: true until frame 3, false until frame 44, then true`, and `standing: null until frame 23, "mover1" until frame 60, then null`
  const runs = col.flatMap((v, f) => f && v === col[f - 1] ? [] : [f]);
  const shown = runs.slice(0, 8).map((f, j) => runs[j + 1] !== undefined ? `${show(col[f])} until frame ${runs[j + 1]}` : `then ${show(col[f])}`);
  const runsLine = runs.length === 1 ? `${path}: ${show(col[0])} throughout the ${frames} frames` : `${path}: ${shown.join(", ")}${runs.length > 8 ? `, … (${runs.length - 1} changes)` : ""}`;
  if (!col.every(v => typeof v === "number" || typeof v === "boolean")) return { line: runsLine };
  const xs = col.map(Number), first = xs[0]!, last = xs.at(-1)!, i = xs.findIndex(v => v !== first);
  const lo = xs.indexOf(Math.min(...xs)), hi = xs.indexOf(Math.max(...xs)), k = Math.min(24, xs.length);
  const trace: Trace = { first, last, min: [xs[lo]!, lo], max: [xs[hi]!, hi], changed: i < 0 ? null : i,
    values: Array.from({ length: k }, (_, j) => num(xs[Math.round(j * frames / Math.max(1, k - 1))]!)) };
  if (typeof col[0] === "boolean") return { trace, line: runsLine };
  if (i < 0) return { trace, line: `${path}: ${num(first)} throughout the ${frames} frames` };
  // the extremes beyond where it started and ended, in frame order, then the frame it reached its last value for good
  const ends = [...new Set([lo, hi])].filter(f => xs[f]! < Math.min(first, last) || xs[f]! > Math.max(first, last)).sort((a, b) => a - b);
  let settled = frames; while (settled > 0 && xs[settled - 1] === last) settled--;
  const via = ends.map(f => ` → ${f === hi ? "peak" : "low"} ${num(xs[f]!)} at frame ${f}`).join("");
  return { trace, line: `${path}: ${num(first)}${via} → ${num(last)} at frame ${settled}; first changed at frame ${i}` };
}

/** The Expect line: each entry with the value after the steps, ✓ or ✗ with what was expected. */
const expectText = (vs: ReturnType<typeof verdicts>) => `Expect: ${vs.map(v => `${v.path} ${show(v.got)} ${v.ok ? "✓" : `✗ expected ${v.want}`}`).join(" · ")}`;

/** `record`: the steps after the leading { state } ones play in real time, recorded as a clip; "video": they play on the
    paused clock, every frame filmed (record.ts). */
export interface ActOptions { trace?: string[]; expect?: Record<string, Expected>; record?: boolean | "video" }
export const KINDS = ["key", "mouse", "wheel", "resize", "scroll", "touch", "wait", "clock", "state", "until", "action"];
// each kind's fields, from Step; an action step passes any field to __game.act
const FIELDS: Record<string, string[]> = { key: ["key", "down", "frames"], mouse: ["mouse", "x", "y", "button", "relative", "frames"],
  wheel: ["wheel", "x", "y", "frames"], resize: ["resize", "frames"], scroll: ["scroll", "frames"], touch: ["touch", "x", "y", "frames"],
  wait: ["wait"], clock: ["clock", "frames"], state: ["state", "frames"], until: ["until", "max"] };
for (const f of Object.values(FIELDS)) f.push("draw");
/** A step's kind, as play() picks it (action first). */
const kindOf = (s: object) => ["action", ...KINDS].find(k => k in s)!;
/** A field the step's kind does not take: { key, frame: 20 } played one frame (opinion-7). */
const stray = (s: object) => { const k = kindOf(s);
  const f = k === "action" ? undefined : Object.keys(s).find(f => !FIELDS[k]!.includes(f));
  return f && `step ${JSON.stringify(s)}: ${k} steps take ${FIELDS[k]!.join(", ")}; "${f}" is not one; nothing was played`; };
const isSetup = (s: unknown) => !!s && typeof s === "object" && "state" in s;

/** Refuses, before anything plays, steps a recording cannot play: over RECORD_MAX_S of fixed frames (VIDEO_MAX_S for a
    video; an until stops at the deadline instead), none that runs a frame (a 0.02 s clip of one picture read "0 game
    frames, 0 ms apart"), or a clock step that pauses or resumes, which would stop the clip's clock or run the video's. */
function recordable(steps: Step[], video: boolean) {
  const max = video ? VIDEO_MAX_S : RECORD_MAX_S, kind = video ? "a video" : "a recording";
  const fixed = steps.reduce((t, s) => t + ("until" in s ? 0 : "wait" in s ? Math.max(0, Number(s.wait) || 0) : "frames" in s && s.frames !== undefined ? Math.max(0, Number(s.frames) || 0) : 1), 0);
  if (!fixed && !steps.some(s => "until" in s)) throw new Error(`record: no step after the leading { state } steps runs a frame, so there is nothing to ${video ? "film" : "play in real time"}; add a { wait: frames } or a key held for frames; nothing was played`);
  if (fixed > max * 60) throw new Error(`record: the steps run ${fixed} frames, ${(fixed / 60).toFixed(1)} s ${video ? "of game time" : "in real time"}; ${kind} is ${max} s at most (${max * 60} frames); nothing was played`);
  if (steps.some(s => "clock" in s && typeof s.clock === "object" && s.clock && "paused" in s.clock)) throw new Error(video ? "record: a video steps the paused clock one filmed frame at a time, so a clock step takes timescale only; nothing was played" : "record: the clock runs in real time while recording, so a clock step takes timescale only; nothing was played");
}

/** Runs the steps in order on the page's queue and returns the state before and after, with the changed keys. Leading
    { state } steps set the scene up: the Motion line and the trace start after them, so a setup jump is never motion. */
export function act(game: Game, steps: Step[], { trace, expect, record }: ActOptions = {}): Promise<ActResult> {
  return game.queue(async () => {
    // all checked before any input, so a typo costs no play: an unknown step thrown mid-loop left the earlier ones played (opinion-4)
    const bad = Array.isArray(steps) ? steps.find(s => !s || typeof s !== "object" || !KINDS.some(k => k in s)) : undefined;
    if (bad !== undefined) throw new Error(`unknown step ${JSON.stringify(bad)}: each step has one of ${KINDS.join(", ")}; nothing was played`);
    const wrong = Array.isArray(steps) ? steps.map(stray).find(Boolean) : undefined;
    if (wrong) throw new Error(wrong);
    if (trace !== undefined && !(Array.isArray(trace) && trace.length && trace.length <= 6 && trace.every(p => typeof p === "string" && p)))
      throw new Error('trace: 1 to 6 dotted paths into observe(), as ["player.y", "coins.0.x"]');
    const want = expect === undefined ? null : predicates(expect);
    if (record && Array.isArray(steps)) recordable((i => i < 0 ? [] : steps.slice(i))(steps.findIndex(s => !isSetup(s))), record === "video"); // the leading state steps play paused
    // a recording straight after open or a reload would start on the undrawn frame 0 (black): one frame first, as look draws
    // (a video's first picture is of its first stepped frame, drawn)
    if (record === true) await game.page.evaluate(FIRST);
    const before = await game.page.evaluate(STATE), [heard, named] = await game.page.evaluate(AUDIO) as [number, number];
    const n = Array.isArray(steps) ? (i => i < 0 ? steps.length : i)(steps.findIndex(s => !isSetup(s))) : 0;
    const setup = n ? await run(game, steps.slice(0, n)) : { frames: 0 };
    await game.page.evaluate(motionStart(statePos(n ? await game.page.evaluate(STATE) : before))).catch(() => {});
    if (trace) await game.page.evaluate(traceStart(trace));
    const played = n ? steps.slice(n) : steps;
    let clip: Clip | undefined, video: Video | undefined, hint: string | undefined, frames: number, released: number | undefined;
    // the stable build has no video (server.ts); the channel test folds at build time, so its bundle holds no mp4-muxer
    if (process.env.PAPRIKA3D_CHANNEL !== "stable" && record === "video") {
      const film = await startVideo(game);
      try { ({ hint, frames, released } = await run(game, played, undefined, n, film.frame)); }
      catch (e) {
        // the video up to the failed step is still kept, and said (none after a navigation: stop() throws then)
        const v = await film.stop().catch(() => null);
        if (v && e instanceof Error) e.message += `\nrecord: the video ends at the failed step: ${v.path} (${v.seconds} s), four moments of it: ${v.strip}.`;
        throw e;
      }
      video = await film.stop();
    } else if (record) {
      const stop = await startRecording(game);
      // the clock is paused again whatever happens to the steps: a later call finds it as every other call leaves it
      // (a step that navigates is not followed while recording: the call fails as a navigation, from run() or stop()'s
      // REC_NAVIGATED, and answer() runs it again)
      try { ({ hint, frames, released } = await run(game, played, Date.now() + RECORD_MAX_S * 1000)); }
      catch (e) {
        // the clip up to the failed step is still kept, and said (none after a navigation: stop() throws then)
        const c = await stop().catch(() => null);
        if (c && e instanceof Error) e.message += `\nrecord: the clip ends at the failed step: ${c.path} (${c.seconds} s), four moments of it: ${c.strip}. The clock is paused again.`;
        throw e;
      }
      clip = await stop();
      frames = clip.gameFrames;
    } else ({ hint, frames, released } = await run(game, played, undefined, n));
    const motion = motionText(await game.page.evaluate("window.__harnessMotion?.end() ?? null").catch(() => null) as Parameters<typeof motionText>[0], released);
    const rows = trace ? await game.page.evaluate("window.__harnessTrace?.end() ?? []") as unknown[][] : [];
    const after = await game.page.evaluate(STATE), end = await game.page.evaluate(`({ audio: window.__harness?.audio ?? 0, names: window.__harness?.sounds?.slice(${named}) ?? [] })`) as { audio: number; names: string[] };
    const sound = soundText(heard, end.audio, end.names);
    const traced = trace?.map(p => [p, traceOf(p, rows.map(r => (c => c && typeof c === "object" && !("type" in c) ? undefined : c)(r[trace.indexOf(p)])))] as const);
    const vs = want && verdicts(want, after);
    return { before, after, changed: diff(before, after), framesRun: setup.frames + frames, ...(clip && { clip }), ...(video && { video }), ...(hint ? { hint } : {}), ...(motion ? { motion } : {}), ...(sound ? { sound } : {}),
      ...(traced && { trace: Object.fromEntries(traced.flatMap(([p, t]) => t.trace ? [[p, t.trace]] : [])),
        traceText: `${rows.length > TRACE_MAX ? `Trace (the first ${TRACE_MAX} frames):\n` : ""}${traced.map(([, t]) => t.line).join("\n")}` }),
      ...(vs && { expect: expectText(vs), passed: vs.every(v => v.ok) }) };
  });
}

// The Scroll line: the window's scroll, then the smooth-scroll libraries found with their own progress. Lenis is found
// only as an instance kept on window, and drei's ScrollControls by its scroll element beside the canvas, which a window
// scroll does not move.
const SCROLL = `(() => {
  const pct = n => Math.round(n * 100) + "%", max = document.documentElement.scrollHeight - innerHeight, y = Math.round(scrollY);
  const out = [\`Scroll: \${y} of \${max} px (\${pct(max > 0 ? y / max : 0)})\`];
  let lenis = false;
  for (const k of Object.keys(window)) { let v; try { v = window[k]; } catch { continue; }
    if (typeof v?.targetScroll === "number" && typeof v.animatedScroll === "number") { lenis = true; out.push(\`Lenis (window.\${k}): target \${Math.round(v.targetScroll)} px, at \${Math.round(v.animatedScroll)} px\`); } }
  if (window.lenisVersion && !lenis) out.push(\`Lenis \${window.lenisVersion}: its instance is not on window, so its progress is unknown\`);
  const st = window.ScrollTrigger?.getAll?.() ?? [];
  if (st.length) out.push(\`ScrollTrigger: \${st.length} triggers at \${st.slice(0, 8).map(t => pct(t.progress)).join(", ")}\`);
  const c = __harness.canvas(), el = c && [...c.parentElement?.children ?? []].find(e => e !== c && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1);
  if (el) out.push(\`drei ScrollControls: its own scroll element at \${pct(el.scrollTop / (el.scrollHeight - el.clientHeight))}, which a window scroll does not move\`);
  return out.join("; ");
})()`;

/** How long a saved check or a state step waits for window.__game after a reload: boot ends once a page with a renderer
    asks for frames and goes quiet, and a game that installs __game after an async init (await renderer.init(), its
    loads) had none yet when the after-edit hook's check called setState (Backrooms, #136). */
export const GAME_WAIT_S = 5;
/** What a wait in vain says: it steps no frame, so a __game the page sets in its animation loop or after awaiting a frame
    is not missing, only not there yet; "has no window.__game.setState 5 s after the reload" blamed the game (batch 3 review). */
export const GAME_LATE = `after ${GAME_WAIT_S} s with no frame stepped (a __game set in the animation loop or after a frame comes only once a frame runs)`;
/** Waits up to GAME_WAIT_S of real time, no frame stepped, until window.__game has each of `keys`; whether it does. */
export const gameUp = (game: Game, keys: string[]) => game.page.evaluate(`(async (keys) => { const up = () => keys.every(k => window.__game?.[k]);
  for (const end = __clock.realNow() + ${GAME_WAIT_S * 1000}; !up() && __clock.realNow() < end;) await __clock.realSleep(20); return up(); })(${JSON.stringify(keys)})`)
  .catch(() => false) as Promise<boolean>;

/** Rethrows puppeteer's "Unknown key" with the names it takes, which its own text leaves out. */
const keyHint = (e: Error): never => { throw e.message.startsWith("Unknown key") ? new Error(`${e.message}; use KeyboardEvent.key names (ArrowRight, a, " " for space, Enter)`) : e; };

/** Runs the steps in order on the page's queue, without reading the state around them (a keypoint reads its own:
    two observe() round trips a keypoint saved). Returns a hint when a drawn wait was slow or a pointer step missed the canvas. */
export const play = (game: Game, steps: Step[]) => run(game, steps).then(r => r.hint);
/** play(), with the frames the steps ran: an until step runs to its held frame (build-review-1, #77). With `deadline`
    (real ms, for `record`), the clock is running: each frame a step advances is 1/60 s of real time, an until reads the
    state each 1/60 s, and steps not started by the deadline are not played. A step that sends the page to another URL
    is followed: the steps after it run on the new document; `offset` is the steps before these in the agent's list. With
    `film` (for a video), every frame is drawn, one evaluate each, and filmed after it. */
function run(game: Game, steps: Step[], deadline?: number, offset = 0, film?: () => Promise<void>): Promise<{ hint?: string; frames: number; released?: number }> {
  return game.queue(async () => {
    // the tool descriptions show a step ({ key, ... }) first, and agents sent one without the steps array around it
    if (!Array.isArray(steps)) throw new Error('steps must be an array of steps, as in { steps: [{ key: "ArrowRight", frames: 5 }] }');
    const { page } = game;
    // in evaluates of at most 10 frames: one evaluate of 215 frames at 0.7 s a frame (a heavy scene in software WebGL)
    // ran past puppeteer's 180 s protocol timeout and failed the call in an AA-3D excavator cell
    let frame = 0, released: number | undefined; // frames stepped so far, for the until lines; the frame the last key went up
    // All but a step's last frame run without drawing (devtools.js's skip: the game's logic runs, three's draw does not),
    // unless the step says draw: true: a drawn 230-frame wait took 80 s under software WebGL in an AA-3D cell, and a
    // tester's full-race `until` runs took 2 minutes drawn (2026-10-20). Trails and progressive rendering build up over
    // drawn frames, so a picture after skipped ones differs: that is what draw: true is for.
    const SKIP = (k: number) => `(async () => { __harness.skip = true; try { await __clock.step(${k}); } finally { __harness.skip = false; } })()`;
    const real = deadline !== undefined, wall = (ms: number) => new Promise(r => setTimeout(r, Math.max(0, Math.min(ms, deadline! - Date.now()))));
    const step = async (n: number, draw = false) => {
      // in real time, the frames the game actually ran (a slow page runs fewer than 1/60 s each), as the clip counts them
      if (real) { const k = Math.max(0, Math.floor(n)); if (k) { await wall(k * 1000 / 60); frame = Math.max(frame, await page.evaluate(REC_FRAMES).catch(() => 0) as number); } return; }
      if (film) { for (let k = Math.max(0, Math.floor(n)); k > 0; k--) { await page.evaluate("__clock.step(1)"); frame++; await film(); } return; }
      for (let left = Math.max(0, Math.floor(n)); left > 0;) {
        const k = Math.min(left, 10), skipped = draw ? 0 : left > k ? k : k - 1;
        if (skipped) await page.evaluate(SKIP(skipped));
        if (k > skipped) await page.evaluate(`__clock.step(${k - skipped})`);
        left -= k; frame += k;
      }
    };
    const untils: string[] = [];
    let slow = 0; // the longest wait drawn on request that took over 20 s
    // a point over another element than the canvas: an opacity-0 #loading div took an AA-3D agent's clicks for 50 calls
    // while it rewrote its input code, sure the game ignored a plain click
    // and the object under it in the scene, which agents otherwise worked out from boxes in a picture
    const missed = new Map<string, string>(), over = new Map<string, string>();
    let three: string | undefined, scrolled = false;
    const aim = async (kind: string, x: number, y: number, dom = true) => {
      three ??= threeUrl(game, String(await page.evaluate("__harness.revision")));
      // a visible control under the pointer ("" from hit) took the click: nothing to say, and nothing in the scene under it
      const [on, at] = await page.evaluate(`(async () => { const on = ${dom} && __harness.hit(${+x}, ${+y}); return [on, on === "" ? null : await __harness.pick(${+x}, ${+y}, ${JSON.stringify(three)})]; })()`)
        .catch(() => [null, null]) as [string | null | false, string | null];
      if (on && !missed.has(on)) missed.set(on, `${kind} at (${x}, ${y})`);
      if (at && !over.has(at.split(" (")[0]!)) over.set(at.split(" (")[0]!, `${kind} at (${x}, ${y}): over ${at}`);
    };
    // a { key, frames: 0 } press stays down until a later step has run a frame, so two keys share one (a diagonal):
    // released before any frame ran, it moved nothing (opinion-7)
    const pending: KeyInput[] = [];
    const release = async () => { for (const k of pending.splice(0)) { await page.keyboard.up(k); game.held.delete(k); released = frame; } };
    let cut = -1; // the first step a recording's deadline left unplayed
    // the page's URL, and the last step that sent input (named when the page navigates: the commit lags the key event, so
    // the error can surface in a later step)
    let url = page.url(), input: string | undefined;
    const one = async (s: Step) => {
      const frames = "frames" in s && s.frames !== undefined ? s.frames : 1, from = frame;
      // action first: its open fields would otherwise match every other step's `in` check
      if ("action" in s) {
        const { frames: _, ...call } = s;
        const ok = await page.evaluate(call => { const g = (window as any).__game; if (!g?.act) return false; g.act(call); return true; }, call);
        if (!ok) throw new Error(`action "${s.action}": this game has no window.__game.act`);
        await step(frames, s.draw === true);
      } else if ("state" in s) {
        if (!s.state || typeof s.state !== "object" || Array.isArray(s.state)) throw new Error("state step needs an object for window.__game.setState, as { state: { player: { x: 2, z: 0 } } }");
        const ok = await gameUp(game, ["setState"]) && await page.evaluate(st => { const g = (window as any).__game; if (!g?.setState) return false; g.setState(st); return true; }, s.state as any);
        if (!ok) throw new Error(`state step: no window.__game.setState ${GAME_LATE}`);
        await step(frames, s.draw === true); // so the drawn pose follows the state
      } else if ("until" in s) {
        // one frame at a time, the state read after each: an exact frame for a landing, a pickup or a win
        const want = predicates(s.until, "until"), max = Number.isFinite(s.max) ? Math.max(0, Math.floor(s.max!)) : 600;
        let vs = verdicts(want, await page.evaluate(STATE)), n = 0, at = frame;
        // shortcut: a multi-pass page's canvas after a skipped until shows the frame before it until the next drawn frame
        // (look's redraw covers a page drawn straight to the screen); replay look's DRAW here when a tester hits it
        const one = s.draw || film ? "await __clock.step(1);" : "__harness.skip = true; try { await __clock.step(1); } finally { __harness.skip = false; }";
        // in real time a read every 1/60 s, with the game frames run so far: reads come 20-30 % fewer than frames
        while (!vs.every(v => v.ok) && n < max && frame - at < max && !(real && Date.now() >= deadline)) {
          if (real) { const [st, f] = await page.evaluate(`(async () => { await __clock.realSleep(${1000 / 60}); return [${STATE}, ${REC_FRAMES}]; })()`) as [unknown, number]; vs = verdicts(want, st); frame = Math.max(frame, f); }
          else { vs = verdicts(want, await page.evaluate(`(async () => { ${one} return ${STATE}; })()`)); frame++; if (film) await film(); }
          n++;
        }
        untils.push(vs.every(v => v.ok) ? `until: ${vs.map(v => `${v.path} ${v.cond}`).join(", ")} held at frame ${frame}`
          : `until: not met in ${frame - at} frames (${vs.filter(v => !v.ok).map(v => `${v.path} ${show(v.got)}, expected ${v.want}`).join("; ")})`);
      } else if ("wait" in s) {
        const n = Math.max(0, Math.floor(s.wait)), t = Date.now();
        await step(n, s.draw === true);
        if (s.draw === true && n >= 60 && Date.now() - t > 20_000) slow = Math.max(slow, n);
      } else if ("clock" in s) {
        // the clock tool's pause, resume and time scale, as a step; its step n is { wait: n }
        const c = s.clock;
        if (!c || typeof c !== "object") throw new Error("clock step needs an object, as { clock: { timescale: 0.5 } } or { clock: { paused: false } }");
        await page.evaluate(c => { const k = (window as any).__clock; if (c.timescale !== undefined) k.timescale(c.timescale); if (c.paused === true) k.pause(); if (c.paused === false) k.resume(); }, c);
        await step(frames, s.draw === true);
      } else if ("key" in s) {
        const key = s.key as KeyInput;
        if (s.down === false) { await page.keyboard.up(key).catch(keyHint); game.held.delete(key); released = frame; }
        else { await page.keyboard.down(key).catch(keyHint); game.held.add(key); }
        await step(frames, s.draw === true);
        if (s.down === undefined && frames === 0) pending.push(key);
        else if (s.down === undefined) { await page.keyboard.up(key); game.held.delete(key); released = frame; }
      } else if ("mouse" in s && "relative" in s) {
        // movement under pointer lock (mouse look): Chrome reports movementX/Y 0 for CDP mouse moves, so an AA-3D agent
        // read "yaw change 0.000, locked true" and dropped its pointer lock; the events carry the movement themselves
        const [dx, dy] = s.relative;
        await page.evaluate(`(() => { const t = document.pointerLockElement ?? __harness.canvas() ?? document.body, o = { bubbles: true, movementX: ${+dx}, movementY: ${+dy} };
          t.dispatchEvent(new PointerEvent("pointermove", { ...o, pointerType: "mouse", isPrimary: true })); t.dispatchEvent(new MouseEvent("mousemove", o)); })()`);
        await step(frames, s.draw === true);
      } else if ("wheel" in s) {
        if (s.x !== undefined && s.y !== undefined) { await aim("wheel", s.x, s.y); await page.mouse.move(s.x, s.y); }
        await page.mouse.wheel({ deltaY: s.wheel });
        await step(frames, s.draw === true);
      } else if ("resize" in s) {
        const [width, height] = s.resize.map(Math.round) as [number, number], v = page.viewport()!;
        game.resized = { width, height, back: game.resized?.back ?? { width: v.width, height: v.height } };
        await page.setViewport({ ...v, width, height }); // until the next reload (browser.ts reload()); keeps the DPR
        await page.evaluate("__clock.realSleep(50)"); // the resize event comes with Chrome's next rendering update, on real time
        await step(frames, s.draw === true);
      } else if ("scroll" in s) {
        const to = s.scroll as { to?: unknown };
        const y = await page.evaluate(`(() => { const v = ${JSON.stringify(s.scroll)}, max = document.documentElement.scrollHeight - innerHeight;
          const y = typeof v === "number" ? v : typeof v?.progress === "number" ? v.progress * max : typeof v?.to === "string" ? document.querySelector(v.to)?.getBoundingClientRect().top + scrollY : NaN;
          if (Number.isFinite(y)) scrollTo({ top: y, behavior: "instant" }); return Number.isFinite(y); })()`);
        if (!y) throw new Error(`scroll step ${JSON.stringify(s)}: use { scroll: px }, { scroll: { progress: 0..1 } } or { scroll: { to: "#section" } }${typeof to?.to === "string" ? `; no element matches ${to.to}` : ""}`);
        await page.evaluate("__clock.realSleep(50)"); // the scroll event comes with Chrome's next rendering update, on real time
        await step(frames, s.draw === true);
        scrolled = true;
      } else if ("mouse" in s) {
        if (!["click", "dblclick", "down", "up", "move"].includes(s.mouse)) throw new Error(`unknown mouse verb ${JSON.stringify(s.mouse)}: use click, dblclick, down, up or move`);
        // without numbers CDP fails with a 141 B "Failed to deserialize params.x" protocol error
        if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) throw new Error(`mouse step ${JSON.stringify(s)} needs numbers x and y: { mouse: "click"|"down"|"up"|"move", x, y }`);
        const { mouse } = page, opts = { button: s.button }, held = `mouse:${s.button ?? "left"}`;
        await aim(`mouse ${s.mouse}`, s.x, s.y, s.mouse !== "move" || game.held.has(held)); // an element over the canvas takes only a press or drag
        if (s.mouse === "click") await mouse.click(s.x, s.y, opts);
        else if (s.mouse === "dblclick") await mouse.click(s.x, s.y, { ...opts, count: 2 });
        else {
          await mouse.move(s.x, s.y);
          // a button an earlier call left down stays down rather than failing the call ("'left' is already pressed": a
          // drag split over two `interact` calls in an AA-3D cell), and an up of a button that is not down does nothing
          if (s.mouse === "down" && !game.held.has(held)) { await mouse.down(opts); game.held.add(held); }
          if (s.mouse === "up" && game.held.has(held)) { await mouse.up(opts); game.held.delete(held); }
        }
        await step(frames, s.draw === true);
      } else if ("touch" in s) {
        if (!["start", "move", "end", "tap"].includes(s.touch)) throw new Error(`unknown touch verb ${JSON.stringify(s.touch)}: use start, move, end or tap`);
        const t = page.touchscreen;
        if (s.touch !== "end") await aim(`touch ${s.touch}`, s.x, s.y);
        if (s.touch === "tap") await t.tap(s.x, s.y);
        else if (s.touch === "start") await t.touchStart(s.x, s.y);
        else if (s.touch === "move") await t.touchMove(s.x, s.y);
        else await t.touchEnd();
        await step(frames, s.draw === true);
      } else throw new Error(`unknown step: ${JSON.stringify(s)}`);
      if (frame > from) await release();
    };
    for (const [i, s] of steps.entries()) {
      if (real && Date.now() >= deadline) { cut = i; break; }
      const kind = kindOf(s), v = (s as Record<string, unknown>)[kind];
      if (!["state", "until", "wait", "clock"].includes(kind)) input = `${kind === "key" ? v : typeof v === "string" ? `${kind} ${v}` : kind} (step ${offset + i + 1})`;
      try { await one(s); } catch (e) {
        // a recording is not followed: its clip and running clock are the old document's, so act() fails and answer() runs it again
        if (real || !(e instanceof Error && NAV_LOST.test(e.message))) throw e;
        const to = await game.settle().catch(() => { throw e; }); // no page booted there (about:blank): answer() puts the game's back, as before
        if (to === url) throw e; // the same URL is a live reload or location.reload(): the call is run again on the page put back (#135)
        // the step sent the page somewhere (location.replace('?plan=B') on a key): the new document booted under the harness, so
        // the rest of the call runs there; replaying every step reran a toggle and cancelled it (#142)
        url = to; pending.length = 0; // settle() let go of the old document's keys
        const u = new URL(to);
        untils.push(`${input ?? `step ${offset + i + 1}`} navigated to ${u.pathname + u.search + u.hash}; the rest of the call ran there, from its frame 0.`);
        game.url = to; // shortcut: a saved check or sheet cell whose step navigates starts its next run there (reload() keeps the current URL); upgrade with a home URL apart from game.url when a check needs one
      }
    }
    await release();
    if (cut >= 0) untils.push(`record: ${RECORD_MAX_S} s of real time passed before step ${cut + 1} of ${steps.length}, so it and the steps after it were not played.`);
    const hints = [...untils, ...[...missed].map(([on, at]) => `${at} landed on ${on}, not the canvas: listeners on the canvas never got it.`), ...over.values(),
      ...slow ? [`A ${slow}-frame wait took over 20 s drawing every frame: leave draw: true out unless the picture builds up over frames.`] : [],
      ...scrolled ? [await page.evaluate(SCROLL) as string] : []];
    return { hint: hints.length ? hints.join("\n") : undefined, frames: frame, released };
  });
}

/** `interact` `hover`: moves the mouse to each named object's centre on screen (its box in a fresh look's ID image) and
 *  returns what changed there after `frames`, one diff per name. */
export function hover(game: Game, names: string[], frames = 1) {
  return game.queue(async () => {
    const out: { name: string; at?: [number, number]; changed?: Record<string, unknown>; hint?: string; error?: string }[] = [];
    for (const name of names) {
      const o = (await look(game, { peek: true, surfaces: false })).onScreen.find(o => o.name === name);
      if (!o) { out.push({ name, error: "not on screen in the ID image" }); continue; }
      const [x0, y0, x1, y1] = o.bbox, x = Math.round((x0 + x1) / 2), y = Math.round((y0 + y1) / 2);
      const r = await act(game, [{ mouse: "move", x, y, frames }]);
      out.push({ name, at: [x, y], changed: r.changed, ...(r.hint ? { hint: r.hint } : {}) });
    }
    return out;
  });
}
