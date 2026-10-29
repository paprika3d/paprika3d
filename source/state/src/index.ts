// The package entry, built to dist/game-state.js. The physics engine is not in it: physics() loads dist/physics-worker.js.
// createStore, rewind and bridge stay internal; tests import them from their own files.
export { createState, list, matrices, type Shape, type State, type View, type List } from "./state.ts";
export { physics, type Physics, type Bodies, type BodyView, type Contact, type RayHandle } from "./physics.ts";
export { loop, type Loop } from "./loop.ts";
export { save, load } from "./save.ts";
