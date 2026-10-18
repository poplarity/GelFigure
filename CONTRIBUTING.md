# Contributing to GelFigure

Thank you for helping! Issues and pull requests in English or Chinese are both welcome. 中文或英文提交均可。

## Reporting a problem

Please use the [issue templates](https://github.com/poplarity/GelFigure/issues/new/choose). The most useful reports include:

- browser and operating system, and whether you used the online version or a local `index.html`;
- the imager and file type (e.g. "iBright, 16-bit TIFF");
- what you expected and what happened; a screenshot helps a lot;
- the **processing log** (*Export ▾ → Processing log (JSON)*). It contains settings and statistics but no pixel data. Remove lane names first if they are confidential.

**Gel images.** An image on which detection fails is the best possible bug report, but only attach one if you are allowed to share it publicly. Unpublished data, patient-derived material or anything under a confidentiality agreement should not be posted. A cropped or downscaled copy is often enough.

## Adding a DNA ladder

Built-in ladders live in [`js/ladders.js`](js/ladders.js):

```js
{ id: 'neb1kb', name: 'NEB 1 kb DNA Ladder (N3232)', sizes: [10000, 8000, /* … */ 500], ref: [3000] },
```

- `id`: short, unique, lowercase.
- `name`: `Vendor Product name (catalogue number)`.
- `sizes`: every **visible** band in bp, largest to smallest.
- `ref`: the brighter reference bands, if the datasheet marks any.

In the pull request, please link the manufacturer's datasheet that the sizes come from. A wrong size produces a wrong figure, so ladders without a source cannot be merged.

## Development

There is no build step. Edit the files and reload `index.html`.

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
