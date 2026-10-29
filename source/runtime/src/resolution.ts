// Dynamic resolution: lowers the renderer's pixel ratio when frames run over budget and raises it back when
// they are well under, so a heavy scene keeps its frame rate. Hysteresis (30 frames over to step down,
// 120 frames under to step up) keeps it from flickering between ratios.
// The game's own ratio is whatever it last set: usually right after constructing the renderer, which is after
// enable() runs, so it is read back each frame. Disable restores it. Stepping up stops at the larger of the device ratio
// and the game's own, so a game that chose a low ratio on a 2x display can be raised to 2 while it has time to spare.
// shortcut: a frame's cost is the real time renderer.render takes on the CPU, so GPU-bound frames show only
// through command-buffer backpressure; use GPU timer queries if Chrome ever exposes them by default.
// shortcut: post-processing render targets sized from the pixel ratio (EffectComposer) keep their size until the game
// calls composer.setPixelRatio; hook the composer if games using one stay over budget.
import type { WebGLRenderer } from "three";
import type { Switch } from "./index.ts";

const WINDOW = 30, DOWN_AFTER = 30, UP_AFTER = 120, STEP = 0.125, MIN = 0.5;

let budget = 16.7, start = 1, ours = 1, frame = 0, over = 0, under = 0;
let samples: number[] = [];
let changes: { frame: number; from: number; to: number; medianMs: number }[] = [];

/** The `resolution` switch; options `{ frameMs }` (default 16.7). */
export const resolution: Switch = {
  enable(r, opts) {
    budget = (opts as { frameMs?: number })?.frameMs ?? 16.7;
    start = ours = r.getPixelRatio();
    frame = over = under = 0;
    samples = [];
  },
  disable(r) { if (r.getPixelRatio() === ours) r.setPixelRatio(start); },
  after(r, ms) {
    frame++;
    const now = r.getPixelRatio();
    if (now !== ours) { start = ours = now; over = under = 0; samples = []; } // the game set its own ratio
    samples.push(ms);
    if (samples.length > WINDOW) samples.shift();
    if (samples.length < WINDOW) return;
    const median = [...samples].sort((a, b) => a - b)[WINDOW >> 1];
    over = median > budget * 1.1 ? over + 1 : 0;
    under = median < budget * 0.7 ? under + 1 : 0;
    if (over >= DOWN_AFTER) step(r, -STEP, median);
    else if (under >= UP_AFTER) step(r, STEP, median);
  },
  status: () => ({ frameMs: budget, changes }),
};

/** Moves the pixel ratio by d within [MIN, the larger of devicePixelRatio and the starting ratio] and records it when it changed. */
function step(r: WebGLRenderer, d: number, median: number) {
  over = under = 0;
  samples = []; // the old ratio's frames say nothing about the new one
  const from = r.getPixelRatio();
  r.setPixelRatio(Math.min(Math.max(from + d, MIN), Math.max(devicePixelRatio, start)));
  const to = ours = r.getPixelRatio(); // read back: the defaults switch may cap it
  if (to !== from) changes = [...changes, { frame, from, to, medianMs: +median.toFixed(2) }].slice(-20);
}
