// A mesh report for agents, injected after devtools.js: window.__harness.stats(target, opts).
// The target is an Object3D, the name of an object in the main scene (the scene with the most children, the same pick
// as observe()), a BufferGeometry, or nothing for the whole main scene. Every mesh under it gets one entry: counts,
// world-space bounds, attribute and material names, and whether the surface is closed. A closed surface also gets its
// volume and genus, so an agent building procedural geometry can check each step with numbers instead of a picture.
// Topology welds vertices by position quantised to 1e-5, so the split seams three's primitives have (normals, uvs) do
// not count as holes: an open-addressing hash over the integer triple (a string key only when one leaves int32), and
// edges counted in runs of one sorted Float64Array, 2-3x faster than a string per vertex and an array per edge. It
// reads attribute arrays through getX/getY/getZ (which also covers interleaved attributes) and imports nothing from
// three, so it works on bundled pages too. The result is tagged kind: "stats" for `eval`.
(() => {
  const h = window.__harness;
  const r = (v) => Math.round(v * 1000) / 1000;
  const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const tris = (g) => Math.floor((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3);
  h.tris = tris; // `perf { costs }` counts triangles as stats() does (perf.ts COSTS)

  // shortcut: groups and drawRange are ignored (the whole index is one surface), and skinned or morphed meshes are
  // measured in their rest pose; upgrade when an agent needs a sub-range or a posed mesh measured.
  const measure = (g, e, name, type) => {
    const p = g.attributes.position, n = p.count, ix = g.index, F0 = tris(g);
    if (!g.boundingBox) g.computeBoundingBox();
    const { min: b0, max: b1 } = g.boundingBox, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? b1.x : b0.x, y = i & 2 ? b1.y : b0.y, z = i & 4 ? b1.z : b0.z;
      const c0 = e[0] * x + e[4] * y + e[8] * z + e[12], c1 = e[1] * x + e[5] * y + e[9] * z + e[13], c2 = e[2] * x + e[6] * y + e[10] * z + e[14];
      lo[0] = Math.min(lo[0], c0); hi[0] = Math.max(hi[0], c0); lo[1] = Math.min(lo[1], c1); hi[1] = Math.max(hi[1], c1); lo[2] = Math.min(lo[2], c2); hi[2] = Math.max(hi[2], c2);
    }
    const world = new Float64Array(n * 3), weld = new Int32Array(n), q = new Int32Array(n * 3);
    let small = true;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const w0 = e[0] * x + e[4] * y + e[8] * z + e[12], w1 = e[1] * x + e[5] * y + e[9] * z + e[13], w2 = e[2] * x + e[6] * y + e[10] * z + e[14];
      world[i * 3] = w0; world[i * 3 + 1] = w1; world[i * 3 + 2] = w2;
      const a = Math.round(w0 * 1e5), b = Math.round(w1 * 1e5), c = Math.round(w2 * 1e5);
      if (small && (Math.abs(a) > 2147483647 || Math.abs(b) > 2147483647 || Math.abs(c) > 2147483647)) small = false;
      q[i * 3] = a; q[i * 3 + 1] = b; q[i * 3 + 2] = c;
    }
    if (small) {
      let size = 1; while (size < n * 2) size <<= 1;
      const table = new Int32Array(size).fill(-1), mask = size - 1;
      for (let i = 0; i < n; i++) {
        const a = q[i * 3], b = q[i * 3 + 1], c = q[i * 3 + 2];
        let s = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & mask, id;
        for (;;) {
          id = table[s];
          if (id === -1) { table[s] = id = i; break; }
          if (q[id * 3] === a && q[id * 3 + 1] === b && q[id * 3 + 2] === c) break;
          s = (s + 1) & mask;
        }
        weld[i] = id;
      }
    } else {
      const seen = new Map();
      for (let i = 0; i < n; i++) {
        const w0 = world[i * 3], w1 = world[i * 3 + 1], w2 = world[i * 3 + 2];
        const key = `${Math.round(w0 * 1e5)},${Math.round(w1 * 1e5)},${Math.round(w2 * 1e5)}`;
        let id = seen.get(key);
        if (id === undefined) seen.set(key, id = i);
        weld[i] = id;
      }
    }
    const root = new Int32Array(n); for (let i = 0; i < n; i++) root[i] = i;
    const find = (a) => { while (root[a] !== a) a = root[a] = root[root[a]]; return a; };
    const keys = new Float64Array(F0 * 3), usedMark = new Uint8Array(n);
    let F = 0, E3 = 0, vol = 0, usedCount = 0;
    const w = world, ia = ix?.array, direct = ia && !ix.isInterleavedBufferAttribute && ix.itemSize === 1;
    for (let t = 0; t < F0; t++) {
      const i0 = ix ? (direct ? ia[t * 3] : ix.getX(t * 3)) : t * 3, i1 = ix ? (direct ? ia[t * 3 + 1] : ix.getX(t * 3 + 1)) : t * 3 + 1, i2 = ix ? (direct ? ia[t * 3 + 2] : ix.getX(t * 3 + 2)) : t * 3 + 2;
      const a = weld[i0], b = weld[i1], c = weld[i2];
      if (a === b || b === c || a === c) continue;
      F++;
      keys[E3++] = a < b ? a * n + b : b * n + a;
      keys[E3++] = b < c ? b * n + c : c * n + b;
      keys[E3++] = c < a ? c * n + a : a * n + c;
      root[find(a)] = find(b); root[find(b)] = find(c); root[find(c)] = find(a);
      if (!usedMark[a]) { usedMark[a] = 1; usedCount++; }
      if (!usedMark[b]) { usedMark[b] = 1; usedCount++; }
      if (!usedMark[c]) { usedMark[c] = 1; usedCount++; }
      const A = i0 * 3, B = i1 * 3, C = i2 * 3;
      vol += (w[A] * (w[B + 1] * w[C + 2] - w[B + 2] * w[C + 1]) - w[A + 1] * (w[B] * w[C + 2] - w[B + 2] * w[C]) + w[A + 2] * (w[B] * w[C + 1] - w[B + 1] * w[C])) / 6;
    }
    const ks = keys.subarray(0, E3).sort();
    let openEdges = 0, edgeCount = 0;
    for (let i = 0; i < E3;) { let j = i + 1; while (j < E3 && ks[j] === ks[i]) j++; edgeCount++; if (j - i !== 2) openEdges++; i = j; }
    let parts = 0;
    for (let v = 0; v < n; v++) if (usedMark[v] && find(v) === v) parts++;
    const closed = F > 0 && openEdges === 0;
    const out = { name, type, vertices: n, triangles: F0,
      bounds: { min: lo.map(r), max: hi.map(r), size: hi.map((v, k) => r(v - lo[k])) },
      attributes: Object.entries(g.attributes).map(([k, a]) => `${k}:${a.itemSize}`),
      closed, openEdges, parts };
    if (closed) { out.volume = r(vol); out.genus = parts - (usedCount - edgeCount + F) / 2; }
    return out;
  };

  h.stats = (target, opts = {}) => {
    const max = opts.max ?? 40; // the same list cap as the server's other tools
    if (target?.isBufferGeometry) {
      const m = measure(target, ID, target.name, target.type);
      return { kind: "stats", meshes: [m], total: { meshes: 1, vertices: m.vertices, triangles: m.triangles } };
    }
    const scene = h.mainScene();
    let root = target ?? scene;
    if (typeof target === "string") {
      root = scene?.getObjectByName(target);
      if (!root) throw new Error(`no object named "${target}" in the main scene`);
    }
    if (!root?.traverse) throw new Error("stats takes an Object3D, an object's name, a BufferGeometry or nothing");
    const found = [];
    root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) found.push(o); });
    const meshes = found.slice(0, max).map((o) => {
      o.updateWorldMatrix(true, false);
      const m = measure(o.geometry, o.matrixWorld.elements, o.name, o.type);
      if (o.isInstancedMesh) m.instances = o.count;
      m.material = [o.material].flat().filter(Boolean).map((x) => x.name || x.type);
      return m;
    });
    const out = { kind: "stats", meshes, total: { meshes: found.length,
      vertices: found.reduce((s, o) => s + o.geometry.attributes.position.count, 0),
      triangles: found.reduce((s, o) => s + tris(o.geometry), 0) } };
    if (found.length > max) out.cut = `${found.length - max} more`;
    return out;
  };
})();
