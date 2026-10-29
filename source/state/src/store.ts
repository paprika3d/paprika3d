// The game state store: every component field is one typed array allocated once at `capacity` (struct of arrays,
// laid out like bitECS), entities are row indices, and singletons share one small Float64Array. Keeping all state in
// flat arrays is what makes the rest cheap: a snapshot is a byte copy of each array up to the highest row ever used, so
// rewind and save cost bytes in proportion to what the game spawned, not to its capacity, and the bridge, rewind and the
// physics worker all read the same arrays. Randomness lives in a singleton too, so restoring a snapshot also restores
// the random sequence, and rewind plus replay is exact in production, not only under the harness's seeded Math.random.
// Despawned rows go on a free list that the snapshot keeps, so after a restore the next spawn reuses the same row.

export type FieldType = "f32" | "i32" | "u16" | "u8" | "bool";
type Arrays = { f32: Float32Array; i32: Int32Array; u16: Uint16Array; u8: Uint8Array; bool: Uint8Array };
const ARRAY = { f32: Float32Array, i32: Int32Array, u16: Uint16Array, u8: Uint8Array, bool: Uint8Array };

export type Components = Record<string, Record<string, FieldType>>;
export type Singletons = Record<string, number | boolean>;

export type Store<C extends Components, S extends Singletons> = {
  readonly capacity: number;
  /** The schema passed to createStore, so readers such as the bridge know each field's type. */
  readonly components: C;
  /** Field arrays: `store.c.pos.x[row]`. */
  readonly c: { [K in keyof C]: { [F in keyof C[K]]: Arrays[C[K][F]] } };
  /** Singletons, read and written as properties: `store.s.score += 1`. */
  readonly s: { -readonly [K in keyof S]: S[K] extends boolean ? boolean : number };
  /** 1 where a row holds a live entity. */
  readonly alive: Uint8Array;
  /** One past the highest row ever used; live rows are the ones below it with `alive[row]`. */
  readonly rows: number;
  /** Named entities, name to row, in spawn order. */
  readonly names: ReadonlyMap<string, number>;
  /** Takes a free row with every field zeroed, optionally naming it; throws when all `capacity` rows are live. */
  spawn(name?: string): number;
  /** Frees a live row and drops its name. */
  despawn(row: number): void;
  /** The row of a named entity; throws when there is none. */
  get(name: string): number;
  /** A float in [0, 1) from mulberry32, whose state is a singleton. */
  random(): number;
  /** Header, singletons, then each array up to `rows`, the free list and the names. */
  snapshot(): ArrayBuffer;
  /** Puts back a snapshot taken from a store with the same schema and capacity. */
  restore(buf: ArrayBuffer): void;
};

const MAGIC = 0x31545347, HEADER = 20; // "GST1"; magic, capacity, rows, free count, names byte length (u32 each)

/** Allocates a store; `seed` starts the random sequence. */
export function createStore<C extends Components, S extends Singletons = {}>(
  { capacity, components, singletons = {} as S, seed = 1 }: { capacity: number; components: C; singletons?: S; seed?: number },
): Store<C, S> {
  const alive = new Uint8Array(capacity), free = new Uint32Array(capacity);
  const keys = Object.keys(singletons), single = new Float64Array(keys.length + 1), RNG = keys.length;
  const names = new Map<string, number>();
  let rows = 0, freeN = 0;

  const c = {} as Record<string, Record<string, Arrays[FieldType]>>;
  const arrays: Arrays[FieldType][] = [alive]; // every per-row array, alive first, in snapshot order
  for (const [k, fields] of Object.entries(components)) {
    c[k] = {};
    for (const [f, t] of Object.entries(fields)) arrays.push(c[k][f] = new ARRAY[t](capacity));
  }
  const rowBytes = arrays.reduce((n, a) => n + a.BYTES_PER_ELEMENT, 0);
  const bytes = (a: Arrays[FieldType] | Float64Array | Uint32Array, n: number) => new Uint8Array(a.buffer, a.byteOffset, n * a.BYTES_PER_ELEMENT);

  const s = {};
  keys.forEach((k, i) => {
    const bool = typeof singletons[k] === "boolean";
    single[i] = +singletons[k];
    Object.defineProperty(s, k, { enumerable: true, get: () => bool ? single[i] !== 0 : single[i], set: (v: number | boolean) => { single[i] = +v; } });
  });
  single[RNG] = seed >>> 0;

  const store = {
    capacity, components, c, s, alive, names,
    get rows() { return rows; },
    spawn(name?: string) {
      if (name !== undefined && names.has(name)) throw new Error(`an entity named "${name}" already exists`);
      let row: number;
      if (freeN) row = free[--freeN];
      else if (rows < capacity) row = rows++;
      else throw new Error(`store is full: all ${capacity} rows are live; raise capacity in createStore`);
      for (const a of arrays) a[row] = 0;
      alive[row] = 1;
      if (name !== undefined) names.set(name, row);
      return row;
    },
    despawn(row: number) {
      if (!alive[row]) throw new Error(`row ${row} is not a live entity`);
      alive[row] = 0;
      free[freeN++] = row;
      for (const [n, r] of names) if (r === row) { names.delete(n); break; }
    },
    get(name: string) {
      const row = names.get(name);
      if (row === undefined) throw new Error(`no entity named "${name}"`);
      return row;
    },
    random() {
      const st = single[RNG] = (single[RNG] + 0x6d2b79f5) >>> 0;
      let t = Math.imul(st ^ (st >>> 15), st | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    snapshot() {
      const nameBytes = new TextEncoder().encode(JSON.stringify([...names]));
      const out = new Uint8Array(HEADER + single.byteLength + rows * rowBytes + freeN * 4 + nameBytes.length);
      new Uint32Array(out.buffer, 0, 5).set([MAGIC, capacity, rows, freeN, nameBytes.length]);
      let at = HEADER;
      for (const b of [bytes(single, single.length), ...arrays.map(a => bytes(a, rows)), bytes(free, freeN), nameBytes]) { out.set(b, at); at += b.length; }
      return out.buffer;
    },
    restore(buf: ArrayBuffer) {
      const [magic, cap, n, fn, nl] = buf.byteLength >= HEADER ? new Uint32Array(buf.slice(0, HEADER)) : [];
      if (magic !== MAGIC || cap !== capacity || buf.byteLength !== HEADER + single.byteLength + n * rowBytes + fn * 4 + nl)
        throw new Error(`snapshot does not match this store (capacity ${capacity}, ${rowBytes} bytes per row, ${keys.length} singletons)`);
      const src = new Uint8Array(buf);
      let at = HEADER;
      const take = (dst: Uint8Array) => { dst.set(src.subarray(at, at + dst.length)); at += dst.length; };
      take(bytes(single, single.length));
      for (const a of arrays) { take(bytes(a, n)); a.fill(0, n, rows); }
      take(bytes(free, fn));
      names.clear();
      for (const [k, r] of JSON.parse(new TextDecoder().decode(src.subarray(at)))) names.set(k, r);
      rows = n; freeN = fn;
    },
  };
  return store as unknown as Store<C, S>;
}
