// The coplanar surfaces `look` names from the live scene: two meshes with faces in one plane, facing the same way and
// overlapping, flicker between each other as the camera moves (z-fighting). Found from the scene graph, not the picture,
// so a flicker too small to see in one look is still named (AA-3D gpu-short-1: angry-bird's mound top, robot-arm's box).

/** Runs in the page; returns up to 3 `Surfaces: ...` lines for fights in view and 1 `Surfaces out of view: ...` line, plus a
 * `Surfaces: not checked for N of M meshes` line (a note, not a fault) when its work budget (35 million units, about 300 ms
 * on an M3 laptop; `__harnessConfig.coplanarWork`) or triangle limit ran out first. */
export const COPLANAR = `(() => {
  // The budget counts work, not time, so a loaded machine names the fights an idle one does (#196: timed, the Studio at load
  // 20-36 named one in 22-27 of 63 flicker cells). A unit is about 8.5 ns on an M3 laptop, where each step's count below was
  // measured; the counts are whole numbers, since adding fractions slowed a check of 2.7 million face pairs by 10%.
  let spent = 0;
  const h = window.__harness, budget = window.__harnessConfig?.coplanarWork ?? 3.5e7, late = (share = 1) => spent > budget * share;
  const [scene, { camera: c0 }] = h.main(), camera = h.lookCam?.from === c0 ? h.lookCam.to : c0; // as SETUP: \`look\`'s stand-in camera
  // a material that places its own vertices draws elsewhere than its geometry; polygon offset is the fix; no depth test never fights
  const skip = m => !m || m.polygonOffset || !m.depthTest || m.isShaderMaterial || Object.hasOwn(m, "onBeforeCompile");
  const meshes = [];
  scene.traverseVisible(o => {
    const g = o.geometry, p = g?.attributes?.position;
    if (!o.isMesh || o.isSkinnedMesh || !p || g.morphAttributes?.position || (o.isInstancedMesh && !o.count) || [o.material].flat().some(skip)) return;
    g.boundingSphere ?? g.computeBoundingSphere();
    meshes.push(o);
  });
  const size = o => o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
  meshes.sort((a, b) => size(b) - size(a));
  // world-space triangles, largest meshes first; an InstancedMesh's instances are all its own triangles (a wall of
  // instanced bricks whose top row is flush with the mortar fights there, not at the first brick: 3jsbench pilot-1)
  // shortcut: a mesh over 20k triangles (instances included) is judged by its first 20k, the scene by its first 500k;
  // raise them if a big merged mesh hides a fight. Two instances of one InstancedMesh pair as two faces of one mesh do.
  const tris = [], unchecked = new Set(); // unchecked: meshes some of whose faces were not compared within the budget
  let total = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const o of meshes) {
    if (total >= 500000) { for (let i = tris.length; i < meshes.length; i++) unchecked.add(i); break; }
    // a quarter of the budget at most here and half to the planes below, so the faces taken in are compared (a check out of
    // time in these stages left no time to compare any: checked 0 of 103 meshes); at the default budget the 500k-triangle
    // cap stops each of these stages under 5 million units, so the shares bind only a lowered coplanarWork
    if (late(0.25)) { for (let i = tris.length; i < meshes.length; i++) unchecked.add(i); break; }
    const g = o.geometry, pos = g.attributes.position, idx = g.index, per = ((idx ? idx.count : pos.count) / 3) | 0;
    const copies = o.isInstancedMesh ? o.count : 1, n = Math.min(per * copies, 20000, 500000 - total), w = new Float64Array(n * 9), m = o.matrixWorld.clone(), im = m.clone();
    for (let i = 0; i < n * 3; i++) {
      if (i % (per * 3) === 0) { m.copy(o.matrixWorld); if (o.isInstancedMesh) { o.getMatrixAt(i / (per * 3), im); m.multiply(im); } }
      const a = m.elements, k = i % (per * 3), v = idx ? idx.getX(k) : k, x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), s = i * 3;
      const X = w[s] = a[0] * x + a[4] * y + a[8] * z + a[12], Y = w[s + 1] = a[1] * x + a[5] * y + a[9] * z + a[13], Z = w[s + 2] = a[2] * x + a[6] * y + a[10] * z + a[14];
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
    }
    tris.push(w); total += n; spent += 10 * n;
  }
  const R = Math.max(1e-6, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2), minA = 1e-10 * R * R;
  // Faces fight when the depth buffer cannot tell them apart: a 24-bit buffer's step at their distance from the camera
  // (z² / (near · 2^24) for a perspective camera, linear for an orthographic one). Planes are bucketed by the step at the
  // scene's far side (kept within 1e-6 to 1e-3 of its size), and each pair is then held to the step at its own distance.
  const e = camera.matrixWorld.elements, near = Math.max(camera.near, 1e-6);
  const step = (z) => camera.isOrthographicCamera ? (camera.far - camera.near) / 2 ** 24 : z * z / (near * 2 ** 24);
  const q = Math.min(1e-3 * R, Math.max(1e-6 * R, step(Math.min(camera.far, Math.hypot(e[12] - (x0 + x1) / 2, e[13] - (y0 + y1) / 2, e[14] - (z0 + z1) / 2) + R))));
  // each triangle keyed by its plane: unit normal to 1e-3 as one number (each part 0 to 2000), and offset to that step;
  // a plane's faces in one flat list of (offset, mesh, face): string keys and a Map per offset and mesh took half the time
  const planes = new Map(), cx = e[12], cy = e[13], cz = e[14], K = 2001;
  for (let mi = 0; mi < tris.length; mi++) {
    // each face keyed by the side it draws (BackSide draws the faces turned away, so its normal is flipped); whether the
    // camera sees a fight is decided per pair below, so one on a face turned away (the top of a wall looked at from below
    // it) is still named, apart from the ones in view
    const w = tris[mi], side = [meshes[mi].material].flat()[0].side, flip = side === 1 ? -1 : 1;
    for (let t = 0; t < w.length; t += 9) {
      const ux = w[t + 3] - w[t], uy = w[t + 4] - w[t + 1], uz = w[t + 5] - w[t + 2], vx = w[t + 6] - w[t], vy = w[t + 7] - w[t + 1], vz = w[t + 8] - w[t + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len / 2 < minA) continue; // a sliver
      nx *= flip / len; ny *= flip / len; nz *= flip / len;
      const kn = ((Math.round(nx * 1000) + 1000) * K + Math.round(ny * 1000) + 1000) * K + Math.round(nz * 1000) + 1000, d = Math.round((nx * w[t] + ny * w[t + 1] + nz * w[t + 2]) / q);
      const b = planes.get(kn);
      b ? b.push(d, mi, t) : planes.set(kn, [d, mi, t]);
    }
    spent += 10 * w.length / 9;
    if (late(0.5)) { for (let i = mi + 1; i < tris.length; i++) unchecked.add(i); tris.length = mi + 1; break; }
  }
  // the groups of faces to compare: two meshes on one plane, or one mesh with two faces there
  const work = [], same = (w, a, b) => { let c = 0; for (let i = 0; i < 9; i += 3) for (let j = 0; j < 9; j += 3) if (w[a + i] === w[b + j] && w[a + i + 1] === w[b + j + 1] && w[a + i + 2] === w[b + j + 2]) c++; return c >= 2; };
  for (const [kn, b] of planes) {
    spent += 10 * b.length / 3;
    if (b.length === 3) continue; // one face alone in its plane
    // neighbouring offsets are one plane: a value on a bucket's edge lands either side
    const ix = Array.from({ length: b.length / 3 }, (_, i) => i * 3).sort((i, j) => b[i] - b[j]);
    for (let s = 0, k = 1; k <= ix.length; k++) {
      if (k < ix.length && b[ix[k]] - b[ix[k - 1]] <= 1) continue;
      // two faces of one mesh with an edge in common (the two halves of a quad) meet only along it: most groups on a curved mesh
      if (k - s === 2 && b[ix[s] + 1] === b[ix[s + 1] + 1] && same(tris[b[ix[s] + 1]], b[ix[s] + 2], b[ix[s + 1] + 2])) { s = k; continue; }
      if (k - s > 1) {
        const by = new Map();
        for (let i = s; i < k; i++) { const mi = b[ix[i] + 1], l = by.get(mi); l ? l.push(b[ix[i] + 2]) : by.set(mi, [b[ix[i] + 2]]); }
        work.push([kn, by]);
      }
      s = k;
    }
  }
  // fights between meshes first: one mesh's own faces (most meshes have some in one plane) must not spend the budget first;
  // then each mesh's own faces mesh by mesh, so a check out of budget has compared every face of the first meshes (by normal,
  // every curved mesh had a face left: checked 0 of 103)
  work.sort((a, b) => (b[1].size > 1) - (a[1].size > 1) || a[1].keys().next().value - b[1].keys().next().value);
  const owner = (o) => { for (let p = o.parent; p; p = p.parent) if (p.name) return ' in "' + p.name + '"'; return ""; };
  const label = (o) => o.name ? '"' + o.name + '"' : "an unnamed " + o.geometry.type + owner(o);
  const both = (a, b) => label(a) !== label(b) ? label(a) + " and " + label(b) : a.name ? "two meshes named " + label(a) : "two unnamed " + a.geometry.type + "s" + owner(a);
  const f = (x) => +x.toPrecision(2), found = new Map(), G = 48;
  groups: for (let gi = 0; gi < work.length; gi++) {
    const stop = () => { for (const [, by] of work.slice(gi)) for (const mi of by.keys()) unchecked.add(mi); };
    if (late()) { stop(); break; }
    const [kn, by] = work[gi];
    // the plane's own axes, to lay its triangles flat
    const [nx, ny, nz] = [Math.floor(kn / K / K), Math.floor(kn / K) % K, kn % K].map(x => (x - 1000) / 1000), ax = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = ny * ax[2] - nz * ax[1], uy = nz * ax[0] - nx * ax[2], uz = nx * ax[1] - ny * ax[0];
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const flat = [...by].map(([mi, l]) => {
      spent += 100 + 30 * l.length; // laid flat, then swept below
      const w = tris[mi], pts = new Float64Array(l.length * 6), ta = new Float64Array(l.length);
      let area = 0, u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
      l.forEach((t, k) => {
        for (let j = 0; j < 3; j++) {
          const s = t + j * 3, u = w[s] * ux + w[s + 1] * uy + w[s + 2] * uz, v = w[s] * vx + w[s + 1] * vy + w[s + 2] * vz;
          pts[k * 6 + j * 2] = u; pts[k * 6 + j * 2 + 1] = v;
          if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
        }
        const o = k * 6; // indices, not a subarray: a view per triangle cost most of this loop's time on 5,000 cubes
        area += ta[k] = Math.abs((pts[o + 2] - pts[o]) * (pts[o + 5] - pts[o + 1]) - (pts[o + 4] - pts[o]) * (pts[o + 3] - pts[o + 1])) / 2;
      });
      return { mi, l, pts, ta, area, box: [u0, v0, u1, v1], d: w[l[0]] * nx + w[l[0] + 1] * ny + w[l[0] + 2] * nz };
    }).sort((a, b) => a.box[0] - b.box[0]); // by u, so the pair loop below stops at the first mesh past A along u
    const dOf = (mi, t) => tris[mi][t] * nx + tris[mi][t + 1] * ny + tris[mi][t + 2] * nz;
    const dist = (mu, mv, dn) => Math.max(1e-6, Math.hypot(mu * ux + mv * vx + dn * nx - cx, mu * uy + mv * vy + dn * ny - cy, mu * uz + mv * vz + dn * nz - cz));
    // a fight between meshes a and b (a === b: two faces of one mesh) over [u0, u1] × [v0, v1] of this plane
    const report = (a, b, area, u0, v0, u1, v1, dA, dB, t) => {
      // how big the overlap looks from the camera (its area over its distance squared, about the share of a steradian):
      // under 1e-4, some 150 pixels of a 1280 × 800 picture, a flicker no player notices
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, z = dist(mu, mv, dA), looks = area / (z * z), gap = 2 * step(z);
      if (looks < 1e-4 || Math.abs(dA - dB) > gap) return;
      // the camera sees the fight when the faces' drawn side is turned to it, or when both draw both sides
      const double = (mi) => [meshes[mi].material].flat()[0].side === 2;
      const seen = (double(a) && double(b)) || nx * (cx - mu * ux - mv * vx - dA * nx) + ny * (cy - mu * uy - mv * vy - dA * ny) + nz * (cz - mu * uz - mv * vz - dA * nz) > 0;
      const key = a + "|" + b + "|" + seen;
      if (found.has(key) && found.get(key).looks >= looks) return;
      const axis = ["x", "y", "z"].find((_, k) => Math.abs([nx, ny, nz][k]) === 1), w = tris[a];
      const where = axis ? axis + " = " + w[t + "xyz".indexOf(axis)].toFixed(2) : "a plane facing (" + [nx, ny, nz].map(x => x.toFixed(2)).join(", ") + ")";
      const pair = (a === b ? label(meshes[a]) + " has two faces in one plane" : both(meshes[a], meshes[b]) + " share a face plane") + " (" + where + ") over " + f(u1 - u0) + " × " + f(v1 - v0) + " units";
      const k = [nx, ny, nz].map(Math.abs), big = k.indexOf(Math.max(...k)), toward = big === 1 ? (ny > 0 ? "above" : "below") : "the " + ([nx, ny, nz][big] > 0 ? "+" : "-") + "xyz"[big] + " side";
      // the gap the depth buffer can tell apart at this distance, so the agent knows how far is enough
      const off = "at least " + f(gap) + " units off the plane";
      found.set(key, { looks, seen, text: seen
        ? "Surfaces: " + pair + ": they flicker as the camera moves (z-fighting). Move one " + off + " (what the depth buffer can tell apart at " + f(z) + " units from this camera), give the top one material.polygonOffset = true with polygonOffsetFactor -1, or remove the hidden face."
        : "Surfaces out of view: " + pair + ", on faces turned away from this camera: they flicker when seen from " + toward + ". Look from there; move one " + off + " or remove the hidden face, unless that side is never seen." });
    };
    // faces of one mesh: neighbours share only an edge (no area in common), so an overlap past 1% of the smaller face is
    // a decal or marking merged into the mesh (a start line merged into the road's geometry); swept along u
    const clip = (P, a) => { // the polygon P (u, v pairs) inside triangle a, by its three edges
      const s = Math.sign((a[2] - a[0]) * (a[5] - a[1]) - (a[4] - a[0]) * (a[3] - a[1]));
      for (let j = 0; j < 6 && P.length; j += 2) {
        const ax0 = a[j], ay0 = a[j + 1], ax1 = a[(j + 2) % 6], ay1 = a[(j + 3) % 6], out = [];
        const side = (x, y) => s * ((ax1 - ax0) * (y - ay0) - (ay1 - ay0) * (x - ax0));
        for (let i = 0; i < P.length; i += 2) {
          const px = P[i], py = P[i + 1], qx = P[(i + 2) % P.length], qy = P[(i + 3) % P.length], sp = side(px, py), sq = side(qx, qy);
          if (sp >= 0) out.push(px, py);
          if ((sp >= 0) !== (sq >= 0)) { const r = sp / (sp - sq); out.push(px + r * (qx - px), py + r * (qy - py)); }
        }
        P = out;
      }
      return P;
    };
    for (const A of flat) {
      const p = A.pts, n = A.l.length;
      if (n < 2) continue;
      const lo = k => Math.min(p[k * 6], p[k * 6 + 2], p[k * 6 + 4]), hi = k => Math.max(p[k * 6], p[k * 6 + 2], p[k * 6 + 4]);
      const vlo = k => Math.min(p[k * 6 + 1], p[k * 6 + 3], p[k * 6 + 5]), vhi = k => Math.max(p[k * 6 + 1], p[k * 6 + 3], p[k * 6 + 5]);
      // two faces with exactly one edge in common (any triangulated surface) meet only along it: no clip needed
      const edge = (i, j) => { let c = 0; for (let a = 0; a < 6; a += 2) for (let b = 0; b < 6; b += 2) if (p[i * 6 + a] === p[j * 6 + b] && p[i * 6 + a + 1] === p[j * 6 + b + 1]) c++; return c >= 2; }; // 3: the same triangle twice (an instance pool left at one matrix) draws one colour, no flicker
      const order = [...Array(n).keys()].sort((i, j) => lo(i) - lo(j));
      let area = 0, u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, first;
      for (let oi = 0; oi < n; oi++) {
        if (late()) { stop(); break groups; }
        const i = order[oi], ih = hi(i), ivl = vlo(i), ivh = vhi(i);
        for (let oj = oi + 1; oj < n && lo(order[oj]) < ih; oj++) {
          const j = order[oj];
          spent += 1;
          if (vlo(j) >= ivh || vhi(j) <= ivl || edge(i, j)) continue;
          spent += 40;
          const P = clip([...p.subarray(j * 6, j * 6 + 6)], p.subarray(i * 6, i * 6 + 6));
          let a = 0, pu0 = Infinity, pv0 = Infinity, pu1 = -Infinity, pv1 = -Infinity;
          for (let k = 0; k < P.length; k += 2) {
            const k2 = (k + 2) % P.length; a += (P[k] * P[k2 + 1] - P[k2] * P[k + 1]) / 2;
            if (P[k] < pu0) pu0 = P[k]; if (P[k] > pu1) pu1 = P[k]; if (P[k + 1] < pv0) pv0 = P[k + 1]; if (P[k + 1] > pv1) pv1 = P[k + 1];
          }
          a = Math.abs(a);
          if (a <= 0.01 * Math.min(A.ta[i], A.ta[j])) continue;
          const di = dOf(A.mi, A.l[i]), dj = dOf(A.mi, A.l[j]);
          if (Math.abs(di - dj) > 2 * step(dist((pu0 + pu1) / 2, (pv0 + pv1) / 2, di))) continue;
          area += a; first ??= A.l[i];
          if (pu0 < u0) u0 = pu0; if (pu1 > u1) u1 = pu1; if (pv0 < v0) v0 = pv0; if (pv1 > v1) v1 = pv1;
        }
      }
      if (area) report(A.mi, A.mi, area, u0, v0, u1, v1, dOf(A.mi, first), dOf(A.mi, first), first);
    }
    // which cells of a G × G grid over the rect a mesh's triangles cover (cell centres, edges excluded so touching tiles share none)
    const cover = (m, [r0, s0, r1, s1]) => {
      const out = new Uint8Array(G * G), cw = (r1 - r0) / G, ch = (s1 - s0) / G, p = m.pts;
      for (let k = 0; k < p.length; k += 6) {
        const a0 = p[k], b0 = p[k + 1], a1 = p[k + 2], b1 = p[k + 3], a2 = p[k + 4], b2 = p[k + 5];
        const det = (b1 - b2) * (a0 - a2) + (a2 - a1) * (b0 - b2);
        if (!det) continue;
        const i0 = Math.max(0, Math.floor((Math.min(a0, a1, a2) - r0) / cw)), i1 = Math.min(G - 1, Math.floor((Math.max(a0, a1, a2) - r0) / cw));
        const j0 = Math.max(0, Math.floor((Math.min(b0, b1, b2) - s0) / ch)), j1 = Math.min(G - 1, Math.floor((Math.max(b0, b1, b2) - s0) / ch));
        spent += 10 + (Math.max(0, i1 - i0 + 1) * Math.max(0, j1 - j0 + 1) >> 2);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = r0 + (i + 0.5) * cw, y = s0 + (j + 0.5) * ch;
          const l0 = ((b1 - b2) * (x - a2) + (a2 - a1) * (y - b2)) / det, l1 = ((b2 - b0) * (x - a2) + (a0 - a2) * (y - b2)) / det;
          if (l0 > 1e-9 && l1 > 1e-9 && 1 - l0 - l1 > 1e-9) out[j * G + i] = 1;
        }
      }
      return out;
    };
    for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length && flat[j].box[0] < flat[i].box[2]; j++) {
      if (late()) { stop(); break groups; }
      spent += 3;
      const A = flat[i], B = flat[j], r = [Math.max(A.box[0], B.box[0]), Math.max(A.box[1], B.box[1]), Math.min(A.box[2], B.box[2]), Math.min(A.box[3], B.box[3])];
      if (r[2] - r[0] <= 0 || r[3] - r[1] <= 0) continue;
      spent += 400; // two grids and the scan of both
      const ca = cover(A, r), cb = cover(B, r), cw = (r[2] - r[0]) / G, ch = (r[3] - r[1]) / G;
      let n = 0, i0 = G, i1 = -1, j0 = G, j1 = -1;
      for (let k = 0; k < G * G; k++) if (ca[k] && cb[k]) { n++; const x = k % G, y = (k / G) | 0; if (x < i0) i0 = x; if (x > i1) i1 = x; if (y < j0) j0 = y; if (y > j1) j1 = y; }
      const area = n * cw * ch;
      if (!n || area <= 0.01 * Math.min(A.area, B.area)) continue;
      const [P, Q] = A.mi < B.mi ? [A, B] : [B, A]; // the larger mesh first, as meshes are sorted
      report(P.mi, Q.mi, area, r[0] + i0 * cw, r[1] + j0 * ch, r[0] + (i1 + 1) * cw, r[1] + (j1 + 1) * ch, P.d, Q.d, P.l[0]);
    }
  }
  // up to 3 lines for fights in view, then 1 for those on faces this camera cannot see, then what the budget left unchecked
  const sorted = [...found.values()].sort((a, b) => b.looks - a.looks), shown = sorted.filter(l => l.seen), away = sorted.filter(l => !l.seen);
  const more = shown.length - 3, out = shown.slice(0, 3).map((l, i) => i === 2 && more > 0 ? l.text + " (" + more + " more pairs like it)" : l.text);
  if (away.length) out.push(away[0].text + (away.length > 1 ? " (" + (away.length - 1) + " more pairs out of view)" : ""));
  // meshes past the work or triangle limit were not all compared: say so rather than nothing, in a line that starts as a
  // Surfaces line does, so no Surfaces line never reads as a clean check (#161: 0 of 103 meshes read as clean)
  if (unchecked.size) out.push("Surfaces: not checked for " + unchecked.size + " of " + meshes.length + " meshes (the z-fighting check's work or triangle limit ran out first), so a fight on them is not named here.");
  return out;
})()`;
