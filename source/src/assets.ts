// The over-budget texture list, part of `optimize`'s report (not a runtime switch: it is about files, not frames).
// Lists the images and .glb and .usdz models under the project folder whose largest texture is over the budget's textureMax
// (imageDim reads the textures inside a .glb or .usdz), loaded or not. `check`'s line counts what the page fetched instead.
import { relative } from "node:path";
import { assetFiles, type Assets } from "./perf.ts";
import type { Budget } from "./budgets.ts";

const MB = (bytes: number) => Math.round(bytes / 2 ** 20 * 100) / 100;

/** An asset over textureMax: path relative to the folder, size and largest texture side. */
export interface AssetIssue { path: string; MB: number; dim: number }

/** The folder's asset size (MB) and its files with a texture over textureMax, biggest first. */
export function listAssets(dir: string, budget: Pick<Budget, "textureMax">): { assetMB: number; issues: AssetIssue[] } {
  const files = assetFiles(dir).sort((a, b) => b.bytes - a.bytes);
  const issues = files.filter(f => f.dim > budget.textureMax).map(f => ({ path: relative(dir, f.path), MB: MB(f.bytes), dim: f.dim }));
  return { assetMB: MB(files.reduce((n, f) => n + f.bytes, 0)), issues };
}

/** `check`'s line on files a player waits for: what the page fetched (pageAssets(), as `perf` counts it) over assetMB
    and the fetched textures over textureMax, or "" when neither is. The plan's layer 1 expects `check` to name both, as
    `perf` and `model_audit` do (#32). It sized the served folder before: 911 MB of raw downloads on a page that loaded
    13 MB (Backrooms, #131). */
export function assetsOver(fetched: Assets, budget: Pick<Budget, "assetMB" | "textureMax">): string {
  const assetMB = MB(fetched.assetMB * 2 ** 20), issues = fetched.files.filter(f => f.dim > budget.textureMax).sort((a, b) => b.MB - a.MB);
  const parts = [...assetMB > budget.assetMB ? [`${assetMB} MB of assets this load fetched, over the ${budget.assetMB} MB budget`] : [],
    ...issues.length ? [`textures over ${budget.textureMax} px, to resize or compress: ${issues.slice(0, 10).map(a => `${a.path} (${a.dim} px, ${a.MB} MB)`).join(", ")}${issues.length > 10 ? ` and ${issues.length - 10} more` : ""}`] : []];
  return parts.length ? `\nAssets: ${parts.join("; ")}` : "";
}
