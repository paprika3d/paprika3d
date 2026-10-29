// tex: canvas textures a game otherwise hand-draws (labels, glow blobs, dot-matrix displays) or makes in an image editor
// or Blender (stone, sand, wood, brick walls and their relief). Each builder returns a THREE.CanvasTexture: colour maps
// in sRGB, tiling ones (noise, wood, bricks, and a normal map of them) with RepeatWrapping. Colours are anything
// THREE.Color takes (0x8b5a2b, "#888", "tan"). Nothing reads `Math.random`: the same `seed` gives the same pixels.
//   const map = tex.bricks({ rows: 8, cols: 4 }); map.repeat.set(4, 2);
//   wall.material = new THREE.MeshStandardMaterial({ map, normalMap: tex.normal(map) }); // bricks raised, mortar sunk
//   const sign = tex.label("SCORE 120"); // sign.image.width / sign.image.height is its aspect for the plane
//   let screen = tex.dots("BALL 1\n001250", { rows: 16 }); screen = tex.dots("BALL 2\n004800", { rows: 16 }, screen); // redraws in place
import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace, type ColorRepresentation, type Texture } from "three";

type C = ColorRepresentation;

/** mulberry32: a seeded generator of numbers in [0, 1). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const canvas = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  return [c, c.getContext("2d")!] as const;
};
const css = (c: C, a = 1) => { const { r, g, b } = new Color(c).convertLinearToSRGB(); return `rgba(${r * 255},${g * 255},${b * 255},${a})`; };
const rgb = (c: C) => new Color(c).convertLinearToSRGB().toArray().map(v => v * 255);
const done = (c: HTMLCanvasElement, tile = false, colour = true) => {
  const t = new CanvasTexture(c);
  if (colour) t.colorSpace = SRGBColorSpace;
  if (tile) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
};

/** Tiling fractal value noise in [0, 1]: `scale` cells across at the first octave, each octave twice as many. */
function field(size: number, scale: number, octaves: number, seed: number) {
  const out = new Float32Array(size * size), r = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0, p = Math.max(1, Math.round(scale)); o < octaves; o++, p *= 2, amp /= 2) { // whole cells, or it cannot tile
    const grid = Float32Array.from({ length: p * p }, r);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * p, iy = fy | 0, sy = (fy - iy) ** 2 * (3 - 2 * (fy - iy)), j0 = iy * p, j1 = ((iy + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p, ix = fx | 0, sx = (fx - ix) ** 2 * (3 - 2 * (fx - ix)), i1 = (ix + 1) % p;
        const top = grid[j0 + ix] + (grid[j0 + i1] - grid[j0 + ix]) * sx, bot = grid[j1 + ix] + (grid[j1 + i1] - grid[j1 + ix]) * sx;
        out[y * size + x] += (top + (bot - top) * sy) * amp;
      }
    }
    total += amp;
  }
  return out.map(v => v / total);
}
/** A size × size canvas whose pixel i is colour `a` blended toward `b` by `t(i)`. */
function paint(size: number, a: number[], b: number[], t: (i: number) => number) {
  const [c, x] = canvas(size), img = x.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const k = t(i);
    d[i * 4] = a[0] + (b[0] - a[0]) * k; d[i * 4 + 1] = a[1] + (b[1] - a[1]) * k; d[i * 4 + 2] = a[2] + (b[2] - a[2]) * k; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export const tex = {
  /** The seeded generator the builders use: `const r = tex.rng(seed); r()` is a number in [0, 1), never Math.random. */
  rng,
  /** Text on a canvas sized to its ink (a sign, a score), bold at `size` px. Transparent unless `background` is given. */
  label(text: string, { size = 64, color = "#fff" as C, background = null as C | null, font = "sans-serif", padding = 16 } = {}) {
    const f = font.includes("px") ? font : `bold ${size}px ${font}`; // a family, or a whole CSS font ("italic 40px serif")
    const w = canvas(1)[1]; w.font = f;
    const m = w.measureText(text), up = m.actualBoundingBoxAscent, dn = m.actualBoundingBoxDescent;
    const [c, x] = canvas(m.width + padding * 2, up + dn + padding * 2);
    if (background != null) { x.fillStyle = css(background); x.fillRect(0, 0, c.width, c.height); }
    x.font = f; x.fillStyle = css(color); x.textAlign = "center";
    x.fillText(text, c.width / 2, padding + up);
    return done(c);
  },
  /** A radial blob fading from `color` to transparent: a glow (additive) or a contact shadow (black, normal blending).
      `falloff` (0 to 1) is how far out it is still a quarter strength; `opacity` is the alpha at the centre. */
  glow(color: C = "#fff", { size = 128, falloff = 0.4, opacity = 1 } = {}) {
    const [c, x] = canvas(size), h = size / 2, g = x.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, css(color, opacity)); g.addColorStop(falloff, css(color, opacity / 4)); g.addColorStop(1, css(color, 0));
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return done(c);
  },
  /** Tiling noise ramped from `colors[0]` to `colors[1]`: stone, sand, grass, dirt. `scale` is blobs across. */
  noise({ size = 256, scale = 4, colors = [0x555555, 0xaaaaaa] as C[], octaves = 4, seed = 1 } = {}) {
    const n = field(size, scale, octaves, seed), [a, b] = colors.map(rgb);
    return done(paint(size, a, b, i => n[i]), true);
  },
  /** Tiling wood: `rings` dark bands across (rounded so it tiles), wavy, with fine grain along them. */
  wood({ size = 256, color = 0xa0682d as C, rings = 8, seed = 1 } = {}) {
    const wave = field(size, 2, 3, seed), grain = field(size, 32, 2, seed + 1), light = rgb(color), n = Math.max(1, Math.round(rings));
    return done(paint(size, light, light.map(v => v * 0.55), i => {
      const t = ((i % size) / size) * n + wave[i] * 2;
      return (t - Math.floor(t)) ** 3 * 0.8 + grain[i] * 0.3;
    }), true);
  },
  /** A tiling running-bond wall: `rows` (rounded up to even, so the bond tiles) × `cols` bricks, each shaded up to
      `jitter` lighter or darker. tex.normal of it raises the bricks whichever of brick and mortar is lighter. */
  bricks({ size = 256, rows = 8, cols = 4, brick = 0x9a4a32 as C, mortar = 0xc8c0b0 as C, jitter = 0.15, seed = 1 } = {}) {
    rows = Math.max(2, Math.ceil(rows / 2) * 2); cols = Math.max(1, Math.round(cols));
    const [c, x] = canvas(size), r = rng(seed), w = size / cols, h = size / rows, m = Math.max(1, size / 128), base = rgb(brick);
    x.fillStyle = css(mortar); x.fillRect(0, 0, size, size);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = 1 + (r() * 2 - 1) * jitter, sx = i * w + (j % 2) * w / 2;
      x.fillStyle = `rgb(${base.map(v => Math.min(255, v * k))})`;
      for (const o of [0, -size]) x.fillRect(sx + o + m, j * h + m, w - 2 * m, h - 2 * m); // the half brick wraps round
    }
    const t = done(c, true), lum = (v: number[]) => v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11;
    t.userData.invert = lum(rgb(mortar)) > lum(base); // light mortar must still read as the low part
    return t;
  },
  /** A tiling facade: `cols` bays × `rows` floors of framed windows on `wall`, a seeded `lit` share of them glowing
      warm, the rest `glass`. Tile it with uv() at the tile's size in metres and a building of any height shows one
      window row per floor: `const map = tex.windows({ cols: 4, rows: 4 }); uv(body.geometry, 12); // 3 m bays and floors`.
      Size walls in whole bays (bay = tile metres / cols) or corner windows are cut, and give each building sharing a
      tile its own uv offset in whole bays (`uv(g, 12, 3 * k)`) so their lit windows don't line up. */
  windows({ size = 256, cols = 4, rows = 4, lit = 0.3, frame = 0x2a2a2a as C, glass = 0x35506b as C, wall = 0xb8a89a as C, seed = 1 } = {}) {
    const [c, x] = canvas(size), r = rng(seed), w = size / cols, h = size / rows;
    x.fillStyle = css(wall); x.fillRect(0, 0, size, size);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { // each window sits inside its bay, so the tile wraps cleanly
      x.fillStyle = css(frame); x.fillRect(i * w + w * 0.2, j * h + h * 0.2, w * 0.6, h * 0.55);
      x.fillStyle = r() < lit ? "#ffd98a" : css(glass); x.fillRect(i * w + w * 0.25, j * h + h * 0.25, w * 0.5, h * 0.45);
    }
    return done(c, true);
  },
  /** A dot-matrix / LED display of `text`: `cols` × `rows` dots, lit in `on`, unlit in `off`, on black. Each "\n" line
      gets an equal share of the rows. Pass the texture a previous call returned as `into` to redraw it in place (same
      size, needsUpdate set): a live score display without a new texture per change. */
  dots(text: string, { cols = 0, rows = 8, on = 0xffaa00 as C, off = 0x221100 as C, dot = 8 } = {}, into?: Texture) {
    const lines = text.split("\n"), lh = rows / lines.length;
    cols ||= Math.max(...lines.map(l => l.length)) * 6;
    // drawn 8x larger and shrunk to one pixel per dot: text drawn at 8 px is unreadable
    const [b, bx] = canvas(cols * 8, rows * 8), [s, sx] = canvas(cols, rows);
    bx.font = `bold ${lh * 8}px monospace`; bx.textAlign = "center"; bx.fillStyle = "#fff";
    lines.forEach((l, k) => bx.fillText(l, cols * 4, (k + 0.86) * lh * 8)); // alphabetic baseline: capitals and digits centred
    sx.drawImage(b, 0, 0, cols, rows);
    const lit = sx.getImageData(0, 0, cols, rows).data, c = into?.image as HTMLCanvasElement ?? canvas(cols * dot, rows * dot)[0], x = c.getContext("2d")!;
    x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < cols * rows; i++) {
      x.fillStyle = css(lit[i * 4 + 3] > 90 ? on : off);
      x.beginPath(); x.arc((i % cols + 0.5) * dot, ((i / cols | 0) + 0.5) * dot, dot * 0.4, 0, 7); x.fill();
    }
    if (!into) return done(c);
    into.needsUpdate = true;
    return into;
  },
  /** A normal map of `texture` (any canvas texture here), its brightness taken as height (`invert`: darkness; bricks
      set it for you): noise and bricks get relief under MeshStandardMaterial. Tiles as the source does; `strength`
      steepens it, the same at any size. */
  normal(texture: Texture, { strength = 2, invert = !!texture.userData.invert } = {}) {
    const src = texture.image as HTMLCanvasElement, W = src.width, H = src.height;
    const d = src.getContext("2d")!.getImageData(0, 0, W, H).data, s = strength * W / 256 * (invert ? -1 : 1);
    const hgt = (x: number, y: number) => { const i = (((y + H) % H) * W + ((x + W) % W)) * 4; return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; };
    const [c, x] = canvas(W, H), img = x.createImageData(W, H), o = img.data;
    for (let y = 0, k = 0; y < H; y++) for (let i = 0; i < W; i++, k += 4) {
      const nx = (hgt(i - 1, y) - hgt(i + 1, y)) * s, ny = (hgt(i, y + 1) - hgt(i, y - 1)) * s, l = Math.hypot(nx, ny, 1);
      o[k] = (nx / l + 1) * 127.5; o[k + 1] = (ny / l + 1) * 127.5; o[k + 2] = (1 / l + 1) * 127.5; o[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = done(c, false, false);
    t.wrapS = texture.wrapS; t.wrapT = texture.wrapT;
    return t;
  },
};
