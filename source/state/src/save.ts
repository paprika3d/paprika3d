// Deliberate save and load: a save is the store's snapshot gzipped into a Blob, and nothing here writes it anywhere.
// The game or person decides where a save goes (a download, IndexedDB, a server), so the store never fills storage.
import type { Store } from "./store.ts";

type Saveable = Pick<Store<any, any>, "snapshot" | "restore">;

/** The store's snapshot, gzipped. */
export function save(store: Saveable): Promise<Blob> {
  return new Response(new Blob([store.snapshot()]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
}

/** Puts back a save from `save()`; throws when it came from a store with a different schema or capacity. */
export async function load(store: Saveable, blob: Blob): Promise<void> {
  store.restore(await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}
