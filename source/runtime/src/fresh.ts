// One world-matrix update per render call, shared by the switches that read matrices before three's render does
// (defaults' shadow freeze, instancing's mirror): each used to call scene.updateMatrixWorld() itself, 0.23 ms a pass at
// 5,000 objects. index.ts clears the set before each top-level render.
import type { Scene } from "three";

const fresh = new Set<Scene>();

/** Brings the scene's world matrices up to date once per render call, as three's render would (only when asked to). */
export function freshen(scene: Scene) {
  if (fresh.has(scene) || !scene.matrixWorldAutoUpdate) return;
  fresh.add(scene);
  scene.updateMatrixWorld();
}

/** Called before each top-level render: the game may move things between two renders of one frame. */
export function staleAll() { fresh.clear(); }
