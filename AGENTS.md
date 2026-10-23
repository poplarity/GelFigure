# GelFigure — notes for developers and coding agents

> **中文摘要**：这是给接手开发的人和 AI Agent 看的交接文档：项目结构、数据流、约定和踩过的坑、测试与发布流程、维护者的工作习惯，以及待办问题。普通用户请看 [README](README.zh-CN.md)；贡献规范见 [CONTRIBUTING](CONTRIBUTING.md)（本文不重复其中内容）。

Read [CONTRIBUTING.md](CONTRIBUTING.md) first (no build step, bilingual strings, ladder sources, `npm test`). This file adds what is not obvious from the code: how the pieces fit, the rules that keep the project healthy, how releases are made, and what is still open.

## In one minute

- A static web app: `index.html` + `css/style.css` + plain scripts in `js/`. No framework, no dependencies, no network (a Content Security Policy blocks every request to another origin). It must keep working when opened from `file://` and as the single-file build.
- `npm install && npx playwright install chromium firefox webkit && npm test` runs everything (≈ 5 min, three engines).
- Live site = `main` (GitHub Pages). Work happens on `dev`; `main` only moves at release time.

## Architecture

Scripts load in this order (also hard-coded in `scripts/bundle-onefile.mjs` — add new files to both, or the bundle build fails on purpose). Each is an IIFE that hangs one global on `window`:

| File | Global | Role |
|---|---|---|
| `storage.js` | `PrefStorage` | localStorage wrapper that survives blocked storage / full quota |
| `i18n.js` | `I18N`, `L` | `L('中文','English')`; `data-en*` attributes in HTML |
| `tiff.js` | `TIFF` | dependency-free TIFF decoder (8/16/32-bit, float, RGB, palette, 1/2/4-bit, LZW/Deflate/PackBits, tiles); other formats via the browser |
| `colour.js` | `Colour` | Original-colour display buffer: RGB rotation aligned to `Engine.rotate`, background sampling for annotation contrast and colour exposure thumbnails. No detection or intensity adjustment. |
| `ladder-cache.js` | `LadderCache` | independent custom-marker/favourite cache, synchronous local copy plus transactional IndexedDB fallback; migration, status and queued mutations |
| `ladders.js` | `Ladders` | DNA (bp) and protein (kDa) ladder library, favourites, custom ladders |
| `engine.js` | `Engine` | pure image processing on `{w, h, data: Float32Array}`: polarity, deskew, auto-crop, lane lattice, band peaks, ladder matching, gel-type vote |
| `render.js` | `Render` | state → publication SVG, units = pt (1/72 in); text layout (wrapping, group tiers) |
| `export.js` | `Export` | PNG (pHYs/sRGB/iTXt), TIFF writer, SVG, uncropped image, original bytes, processing log; `download()` goes through the optional `Export.deliver` hook |
| `pptx.js` | `PPTX` | Editable PowerPoint: maps the renderer's SVG subset to native DrawingML; uncropped processed PNG + native crop per image segment; dependency-free ZIP writer |
| `demo.js` | `Demo` | synthetic DNA / protein gels for the demo button and tests |
| `app.js` | `App` | state `App.S`, automatic pipeline, undo/redo, projects, templates, drafts, pre-flight |
| `library.js` | `App` history methods | IndexedDB project history, source deduplication, legacy draft migration and autosave status |
| `editor.js` | `Editor` | canvas editor on the raw image: crop box, lanes, marker bands, arrows, boxes, brackets; zoom, pan, pinch |
| `ui.js` | `UI` | side panel, top bar, coach line, live preview, export buttons |
| `figedit.js` | `FigEdit` | editing on the figure: inline text editor + size bar, popovers, tool modes |
| `mobile.js` | `Mobile` | phone layout and touch: bottom bar, export / more / result sheets, selection bar, photo downscaling |
| `marker-ui.js` | `MarkerUI` | marker-lane picking, compact non-modal reference beside the raw canvas, band-size picker and direct marker-label controls |
| `history-ui.js` | `HistoryUI` | responsive recent-project dialog, rename/delete, cache status and save-file fallback |
| `uitest.js` | — | interface self-test, loaded only with `?uitest=1` |

**Data flow.** File → `TIFF.decodeBuffer` → `App.readInput` → `startFrom` builds `App.S` → `App.autoAll` (deskew, crop, lanes, markers, gel type) → `App.buildFigure` remaps lanes to the figure range → `Render.build` → SVG preview / exports.

**Events.** `App.on(fn)` listeners receive `'loaded' | 'change' | 'select' | 'refresh'`. `App.commit()` pushes an undo snapshot and emits `'change'`; `App.refresh()` re-renders on the next frame without a snapshot (use it while dragging, then `commit()` once).

**State (`App.S`, serialisable JSON).** `file`, `rotation`, `levels`, `crop`, `lanes[{x, name, hidden}]`, `markers[{lane, ladderId, unit, side, bands}]`, `groups`, `conditions`, `arrows`, `boxes`, `brackets`, `labels`, `style` (defaults: `defaultStyle()` in `app.js`). Things to know:
- Lane x, band y, arrow y … are in **rotated-image pixels (absolute)**, so changing the crop never moves annotations. Rotation remaps them (`App.setRotation`).
- **Lanes are numbered by well across the whole gel**; the crop only selects which wells appear. Names are never lost when the range changes.
- `laneLinked` defaults to true for new inputs. `laneGrid` captures an immutable drag baseline, `dragLane` scales the in-crop grid from its endpoints or translates it from a middle lane, and `restoreLaneGrid` cancels the whole gesture. `resizeLaneGrid` keeps retained lane metadata through a one-to-one ordered mapping and remaps groups/conditions/markers; it must never call automatic marker discovery. Hidden wells still count. Old project restoration must not regularize existing positions. Count controls and combined crop re-detection are on the left (phone Settings); names/bulk paste and typography are above the figure. The red frame is the crop control, with no duplicate well-range selectors.
- `redetectCrop()` runs lane detection then `detectMarkersInCrop()` explicitly. Ordinary crop movement only refreshes the figure; never classify markers implicitly in `afterRangeChange`. `replaceDetectedCrop` uses one mapping for lane metadata/conditions/groups/marker roles, anchors confirmed choices at their actual x coordinates, and never calls `resizeLaneGrid` afterward. Confirmed markers (`userAssigned`, `ladderLocked`, manual anchors), outside-crop roles and lane `markerExcluded` choices survive. Initial detection must use actual detected lane centres, not a newly regularized grid. All automatic candidates, including the first and the final joint match, must pass coverage checks.
- Marker references are schematic SVGs built from the existing catalogue, not vendor photographs or measured migration. Previewing a model must not change state until applied. The non-modal card stays in `editorBox`; calibration positions come from the actual canvas. `alignMarker(mi)`/`matchMarkers(false, subset)` update only the selected marker(s). Hiding a label preserves calibration; deleting a band mark sets `excluded`, clears its anchor, and hides it until manual re-positioning/undo. Unmatched predicted labels start hidden. Removing a marker role sets the lane's `markerExcluded`; selecting that lane explicitly clears it. `renderState` carries marker `src` indices so cropped-out markers never shift the editing target. Popovers and canvas gestures guard against project-state replacement. Editor-only controls/references never enter exports.
- Font sizes: `style.fontPt`, optional `style.lanePt` / `style.markerPt`, and an optional `pt` on each group, condition row, arrow, box, bracket and side text (`null`/absent = follow `fontPt`).
- Figure font: `style.fontFamily` (default `Arial`), restricted to `Render.fontNames`. `Render.fontName()` validates names; `Render.fontStack()` supplies the system fallback chain. `Render.measure(text, pt, bold, family)` / `wrapText(text, pt, width, family)` take an optional font argument, defaulting to Arial. `Render.build` binds every measurement to the figure font, and returns `fontFamily` for PPTX runs/themes. No fonts are downloaded or embedded; never claim that a missing local font renders identically on another device.
- Marker-unit headings are anchored beside the gel's top edge, independently of lane names, groups and conditions. Do not reserve a whole blank header row above the gel: keep the usual condition baseline and add clearance only for actual crop-edge/large-font conflicts. Left/right units share a baseline; `style.unitHeader` still toggles them.
- `displayMode`: `colour` / `gray`. All newly imported images default to grayscale, including colour sources and new exposure sets; explicit Original colour remains available. Restored projects/history keep their saved mode; legacy projects without the field remain grayscale. Decoder `rgb` and `App.sourceRGB` are 8-bit interleaved RGB for display, separate from the unchanged high-precision grayscale `data` / `App.src`. Never put pixel buffers in state/history. `App.displayLevels()` returns identity for colour; stored `S.levels` are only used for grayscale. `App.displayDark()` governs annotation contrast. Mode switching must not re-run detection, clear geometry, or inherit an inversion into the colour display. TIFF RGB values assume sRGB; ICC profiles are not applied (notice on input).
- Persistence: project files (`.gelfig` = gzip JSON + original bytes), style templates (relative to the first figure lane; carry custom ladder definitions), autosaved drafts (IndexedDB), preferences (`PrefStorage`).
- The marker catalogue uses localStorage `gelfig.markerLibrary.v1` and a separate IndexedDB `gelfigure-markers` v1 / `library` store / `catalog` key. Legacy `gelfig.customLadders` and `gelfig.favLadders` migrate automatically. `Ladders.ready` resolves before detection or project restoration; its synchronous APIs also keep edits made during startup. `Ladders.flush()` waits for transaction completion and reports whether the latest library is durable in at least one store. Failed mutations remain queued for retry; deletes and favourite removals must not resurrect. `gelfigure-ladders` updates library/status UI without changing figure state. Adding definitions never silently replaces an older definition, even with the same name; DNA/protein names are independent. Backup JSON contains custom definitions and favourite IDs only. Import merges, validates before mutation and remaps conflicting IDs; browser/HTML-file storage is not shared automatically.
- History uses the existing `gelfigure` IndexedDB v1 / `drafts` store: `project:<id>` metadata, `img:<sha256>` original bytes and `meta` for the most recent project. Legacy `meta` + `src` migrate atomically before writes. Capture snapshots/files before awaiting, serialize mutations, and retain shared source references during deletion. `App.projectId` is independent of filenames/hashes; importing the same source twice creates independent projects. Exposure changes keep the project ID. `restoreSnapshot` is shared by project files/history; history additionally restores all exposures. A `.gelfig` file still carries only the selected exposure. `gelfigure-cache` is a separate window event: do not trigger a full panel render while a user types. Cache transactions must report completion/abort, not just request success. `UI.archiveCurrent()` flushes editors and guards UI navigation when caching fails.

**Phone layout.** The phone query `(max-width: 900px), (max-height: 520px) and (pointer: coarse)` exists twice — in `css/style.css` and as `phoneMq` in `ui.js`; keep them identical. `mobile.js` only adds a layer on top of the desktop code (it forwards to the desktop buttons); phone work must not change desktop behaviour or the engine.

Marker label/band-size popovers move via their title handle (pointer capture or keyboard arrows). Their positions stay in `MarkerUI` memory for the current project, outside `App.S`, undo and exports. Clamp against the visual viewport, including keyboard/resize changes; use fractional DOM bounds so panels stay fully visible. Closing, pointer cancellation and window blur end an active drag. Body controls and scrolling must not start a panel drag.

Double-clicks/taps on the raw canvas open the label editor only for existing, visible marker lanes (including their number chips/bands). Sample lanes and gaps never add lanes. The + Lane button is shared by desktop and phones; explicit tools keep their single-click behaviour. Outside calibration mode, single band clicks select their lane without opening or zooming anything. Touch double-tap recognition requires the same marker and project; drags, pinch, cancellation and loads clear the pending tap.

## Rules that keep the project healthy

- **Image integrity first.** Linear, whole-image adjustments only by default; nothing removed silently (cut lanes get a splice mark and a log entry); anything that changes how the data looks is recorded in the processing log. Exports are never upscaled-and-passed-off: the gel's effective dpi is reported separately from the export dpi.
- **Honest numbers.** Sizes outside the ladder are marked `≈`; a ladder without a manufacturer source is not added (see CONTRIBUTING).
- **No network, no dependencies, works from `file://`.** No ES modules, no CDN.
- **Bilingual UI**, English figures/logs/exports.
- **Detection changes are risky.** A rule tuned on synthetic gels has broken a real gel before. Check against real gels (see below) as well as `npm test`.

## Pitfalls we have hit

- **Windows encoding:** Windows PowerShell 5.1 `Get-Content` / `Set-Content` read BOM-less UTF-8 as the ANSI code page and turn every Chinese string into mojibake (the UI tests then time out). Edit files with a UTF-8-aware editor or Node `fs` with `'utf8'`.
- **`*` is italic markup** in labels (`*lacZ*`). An unpaired `*` is currently dropped (see open issues). Band symbols (`*`, `#`, `†`) are written outside `textEl` for that reason.
- **Safari canvas limit ≈ 16.7 MP.** Bigger canvases render blank. `mobile.js` scales camera photos above 10 MP on touch devices; the export sheet warns when a raster would exceed the limit.
- **Headless test quirks:** `?demo=1` sets `App.forceJsHash` (WebCrypto off-thread stalls Playwright's clock); IndexedDB checks need a real browser (`&draft=1`). A full three-engine run occasionally times out in Firefox when the machine is busy — rerun that engine alone (`npm test -- --browser=firefox`) before suspecting the code.
- **The single file** (`dist/GelFigure.html`) inlines every script and relaxes the CSP only for inline scripts; `npm test` rebuilds it and checks it offline.
- **PPTX is not a screenshot.** Keep text/shapes native and preserve `a:srcRect` on images referencing the full processed PNG. `render.js` marks multiline labels with `data-pptx-lines` so each exports as one textbox. The SVG subset adapter rejects unknown elements; update it/tests when adding renderer primitives. See [docs/pptx.md](docs/pptx.md). Fonts are not embedded, and uncropped image pixels remain recoverable by recipients.

## Tests

- `test/test.html` — engine: TIFF decoding (incl. palette and packed data), deskew, crop, lanes, ladders, rendering, on synthetic gels.
- `index.html?demo=1&uitest=1` (`js/uitest.js`, assertions in `tests/run.mjs` `UI_CHECKS`) — interface behaviour.
- `tests/startup.mjs` — blocked storage, full quota, `file://`, single file offline.
- `tests/mobile.mjs` — emulated phones per engine, WeChat user agent, desktop downloads unchanged.
- `tests/pptx.mjs` — ZIP/XML, editable text/shapes, crop geometry, splices/insets, lossless source image, single-file offline export and phone/desktop delivery. Synthetic exports go in ignored `test-results/pptx/`. On Windows with PowerPoint installed, `powershell -File scripts/check-pptx.ps1 -Folder test-results/pptx/chromium` opens, renders, edits and re-saves them without visible presentation windows; generated files may acquire Office's local author metadata and must not be published.
- `tests/fonts.mjs` — font-dependent SVG bounds, raster glyphs/TIFF pixels, editable PPTX faces, persistence/legacy defaults and offline mobile controls. Synthetic examples live in ignored `test-results/fonts/<engine>/`; native check example: `./scripts/check-pptx.ps1 -Folder test-results/fonts/chromium -Names @('Arial','Times-New-Roman','Helvetica','Calibri','Cambria')` from PowerShell.
- `tests/unit-header.mjs` — fixed marker-unit positions, compact condition spacing, visible text bounds across fonts/sizes, crop-edge collision handling and SVG/PPTX agreement. Synthetic examples go in ignored `test-results/unit-header/<engine>/`.
- `tests/colour.mjs` — independent RGB/palette TIFF fixtures, RGB rotation, switching without altering analysis, colour PNG/TIFF/SVG/PPTX and uncropped exports, original bytes, project/style/undo/legacy behaviour, multi-exposure replacement and offline mobile delivery. Synthetic fixtures/exports live in ignored `test-results/colour/<engine>/`.
- `tests/history.mjs` — real IndexedDB: separate projects/shared bytes, reload without re-detection, legacy draft migration, rename/IME, queued writes, atomic failures, all exposures/custom ladders, phone layout and offline history. Synthetic screenshots go in ignored `test-results/history/<engine>/`.
- `tests/ladder-cache.mjs` — legacy migration, model/favourite restoration in new pages, localStorage/IndexedDB failure and fallback, aborted writes, persistent deletions, same-name models across gel types, safe backup imports, concurrent fallback writes and offline phone controls.
- `tests/workflow.mjs` — linked lane gestures/counts/undo, annotation identity, figure-side text/typography; delegates marker checks to `tests/marker-workflow.mjs` for combined detection, confirmed and excluded choices, selected-lane alignment, catalogue preview vs application, real-image anchors, persistent hide/delete controls and responsive/offline operation. Synthetic screenshots go in ignored `test-results/workflow/<engine>/` and `test-results/marker-workflow/<engine>/`. Firefox SVG `scrollIntoView` can move the wrong scroll parent; scroll the reference container and verify a real hit target before coordinate clicks.
- New behaviour gets a check. CI (`.github/workflows/ci.yml`) runs on pushes to `main` and on pull requests; for `dev`, trigger it by hand: `gh workflow run ci.yml --ref dev`.
- **Real gels are not in the repo** and must never be committed (unpublished data). The maintainer keeps them, with a small regression harness, outside the repository. If they are not available on your machine, say so when you change detection code and ask the maintainer to run them.

## Releasing

Branches: `dev` (work), `main` (= live site), `release/x.y.z` (the previous `main`, kept for rollback), tags `vX.Y.Z`.

1. `CHANGELOG.md`: move *Unreleased* into `## [X.Y.Z] - YYYY-MM-DD` with a one-line summary and a **中文摘要** list first (the release workflow publishes this section via `scripts/release-notes.mjs`); add the compare link at the bottom.
2. Bump the version everywhere it names the current release: `js/app.js` (`App.VERSION`), `package.json`, `package-lock.json` (two places), `CITATION.cff` (`version`, `date-released`), the `vX.Y.Z/GelFigure-vX.Y.Z.html` download links in both READMEs, `index.html` (start screen + help, both languages) and `docs/getting-started*.md`, and the "current version / earlier versions" paragraph in both READMEs.
3. `node scripts/release-notes.mjs vX.Y.Z` (must not throw) and `npm test` (all three engines green).
4. `git branch -f release/<current version> main`, fast-forward `main` to `dev`, annotated tag `vX.Y.Z`; push the release branch, `dev`, `main` and the tag.
5. Check: CI, Pages and Release workflows green; the release has `GelFigure-vX.Y.Z.html` and the zip; the live `js/app.js` reports the new version.

**Identity.** Commits and tags in this repository use `poplarity <145547323+poplarity@users.noreply.github.com>` (`git config user.name` / `user.email` in the clone). Check `git log -1 --format="%an <%ae>"` and `git cat-file -p vX.Y.Z` before pushing; no personal name or e-mail may appear in the history.

## Working with the maintainer

- Communicates in Chinese; write summaries in plain Chinese, lead with the result, say what was verified and what was not (e.g. "only emulated phones, no real device").
- Develop on `dev` and push there; merge to `main` and release only when asked ("合并" / "发布"). Keep the previous release as `release/x.y.z`.
- When a request conflicts with journal practice or data integrity, implement it but explain the trade-off and pick the safe default (example: overlapping labels wrap by default; auto-shrinking is an option because journals want consistent font sizes ≥ 5–6 pt).
- User reports often come as screenshots or comments relayed by the maintainer: reproduce first, then say plainly whether it is a bug or a misunderstanding, and suggest a reply to the user.
- Promotional material uses synthetic gels only.

## Open issues

- A synthetic double-DNA-ladder case (`dl5000` + `dl2000`) still detects only one marker with an incorrect model. This also fails on the prior dev revision; the other 16 private marker-regression cases and the available real DNA/protein examples are unchanged. Do not describe automatic identification as infallible; use the explicit lane/model controls to correct it.
- `render.js` `parseRuns` drops an unpaired `*` (`WT*` prints `WT`). BlotFigure (sibling project) solved it with Markdown-style flanking rules.
- "Reset everything" clears the undo history; it could be undoable instead.
- No `beforeunload` warning (only autosaved drafts protect unsaved work).
- Export wording: when the gel's own resolution is below the export dpi (e.g. "600 dpi PNG, gel itself 366 dpi"), users read it as a failed export. Proposed: say "file is 600 dpi, the gel part is 366 dpi" and offer a one-click gel width for a true 600 dpi.
- The phone layout has only been tested in emulation (Playwright iPhone / Pixel / WeChat user agent), not on real devices.
- 4-bit palette TIFFs decode correctly but carry only 16 grey levels; faint bands are lost (inherent to the file).

## Related

[BlotFigure](https://github.com/poplarity/BlotFigure) is the sibling tool for Western blots (separate repository, same conventions).
