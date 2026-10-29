// `interact` `record`: the steps played in real time, kept as a clip a person can watch and a judge can cite (#140).
// The page is the harness's own (headless, or the window `open` showed), so the clip is Chrome's screencast of it, the
// HTML over the canvas included. While recording, the clock runs on real time at a 60 Hz pace (Chrome here runs frames
// uncapped: 0.4 ms apart on a light WebGPU page), so a game at budget reads 16.7 ms apart on the GPU `open` named; a
// slower frame reads as its own time (25 ms), not as the 33 ms a 60 Hz screen would hold it, since nothing snaps it. Screencast frames are taken at most FPS a second (each is
// acknowledged no sooner), as PNGs, and written into a GIF with one palette and each frame's real duration; pixels
// unchanged since the frame before are left transparent, so a still part of the picture costs almost nothing.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { gpuLine, type Game } from "./browser.ts";
import { COMPOSE, decodePng } from "./look.ts";
import { EngineUnsupported } from "./engines.ts";

/** The longest recording, in real seconds: 15 s at 480 px and 15 fps is a few MB of GIF. */
export const RECORD_MAX_S = 15;
const FPS = 15, SIZE = 480, PACE_MS = 1000 / 60, TOL = 24; // the GIF at most FPS frames a second and SIZE px a side; a 60 Hz screen

// game frames stamped in real time by a frame callback of the recorder's own (as perf's), and the clock run at 60 Hz
const START = `(() => { const c = __clock, r = window.__harnessRec = { t: [], on: true };
  const tick = () => { if (r.on) { r.t.push(c.realNow()); requestAnimationFrame(tick); } };
  requestAnimationFrame(tick); c.pace(${PACE_MS}); c.resume(); })()`;
// paused again, with no pace, as every other call leaves it
// (null on a page that navigated since START: a new document, with no recorder of its own)
const STOP = `(() => { const c = __clock, r = window.__harnessRec; c.pause(); c.pace(0); if (!r) return null;
  r.on = false; delete window.__harnessRec; return r.t; })()`;

export interface Clip {
  /** The GIF in the run folder, its bytes, width and height. */
  path: string; bytes: number; width: number; height: number;
  /** Four moments of the clip in one labelled picture, for an agent, which reads a GIF's first frame only. */
  strip: string;
  /** Real seconds recorded (the GIF's length), its frames and the screencast frames they came from. */
  seconds: number; frames: number; shots: number;
  /** Game frames run, and the real ms between them: median, p95, max, and how many took over two 60 Hz ticks. */
  gameFrames: number; median: number; p95: number; max: number; long: number;
  /** Screencast frames at another size than the first (after a resize step), left out of the GIF. */
  resized: number;
}

let clips = 0;

/** The game frames the recording has run so far (act()'s frame count while recording). */
export const REC_FRAMES = "window.__harnessRec?.t.length ?? 0";
/** Thrown by a stop after the page navigated; server.ts's answer() puts the page back and runs the call again once. */
export const REC_NAVIGATED = "the page navigated during the recording";

/** Starts recording the game's page: its screencast, and the clock running in real time at a 60 Hz pace. The returned
    function stops both, pauses the clock where the play ended, and writes the GIF and its strip; it never throws before
    the clock is paused again. */
export async function startRecording(game: Game): Promise<() => Promise<Clip>> {
  const page = game.page;
  // another engine's page has no DevTools protocol (engines.ts asPage), so no screencast: one reply line says so
  const cdp = await page.createCDPSession().catch(e => { throw e instanceof EngineUnsupported ? new EngineUnsupported("record") : e; });
  const shots: { t: number; data: string; got: number }[] = [];
  let next = 0, on = true, navigated = 0;
  // the main frame's navigations, for when one came (a same-document one fires too; the recorder's absence decides)
  const onNav = (f: { parentFrame(): unknown }) => { if (!f.parentFrame()) navigated ||= Date.now(); };
  page.on("framenavigated", onNav);
  cdp.on("Page.screencastFrame", f => {
    if (!on) return;
    const now = Date.now();
    shots.push({ t: f.metadata.timestamp ?? now / 1000, data: f.data, got: now });
    // Chrome sends the next frame only once this one is acknowledged: acknowledging no sooner than 1/FPS s after the last
    // keeps the capture at FPS without decoding frames the GIF would drop
    const at = Math.max(now, next);
    next = at + 1000 / FPS;
    setTimeout(() => cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}), at - now);
  });
  try {
    await cdp.send("Page.startScreencast", { format: "png", maxWidth: SIZE, maxHeight: SIZE, everyNthFrame: 1 });
    await page.evaluate(START);
  } catch (e) {
    await page.evaluate(STOP).catch(() => {});
    await cdp.detach().catch(() => {});
    page.off("framenavigated", onNav);
    throw e;
  }
  const began = Date.now();
  navigated = 0;
  return async () => {
    const stamps = await page.evaluate(STOP).catch(() => null) as number[] | null, stopped = Date.now();
    page.off("framenavigated", onNav);
    // a page that reloaded itself (a game's restart, a dev server's reload, #135) is a new document at frame 0: the
    // frames after it are not the play, and its stamps are gone, so no clip is written and the call fails as any call
    // a navigation cut does (its clock is paused, as STOP left it)
    if (!stamps) {
      on = false;
      await cdp.send("Page.stopScreencast").catch(() => {});
      await cdp.detach().catch(() => {});
      throw new Error(`record: ${REC_NAVIGATED}${navigated ? `, ${((navigated - began) / 1000).toFixed(1)} s in` : ""}, so the frames after it are of a new page at frame 0: no clip was written`);
    }
    // a play of a frame or two can end before Chrome's first frame of it arrives (half a second after the start on the
    // Backrooms build): wait up to a second for one
    for (let i = 0; !shots.length && i < 20; i++) await new Promise(r => setTimeout(r, 50));
    on = false;
    // start and end on the frames' own clock (Chrome's timestamps): the last frame was on screen until the stop, and the first
    // from the start, since Chrome sends one only once the page draws
    const last = shots.at(-1), end = last ? last.t + (stopped - last.got) / 1000 : 0, start = end - (stopped - began) / 1000;
    await cdp.send("Page.stopScreencast").catch(() => {});
    await cdp.detach().catch(() => {});
    if (!shots.length) throw new Error("record: Chrome sent no screencast frame of the page (a hidden or closed page draws none)");
    const gaps = stamps.slice(1).map((s, i) => s - stamps[i]!).sort((a, b) => a - b);
    const q = (p: number) => gaps.length ? Math.round(gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))]! * 10) / 10 : 0;
    const n = ++clips, path = join(game.runDir, `clip-${n}.gif`), strip = join(game.runDir, `clip-${n}.png`);
    const g = gif(shots, start, end);
    writeFileSync(path, g.bytes);
    // four moments, as look's opening composes its own: the first frame, two between and the last
    const at = [0, 1, 2, 3].map(i => shots[Math.round(i * (shots.length - 1) / 3)]!);
    const labels = at.map(s => `${Math.max(0, s.t - start).toFixed(1)} s`);
    writeFileSync(strip, Buffer.from(await page.evaluate(`${COMPOSE}(${JSON.stringify(at.map(s => s.data))}, ${JSON.stringify(labels)})`) as string, "base64"));
    return { path, bytes: g.bytes.length, width: g.width, height: g.height, strip, seconds: g.seconds, frames: g.frames, shots: shots.length,
      gameFrames: stamps.length, median: q(0.5), p95: q(0.95), max: q(1), long: gaps.filter(x => x > 2 * 1000 / 60).length, resized: g.resized };
  };
}

/** The GIF of the screencast frames (`t` in seconds, PNG data in base64), the first shown from `start`, each until the
    next one's time and the last until `end`: one palette of 255 colours from a sample of the frames, index 255 transparent. */
export function gif(shots: { t: number; data: string }[], start: number, end: number): { bytes: Uint8Array; width: number; height: number; frames: number; seconds: number; resized: number } {
  const rgba = (data: string) => {
    const { w, h, bpp, px } = decodePng(Buffer.from(data, "base64"));
    if (bpp === 4) return { w, h, px };
    const out = new Uint8Array(w * h * 4);
    for (let i = 0, j = 0; i < px.length; i += 3, j += 4) { out[j] = px[i]!; out[j + 1] = px[i + 1]!; out[j + 2] = px[i + 2]!; out[j + 3] = 255; }
    return { w, h, px: out };
  };
  const first = rgba(shots[0]!.data), { w, h } = first;
  // the palette from up to 12 frames spread over the clip, every 5th pixel of each
  const picks = [...new Set(Array.from({ length: Math.min(12, shots.length) }, (_, i) => Math.round(i * (shots.length - 1) / Math.max(1, Math.min(12, shots.length) - 1))))];
  const sample: number[] = [];
  for (const i of picks) { const f = i ? rgba(shots[i]!.data) : first; if (f.w !== w || f.h !== h) continue;
    for (let p = 0; p < f.px.length; p += 20) sample.push(f.px[p]!, f.px[p + 1]!, f.px[p + 2]!, 255); }
  const palette = quantize(new Uint8Array(sample), 255);
  while (palette.length < 255) palette.push([0, 0, 0]);
  palette.push([0, 0, 0]); // 255: transparent, the frame before shows through
  const enc = GIFEncoder(), t0 = Math.min(start, shots[0]!.t);
  let held: { index: Uint8Array; start: number } | null = null, cs = 0, frames = 0, resized = 0;
  // a frame is written once the next one's start is known; its delay in hundredths of a second keeps the running total on
  // the real times (2 at least: browsers show a shorter delay as 10)
  const flush = (until: number) => {
    if (!held) return;
    const d = Math.max(2, Math.round(until * 100) - cs);
    enc.writeFrame(held.index, w, h, frames ? { delay: d * 10, transparent: true, transparentIndex: 255, dispose: 1 } : { palette, delay: d * 10, repeat: 0 });
    cs += d; frames++; held = null;
  };
  // a pixel within TOL of the colour last written there, or that maps to the same palette entry, is left transparent:
  // a film-grain or VHS look moves every pixel a little every frame, and rewriting them all made 14 MB of 13 s
  let ref: Uint8Array | null = null, shown: Uint8Array | null = null;
  for (const [i, s] of shots.entries()) {
    const f = i ? rgba(s.data) : first, px = f.px;
    if (f.w !== w || f.h !== h) { resized++; continue; }
    const index = applyPalette(px, palette.slice(0, 255));
    // shown is a copy: as frame 0's own array, the next frame's changes were written into frame 0 before it was encoded
    if (!ref || !shown) { ref = px.slice(); shown = index.slice(); held = { index, start: 0 }; continue; }
    let changed = false;
    const out = new Uint8Array(index.length);
    for (let p = 0, q = 0; p < index.length; p++, q += 4) {
      if (index[p] === shown[p] || Math.abs(px[q]! - ref[q]!) + Math.abs(px[q + 1]! - ref[q + 1]!) + Math.abs(px[q + 2]! - ref[q + 2]!) <= TOL) out[p] = 255;
      else { out[p] = shown[p] = index[p]!; ref[q] = px[q]!; ref[q + 1] = px[q + 1]!; ref[q + 2] = px[q + 2]!; changed = true; }
    }
    if (!changed) continue; // the same picture: the frame before is shown longer
    flush(s.t - t0);
    held = { index: out, start: s.t - t0 };
  }
  flush(Math.max(end - t0, (held?.start ?? 0) + 0.02));
  enc.finish();
  return { bytes: enc.bytes(), width: w, height: h, frames, seconds: cs / 100, resized };
}

/** The reply's lines for a clip. */
export function clipText(c: Clip, game: Game): string {
  const kb = c.bytes / 1024, size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  return `Recorded ${c.seconds} s in real time: ${c.path} (GIF, ${size}, ${c.width} × ${c.height}, ${c.frames} frames from ${c.shots} screencast frames, each shown for its real time${c.resized ? `; ${c.resized} frames at another size, after a resize step, left out` : ""}); four moments of it: ${c.strip}.`
    + `\nFrames: ${c.gameFrames} game frames at a 60 Hz pace, ${c.median} ms apart (median), p95 ${c.p95} ms, max ${c.max} ms${c.long ? `; ${c.long} took over two ticks (33 ms)` : ""}.`
    + `${c.p95 > 20 ? " A frame slower than 16.7 ms reads as its own time here, not as the 33 ms a 60 Hz screen would hold it." : ""} ${gpuLine(game)}`
    + `\nThe clock is paused again where the play ended.`;
}

// `interact` `record: "video"`: footage for a person. The steps play on the paused clock, every frame drawn and pictured
// (the HTML over the canvas included, as look's picture), and each picture is one frame of a 60 fps video, so it is smooth
// whatever the machine's speed. The encoder runs in an isolated world of the game's own page: WebCodecs needs a secure
// context, which the page's localhost origin is and the bare util page's about:blank is not, and a world of its own
// leaves the game's globals and faked clock alone. H.264 High (Chrome had it on the Mac and on Linux, 2026-10-25, where
// Baseline was missing); the server muxes the chunks with mp4-muxer (MIT; its successor mediabunny is MPL-2.0, which the
// build's licence check refuses).

/** The longest video, in game seconds: 3,600 frames stepped and pictured one by one. */
export const VIDEO_MAX_S = 60;
const KEEP = 30; // every 30th picture (and the last) is kept for the four-moment strip

const ENCODER = `(async () => {
  if (typeof VideoEncoder !== "function") return null;
  const configs = ["avc1.640033", "avc1.640028"].map(codec => ({ codec, framerate: 60, avc: { format: "avc" } }));
  let base = null;
  for (const c of configs) if (await VideoEncoder.isConfigSupported({ ...c, width: 1280, height: 720, bitrate: 5e6 }).then(r => r.supported, () => false)) { base = c; break; }
  if (!base) return null;
  const b64 = b => b.toBase64 ? b.toBase64() : btoa(Array.from(b, c => String.fromCharCode(c)).join(""));
  const bytes = d => new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
  const out = []; let enc = null, config = null, failed = null, n = 0;
  window.__harnessVideo = {
    async add(jpeg) {
      if (failed) throw new Error(failed);
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(jpeg), c => c.charCodeAt(0))]));
      // sized by the first picture, rounded down to even (4:2:0); a later picture of another size (after a resize step) is scaled to it
      const w = bmp.width & ~1, h = bmp.height & ~1;
      if (!enc) {
        enc = new VideoEncoder({ output: (chunk, meta) => {
          const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
          if (meta?.decoderConfig && !config) config = { ...meta.decoderConfig, description: meta.decoderConfig.description && b64(bytes(meta.decoderConfig.description)) };
          out.push([b64(b), chunk.type === "key", chunk.timestamp / 1e6, (chunk.duration ?? 0) / 1e6]);
        }, error: e => { failed = String(e); } });
        enc.configure({ ...base, width: w, height: h, bitrate: Math.max(2e6, Math.round(10e6 * w * h / (1920 * 1080))) });
        this.size = [w, h];
      }
      const f = new VideoFrame(bmp, { timestamp: Math.round(n * 1e6 / 60), duration: Math.round(1e6 / 60), visibleRect: { x: 0, y: 0, width: Math.min(w, this.size[0]), height: Math.min(h, this.size[1]) }, displayWidth: this.size[0], displayHeight: this.size[1] });
      enc.encode(f, { keyFrame: n % 120 === 0 }); f.close(); bmp.close(); n++;
      while (enc.encodeQueueSize > 4) await new Promise(r => enc.addEventListener("dequeue", r, { once: true }));
      return out.splice(0);
    },
    async end() { if (!enc) return null; await enc.flush(); enc.close(); if (failed) throw new Error(failed); return { chunks: out.splice(0), config, size: this.size }; },
  };
  return base.codec;
})()`;

export interface Video {
  /** The MP4 in the run folder, its bytes, width and height, frames and seconds of game time. */
  path: string; bytes: number; width: number; height: number; frames: number; seconds: number;
  /** Four moments of it in one labelled picture, for an agent, which cannot watch a video. */
  strip: string;
  /** Frames the steps ran past VIDEO_MAX_S, played but not filmed. */
  unfilmed: number;
}

let videos = 0;

/** Starts filming the game's page: `frame()` pictures the frame just drawn and encodes it, `stop()` writes the video and
    its strip. The caller steps the clock, one drawn frame per `frame()`. */
export async function startVideo(game: Game): Promise<{ frame(): Promise<void>; stop(): Promise<Video> }> {
  const page = game.page;
  const cdp = await page.createCDPSession().catch(e => { throw e instanceof EngineUnsupported ? new EngineUnsupported("record") : e; });
  const world = async (expression: string) => {
    const r = await cdp.send("Runtime.evaluate", { expression, contextId, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  let contextId = 0, codec: string | null = null;
  try {
    const { frameTree } = await cdp.send("Page.getFrameTree");
    ({ executionContextId: contextId } = await cdp.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "paprika3d-video" }));
    codec = await world(ENCODER);
  } catch (e) { await cdp.detach().catch(() => {}); throw e; }
  if (!codec) {
    await cdp.detach().catch(() => {});
    throw new Error(`record: "video" needs WebCodecs' VideoEncoder with H.264, which this page has not (WebCodecs needs a secure context: http://localhost or https); record: true makes a GIF instead; nothing was played`);
  }
  const chunks: [string, boolean, number, number][] = [], kept: [number, string][] = [];
  let frames = 0, unfilmed = 0, last = "";
  // the isolated world goes with its document: a page that reloaded itself is a new page at frame 0 (as startRecording says)
  const lost = (e: unknown) => /Cannot find context|context was destroyed|Execution context/i.test(String(e)) ? new Error(`record: ${REC_NAVIGATED}, ${(frames / 60).toFixed(1)} s in, so the frames after it are of a new page at frame 0: no video was written`) : e;
  return {
    async frame() {
      if (frames >= VIDEO_MAX_S * 60) { unfilmed++; return; }
      const jpeg = await page.screenshot({ type: "jpeg", quality: 92, optimizeForSpeed: true, encoding: "base64" }) as string;
      chunks.push(...await world(`window.__harnessVideo.add(${JSON.stringify(jpeg)})`).catch(e => { throw lost(e); }));
      if (frames % KEEP === 0) kept.push([frames, jpeg]);
      last = jpeg; frames++;
    },
    async stop() {
      const end = await world("window.__harnessVideo.end()").catch(e => { throw lost(e); }).finally(() => cdp.detach().catch(() => {})) as { chunks: typeof chunks; config: Record<string, unknown> & { codec: string; description?: string }; size: [number, number] } | null;
      if (!end || !frames) throw new Error("record: no frame was filmed: no step ran a frame");
      chunks.push(...end.chunks);
      const [width, height] = end.size, muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width, height, frameRate: 60 }, fastStart: "in-memory" });
      const decoderConfig = { ...end.config, ...end.config.description && { description: Buffer.from(end.config.description, "base64") } };
      for (const [i, [data, key, t, d]] of chunks.entries()) muxer.addVideoChunkRaw(Buffer.from(data, "base64"), key ? "key" : "delta", t * 1e6, (d || 1 / 60) * 1e6, i ? undefined : { decoderConfig } as any);
      muxer.finalize();
      const bytes = new Uint8Array(muxer.target.buffer), n = ++videos;
      const path = join(game.runDir, `video-${n}.mp4`), strip = join(game.runDir, `video-${n}.png`);
      writeFileSync(path, bytes);
      if (kept.at(-1)![0] !== frames - 1) kept.push([frames - 1, last]);
      const at = [...new Set([0, 1, 2, 3].map(i => Math.round(i * (kept.length - 1) / 3)))].map(i => kept[i]!);
      writeFileSync(strip, Buffer.from(await page.evaluate(`${COMPOSE}(${JSON.stringify(at.map(k => k[1]))}, ${JSON.stringify(at.map(k => `${(k[0] / 60).toFixed(1)} s`))})`) as string, "base64"));
      return { path, bytes: bytes.length, width, height, frames, seconds: Math.round(frames / 60 * 100) / 100, strip, unfilmed };
    },
  };
}

/** The reply's lines for a video. */
export function videoText(v: Video): string {
  const kb = v.bytes / 1024, size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  return `Filmed ${v.seconds} s of game time: ${v.path} (MP4, H.264, ${size}, ${v.width} × ${v.height}, ${v.frames} frames at 60 fps), footage for a person to watch; four moments of it: ${v.strip}.`
    + `\nThe steps played on the paused clock, every frame drawn and pictured, so the video is smooth whatever the machine's speed. It has no sound, and real frame timing is not measured here (record: true plays in real time and measures it).`
    + (v.unfilmed ? `\nThe video stops at ${VIDEO_MAX_S} s: the last ${v.unfilmed} frames of the steps played without being filmed.` : "");
}
