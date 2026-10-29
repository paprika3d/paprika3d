// The physics client: runs the physics worker one step ahead of the page, with bodies bound to state keys. Each key
// names a top-level object (one body) or a list (one body per item; `push` adds one and `remove` drops it, through the
// list's hooks). A body's position is its item's `x/y/z`, its velocity `vx/vy/vz` and its rotation `qx/qy/qz/qw` when
// the item has them. Call `step()` once at the start of each frame. It writes step N's results into the state, answers
// the rays queued on the frame before, and sets `events`. The inputs and rays the frame queues after that leave at the
// end of the frame as step N+1, so an input always lands exactly one step later, with or without a worker. Under the
// harness, each pending reply goes to `__clock.hold()`, so a paused clock's frame waits for it; in real time a late
// reply makes `step()` return false and the frame's inputs ride on the next step. Without `Worker`, with
// `worker: false` or with `?worker=0` in the page URL, the same handler runs in the page. `teleport` and `setVelocity`
// also write the state at once, so a setState shows straight away. The worker knows bodies by number: a key's base plus
// the item's row. The engine lives only in physics-worker.js, loaded beside this file.
import type { BodySpec, Entry, Input, Msg, RayQuery as RowRay, Reply, StepReply, Vec } from "./physics-worker.ts";
import type { ListShape, Shape, State, View } from "./state.ts";

export type { Vec };
/** Floats per body in the step buffer, in body-list order: position xyz, rotation xyzw, linear velocity xyz. */
export const STRIDE = 10;
type F32 = Float32Array;
type Cols = Record<string, Float32Array | Uint8Array>;
/** A body's item in the state: a top-level object or a list item. */
export type BodyView = { readonly $row: number; readonly $cols: Cols; [k: string]: any };
/** How a key's items become bodies. `size` is the full size, or a function of the item giving it: [w, h, d] for a box
 *  ([s] for a cube), [diameter] for a sphere, [height, diameter] for a capsule along y. `shape` defaults to box. */
export type BodyOpts<V = BodyView> = Omit<BodySpec, "row" | "pos" | "shape" | "size"> & { shape?: BodySpec["shape"]; size: number[] | ((v: V) => number[]) };
type Item<T> = T extends ListShape<infer I> ? View<I> : T extends Shape ? View<T> : never;
export type Bodies<S extends Shape> = { [K in keyof S]?: S[K] extends number | boolean ? never : BodyOpts<Item<S[K]>> };
/** A contact or sensor overlap between two items that started (or ended) in the step just taken in. */
export type Contact = { a: BodyView; b: BodyView; started: boolean; sensor: boolean };
/** A ray from a fixed `origin`, or from item `from` (plus `offset`) where it is after the step; ignores sensors and item
 *  `exclude` (default `from`). */
export type RayQuery = Omit<RowRay, "from" | "exclude"> & { from?: BodyView; exclude?: BodyView };
/** A queued raycast: `hit` is undefined until the reply that answers it, then the item hit or null. */
export type RayHandle = { hit: BodyView | null | undefined };
/** A step's reply with the body numbers its buffer holds, in order. */
type Taken = StepReply & { rows: number[] };
/** Physics state paired with the state's: the world and its body list, plus the reply the state has not taken yet. */
export type PhysicsSnapshot = { world: Uint8Array; meta: Entry[]; reply: Taken | null };

export type Physics = {
  /** Takes the last step's results into the state and sends the next step at the end of this frame. False when the
   *  last reply has not arrived yet (real time only); then nothing changes and this frame's inputs wait. */
  step(): boolean;
  /** What step() would return now: true unless a step is already scheduled this frame or its reply is late. */
  readonly ready: boolean;
  /** True when the item is live under a key given to physics(), so it has a body. */
  has(v: BodyView): boolean;
  /** Contacts and sensor overlaps that started or ended in the step `step()` just took in. */
  readonly events: readonly Contact[];
  /** The answers to the rays queued on the frame before, in the order queued: the item hit or null. Unlike a handle's
   *  `hit`, it comes back after a rewind restore, so a game whose step reads it replays exactly. */
  readonly hits: readonly (BodyView | null)[];
  /** Sets a body's velocity, and its `vx/vy/vz` at once; the reply already in flight does not overwrite it. */
  setVelocity(v: BodyView, vel: Vec): void;
  impulse(v: BodyView, i: Vec): void;
  /** Moves a body, and its `x/y/z` at once; the reply already in flight does not overwrite it. */
  teleport(v: BodyView, p: Vec): void;
  /** Casts after the next step against that step's state; answered at the next `step()`, with the positions of the
   *  same state. */
  ray(q: RayQuery): RayHandle;
  /** Sends this frame's step now and resolves once its reply is back, so the next step() returns true. A step that
   *  rewind replays (rewind's `back()`) must end with it, since nothing else waits for the worker during a replay. */
  settle(): Promise<void>;
  /** Stops the worker; pending replies resolve to nothing and step() returns false from then on. */
  close(): void;
  /** Waits for any step in flight. */
  snapshot(): Promise<PhysicsSnapshot>;
  /** Drops steps in flight and queued inputs, and puts the world back. Pair it with the state's own restore. */
  restore(s: PhysicsSnapshot): Promise<void>;
};

const clock = () => (globalThis as { __clock?: { hold?(p: Promise<unknown>): void; compiling?(d: number): void } }).__clock;
const copy = (r: Taken): Taken => ({ ...r, buf: r.buf.slice(), events: [...r.events] });
const half = (shape: BodySpec["shape"], s: number[]) => shape === "capsule" ? [(s[0] - s[1]) / 2, s[1] / 2] : s.map(n => n / 2);

type Tab = {
  base: number; o: BodyOpts<any>; p: F32[]; v?: F32[]; q?: F32[];
  list?: Iterable<BodyView> & { capacity: number; $hooks: { add?(v: BodyView): void; remove?(v: BodyView): void } };
  obj?: BodyView; views: (BodyView | undefined)[];
};

/** Starts the worker (or the in-page handler) with a body per bound item and resolves once the engine is ready. */
export async function physics<S extends Shape>(state: State<S>, bodies: Bodies<S>, { worker = true, gravity }: { worker?: boolean; gravity?: Vec } = {}): Promise<Physics> {
  let total = 0;
  const byCols = new Map<Cols, Tab>(), owner: number[] = [];
  const tabs = Object.entries(bodies as Record<string, BodyOpts<any>>).map(([key, o], i) => {
    const t = (state as any)[key], c: Cols | undefined = t?.$cols;
    if (!c) throw new Error(`physics: ${key} is not an object or list in the state`);
    const pick = (ks: string[]) => ks.every(k => c[k] instanceof Float32Array) ? ks.map(k => c[k] as F32) : undefined;
    const p = pick(["x", "y", "z"]);
    if (!p) throw new Error(`physics: ${key} needs number fields x, y and z`);
    const list = "$hooks" in t ? t : undefined, n = list ? list.capacity : 1;
    const tab: Tab = { base: total, o, p, v: pick(["vx", "vy", "vz"]), q: pick(["qx", "qy", "qz", "qw"]), list, obj: list ? undefined : t, views: [] };
    for (let r = 0; r < n; r++) owner[total + r] = i;
    total += n;
    byCols.set(c, tab);
    return tab;
  });
  const tabOf = (v: BodyView) => {
    const t = byCols.get(v?.$cols);
    if (!t || v.$row < 0) throw new Error("physics: that item has no body; pass a live item of a key given to physics()");
    return t;
  };
  const idOf = (v: BodyView) => tabOf(v).base + v.$row;
  // A list item's view is cached on add and checked against its row, since state.restore() can bring back new views.
  const viewOf = (id: number): BodyView | null => {
    const t = tabs[owner[id]], row = id - t.base;
    if (!t.list) return t.obj!;
    let v = t.views[row];
    if (v?.$row !== row) { v = undefined; for (const w of t.list) if (w.$row === row) { v = w; break; } t.views[row] = v; }
    return v ?? null;
  };
  const spec = (t: Tab, v: BodyView): BodySpec => {
    const { size, shape = "box", ...rest } = t.o;
    return { ...rest, shape, size: half(shape, typeof size === "function" ? size(v) : size), row: t.base + v.$row, pos: { x: v.x, y: v.y, z: v.z } };
  };
  const specs = tabs.flatMap(t => t.list ? [...t.list].map(v => { t.views[v.$row] = v; return spec(t, v); }) : [spec(t, t.obj!)]);
  const url = new URL("./physics-worker.js", import.meta.url);
  const inPage = !worker || typeof Worker === "undefined" || new URLSearchParams(globalThis.location?.search).get("worker") === "0";

  // Replies come back in the order messages went out, so each one settles the oldest waiting promise.
  const waiting: { resolve(r: any): void; reject(e: Error): void }[] = [];
  const receive = (r: Reply) => { const w = waiting.shift(); if (r.type === "error") w?.reject(new Error(r.message)); else w?.resolve(r); };
  let send: (m: Msg, transfer: Transferable[]) => void, stop = () => {};
  if (inPage) {
    const handle = (await import(url.href)).createHandler() as (m: Msg) => Promise<[Reply, Transferable[]]>;
    let chain = Promise.resolve();
    send = m => { chain = chain.then(() => handle(m)).then(([r]) => receive(r), (e: Error) => receive({ type: "error", message: String(e?.message ?? e) })); };
  } else {
    const w = new Worker(url, { type: "module" });
    w.onmessage = (e: MessageEvent<Reply>) => receive(e.data);
    w.onerror = e => { e.preventDefault(); receive({ type: "error", message: `physics worker: ${e.message}` }); };
    send = (m, transfer) => w.postMessage(m, transfer);
    stop = () => w.terminate();
  }
  const post = <R>(m: Msg, transfer: Transferable[] = []) => {
    const p = new Promise<R>((resolve, reject) => waiting.push({ resolve, reject }));
    send(m, transfer);
    clock()?.hold?.(p);
    return p;
  };

  clock()?.compiling?.(+1); // a worker's WebAssembly compile is invisible to the clock's boot test
  try { await post({ type: "init", bodies: specs, gravity }); } finally { clock()?.compiling?.(-1); }

  // `list` is the worker's body list once the queued inputs are applied; it is replaced, never changed, so each sent
  // step keeps the bodies its reply's buffer holds.
  let list = specs.map(b => b.row), buf: Float32Array = new Float32Array(list.length * STRIDE);
  let inputs: Input[] = [], rays: RowRay[] = [], handles: RayHandle[] = [], sent: RayHandle[] = [];
  let inflight: Promise<Taken | null> | null = null, pending: Taken | null = null, scheduled = false, closed = false;
  let events: Contact[] = [], hits: (BodyView | null)[] = [];

  // Adds and removes since the last step, applied to `list` once per step (copying it per hook call made clearing
  // 3,000 bodies O(n²)); the result is the order the worker's list has after the same inputs.
  let added: number[] = [], gone = new Set<number>();
  const settleList = () => {
    if (!added.length && !gone.size) return;
    list = (gone.size ? list.filter(r => !gone.has(r)) : list.slice()).concat(added);
    added = []; gone = new Set();
  };
  const flush = () => {
    if (!scheduled) return inflight;
    scheduled = false;
    settleList();
    if (buf.length < list.length * STRIDE) buf = new Float32Array(list.length * STRIDE);
    const msg: Msg = { type: "step", buf, inputs, rays }, rows = list;
    sent = handles; inputs = []; rays = []; handles = [];
    // a step the worker could not run is dropped and reported; left pending, it kept ready() false and froze the game
    return inflight = post<StepReply>(msg, [buf.buffer]).then(r => pending = r && { ...r, rows }, (e: Error) => {
      inflight = null; buf = new Float32Array(list.length * STRIDE); // the sent buffer went with the message
      reportError(e);
      return null;
    });
  };
  const ready = () => !(closed || scheduled || (inflight && !pending));
  // Bodies teleported (bit 1), given a velocity (bit 2), or added or removed (bit 4, skip all) while a step was in
  // flight: that step's reply was computed before the change, so it must not overwrite what the state already shows.
  const keep = new Map<number, number>();
  const mark = (id: number, bit: number) => { if (inflight) keep.set(id, (keep.get(id) ?? 0) | bit); };
  const write = (a: F32[] | undefined, row: number, v: Vec) => { if (a) { a[0][row] = v.x; a[1][row] = v.y; a[2][row] = v.z; } };
  const apply = (r: Taken) => {
    const f = r.buf, rows = r.rows, kept = keep.size > 0;
    // a plain loop with no Map lookup unless something was kept: this runs per body per frame
    for (let i = 0, o = 0; i < rows.length; i++, o += STRIDE) {
      const id = rows[i], t = tabs[owner[id]], row = id - t.base, k = kept ? keep.get(id) ?? 0 : 0, { p, q, v } = t;
      if (k & 4) continue;
      if (!(k & 1)) { p[0][row] = f[o]; p[1][row] = f[o + 1]; p[2][row] = f[o + 2]; }
      if (q) { q[0][row] = f[o + 3]; q[1][row] = f[o + 4]; q[2][row] = f[o + 5]; q[3][row] = f[o + 6]; }
      if (v && !(k & 2)) { v[0][row] = f[o + 7]; v[1][row] = f[o + 8]; v[2][row] = f[o + 9]; }
    }
    keep.clear();
    hits = r.hits.map(h => h === null ? null : viewOf(h));
    hits.forEach((h, i) => { if (sent[i]) sent[i].hit = h; });
    events = [];
    for (const e of r.events) { const a = viewOf(e.a), b = viewOf(e.b); if (a && b) events.push({ a, b, started: e.started, sensor: e.sensor }); }
    buf = f; sent = [];
  };

  for (const t of tabs) if (t.list) t.list.$hooks = {
    add(v) {
      const id = t.base + v.$row;
      inputs.push({ op: "add", body: spec(t, v) }); added.push(id);
      t.views[v.$row] = v; mark(id, 4);
    },
    remove(v) {
      const id = t.base + v.$row;
      inputs.push({ op: "remove", row: id });
      const a = added.lastIndexOf(id);
      if (a >= 0) added.splice(a, 1); else gone.add(id); // one added this frame never reached `list`
      mark(id, 4);
    },
  };

  return {
    step() {
      events = []; hits = [];
      if (!ready()) return false;
      if (pending) { apply(pending); pending = null; inflight = null; }
      scheduled = true;
      clock()?.hold?.(Promise.resolve().then(flush)); // after the frame's own code has queued its inputs
      return true;
    },
    get ready() { return ready(); },
    has: v => byCols.has(v?.$cols) && v.$row >= 0,
    get events() { return events; },
    get hits() { return hits; },
    setVelocity(view, v) { const t = tabOf(view), id = t.base + view.$row; write(t.v, view.$row, v); mark(id, 2); inputs.push({ op: "linvel", row: id, x: v.x, y: v.y, z: v.z }); },
    impulse(view, v) { inputs.push({ op: "impulse", row: idOf(view), x: v.x, y: v.y, z: v.z }); },
    teleport(view, p) { const t = tabOf(view), id = t.base + view.$row; write(t.p, view.$row, p); mark(id, 1); inputs.push({ op: "teleport", row: id, x: p.x, y: p.y, z: p.z }); },
    ray({ from, exclude, ...q }) {
      if (!q.origin && !from) throw new Error("a ray needs an origin or an item to start from");
      const h: RayHandle = { hit: undefined };
      rays.push({ ...q, from: from && idOf(from), exclude: exclude && idOf(exclude) }); handles.push(h);
      return h;
    },
    async settle() { await flush(); },
    close() { closed = true; stop(); for (const w of waiting.splice(0)) w.resolve(null); },
    async snapshot() {
      // Copied as it arrives: the state takes it at the next step() and hands its buffer back to the worker.
      const reply = flush()?.then(r => r && copy(r)) ?? null;
      const { world, meta } = await post<{ world: Uint8Array; meta: Entry[] }>({ type: "snapshot" });
      return { world, meta, reply: await reply };
    },
    // The body list comes from the snapshot and views are looked up from the state when needed, so this pairs with
    // state.restore() (which runs no hooks) in either order.
    async restore(s) {
      await flush();
      if (pending) buf = pending.buf;
      const world = s.world.slice(); // the snapshot stays reusable; the copy goes to the worker by transfer, not cloned again
      await post({ type: "restore", world, meta: s.meta }, [world.buffer]);
      list = s.meta.map(e => e.row); added = []; gone = new Set();
      pending = s.reply && copy(s.reply); inflight = pending && Promise.resolve(pending);
      inputs = []; rays = []; handles = []; sent = []; keep.clear();
    },
  };
}
