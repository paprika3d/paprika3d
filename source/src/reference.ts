// The `reference` tool: the picture a page should match (a photo, artwork, mockup), read in Chrome's canvas on a bare page of
// the shared Chrome, so no page needs to be open. A crop at full resolution with a grid labelled in the picture's own pixels,
// colours at points, and the page's look beside the picture with their differences. In the 2026-10-24 scene loops every one
// of eight Opus sessions wrote its own Python crop, grid and colour-sampling toolkit (20-30 minutes, dozens of turns each)
// before writing any three.js, because nothing here read a picture.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Browser, Page } from "puppeteer-core";
import { baselinePath } from "./look.ts";

export interface ReferenceOptions { file: string; crop?: number[]; grid?: number; sample?: number[][]; /** the page's look (PNG), for compare */ look?: string; /** regions per side for compare's grid (4) */ cells?: number }
export interface Compare { same: boolean; share?: number; cells?: number[]; pageW: number; pageH: number; /** the panels' height */ panel: number }
export interface Reference { W: number; H: number; box: number[]; scale: number; outW: number; outH: number; samples: { x: number; y: number; hex: string; rgb: number[]; page?: { hex: string; rgb: number[] } }[]; compare: Compare | null; jpeg: string }

const PANEL = 480; // compare panels are this tall
const CHANNEL = 24; // a channel off by more than this counts as a difference: a page never matches a photo to look's 8

let util: Promise<Page> | undefined;
/** One bare page in the shared Chrome for canvas work, remade when Chrome went away. */
export async function utilPage(chrome: Promise<Browser>): Promise<Page> {
  const p = util && await util.catch(() => null);
  if (p && !p.isClosed() && p.browser().connected) return p;
  util = chrome.then(b => b.newPage());
  return util;
}

/** Runs in the page: decodes the picture (and the look), samples, crops and grids or composes the comparison, returns a JPEG. */
async function inPage(a: { pic: string; look: string | null; crop: number[] | null; grid: number; sample: number[][]; panel: number; channel: number; cells: number }): Promise<Reference> {
  const img = (b64: string) => createImageBitmap(new Blob([Uint8Array.fromBase64?.(b64) ?? Uint8Array.from(atob(b64), c => c.charCodeAt(0))])); // as PNG_BLOB in look.ts
  const pic = await img(a.pic), W = pic.width, H = pic.height;
  const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const hex = (rgb: number[]) => "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("");
  const reader = (b: ImageBitmap) => {
    const c = canvas(b.width, b.height).getContext("2d", { willReadFrequently: true })!;
    c.drawImage(b, 0, 0);
    return (x: number, y: number) => { // the 5 × 5 mean around (x, y)
      const d = c.getImageData(Math.min(Math.max(0, Math.round(x) - 2), b.width - 5), Math.min(Math.max(0, Math.round(y) - 2), b.height - 5), 5, 5).data, s = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { s[0] += d[i]!; s[1] += d[i + 1]!; s[2] += d[i + 2]!; }
      const rgb = s.map(v => Math.round(v / (d.length / 4)));
      return { hex: hex(rgb), rgb };
    };
  };
  const lk = a.look ? await img(a.look) : null, atPic = reader(pic), atPage = lk && reader(lk);
  // with a look, each point is also read on the page at the same place relative to its size
  const samples = a.sample.map(([x, y]) => ({ x: x!, y: y!, ...atPic(x!, y!), ...atPage && { page: atPage(x! * lk!.width / W, y! * lk!.height / H) } }));
  let out: HTMLCanvasElement, scale: number, compare: Compare | null = null;
  // a crop past an edge is trimmed to the picture; one wholly outside draws nothing and the caller says so
  const box = a.crop ? [Math.max(0, a.crop[0]!), Math.max(0, a.crop[1]!), Math.min(W, a.crop[2]!), Math.min(H, a.crop[3]!)] : [0, 0, W, H];
  const [l, t, r, b] = box as [number, number, number, number], cw = r - l, ch = b - t;
  if (cw <= 0 || ch <= 0) return { W, H, box, scale: 0, outW: 0, outH: 0, samples, compare, jpeg: "" };
  if (lk) { // with a crop, the same region of the look, at the picture's share of its size
    const sx = lk.width / W, sy = lk.height / H, lb = [l * sx, t * sy, cw * sx, ch * sy] as const;
    const h = a.crop ? Math.min(a.panel, Math.round(960 * ch / cw)) : a.panel, pw = Math.round(cw * h / ch), lw = Math.round(lb[2] * h / lb[3]);
    const same = Math.abs(W / H - lk.width / lk.height) / (W / H) < 0.02;
    out = canvas(pw + lw + (same ? pw + 16 : 8), h + 18);
    const c = out.getContext("2d")!;
    c.imageSmoothingEnabled = !a.crop || h / ch < 2; // a crop's enlarged pixels stay pixels
    c.fillStyle = "#222"; c.fillRect(0, 0, out.width, out.height);
    c.drawImage(pic, l, t, cw, ch, 0, 18, pw, h); c.drawImage(lk, ...lb, pw + 8, 18, lw, h);
    c.fillStyle = "#fff"; c.font = "13px sans-serif";
    c.fillText(`picture ${W} × ${H}`, 4, 13); c.fillText(`page ${lk.width} × ${lk.height}`, pw + 12, 13);
    compare = { same, pageW: lk.width, pageH: lk.height, panel: h };
    if (same) { // both drawn at the panel's size: the share that differs, overall and in N × N regions, and the look greyed with those pixels red
      const dc = canvas(pw, h), tc = dc.getContext("2d", { willReadFrequently: true })!;
      tc.imageSmoothingEnabled = c.imageSmoothingEnabled;
      tc.drawImage(pic, l, t, cw, ch, 0, 0, pw, h); const A = tc.getImageData(0, 0, pw, h).data;
      tc.drawImage(lk, ...lb, 0, 0, pw, h); const B = tc.getImageData(0, 0, pw, h), D = B.data;
      const N = a.cells; let n = 0; const cells = new Array(N * N).fill(0), cellN = new Array(N * N).fill(0);
      for (let i = 0; i < pw * h; i++) {
        const x = i % pw, y = (i / pw) | 0, cell = ((y * N / h) | 0) * N + ((x * N / pw) | 0), j = i * 4;
        const hit = Math.abs(A[j]! - D[j]!) > a.channel || Math.abs(A[j + 1]! - D[j + 1]!) > a.channel || Math.abs(A[j + 2]! - D[j + 2]!) > a.channel;
        const g = (D[j]! * 0.3 + D[j + 1]! * 0.59 + D[j + 2]! * 0.11) * 0.6;
        cellN[cell]++;
        if (hit) { n++; cells[cell]++; D[j] = 255; D[j + 1] = D[j + 2] = g * 0.3; } else D[j] = D[j + 1] = D[j + 2] = g;
      }
      tc.putImageData(B, 0, 0); c.drawImage(dc, pw + lw + 16, 18); c.fillText("differences in red", pw + lw + 20, 13);
      compare.share = n / (pw * h); compare.cells = cells.map((v, i) => v / cellN[i]);
    }
    scale = h / ch;
  } else {
    scale = Math.min(1280 / cw, 1280 / ch, a.crop ? 4 : 1);
    out = canvas(Math.round(cw * scale), Math.round(ch * scale));
    const c = out.getContext("2d")!;
    c.imageSmoothingEnabled = scale < 2; // enlarged pixels stay pixels
    c.drawImage(pic, l, t, cw, ch, 0, 0, out.width, out.height);
    if (a.grid > 0) {
      c.font = "11px sans-serif"; c.lineWidth = 1; c.strokeStyle = "rgba(255, 230, 0, 0.7)";
      const label = (s: string, x: number, y: number) => { c.strokeStyle = "rgba(0,0,0,0.9)"; c.lineWidth = 3; c.strokeText(s, x, y); c.fillStyle = "#ffe600"; c.fillText(s, x, y); c.strokeStyle = "rgba(255, 230, 0, 0.7)"; c.lineWidth = 1; };
      for (let gx = Math.ceil(l / a.grid) * a.grid; gx <= r; gx += a.grid) { const x = Math.round((gx - l) * scale) + 0.5; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, out.height); c.stroke(); label(String(gx), x + 2, 11); }
      for (let gy = Math.ceil(t / a.grid) * a.grid; gy <= b; gy += a.grid) { const y = Math.round((gy - t) * scale) + 0.5; c.beginPath(); c.moveTo(0, y); c.lineTo(out.width, y); c.stroke(); label(String(gy), 2, y - 2); }
    }
  }
  return { W, H, box, scale: +scale.toFixed(2), outW: out.width, outH: out.height, samples, compare, jpeg: out.toDataURL("image/jpeg", 0.85).split(",")[1]! };
}

/** The picture `f` names under `dir`, or the baseline of that name from look { save } (the page against its own earlier
 * look), with how the reply calls it. */
export function pictureFile(dir: string, f: unknown): { file: string; name: string } {
  const file = typeof f === "string" && f ? resolve(dir, f) : "";
  if (file && existsSync(file)) return { file, name: f as string };
  const base = typeof f === "string" && /^[\w-]{1,64}$/.test(f) && `${baselinePath(dir, f)}.png`;
  if (base && existsSync(base)) return { file: base, name: `baseline ${f}` };
  throw new Error(`reference: no file ${f ?? ""} under ${dir}: give the picture's path relative to cwd, or a baseline name from look { save }`);
}

/** The picture's viewpoint as the scene loops keep it: the entry under its file name in `refs/cameras.json` (or a
 * `cameras.json` beside the picture), `{ position, lookAt }`, so a compare needs no camera argument; null without one. */
export function viewpoint(dir: string, file: string): { position: number[]; lookAt?: number[] } | null {
  for (const f of [join(dir, "refs", "cameras.json"), join(dirname(file), "cameras.json")]) {
    try { const c = JSON.parse(readFileSync(f, "utf8"))[basename(file)]; if (Array.isArray(c?.position)) return c; } catch {}
  }
  return null;
}

/** The picture read as the options say, with the reply's text and its JPEG (base64); `name` is how the text calls the file. */
export async function reference(chrome: Promise<Browser>, o: ReferenceOptions, name = o.file): Promise<{ text: string; jpeg: string; ref: Reference }> {
  const N = o.cells ?? 4, given = o.crop ?? null, notes: string[] = [];
  if (!Number.isInteger(N) || N < 2 || N > 16) throw new Error("reference: cells is a whole number of regions per side, 2 to 16");
  if (given && (given.length !== 4 || !given.every(Number.isFinite))) throw new Error("reference: crop is [left, top, right, bottom] in the picture's pixels");
  let crop = given;
  // a right left of left or a bottom above top can only be [x, y, width, height]: agents send that shape as often as not
  if (given && (given[2]! <= given[0]! || given[3]! <= given[1]!)) {
    if (given[2]! <= 0 || given[3]! <= 0) throw new Error("reference: crop is [left, top, right, bottom] in the picture's pixels, right > left and bottom > top");
    crop = [given[0]!, given[1]!, given[0]! + given[2]!, given[1]! + given[3]!];
    notes.push(`crop ${JSON.stringify(given)} read as [x, y, width, height]: [${crop.join(", ")}].`);
  }
  const page = await utilPage(chrome);
  const pic = readFileSync(o.file).toString("base64"), look = o.look ? readFileSync(o.look).toString("base64") : null;
  const r = await page.evaluate(inPage, { pic, look, crop, grid: o.grid ?? 0, sample: o.sample ?? [], panel: PANEL, channel: CHANNEL, cells: N });
  if (!r.jpeg) throw new Error(`reference: crop ${JSON.stringify(crop)} is outside the ${r.W} × ${r.H} picture`);
  if (crop && r.box.some((v, i) => v !== crop![i])) notes.push(`crop [${crop.join(", ")}] runs past the picture's edge: trimmed to [${r.box.join(", ")}].`);
  const lines = [`${name} is ${r.W} × ${r.H} px.`, ...notes];
  if (r.compare) {
    const c = r.compare, pct = (v: number) => `${Math.round(v * 100)}%`;
    const region = crop ? `[${r.box.join(", ")}] of the picture at ${r.scale}× and the same region of` : "the picture,";
    lines.push(`Shown: ${region} the page's look (${c.pageW} × ${c.pageH})${c.same ? " and their differences in red, each" : ", each"} ${c.panel} px tall.`);
    if (!c.same) lines.push(`The page's aspect (${(c.pageW / c.pageH).toFixed(2)}) is not the picture's (${(r.W / r.H).toFixed(2)}), so pixels were not compared: size the canvas to the picture's aspect, e.g. ${Math.round(PANEL * 2 * r.W / r.H)} × ${PANEL * 2}, and compare again.`);
    else {
      const rows = Array.from({ length: N }, (_, y) => c.cells!.slice(y * N, y * N + N).map(pct).join(" ")).join(" / ");
      const worst = c.cells!.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0])[0]!, row = Math.floor(worst[1] / N), col = worst[1] % N;
      const where = N === 4 ? `${["top", "upper-middle", "lower-middle", "bottom"][row]} ${["left", "centre-left", "centre-right", "right"][col]}` : `row ${row + 1}, cell ${col + 1}`;
      lines.push(`${pct(c.share!)} of pixels${crop ? " in that region" : ""} differ by more than ${CHANNEL}/255 in a channel at ${c.panel} px tall. By region (${N} × ${N}), rows top to bottom and cells left to right: ${rows}. Most different: ${where} (${pct(worst[0])}).`);
    }
  } else {
    lines.push(`Shown: [${r.box.join(", ")}] at ${r.scale}× (${r.outW} × ${r.outH})${o.grid ? `, gridlines every ${o.grid} px labelled in the picture's pixels` : ""}.`);
  }
  const off = (a: number[], b: number[]) => b.map((v, i) => { const d = v - a[i]!; return d > 0 ? `+${d}` : String(d); }).join(" ");
  if (r.samples.length) lines.push(`Colours (5 × 5 mean): ${r.samples.map(s => s.page ? `(${s.x}, ${s.y}): picture ${s.hex}, page ${s.page.hex}, off by ${off(s.rgb, s.page.rgb)}` : `(${s.x}, ${s.y}) ${s.hex}`).join(r.samples[0]!.page ? "; " : ", ")}.`);
  return { text: lines.join("\n"), jpeg: r.jpeg, ref: r };
}
