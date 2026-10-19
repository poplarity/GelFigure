<div align="center">

# GelFigure

**把原始琼脂糖凝胶图一键做成可投稿的成图 —— 在浏览器里完成，离线可用。**

[**在线使用**](https://poplarity.github.io/GelFigure/) · [下载](https://github.com/poplarity/GelFigure/releases/latest) · [English](README.md)

[![CI](https://github.com/poplarity/GelFigure/actions/workflows/ci.yml/badge.svg)](https://github.com/poplarity/GelFigure/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![免安装](https://img.shields.io/badge/安装-不需要-brightgreen)
![图片不上传](https://img.shields.io/badge/图片-不上传-brightgreen)

<img src="docs/screenshot-zh.png" alt="GelFigure：左边原图，右边成图" width="900">

</div>

把成像仪导出的 TIFF 拖进去，GelFigure 会自动转正、裁切、识别泳道、识别 DNA Marker 型号并标出条带大小。你只需要在成图上填泳道名，然后导出。所有处理都在浏览器里完成，**不上传、不安装**。

<p align="center"><img src="docs/example-figure.png" alt="导出示例" width="560"></p>

## 目录

- [功能](#功能)
- [快速开始](#快速开始)
- [隐私](#隐私)
- [支持的输入](#支持的输入)
- [自动识别了什么](#自动识别了什么)
- [导出](#导出)
- [图像规范](#图像规范)
- [内置 Ladder](#内置-ladder)
- [浏览器支持](#浏览器支持)
- [已知局限](#已知局限)
- [开发](#开发)
- [参与贡献](#参与贡献) · [引用](#引用) · [许可证](#许可证)

## 功能

- **全自动出初稿**：转正（±15°）、裁切、泳道识别、Ladder 型号识别与条带大小标注、线性对比度。
- **直接在成图上编辑**：点泳道名就能输入，回车跳到下一条；从一个泳道名拖到另一个画分组横线；点格子切换 `+` / `−`。中文输入法选字时的回车不会误跳。
- **泳道按加样孔编号**：裁切只是选择显示哪几孔，改裁切不会丢名称、Marker 和分组。
- **目标条带箭头自动标大小**：点一下条带，箭头吸附过去并按 Marker 估算大小。超出 Marker 范围或两个 Marker 估算相差超过 10% 时标 `≈`。
- **多张曝光一起拖入**：自动挑过曝最少、信噪比最好的一张；可随时切换，标注全部保留。
- **旋转时标注跟着转**：泳道、条带、箭头、裁切框随图一起转动，不会错位。
- **剪除泳道自动加拼接标记**：选中泳道按 `H` 即可，原因写入处理记录。空泳道会提示是否剪除，从不自动剪。
- **导出前体检**：相机过曝、色阶削顶、有效分辨率不足 300 dpi、字号过小、外推的大小等，能修的给一键修正。
- **可复现**：项目文件（`.gelfig`）包含原图和全部设置；样式模板可复用；自动保存草稿，刷新页面也不丢。
- **中英双语界面**，随时切换。成图本身始终是英文。

## 快速开始

**在线：** 打开 **https://poplarity.github.io/GelFigure/** 。这是静态网页，图片同样不会离开你的电脑。

**离线：** 下载最新版本（或 *Code → Download ZIP*），解压后双击 `index.html`。不需要服务器、不需要安装、不需要联网。

然后：

1. **把胶图拖进窗口**，全部自动识别。
2. **在成图上点灰色的泳道号**输入名称（回车跳到下一条）。也可以把 Excel 里的一整行名称粘贴到左侧。
3. **在左侧核对 Marker 型号**，吻合度低时会提示。
4. 右上角 **导出 PNG**。

顶部提示条会一直告诉你下一步做什么。软件里按 `?` 可查看帮助。

## 隐私

GelFigure 是一个没有后端的静态网页。图片由浏览器里的 JavaScript 解码和处理，结果通过浏览器自己的下载功能保存。

页面带有 [内容安全策略（CSP）](index.html)，**禁止页面连接任何服务器**——这是浏览器强制执行的，不只是承诺。只有偏好设置、自定义 Ladder 和自动保存的草稿会存在你本机浏览器的本地存储里。

## 支持的输入

| 格式 | 说明 |
|---|---|
| TIFF（8 / 16 / 32 位灰度） | 推荐。支持未压缩、LZW、Deflate、PackBits，大小端均可。已用 Thermo Fisher iBright 导出的文件测试。 |
| PNG / JPG / BMP | 浏览器按 8 位读取，会提示改用 16 位原始 TIFF。 |
| `.gelfig` | GelFigure 项目文件。 |

"黑底白带"和反色图都能处理，黑白方向自动判断。

## 自动识别了什么

| 步骤 | 方法 |
|---|---|
| 转正 | 在 ±15° 内寻找让加样孔和条带水平的角度。更大角度可手动设置（±45°），并有参考网格。不能校正透视/梯形畸变。 |
| 裁切 | 根据加样孔所在行和条带区域找到胶块，默认包含加样孔。 |
| 泳道 | 结合条带信号、胶块边缘和加样孔形状（模板匹配），不会把胶边当成泳道，空孔也能找到。识别错了可以只对红框内重新识别，或指定条数等间距排布。 |
| Marker 泳道 | 条带多且清晰的泳道。同一块胶上的多个 Marker 共用一条迁移曲线，与 21 种内置 Ladder 联合匹配（常用型号优先）。 |
| 条带大小 | 稳健拟合（RANSAC + 多项式）加保序匹配；拖动一条条带，其余会围绕它重新拟合。 |

## 导出

| 导出 | 内容 |
|---|---|
| PNG | 按所选 dpi（300 / 600 / 1200）渲染，带 `pHYs`（分辨率）、`sRGB` 和嵌入的处理摘要（`iTXt`，UTF-8）。 |
| TIFF | 8 位灰度 LZW，带分辨率标签和处理摘要，适合只收 TIFF 的期刊。 |
| SVG | 矢量文字和线条，可在 Illustrator / Inkscape 中修改。 |
| 未裁切图 | 与成图相同的旋转和对比度，标出裁切框、孔号和剪除的泳道，放补充材料。 |
| 原始数据 | 原样导出源文件（逐字节一致），文件名带 SHA-256。 |
| 处理日志（JSON） | 源文件 SHA-256、旋转、线性色阶、过曝与削顶统计、有效分辨率、剪除的泳道及原因、Ladder 吻合度、每个箭头大小的估算依据。 |

"版式"里会显示**胶图本身的有效分辨率**（凝胶像素 ÷ 印刷宽度）。低于 300 dpi 时会告诉你多宽以内才能保证 300 dpi，并可一键改宽。成图总宽可以直接设为期刊栏宽（85 / 120 / 180 mm）。

## 图像规范

GelFigure 参照常见期刊的图像要求（如 Nature、PLOS、JBC；参见 Rossner & Yamada, *J Cell Biol* 2004, "What's in a picture?"）：

- 只做**线性、全图**调整。Gamma 默认锁定为 1，解锁后会写进图注提示。
- 区分**相机过曝**（原始数据已饱和，只能重拍）和**色阶削顶**（显示设置导致，可调回）。
- 剪除的泳道有可见的**拼接间隙或分隔线**，并生成图注参考文字。不同凝胶的泳道不能拼进同一面板。
- 每次导出都带处理摘要；未裁切图和原始文件可导出放补充材料。

GelFigure 帮你合规，但**是否符合期刊要求仍由作者负责**。

## 内置 Ladder

Thermo Scientific GeneRuler：1 kb、1 kb Plus、100 bp、100 bp Plus、50 bp、DNA Ladder Mix、Low Range、Ultra Low Range、Express · NEB：1 kb、100 bp、1 kb Plus · Takara：DL2000、DL5000、DL15000 · 全式金 TransGen：Trans2K、Trans2K Plus、Trans2K Plus II、Trans5K、Trans15K · 天根 Tiangen：Marker D2000 · 翌圣 Yeasen：GoldBand 1 kb、GoldBand 100 bp Plus。

[`docs/ladders.md`](docs/ladders.md) 里列出了每个型号的货号、条带数和参考带，也写明了哪几个型号条带完全相同、无法自动区分（把你常用的那个设为常用型号即可）。

其他型号可在 **Marker → 自定义 Ladder** 中添加，自定义 Ladder 会随样式和项目文件一起保存。想把型号加进内置库供所有人使用，请看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 浏览器支持

Windows、macOS、Linux 上较新的 Chrome、Edge、Firefox，以及 Safari 16.4 及以上。每次改动都会在 Chromium、Firefox、WebKit 三个内核上自动测试。

直接双击打开本地 `index.html` 时，部分浏览器会禁用本地文件的 IndexedDB，此时除"自动保存草稿"外一切正常。需要草稿功能请用在线版，或使用"保存项目"。

## 已知局限

- 自动识别目前主要在 Thermo Fisher iBright 拍摄的 DNA 琼脂糖凝胶和合成胶图上验证过。其他成像仪应该也能用；如果在你的图上识别失败，欢迎[提交 issue](https://github.com/poplarity/GelFigure/issues/new/choose)。
- 暂不支持 Western blot、蛋白 Marker 和灰度定量。
- Bio-Rad `.scn` / `.1sc` 等专有格式需先导出为 TIFF。不支持 BigTIFF 和调色板 TIFF。
- 16 位 PNG 会被浏览器按 8 位读取。

## 开发

没有构建步骤，也没有依赖：纯 HTML、CSS、JavaScript，用普通 `<script>` 标签加载，所以也能从 `file://` 直接运行。目录结构和测试方法见 [英文 README 的 Development 部分](README.md#development)。

```bash
npm install
npx playwright install chromium firefox webkit
npm test
```

也可以直接在浏览器里打开 `test/test.html`（应显示 `"allOk": true`）和 `index.html?demo=1&uitest=1`。

## 参与贡献

欢迎提交问题、识别失败的胶图（请确认你有权公开）、新的 Ladder 型号、翻译和代码。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 引用

如果 GelFigure 对你的论文有帮助，欢迎引用，见 [CITATION.cff](CITATION.cff)，或点 GitHub 页面上的 "Cite this repository"。

## 许可证

[MIT](LICENSE)
