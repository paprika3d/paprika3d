// sfx: game sound effects synthesized in code, no audio files. A preset name or a params object becomes 44.1 kHz samples
// (`render`), a played sound (`play`, which never throws when the browser blocks audio and logs every call to `sfx.log`
// with the faked `performance.now()`), or numbers an agent with no ears can read through `eval` (`check`). Rendering is
// deterministic: noise comes from a generator seeded by `seed`, never `Math.random`. A looping voice (a ball rolling) is
// the node `play` returns: `const r = sfx.play("roll"); if (r) { r.loop = true; r.playbackRate.value = speed; }`; a
// looped sound needs `release: 0` (as "roll" has) or it fades to silence at the end of every loop. For loudness or a
// filter that follows speed, reroute it through your own nodes: `r.disconnect(); r.connect(myGain).connect(r.context.destination)`
// (a GainNode or BiquadFilterNode whose value you set each frame). `play(name, volume, when)` starts `when` seconds from
// now, so a note sequence or arpeggio needs no setTimeout: `[0, 0.1, 0.2].forEach((t, i) => sfx.play(notes[i], 1, t))`. Before the page's
// first click or key, audio is locked: `play` then only asks to unlock, logs the call with `audible: false`, and plays nothing.
//   sfx.define("door", { frequency: 90, shape: 2, release: 0.3, slide: -1 }); sfx.play("door"); sfx.check("coin")
// The synth is a port of ZzFX by Frank Force (MIT, https://github.com/KilledByAPixel/ZzFX), minus its Math.random.

/** One sound; every field is optional. Times are in seconds, `frequency` in Hz. `shape`: 0 sine, 1 triangle, 2 saw,
    3 tan, 4 noisy sine, 5 square (`shapeCurve` is its duty). `slide` bends pitch (+/- 50 Hz per 0.1 s per unit; keep
    `frequency + 500 * slide * duration` above 0 or the pitch turns back up); `filter` sets a cutoff at 2x its value in Hz
    (ZzFX's scale), negative for low-pass, positive for high-pass. `noise` scrambles the pitch. */
export interface SfxParams {
  volume?: number; frequency?: number; attack?: number; sustain?: number; release?: number; shape?: number;
  shapeCurve?: number; slide?: number; deltaSlide?: number; pitchJump?: number; pitchJumpTime?: number;
  repeatTime?: number; noise?: number; modulation?: number; bitCrush?: number; delay?: number; sustainVolume?: number;
  decay?: number; tremolo?: number; filter?: number; seed?: number;
}

const RATE = 44100;
const presets: Record<string, SfxParams> = {
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
  roll: { frequency: 100, shape: 4, noise: 3, sustain: 0.5, release: 0, filter: -600 },
};

function render(sound: string | SfxParams): Float32Array {
  const p = typeof sound === "string" ? presets[sound] : sound;
  if (!p) throw new Error(`sfx: no preset "${sound}"; presets: ${Object.keys(presets).join(", ")}; add one with sfx.define`);
  let { volume = 0.5, frequency = 220, attack = 0, sustain = 0, release = 0.1, shape = 0, shapeCurve = 1, slide = 0,
    deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0, delay = 0,
    sustainVolume = 1, decay = 0, tremolo = 0, filter = 0, seed = 1 } = p;
  seed = Math.abs(seed | 0) % 2147483647 || 1; // Park-Miller sticks at 0
  const PI2 = Math.PI * 2, sign = (v: number) => (v < 0 ? -1 : 1);
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; // Park-Miller, seeded per render
  const startSlide = (slide *= (500 * PI2) / RATE / RATE);
  let startFrequency = (frequency *= PI2 / RATE);
  const w = (PI2 * Math.abs(filter) * 2) / RATE, cos = Math.cos(w), alpha = Math.sin(w) / 4;
  const a0 = 1 + alpha, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0, b1 = -(sign(filter) + cos) / a0, b2 = b0;
  let x2 = 0, x1 = 0, y2 = 0, y1 = 0, modOffset = 0, repeat = 0, crush = 0, jump = 1, t = 0, s = 0;
  attack = attack * RATE + 9; decay *= RATE; sustain *= RATE; release *= RATE; delay *= RATE;
  deltaSlide *= (500 * PI2) / RATE ** 3; modulation *= PI2 / RATE; pitchJump *= PI2 / RATE; pitchJumpTime *= RATE;
  repeatTime = (repeatTime * RATE) | 0;
  const length = (attack + decay + sustain + release + delay) | 0, b = new Float32Array(length);
  for (let i = 0; i < length; b[i++] = s * volume) {
    if (!(++crush % ((bitCrush * 100) | 0))) {
      s = shape > 4 ? (((t / PI2) % 1) < shapeCurve / 2 ? 1 : -1) : shape > 3 ? Math.sin(t ** 3)
        : shape > 2 ? Math.max(Math.min(Math.tan(t), 1), -1) : shape > 1 ? 1 - ((((2 * t) / PI2) % 2) + 2) % 2
        : shape ? 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2) : Math.sin(t);
      s = (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        (shape > 4 ? s : shapeCurve === 1 ? s + 0 : sign(s) * Math.abs(s) ** shapeCurve) * // s + 0: -0 to +0, as sign(-0) * 0 gave
        (i < attack ? i / attack : i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
          : i < attack + decay + sustain ? sustainVolume : i < length - delay ? ((length - i - delay) / release) * sustainVolume : 0);
      s = delay ? s / 2 + (delay > i ? 0 : ((i < length - delay ? 1 : (length - i) / delay) * b[(i - delay) | 0]) / 2 / volume) : s;
      if (filter) s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
    }
    const f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * (random() * 2 - 1);
    if (jump && ++jump > pitchJumpTime) { frequency += pitchJump; startFrequency += pitchJump; jump = 0; }
    if (repeatTime && !(++repeat % repeatTime)) { frequency = startFrequency; slide = startSlide; jump = jump || 1; }
  }
  return b;
}

let ctx: AudioContext | undefined;
const buffers: Record<string, AudioBuffer> = {}, samples: Record<string, Float32Array> = {};
const round = (v: number) => Math.round(v * 1000) / 1000;

export const sfx = {
  /** Every play call in order: `{ name, time, audible }` (time from performance.now(), in ms; audible false when audio
      was locked or unavailable, so nothing played). */
  log: [] as { name: string; time: number; audible: boolean }[],
  render,
  /** Adds or replaces a preset, then playable by name. */
  define(name: string, params: SfxParams) { presets[name] = params; delete buffers[name]; delete samples[name]; },
  /** Plays a sound, `when` seconds from now (default 0); returns its source node (set `loop`, `playbackRate`, call `stop()`), or undefined when audio is
      unavailable. Never throws for blocked audio; an unknown preset name still throws. */
  play(sound: string | SfxParams, volume = 1, when = 0): AudioBufferSourceNode | undefined {
    const name = typeof sound === "string" ? sound : "custom";
    const entry = { name, time: performance.now(), audible: false };
    sfx.log.push(entry);
    // a locked play rendered and threw away its samples every call: keep them per preset until the context runs
    const wave = buffers[name] ? undefined : name === "custom" ? render(sound) : samples[name] ??= render(sound);
    try {
      ctx ??= new AudioContext();
      // a source started on a locked context would fire on unlock together with every other early one
      if (ctx.state !== "running") { ctx.resume().catch(() => {}); return undefined; }
      let buf = buffers[name];
      if (!buf) {
        buf = ctx.createBuffer(1, wave!.length, RATE);
        buf.getChannelData(0).set(wave!);
        if (name !== "custom") buffers[name] = buf;
      }
      const src = ctx.createBufferSource(), gain = ctx.createGain();
      src.buffer = buf; gain.gain.value = volume;
      src.connect(gain).connect(ctx.destination);
      src.start(ctx.currentTime + when);
      entry.audible = true;
      // the harness's Sound lines name the presets, beside its count of started sources (build-review-1, #85)
      (globalThis as { __harness?: { sounds?: string[] } }).__harness?.sounds?.push(name);
      return src;
    } catch { return undefined; }
  },
  /** Numbers for a sound: duration in seconds, peak and rms of the samples (1 is full scale), clipped if peak > 1, and
      hz, the mean pitch from zero crossings (noise reads high; above 22050 Hz a tone aliases and reads wrong). */
  check(sound: string | SfxParams) {
    const b = render(sound);
    let peak = 0, sum = 0, crossings = 0;
    b.forEach((v, i) => { peak = Math.max(peak, Math.abs(v)); sum += v * v; if (i && (v < 0) !== (b[i - 1] < 0)) crossings++; });
    const duration = b.length / RATE;
    return { duration: round(duration), peak: round(peak), rms: round(Math.sqrt(sum / (b.length || 1))), clipped: peak > 1,
      hz: Math.round(crossings / 2 / (duration || 1)) };
  },
  /** The preset names. */
  presets: () => Object.keys(presets),
};
