<div align="center">

# GelFigure

**Turn a raw agarose gel image into a publication-ready figure — in your browser, offline.**

[**Open the app**](https://poplarity.github.io/GelFigure/) · [Download](https://github.com/poplarity/GelFigure/releases/latest) · [中文说明](README.zh-CN.md)

[![CI](https://github.com/poplarity/GelFigure/actions/workflows/ci.yml/badge.svg)](https://github.com/poplarity/GelFigure/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![No install](https://img.shields.io/badge/install-none-brightgreen)
![Images stay local](https://img.shields.io/badge/images-never%20uploaded-brightgreen)

<img src="docs/screenshot-en.png" alt="GelFigure: raw gel on the left, finished figure on the right" width="900">

</div>

Drop in the TIFF from your gel imager. GelFigure straightens the gel, crops it, finds the lanes, identifies the DNA ladder and labels its band sizes. You type the lane names on the figure and export. Everything happens in the browser; **nothing is uploaded, nothing is installed**.

<p align="center"><img src="docs/example-figure.png" alt="Example output" width="560"></p>

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Privacy](#privacy)
- [Supported input](#supported-input)
- [What is detected automatically](#what-is-detected-automatically)
- [Exports](#exports)
- [Image integrity](#image-integrity)
- [Built-in ladders](#built-in-ladders)
- [Browser support](#browser-support)
- [Known limitations](#known-limitations)
- [Development](#development)
- [Contributing](#contributing) · [Citing](#citing) · [License](#license)

## Features

- **Fully automatic first draft**: straightening (±15°), crop, lane detection, ladder identification and size labels, linear contrast.
- **DNA and protein gels**: the gel type is recognised on import (colour, band width, band count, migration curve) and the matching mode opens — ladder library, tolerances and units (bp / kDa). A switch at the top of the Image panel overrides the guess without losing names, groups or arrows.
- **Edit on the figure itself**: click a lane name and type, Enter jumps to the next lane; drag across lane names to draw a group line; click cells to cycle `+` / `−`. IME-safe for Chinese, Japanese and Korean input.
- **Lanes numbered by well**: cropping only selects which wells are shown, so names, markers and groups are never lost when you change the crop.
- **Target-band arrows with sizes**: click a band; the arrow snaps to it and its size is estimated from the marker(s). Sizes outside the ladder, or where two markers disagree by more than 10 %, are marked `≈`.
- **Several exposures at once**: drop all exposures of one gel; the best one (least saturation, best signal-to-noise) is chosen, and you can switch with all annotations kept.
- **Rotation keeps annotations in place**: lanes, bands, arrows and the crop box rotate with the image.
- **Lane removal with splice marks**: select a lane and press `H`; a splice gap is added and recorded. Empty lanes are suggested for removal (never removed silently).
- **Pre-flight check before export**: camera saturation, contrast clipping, effective resolution below 300 dpi, tiny fonts, extrapolated sizes, with one-click fixes.
- **Reproducible**: project files (`.gelfig`) contain the original image and every setting; reusable style templates; an autosaved draft survives a page reload.
- **Bilingual interface**: English and Chinese, switchable at any time. Figures are always in English.

## Quick start

**Online:** open **https://poplarity.github.io/GelFigure/**. The page is static; your images still never leave the computer.

**Offline:** download the latest release (or *Code → Download ZIP*), unzip it and double-click `index.html`. No server, no installation, no internet connection needed.

Then:

1. **Drop the gel image** into the window. Everything is detected automatically.
2. **Click the grey lane numbers** on the figure and type the names (Enter = next lane). Or paste a whole row from Excel into the panel on the left.
3. **Check the marker ladder** on the left; a poor fit is flagged.
4. **Export PNG** (top right).

The hint bar at the top always shows the most useful next step. Press `?` in the app for help.

## Privacy

GelFigure is a static web page with no backend. Images are decoded and processed by JavaScript in your browser, and results are saved by your browser's own download mechanism.

The page carries a [Content Security Policy](index.html) that **forbids it from connecting to any server**, so this is enforced by the browser, not just promised. The only data kept on your computer are preferences, custom ladders and the autosaved draft in the browser's local storage.

## Supported input

| Format | Notes |
|---|---|
| TIFF (8 / 16 / 32-bit grayscale) | Recommended. Uncompressed, LZW, Deflate and PackBits; little- and big-endian. Works with the TIFFs gel imagers and flatbed scanners export. |
| PNG / JPG / BMP | Read as 8-bit by the browser; a warning suggests using the raw 16-bit TIFF instead. |
| `.gelfig` | GelFigure project file. |

Both "white bands on black" and inverted images are handled; polarity is detected automatically.

## What is detected automatically

| Step | How |
|---|---|
| Straightening | Searches ±15° for the angle that makes wells and bands horizontal. Larger angles can be set by hand (±45°), with a reference grid. Perspective (keystone) distortion is not corrected. |
| Crop | The gel slab is found from the well row and the band region; the default crop includes the wells. |
| Lanes | Combines band signal, the gel slab edges and the shape of the wells (template matching), so edges are not mistaken for lanes and empty wells are still found. If detection is wrong, re-detect inside the red box only, or space a given number of lanes evenly. |
| Gel type | DNA or protein, from the image itself: blue-dominant colour (Coomassie) and broad bands point to protein, thin bands and many evenly spaced ladder bands to DNA, and the curvature of the migration curve votes too. The reasons are shown under the switch. Protein bands are detected with wider smoothing and tolerances; prestained markers are accepted from 4 bands up. |
| Marker lanes | Lanes with many sharp bands. Several markers on one gel share one migration curve and are matched jointly against the built-in ladders of the gel type (favourites are preferred). |
| Band sizes | Robust fit (RANSAC + polynomial) with order-preserving assignment; dragging one band re-fits the others around it. |

## Exports

| Export | Content |
|---|---|
| PNG | Rendered at the chosen dpi (300 / 600 / 1200). Includes `pHYs` (resolution), `sRGB` and an embedded processing summary (`iTXt`, UTF-8). |
| TIFF | 8-bit grayscale, LZW, with resolution tags and the processing summary. For journals that accept only TIFF. |
| SVG | Vector text and lines; edit in Illustrator or Inkscape. |
| Uncropped image | Same rotation and contrast as the figure, with the crop box, well numbers and removed lanes marked. For the supplementary information. |
| Original data | The untouched source file, byte-identical, with its SHA-256 in the file name. |
| Processing log (JSON) | Source SHA-256, rotation, linear levels, saturation and clipping statistics, effective resolution, removed lanes and why, ladder fit scores, how each arrow size was estimated. |

The **Layout** section shows the **effective resolution** of the gel itself (gel pixels ÷ printed width). If it is below 300 dpi, GelFigure tells you the largest width that keeps 300 dpi and offers to apply it. Total figure width can be set directly to a journal column (85 / 120 / 180 mm).

## Image integrity

GelFigure follows common journal image policies (e.g. Nature, PLOS, JBC; see Rossner & Yamada, *J Cell Biol* 2004, "What's in a picture?"):

- Only **linear, whole-image** adjustments. Gamma is locked at 1 unless explicitly unlocked, and is then reported in the legend notes.
- **Camera saturation** (the raw data is already clipped, so you need to re-image) is reported separately from **contrast clipping** (caused by the display settings and fixable).
- Removed lanes get a visible **splice gap or line**, and suggested legend text is generated. Never splice lanes from different gels into one panel.
- Every export carries a processing summary; the uncropped image and the original file can be exported for the supplement.

GelFigure helps you comply, but **you remain responsible** for following your journal's policy.

## Built-in ladders

Thermo Scientific GeneRuler: 1 kb, 1 kb Plus, 100 bp, 100 bp Plus, 50 bp, DNA Ladder Mix, Low Range, Ultra Low Range, Express · NEB: 1 kb, 100 bp, 1 kb Plus · Takara: DL2000, DL5000, DL15000 · TransGen: Trans2K, Trans2K Plus, Trans2K Plus II, Trans5K, Trans15K · Tiangen: Marker D2000 · Yeasen: GoldBand 1 kb, GoldBand 100 bp Plus.

[`docs/ladders.md`](docs/ladders.md) lists each one with its catalogue number, band count and reference bands — and the few whose band sizes are identical, which no algorithm can tell apart (mark the one you use as a favourite).

**Protein ladders** (kDa, apparent molecular weights of the prestained bands): Thermo PageRuler 10–180 (26616) and PageRuler Plus 10–250 (26619) · Bio-Rad Precision Plus Dual Color (161-0374) · Yeasen GoldBand Plus 3-color 10–180 (26616ES) and 3-color 10–250. Prestained sizes are calibrated in a Tris-glycine system and shift with gel percentage and buffer, so a size read from one is an estimate; the pre-flight check reminds you to write "apparent molecular weight" in the legend.

Any other ladder can be added under **Marker → Custom ladder**; custom ladders travel inside style and project files. To add a ladder for everyone, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Browser support

Current Chrome, Edge, Firefox and Safari 16.4+ on Windows, macOS and Linux. The test suite runs in Chromium, Firefox and WebKit on every change.

When `index.html` is opened directly from disk, some browsers disable IndexedDB for local files; everything works except the autosaved draft. Use the online version or "Save project" if you need it.

## Known limitations

- Automatic detection has been validated on DNA agarose gels, Coomassie-stained SDS-PAGE gels and synthetic gels. On a crowded protein gel whose lanes touch, lane detection can merge neighbours — set the lane count under **Lanes in figure** and the rest follows. If detection fails on your images, please [open an issue](https://github.com/poplarity/GelFigure/issues/new/choose).
- Western blots, protein ladders and densitometry are not supported yet.
- Bio-Rad `.scn` / `.1sc` and other proprietary formats must be exported to TIFF first. BigTIFF and palette TIFFs are not supported.
- 16-bit PNGs are read as 8-bit by browsers.

## Development

No build step and no dependencies: the app is plain HTML, CSS and JavaScript loaded with ordinary `<script>` tags, so it also runs from `file://`.

```
index.html          the page
css/style.css       styles
js/i18n.js          interface language (L('中文', 'English') pairs)
js/tiff.js          TIFF decoder            js/engine.js    image analysis
js/ladders.js       ladder library          js/render.js    figure layout (SVG)
js/export.js        PNG / TIFF / SVG / logs js/app.js       state, pipeline, undo, projects
js/editor.js        raw-image canvas        js/ui.js        side panel and top bar
js/figedit.js       editing on the figure   js/demo.js      synthetic test gel
js/uitest.js        interaction self-test   test/test.html  engine self-test
tests/run.mjs       runs both self-tests in Chromium, Firefox and WebKit
```

Run the tests:

```bash
npm install
npx playwright install chromium firefox webkit
npm test                      # all three engines
npm test -- --browser=chromium
```

Or open `test/test.html` (`"allOk": true`) and `index.html?demo=1&uitest=1` in a browser.

## Contributing

Bug reports, gel images that break detection (only if you are allowed to share them), new ladders, translations and code are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Citing

If GelFigure helped with a publication, please cite it; see [CITATION.cff](CITATION.cff) or use GitHub's "Cite this repository" button.

## License

[MIT](LICENSE)
