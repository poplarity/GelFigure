# Protein gel mode — development notes

Goal: one tool that takes a gel image, **works out by itself whether it is a DNA or a protein gel**, opens the matching mode, and lets the user switch if the guess is wrong. Protein mode keeps everything that works well for DNA gels and replaces what does not.

Status: released in **0.6.0** (2026-10-20). The notes below record the design; see `CHANGELOG.md` for what shipped.

## What actually differs (and what does not)

| Aspect | DNA gel | Protein gel (SDS-PAGE) | Action |
|---|---|---|---|
| Straighten, crop, lane lattice, lane naming, groups, conditions, splicing, panel letters, export pipeline | works | same geometry | **shared, no change** |
| Size unit | bp (kb) | kDa | per-gel-type unit |
| Migration curve | `y = a + b·ln(size) + c·ln²(size)` | same family, but a quadratic in log is a rougher approximation over 10–250 kDa | shared model, protein gets **wider tolerances** and **more size skipping** |
| Ladder lane detection | ladder has 10–21 bands → require ≥6 sharp bands | prestained ladders have 6–11 bands | protein threshold = 4 |
| Band shape | thin, sharp lines | wide, diffuse, often smeared | peak minimum distance and assignment tolerance scale with lane width |
| Imaging | EtBr/SYBR, near-greyscale on black | Coomassie (blue on pale background) or ECL (black background) | detection uses colour + band width, not just intensity |
| Markers | every band labelled by default | often only reference bands labelled | protein defaults to labelling the reference bands and thinning harder |
| Pre-flight | saturation, clipping, dpi | plus: prestained MW is *apparent*, drifts with gel % and buffer | extra info item in protein mode |

## Behaviour

1. On import, `detectGelType()` returns `{kind, confidence, reasons}`.
2. The state gets `gelType: 'dna' | 'protein'`. Everything that depends on units, ladder library and tolerances reads from it.
3. A segmented control at the top of the Image panel shows `DNA 胶 / 蛋白胶`. Changing it re-applies the unit, ladder library and marker labels **without re-detecting lanes**, and keeps names, groups, conifers and arrows.
4. If the detected type and the user's choice differ, the confirmation is a toast, never a modal.

## Detection signals (no ML, explainable)

- **Colour spread**: Coomassie gels are colour images with blue-dominant bands; EtBr on a black background is nearly grey. Measured as mean chroma and the fraction of blue-dominant pixels in the band region.
- **Band width / lane pitch**: protein bands span most of the lane; DNA bands are a fraction of it.
- **Ladder-lane band count and spacing**: many regularly spaced bands → DNA ladder.
- **Migration curvature**: a straight line in ln(size) fits a DNA ladder tightly; protein prestained marker sets spread more.

Each signal contributes a vote; the result and its reasons are shown in the tooltip of the type control.

## Files

- `js/i18n.js` — unchanged.
- `js/ladders.js` — ladder entries get `kind`; protein library; `all(kind)`; custom ladders carry their kind.
- `js/engine.js` — `prepLane` / `assign` / `matchMulti` take a `mode`; `detectGelType`; protein-aware `detectBands` spacing.
- `js/tiff.js` — keep colour statistics (chroma, blue fraction) from the decode instead of throwing them away.
- `js/app.js` — `S.gelType`, unit-aware `fmtSize`, `setGelType`, `autoMarkers` thresholds per type, auto-detect on import, pre-flight item.
- `js/render.js` — `(kDa)` header, label thinning per type.
- `js/ui.js` — type control, marker list per library, toast on auto-detect.
- `js/figedit.js` — arrow popover unit.
- `js/demo.js` — synthetic protein gel for tests and the demo button.
- `js/uitest.js`, `tests/run.mjs` — new checks.
- `docs/ladders.md`, `README*.md`, `CHANGELOG.md`.

## Acceptance

- DNA behaviour is unchanged: the existing 29 checks still pass in Chromium, Firefox and WebKit.
- A synthetic protein gel is typed as protein with the correct ladder; a DNA gel as DNA.
- Switching the type manually keeps lane names, groups, conditions and arrows, and relabels the marker in the new unit.
- Arrows estimate in kDa; the figure header reads `(kDa)`; the processing log records the gel type.
