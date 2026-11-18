# rmf-sweep-lab

**Promise:** sweep 12 analytic curves into closed tubes with rotation-minimizing frames — **0 frame flips / 12 watertight / 0 boundary edges**, versus the Frenet baseline's **6 normal flips (max 179.99° step)** on the same 3 inflected curves; circular-arc volume matches the Pappus oracle to **5.69e-5 relative** and converges at **4.01–4.08× per ring doubling** (theory 4).

Upstream: none

One command: `node tools/gen-sample.mjs && node bench/verify.mjs && node bench/bench.mjs`

Then `python3 -m http.server 4173` and open <http://localhost:4173>. The page fetches the same `data/curves.json`, calls **the same `src/core.mjs`** to rebuild all 12 tubes in the browser, and shows a fingerprint that must equal the node bake (`= node bake`).

## What it does

`src/core.mjs` is pure ES geometry (no three.js, no DOM, no I/O):

- analytic curve definitions (`arc`, `helix`, `wave`, `saddle`) with exact derivatives;
- **double-reflection RMF transport** (Wang et al. 2008) using unit reflection vectors, so it is exactly scale-free;
- textbook **Frenet frames** as the control, computed from the analytic second derivative;
- swept tube mesh: `rings × segments` side quads, two cap fans, global winding fixed by signed volume;
- audit: boundary/non-manifold edge counts, orientation consistency, volume, area, mesh fingerprint.

`main.js` only fetches, renders and displays core output; it never recomputes geometry itself.

## Evidence (`bench/result.json`, 7 timed samples, node v24.19.0)

| metric | RMF (this repo) | Frenet baseline |
|---|---|---|
| frame flips (>90° step) | **0 / 12 curves** | **6** (3 wave curves × 2) |
| max frame step | **2.7044°** | **179.9937°** |
| watertight meshes | 12 / 12 | 12 / 12 |
| boundary / non-manifold edges | 0 / 0 | 0 / 0 |
| max frame orthonormality error | 2.22e-16 | — |
| curvature of the tube surface | continuous | 180° normal jump at each inflection |

- 12 curves × 16,384 triangles = **196,608 triangles**; the `gen + verify` command measured **2.31 s** wall time, and the bench is a separate 7-sample run.
- Pappus oracle (independent closed form, polygonal cross-section): arc volume error **6.32e-6 / 2.53e-5 / 5.69e-5**, area error **3.61e-6 / 1.52e-5 / 3.46e-5** for arc90 / arc180 / arc270.
- Ring-doubling convergence on arc180 at rings 50/100/200/400/800: **4.081, 4.040, 4.020, 4.010** (second-order, as predicted).
- Scale sweep 1e-3 → 1e6: normalized-volume spread **4.55e-14**, all watertight and flip-free; all RMF sweep thresholds are relative (unit reflection vectors); the Frenet control keeps a small absolute floor in its degeneracy test and is not claimed scale-free.
- Timing, 12 curves per run: cold start **298.11 ms**; RMF median **212.07 ms**, p95 **247.70 ms**, RSD **6.94%** (7 samples); Frenet median 199.28 ms. The cold start is JIT warmup and is reported separately, not hidden in the median.
- `bench/verify.mjs`: **16/16 assertions pass**, including an independent edge audit (sorted-edge counting) and 24/24 baked fingerprints matching a fresh node recomputation.

## 本轮创新

Previous B-team sweep work was either camera fly-through retiming (`sweepwarp-lab`) or heuristic adaptive tessellation. This is the first sweep-tube bench that **certifies frame transport itself**: flip count, max angular step, orthonormality, watertightness via an independent edge audit, and Pappus volume/area with measured second-order convergence — all from one pure core that the node bake and the browser recompute bit-for-bit (fingerprint match on screen). The RMF algorithm is textbook; the new artifact is the **verifiable contract around it**, which is what makes the "0 flips vs 6 flips" claim checkable in one command instead of eyeballed.

## Known limits

- **Pappus oracle is exact only for a regular polygonal cross-section**; the mesh volume is **0.642–0.647% below the continuous-circle value** (measured 6.42e-3–6.47e-3 relative at segments=32), because a 32-gon inscribes the circle. Both values are disclosed; the headline 5.69e-5 is against the matching polygon.
- Volume error is **discretization error, not a bug**: it shrinks 4× per ring doubling; at rings=256 the worst arc (270°) is 5.7e-5. A claim of "1e-13" would require analytic integration of the mesh, not a triangle sum.
- Frenet tubes are still **watertight** (12/12): the baseline's defect is a discontinuous frame/twisted surface, not open edges. The visual 180° normal jump is the failure mode.
- The `>90°` flip criterion is a declared convention; it captures the planar-wave inflection but would not flag a slow accumulated twist.
- Cap fans are flat disks and contribute to area but not volume; `arcAnalytic` includes them.
- Curves are open (two caps). Closed-loop holonomy compensation is not implemented.
- No headless browser is used (environment forbids it): the page is validated by HTTP 200 + importmap + the shared-core fingerprint, not by pixels.

## Files

```
src/core.mjs          pure geometry + audit (no three.js / DOM)
main.js               three.js render + UI, consumes core
index.html            importmap (three 0.160.0 pinned) + panel
tools/gen-sample.mjs  deterministic corpus + node-baked fingerprints
bench/verify.mjs      16 assertions
bench/bench.mjs       cold start + 7 samples, writes bench/result.json
baseline/frenet.mjs   runnable control (same sweep, Frenet frames)
data/curves.json      generated; never hand-edited
```

MIT-style original work; no upstream code copied. `Upstream: none`.