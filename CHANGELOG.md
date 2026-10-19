# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- **Protein gel mode.** The gel type is now part of the state (`dna` / `protein`) and drives the ladder library, the matching tolerances, band detection and the size unit.
- Automatic gel-type detection on import: colour statistics (Coomassie blue), band width relative to the lane pitch, ladder band count and the curvature of the migration curve each cast an explainable vote; the reasons are shown under the switch.
- A DNA / protein switch at the top of the Image panel overrides a wrong guess: lane names, groups, conditions and arrows are kept, markers are re-labelled in the new unit, and a toast on import says which type was recognised and how sure it is.
- Five protein ladders (apparent kDa): Thermo PageRuler 10–180 (26616) and PageRuler Plus 10–250 (26619), Bio-Rad Precision Plus Dual Color (161-0374), Yeasen GoldBand Plus 3-color 10–180 (26616ES) and 3-color 10–250.
- Protein-specific tuning: broader band smoothing, wider assignment tolerance and window, more size skipping, markers accepted from 4 bands, and `(kDa)` column header, `55 kDa` labels and kDa arrow estimates.
- Pre-flight note in protein mode that prestained sizes are apparent molecular weights.
- Gel type and detection confidence are written to the processing log (JSON) and to style templates.
- Synthetic protein gel (`G.Demo.makeProteinGel`, `?demo=protein`) and four new interface checks.
- Two Yeasen (翌圣生物) ladders: GoldBand 1 kb (10510ES) and GoldBand 100 bp Plus (10516ES).
- `docs/ladders.md`: every built-in ladder with its catalogue number, band count, range and reference bands, plus the groups of ladders whose band sizes are identical and therefore cannot be told apart automatically.

### Fixed
- A loaded outer lane could be mistaken for the gel edge during lattice detection, which trimmed the marker lane from the lane list.
- Colour statistics were discarded for PNG/JPG input, so colour-based classification only worked for TIFF.

## [0.5.0] - 2026-10-19

First public release.

### Added
- Automatic straightening (±15°), crop, lane detection, ladder identification and band-size labels for DNA agarose gels.
- Editing directly on the figure: lane names (IME-safe), group lines by dragging, `+`/`−` condition rows, target-band arrows with estimated sizes (`≈` when extrapolated or when markers disagree).
- 21 built-in ladders (Thermo GeneRuler, NEB, Takara, TransGen, Tiangen), custom ladders and favourites.
- Several exposures of one gel can be loaded together; the best is chosen and switching keeps annotations.
- Rotation keeps lanes, bands, arrows and the crop box aligned with the gel; reference grid.
- Lane removal with splice gaps or lines (`H` key), empty-lane suggestions, marker-lane confirmation.
- Pre-flight check before export: camera saturation vs. contrast clipping, effective resolution, font size, extrapolated sizes.
- Exports: PNG with resolution, sRGB and embedded processing summary; LZW TIFF; SVG; uncropped image with the same processing; original file with SHA-256; JSON processing log.
- Project files (`.gelfig`), style templates (carrying custom ladders), autosaved drafts, per-section and full resets.
- English and Chinese interface.
- Content Security Policy that blocks all network access.
- Engine and interaction self-tests, run in Chromium, Firefox and WebKit.

[Unreleased]: https://github.com/poplarity/GelFigure/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/poplarity/GelFigure/releases/tag/v0.5.0
