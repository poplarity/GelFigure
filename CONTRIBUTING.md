# Contributing to GelFigure

Thank you for helping! Issues and pull requests in English or Chinese are both welcome. 中文或英文提交均可。

## Reporting a problem

Please use the [issue templates](https://github.com/poplarity/GelFigure/issues/new/choose). The most useful reports include:

- browser and operating system, and whether you used the online version, the single-file `GelFigure-vVERSION.html`, or `index.html` from a ZIP (and whether the ZIP was fully extracted);
- the gel type (DNA or protein), the imager or scanner, and the file type (e.g. "gel imager, 16-bit TIFF");
- what you expected and what happened; a screenshot helps a lot;
- the **processing log** (*Export ▾ → Processing log (JSON)*). It contains settings and statistics but no pixel data. Remove lane names first if they are confidential.

**Gel images.** An image on which detection fails is the best possible bug report, but only attach one if you are allowed to share it publicly. Unpublished data, patient-derived material or anything under a confidentiality agreement should not be posted. A cropped or downscaled copy is often enough.

## Adding a ladder

Built-in ladders live in [`js/ladders.js`](js/ladders.js):

```js
// DNA ladders go in the DNA array, protein ladders in the PROTEIN array below it
{ id: 'neb1kb', name: 'NEB 1 kb DNA Ladder (N3232)', sizes: [10000, 8000, /* … */ 500], ref: [3000] },
{ id: 'biorad_dual', name: 'Bio-Rad Precision Plus Dual Color (161-0374)', sizes: [250, 150, /* … */ 10], ref: [75, 25] },
```

- `id`: short, unique, lowercase.
- `name`: `Vendor Product name (catalogue number)`.
- `sizes`: every **visible** band, largest to smallest — bp for DNA ladders, kDa for protein ladders (the apparent molecular weights the manufacturer prints for the prestained bands).
- `ref`: the brighter or coloured reference bands, if the datasheet marks any.

Also add a row to [`docs/ladders.md`](docs/ladders.md) with the catalogue number and a link to the manufacturer's datasheet the sizes come from. A wrong size produces a wrong figure, so ladders without a source cannot be merged.

If the band sizes turn out to be identical to a ladder that is already there, say so in the pull request: both can still be listed (the reference bands and the name in the legend differ), but detection will not be able to tell them apart, so they belong in the "cannot be told apart" section of `docs/ladders.md`.

## Development

There is no build step. Edit the files and reload `index.html`. [AGENTS.md](AGENTS.md) describes the architecture, the release process and known pitfalls in more depth.

- **Keep it dependency-free** and loadable from `file://`: plain `<script>` tags, no ES modules, no CDN, no network requests (the Content Security Policy in `index.html` blocks them anyway).
- **Every interface string is bilingual.** In JavaScript, write `L('中文', 'English')`; in HTML, put the English text in `data-en` (or `data-en-html`, `data-en-title`, `data-en-placeholder`). Text that goes into figures, legends, logs and exported files stays in English.
- **Image-processing changes must stay honest:** only linear whole-image adjustments by default, nothing removed silently, and anything that changes how the data looks is recorded in the processing log.
- Match the existing style: small functions, comments that explain *why*.

### Tests

```bash
npm install
npx playwright install chromium firefox webkit
npm test                        # engine + interaction self-tests in all three engines
npm test -- --browser=firefox   # a single engine
```

`test/test.html` checks the TIFF decoder, deskew, crop, lane and ladder detection and rendering on synthetic gels. `index.html?demo=1&uitest=1` drives the interface: editing, IME handling, rotation, lane removal, templates, exports, project files, exposures and drafts. Please add a check to `js/uitest.js` (and an assertion to `tests/run.mjs`) for new behaviour.

## Pull requests

1. Fork and create a branch.
2. Make the change, with tests where it makes sense.
3. Run `npm test`.
4. Describe what changed and why; add a line to [CHANGELOG.md](CHANGELOG.md) under *Unreleased*.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
