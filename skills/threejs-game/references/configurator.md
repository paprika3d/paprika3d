# Product viewers and configurators

A configurator shows one product in many variants (colours, materials, parts). Give the page a `window.__game` whose `setState` switches the variant (`{ color: "red", trim: "oak" }`) and whose `observe()` returns it, so the harness can set each one.

## Every variant in one picture

`look` with `sheet`: one item per variant, each pictured on a freshly reloaded page set with its `state`, in one labelled grid (up to 9).

```json
{ "sheet": [
  { "label": "red, oak", "state": { "color": "red", "trim": "oak" } },
  { "label": "black, walnut", "state": { "color": "black", "trim": "walnut" } }
] }
```

Add `steps` to an item to open a drawer or turn the product first, as `interact` does. Each variant's own model file gets `model_audit` (`path` the file, or the folder holding them all), with `target: "shopify"` for a listing; see `references/assets.md`.

## What the harness does not measure

The `open` tool serves the page at the URL its reply starts with (or runs your dev server), and that URL stays up while the harness runs. Give the same URL to:

- Chrome DevTools, or the chrome-devtools-mcp server, for a performance trace with Core Web Vitals (LCP, INP, CLS) or a memory heap snapshot.
- Lighthouse (`npx lighthouse <url>`) for its scores.

A model over about 1 MB gets a small progress indicator that is gone once it has loaded (the skill's no-loading-text rule is for games); `look` with `opening: true` shows how long it stays.

The harness's own server sends files uncompressed, so their transfer sizes run larger than behind a CDN. `perf` with `budget: "site"` and `open` with `network` cover the first scene frame, the script size and the asset budget.
