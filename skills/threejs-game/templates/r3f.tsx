// React Three Fiber template (vite: `bun create vite . --template react-ts`, then `bun add three @react-three/fiber`).
// The game state lives in a plain module object outside React, so setState and observe() never wait for a render;
// components only draw it. One useFrame advances the rules by the frame's delta, at most 0.1 s, and the first frame by
// one frame.
// Replace the rules, keep the shape.
import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

type Vec = { x: number; y: number };
const SPEED = 4;   // units per second
const game = { score: 0, player: { x: 0, y: 0 } as Vec, coin: { x: 3, y: 2 } as Vec };
const held = new Set<string>();
let started = false;

function step(dt: number) {
  const p = game.player;
  p.x += ((held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)) * SPEED * dt;
  p.y += ((held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0)) * SPEED * dt;
  if (Math.hypot(p.x - game.coin.x, p.y - game.coin.y) < 0.8) {
    game.score++;
    game.coin = { x: Math.round(Math.random() * 8 - 4), y: Math.round(Math.random() * 6 - 3) };   // the harness seeds Math.random
  }
}

// One input path for real keys and the harness's act().
const act = ({ key, down = true }: { key: string; down?: boolean }) => { if (down) held.add(key); else held.delete(key); };
addEventListener('keydown', e => act({ key: e.code }));
addEventListener('keyup', e => act({ key: e.code, down: false }));

const copy = (v: Vec) => ({ x: +v.x.toFixed(3), y: +v.y.toFixed(3) });
// Installed from the Canvas's onCreated, not here: the harness starts stepping frames once __game exists, and before
// the Canvas has mounted those frames would draw nothing and run no useFrame.
const bridge = {
  subject: 'player',   // the mesh named 'player' below, which `look` and `interact`'s Motion line follow
  describe: () => ({ name: 'coin collector', stack: 'react-three-fiber', keys: { ArrowLeft: 'hold', ArrowRight: 'hold', ArrowUp: 'hold', ArrowDown: 'hold' } }),
  observe: () => ({ score: game.score, player: copy(game.player), coin: copy(game.coin) }),
  act,
  setState: (s: Partial<typeof game>) => {   // every schema key, applied at once
    if (s.score !== undefined) game.score = s.score;
    if (s.player) game.player = { ...game.player, ...s.player };   // fields left out keep their values
    if (s.coin) game.coin = { ...game.coin, ...s.coin };
  },
};

function Scene() {
  const player = useRef<Mesh>(null), coin = useRef<Mesh>(null);
  useFrame((_, delta) => {
    step(started ? Math.min(delta, 0.1) : 1 / 60);   // the first delta also spans the page's load: count it as one frame
    started = true;
    player.current!.position.set(game.player.x, game.player.y, 0);
    coin.current!.position.set(game.coin.x, game.coin.y, 0);
  });
  return (
    <>
      <hemisphereLight args={['#ffffff', '#334455', 2]} />
      {/* names show in `look`'s on-screen list */}
      <mesh ref={player} name="player"><boxGeometry args={[0.8, 0.8, 0.8]} /><meshStandardMaterial color="orange" /></mesh>
      <mesh ref={coin} name="coin"><sphereGeometry args={[0.3]} /><meshStandardMaterial color="gold" /></mesh>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <Canvas camera={{ position: [0, 0, 12], fov: 50 }} onCreated={() => { (window as any).__game = bridge; }}><Scene /></Canvas>,
);
