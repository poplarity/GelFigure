# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

**中文摘要**
- 参考 BlotFigure 增加本机历史项目：自动缓存原图、全部标注和多张曝光，切换胶图时保留上一个项目；支持列表恢复、改名、删除和缓存状态提示。
- 旧版单份草稿自动迁移，相同原图按 SHA-256 去重；缓存失败会提示保存项目文件，取消切换可继续编辑。桌面、手机和单文件离线版共用同一套实现。

### Added
- Local project history, adapted from BlotFigure, with autosave status, rename/delete, desktop/start-screen/phone entry points, and restoration without re-detection. The cache preserves all exposures, source bytes, custom ladders, annotations, colours, fonts and reset state.
- Atomic migration of the previous single draft, content-addressed source deduplication and reference-aware deletion. Failed writes keep the previous saved copy; switching with unsaved work asks before discarding it. No runtime dependencies or network requests.

### Validation
- Browser tests cover reload/restore, migration before a new import, shared-source deletion, exposure switching, queued writes, rename/IME, storage failure, responsive layout and the offline single HTML.

## [0.6.8] - 2026-10-22

Original-colour gels, system fonts and compact marker-unit headings.

**中文摘要**
- **保留原色／灰度**：彩色胶图默认保留原色，蓝色染色胶和红绿 Marker 不再强制转为黑白。切换不重跑识别、不移动泳道或标注；原色模式不套用灰度的对比度、反色或 Gamma。PNG、彩色 TIFF、SVG、PPTX、未裁切图均保留颜色；旧项目维持原先外观。
- **五种系统字体**：Arial、新罗马（Times New Roman）、Helvetica、Calibri、Cambria。排版、换行和导出同步使用所选字体，项目和样式保存选择；不下载或内嵌字体文件，缺少字体时由系统替代。
- **Marker 单位标题更紧凑**：bp／kb／kDa 放在胶图侧边上沿稍下方，不再跟着条件行上移，也不预留整行空白。按字体边界处理大小字号和浏览器差异，左右单位保持同一基线。
- 保持零运行依赖、单文件离线使用。原色显示和导出使用 8 位 RGB，原始文件字节不变；TIFF 内嵌 ICC 配置暂不处理，检测到会提示。

### Added
- Original-colour/grayscale display choice. A separate 8-bit RGB display buffer keeps the existing high-precision grayscale detection data unchanged. RGB/palette TIFF input supports planar/endian variants and white-composited alpha; RGB TIFF values assume sRGB, with a notice for unapplied ICC profiles.
- Colour rotation, crop, splices, zoom insets, exposure thumbnails and native-crop PPTX share the same geometry. PNG, SVG, uncropped images and lossless LZW RGB TIFF retain colour. Projects, templates and undo preserve display mode; legacy projects remain grayscale. Logs distinguish active display processing from saved grayscale settings.
- Arial, Times New Roman, Helvetica, Calibri and Cambria use one shared system-font allowlist for canvas measurement, SVG, PowerPoint text/themes and imported styles. Font files are neither downloaded nor embedded; old or invalid selections fall back to Arial.

### Fixed
- Unit headings stay beside the gel rather than above the condition matrix. Font metrics and a small size-dependent gap handle Firefox font substitution and mixed 4–14 pt labels while retaining compact normal spacing.

### Validation
- Browser coverage includes colour TIFF fixtures, pixel/geometry agreement, colour exports, mode persistence, offline phone usage, five-font layout/export checks and 120 unit-heading layouts per engine. Independent Pillow/libtiff and Windows PowerPoint checks use synthetic data only.

## [0.6.7] - 2026-10-22

Editable PowerPoint figures with adjustable native image crops.

**中文摘要**
- **可编辑 PPTX 导出。** 电脑和手机导出菜单新增 PowerPoint。打开即保持成图排版；泳道名、分组、Marker、箭头、框和括号等均为可编辑文字或图形；图片保存原生裁切范围，可在 PPT 中调整。拼接和放大图使用独立可裁切片段。文件内部包含完整的已处理图像，字体未嵌入，PPT 内调整裁切不会自动移动标注。

### Added
- A dependency-free DrawingML/ZIP exporter reuses the SVG layout, keeps multiline group labels in one editable text box, embeds one full processed PNG shared by native crop objects, and works in the offline single HTML. Detection code is unchanged.
- PPTX checks inspect ZIP checksums, XML relationships, lossless full-image storage, editable objects, multiline/italic/rotated text, crop coordinates, spliced insets, desktop/phone delivery and offline exports. Optional native PowerPoint validation: `scripts/check-pptx.ps1`.

### Documentation
- `AGENTS.md` (also loaded through `CLAUDE.md`): architecture, data flow, rules, pitfalls, tests, release steps and open issues for developers and coding agents.

## [0.6.6] - 2026-10-22

Palette TIFFs load.

**中文摘要**
- **支持调色板（索引色）TIFF**：以前会提示"暂不支持调色板 TIFF"。现在灰度颜色表、反相颜色表、伪彩色颜色表（按序号还原原始信号）和彩色扫描（如考马斯亮蓝）都能读，1 / 2 / 4 位的压缩存储也支持；导入时会提示做了什么转换。

### Fixed
- **Palette (indexed) TIFFs load** instead of failing with "Palette TIFFs are not supported yet". The colour map decides the intensity: a grey map (also inverted) gives its own values; a false-colour map whose brightness rises or falls steadily with the index is read back as the index, i.e. the original signal; any other map is a colour picture (e.g. a scanned Coomassie gel) and gives its brightness plus the colour statistics used to recognise protein gels. 1-, 2- and 4-bit packed data are read too. A note on import says which conversion was used.
- TIFF load notes now reach the screen (they were dropped for TIFF files).
- Engine self-test: palette TIFFs (grey + LZW, inverted, false-colour, true-colour, 4-bit) and 1-bit data decoded pixel-exact.

## [0.6.5] - 2026-10-22

Labels that never collide: wrapping, line breaks and a font size per item.

**中文摘要**
- **分组文字不再重叠**：排布分组横线时按文字的实际宽度计算，放不下会自动错开到上一行。
- **放不下时可选处理方式**（版式 → 分组文字放不下时）：自动换行（默认，保持字号，各行长度均衡）、缩小字号（不低于设定的最小字号）、保持一行。
- **手动换行**：编辑分组文字时 Shift+Enter 换行，手机上点“↵ 换行”。
- **每个字段可单独设字号**：编辑文字时下方出现字号条（A− / A+ / 默认）；箭头、区域框、侧边括号、侧边文字在设置框里填字号；泳道名、Marker 标签可在版式里统一设置。
- 导出前检查改为看成图里实际最小的字号；样式模板会带上各项的字号和换行。

### Added
- **Group labels never overlap.** Group lines are stacked by the real width of their text, not only by the lanes they span, so a label that would run into its neighbour moves up a tier.
- **What to do with a group label wider than its line** (Layout → "Group text too wide"): wrap it to the line (default; size kept, lines balanced, Chinese breaks between characters, other text after spaces, "-" or "/", *italic* kept across lines), shrink it down to a minimum size (default 5 pt), or keep one line.
- **Typed line breaks in group labels**: Shift+Enter in the editor, or "↵ New line" in the bar below it (phones). In the annotation list a break shows as ↵.
- **Font size per item**: a bar under the text editor sets the size of a group label or a +/− row (A− / A+ / Default); arrows, region boxes, side brackets and side text have a size field in their popover; lane names and marker labels each have one size under Layout. Empty = the figure font size.
- Pre-flight checks the smallest text actually printed (per-item sizes, shrunk labels) and can raise everything to 6 pt. Style templates and the processing log carry per-item sizes and line breaks.

## [0.6.4] - 2026-10-22

The phone layout, reworked for real use; plus resilient startup and the one-file download guide.

**中文摘要**
- **手机端完整可用**：底部导航切换原图 / 成图 / 设置，右下角「导出」提供 PNG、TIFF、SVG、未裁切图、原始数据、处理日志和保存项目，可选 300 / 600 / 1200 dpi 并提示像素尺寸。顶部恢复撤销 / 重做，⋯ 里有打开、样式、说明和语言。
- **导出后长按保存**：手机上导出的 PNG 直接显示成图片，长按即可存到相册或发给朋友（微信内也可用）；支持系统分享时可存到「文件」。
- **原图手势**：双指缩放、拖动；点泳道线或泳道号选中后，底部按钮可微调（按住连续移动）、剪除、删除；双击或「＋ 泳道」加泳道。
- **成图**：泳道名输入框固定在顶部，键盘「下一项」跳到下一条；「放大」看清小字；分组横线改为依次点首尾泳道名。
- 横屏、刘海屏安全区、键盘遮挡都做了适配；桌面版不变。

### Added
- **Phone layout, reworked.** A bottom bar switches between Image, Figure and Settings, with **Export** at the bottom right; a one-line coach under the top bar names the next step; undo / redo are back on the top bar and a **⋯** sheet holds open image / project, save project, styles, help, language and reset. Landscape phones get compact bars; safe-area insets are respected.
- **Export sheet on phones** with every format (PNG, TIFF, SVG, uncropped image, original data, processing log, project), the resolution, the resulting pixel size and a warning when a phone browser could not draw the canvas.
- **Exported files on phones** open in a sheet instead of a silent download: a PNG is shown as a picture that can be long-pressed into Photos (a `data:` URL, so it also works inside WeChat, where downloads do not), plus the system share sheet where available and a plain download. Inside WeChat the sheet explains how to open the page in a browser for other formats.
- **Touch editing on the image**: pinch to zoom and pan; finger-sized hit areas; the lane number chips select (and drag) their lane; a selection bar nudges (hold to repeat), cuts / restores or deletes a lane, or edits / deletes a target-band arrow — what Delete, `H` and the arrow keys do on a computer. Double-tap or **+ Lane** adds a lane. One-tap tools act on a clean tap, so the image can still be panned and zoomed first.
- **Touch editing on the figure**: the lane-name editor is docked at the top with a **Next** key on the on-screen keyboard; popovers sit above the bottom bar and the keyboard and no longer pop the keyboard up by themselves; **Zoom in** enlarges the figure for small labels; group lines are made by tapping the first and the last lane name.
- **Phone wording** for the start screen, coach line, hints and help (no "drag here", "on the left" or keyboard shortcuts on a phone), and photo / camera input on the file picker.
- `tests/mobile.mjs`: phone checks in every engine (emulated Pixel / iPhone), a WeChat check, and a desktop check that exports still download directly.

### Documentation
- Put the single-file HTML download first in both READMEs, add illustrated English/Chinese opening guides, and explain how to save and reopen a project. The start screen, help dialog and future release notes also explain the one-file workflow. ZIP/source instructions are reserved for source users.

### Fixed
- **Startup with browser storage blocked.** Reading a language preference no longer stops the whole interface when Firefox blocks cookies/site data or disables DOM storage. Preferences, favourites and custom ladders use temporary memory if storage is unavailable or full; the interface explains that these will not survive closing the page. Editing, image export and saving/opening project files remain available.
- Added cross-browser startup checks for blocked storage, a full quota, an offline folder and the single-file HTML without network access.

## [0.6.3] - 2026-10-21

Mobile polish and a one-file offline build.

**中文摘要**
- **手机顶栏显示完整**：撤销 / 重做、导出 PNG 等按钮收进设置抽屉；顶部只留品牌、打开图片、设置和语言。
- **新增单文件离线版**：`GelFigure-v0.6.3.html` 可直接下载并双击打开，约 380 KB，不用解压。

### Added
- **Single-file offline version.** scripts/bundle-onefile.mjs inlines css/ and js/ in load order into `dist/GelFigure.html` (~380 KB). Release now attaches `GelFigure-<tag>.html` next to the zip, so users can download one file that runs by double-click.
- **Release zip and notes** mention the offline build; the workflow is compatible with future tags.

### Fixed
- **Top bar on phones** no longer overflows: undo / redo, the file menu, export resolution and the split export button are hidden on narrow screens and their functions live in the settings drawer.
- **Single-file bundle** loads cleanly from file:// after inlining tiff.js and relaxing the script-src restriction only for that bundle.
 - 2026-10-21

Mobile layout and touch support; same features as 0.6.1.

**中文摘要**
- **手机上也能用**：窄屏改为单列布局，原图 / 成图 / 设置三个页签切换，设置面板变成全屏抽屉。
- **支持手势操作**：手指可以移动泳道线、拖裁切框、画区域框，在成图上点泳道名、加 +/−。
- 桌面版界面和功能完全不变；三浏览器自测全过。

### Added
- **Responsive layout for phones (≤ 900 px).** Settings panel becomes a full-screen drawer; raw image and figure share the work area through three tabs. Loading a gel on a phone lands on the figure so you see what was detected. "Start over" and image-fit shortcuts live in the panel. The top bar keeps only essentials.
- **Touch interactions**: crop edges, lane lines, region boxes and brackets can be moved with a finger; lane-name input, +/− cells and arrow taps work on the figure. Slider thumbs and text inputs use phone-friendly sizes; iOS no longer zooms when focusing a field.
- Window uses 100dvh with `viewport-fit=cover` so the bottom of the page is not hidden behind the browser chrome.
- Tests confirm Pointer Events work identically to mouse events on desktop; the full 49-check suite still passes in Chromium, Firefox and WebKit.
 - 2026-10-20

Marker detection on purification gels, and a review of the whole interface.

**中文摘要**
- **纯化胶上不再把裂解液认成 Marker**：多道图案相同的裂解液，以前会被额外当成 Marker；同一块胶上跑两个 Marker（如 1 kb + DL2000）仍然都能认出。
- **撤销 / 重做更可靠**：撤销后再按 H 或方向键不会报错；弹窗里的"删除"只删它自己那一项。
- **导出更准确**：图注提示只写成图上真的有的内容，放大倍数按实际渲染计算，蛋白胶写 molecular-weight markers；处理日志补全标记符号、括号范围等；TIFF 兼容更严格的读取器。
- 其他界面细节：按 Esc 取消画框不会误生成括号；空格不再拦截按钮；跨过剪除泳道的区域框不再变窄。

### Fixed
- **Marker lanes on purification gels.** Several lysate lanes with the same pattern merge into about a dozen peaks, and some protein ladder fits that subset about as well as it fits the real marker lane on its own, so lysate lanes could be taken for extra markers. Marker lanes are now grown from the best lane: each further lane is matched together with the lanes already kept, their ladders held fixed, and stays only if most of its own bands and most of its ladder's bands on the gel are explained on that shared curve. A real second ladder (e.g. 1 kb + DL2000 on one gel) passes; a lysate lane does not. On a tie the outermost lane wins.
- The gel-type check after the markers are matched measured band count and width on the lane with the most bands, which on a protein gel is a lysate; it now uses the marker lane.
- Lanes cut out of the figure are never taken for markers.
- A lane named "M" by a first, discarded marker guess (before the gel type was settled) kept the name.
- After undo or redo, the selected lane or arrow could point past the end, so `H` or the arrow keys threw an error; open popovers kept editing the pre-undo state. Undo and redo now drop the selection and close open editors; so does loading an image.
- Deleting from an arrow or annotation popover removed the item at its old position, i.e. the wrong one if another had been deleted meanwhile.
- Pressing Esc while dragging a region box created a side bracket.
- Space no longer swallows key presses on buttons and other controls (it pans the image elsewhere).
- A region box starting inside a cut-out lane collapsed to a sliver; a box label at the top edge of the gel overlapped the lane names or the +/− rows.
- A style template from a protein gel left existing DNA markers labelled in kDa.
- Custom ladders accepted the same size twice.
- Opening a project or draft could show the previous image's notices.
- Legend hints described annotations outside the crop and markers on cut lanes, gave the requested rather than the rendered zoom of an enlarged box, called protein markers "DNA ladders" when there were two, could stop the export with an error when a marker's ladder no longer existed, and did not explain `≈` when two markers disagree.
- The processing log now records the arrow symbol and side, the bracket side and its size range, and whether a box is dashed; `estimatedBp` is left out on protein gels (`estimatedSize` and `sizeUnit` carry the value).
- TIFF export: the LZW end code takes the width the reader expects at a code-width boundary (as libtiff writes it), and the description field is 7-bit ASCII with `\u` escapes instead of `?` for γ, ≈ or Chinese file names.
- Unlabelled buttons (export menu, help close, delete in the annotation list) have accessible names; the popover is announced as a dialog.

### Added
- A synthetic purification gel (`Demo.makeProteinGel({ purification: true })`) and interface checks for it, for undo with a selection, popover delete, and boxes over cut lanes (49 checks in total).

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
- A synthetic protein gel, including a crowded lysate gel (`?demo=protein`), and 16 new interface checks (45 in total, run in Chromium, Firefox and WebKit).

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

[Unreleased]: https://github.com/poplarity/GelFigure/compare/v0.6.8...HEAD
[0.6.8]: https://github.com/poplarity/GelFigure/compare/v0.6.7...v0.6.8
[0.6.7]: https://github.com/poplarity/GelFigure/compare/v0.6.6...v0.6.7
[0.6.6]: https://github.com/poplarity/GelFigure/compare/v0.6.5...v0.6.6
[0.6.5]: https://github.com/poplarity/GelFigure/compare/v0.6.4...v0.6.5
[0.6.4]: https://github.com/poplarity/GelFigure/compare/v0.6.3...v0.6.4
[0.6.3]: https://github.com/poplarity/GelFigure/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/poplarity/GelFigure/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/poplarity/GelFigure/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/poplarity/GelFigure/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/poplarity/GelFigure/releases/tag/v0.5.0
