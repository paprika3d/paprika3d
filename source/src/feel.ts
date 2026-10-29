// feel(): how the game reacts to an event, measured instead of judged from a picture, on a fresh reload (the leading
// { state } steps and one frame set the scene up before anything is measured). One snapshot before the other steps
// and one after each of the next `frames` frames, each recording every visible object with geometry (world position
// and scale, its first material's colour, emissive and opacity, and for a Points pool or an InstancedMesh how many
// particles or instances it draws), the main camera, the page's text and the sounds started so far (devtools.js counts
// them). Every frame of the steps is watched as well as the frames after, so an event a walk causes on its 5th frame is
// at frame 5; what the steps moved overall is listed as a fact on its own line. The series is then read for camera shake, particles, spawned and removed objects, HUD text
// ticks and sounds.
import type { Game } from "./browser.ts";
import { act, diff, type Step } from "./input.ts";

const CAP = 400, STEPS_MAX = 300;
// n: the particles a Points pool draws (burst() is one Points with a draw range) or an InstancedMesh's instances, else 1
type Obj = { id: string; name: string; p: number[]; s: number[]; v: boolean; c: string; o: number; sh: boolean; n: number; pool: boolean };
// cov: each page element over the canvas (`__harness.covers()`) and its opacity; sounds: the sfx preset names started so far
type Snap = { objs: Obj[]; cam: number[] | null; dir: number[] | null; sub: number[] | null; text: string; audio: number; sounds: string[]; cov: [string, number][]; capped: boolean };
/** Objects that did one thing, each with the watched frame it happened on (and how far, for a teleport). */
type Named = { count: number; names: string[]; at: { name: string; frame: number; units?: number }[] };

export interface FeelResult {
  frames: number; capped: boolean;
  /** `turn`: the degrees of a shake in the camera's direction (a pitch shake that moves it nowhere has max 0) */
  shake: { max: number; turn?: number; at: number; returned: boolean };
  /** The camera went out and came back in one move, no shake, while the subject stayed put (a hit's lurch, a dip, a nod):
      how far it moved and turned (degrees) at its peak frame, and the frame it was back by (dev #115); `cut`: it jumped
      there and back between two frames (a cut away and back, a death cam). */
  swing?: { max: number; turn: number; at: number; back: number; cut?: boolean };
  pops: Named; eased: number; teleports: Named; flashes: Named;
  /** Objects there before the steps whose scale or colour changed and was not back by the last watched frame. */
  unsettled: { name: string; what: "scale" | "colour" }[];
  /** Colours that changed and held their new value for the last 5+ watched frames (a swatch, a selection): the first
      changed frame and the frames until the new colour was reached (0 is a cut). */
  held: { name: string; frame: number; over: number }[];
  /** Objects that moved over 0.05 units during the steps, before the first watched frame. */
  moved: { name: string; units: number }[];
  /** Points pools and InstancedMeshes whose count changed: the peak, the watched frame it came on, the count at the end. */
  particles: { name: string; start: number; peak: number; at: number; end: number }[];
  spawned: { peak: number; gone: number; names: string[] }; removed: number;
  hud: { changed: boolean; frames: number }; sounds: number;
  text: string;
}

// The main camera is the one that last drew the scene with the most children, as look() picks it.
const SNAP = `(() => { const h = window.__harness, r = x => Math.round(x * 1000) / 1000, objs = []; let capped = false;
  for (const scene of h.scenes) scene.traverse(o => {
    if (!o.geometry) return;
    if (objs.length >= ${CAP}) { capped = true; return; }
    let v = o.visible; for (let a = o.parent; v && a; a = a.parent) v = a.visible;
    const p = o.getWorldPosition(o.position.clone()), s = o.getWorldScale(o.scale.clone()), m = Array.isArray(o.material) ? o.material[0] : o.material;
    const d = o.geometry.drawRange, n = o.isInstancedMesh ? o.count : o.isPoints ? (d.count === Infinity ? o.geometry.attributes.position?.count ?? 0 : d.count) : 1;
    // an unnamed mesh goes by its nearest named parent: a 12-mesh player read as 12 "Mesh" teleports (natural-1, #92)
    let name = ""; for (let a = o; a && !a.isScene && !name; a = a.parent) name = a.name;
    objs.push({ id: o.uuid, name: name || o.type, p: [r(p.x), r(p.y), r(p.z)], s: [r(s.x), r(s.y), r(s.z)], v,
      c: (m?.color?.getHexString?.() ?? "") + "/" + (m?.emissive?.getHexString?.() ?? "") + "/" + (m?.emissiveIntensity ?? ""), o: m?.opacity ?? 1, sh: !!m?.isShaderMaterial, n, pool: !!(o.isInstancedMesh || o.isPoints) });
  });
  const cam = h.main()?.[1].camera, cp = cam?.getWorldPosition(cam.position.clone()), cd = cam?.getWorldDirection(cam.position.clone()), s0f = window.__game?.subject, s0 = typeof s0f === "function" ? (() => { try { return s0f(); } catch {} })() : s0f;
  const so = s0?.isObject3D ? s0 : typeof s0 === "string" ? h.mainScene()?.getObjectByName(s0) : null, sp = so?.getWorldPosition(so.position.clone());
  return { objs, cam: cp ? [r(cp.x), r(cp.y), r(cp.z)] : null, dir: cd ? [cd.x, cd.y, cd.z].map(v => Math.round(v * 1e5) / 1e5) : null, sub: sp ? [r(sp.x), r(sp.y), r(sp.z)] : null, text: (document.body?.innerText ?? "").trim().slice(0, 2000), audio: h.audio ?? 0,
    sounds: [...h.sounds ?? []], cov: (h.covers?.(20) ?? []).map(c => [c.what, c.opacity]), capped };
})()`;

const OBSERVE = "window.__game?.observe?.() ?? null";
const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** Entries of one name on one frame are one (the largest jump kept): the meshes of one model respawn together (natural-1, #92). */
const named = (all: Named["at"]): Named => {
  const one = new Map<string, Named["at"][number]>();
  for (const x of all) { const k = `${x.name}@${x.frame}`, y = one.get(k); if (!y || (x.units ?? 0) > (y.units ?? 0)) one.set(k, x); }
  const at = [...one.values()];
  return { count: at.length, names: [...new Set(at.map(o => o.name))].slice(0, 5), at };
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const round = (n: number) => +n.toFixed(2);

/** Reloads, sets the scene up, snapshots, sends the other steps, then watches the next `frames` frames, on the game's queue. */
export function feel(game: Game, steps: Step[], frames = 45): Promise<FeelResult> {
  return game.queue(async () => {
    let stepped: Snap[] = [];
    const n = Math.max(1, Math.min(300, Math.floor(frames) || 45)); // 300 snapshots of 400 objects is about 15 MB
    // a fresh page, so nothing an earlier call left (particles, a moved camera, a sound) counts as this event's; the
    // leading { state } steps and one frame (the game places its camera and applies the setup) come before the baseline
    await game.reload();
    const k = (i => i < 0 ? steps.length : i)(steps.findIndex(s => !(s && typeof s === "object" && "state" in s)));
    const pre = await game.page.evaluate(OBSERVE);
    if (k) await act(game, steps.slice(0, k)); // each { state } step runs a frame, so the drawn pose follows it
    else await game.page.evaluate("__clock.step(1)");
    const snaps: Snap[] = [await game.page.evaluate(SNAP) as Snap], state = await game.page.evaluate(OBSERVE);
    // every frame of the cause steps is watched too: a pickup on the 5th frame of a walk, or a respawn on the last step's
    // frame, read as "at frame 1" or as movement (opinion-3, opinion-4); the last STEPS_MAX frames are kept
    await game.page.evaluate(`(() => { const out = [], tick = () => { if (!window.__harnessFeel) return; out.push(${SNAP}); if (out.length > ${STEPS_MAX}) out.shift(); requestAnimationFrame(tick); };
      window.__harnessFeel = { end: () => { delete window.__harnessFeel; return out; } }; requestAnimationFrame(tick); })()`);
    await act(game, steps.slice(k)).finally(() => game.page.evaluate("window.__harnessFeel?.end()").then(d => { stepped = (d ?? []) as Snap[]; }, () => {}));
    snaps.push(...stepped);
    // every frame in one round trip: step, snapshot, repeat, in the page
    snaps.push(...await game.page.evaluate(`(async () => { const out = []; for (let i = 0; i < ${n}; i++) { await __clock.step(1); out.push(${SNAP}); } return out; })()`) as Snap[]);
    const r = measure(snaps, n, state, await game.page.evaluate(OBSERVE), stepped.length, pre, steps.slice(0, k).map(s => (s as { state: unknown }).state));
    await game.reload(); // a fresh frame 0, as every reloading call leaves it: feel-2 saved a check on lives feel had spent
    return r;
  });
}

/** Reads the snapshot series: snaps[0] is before the steps, snaps[i] the i-th frame from the first step on (the first
    `during` of them the steps' own). */
function measure(snaps: Snap[], frames: number, before: unknown = null, after: unknown = null, during = 0, pre?: unknown, set: unknown[] = []): FeelResult {
  const first = snaps[0]!, last = snaps.at(-1)!;
  const shown = (s: Snap) => new Map(s.objs.filter(o => o.v).map(o => [o.id, o]));
  const visible = snaps.map(shown);
  // each object's visible records over the watched frames, with their frame numbers
  const series = new Map<string, { f: number; o: Obj }[]>();
  visible.forEach((m, f) => { if (f) for (const [id, o] of m) { const xs = series.get(id); xs ? xs.push({ f, o }) : series.set(id, [{ f, o }]); } });
  const pops: Named["at"] = [], teleports: Named["at"] = [], flashes: Named["at"] = [];
  const unsettled: FeelResult["unsettled"] = [], held: FeelResult["held"] = [], smooth = new Set<string>();
  let eased = 0;
  const key = (a: number[]) => a.join();
  for (const [id, rs] of series) {
    // a pop or flash comes back to the scale or colour from before the steps: one the last step started is already on
    // the first watched frame (feel-1: a landing squash and a hit flash read as none)
    const xs = rs.map(r => r.o), o = xs[0]!, end = xs.at(-1)!, name = o.name, was = visible[0]!.get(id) ?? o;
    if (xs.some((x, i) => i > 1 && new Set([key(x.p), key(xs[i - 1]!.p), key(xs[i - 2]!.p)]).size === 3)) { eased++; smooth.add(name); }
    // a jump is a step over 0.5 units and 4× the steps either side of it: a coin that bobbed every frame hid its respawn
    // when only an object still on every other frame counted (feel-7, #66)
    // from the frame before the steps too: a respawn on the steps' first frame read as "No change in: teleports" (opinion-10)
    const ps = [...visible[0]!.has(id) ? [{ f: 0, p: was.p }] : [], ...rs.map(r => ({ f: r.f, p: r.o.p }))];
    const step = ps.map((x, i) => i ? dist(x.p, ps[i - 1]!.p) : 0);
    const j = step.findIndex((d, i) => d > 0.5 && d > 4 * Math.max(step[i - 1] ?? 0, step[i + 1] ?? 0));
    if (j > 0) teleports.push({ name, frame: ps[j]!.f, units: round(step[j]!) });
    const grew = xs.map((x, i) => i > 0 && key(x.s) !== key(xs[i - 1]!.s)), g = grew.findIndex((g, i) => g && grew[i + 1]);
    const back = end.s.every((v, i) => Math.abs(v - was.s[i]!) <= 0.05 * Math.abs(was.s[i]!) + 1e-3);
    if (g >= 0 && back) pops.push({ name, frame: rs[g]!.f });
    const c = xs.findIndex(x => x.c !== was.c);
    if (c >= 0 && end.c === was.c) flashes.push({ name, frame: rs[c]!.f });
    // a squash or flash still easing back when watching ended is no "no pops" (feel-6: 3 of 4 found one with more frames)
    if (visible[0]!.has(id)) {
      if (xs.some(x => key(x.s) !== key(was.s)) && !back) unsettled.push({ name, what: "scale" });
      // a colour that reached a new value and stayed there is a change, not a flash still fading: a configurator's
      // swatch read as "Not back by the end", and a cut read the same as a 0.3 s blend (feel-8: 4 of 4 agents)
      const to = xs.findLastIndex(x => x.c !== end.c) + 1;
      if (c >= 0 && end.c !== was.c) xs.length - to >= 5 ? held.push({ name, frame: rs[c]!.f, over: rs[to]!.f - rs[c]!.f }) : unsettled.push({ name, what: "colour" });
    }
  }
  // a page overlay (a div#flash) fading in and out is a flash too: only meshes were watched (natural-1, #89); one absent
  // from covers() shows nothing, opacity 0
  const op = (s: Snap, w: string) => s.cov.find(c => c[0] === w)?.[1] ?? 0;
  for (const w of new Set(snaps.flatMap(s => s.cov.map(c => c[0])))) {
    const was = op(first, w), f = snaps.findIndex(s => Math.abs(op(s, w) - was) >= 0.1);
    if (f > 0) Math.abs(op(last, w) - was) <= 0.05 ? flashes.push({ name: w, frame: f }) : unsettled.push({ name: w, what: "colour" });
  }
  // what the steps moved, from before them to the first watched frame: a fact about the steps, not a reaction
  const moved = [...visible[Math.max(1, during)]!].flatMap(([id, o]) => { const b = visible[0]!.get(id), d = b ? dist(b.p, o.p) : 0; return d > 0.05 ? [{ name: o.name, units: round(d) }] : []; });
  // particle pools: one object whose count of points or instances rises and falls
  const particles: FeelResult["particles"] = [];
  for (const [id, rs] of series) {
    if (!rs[0]!.o.pool) continue;
    const start = visible[0]!.get(id)?.n ?? 0, top = rs.reduce((t, r) => r.o.n > t.o.n ? r : t), end = visible.at(-1)!.get(id)?.n ?? 0;
    if (top.o.n !== start || end !== start) particles.push({ name: top.o.name, start, peak: top.o.n, at: top.f, end });
  }
  const ever = new Map<string, Obj>();
  let peak = 0;
  for (const m of visible.slice(1)) {
    const fresh = [...m.values()].filter(o => !visible[0]!.has(o.id));
    peak = Math.max(peak, fresh.length);
    for (const o of fresh) ever.set(o.id, o);
  }
  const lastShown = visible.at(-1)!;
  const gone = [...ever.keys()].filter(id => !lastShown.has(id)).length;
  const removed = [...visible[0]!.keys()].filter(id => !lastShown.has(id)).length;
  // the camera's move, or its move relative to the subject when that is smaller: a follow camera keeping up with a walk
  // is still, a shake shows either way (opinion-3: 3 of 3 read a chase camera as "moved up to 0.4")
  const rel = (s: Snap) => s.cam!.map((v, i) => v - s.sub![i]!);
  const cam = snaps.map(s => !s.cam || !first.cam ? 0 : Math.min(dist(s.cam, first.cam), s.sub && first.sub ? dist(rel(s), rel(first)) : Infinity)), camPeak = cam.indexOf(Math.max(...cam));
  // a shake reverses direction at least twice, in the camera's move and in its offset from the subject; a lerp follow
  // camera's lag goes out and back once and read as "shook up to 0.9 and came back" (natural-1, #75). Steps under 0.01 are jitter.
  // `floor`: steps at or under it are jitter, 0.01 units for a position, 0.002 (0.1°) for a unit direction
  const turns = (xs: number[][], floor = 0.01) => { let n = 0, d0: number[] | undefined;
    for (let i = 1; i < xs.length; i++) { const d = xs[i]!.map((v, j) => v - xs[i - 1]![j]!); if (Math.hypot(...d) <= floor) continue; if (d0 && d.reduce((t, v, j) => t + v * d0![j]!, 0) < 0) n++; d0 = d; }
    return n; };
  const withCam = snaps.filter(s => s.cam), withSub = withCam.filter(s => s.sub), withDir = snaps.filter(s => s.dir);
  const returned = cam.at(-1)! <= 0.05, top = Math.max(...cam);
  // the camera's turn from where it looked before the steps, by chord of the rounded unit vectors (acos of a rounded dot
  // gave 0.07° of noise); 0.5° is the floor, as 0.01 units is for a move (#68)
  const ang = snaps.map(s => s.dir && first.dir ? 2 * Math.asin(Math.min(1, dist(s.dir, first.dir) / 2)) : 0), turn = Math.max(...ang), TURN = 0.5 * Math.PI / 180;
  const still = snaps.every(s => !s.sub || !first.sub || dist(s.sub, first.sub) <= 0.05);
  // a shake in the camera's direction alone (a decaying pitch wobble, no translation) is one too: counted by position
  // only, it read "one move out and back, not a shake" (batch 3 review); only with the subject put, since a lookAt
  // camera on a zigzagging player turns back and forth too
  const spun = still && turn >= TURN && turns(withDir.map(s => s.dir!), 0.002) >= 2;
  const shook = spun || Math.min(turns(withCam.map(s => s.cam!)), first.sub && withSub.length === withCam.length ? turns(withSub.map(rel)) : Infinity) >= 2;
  // under 0.01 units is lookAt jitter, not a shake (opinion-8, #68); one excursion out and back is no shake
  const moveShake = top >= 0.01 && (!returned || shook), turnBack = ang.at(-1)! <= Math.max(TURN, turn / 4);
  const shake = { max: moveShake ? Math.round(top * 1000) / 1000 : 0, ...spun ? { turn: +(turn * 180 / Math.PI).toFixed(1) } : {},
    at: moveShake ? camPeak : spun ? ang.indexOf(turn) : camPeak, returned: spun ? returned && turnBack : returned };
  const shaken = !!(shake.max || shake.turn);
  // one move out and back that is no shake is still a reaction when the subject stayed put: a hit's 0.11-unit lurch and
  // 5° dip read as "No change in: camera" (dev #115). A subject that moved is a follow camera's lag (#75); it must
  // move 0.01 units or turn 0.5° (jitter is less, #68) and end within a quarter of its peak.
  const out = (i: number) => Math.max(top >= 0.01 ? cam[i]! / top : 0, turn >= TURN ? ang[i]! / turn : 0), apex = top >= 0.01 ? camPeak : ang.indexOf(turn);
  const back = snaps.findIndex((_, i) => i > apex && snaps.slice(i).every((_, j) => out(i + j) <= 0.25));
  // a cut: the camera jumped over 0.5 units between two frames, 4× its steps either side (the teleport rule): a 60-unit
  // cut away and back read as one move out and back, a lurch (batch 3 review)
  const hop = withCam.map((s, i) => i ? dist(s.cam!, withCam[i - 1]!.cam!) : 0), cut = hop.some((d, i) => d > 0.5 && d > 4 * Math.max(hop[i - 1] ?? 0, hop[i + 1] ?? 0));
  const swing = !shaken && !shook && still && (top >= 0.01 || turn >= TURN) && back > 0
    ? { max: Math.round(top * 1000) / 1000, turn: +(turn * 180 / Math.PI).toFixed(1), at: apex, back, ...cut ? { cut } : {} } : undefined;
  const ticks = snaps.filter((s, i) => i && s.text !== snaps[i - 1]!.text).length;
  const hud = { changed: ticks > 0, frames: ticks };
  const sounds = last.audio - first.audio, sfx = [...new Set(last.sounds.slice(first.sounds.length))];
  const r = { frames, capped: snaps.some(s => s.capped), shake, ...swing ? { swing } : {}, pops: named(pops), eased, unsettled, held, teleports: named(teleports),
    flashes: named(flashes), moved, particles, spawned: { peak, gone, names: [...new Set([...ever.values()].map(o => o.name))].slice(0, 5) }, removed, hud, sounds };

  const list = (x: Named) => x.count ? `${x.count} (${x.at.slice(0, 5).map(h => `${h.name} at frame ${h.frame}${h.units === undefined ? "" : `, ${h.units} units`}`).join("; ")}${x.count > 5 ? "; …" : ""})` : "none";
  // how far: units, degrees or both, only those over the floors (a pure turn read "moved up to 0", batch 3 review)
  const far = (max: number, deg = 0) => [max >= 0.01 && `moved up to ${max}`, deg >= 0.5 && `turned up to ${deg}°`].filter(Boolean).join(" and ");
  const camLine = swing?.cut ? `cut ${swing.max} units away at frame ${swing.at} and back by frame ${swing.back}: a camera cut, not a shake`
    : swing ? `${far(swing.max, swing.turn)} at frame ${swing.at}, back by frame ${swing.back}: one move out and back, not a shake`
    : !shaken ? "no shake" : shake.returned ? `shook up to ${[shake.max && shake.max, shake.turn && `${shake.turn}°`].filter(Boolean).join(" and ")} at frame ${shake.at} and came back`
    : `${far(shake.max, shake.turn)} at frame ${shake.at} and did not come back`;
  const hudLine = !ticks ? "unchanged" : ticks === 1 ? "changed in one frame" : `changed over ${ticks} frames (counted up)`;
  // the setup line goes first: below it, "HUD text: unchanged" and "Sounds started: 0" read as the result (opinion-14, #182)
  const [state, setup] = stateLine(before, after, pre, set);
  const lines = [
    `Watched ${during ? `the steps' ${during} frames and ` : ""}${frames} frames after them, counted from the first step${r.capped ? `, only the first ${CAP} objects of each frame` : ""}.`,
    ...setup ? [setup] : [],
    ...moved.length ? [`Moved during the steps: ${moved.slice(0, 5).map(m => `${m.name} ${m.units} units`).join(", ")}${moved.length > 5 ? ", …" : ""}.`] : [],
    ...shaken || swing ? [`Camera: ${camLine}.`] : [],
    ...r.pops.count ? [`Scale pops (scale changed over 2+ frames and came back): ${list(r.pops)}.`] : [],
    `Smooth moves (a new position on 3+ consecutive frames): ${eased}${eased ? ` (${[...smooth].slice(0, 5).join(", ")}${smooth.size > 5 ? ", …" : ""})` : ""}.`,
    ...r.teleports.count ? [`Teleports (a jump over 0.5 units between two watched frames, 4× the moves either side of it; a respawn is one, a glitch only for something that should glide): ${list(r.teleports)}.`] : [],
    ...unsettled.length ? [`Not back by the end (watch more frames to see them settle): ${unsettled.slice(0, 5).map(u => `${u.name} ${u.what}`).join(", ")}${unsettled.length > 5 ? ", …" : ""}.`] : [],
    ...held.length ? [`Colour changes held to the end: ${held.slice(0, 5).map(h => `${h.name} at frame ${h.frame}, ${h.over ? `blended over ${h.over} frames` : "in one frame"}`).join("; ")}${held.length > 5 ? "; …" : ""}.`] : [],
    ...r.flashes.count ? [`Colour flashes (colour, emissive or a page overlay's opacity changed and came back): ${list(r.flashes)}.`] : [],
    ...particles.length ? [`Particles: ${particles.slice(0, 5).map(p => `${p.name} ${p.start} → ${p.peak} at frame ${p.at}, ${p.end} left at the end`).join("; ")}.`] : [],
    ...ever.size ? [`Spawned: up to ${peak} new objects at once, ${gone} of ${ever.size} gone by the end (${r.spawned.names.join(", ")}).`] : [],
    ...removed ? [`Removed: ${removed} objects there before the steps are gone.`] : [],
    // the reactions that did not happen in one line, by name: feel agents read them as a to-do list (opinion-5: 4 of 4 asked to fold the zeros)
    ...(none => none.length ? [`No change in: ${none.join(", ")}.`] : [])([!shaken && !swing && "camera (no shake)", !r.pops.count && !unsettled.some(u => u.what === "scale") && "scale (no pops)", !r.teleports.count && "teleports",
      !r.flashes.count && !held.length && !unsettled.some(u => u.what === "colour") && "colour (no flashes)", !ever.size && "spawns", !removed && "removals"].filter(Boolean)),
    `HUD text: ${hudLine}.`,
    `Sounds started: ${sounds}${sfx.length ? ` (${sfx.slice(0, 5).join(", ")}${sfx.length > 5 ? ", …" : ""})` : ""}.`,
    ...state ? [state] : [],
  ];
  const parts = [
    r.pops.count && plural(r.pops.count, "pop"), r.flashes.count && plural(r.flashes.count, "flash", "flashes"), held.length && "colour changed",
    unsettled.length && "not settled", eased && plural(eased, "smooth move"), r.teleports.count && plural(r.teleports.count, "teleport"),
    particles.some(p => p.peak > p.start) && "particles", ever.size && `${ever.size} spawned (${gone} gone)`, removed && `${removed} removed`, (shaken || swing) && `camera ${camLine}`,
    ticks && `HUD ${ticks === 1 ? "changed in one frame" : `counted up over ${ticks} frames`}`, sounds && plural(sounds, "sound"),
  ].filter(Boolean);
  // what a shader draws (a full-screen quad, a disk spinning in its fragment shader) moves without any object moving
  const shaded = [...visible.at(-1)!.values()].filter(o => o.sh).map(o => o.name);
  if (shaded.length) lines.push(`Drawn by their own shaders: ${shaded.length} (${[...new Set(shaded)].slice(0, 5).join(", ")}${shaded.length > 5 ? ", …" : ""}); what moves inside a shader is not measured here: compare \`look\` pictures from before and after.`);
  // each reaction already has its own line above, so only a quiet run gets a closing line
  if (!parts.length) lines.push("nothing reacted");
  return { ...r, text: lines.join("\n") };
}

/** The __game.observe() paths the steps and watched frames changed (`score 0 → 1`), or a line saying none did, so "no
    reaction" and "the event never happened" read apart (opinion-3: a setup 0.13 short of the coin read as no feedback). */
function stateLine(before: unknown, after: unknown, pre?: unknown, set: unknown[] = []): string[] {
  if (!after || typeof after !== "object") return [];
  const at = (o: unknown, path: string[]) => path.reduce<unknown>((x, k) => (x as Record<string, unknown> | null)?.[k], o);
  const show = (v: unknown) => typeof v === "number" ? String(round(v)) : JSON.stringify(v)?.slice(0, 40);
  const changed = (a: unknown, b: unknown) => { const paths: string[][] = [];
    const walk = (d: Record<string, unknown>, p: string[]) => { for (const [k, v] of Object.entries(d)) v && typeof v === "object" && !Array.isArray(v) ? walk(v as Record<string, unknown>, [...p, k]) : paths.push([...p, k]); };
    walk(diff(a, b), []);
    return paths; };
  const text = (a: unknown, b: unknown, paths: string[][], n: number) => `${paths.slice(0, n).map(p => `${p.join(".")} ${show(at(a, p))} → ${show(at(b, p))}`).join(", ")}${paths.length > n ? ", …" : ""}`;
  const watched = changed(before, after);
  const lines = [watched.length ? `State: ${text(before, after, watched, 5)}.` : "State unchanged by the steps and watched frames: did the event happen?"];
  // a path the setup frame changed that no { state } step set and the watched frames left alone is an event that fired
  // before them: a win's sound and HUD read as missing (build-review-1, #79)
  const seen = new Set(watched.map(p => p.join(".")));
  const early = pre == null || !set.length ? [] : changed(pre, before).filter(p => !seen.has(p.join(".")) && !set.some(s => at(s, p) !== undefined));
  if (early.length) lines.push(`State changed during setup (${text(pre, before, early, 3)}): the event may have fired before the watched frames.`);
  return lines;
}
