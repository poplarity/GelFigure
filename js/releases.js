/* Short bilingual release summaries, newest first. Keep the first version equal to App.VERSION.
 * Detailed history lives in CHANGELOG.md; this small local catalogue also works in offline HTML. */
window.GelFigureReleases = Object.freeze([
  {version:'0.6.13-dev',date:'2026-10-27',zh:[
    '文字、箭头、区域框和 Marker 支持标红，图片及可编辑 PPT 导出保留颜色。',
    '左侧“版式”与其他设置同级，图宽、换行和编号默认展开。',
    '新版首次打开提示本次更新，可随时查看历次更新日志。'
  ],en:[
    'Red text, arrows, region boxes and marker labels, preserved in image and editable PowerPoint exports.',
    'Layout is an expanded sidebar section with figure width, wrapping and numbering directly available.',
    'A one-time notice introduces each new version; release history is always available.'
  ]},
  {version:'0.6.12',date:'2026-10-26',zh:[
    '泳道名支持单独字号、角度，以及局部斜体、上标、下标。',
    '反馈与赞助有固定入口；可在工具内填写反馈，无需 GitHub 账号。',
    '修复隐藏 Marker 标签后箭头旁出现大间隙的问题。'
  ],en:[
    'Individual lane-name sizes and angles, plus selected-text italic, superscript and subscript.',
    'Permanent feedback and support entries, with an in-app feedback form requiring no GitHub account.',
    'Hidden marker labels no longer leave a large blank gap beside arrows.'
  ]},
  {version:'0.6.11',date:'2026-10-24',zh:[
    '修复较窄电脑窗口中顶部导出按钮偏移，始终靠右显示。',
    '泳道名可选自动角度，或通过预设、滑块和数字调节 0–90°。'
  ],en:[
    'Desktop export controls stay at the upper right in narrower windows.',
    'Lane-name angles support automatic layout, presets and a 0–90° slider or numeric input.'
  ]},
  {version:'0.6.10',date:'2026-10-23',zh:[
    '泳道默认等距联动，拖首尾线即可对齐；裁切框内可一起重新识别泳道和 Marker。',
    'Marker 图例与编辑面板更紧凑，可拖动移开；双击已有 Marker 泳道即可编辑。',
    '自定义 Marker 和收藏独立缓存，可备份迁移；新图默认灰度，仍可切换原色。'
  ],en:[
    'Linked lane spacing, endpoint alignment and combined lane/marker re-detection inside the crop.',
    'Compact, movable marker references and editors; double-click an existing marker lane to edit.',
    'Persistent custom-marker libraries with backup/import; grayscale imports with optional original colour.'
  ]},
  {version:'0.6.9',date:'2026-10-23',zh:[
    '新增本机历史项目，自动保存原图、标注和全部曝光。',
    '可恢复、改名或删除历史；缓存失败时提示另存项目文件。'
  ],en:[
    'Local project history automatically caches original images, annotations and all exposures.',
    'Restore, rename or delete projects; storage failures prompt a project-file backup.'
  ]},
  {version:'0.6.8',date:'2026-10-22',zh:[
    '支持保留蛋白胶和彩色 Marker 的原色，彩色图片和 PPT 同步导出。',
    '新增 Arial、新罗马等五种系统字体，无需下载字体文件。',
    'bp／kDa 单位固定在胶图侧边上沿，条件行布局更紧凑。'
  ],en:[
    'Original-colour gels and markers, retained in image and PowerPoint exports.',
    'Five system fonts including Arial and Times New Roman, with no font downloads.',
    'Compact bp/kDa headings stay beside the gel instead of moving above condition rows.'
  ]},
  {version:'0.6.7',date:'2026-10-22',zh:[
    '新增 PowerPoint 导出，文字、箭头、方框等保持可编辑。',
    '打开即呈现当前成图，并保留可在 PPT 内重新调整的图片裁切。'
  ],en:[
    'PowerPoint export keeps text, arrows and other annotations editable.',
    'Slides open as the finished figure while preserving adjustable native image crops.'
  ]},
  {version:'0.6.6',date:'2026-10-22',zh:[
    '支持调色板 TIFF，兼容索引灰度、伪彩色和染色胶扫描图。',
    '支持 1／2／4 位存储，导入时说明所做的转换。'
  ],en:[
    'Palette TIFF support covers indexed grayscale, false-colour and stained-gel scans.',
    'Packed 1/2/4-bit input is supported, with conversion notes shown on import.'
  ]},
  {version:'0.6.5',date:'2026-10-22',zh:[
    '分组文字自动换行或错层，也可选择缩小字号、保持一行。',
    '支持手动换行，每条标注可单独设字号；导出前检查实际最小字号。'
  ],en:[
    'Group labels wrap or move up a tier to avoid overlap, with shrink and single-line options.',
    'Manual line breaks, per-annotation sizes and minimum-font checks before export.'
  ]},
  {version:'0.6.4',date:'2026-10-22',zh:[
    '重做手机操作：底部切换原图、成图、设置，导出提供全部格式和分辨率。',
    '支持长按存图、系统分享和触屏编辑，并改进离线版下载指引。'
  ],en:[
    'Reworked phone navigation, with Image/Figure/Settings tabs and all export formats/resolutions.',
    'Long-press image saving, system sharing, touch editing and clearer offline-download guidance.'
  ]},
  {version:'0.6.3',date:'2026-10-21',zh:[
    '新增单文件 HTML 离线版，下载后双击即可使用。',
    '修复手机顶栏内容显示不全的问题。'
  ],en:[
    'A single HTML download runs offline by double-clicking, with no installation or extraction.',
    'Phone top-bar controls no longer overflow the screen.'
  ]},
  {version:'0.6.2',date:'2026-10-21',zh:[
    '新增手机单列布局，原图、成图和设置分为三个页签。',
    '支持触屏裁切、泳道调整和标注编辑。'
  ],en:[
    'Responsive single-column phone layout with separate Image, Figure and Settings tabs.',
    'Touch controls for cropping, lane alignment and annotations.'
  ]},
  {version:'0.6.1',date:'2026-10-20',zh:[
    '改进纯化胶、裂解液胶上的 Marker 判断，减少额外误识别。',
    '修复撤销、图注提示、处理记录和 TIFF 兼容性问题。'
  ],en:[
    'Improved marker identification on purification and lysate gels reduces false extra markers.',
    'Fixes for undo, legend hints, processing logs and TIFF compatibility.'
  ]},
  {version:'0.6.0',date:'2026-10-20',zh:[
    '新增独立蛋白胶模式，自动判断胶种并切换 bp／kDa，可手动纠正。',
    '内置 41 种蛋白 Marker，新增区域框、放大图、括号与侧边文字。',
    '改进泳道对齐、反色和 Marker 收藏、显示操作。'
  ],en:[
    'Protein-gel mode with automatic gel-type and bp/kDa selection, plus a manual override.',
    '41 protein ladders, region boxes, zoom insets, side brackets and side text.',
    'Improved lane alignment, inversion and marker favourites/visibility controls.'
  ]},
  {version:'0.5.0',date:'2026-10-19',zh:[
    '首个开源版本：DNA 胶自动转正、裁切、识别泳道和 Marker。',
    '支持直接编辑标注及图片、矢量图导出；图像全程本地处理。'
  ],en:[
    'First public release: automatic DNA-gel straightening, cropping, lanes and ladder labels.',
    'Direct annotation editing and image/vector exports, with local image processing.'
  ]}
]);
