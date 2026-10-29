// invariants(): built-in checks any game must pass, no contract needed. On a freshly reloaded page: the window.__game
// convention, plain-JSON observe(), setState(observe()) changes nothing, then a fixed scripted play (seeded keys through
// act()) must change the state, raise no errors and, replayed on another fresh page, end in the same state, since the
// harness seeds Math.random and the clock.
import { isDeepStrictEqual } from "node:util";
import { uniq, type Game } from "./browser.ts";
import { act, diff, type Step } from "./input.ts";

// a tiny seeded PRNG (Park-Miller), so the scripted play is the same on every run and every machine
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d", " "];
const PLAY: Step[] = [];
for (let n = 0; n < 240;) {
  const frames = 1 + Math.floor(rand() * 12);
  PLAY.push({ key: KEYS[Math.floor(rand() * KEYS.length)]!, frames });
  n += frames;
  if (PLAY.length % 12 === 0) { PLAY.push({ wait: 10 }); n += 10; }
}

/** In the page: what in observe() is not plain JSON (NaN, Infinity, undefined, functions, class instances), or "". */
export const PLAIN = `(() => {
  const bad = [], at = (p, k) => (p ? p + "." + k : String(k));
  const walk = (v, p) => {
    if (typeof v === "number") { if (!Number.isFinite(v)) bad.push(p + " is " + v); }
    else if (["undefined", "function", "bigint", "symbol"].includes(typeof v)) bad.push(p + " is " + typeof v);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, at(p, i)));
    else if (v && typeof v === "object") {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) bad.push(p + " is a " + (v.constructor?.name ?? "class instance"));
      else for (const k of Object.keys(v)) walk(v[k], at(p, k));
    }
  };
  walk(__game.observe(), "");
  return bad.slice(0, 5).join("; ");
})()`;

const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0]!;
const keysOf = (d: Record<string, unknown>) => Object.keys(d).join(", ") || "nested values";

/** Runs every invariant on the game's queue; `text` has one ✓/✗ line each and a summary line, like check(). */
export function invariants(game: Game): Promise<{ passed: number; failed: number; text: string }> {
  return game.queue(async () => {
    const start = Date.now(), { page } = game, lines: [string, string][] = []; // [name, "" or why it failed]
    const run = async (name: string, fn: () => Promise<string>) => {
      try { lines.push([name, await fn()]); } catch (e) { lines.push([name, `threw: ${firstLine(e)}`]); }
    };
    const errorsBefore = game.errors.length;
    await game.reload();
    const missing = await page.evaluate(`["describe", "observe", "act", "setState"].filter(f => typeof window.__game?.[f] !== "function")`) as string[];
    lines.push(["window.__game has describe, observe, act and setState", missing.length ? `missing ${missing.join(", ")}` : ""]);
    if (!missing.length) {
      await run("observe() is plain JSON", async () => page.evaluate(PLAIN) as Promise<string>);
      await run("setState(observe()) leaves observe() unchanged", async () => {
        const [s, after] = await page.evaluate(`(() => { const s = JSON.stringify(__game.observe()); __game.setState(JSON.parse(s)); return [JSON.parse(s), __game.observe()]; })()`) as [any, any];
        return isDeepStrictEqual(after, s) ? "" : `observe() changed at ${keysOf(diff(s, after))}: setState ignores or alters them`;
      });
      await game.reload();
      const first = await act(game, PLAY).catch(e => ({ error: firstLine(e) }) as const);
      if ("error" in first) lines.push(["the scripted play runs", first.error]);
      else {
        lines.push(["inputs change the state", isDeepStrictEqual(first.before, first.after) ? `observe() after ${PLAY.length} key steps equals frame 0` : ""]);
        lines.push(["no errors while loading and playing", uniq(game.errors.slice(errorsBefore), 3).join("; ")]);
        await run("observe() is still plain JSON after play", async () => page.evaluate(PLAIN) as Promise<string>);
        await run("the same inputs give the same state", async () => {
          await game.reload();
          const again = await act(game, PLAY);
          return isDeepStrictEqual(again.after, first.after) ? "" : `a replay differs at ${keysOf(diff(first.after, again.after))}: use Math.random and the frame time, never real time`;
        });
      }
    }
    const passed = lines.filter(([, why]) => !why).length;
    return { passed, failed: lines.length - passed, text: [
      ...lines.map(([name, why]) => (why ? `✗ ${name} — ${why}` : `✓ ${name}`)),
      `${passed} of ${lines.length} invariants passed in ${((Date.now() - start) / 1000).toFixed(1)} s`,
    ].join("\n") };
  });
}
