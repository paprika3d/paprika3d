// Enables Node's on-disk compile cache (22.8+, a no-op before) and then runs the bundle named next on the command line:
// the cache can only speed up code compiled after it is on, and each bundle is one file.
import { pathToFileURL } from "node:url"; // a bare path breaks on a folder name with # or %
try { (await import("node:module")).enableCompileCache(); } catch {}
await import(pathToFileURL(process.argv.splice(2, 1)[0]).href);
