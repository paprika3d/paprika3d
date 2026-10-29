// burst: a fixed pool of particles (sparks, debris, dust) as one THREE.Points of soft round dots, rewritten on the CPU each
// `update(dt)`. Each particle flies from `emit`, falls by `gravity` (a number along -y, or a vector [x, y, z] for a z-up
// game), slows by `drag` (per second, 0 none), and fades out by alpha over its `life`. `size` is the
// dot's width in world units (it shrinks with distance), one size for the whole pool. Positions are in the burst's own
// space; add it to the scene. Nothing reads `Math.random`: the same `seed` and the same calls give the same particles.
// `shake` is a seeded, decaying shake for a camera or any Object3D.
//
//   const sparks = burst({ max: 300, seed: 1, size: 0.1 }); sparks.name = "sparks"; scene.add(sparks);
//   sparks.emit(hit.point, { count: 40, speed: 6, spread: Math.PI / 4, color: 0xffaa33 });
//   const cam = shake(camera); cam.kick(0.3);
//   // each frame, after placing the camera: sparks.update(1 / 60); cam.update(1 / 60);
import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CanvasTexture, Color, NormalBlending, SRGBColorSpace, type PerspectiveCamera, Points, PointsMaterial, Quaternion, Vector3, type ColorRepresentation, type Object3D } from "three";

export type Emit = {
  count?: number; speed?: number; life?: number; gravity?: number | number[]; drag?: number; color?: ColorRepresentation;
  spread?: number; // half-angle of the cone around `up`, in radians; Math.PI is a sphere
  up?: Vector3 | { x: number; y: number; z: number } | [number, number, number];
};

/** mulberry32, as in tex and place: a seeded generator of numbers in [0, 1). */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const v = new Vector3();
const vec = (u: NonNullable<Emit["up"]>) => Array.isArray(u) ? new Vector3(...u) : new Vector3(u.x, u.y, u.z);
const sprite = () => { // a soft round dot
  const c = document.createElement("canvas"), x = c.getContext("2d")!, g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  c.width = c.height = 32;
  g.addColorStop(0, "#fff"); g.addColorStop(1, "#fff0");
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return Object.assign(new CanvasTexture(c), { colorSpace: SRGBColorSpace }); // a colour map: untagged, look flags it
};
const S = 10; // per particle: velocity, age, life, gravity xyz, drag (position and colour live in the geometry)

export class Burst extends Points<BufferGeometry, PointsMaterial> {
  alive = 0;
  defaults: Required<Emit>;
  random: () => number;
  private p: Float32Array;

  constructor({ max = 500, seed = 1, size = 0.1, additive = true, ...defaults }: Emit & { max?: number; seed?: number; size?: number; additive?: boolean } = {}) {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(max * 4), 4)); // rgba: alpha fades, so no black specks
    g.setDrawRange(0, 0);
    super(g, new PointsMaterial({ size, map: globalThis.document && sprite(), vertexColors: true, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending }));
    this.frustumCulled = false; // the bounds move every frame
    g.boundingBox = new Box3();
    this.defaults = { count: 20, speed: 4, life: 1, gravity: 9.8, drag: 0, color: 0xffffff, spread: Math.PI, up: new Vector3(0, 1, 0), ...defaults };
    this.random = seeded(seed);
    // PointsMaterial scales a point by viewport height / distance, with no field of view in it: a dot drawn at `size`
    // is narrower by tan(fov / 2) than `size` world units. Undo that for the camera that draws it.
    this.onBeforeRender = (_r, _s, camera) => { this.material.size = size / Math.tan(((camera as PerspectiveCamera).fov ?? 90) * Math.PI / 360); };
    this.p = new Float32Array(max * S);
  }

  /** Starts `count` particles at `at` (past the pool's `max`, the rest are dropped). Speed and life vary by up to half. */
  emit(at: Vector3, o: Emit = {}) {
    const e = { ...this.defaults, ...o }, r = this.random, c = new Color(e.color), d = new Vector3(), a = this.geometry.attributes;
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), vec(e.up).normalize());
    const gv = typeof e.gravity === "number" ? [0, -e.gravity, 0] : e.gravity;
    if (gv?.length !== 3 || !gv.every(Number.isFinite)) throw new TypeError("burst.emit gravity: a number or [x, y, z]");
    for (let n = 0; n < e.count && this.alive < a.position!.count; n++) {
      const i = this.alive++, y = 1 - r() * (1 - Math.cos(e.spread)), t = r() * 2 * Math.PI, rho = Math.sqrt(1 - y * y);
      d.set(rho * Math.cos(t), y, rho * Math.sin(t)).applyQuaternion(q).multiplyScalar(e.speed * (0.5 + r() / 2));
      this.p.set([d.x, d.y, d.z, 0, e.life * (0.5 + r() / 2), ...gv, e.drag], i * S);
      a.position!.setXYZ(i, at.x, at.y, at.z);
      a.color!.setXYZW(i, c.r, c.g, c.b, 1);
    }
    this.update(0);
  }

  /** Moves, ages and fades every particle; a dead one takes the last live one's slot. Keeps the geometry's box on the
      live particles (empty when none is), so look sees where they are. */
  update(dt: number) {
    const p = this.p, g = this.geometry, pos = g.attributes.position!, col = g.attributes.color!, x = pos.array, c = col.array, box = g.boundingBox!.makeEmpty();
    for (let i = 0; i < this.alive; i++) {
      const k = i * S;
      if ((p[k + 3]! += dt) >= p[k + 4]!) {
        const last = --this.alive;
        p.copyWithin(k, last * S, last * S + S); x.copyWithin(i * 3, last * 3, last * 3 + 3); c.copyWithin(i * 4, last * 4, last * 4 + 4);
        i--; continue;
      }
      const damp = Math.exp(-p[k + 8]! * dt);
      for (let j = 0; j < 3; j++) x[i * 3 + j]! += (p[k + j] = (p[k + j]! + p[k + 5 + j]! * dt) * damp) * dt;
      c[i * 4 + 3] = 1 - p[k + 3]! / p[k + 4]!;
      box.expandByPoint(v.fromBufferAttribute(pos, i));
    }
    g.boundingSphere = null; // recomputed when asked
    g.setDrawRange(0, this.alive);
    pos.needsUpdate = col.needsUpdate = true;
  }
}

export const burst = (o?: ConstructorParameters<typeof Burst>[0]) => new Burst(o);

/** A seeded shake that decays by `decay` per second. Call `update(dt)` after placing the object each frame. */
export function shake(o: Object3D, { seed = 1, decay = 6 } = {}) {
  const r = seeded(seed), off = new Vector3(), at = new Vector3();
  let amp = 0;
  return {
    kick(strength: number) { amp += strength; },
    update(dt: number) {
      if (o.position.equals(at)) o.position.sub(off); // not moved since our last offset: take it off first
      amp *= Math.exp(-decay * dt);
      at.copy(o.position).add(off.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).multiplyScalar(amp));
      o.position.copy(at);
    },
  };
}
