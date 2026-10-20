# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-10-20

Protein gels, annotations from real figures, and much sturdier lane and marker detection.

**中文摘要**
- **蛋白胶模式**：导入时自动判断 DNA 胶还是蛋白胶，自动切到对应的 Ladder 库、匹配容差和单位（bp / kDa）；判断错了可一键切换，泳道名和标注都保留。
- **41 种蛋白 Marker**：Bio-Rad、Thermo/Invitrogen、NEB、Abcam、GenScript、翌圣、雅酶、碧云天、全式金、索莱宝、生工，每一种都对照厂家资料核对过。
- **新标注**：区域框（可在成图旁放大展示）、侧边括号（拖尾、(Ub)n）、侧边文字（染色、抗体、曝光时间）、非特异条带 `*` / `#` 标记。
- **泳道**：首尾两条泳道拖到位、填泳道数，中间自动等间距；Mac 上 `⌫` 可删除选中泳道；挤在一起的蛋白胶泳道识别更准。
- **Marker 识别**：按"Ladder 能否完整解释这条泳道"判断，不再把裂解液泳道误认成 Marker。
- **界面**：单个"反色"勾选框；出图范围、拼接设置、常用型号重新设计；勾选框对齐；导入速度约快一倍。

### Added
- **Protein gel mode.** The gel type (`dna` / `protein`) drives the ladder library, matching tolerances, band detection and the size unit: `(kDa)` header, kDa labels and kDa arrow estimates. Protein bands use broader smoothing, a wider assignment window and tolerance, and prestained markers are accepted from 4 bands.
- **Automatic gel-type detection** from explainable votes — Coomassie colour, band width against the lane spacing, ladder band count, how many lanes are full of bands, and the curvature of the matched marker's migration curve. The reasons are shown under a DNA / protein switch at the top of the Image panel; switching keeps lane names, groups, conditions and arrows. A notice on import says which type was recognised and how sure it is.
- **41 protein ladders** (apparent kDa, Tris-glycine values unless the name says otherwise), each checked against the vendor's own product page or manual: Bio-Rad Precision Plus (Dual Color, All Blue, Kaleidoscope, Unstained, Dual Xtra), Thermo / Invitrogen (PageRuler Prestained, Plus, Unstained, Unstained Low Range; Spectra Multicolor Broad / High / Low Range; Novex Sharp; SeeBlue Plus2), NEB, Abcam, GenScript, Yeasen, Epizyme, Beyotime, TransGen, Solarbio and Sangon. Bio-Rad Precision Plus Dual Color is the default.
- Two Yeasen DNA ladders: GoldBand 1 kb (10510ES) and GoldBand 100 bp Plus (10516ES).
- `docs/ladders.md`: every built-in ladder with catalogue number, bands, range, reference bands and sources, and the groups of products with identical size lists, which no algorithm can tell apart.
- **Annotations** that gel figures in papers carry:
  - **Region box** — drag a rectangle to frame bands, dashed or solid, with a label; optionally shown enlarged ×2–×4 beside the figure from the same raster.
  - **Side bracket** — over a size range: a smear, an (Ub)n ladder, oligomers, IgG chains.
  - **Side text** — the stain, antibody or exposure, vertical beside the gel or below it.
  - **Band marks** — `*` (non-specific), `#` or `†` instead of an arrowhead.
  - The legend hints explain `*` and the enlarged region; boxes and brackets rotate with the gel; brackets and side text travel in style templates; everything is in the processing log.
- **Equal spacing between the end lanes**: drag the leftmost and rightmost lane lines onto their lanes, enter the lane count and click "Align"; the lanes in between are spaced evenly (lanes from one comb have constant spacing).
- Pre-flight note on protein gels that prestained sizes are apparent molecular weights.
- Gel type and detection confidence in the processing log and in style templates.
- A synthetic protein gel, including a crowded lysate gel (`?demo=protein`), and 17 new interface checks (47 in total, run in Chromium, Firefox and WebKit).

### Changed
- **Marker lanes** are the lanes a ladder explains completely, not the lanes with the most bands: a whole-cell lysate lane has more bands than any ladder, and some ladder always fits a subset of them. Neighbouring hits collapse into one.
- **Lane detection** recognises when neighbouring lanes run together and the measured spacing comes out a whole multiple of the real one; the top of the gel, where samples have not spread yet, corrects it, with a notice.
- Gel-type detection takes its curvature vote from the marker bands actually matched instead of ranking every ladder of both libraries, so import is about twice as fast.
- **Polarity** is one **Invert** checkbox instead of two buttons that assumed the image was always white-bands-on-black; the panel states what the figure looks like now.
- **Lanes in figure**: "Lane lines wrong?" offers two labelled methods — A, equal spacing between the end lanes; B, detect again inside the box. The splice settings appear only once a lane is cut, with a sentence on why journals require the mark.
- `Delete` / `⌫` deletes the selected lane on the image (`⌫` is the delete key on a Mac) and a lane picked by its number in the lane list. Typing never deletes a lane.
- **Favourite ladders** are a tick list grouped by vendor ("Ladders we use"); the half-lit star gave no way to see which ones were chosen. The marker menu is grouped by vendor too, the lab's own ladders first.
- A marker's band list stays open while bands are ticked.
- Wording no longer names one vendor's imager; the start screen mentions both DNA and protein gels.

### Fixed
- Removing a wrongly detected marker and then re-spacing the lanes brought the marker back.
- The splice line was drawn white unless the image was inverted, so it was invisible on dark-bands-on-white figures.
- The `(kDa)` unit header was clipped: its width was measured as `(bp)`.
- The `*` band mark was swallowed by the `*italic*` markup.
- Side-panel checkboxes were not aligned with their labels (`.field > label` overrode the switch layout).
- The favourite-ladder list showed DNA ladders on a protein gel until something was clicked.
- A loaded outer lane could be taken for the gel edge and trimmed from the lane list.
- A band width wider than the lane spacing (merged bands) could vote in gel-type detection.
- Colour statistics were dropped for PNG / JPG input.

### Upgrading
Projects and drafts from 0.5 open unchanged and are treated as DNA gels unless their marker is a protein ladder. Version 0.5 stays available as tag `v0.5.0` and branch `release/0.5`.

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

[Unreleased]: https://github.com/poplarity/GelFigure/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/poplarity/GelFigure/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/poplarity/GelFigure/releases/tag/v0.5.0
