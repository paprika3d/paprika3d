// The engine beside Chrome for `open`'s `browser`: the Firefox installed on this machine, driven by the same puppeteer-core
// as Chrome over WebDriver BiDi (docs/decisions-2026-10-19.md: Safari's engine and playwright-core were dropped, since no
// headless Safari engine runs on a Mac without Playwright's own build). Agents in opinion-1 wrote browser scripts of their
// own to see a page in another browser; Firefox draws hardware WebGL headless on Apple silicon (T1 2026-10-17, and the
// puppeteer spike of 2026-10-19). Nothing is downloaded: with no Firefox, an open in it fails with one line, as Chrome's
// does. The page is puppeteer's own; asPage covers what BiDi answers differently from Chrome.
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core";
import { existsSync, writeFileSync } from "node:fs";
import type { HarnessPage } from "./browser.ts";

export type EngineName = "firefox";

/** `open`'s `browser` words for the engines, the one place they map: Chrome is chromium (browser.ts). */
export const BROWSERS = { chrome: "chromium", firefox: "firefox" } as const;
export type BrowserWord = keyof typeof BROWSERS;
/** What agents call each engine. */
export const SAID: Record<EngineName, string> = { firefox: "firefox" };

/** Firefox reports `Apple M1, or similar` as the WebGL renderer by default; with the first two it names the real GPU (T1).
    layout.frame_rate 0 draws as fast as it can, not at the display's rate, as Chrome's --disable-frame-rate-limit does,
    so `perf` times the frame's cost. */
export const FIREFOX_PREFS = { "webgl.sanitize-unmasked-renderer": false, "privacy.resistFingerprinting": false, "layout.frame_rate": 0 };

/** Firefox used unless PAPRIKA3D_FIREFOX names another (read per call, as tests set it). */
const firefox = () => process.env.PAPRIKA3D_FIREFOX || (process.platform === "linux" ? "/usr/bin/firefox" : "/Applications/Firefox.app/Contents/MacOS/firefox");

/** Firefox's executable, or the line saying it is not there. */
export function engine(name: EngineName): string {
  const path = firefox();
  if (!existsSync(path)) throw new Error(`No ${SAID[name]} at ${path}: install Firefox, or set PAPRIKA3D_FIREFOX to its path.`);
  return path;
}

/** The engine a game opens in when no `browser` was asked for and Chrome is not there: Firefox, when it is installed. */
export function fallback(): EngineName | undefined {
  return existsSync(firefox()) ? "firefox" : undefined;
}

/** A page call Chrome has and this engine does not; `what` names the feature for the reply line ("<what> needs chrome"). */
export class EngineUnsupported extends Error {
  constructor(readonly what: string) { super(`${what} needs chrome`); this.name = "EngineUnsupported"; }
}

/** `open`'s arguments that need Chrome's DevTools protocol, which Firefox lacks (asPage's createCDPSession), refused before
    anything opens: an open whose first visit then failed kept `network` in the arguments every reopen replays. `browser`
    is `open`'s word. */
export function refuse(browser: BrowserWord, a: { network?: unknown }): void {
  if (BROWSERS[browser] !== "chromium" && a.network !== undefined) throw new EngineUnsupported("network");
}

const shimNotes = new WeakMap<object, string[]>();
/** The lines the shim kept for the reply since the last call ("main-thread time per frame needs chrome"), each once per
    page; none for Chrome's page. */
export function notes(page: HarnessPage): string[] {
  const l = shimNotes.get(page) ?? [];
  return l.splice(0);
}

// Firefox's page error carries its type in the message ("TypeError: x", name Error); Chrome's is TypeError with "x",
// which browser.ts's error lines read. An evaluate's error already reads as Chrome's.
const NAMED = /^((?:[A-Z]\w*)?(?:Error|Exception)): ([^]*)$/;
const pageError = (h: (e: Error) => unknown) => (e: Error) => {
  const named = e?.name === "Error" ? e.message.match(NAMED) : null;
  if (named) { e.name = named[1]!; e.message = named[2]!; }
  return h(e);
};
// BiDi's requests have no resourceType(), which browser.ts reads to leave streams out of the requests it waits on: an
// EventSource is told by what it accepts, a WebSocket by its URL, the rest are "other". One wrapper per request, so the
// request, requestfinished and requestfailed events hand browser.ts the same object.
const typed = new WeakMap<object, unknown>();
const request = (r: HTTPRequest) => typed.get(r) ?? typed.set(r, new Proxy(r, { get(t, k) {
  if (k === "resourceType") return () => { try { return t.resourceType(); } catch {
    return /^wss?:/.test(t.url()) ? "websocket" : /text\/event-stream/.test(t.headers()["accept"] ?? "") ? "eventsource" : "other"; } };
  const v = Reflect.get(t, k);
  return typeof v === "function" ? v.bind(t) : v;
} })).get(r);
const REQUEST_EVENTS = new Set(["request", "requestfinished", "requestfailed"]);
// puppeteer's key names over BiDi, but for Space, which only Chrome's layout knows
const key = (k: string) => k === "Space" ? " " : k;
// A screenshot enlarged by k in the page, as look.ts's dpr path scales one down: BiDi's screenshot takes no clip scale.
const ENLARGE = async (b64: string, k: number, mime: string) => {
  const i = new Image(); i.src = `data:${mime};base64,${b64}`; await i.decode();
  const c = document.createElement("canvas"), x = c.getContext("2d")!;
  c.width = Math.round(i.naturalWidth * k); c.height = Math.round(i.naturalHeight * k); x.imageSmoothingQuality = "high";
  x.drawImage(i, 0, 0, c.width, c.height);
  return c.toDataURL(mime).split(",")[1]!;
};
type Shot = Parameters<Page["screenshot"]>[0] & { clip?: { scale?: number } };

/** The page the tools use (HarnessPage) over puppeteer's Firefox page: every member is the page's own, but for these.
    - A page error's type moves from its message to its name (pageError), as Chrome's reads, and a request has a
      resourceType() (request()) for browser.ts's wait on pending requests.
    - A screenshot clip's scale is a 1x capture enlarged in the page, so a zoom is interpolated, not drawn at the scale;
      a transparent background is EngineUnsupported.
    - createCDPSession, emulateMediaFeatures (reduced motion is a launch pref instead: rack()) and any other call BiDi
      lacks (UnsupportedOperation) throw EngineUnsupported; metrics() is empty, with a note said once. */
export function asPage(p: Page): HarnessPage {
  const kept: string[] = [], told = new Set<string>();
  const note = (l: string) => { if (!told.has(l)) { told.add(l); kept.push(l); } };
  const wrapped = new Map<unknown, Map<Function, (e: any) => unknown>>(); // per event: one handler may serve two
  const wrap = (event: unknown, h: (e: any) => unknown) => event === "pageerror" ? pageError(h) : REQUEST_EVENTS.has(event as string) ? (r: HTTPRequest) => h(request(r)) : h;
  const handler = (event: unknown, h: (e: any) => unknown): (e: any) => unknown => {
    const m = wrapped.get(event) ?? wrapped.set(event, new Map()).get(event)!;
    return m.get(h) ?? m.set(h, wrap(event, h)).get(h)!;
  };
  const own: Record<string, unknown> = {
    on(event: string, h: (e: Error) => unknown) { p.on(event as any, handler(event, h)); return page; },
    off(event: string, h: (e: Error) => unknown) { p.off(event as any, handler(event, h)); return page; },
    once(event: string, h: (e: Error) => unknown) { p.once(event as any, handler(event, h)); return page; },
    keyboard: {
      down: (k: string) => p.keyboard.down(key(k) as any),
      up: (k: string) => p.keyboard.up(key(k) as any),
      press: (k: string, o?: { delay?: number }) => p.keyboard.press(key(k) as any, o),
      type: (text: string, o?: { delay?: number }) => p.keyboard.type(text, o),
      sendCharacter: (c: string) => p.keyboard.sendCharacter(c),
    },
    screenshot: async (opt: Shot = {}) => {
      if (opt.omitBackground) throw new EngineUnsupported("a transparent screenshot");
      const { scale = 1, ...clip } = opt.clip ?? { x: 0, y: 0, width: 0, height: 0 };
      if (scale === 1) return p.screenshot(opt);
      const type = opt.type ?? (/\.jpe?g$/i.test(opt.path ?? "") ? "jpeg" : "png");
      const small = await p.screenshot({ ...opt, type, clip, path: undefined, encoding: "base64" });
      const big = Buffer.from(await p.evaluate(ENLARGE, small, scale, `image/${type}`), "base64");
      if (opt.path) writeFileSync(opt.path, big);
      return opt.encoding === "base64" ? big.toString("base64") : new Uint8Array(big);
    },
    createCDPSession: async () => { throw new EngineUnsupported("throttle and network"); },
    emulateMediaFeatures: async () => { throw new EngineUnsupported("a media feature changed after open"); },
    // no TaskDuration: `perf` leaves mainMsPerFrame out (pacedCost) and still runs
    metrics: async () => { note("main-thread time per frame needs chrome"); return {}; },
  };
  const unsupported = (what: string) => (e: unknown) => { throw (e as Error)?.name === "UnsupportedOperation" ? new EngineUnsupported(what) : e; };
  // the page's own members, bound to it (its private fields need the real this), with BiDi's gaps as EngineUnsupported
  const page = new Proxy(p, { get(t, k) {
    if (typeof k === "string" && k in own) return own[k];
    const v = Reflect.get(t, k);
    if (typeof v !== "function") return v;
    return (...a: unknown[]) => {
      try { const r = v.apply(t, a); return r instanceof Promise ? r.catch(unsupported(String(k))) : r; }
      catch (e) { return unsupported(String(k))(e); }
    };
  } }) as unknown as HarnessPage;
  shimNotes.set(page, kept);
  return page;
}

/** p's value, or `or` once ms pass first. */
const within = <T>(p: Promise<T>, ms: number, or: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>(ok => { timer = setTimeout(ok, ms, or); })]).finally(() => clearTimeout(timer));
};

/** A game's own Firefox: its page (asPage), the version, and the three things browser.ts does differently from Chrome. */
export interface Rack {
  page: HarnessPage;
  version: string;
  /** The page's main thread answered `1` within 1 s; an error (a closed page) is an answer too, as for Chrome. */
  alive(): Promise<boolean>;
  /** Closes the browser, killing it when it has not closed in 2 s. */
  abandon(): Promise<void>;
  close(): Promise<void>;
}

/** Launches Firefox for one game, as openGame does Chrome. `reducedMotion` is a launch pref, since BiDi has no media
    emulation. */
export async function rack(name: EngineName, o: { window?: boolean; reducedMotion?: boolean; viewport: { width: number; height: number; deviceScaleFactor?: number } }): Promise<Rack> {
  const executablePath = engine(name);
  const browser: Browser = await puppeteer.launch({ browser: "firefox", executablePath, headless: !o.window, defaultViewport: o.viewport,
    extraPrefsFirefox: { ...FIREFOX_PREFS, ...o.reducedMotion && { "ui.prefersReducedMotion": 1 } } });
  try {
    const raw = (await browser.pages())[0] ?? await browser.newPage(), page = asPage(raw);
    await raw.setViewport(o.viewport); // defaultViewport reaches new pages only, not the tab Firefox starts with
    return {
      page, version: (await browser.version()).replace(/^firefox\//i, ""),
      alive: () => within(raw.evaluate("1").then(() => true, () => true), 1_000, false),
      abandon: async () => {
        if (!await within(browser.close().then(() => true, () => false), 2_000, false)) browser.process()?.kill("SIGKILL");
      },
      close: () => browser.close(),
    };
  } catch (e) { await browser.close().catch(() => {}); throw e; }
}
