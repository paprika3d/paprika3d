// @paprika3d/game-fx 0.3.2, written by paprika3d's open tool: ship it with the page; each open rewrites it
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

var RATE = 44100;
var presets = {
  coin: { frequency: 1200, shape: 1, sustain: 0.05, release: 0.2, pitchJump: 600, pitchJumpTime: 0.05 },
  jump: { frequency: 300, shape: 1, release: 0.2, slide: 5 },
  hit: { frequency: 200, shape: 2, release: 0.15, slide: -2, noise: 0.5 },
  explode: { frequency: 80, shape: 4, noise: 1, release: 0.6, slide: -0.2, filter: -1000, volume: 0.35 },
  shoot: { frequency: 700, shape: 2, release: 0.12, slide: -9 },
  laser: { frequency: 1500, shape: 5, release: 0.15, slide: -15, volume: 0.3 },
  powerup: { frequency: 400, shape: 1, sustain: 0.2, release: 0.2, slide: 3, repeatTime: 0.08 },
  blip: { frequency: 900, release: 0.04 },
  bounce: { frequency: 180, release: 0.15, slide: 4, decay: 0.05, sustainVolume: 0.5 },
  thud: { frequency: 60, shape: 4, noise: 2, release: 0.15, filter: -400 },
  roll: { frequency: 100, shape: 4, noise: 3, sustain: 0.5, release: 0, filter: -600 }
};
function render(sound) {
  const p = typeof sound === "string" ? presets[sound] : sound;
  if (!p)
    throw new Error(`sfx: no preset "${sound}"; presets: ${Object.keys(presets).join(", ")}; add one with sfx.define`);
  let {
    volume = 0.5,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = 0.1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0,
    filter = 0,
    seed = 1
  } = p;
  seed = Math.abs(seed | 0) % 2147483647 || 1;
  const PI2 = Math.PI * 2, sign = (v) => v < 0 ? -1 : 1;
  const random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
  const startSlide = slide *= 500 * PI2 / RATE / RATE;
  let startFrequency = frequency *= PI2 / RATE;
  const w = PI2 * Math.abs(filter) * 2 / RATE, cos = Math.cos(w), alpha = Math.sin(w) / 4;
  const a0 = 1 + alpha, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0, b1 = -(sign(filter) + cos) / a0, b2 = b0;
  let x2 = 0, x1 = 0, y2 = 0, y1 = 0, modOffset = 0, repeat = 0, crush = 0, jump = 1, t = 0, s = 0;
  attack = attack * RATE + 9;
  decay *= RATE;
  sustain *= RATE;
  release *= RATE;
  delay *= RATE;
  deltaSlide *= 500 * PI2 / RATE ** 3;
  modulation *= PI2 / RATE;
  pitchJump *= PI2 / RATE;
  pitchJumpTime *= RATE;
  repeatTime = repeatTime * RATE | 0;
  const length = attack + decay + sustain + release + delay | 0, b = new Float32Array(length);
  for (let i = 0;i < length; b[i++] = s * volume) {
    if (!(++crush % (bitCrush * 100 | 0))) {
      s = shape > 4 ? t / PI2 % 1 < shapeCurve / 2 ? 1 : -1 : shape > 3 ? Math.sin(t ** 3) : shape > 2 ? Math.max(Math.min(Math.tan(t), 1), -1) : shape > 1 ? 1 - (2 * t / PI2 % 2 + 2) % 2 : shape ? 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2) : Math.sin(t);
      s = (repeatTime ? 1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) : 1) * (shape > 4 ? s : shapeCurve === 1 ? s + 0 : sign(s) * Math.abs(s) ** shapeCurve) * (i < attack ? i / attack : i < attack + decay ? 1 - (i - attack) / decay * (1 - sustainVolume) : i < attack + decay + sustain ? sustainVolume : i < length - delay ? (length - i - delay) / release * sustainVolume : 0);
      s = delay ? s / 2 + (delay > i ? 0 : (i < length - delay ? 1 : (length - i) / delay) * b[i - delay | 0] / 2 / volume) : s;
      if (filter)
        s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
    }
    const f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * (random() * 2 - 1);
    if (jump && ++jump > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      jump = 0;
    }
    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      jump = jump || 1;
    }
  }
  return b;
}
var ctx;
var buffers = {};
var samples = {};
var round = (v) => Math.round(v * 1000) / 1000;
var sfx = {
  log: [],
  render,
  define(name, params) {
    presets[name] = params;
    delete buffers[name];
    delete samples[name];
  },
  play(sound, volume = 1, when = 0) {
    const name = typeof sound === "string" ? sound : "custom";
    const entry = { name, time: performance.now(), audible: false };
    sfx.log.push(entry);
    const wave = buffers[name] ? undefined : name === "custom" ? render(sound) : samples[name] ??= render(sound);
    try {
      ctx ??= new AudioContext;
      if (ctx.state !== "running") {
        ctx.resume().catch(() => {});
        return;
      }
      let buf = buffers[name];
      if (!buf) {
        buf = ctx.createBuffer(1, wave.length, RATE);
        buf.getChannelData(0).set(wave);
        if (name !== "custom")
          buffers[name] = buf;
      }
      const src = ctx.createBufferSource(), gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.value = volume;
      src.connect(gain).connect(ctx.destination);
      src.start(ctx.currentTime + when);
      entry.audible = true;
      globalThis.__harness?.sounds?.push(name);
      return src;
    } catch {
      return;
    }
  },
  check(sound) {
    const b = render(sound);
    let peak = 0, sum = 0, crossings = 0;
    b.forEach((v, i) => {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
      if (i && v < 0 !== b[i - 1] < 0)
        crossings++;
    });
    const duration = b.length / RATE;
    return {
      duration: round(duration),
      peak: round(peak),
      rms: round(Math.sqrt(sum / (b.length || 1))),
      clipped: peak > 1,
      hz: Math.round(crossings / 2 / (duration || 1))
    };
  },
  presets: () => Object.keys(presets)
};
import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from "three";
var rng = (seed) => () => {
  seed = seed + 1831565813 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
var canvas = (w, h = w) => {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return [c, c.getContext("2d")];
};
var css = (c, a = 1) => {
  const { r, g, b } = new Color(c).convertLinearToSRGB();
  return `rgba(${r * 255},${g * 255},${b * 255},${a})`;
};
var rgb = (c) => new Color(c).convertLinearToSRGB().toArray().map((v) => v * 255);
var done = (c, tile = false, colour = true) => {
  const t = new CanvasTexture(c);
  if (colour)
    t.colorSpace = SRGBColorSpace;
  if (tile)
    t.wrapS = t.wrapT = RepeatWrapping;
  return t;
};
function field(size, scale, octaves, seed) {
  const out = new Float32Array(size * size), r = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0, p = Math.max(1, Math.round(scale));o < octaves; o++, p *= 2, amp /= 2) {
    const grid = Float32Array.from({ length: p * p }, r);
    for (let y = 0;y < size; y++) {
      const fy = y / size * p, iy = fy | 0, sy = (fy - iy) ** 2 * (3 - 2 * (fy - iy)), j0 = iy * p, j1 = (iy + 1) % p * p;
      for (let x = 0;x < size; x++) {
        const fx = x / size * p, ix = fx | 0, sx = (fx - ix) ** 2 * (3 - 2 * (fx - ix)), i1 = (ix + 1) % p;
        const top = grid[j0 + ix] + (grid[j0 + i1] - grid[j0 + ix]) * sx, bot = grid[j1 + ix] + (grid[j1 + i1] - grid[j1 + ix]) * sx;
        out[y * size + x] += (top + (bot - top) * sy) * amp;
      }
    }
    total += amp;
  }
  return out.map((v) => v / total);
}
function paint(size, a, b, t) {
  const [c, x] = canvas(size), img = x.createImageData(size, size), d = img.data;
  for (let i = 0;i < size * size; i++) {
    const k = t(i);
    d[i * 4] = a[0] + (b[0] - a[0]) * k;
    d[i * 4 + 1] = a[1] + (b[1] - a[1]) * k;
    d[i * 4 + 2] = a[2] + (b[2] - a[2]) * k;
    d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
var tex = {
  rng,
  label(text, { size = 64, color = "#fff", background = null, font = "sans-serif", padding = 16 } = {}) {
    const f = font.includes("px") ? font : `bold ${size}px ${font}`;
    const w = canvas(1)[1];
    w.font = f;
    const m = w.measureText(text), up = m.actualBoundingBoxAscent, dn = m.actualBoundingBoxDescent;
    const [c, x] = canvas(m.width + padding * 2, up + dn + padding * 2);
    if (background != null) {
      x.fillStyle = css(background);
      x.fillRect(0, 0, c.width, c.height);
    }
    x.font = f;
    x.fillStyle = css(color);
    x.textAlign = "center";
    x.fillText(text, c.width / 2, padding + up);
    return done(c);
  },
  glow(color = "#fff", { size = 128, falloff = 0.4, opacity = 1 } = {}) {
    const [c, x] = canvas(size), h = size / 2, g = x.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, css(color, opacity));
    g.addColorStop(falloff, css(color, opacity / 4));
    g.addColorStop(1, css(color, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return done(c);
  },
  noise({ size = 256, scale = 4, colors = [5592405, 11184810], octaves = 4, seed = 1 } = {}) {
    const n = field(size, scale, octaves, seed), [a, b] = colors.map(rgb);
    return done(paint(size, a, b, (i) => n[i]), true);
  },
  wood({ size = 256, color = 10512429, rings = 8, seed = 1 } = {}) {
    const wave = field(size, 2, 3, seed), grain = field(size, 32, 2, seed + 1), light = rgb(color), n = Math.max(1, Math.round(rings));
    return done(paint(size, light, light.map((v) => v * 0.55), (i) => {
      const t = i % size / size * n + wave[i] * 2;
      return (t - Math.floor(t)) ** 3 * 0.8 + grain[i] * 0.3;
    }), true);
  },
  bricks({ size = 256, rows = 8, cols = 4, brick = 10111538, mortar = 13156528, jitter = 0.15, seed = 1 } = {}) {
    rows = Math.max(2, Math.ceil(rows / 2) * 2);
    cols = Math.max(1, Math.round(cols));
    const [c, x] = canvas(size), r = rng(seed), w = size / cols, h = size / rows, m = Math.max(1, size / 128), base = rgb(brick);
    x.fillStyle = css(mortar);
    x.fillRect(0, 0, size, size);
    for (let j = 0;j < rows; j++)
      for (let i = 0;i < cols; i++) {
        const k = 1 + (r() * 2 - 1) * jitter, sx = i * w + j % 2 * w / 2;
        x.fillStyle = `rgb(${base.map((v) => Math.min(255, v * k))})`;
        for (const o of [0, -size])
          x.fillRect(sx + o + m, j * h + m, w - 2 * m, h - 2 * m);
      }
    const t = done(c, true), lum = (v) => v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11;
    t.userData.invert = lum(rgb(mortar)) > lum(base);
    return t;
  },
  windows({ size = 256, cols = 4, rows = 4, lit = 0.3, frame = 2763306, glass = 3493995, wall = 12101786, seed = 1 } = {}) {
    const [c, x] = canvas(size), r = rng(seed), w = size / cols, h = size / rows;
    x.fillStyle = css(wall);
    x.fillRect(0, 0, size, size);
    for (let j = 0;j < rows; j++)
      for (let i = 0;i < cols; i++) {
        x.fillStyle = css(frame);
        x.fillRect(i * w + w * 0.2, j * h + h * 0.2, w * 0.6, h * 0.55);
        x.fillStyle = r() < lit ? "#ffd98a" : css(glass);
        x.fillRect(i * w + w * 0.25, j * h + h * 0.25, w * 0.5, h * 0.45);
      }
    return done(c, true);
  },
  dots(text, { cols = 0, rows = 8, on = 16755200, off = 2232576, dot = 8 } = {}, into) {
    const lines = text.split(`
`), lh = rows / lines.length;
    cols ||= Math.max(...lines.map((l) => l.length)) * 6;
    const [b, bx] = canvas(cols * 8, rows * 8), [s, sx] = canvas(cols, rows);
    bx.font = `bold ${lh * 8}px monospace`;
    bx.textAlign = "center";
    bx.fillStyle = "#fff";
    lines.forEach((l, k) => bx.fillText(l, cols * 4, (k + 0.86) * lh * 8));
    sx.drawImage(b, 0, 0, cols, rows);
    const lit = sx.getImageData(0, 0, cols, rows).data, c = into?.image ?? canvas(cols * dot, rows * dot)[0], x = c.getContext("2d");
    x.fillStyle = "#000";
    x.fillRect(0, 0, c.width, c.height);
    for (let i = 0;i < cols * rows; i++) {
      x.fillStyle = css(lit[i * 4 + 3] > 90 ? on : off);
      x.beginPath();
      x.arc((i % cols + 0.5) * dot, ((i / cols | 0) + 0.5) * dot, dot * 0.4, 0, 7);
      x.fill();
    }
    if (!into)
      return done(c);
    into.needsUpdate = true;
    return into;
  },
  normal(texture, { strength = 2, invert = !!texture.userData.invert } = {}) {
    const src = texture.image, W = src.width, H = src.height;
    const d = src.getContext("2d").getImageData(0, 0, W, H).data, s = strength * W / 256 * (invert ? -1 : 1);
    const hgt = (x2, y) => {
      const i = ((y + H) % H * W + (x2 + W) % W) * 4;
      return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    };
    const [c, x] = canvas(W, H), img = x.createImageData(W, H), o = img.data;
    for (let y = 0, k = 0;y < H; y++)
      for (let i = 0;i < W; i++, k += 4) {
        const nx = (hgt(i - 1, y) - hgt(i + 1, y)) * s, ny = (hgt(i, y + 1) - hgt(i, y - 1)) * s, l = Math.hypot(nx, ny, 1);
        o[k] = (nx / l + 1) * 127.5;
        o[k + 1] = (ny / l + 1) * 127.5;
        o[k + 2] = (1 / l + 1) * 127.5;
        o[k + 3] = 255;
      }
    x.putImageData(img, 0, 0);
    const t = done(c, false, false);
    t.wrapS = texture.wrapS;
    t.wrapT = texture.wrapT;
    return t;
  }
};
import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CanvasTexture as CanvasTexture2, Color as Color2, NormalBlending, SRGBColorSpace as SRGBColorSpace2, Points, PointsMaterial, Quaternion, Vector3 } from "three";
var seeded = (seed) => () => {
  seed = seed + 1831565813 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
var v = new Vector3;
var vec = (u) => Array.isArray(u) ? new Vector3(...u) : new Vector3(u.x, u.y, u.z);
var sprite = () => {
  const c = document.createElement("canvas"), x = c.getContext("2d"), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  c.width = c.height = 32;
  g.addColorStop(0, "#fff");
  g.addColorStop(1, "#fff0");
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return Object.assign(new CanvasTexture2(c), { colorSpace: SRGBColorSpace2 });
};
var S = 10;

class Burst extends Points {
  alive = 0;
  defaults;
  random;
  p;
  constructor({ max = 500, seed = 1, size = 0.1, additive = true, ...defaults } = {}) {
    const g = new BufferGeometry;
    g.setAttribute("position", new BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(max * 4), 4));
    g.setDrawRange(0, 0);
    super(g, new PointsMaterial({ size, map: globalThis.document && sprite(), vertexColors: true, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending }));
    this.frustumCulled = false;
    g.boundingBox = new Box3;
    this.defaults = { count: 20, speed: 4, life: 1, gravity: 9.8, drag: 0, color: 16777215, spread: Math.PI, up: new Vector3(0, 1, 0), ...defaults };
    this.random = seeded(seed);
    this.onBeforeRender = (_r, _s, camera) => {
      this.material.size = size / Math.tan((camera.fov ?? 90) * Math.PI / 360);
    };
    this.p = new Float32Array(max * S);
  }
  emit(at, o = {}) {
    const e = { ...this.defaults, ...o }, r = this.random, c = new Color2(e.color), d = new Vector3, a = this.geometry.attributes;
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), vec(e.up).normalize());
    const gv = typeof e.gravity === "number" ? [0, -e.gravity, 0] : e.gravity;
    if (gv?.length !== 3 || !gv.every(Number.isFinite))
      throw new TypeError("burst.emit gravity: a number or [x, y, z]");
    for (let n = 0;n < e.count && this.alive < a.position.count; n++) {
      const i = this.alive++, y = 1 - r() * (1 - Math.cos(e.spread)), t = r() * 2 * Math.PI, rho = Math.sqrt(1 - y * y);
      d.set(rho * Math.cos(t), y, rho * Math.sin(t)).applyQuaternion(q).multiplyScalar(e.speed * (0.5 + r() / 2));
      this.p.set([d.x, d.y, d.z, 0, e.life * (0.5 + r() / 2), ...gv, e.drag], i * S);
      a.position.setXYZ(i, at.x, at.y, at.z);
      a.color.setXYZW(i, c.r, c.g, c.b, 1);
    }
    this.update(0);
  }
  update(dt) {
    const p = this.p, g = this.geometry, pos = g.attributes.position, col = g.attributes.color, x = pos.array, c = col.array, box = g.boundingBox.makeEmpty();
    for (let i = 0;i < this.alive; i++) {
      const k = i * S;
      if ((p[k + 3] += dt) >= p[k + 4]) {
        const last = --this.alive;
        p.copyWithin(k, last * S, last * S + S);
        x.copyWithin(i * 3, last * 3, last * 3 + 3);
        c.copyWithin(i * 4, last * 4, last * 4 + 4);
        i--;
        continue;
      }
      const damp = Math.exp(-p[k + 8] * dt);
      for (let j = 0;j < 3; j++)
        x[i * 3 + j] += (p[k + j] = (p[k + j] + p[k + 5 + j] * dt) * damp) * dt;
      c[i * 4 + 3] = 1 - p[k + 3] / p[k + 4];
      box.expandByPoint(v.fromBufferAttribute(pos, i));
    }
    g.boundingSphere = null;
    g.setDrawRange(0, this.alive);
    pos.needsUpdate = col.needsUpdate = true;
  }
}
var burst = (o) => new Burst(o);
function shake(o, { seed = 1, decay = 6 } = {}) {
  const r = seeded(seed), off = new Vector3, at = new Vector3;
  let amp = 0;
  return {
    kick(strength) {
      amp += strength;
    },
    update(dt) {
      if (o.position.equals(at))
        o.position.sub(off);
      amp *= Math.exp(-decay * dt);
      at.copy(o.position).add(off.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).multiplyScalar(amp));
      o.position.copy(at);
    }
  };
}
import { ACESFilmicToneMapping, BackSide, Box3 as Box32, BoxGeometry, Color as Color3, DirectionalLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, ShadowMaterial, Vector3 as Vector32, WebGLRenderer } from "three";
function stage(container = document.body, o = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1;
  renderer.shadowMap.enabled = o.shadow ?? true;
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);
  const scene = new Scene;
  if (o.background !== null)
    scene.background = new Color3(o.background ?? 15263976);
  if (o.env !== false) {
    const env = new Scene;
    if (o.env != null)
      env.background = new Color3(o.env);
    else {
      env.add(new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial({ color: 7829367, side: BackSide })));
      for (const [w, h, d, x, y, z, k] of [[6, 0.1, 6, 0, 4.9, 0, 4], [0.1, 4, 6, -4.9, 1, 0, 6], [0.1, 4, 3, 4.9, 1, 2, 3], [4, 3, 0.1, 0, 1, -4.9, 2]]) {
        const m = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ color: new Color3().setScalar(k) }));
        m.position.set(x, y, z);
        env.add(m);
      }
    }
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
    pm.dispose();
  }
  const camera = new PerspectiveCamera(40, 1, 0.1, 1000);
  camera.position.set(3, 2.5, 5);
  camera.lookAt(0, 0, 0);
  const key = new DirectionalLight(16777215, o.key ?? 1.5);
  key.castShadow = renderer.shadowMap.enabled && key.intensity > 0;
  key.position.set(3, 6, 4);
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  scene.add(camera);
  if (key.intensity)
    scene.add(key, key.target);
  const ground = o.ground === false ? null : new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), o.ground == null ? new ShadowMaterial({ opacity: 0.3 }) : new MeshStandardMaterial({ color: o.ground }));
  if (ground) {
    ground.name = "ground";
    ground.receiveShadow = true;
    ground.scale.setScalar(100);
    scene.add(ground);
  }
  const fit = (content, margin = 1.2) => {
    const parent = ground?.parent;
    ground?.removeFromParent();
    const box = content instanceof Box32 ? content : new Box32().setFromObject(content);
    if (ground && parent)
      parent.add(ground);
    if (box.isEmpty())
      return box.getCenter(new Vector32);
    const c = box.getCenter(new Vector32), r = box.getSize(new Vector32).length() / 2 || 1;
    const half = Math.min(camera.fov / 2, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) * 180 / Math.PI);
    const d = r * margin / Math.sin(half * Math.PI / 180);
    camera.position.copy(c).addScaledVector(camera.getWorldDirection(new Vector32), -d);
    camera.near = d / 100;
    camera.far = d * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(c);
    key.target.position.copy(c);
    key.position.set(3, 6, 4).setLength(r * 3).add(c);
    Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: r, far: r * 5 }).updateProjectionMatrix();
    if (ground) {
      ground.position.set(c.x, box.min.y, c.z);
      ground.scale.setScalar(r * 40);
    }
    return c;
  };
  const resize = () => {
    const body = container === document.body, w = body ? innerWidth : container.clientWidth, h = body ? innerHeight : container.clientHeight;
    if (!w || !h)
      return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  new ResizeObserver(resize).observe(container);
  resize();
  if (o.fit)
    fit(o.fit);
  return { renderer, scene, camera, key, ground, fit };
}
import { BufferAttribute as BufferAttribute2 } from "three";
function uv(g, metresPerRepeat = 1, offset = 0) {
  if (!g.attributes.normal)
    g.computeVertexNormals();
  const p = g.attributes.position, nr = g.attributes.normal, ix = g.index, n0 = p.count, src = [], idx = [], out = Array(n0 * 2).fill(0);
  const own = new Int8Array(n0).fill(-1), copies = new Map;
  for (let i = 0;i + 2 < (ix ? ix.count : n0); i += 3) {
    const vs = [i, i + 1, i + 2].map((k) => ix ? ix.getX(k) : k), n = [0, 1, 2].map((c) => vs.reduce((s, v2) => s + nr.getComponent(v2, c), 0));
    const m = n.map(Math.abs), ax = m[0] > m[1] && m[0] > m[2] ? 0 : m[1] > m[2] ? 1 : 2, d = n[ax] < 0 ? -1 : 1, f = ax * 2 + (d + 1) / 2;
    for (const v2 of vs) {
      let o = own[v2] < 0 ? (own[v2] = f, v2) : own[v2] === f ? v2 : copies.get(v2 * 6 + f) ?? -1;
      if (o < 0)
        copies.set(v2 * 6 + f, o = n0 + src.push(v2) - 1);
      idx.push(o);
      const x = p.getX(v2) / metresPerRepeat, y = p.getY(v2) / metresPerRepeat, z = p.getZ(v2) / metresPerRepeat;
      out[o * 2] = (ax ? x * (ax > 1 ? d : 1) : -z * d) + offset / metresPerRepeat;
      out[o * 2 + 1] = ax === 1 ? -z * d : y;
    }
  }
  if (src.length) {
    const grow = (a) => {
      const b = new BufferAttribute2(new a.array.constructor((n0 + src.length) * a.itemSize), a.itemSize, a.normalized);
      for (let j = 0;j < b.count; j++)
        for (let c = 0;c < a.itemSize; c++)
          b.setComponent(j, c, a.getComponent(j < n0 ? j : src[j - n0], c));
      return b;
    };
    for (const k in g.attributes)
      g.setAttribute(k, grow(g.attributes[k]));
    const morph = g.morphAttributes;
    for (const k in morph)
      morph[k] = morph[k].map(grow);
    g.setIndex(idx);
  }
  g.setAttribute("uv", new BufferAttribute2(new Float32Array(out), 2));
  return g;
}
import { Euler, InstancedMesh, Matrix4, PlaneGeometry as PlaneGeometry2, Quaternion as Quaternion2, Vector3 as Vector33 } from "three";
var rng2 = (seed) => () => {
  seed = seed + 1831565813 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
var PI = Math.PI;
var lerp = (a, b, t) => a + (b - a) * t;
function field2(size, { seed = 1, octaves = 4, height = 5, scale = 50, base = 0, basins = [] } = {}) {
  const hash = (i, j) => rng2(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ seed)() * 2 - 1;
  const noise = (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), u = x - i, v2 = z - j, a = u * u * (3 - 2 * u), b = v2 * v2 * (3 - 2 * v2);
    return lerp(lerp(hash(i, j), hash(i + 1, j), a), lerp(hash(i, j + 1), hash(i + 1, j + 1), a), b);
  };
  const smooth = (x, z) => {
    let h = base;
    for (let o = 0, a = height, f = 1 / scale;o < octaves; o++, a /= 2, f *= 2)
      h += noise(x * f, z * f) * a;
    for (const [bx, bz, r, d] of basins)
      h -= d * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (r * r));
    return h;
  };
  let seg = 0, w = size / 2;
  const heightAt = (x, z) => {
    const c = size / seg, u = (x + w) / c, v2 = (z + w) / c;
    if (!(u > 0 && v2 > 0 && u < seg && v2 < seg))
      return smooth(x, z);
    const H = (a, b) => smooth(a * c - w, b * c - w), k = +(u % 1 + v2 % 1 > 1), p = Math.floor(u) + k, q = Math.floor(v2) + k, t = 1 - 2 * k, h = H(p, q);
    return lerp(h, H(p + t, q), Math.abs(u - p)) + (H(p, q + t) - h) * Math.abs(v2 - q);
  };
  const e = 0.1;
  return {
    area: [-w, -w, w, w],
    heightAt,
    normalAt: (x, z) => new Vector33(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize(),
    geometry(segments) {
      const g = new PlaneGeometry2(size, size, segments, segments).rotateX(-PI / 2), p = g.attributes.position;
      for (let i = 0;i < p.count; i++)
        p.setY(i, smooth(p.getX(i), p.getZ(i)));
      g.computeVertexNormals();
      seg = segments;
      return g;
    }
  };
}
function place(n, o = {}) {
  const { on, seed = 1, minHeight = -Infinity, maxHeight = Infinity, maxSlope = 90, avoid, spacing = 0, jitter = 0, edge, scale = [1, 1], rotate, tilt = 0, stretch = 0 } = o;
  const [x0, z0, x1, z1] = o.area ?? on?.area ?? [-10, -10, 10, 10], r = rng2(seed), out = [];
  const at = (k, m, a, b) => lerp(a, b, m > 1 ? (k + d(jitter / 2)) / (m - 1) : 0.5);
  const cos = Math.cos(maxSlope * PI / 180), d = (m) => m && (r() * 2 - 1) * m, T = tilt * PI / 180;
  const add = (x, z) => {
    const y = on ? on.heightAt(x, z) : 0;
    if (y < minHeight || y > maxHeight || on && on.normalAt(x, z).y < cos || avoid?.(x, z) || spacing && out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < spacing * spacing))
      return;
    out.push({
      x,
      y,
      z,
      ry: rotate === true ? r() * PI * 2 : +(rotate ?? 0),
      s: lerp(scale[0], scale[1], r()),
      rx: d(T),
      rz: d(T),
      sx: 1 + d(stretch),
      sz: 1 + d(stretch)
    });
  };
  if (typeof n === "number") {
    for (let t = 0;out.length < n && t < n * 30; t++)
      add(lerp(x0, x1, r()), lerp(z0, z1, r()));
    if (out.length < n)
      console.error(`place: only ${out.length} of ${n} fit`);
  } else {
    const [nx, nz] = n;
    for (let i = 0;i < nx; i++)
      for (let j = 0;j < nz; j++)
        if (!edge || !(i % (nx - 1)) || !(j % (nz - 1)))
          add(at(i, nx, x0, x1), at(j, nz, z0, z1));
  }
  return out;
}
function instances(geometry, material, points, name) {
  const m = new InstancedMesh(geometry, material, points.length), M = new Matrix4, q = new Quaternion2, E = new Euler, v2 = new Vector33, s = new Vector33;
  points.forEach((p, i) => m.setMatrixAt(i, M.compose(v2.set(p.x, p.y, p.z), q.setFromEuler(E.set(p.rx ?? 0, p.ry, p.rz ?? 0)), s.set(p.s * (p.sx ?? 1), p.s, p.s * (p.sz ?? 1)))));
  m.name = name;
  return m;
}
import { Matrix4 as Matrix42, PerspectiveCamera as PerspectiveCamera2, Vector3 as Vector34 } from "three";
function picture(v2) {
  const [W, H] = v2.size ?? [1, 1], fov = v2.fov ?? 50;
  const camera = new PerspectiveCamera2(fov, W / H, 0.01, 1000);
  camera.position.fromArray(v2.position);
  camera.lookAt(...v2.lookAt ?? [0, 0, 0]);
  camera.updateMatrixWorld();
  const M = camera.matrixWorld.clone(), Mi = new Matrix42().copy(M).invert(), eye = new Vector34().setFromMatrixPosition(M);
  const forward = new Vector34(0, 0, -1).transformDirection(M), f = H / 2 / Math.tan(fov * Math.PI / 360);
  const dir = (px, py) => new Vector34((px - W / 2) / f, (H / 2 - py) / f, -1).transformDirection(M);
  return {
    camera,
    at(px, py, depth) {
      const d = dir(px, py);
      return eye.clone().addScaledVector(d, depth / d.dot(forward));
    },
    ground(px, py, y = 0) {
      const d = dir(px, py), t = (y - eye.y) / d.y;
      return t > 0 ? eye.clone().addScaledVector(d, t) : null;
    },
    px(point) {
      const p = (point instanceof Vector34 ? point.clone() : new Vector34().fromArray(point)).applyMatrix4(Mi);
      return p.z < 0 ? [W / 2 + f * p.x / -p.z, H / 2 - f * p.y / -p.z] : null;
    },
    fit(width, height, cam = camera) {
      cam.aspect = width / height;
      cam.fov = cam.aspect >= W / H ? fov : Math.atan(Math.tan(fov * Math.PI / 360) * (W / H) / cam.aspect) * 360 / Math.PI;
      cam.updateProjectionMatrix();
      return cam;
    }
  };
}
async function bake(object, o = {}) {
  const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
  object.updateWorldMatrix(true, false);
  const root = object.clone();
  object.matrixWorld.decompose(root.position, root.quaternion, root.scale);
  return await new GLTFExporter().parseAsync(root, { binary: true, animations: o.animations ?? [] });
}
import { Color as Color4, PlaneGeometry as PlaneGeometry3, Shape, Path, Vector2, Vector3 as Vector35 } from "three";
var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
var ringArea = (p) => p.reduce((s, [x, y], i) => {
  const [u, v2] = p[(i + 1) % p.length];
  return s + x * v2 - u * y;
}, 0) / 2;
function contours(mask, w, h, simplify = 1) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] > 127;
  const from = [], dir = [], out = new Map, W = w + 1;
  const edge = (vx, vy, d) => {
    const v2 = vy * W + vx;
    from.push(v2);
    dir.push(d);
    (out.get(v2) ?? out.set(v2, []).get(v2)).push(from.length - 1);
  };
  for (let y = 0;y < h; y++)
    for (let x = 0;x < w; x++) {
      if (!on(x, y))
        continue;
      if (!on(x, y - 1))
        edge(x, y, 0);
      if (!on(x + 1, y))
        edge(x + 1, y, 1);
      if (!on(x, y + 1))
        edge(x + 1, y + 1, 2);
      if (!on(x - 1, y))
        edge(x, y + 1, 3);
    }
  const used = new Uint8Array(from.length), rings = [];
  for (let e0 = 0;e0 < from.length; e0++) {
    if (used[e0])
      continue;
    const ring = [];
    let e = e0;
    do {
      used[e] = 1;
      const d = dir[e], v2 = from[e], x = v2 % W + DIRS[d][0], y = Math.floor(v2 / W) + DIRS[d][1];
      ring.push([v2 % W, Math.floor(v2 / W)]);
      const next = out.get(y * W + x).filter((n) => !used[n] || n === e0);
      e = [(d + 1) % 4, d, (d + 3) % 4].map((t) => next.find((n) => dir[n] === t)).find((n) => n !== undefined) ?? e0;
    } while (e !== e0);
    rings.push(simplifyRing(ring.filter((p, i) => {
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    }), simplify));
  }
  return rings;
}
function simplifyRing(p, tol) {
  if (tol <= 0 || p.length < 5)
    return p;
  const far = p.reduce((b2, q, i) => Math.hypot(q[0] - p[0][0], q[1] - p[0][1]) > Math.hypot(p[b2][0] - p[0][0], p[b2][1] - p[0][1]) ? i : b2, 0);
  const a = dp(p.slice(0, far + 1), tol), b = dp([...p.slice(far), p[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function dp(p, tol) {
  const [ax, ay] = p[0], [bx, by] = p[p.length - 1], len = Math.hypot(bx - ax, by - ay);
  let worst = 0, at = 0;
  for (let i = 1;i < p.length - 1; i++) {
    const [x, y] = p[i], d = len ? Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / len : Math.hypot(x - ax, y - ay);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  return worst > tol ? [...dp(p.slice(0, at + 1), tol).slice(0, -1), ...dp(p.slice(at), tol)] : [p[0], p[p.length - 1]];
}
var inside = ([x, y], p) => {
  let r = false;
  for (let i = 0, j = p.length - 1;i < p.length; j = i++)
    if (p[i][1] > y !== p[j][1] > y && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0])
      r = !r;
  return r;
};
function shapesOf(rings, { scale = 1, flipY = true } = {}) {
  const v2 = (p) => p.map(([x, y]) => new Vector2(x * scale, (flipY ? -y : y) * scale));
  const outer = rings.filter((r) => ringArea(r) > 0).sort((a, b) => ringArea(a) - ringArea(b)), shapes = outer.map((r) => new Shape(v2(r)));
  for (const hole of rings.filter((r) => ringArea(r) < 0)) {
    const mid = [(hole[0][0] + hole[1][0]) / 2, (hole[0][1] + hole[1][1]) / 2], i = outer.findIndex((o) => inside(mid, o));
    if (i >= 0)
      shapes[i].holes.push(new Path(v2(hole)));
  }
  return shapes;
}
async function pixels(src) {
  let img = src;
  if (typeof src === "string") {
    const i = new Image;
    i.crossOrigin = "anonymous";
    i.src = src;
    await i.decode();
    img = i;
  }
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return { data: x.getImageData(0, 0, w, h).data, w, h };
}
async function trace(src, { colour, tolerance = 40, invert = false, simplify = 1, minArea = 4, scale = 1 } = {}) {
  const { data, w, h } = await pixels(src), at = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  let ref, match;
  if (colour !== undefined) {
    const hex = new Color4(colour).getHex();
    ref = [hex >> 16, hex >> 8 & 255, hex & 255];
    match = true;
  } else {
    const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(at), key = (c) => c.join();
    ref = corners.reduce((b, c) => corners.filter((d) => key(d) === key(c)).length > corners.filter((d) => key(d) === key(b)).length ? c : b);
    match = false;
  }
  const mask = new Uint8Array(w * h), m = document.createElement("canvas");
  m.width = w;
  m.height = h;
  const mc = m.getContext("2d"), md = mc.createImageData(w, h);
  for (let i = 0;i < w * h; i++) {
    const [r, g, b] = at(i), near = Math.hypot(r - ref[0], g - ref[1], b - ref[2]) <= tolerance;
    mask[i] = near === match !== invert ? 255 : 0;
    md.data.fill(mask[i], i * 4, i * 4 + 3);
    md.data[i * 4 + 3] = 255;
  }
  mc.putImageData(md, 0, 0);
  const rings = contours(mask, w, h, simplify).filter((r) => Math.abs(ringArea(r)) >= minArea);
  return { shapes: shapesOf(rings, { scale }), mask: m, width: w, height: h };
}
async function heightfield(src, { size, height, base = 0 }) {
  const { data, w, h } = await pixels(src), depth = size * h / w, hx = size / 2, hz = depth / 2;
  const H = (i, j) => {
    const k = (Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))) * 4;
    return base + height * (0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]) / 255;
  };
  const heightAt = (x, z) => {
    const u = Math.min(w - 1, Math.max(0, (x + hx) / size * (w - 1))), v2 = Math.min(h - 1, Math.max(0, (z + hz) / depth * (h - 1)));
    const i = Math.floor(u), j = Math.floor(v2), a = u - i, b = v2 - j;
    return (H(i, j) * (1 - a) + H(i + 1, j) * a) * (1 - b) + (H(i, j + 1) * (1 - a) + H(i + 1, j + 1) * a) * b;
  };
  const e = size / w;
  return {
    area: [-hx, -hz, hx, hz],
    heightAt,
    normalAt: (x, z) => new Vector35(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize(),
    geometry(segments) {
      const g = new PlaneGeometry3(size, depth, segments, Math.max(1, Math.round(segments * h / w))).rotateX(-Math.PI / 2), p = g.attributes.position;
      for (let i = 0;i < p.count; i++)
        p.setY(i, heightAt(p.getX(i), p.getZ(i)));
      g.computeVertexNormals();
      return g;
    }
  };
}
export {
  uv,
  trace,
  tex,
  stage,
  shapesOf,
  shake,
  sfx,
  ringArea,
  place,
  picture,
  instances,
  heightfield,
  field2 as field,
  contours,
  burst,
  bake,
  Burst
};
