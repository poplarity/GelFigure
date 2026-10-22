# Editable PowerPoint export / 可编辑 PPTX 导出

Available since **v0.6.7**, online and in the single-file offline HTML.

**v0.6.7 起可用**，网页版和单文件离线版都支持。

**dev 字体选择预览：**「版式 → 成图字体」可选 Arial、新罗马、Helvetica、Calibri、Cambria，PPTX 文本及主题会记录所选字体名称。系统未提供该字体时，浏览器和 PowerPoint 可能各自使用替代字体；不嵌入字体文件。

**Font selection on dev:** Layout → Figure font selects Arial, Times New Roman, Helvetica, Calibri or Cambria. PPTX text and its theme reference the chosen face. A missing font may be substituted differently by the browser and PowerPoint; no font files are embedded.

## 中文

电脑点 **导出 ▾ → PowerPoint（可编辑 .pptx）**；手机点底部 **导出 → PowerPoint**，生成后下载文件或使用系统分享保存到“文件”。微信内如果无法下载，请在系统浏览器打开。

打开 PPTX 就是当前成图：裁切范围、排版、文字和标注都保留。胶图不会作为未裁切的整张图片铺在幻灯片上。

- **改文字**：用 PowerPoint 的文字工具编辑泳道名、Marker 大小、条件行、分组或其他标签。字号、斜体、旋转角度保留，多行分组在同一个文本框中。
- **改图形**：横线、Marker 刻度、箭头、区域框、括号都是原生图形，可移动、改变大小和样式；箭头尖和括号可用“编辑顶点”。
- **调整裁切**：选中胶图 → **图片格式 → 裁剪**，拖边界或在裁剪模式下拖动图片。完成后只显示新的选定区域。拼接后的各片段、局部放大图分别可裁切。
- **移动整张成图**：全选对象后组合，方便复制到自己的幻灯片或继续拼版。需要修改某项时再取消组合。

**文件内部保留什么：** 为了让裁切可调整，PPTX 内部保存一份未裁切、但已经按 GelFigure 中的旋转、色阶和反色参数处理过的 PNG。它不是原始 TIFF；收件人可以通过调整裁切看到被隐藏的区域。导出不会上传图像，也不会把原始文件的 EXIF、文件路径或本机用户名带入 PPTX。

**边界：** 在 PPT 中调整裁切后，Marker 和文字不会自动重新对齐。字体名称和样式会保留，但字体文件不嵌入；另一台电脑缺少相应字体时可能替换。PPTX 的图片像素来自当前处理图像，选择 600/1200 dpi 不会增加它的原始细节；文字和图形保持矢量。页面按成图实际物理尺寸生成，短边小于 25.4 mm 时补白到 PowerPoint 的最小页面尺寸。

## English

On desktop choose **Export ▾ → PowerPoint (editable .pptx)**. On a phone use **Export → PowerPoint**, then download or share/save the file. If an in-app browser blocks downloads, open GelFigure in the system browser.

The slide opens as the finished figure with the current crop and layout. Lane names, markers, conditions, groups and annotations are native editable text boxes and shapes. Multiline groups remain a single text box; font sizes, italic runs and label angles are retained. Lines and rectangles are standard shapes; arrowheads and brackets are editable freeforms.

Select a picture and choose **Picture Format → Crop** to move its crop boundaries or pan the image within them. Spliced segments and enlarged insets are separate editable pictures. Select all and group to move or copy the whole figure together.

To support recropping, the PPTX embeds **one uncropped PNG with the current rotation, levels and inversion already applied**. It is not the raw TIFF. All picture objects reference that one image; recipients can reveal the hidden areas. Export stays offline, with no source EXIF, local paths or OS author identity added by GelFigure.

Changing the crop in PowerPoint does not reposition annotations automatically. Font names/styles are preserved, but font files are not embedded; another computer may substitute fonts. The gel keeps its processed source pixels; the raster-export DPI selector does not upsample the PPTX image. Text and shapes are vector objects. Slide dimensions match the figure, with blank padding if a dimension falls below PowerPoint's 1-inch minimum.

## Implementation and validation

- `js/pptx.js` maps only the SVG elements produced by `Render.build`: text/tspans, line, rect, M/L/Z paths, translated/rotated groups and cropped inset images. It does not convert arbitrary SVGs. Unknown elements fail rather than becoming raster fallbacks.
- `data-pptx-lines` groups related SVG text lines as one DrawingML text box. This has no visual effect in SVG/PNG/TIFF exports.
- A native `a:srcRect` stores each crop as fractions of the full processed image. Splices and insets are intersected with kept segments, preserving gaps/dividers and source pixels. See [Microsoft's source-rectangle reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.sourcerectangle?view=openxml-3.0.1).
- ZIP uses STORE; PNG is already compressed. No runtime library, CDN, network access, font package or build dependency is added. The export script is also inlined in `dist/GelFigure.html`.
- `npm test` runs browser checks in Chromium, Firefox and WebKit, including offline and mobile delivery. It writes synthetic PPTX/SVG examples to ignored `test-results/pptx/<engine>/`.
- For native PowerPoint checks on Windows: `powershell -File scripts/check-pptx.ps1 -Folder test-results/pptx/chromium`. It opens synthetic test files, exports PNG previews, changes crop and text, and saves round-trip copies. Review the PNGs against the SVGs; a ZIP/schema check alone does not prove visual compatibility. **Do not publish the Office-saved round-trip files**, which may acquire the local Office author identity.
- Windows PowerPoint is the native validation target. WPS, macOS PowerPoint and Keynote require separate testing; do not claim they are pixel-identical based on browser tests.
