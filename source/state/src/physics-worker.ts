// The physics worker: one Rapier world (the deterministic build, so the same inputs give the same bytes on every run),
// driven only by messages. `init` builds the world from a body list; each `step` applies the inputs that came with it
// (bodies added and removed, velocities, impulses, teleports, in the order queued), steps once at a fixed 1/60 s,
// answers the raycasts against the new state, drains the contact and sensor events and writes every listed body's
// position, rotation and velocity into the buffer it was handed, which goes back by transfer
// (no SharedArrayBuffer, which needs COOP/COEP headers that static hosts such as GitHub Pages cannot set).
// `snapshot`/`restore` use Rapier's own world serialization, deflated, so rewind covers physics. Nothing here reads time or
// Math.random. Loaded as a worker it answers messages in order; imported in the page, `createHandler()` gives the
// same handler for the client's no-worker fallback.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { STRIDE } from "./physics.ts";

export type Vec = { x: number; y: number; z: number };
/** One rigid body with one collider. `size` is half extents for a box ([h] for a cube), [radius] for a sphere and
 *  [halfHeight, radius] for a capsule along y. A kinematic body is velocity-based, moved by `linvel` inputs. Sensors and
 *  bodies with `events` report contact start and end. */
export type BodySpec = {
  row: number; shape: "box" | "sphere" | "capsule"; size: number[]; type?: "dynamic" | "fixed" | "kinematic";
  pos: Vec; lockRotations?: boolean; sensor?: boolean; events?: boolean;
};
export type Input = ({ op: "linvel" | "impulse" | "teleport"; row: number } & Vec) | { op: "add"; body: BodySpec } | { op: "remove"; row: number };
/** A ray from a fixed `origin`, or from the body in row `from` (plus `offset`) where it is after the step the ray is cast
 *  in. It ignores sensors and the body in row `exclude`, which defaults to `from`. */
export type RayQuery = { origin?: Vec; from?: number; offset?: Vec; dir: Vec; maxToi: number; exclude?: number };
/** The worker's body list, in buffer order; collider and body handles survive snapshots. Snapshots carry it. */
export type Entry = { row: number; body: number; collider: number; sensor: boolean };
/** A contact or sensor overlap between the bodies in rows `a` and `b` that started (or ended) this step. */
export type Contact = { a: number; b: number; started: boolean; sensor: boolean };
export type Msg =
  | { type: "init"; bodies: BodySpec[]; gravity?: Vec }
  | { type: "step"; buf: Float32Array; inputs: Input[]; rays: RayQuery[] }
  | { type: "snapshot" }
  | { type: "restore"; world: Uint8Array; meta: Entry[] };
export type StepReply = { type: "step"; buf: Float32Array; hits: (number | null)[]; events: Contact[] };
export type Reply = { type: "ready" } | StepReply | { type: "snapshot"; world: Uint8Array; meta: Entry[] } | { type: "restored" } | { type: "error"; message: string };

/** The bytes through a compression or decompression stream. */
const squeeze = async (bytes: Uint8Array, through: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(through)).arrayBuffer());

/** A message handler with its own world. Messages must be handled one at a time, in order. */
export function createHandler() {
  let world!: RAPIER.World, queue!: RAPIER.EventQueue, list: Entry[] = [], bodies: RAPIER.RigidBody[] = [];
  const tv = { x: 0, y: 0, z: 0 }, qv = { x: 0, y: 0, z: 0, w: 1 }, lv = { x: 0, y: 0, z: 0 };
  const index = new Map<number, number>(), rowOf = new Map<number, number>(); // row to list index; collider to row
  const link = (e: Entry, i: number) => { bodies[i] = world.bodies.get(e.body)!; index.set(e.row, i); rowOf.set(e.collider, e.row); };
  const relink = () => { bodies = []; index.clear(); rowOf.clear(); list.forEach(link); };
  // A row can name a body removed earlier in the same step (an enemy that casts a ray, or is pushed, the frame it dies):
  // inputs and rays for it are skipped, not thrown, since one throw used to stop physics, and the game, for good.
  const body = (row: number | undefined): RAPIER.RigidBody | undefined => {
    const i = row === undefined ? undefined : index.get(row);
    return i === undefined ? undefined : bodies[i];
  };
  const add = (b: BodySpec) => {
    if (index.has(b.row)) throw new Error(`row ${b.row} already has a physics body`);
    const d = b.type === "fixed" ? RAPIER.RigidBodyDesc.fixed() : b.type === "kinematic" ? RAPIER.RigidBodyDesc.kinematicVelocityBased() : RAPIER.RigidBodyDesc.dynamic();
    d.setTranslation(b.pos.x, b.pos.y, b.pos.z);
    if (b.lockRotations) d.lockRotations();
    const rb = world.createRigidBody(d);
    const [x, y = x, z = x] = b.size;
    const cd = b.shape === "sphere" ? RAPIER.ColliderDesc.ball(x) : b.shape === "capsule" ? RAPIER.ColliderDesc.capsule(x, y) : RAPIER.ColliderDesc.cuboid(x, y, z);
    if (b.sensor) cd.setSensor(true);
    if (b.sensor || b.events) cd.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const e = { row: b.row, body: rb.handle, collider: world.createCollider(cd, rb).handle, sensor: !!b.sensor };
    link(e, list.push(e) - 1);
  };
  // A removed body leaves a hole that the end of the inputs closes in one pass: a splice and relink per remove made
  // clearing 3,000 bodies take 200 ms. Indices of the others stay valid meanwhile, and adds go on the end.
  let holes = false;
  const remove = (row: number) => {
    const rb = body(row);
    if (!rb) return; // removed already
    world.removeRigidBody(rb);
    const i = index.get(row)!;
    list[i] = null!; index.delete(row);
    holes = true;
  };

  return async function handle(m: Msg): Promise<[Reply, Transferable[]]> {
    switch (m.type) {
      case "init": {
        await RAPIER.init();
        world = new RAPIER.World(m.gravity ?? { x: 0, y: -9.81, z: 0 });
        world.timestep = 1 / 60;
        queue = new RAPIER.EventQueue(true);
        m.bodies.forEach(add);
        return [{ type: "ready" }, []];
      }
      case "step": {
        for (const i of m.inputs) {
          if (i.op === "add") { add(i.body); continue; }
          if (i.op === "remove") { remove(i.row); continue; }
          const rb = body(i.row), v = { x: i.x, y: i.y, z: i.z };
          if (!rb) continue;
          if (i.op === "linvel") rb.setLinvel(v, true);
          else if (i.op === "impulse") rb.applyImpulse(v, true);
          else rb.setTranslation(v, true);
        }
        if (holes) { holes = false; list = list.filter(Boolean); relink(); }
        world.step(queue);
        // Sensors are left out: a ground check that lands on a goal trigger is almost always a bug.
        const hits = m.rays.map(r => {
          const from = body(r.from);
          if (r.from !== undefined && !from) return null; // cast from a body that is gone: no hit
          const t = from ? from.translation() : r.origin!, d = r.offset, ex = r.exclude ?? r.from;
          const origin = d ? { x: t.x + d.x, y: t.y + d.y, z: t.z + d.z } : t;
          const hit = world.castRay(new RAPIER.Ray(origin, r.dir), r.maxToi, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined, undefined, body(ex));
          return hit ? rowOf.get(hit.collider.handle) ?? null : null;
        });
        // A removed body's last contacts end with it and are not reported.
        const events: Contact[] = [];
        queue.drainCollisionEvents((h1, h2, started) => {
          const a = rowOf.get(h1), b = rowOf.get(h2);
          if (a !== undefined && b !== undefined) events.push({ a, b, started, sensor: list[index.get(a)!].sensor || list[index.get(b)!].sensor });
        });
        const f = m.buf;
        // read into three reused objects: translation(), rotation() and linvel() each allocate one per body otherwise
        for (let i = 0, o = 0; i < bodies.length; i++, o += STRIDE) {
          const rb = bodies[i], t = rb.translation(tv), q = rb.rotation(qv), v = rb.linvel(lv);
          f[o] = t.x; f[o + 1] = t.y; f[o + 2] = t.z;
          f[o + 3] = q.x; f[o + 4] = q.y; f[o + 5] = q.z; f[o + 6] = q.w;
          f[o + 7] = v.x; f[o + 8] = v.y; f[o + 9] = v.z;
        }
        return [{ type: "step", buf: f, hits, events }, [f.buffer]];
      }
      case "snapshot": {
        // deflated here, off the main thread: a world snapshot is about 60% zero bytes (1,000 bodies: 3.6 MB → about
        // 0.7 MB), so rewind keeps about 5× more snapshots under its cap and back() replays about 5× fewer frames
        const data = await squeeze(world.takeSnapshot(), new CompressionStream("deflate-raw"));
        return [{ type: "snapshot", world: data, meta: list.map(e => ({ ...e })) }, [data.buffer]];
      }
      case "restore": {
        const data = await squeeze(m.world, new DecompressionStream("deflate-raw"));
        world.free();
        world = RAPIER.World.restoreSnapshot(data);
        world.timestep = 1 / 60;
        queue.clear();
        list = m.meta.map(e => ({ ...e }));
        relink();
        return [{ type: "restored" }, []];
      }
    }
  };
}

declare const WorkerGlobalScope: undefined | (new () => unknown);
// Bun's workers have no WorkerGlobalScope, so they are told apart by Bun.isMainThread.
const inWorker = typeof WorkerGlobalScope !== "undefined" ? self instanceof WorkerGlobalScope : (globalThis as { Bun?: { isMainThread: boolean } }).Bun?.isMainThread === false;
if (inWorker) {
  const handle = createHandler();
  let chain = Promise.resolve();
  self.onmessage = (e: MessageEvent<Msg>) => {
    chain = chain.then(() => handle(e.data)).then(
      ([r, t]) => postMessage(r, { transfer: t }),
      (err: Error) => postMessage({ type: "error", message: String(err?.message ?? err) } satisfies Reply));
  };
}
