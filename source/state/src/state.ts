// Shaped state: the game declares its state as plain defaults (numbers, booleans, nested objects and `list(capacity,
// item)`) and reads and writes it in that shape, `state.player.x += 1` or `state.coins.push({ x: 3 })`, while every
// value lives in typed arrays underneath, one store (store.ts) per table, so snapshots, save, rewind and physics keep
// working on bytes. Top-level scalars are f64 singletons of a root store, every object is a 1-row store, and every list
// is a store of `capacity` rows plus an Int32Array order of live rows. Fields inside objects and lists are f32, or u8
// for booleans. Views are accessor objects built once per table (getters and setters on the columns at the view's
// `$row`), not Proxies, so `coin.x` costs about what the array read does. A list item's view stays the same object while
// the item lives; once removed it reads undefined and its writes go nowhere.
import { createStore, type FieldType, type Store } from "./store.ts";

type Item = Record<string, number | boolean>;
export type Shape = { [k: string]: number | boolean | ListShape<any> | Shape };

/** A list's capacity and item defaults, as declared in a shape; `list()` makes one. */
export class ListShape<I extends Item = Item> { constructor(readonly capacity: number, readonly item: I) {} }

type Plain<S> = { [K in keyof S]: S[K] extends ListShape<infer I> ? Plain<I>[] : S[K] extends number ? number : S[K] extends boolean ? boolean : Plain<S[K]> };
type Patch<S> = { [K in keyof S]?: S[K] extends ListShape<infer I> ? Partial<Plain<I>>[] : S[K] extends number ? number : S[K] extends boolean ? boolean : Patch<S[K]> };
type Cols = Record<string, Float32Array | Uint8Array>;

export type View<S> = { -readonly [K in keyof S]: S[K] extends ListShape<infer I> ? List<I> : S[K] extends number ? number : S[K] extends boolean ? boolean : View<S[K]> }
  & { readonly $row: number; readonly $cols: Cols; toJSON(): Plain<S> };

export type List<I extends Item> = {
  readonly capacity: number;
  readonly length: number;
  /** The item at index i (negative counts from the end), or undefined. */
  at(i: number): View<I> | undefined;
  /** Appends an item, missing fields taken from the declared defaults; throws past capacity. */
  push(item?: Partial<Plain<I>>): View<I>;
  /** Removes an item, keeping the order of the rest; removing the current item while iterating is safe. */
  remove(view: View<I>): void;
  clear(): void;
  [Symbol.iterator](): Iterator<View<I>>;
  toJSON(): Plain<I>[];
  /** For physics: live rows in order (the first `length`), the columns, and hooks that push, remove, clear and set run.
   *  restore() runs no hooks; whatever mirrors the list restores its own state. */
  readonly $order: Int32Array;
  readonly $cols: Cols;
  readonly $hooks: { add?(view: View<I>): void; remove?(view: View<I>): void };
};

export type State<S extends Shape> = View<S> & {
  /** Objects merge field by field; a list given here replaces the list whole. Checked before anything is written. */
  set(partial: Patch<S>): void;
  /** A float in [0, 1) from the root store's random state, which snapshots carry. */
  random(): number;
  /** Every table, every list's order and the random state. */
  snapshot(): ArrayBuffer;
  /** Puts back a snapshot from a state of the same shape; on a mismatch it throws and leaves the state as it was. */
  restore(buf: ArrayBuffer): void;
};

const RESERVED = new Set(["toJSON", "set", "random", "snapshot", "restore"]);
const round = (v: number) => Math.round(v * 100) / 100 + 0; // + 0 turns -0 into 0

/** Declares a list of at most `capacity` items, each holding numbers and booleans with these defaults. */
export function list<I extends Item>(capacity: number, item: I): ListShape<I> {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error(`list capacity must be a whole number above 0, not ${capacity}`);
  for (const [k, d] of Object.entries(item)) if (typeof d !== "number" && typeof d !== "boolean") throw new Error(`list item field "${k}" must be a number or boolean`);
  return new ListShape(capacity, item);
}

const json = (v: any, sh: Shape | Item) => {
  const o: Record<string, unknown> = {};
  for (const k in sh) { const x = v[k]; o[k] = typeof x === "number" ? round(x) : typeof x === "object" ? x.toJSON() : x; }
  return o;
};

// Throws on the first value that does not fit the shape, so set() and push() write nothing when any of it is wrong.
function check(sh: Shape | Item, p: any, path: string) {
  if (p === null || typeof p !== "object" || Array.isArray(p)) throw new Error(`${path || "state"} must be an object, not ${JSON.stringify(p)}`);
  for (const k in p) {
    const d = sh[k], v = p[k], at = path ? `${path}.${k}` : k;
    if (!Object.hasOwn(sh, k)) throw new Error(`the state has no field ${at}`);
    if (d instanceof ListShape) {
      if (!Array.isArray(v)) throw new Error(`${at} must be an array`);
      if (v.length > d.capacity) throw new Error(`${at} holds at most ${d.capacity} items, not ${v.length}`);
      v.forEach((it, i) => check(d.item, it, `${at}[${i}]`));
    } else if (typeof d === "object") check(d, v, at);
    else if (typeof v !== typeof d) throw new Error(`${at} must be a ${typeof d}, not ${JSON.stringify(v)}`);
  }
}

function assign(target: any, sh: Shape, p: any) {
  for (const k in p) {
    const d = sh[k];
    if (d instanceof ListShape) { target[k].clear(); for (const it of p[k]) target[k].push(it); }
    else if (typeof d === "object") assign(target[k], d, p[k]);
    else target[k] = p[k];
  }
}

/** Allocates state in the given shape; `seed` starts the random sequence. */
export function createState<S extends Shape>(shape: S, { seed = 1 }: { seed?: number } = {}): State<S> {
  const stores: Store<any, any>[] = [];
  const lists: { order: Int32Array; length(): number; restored(n: number): void }[] = [];

  // A store for one table and the view class over its columns.
  const table = (sh: Shape | Item, capacity: number, path: string) => {
    const fields = Object.entries(sh).filter(([, d]) => typeof d !== "object") as [string, number | boolean][];
    const st = createStore({ capacity, components: { v: Object.fromEntries(fields.map(([k, d]) => [k, (typeof d === "boolean" ? "bool" : "f32") as FieldType])) } });
    stores.push(st);
    const cols = st.c.v as Cols;
    // Compiled per table: one shared getter would see every table's columns and view class, and an engine that keeps
    // inline caches per function body (JavaScriptCore) then runs it about 10x slower.
    const body = fields.map(([k, d], i) => typeof d === "boolean"
      ? `get [${JSON.stringify(k)}]() { const v = c${i}[this.$row]; return v === undefined ? v : v !== 0; } set [${JSON.stringify(k)}](v) { c${i}[this.$row] = +v; }`
      : `get [${JSON.stringify(k)}]() { return c${i}[this.$row]; } set [${JSON.stringify(k)}](v) { c${i}[this.$row] = v; }`);
    const V: new (row: number) => { $row: number } =
      new Function(...fields.map((_, i) => `c${i}`), `return class { constructor(r) { this.$row = r; } ${body.join(" ")} }`)(...fields.map(([k]) => cols[k]));
    Object.defineProperties(V.prototype, { $cols: { value: cols }, toJSON: { value() { return json(this, sh); } } });
    return { st, V };
  };

  const node = (sh: Shape, path: string, target: any) => {
    for (const [k, d] of Object.entries(sh)) {
      if (k.startsWith("$") || RESERVED.has(k)) throw new Error(`${path}${k} is a reserved name; rename that field`);
      if (typeof d !== "object" && typeof d !== "number" && typeof d !== "boolean") throw new Error(`${path}${k} must be a number or boolean, not ${typeof d}; state holds only numbers and booleans`);
      if (typeof d === "object") Object.defineProperty(target, k, { enumerable: true, value: d instanceof ListShape ? makeList(d, path + k) : object(d, `${path}${k}.`) });
      else if (target.$row === 0) target[k] = d;
    }
    return target;
  };

  const object = (sh: Shape, path: string) => {
    const { st, V } = table(sh, 1, path);
    st.spawn();
    return node(sh, path, new V(0));
  };

  const makeList = ({ capacity, item }: ListShape, path: string) => {
    for (const k in item) if (k.startsWith("$") || RESERVED.has(k)) throw new Error(`${path}[].${k} is a reserved name; rename that field`);
    const { st, V } = table(item, capacity, path);
    const order = new Int32Array(capacity), views: (InstanceType<typeof V> | undefined)[] = new Array(capacity);
    let n = 0;
    const l: List<Item> = {
      capacity, $order: order, $cols: st.c.v as Cols, $hooks: {},
      get length() { return n; },
      at(i) { if (i < 0) i += n; return i >= 0 && i < n ? views[order[i]] as any : undefined; },
      push(it = {}) {
        if (n === capacity) throw new Error(`${path} is full: it holds at most ${capacity} items; raise the capacity in list(${capacity}, ...)`);
        check(item, it, `${path}[${n}]`);
        const row = st.spawn(), v: any = views[row] = new V(row);
        order[n++] = row;
        for (const k in item) v[k] = (it as Item)[k] ?? item[k];
        l.$hooks.add?.(v);
        return v;
      },
      remove(v) {
        if (v.$row < 0 || views[v.$row] !== v) throw new Error(`that item is not in ${path}`);
        l.$hooks.remove?.(v);
        const i = order.subarray(0, n).lastIndexOf(v.$row);
        order.copyWithin(i, i + 1, n); n--;
        st.despawn(v.$row); views[v.$row] = undefined; (v as { $row: number }).$row = -1;
      },
      // last first, so pushing as many items back takes the same rows and leaves the free list as it was
      clear() { while (n) l.remove(views[order[n - 1]] as any); },
      toJSON() { return Array.from(l, v => v.toJSON()); },
      // a plain iterator, not a generator (3× faster in a per-frame for-of); an item removed by the loop body steps back,
      // since the items after it moved up one
      [Symbol.iterator]() {
        let i = 0, last: any = null;
        const it = {
          next() {
            if (last && last.$row < 0) i--;
            last = null;
            if (i >= n) return { done: true as const, value: undefined };
            last = views[order[i++]];
            return { done: false as const, value: last };
          },
          [Symbol.iterator]() { return it; },
        };
        return it;
      },
    };
    lists.push({
      order, length: () => n,
      restored(m) {
        n = m;
        views.forEach((v, r) => { if (v && !st.alive[r]) { v.$row = -1; views[r] = undefined; } });
        for (let i = 0; i < n; i++) views[order[i]] ??= new V(order[i]);
      },
    });
    return l;
  };

  const scalars = Object.fromEntries(Object.entries(shape).filter(([, d]) => typeof d !== "object")) as Record<string, number | boolean>;
  const root = createStore({ capacity: 0, components: {}, singletons: scalars, seed });
  stores.push(root);
  const state: any = {};
  for (const k in scalars) Object.defineProperty(state, k, { enumerable: true, get: () => root.s[k], set(v) { root.s[k] = v; } });
  node(shape, "", state);

  const snapshot = () => {
    const parts = [...stores.map(s => new Uint8Array(s.snapshot())), ...lists.map(l => new Uint8Array(l.order.buffer, 0, l.length() * 4))];
    const head = 4 * (1 + parts.length), out = new Uint8Array(head + parts.reduce((t, p) => t + p.length, 0)), dv = new DataView(out.buffer);
    dv.setUint32(0, parts.length, true);
    let at = head;
    parts.forEach((p, i) => { dv.setUint32(4 + 4 * i, p.length, true); out.set(p, at); at += p.length; });
    return out.buffer;
  };
  const put = (buf: ArrayBuffer) => {
    const dv = new DataView(buf), count = buf.byteLength >= 4 ? dv.getUint32(0, true) : -1;
    const lens = count === stores.length + lists.length && buf.byteLength >= 4 * (1 + count) ? Array.from({ length: count }, (_, i) => dv.getUint32(4 + 4 * i, true)) : [];
    if (!lens.length || buf.byteLength !== 4 * (1 + count) + lens.reduce((t, n) => t + n, 0)) throw new Error("snapshot does not match this state's shape");
    let at = 4 * (1 + count);
    const take = (n: number) => buf.slice(at, at += n);
    for (const s of stores) s.restore(take(lens.shift()!));
    for (const l of lists) {
      const n = lens.shift()!;
      if (n % 4 || n / 4 > l.order.length) throw new Error("snapshot does not match this state's shape");
      l.order.set(new Int32Array(take(n)));
      l.restored(n / 4);
    }
  };

  return Object.defineProperties(state, {
    toJSON: { value: () => json(state, shape) },
    set: { value(p: unknown) { check(shape, p, ""); assign(state, shape, p); } },
    random: { value: () => root.random() },
    snapshot: { value: snapshot },
    restore: { value(buf: ArrayBuffer) { const before = snapshot(); try { put(buf); } catch (e) { put(before); throw e; } } },
  });
}

/** Writes each live item's transform (`x/y/z`, and `qx/qy/qz/qw` when the item has them; scale 1) into `out`, 16 floats
 *  per item in list order, column-major as `InstancedMesh.instanceMatrix.array` holds them, straight from the columns
 *  with no views or Matrix4; returns the item count (at most what `out` holds), for the mesh's `count`. Set `instanceMatrix.needsUpdate` after. */
export function matrices(l: Pick<List<any>, "length" | "$order" | "$cols">, out: Float32Array): number {
  const c = l.$cols, n = Math.min(l.length, out.length >> 4), ord = l.$order, X = c.x, Y = c.y, Z = c.z, QX = c.qx, QY = c.qy, QZ = c.qz, QW = c.qw, rot = !!(QX && QY && QZ && QW);
  for (let i = 0, o = 0; i < n; i++, o += 16) {
    const r = ord[i], x = rot ? QX[r] : 0, y = rot ? QY[r] : 0, z = rot ? QZ[r] : 0, w = rot ? QW[r] : 1; // three's Matrix4.compose
    const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    out[o] = 1 - (yy + zz); out[o + 1] = xy + wz; out[o + 2] = xz - wy; out[o + 3] = 0;
    out[o + 4] = xy - wz; out[o + 5] = 1 - (xx + zz); out[o + 6] = yz + wx; out[o + 7] = 0;
    out[o + 8] = xz + wy; out[o + 9] = yz - wx; out[o + 10] = 1 - (xx + yy); out[o + 11] = 0;
    out[o + 12] = X[r]; out[o + 13] = Y[r]; out[o + 14] = Z[r]; out[o + 15] = 1;
  }
  return n;
}
