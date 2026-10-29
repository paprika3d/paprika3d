// observe(): a small JSON summary of a running game's state, for an agent to read after every step.
// The game's own __game.observe() when it has one; otherwise its top-level named three.js objects, found through
// the devtools hook. Either way the harness adds renderer and scene counts, console errors since the last observe,
// and what changed since the last observe, so the agent sees the effect of its last action without comparing by
// hand. The whole answer stays under 2 KB; what is cut is named.
import { uniq, type Game } from "./browser.ts";
import { FRAME } from "./look.ts";

const MAX_BYTES = 2048;
const MAX_ENTITIES = 25;

// Runs in the page. Inferred entities read world positions; getWorldPosition updates the world matrix itself, so it
// is right before the first render too. Counts are the game's: the scenes drawn to the screen (not an environment
// bake's room) and the whole last frame's calls (frameInfo), not three's last render call (opinion-7).
const OBSERVE = `(() => {
  const g = window.__game, h = window.__harness, r = h.renderers[0];
  const scene = { objects: 0, meshes: 0, lights: 0, cameras: 0 }, shown = [...h.views].filter(([, v]) => v.screen).map(([s]) => s);
  for (const s of shown.length ? shown : [h.mainScene()].filter(Boolean)) s.traverse(o => {
    if (o === s) return;
    scene.objects++;
    if (o.isMesh) scene.meshes++; else if (o.isLight) scene.lights++; else if (o.isCamera) scene.cameras++;
  });
  let state;
  if (g?.observe) state = g.observe();
  else {
    // Names that differ only by a trailing number (cube0 … cube4999) are one entry when there are more than three.
    const main = h.mainScene();
    const groups = new Map();
    for (const o of main?.children ?? []) if (o.name) {
      const k = o.name.replace(/\\d+$/, "");
      groups.has(k) ? groups.get(k).push(o) : groups.set(k, [o]);
    }
    const entities = [];
    for (const [k, os] of groups) {
      if (os.length > 3) entities.push([k + "*", { type: os[0].type, count: os.length }]);
      else for (const o of os) entities.push([o.name, { type: o.type, position: o.getWorldPosition(new o.position.constructor()).toArray().map(v => +v.toFixed(2)) }]);
    }
    state = { entities: Object.fromEntries(entities.slice(0, ${MAX_ENTITIES})), ...(entities.length > ${MAX_ENTITIES} ? { moreEntities: entities.length - ${MAX_ENTITIES} } : {}) };
  }
  const i = r?.info;
  return { ...state, harness: {
    frame: ${FRAME},
    renderer: i ? { calls: h.frameInfo?.calls ?? i.render.drawCalls ?? i.render.calls, triangles: h.frameInfo?.triangles ?? i.render.triangles, textures: i.memory.textures,
      geometries: i.memory.geometries, programs: i.programs?.length ?? 0 } : null,
    scene,
  } };
})()`;

const previous = new WeakMap<Game, { state: unknown; errors: number }>();

/** The game's state plus `harness: { frame, renderer, scene, errors, changed }`, under 2 KB (`harness.truncated` and `harness.cut` say what was cut).
    `changed` holds each value that differs from the previous observe as `[before, after]`; null on the first observe. */
export function observe(game: Game): Promise<Record<string, any>> {
  return game.queue(async () => {
    const o = await game.page.evaluate(OBSERVE) as Record<string, any>;
    const now = structuredClone(o);
    delete now.harness.frame; // moves on every step; the diff is for what the game did
    const prev = previous.get(game);
    previous.set(game, { state: now, errors: game.errors.length });
    o.harness.errors = uniq(game.errors.slice(prev?.errors ?? 0), 10, true);
    o.harness.changed = prev ? diffPairs(prev.state, now) : null;
    cap(o);
    return o;
  });
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Every leaf that differs between a and b, as `[before, after]` at its path; arrays compare whole. */
export function diffPairs(a: unknown, b: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const x = isObject(a) ? a : {}, y = isObject(b) ? b : {};
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (isObject(x[k]) && isObject(y[k])) {
      const d = diffPairs(x[k], y[k]);
      if (Object.keys(d).length) out[k] = d;
    } else if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) out[k] = [x[k] ?? null, y[k] ?? null];
  }
  return out;
}

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v) ?? "");

/** `interact`'s reply under the same 2 KB as observe: `{ changed }` alone when something changed (its values are the new
    ones, and the rest is what the last observe or act showed), else `{ after, changed }`; a game state too big to read
    whole keeps what changed first, and says what was cut (`truncated`, `cut`). */
export function capAct(after: unknown, changed: Record<string, unknown>): Record<string, unknown> {
  if (!isObject(after)) return { after, changed };
  if (Object.keys(changed).length && bytes({ changed }) <= MAX_BYTES) return { changed };
  if (bytes({ after, changed }) <= MAX_BYTES) return { after, changed };
  // Over the cap, what changed is named by path: its values are in `after` already, and two copies of a big list left no
  // single cut big enough, so the whole game state went (a 60-box pile's act came back `after: {}`).
  const paths = (d: Record<string, unknown>, at: string): string[] =>
    Object.entries(d).flatMap(([k, v]) => isObject(v) && Object.keys(v).length ? paths(v, `${at}${k}.`) : [`${at}${k}`]);
  const o: Record<string, any> = { ...structuredClone(after), harness: { changed: paths(changed, "") } };
  cap(o);
  const { harness: { changed: kept, truncated, cut }, ...rest } = o;
  return { after: rest, changed: kept, ...(truncated ? { truncated, cut } : {}) };
}

/** Cuts parts of o until its JSON fits MAX_BYTES, noting each cut in `harness.cut` (where the game's keys cannot reach).
    A cut saves its size less the "(cut)" placeholder and costs its note, so it takes the smallest single cut that brings
    o under the cap, else the biggest part, which is always a whole unit (the game's state, errors or changed), and looks
    again. A part already cut is never cut again, so the loop ends for any shape of state; the notes stop at NOTES plus a
    count. The harness's own counters are never cut. */
const NOTES = 3;
function cap(o: Record<string, any>) {
  const h = o.harness, notes: string[] = [];
  let more = 0;
  while (bytes(o) > MAX_BYTES) {
    h.truncated = true;
    h.cut = notes;
    const over = bytes(o) - MAX_BYTES;
    const parts: { path: string; size: number; cut: () => void }[] = [];
    const walk = (parent: any, key: string, path: string) => {
      const v = parent[key], size = bytes(v);
      if (size <= bytes("(cut)")) return; // cutting it saves nothing, and "(cut)" itself is never cut again
      parts.push({ path, size, cut: () => { parent[key] = "(cut)"; } });
      if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v, k, `${path}.${k}`);
    };
    const keys = Object.keys(o).filter(k => k !== "harness");
    for (const k of keys) walk(o, k, k);
    if (keys.length) parts.push({ path: `game state, ${keys.length} keys`,
      size: bytes(Object.fromEntries(keys.map(k => [k, o[k]]))), cut: () => { for (const k of keys) delete o[k]; } });
    for (const k of ["errors", "changed"]) walk(h, k, `harness.${k}`);
    if (!parts.length) return;
    const note = (p: { path: string; size: number }) => `${p.path.slice(0, 60)} (${p.size} bytes)`;
    parts.sort((a, b) => a.size - b.size);
    const part = parts.find(p => p.size - bytes("(cut)") >= over + bytes(note(p)) + 1) ?? parts[parts.length - 1]!;
    part.cut();
    if (notes.length < NOTES) notes.push(note(part)); else notes[NOTES] = `${++more} more`;
  }
}
