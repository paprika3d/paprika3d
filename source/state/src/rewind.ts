// Rewind within a byte cap: wraps the game's per-frame function so every frame's inputs are logged and a store snapshot
// is kept every K frames, all in memory and never on disk. History is a ring of segments, each a snapshot plus the
// inputs of the K frames after it; when snapshots, logs and the string table pass `capBytes`, the oldest segment goes.
// Segments older than HISTORY frames go too, so the cap is a ceiling, not a target. `back(n)` restores the nearest
// snapshot at or before frame now - n and replays the logged inputs up to it, which is exact because the store holds
// all state, randomness included. Later history is discarded, as in an undo stack.
// Inputs are encoded as tagged values with interned strings and zigzag varints, so a frame with no input costs one byte
// and `{ key: "ArrowLeft", down: true }` costs seven. K comes from the snapshot size: snapshots get at most half the cap
// over HISTORY frames, K = max(60, ceil(2 * HISTORY * snapshotBytes / capBytes)), with one snapshot a second at most so
// back() replays at most K frames and a small game keeps five minutes in tens of KB.
// State outside the store, such as the physics world, joins through `extra`, snapshotted with each store snapshot.
// frame() and back() return promises, but with a synchronous step and no `extra` they finish before returning, so a
// plain game may call them without awaiting. With either one async, await each call before the next. Under the harness,
// frame() hands its promise to `__clock.hold()`, so a paused clock's next frame waits for the whole frame, snapshot included.

type Snapshots = { snapshot(): ArrayBuffer; restore(buf: ArrayBuffer): void };
/** State kept beside the store's, such as `physics()`: its snapshot counts toward the cap when it is an ArrayBuffer, a
 *  typed array or has a `world` Uint8Array. */
export type Extra<S = any> = {
  snapshot(): Promise<S>; restore(s: S): Promise<void>;
  /** Awaited after each frame back() replays, so work a frame leaves in flight (a physics step) is done before the next. */
  settle?(): Promise<void>;
};

export type Rewind<I> = {
  /** Logs this frame's inputs (the act() objects that reached the game during it), then runs `step(inputs)`. */
  frame(inputs?: I[]): Promise<void>;
  /** Goes back n frames: restores the nearest snapshot at or before now - n and replays the logged inputs up to it.
   *  Resolves to the new frame number; rejects when n reaches past the oldest frame still kept. */
  back(n: number): Promise<number>;
  /** Frames run since the first frame() call, which takes the first snapshot as frame 0, minus frames gone back. */
  readonly now: number;
  /** The oldest frame back() can still reach. */
  readonly earliest: number;
  /** Frames between snapshots, chosen from the latest snapshot's size. */
  readonly every: number;
  /** Bytes held: snapshots (with `extra`'s), input logs (the open one at its allocated size) and the interned strings. */
  usedBytes(): number;
};

/** History kept, in frames: five minutes at 60 fps. Snapshots get at most half the cap over it. */
export const HISTORY = 5 * 60 * 60;

/** Frames between snapshots for a snapshot of `bytes` under `capBytes`. */
export const framesPerSnapshot = (bytes: number, capBytes: number) => Math.max(60, Math.ceil(2 * HISTORY * bytes / capBytes));

// value tags
const UNDEF = 0, NULL = 1, FALSE = 2, TRUE = 3, INT = 4, F64 = 5, STR = 6, ARR = 7, OBJ = 8;

type Segment = { start: number; snap: ArrayBuffer; extra?: unknown; size: number; log: Uint8Array; frames: number };

// A physics snapshot is its (deflated) world plus its body list and the reply it carries, which at 1,000 bodies weigh as
// much as the deflated world; about 48 bytes an entry on the heap.
const sizeOf = (x: any): number =>
  x instanceof ArrayBuffer || ArrayBuffer.isView(x) ? x.byteLength
  : x?.world instanceof Uint8Array ? x.world.byteLength + (x.meta?.length ?? 0) * 48 + (x.reply?.buf?.byteLength ?? 0) : 0;

/** Wraps `step`, the game's per-frame function, with rewind. */
export function rewind<I = unknown>(
  store: Snapshots,
  { step, capBytes = 4 << 20, extra }: { step: (inputs: I[]) => void | Promise<void>; capBytes?: number; extra?: Extra },
): Rewind<I> {
  const strs: string[] = [], ids = new Map<string, number>();
  let strBytes = 0;
  let buf = new Uint8Array(256), len = 0; // the open segment's log
  const f64 = new Float64Array(1), f64b = new Uint8Array(f64.buffer);
  const closed: Segment[] = [];
  let closedBytes = 0, now = 0, every = 1, open: Segment | undefined;

  const room = (n: number) => {
    if (len + n <= buf.length) return;
    const next = new Uint8Array(Math.max(buf.length * 2, len + n));
    next.set(buf.subarray(0, len));
    buf = next;
  };
  const uint = (v: number) => { room(5); while (v > 0x7f) { buf[len++] = (v & 0x7f) | 0x80; v >>>= 7; } buf[len++] = v; };
  const str = (s: string) => {
    let id = ids.get(s);
    if (id === undefined) { ids.set(s, id = strs.length); strs.push(s); strBytes += 2 * s.length + 32; }
    uint(id);
  };
  const value = (v: unknown): void => {
    room(1);
    if (v === undefined) buf[len++] = UNDEF;
    else if (v === null) buf[len++] = NULL;
    else if (typeof v === "boolean") buf[len++] = v ? TRUE : FALSE;
    else if (typeof v === "number") {
      if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff && !Object.is(v, -0)) { buf[len++] = INT; uint(((v << 1) ^ (v >> 31)) >>> 0); }
      else { buf[len++] = F64; f64[0] = v; room(8); buf.set(f64b, len); len += 8; }
    } else if (typeof v === "string") { buf[len++] = STR; str(v); }
    else if (Array.isArray(v)) { buf[len++] = ARR; uint(v.length); for (const x of v) value(x); }
    else if (typeof v === "object") {
      const entries = Object.entries(v);
      buf[len++] = OBJ; uint(entries.length);
      for (const [k, x] of entries) { str(k); value(x); }
    } else throw new Error(`rewind cannot log an input value of type ${typeof v}`);
  };

  let at = 0; // read position in buf
  const readUint = () => { let v = 0, shift = 0, b: number; do { b = buf[at++]; v += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80); return v; };
  const read = (): unknown => {
    switch (buf[at++]) {
      case UNDEF: return undefined;
      case NULL: return null;
      case FALSE: return false;
      case TRUE: return true;
      case INT: { const z = readUint(); return (z >>> 1) ^ -(z & 1); }
      case F64: f64b.set(buf.subarray(at, at + 8)); at += 8; return f64[0];
      case STR: return strs[readUint()];
      case ARR: return Array.from({ length: readUint() }, read);
      default: {
        const o: Record<string, unknown> = {};
        for (let n = readUint(); n > 0; n--) { const k = strs[readUint()]; o[k] = read(); }
        return o;
      }
    }
  };

  // A snapshot over the cap is reported once and kept as the only one (older segments go as usual): throwing here
  // stopped the game itself, since loop() runs the game's step inside frame().
  let warned = false;
  const openAt = (s: Segment) => {
    if (s.size > capBytes && !warned) { warned = true; console.error(`rewind: a snapshot is ${s.size} bytes, over the rewind cap of ${capBytes}; raise capBytes (rewind keeps only the latest snapshot meanwhile)`); }
    every = framesPerSnapshot(s.size, capBytes);
    return open = s;
  };
  // synchronous without `extra`, so a plain game's frame() never yields
  const take = (start: number) => {
    const snap = store.snapshot(), seg = (more?: unknown) => openAt({ start, snap, extra: more, size: snap.byteLength + sizeOf(more), log: buf, frames: 0 });
    return extra ? extra.snapshot().then(seg) : seg();
  };
  const used = () => open ? closedBytes + open.size + buf.length + strBytes : 0;
  const drop = (s: Segment) => { closedBytes -= s.size + s.log.length; };
  const earliest = () => (closed[0] ?? open)?.start ?? 0;

  const game = {
    async frame(inputs: I[] = []) {
      if (!open) { const s = take(0); if (s instanceof Promise) await s; }
      else if (open.frames >= every || len >= capBytes / 8) {
        // the new snapshot first: if it fails, the open segment stays open, not pushed again on every retry
        const prev = open, log = buf.slice(0, len);
        const s = take(now); if (s instanceof Promise) await s;
        closed.push({ ...prev, log });
        closedBytes += prev.size + log.length;
        len = 0;
      }
      const mark = len;
      uint(inputs.length);
      for (const x of inputs) value(x);
      try { const r = step(inputs); if (r) await r; } catch (e) { len = mark; throw e; }
      open!.frames++; now++;
      // drop the oldest segment while over the cap, or while the next one alone still reaches HISTORY frames back
      while (closed.length && (used() > capBytes || (closed[1] ?? open!).start <= now - HISTORY)) drop(closed.shift()!);
    },
    async back(n: number) {
      if (!Number.isInteger(n) || n < 0) throw new Error(`back(n) needs a whole number of frames, not ${n}`);
      const target = now - n;
      if (target < earliest()) throw new RangeError(`can go back at most ${now - earliest()} frames, not ${n}`);
      if (n === 0 || !open) return now;
      if (target < open.start) {
        while (closed.at(-1)!.start > target) drop(closed.pop()!);
        const s = closed.pop()!;
        drop(s);
        len = 0; room(s.log.length); buf.set(s.log); len = s.log.length;
        openAt(s);
      }
      const seg = open;
      store.restore(seg.snap);
      if (extra) await extra.restore(seg.extra);
      at = 0;
      for (let f = seg.start; f < target; f++) {
        const r = step(Array.from({ length: readUint() }, read) as I[]);
        if (r) await r;
        await extra?.settle?.();
      }
      len = at; seg.frames = target - seg.start; now = target;
      return now;
    },
    get now() { return now; },
    get earliest() { return earliest(); },
    get every() { return every; },
    usedBytes: used,
  };
  const run = game.frame;
  game.frame = inputs => { const p = run(inputs); (globalThis as { __clock?: { hold?(p: Promise<unknown>): void } }).__clock?.hold?.(p); return p; };
  return game;
}
