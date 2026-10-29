// The generated `window.__game` bridge over shaped state: observe() is `state.toJSON()`, and setState() is `state.set()`
// writing only what reads differently, so `setState(observe())` never moves a float by its rounding. With `physics`, a
// top-level object with a body that setState moves (`x/y/z`) goes through `teleport` and stops, but for the `vx/vy/vz`
// the same setState gives, so a keypoint starts at rest; a velocity alone goes through `setVelocity`. A list given to
// setState is replaced whole, and its hooks swap the bodies.
import type { Physics } from "./physics.ts";
import type { Shape, State } from "./state.ts";

export type Game = {
  describe(): unknown;
  observe(): Record<string, unknown>;
  act(input: any): unknown;
  setState(partial: Record<string, any>): void;
};
/** The part of the physics client the bridge uses. */
export type BridgePhysics = Pick<Physics, "has" | "teleport" | "setVelocity">;

const round = (v: number) => Math.round(v * 100) / 100;
// The partial without what already reads the same; anything that does not fit the state is kept for set() to reject.
const changed = (cur: any, p: any): any => {
  if (Array.isArray(p)) return JSON.stringify(p) === JSON.stringify(cur?.toJSON?.()) ? undefined : p;
  if (p === null || typeof p !== "object" || cur === null || typeof cur !== "object") return (typeof p === "number" && typeof cur === "number" ? round(cur) : cur) === p ? undefined : p;
  const o: Record<string, unknown> = {};
  for (const k in p) { const v = changed(cur[k], p[k]); if (v !== undefined) o[k] = v; }
  return o;
};

/** Builds `__game` from the state, sets it on `window` (globalThis) and returns it. */
export function bridge<S extends Shape>(
  state: State<S>,
  { describe, act, physics }: { describe: () => unknown; act: (input: any) => unknown; physics?: BridgePhysics },
): Game {
  const game: Game = {
    describe,
    act,
    observe: () => state.toJSON(),
    setState: partial => {
      const p = changed(state, partial);
      state.set(p);
      if (physics) for (const k in p) {
        const v = (state as any)[k], q = p[k];
        if (!physics.has(v)) continue;
        const moved = "x" in q || "y" in q || "z" in q, sped = "vx" in q || "vy" in q || "vz" in q;
        if (moved) physics.teleport(v, { x: v.x, y: v.y, z: v.z });
        // a moved body keeps only the velocity components given; a velocity alone keeps the rest of the current one
        const c = (k: string) => k in q || !moved ? v[k] ?? 0 : 0;
        if (moved || sped) physics.setVelocity(v, { x: c("vx"), y: c("vy"), z: c("vz") });
      }
    },
  };
  (globalThis as any).__game = game;
  return game;
}
