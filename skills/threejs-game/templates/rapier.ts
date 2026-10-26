// Rapier template: the window.__game bridge for a game whose bodies live in a Rapier world, with
// @react-three/rapier (`installGame(useRapier().world, ...)` in an effect) or plain @dimforge/rapier3d-compat.
// observe() reads positions from the bodies, rounded so exact values are stable; setState teleports a body
// and stops it unless the state gives its velocity, so a set state starts at rest by default. Keep the physics step fixed at 1/60 s (@react-three/rapier's default
// timeStep) so stepped frames are exact. Replace the rules, keep the shape.
// With world.createCharacterController(offset) instead of a dynamic player: the controller applies no
// gravity and does not carry the player on a moving platform. Move a platform by position (setNextKinematicTranslation on
// a kinematicPositionBased body) and add its move this step to the player's wanted move once; a platform moved by
// velocity carried a player about 1.4x its move, so measure the ride with `interact`. A capsule resting at
// exactly the offset can get zero movement back with collisions listed: lift it a hair (offset / 4) and compute the
// horizontal and vertical moves in two computeColliderMovement calls.
import type { RigidBody, World } from '@dimforge/rapier3d-compat';

type Vec = { x: number; y: number; z: number };
const SPEED = 4, JUMP = 7;   // units per second
const held = new Set<string>();
let jump = false, score = 0;
const round = (v: Vec) => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) });

/** One input path for real keys and the harness's act(); Space jumps once per press. */
export function act({ key, down = true }: { key: string; down?: boolean }) {
  const k = key === ' ' ? 'Space' : key;
  if (k === 'Space' && down && !held.has(k)) jump = true;
  if (down) held.add(k); else held.delete(k);
}

/** Call once per physics step, before the world steps: held keys set the player's velocity. */
export function tick(player: RigidBody) {
  const vx = ((held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)) * SPEED;
  // shortcut: "grounded" is a near-zero vertical speed, so a press at the top of an arc still jumps; cast a ray down for a real ground check
  const grounded = Math.abs(player.linvel().y) < 0.05;
  player.setLinvel({ x: vx, y: jump && grounded ? JUMP : player.linvel().y, z: 0 }, true);
  jump = false;
}

/** Installs window.__game and the key listeners for the named bodies; returns the cleanup. */
export function installGame(world: World, bodies: { player: RigidBody }) {
  const down = (e: KeyboardEvent) => act({ key: e.code });
  const up = (e: KeyboardEvent) => act({ key: e.code, down: false });
  addEventListener('keydown', down);
  addEventListener('keyup', up);
  (window as any).__game = {
    subject: 'player',   // the mesh `look` and `interact`'s Motion line follow: name the player's mesh 'player'
    describe: () => ({ name: 'platformer', stack: 'rapier', units: 'metres, y up', keys: { ArrowLeft: 'hold', ArrowRight: 'hold', Space: 'jump' } }),
    observe: () => ({ score, bodies: world.bodies.len(), player: round(bodies.player.translation()), velocity: round(bodies.player.linvel()) }),
    act,
    setState: (s: { score?: number; player?: Vec; velocity?: Vec }) => {   // every schema key but bodies (a count), applied at once
      if (s.score !== undefined) score = s.score;
      if (s.player) bodies.player.setTranslation({ ...bodies.player.translation(), ...s.player }, true);   // fields left out keep their values
      if (s.player || s.velocity) bodies.player.setLinvel(s.velocity ?? { x: 0, y: 0, z: 0 }, true);
    },
  };
  return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); delete (window as any).__game; };
}
