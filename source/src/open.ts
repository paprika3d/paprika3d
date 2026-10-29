// What `open` says about the page around the scene: the dev server's errors, a canvas with no size, and the text a
// crawler reads. A Next.js or Vite page black for a server-side reason (window is not defined in SSR) or an unsized
// parent showed no error in the page and nothing in a look.
import { isAbsolute, relative } from "node:path";
import { uniq, type Game } from "./browser.ts";

const FRAME = /^\s+at (?:.*\()?(.+?):(\d+):\d+\)?$/;

/** "Dev server: …" for each distinct line matching error or warn the dev command printed after its URL (at most 5), with
    the file and line of the stack frame under it. */
export function serverText(log: string[], cwd: string): string[] {
  const found = log.flatMap((l, i) => {
    if (FRAME.test(l) || !/error|warn/i.test(l)) return [];
    const at = log[i + 1]?.match(FRAME);
    let file = at?.[1]!.replace(/^(webpack-internal:\/\/\/(\([^)]*\)\/)?|file:\/\/)/, "").replace(/^\.\//, "");
    if (file && isAbsolute(file) && !relative(cwd, file).startsWith("..")) file = relative(cwd, file);
    return [`Dev server: ${l.trim().replace(/^[^\x00-\x7f]+\s*/, "").slice(0, 300)}${at ? ` (${file}:${at[2]})` : ""}`];
  });
  return uniq(found, 5);
}

// The canvas's empty side and the outermost empty element above it, and the page's headings and words.
const PAGE = `(() => {
  const c = __harness.canvas(), name = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : e.classList[0] ? "." + e.classList[0] : "");
  let empty = null;
  if (c?.isConnected) {
    const b = c.getBoundingClientRect(), k = !b.height ? "height" : !b.width ? "width" : null;
    if (k) { let p = null; for (let e = c.parentElement; e && !e.getBoundingClientRect()[k]; e = e.parentElement) p = e; empty = [k, p && name(p)]; }
  }
  const q = (s) => document.querySelectorAll(s).length;
  return { empty, h1: q("h1"), h2: q("h2"), words: (document.body?.innerText ?? "").split(/\\s+/).filter(Boolean).length };
})()`;

/** The Dev server lines, a "Canvas: 0 px tall on the page" line when the canvas has no height or width, and the page text line. */
export async function openText(game: Game, cwd: string): Promise<string[]> {
  const p = await game.queue(() => game.page.evaluate(PAGE)).catch(() => null) as
    { empty: [string, string | null] | null; h1: number; h2: number; words: number } | null;
  const lines = serverText(game.serverLog, cwd);
  if (p?.empty) {
    const [k, parent] = p.empty;
    lines.push(`Canvas: 0 px ${k === "height" ? "tall" : "wide"} on the page (${parent ? `${parent} has no ${k}` : `its own CSS ${k} is 0`}), so the scene does not show.`);
  }
  if (p) lines.push(`Page text outside the canvas: ${p.words ? `${p.h1} h1, ${p.h2} h2, ${p.words} words` : "none"}`);
  return lines;
}
