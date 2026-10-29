// The game loop: owns requestAnimationFrame, the physics step, rewind and the bridge, so a game writes only its state,
// its bodies and `tick(inputs)`. A tick is 1/60 s of game time, and a display draws 30 to 144 frames a second, so each
// animation frame adds its elapsed time (at most 0.1 s) to what the game owes and runs one tick per 1/60 s owed, then
// renders once: two ticks a frame at 30 fps, one every other frame at 120. The rAF timestamp is the one read of time in
// the store code, and only here; the harness's fake clock passes its virtual time, 1/60 s a frame, so under it every
// frame is exactly one tick (half a millisecond of tolerance) and rewind, replay and `__clock.hold()` see no change.
// Each tick takes the last physics step into the state, then runs `tick` with the inputs act() and real key events
// ({ key, down }) queued since the tick before, logged by rewind so back(n) replays them exactly; a frame's catch-up
// ticks after its first get no inputs, and each waits for its physics reply, so physics steps once per tick, in order.
// A frame's ticks start only when the last frame's are done and physics is ready: on a real clock a late worker reply,
// or a tick still taking a rewind snapshot, holds game logic off (the time stays owed) instead of running it without
// physics. Frames stay pipelined: the worker steps while the page renders. Time spent in back() is not owed.
// setState applies at once (a body's `x/y/z` through teleport) and is logged as an input, so a replay applies it again
// at the same point.
import { bridge, type Game } from "./bridge.ts";
import { rewind, type Rewind } from "./rewind.ts";
import type { Physics } from "./physics.ts";
import type { Shape, State } from "./state.ts";

export type Loop = {
  /** Queues an input for the next tick, as a key event does. */
  act(input: unknown): void;
  /** Goes back n ticks (see rewind's back()); inputs not yet run are dropped. */
  back(n: number): Promise<number>;
  /** Ticks run, minus ticks gone back. */
  readonly now: number;
  readonly game: Game;
  readonly rewind: Rewind<unknown>;
};

const SET = "$set"; // a logged setState
const STEP = 1000 / 60; // ms of game time per tick

/** Starts the frame loop and sets `window.__game`. */
export function loop<S extends Shape>({ state, physics, tick, render, describe, capBytes }: {
  state: State<S>;
  physics?: Physics;
  /** The game's rules for one 1/60 s tick; reads and writes only the state, physics and the inputs. */
  tick: (inputs: any[]) => void;
  /** Draws the state; runs on every animation frame. */
  render?: () => void;
  describe: () => unknown;
  capBytes?: number;
}): Loop {
  const queue: unknown[] = [];
  let replaying = false, running: Promise<void> | null = null, last: number | null = null, owed = 0;
  const game = bridge(state, { describe, act: i => { queue.push(i); }, physics });
  const setState = game.setState;
  game.setState = partial => { setState(partial); queue.push({ [SET]: structuredClone(partial) }); };

  const rw = rewind<any>(state, {
    capBytes, extra: physics,
    step(inputs) {
      if (replaying) for (const i of inputs) if (i?.[SET]) setState(i[SET]); // live, it was applied when called
      if (physics && !physics.step()) throw new Error("a frame ran before its physics step came back");
      tick(inputs.filter(i => !i?.[SET]));
    },
  });
  // A frame stays running until its last tick's physics reply is back, which ready() would wait for anyway; render() has
  // already run by then, so the worker still steps while the page draws. A paused clock holds the whole of it: holds made
  // after a frame's first await (a snapshot tick's step) would otherwise land after the clock moved on.
  const run = async (n: number) => {
    // an error ends the frame's ticks: its catch-up ticks would only report it again
    try { for (let i = 0; i < n; i++) { await rw.frame(i ? [] : queue.splice(0)); await physics?.settle(); } } catch (e) { reportError(e); } finally { running = null; }
  };
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    owed = replaying ? 0 : Math.min(owed + (last === null ? STEP : now - last), 100); last = now;
    if (!running && !replaying && (physics?.ready ?? true) && owed >= STEP - 0.5) {
      const n = Math.floor((owed + 0.5) / STEP); owed -= n * STEP; // ±0.5 ms: the fake clock's 16.667 ms is one tick, never none or two
      running = run(n);
      (globalThis as { __clock?: { hold?(p: Promise<unknown>): void } }).__clock?.hold?.(running);
    }
    render?.();
  };
  requestAnimationFrame(frame);
  addEventListener("keydown", (e: Event & { key?: string }) => game.act({ key: e.key }));
  addEventListener("keyup", (e: Event & { key?: string }) => game.act({ key: e.key, down: false }));

  return {
    act: game.act,
    async back(n) {
      replaying = true;
      try { await running; queue.length = 0; return await rw.back(n); } finally { replaying = false; }
    },
    get now() { return rw.now; },
    game,
    rewind: rw,
  };
}
