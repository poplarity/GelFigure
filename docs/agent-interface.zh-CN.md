# GelFigure Agent 接口

[English](agent-interface.md)

该接口从本地 DNA/蛋白胶图或 `.gelfig` 项目生成科研配图。CLI 与 MCP 共用 `AgentService`，普通网页仍可独立使用。图像处理在本地固定版本的 Chromium headless shell 中执行，不依赖系统 Chrome、桌面点击自动化、任意脚本执行或上传胶图。宿主 AI 服务及经授权使用的实验记录连接器有各自的联网行为。

## 开发版安装

需要 Node.js 22 或更新版本。在仓库根目录运行：

```sh
npm ci --prefix agent
node agent/bin/gelfigure.mjs setup
node agent/bin/gelfigure.mjs doctor --workspace /absolute/existing/workspace
```

安装依赖和 `setup` 需要联网。Setup 使用当前 Node 可执行文件直接启动已安装的 Playwright CLI，参数为 `install --only-shell chromium`，不经过 shell。安装日志写入 stderr，最终结果为 JSON。分析、准备和导出使用已安装的运行时离线执行。该包是私有开发包，安装不包含向 npm 发布。

无需下载即可运行传输层测试：

```sh
node --test agent/test/transport.test.mjs
```

Doctor 测试在已安装 Chromium 时实际启动它，否则跳过；测试不会自动下载浏览器。测试还使用官方 MCP SDK 验证内存连接与真实 stdio 子进程。

## 便携包与 skill

便携包包含 Node、固定版本依赖、匹配的 Chromium headless shell、网页引擎及可移植 skill。请选择匹配操作系统和 CPU 的包。macOS/Linux 使用 `./gelfigure`，Windows 使用 `gelfigure.cmd`。入口会在导入 Playwright 前识别 `<bundle-root>/runtime/browsers`，因此宿主也可以用包内 Node 直接运行 `agent/bin/gelfigure.mjs`。

便携包的构建与验证由独立流程完成。跨系统支持仍以对应包实际通过验证为准；当前接口文档不宣称已有签名、公证的安装器。Linux 可能需要额外浏览器系统库。请核对具体包的平台、架构元数据和测试结果，不要把某个平台的验证外推到全部系统。

将开发仓库中的整个 `skills/gelfigure`，或便携包中的 `skill/`，复制到宿主 skill 目录下，并命名为 `gelfigure`。例如 Codex 个人 skill 的入口为 `~/.codex/skills/gelfigure/SKILL.md`；按宿主的常规方式重新发现或加载。保留同目录的 `references/` 与 `agents/`。该 skill 开启自动发现，不依赖私有连接器或其他 skill，可使用 MCP 或已配置的 CLI。安装 skill 不会自动安装运行时或写入 MCP 配置。

以下操作不会修改宿主配置。请按宿主支持的格式手动添加 MCP。采用 `mcpServers` JSON 的客户端可使用开发版配置：

```json
{
  "mcpServers": {
    "gelfigure": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/GelFigure/agent/bin/gelfigure.mjs",
        "mcp",
        "--workspace",
        "/absolute/existing/workspace"
      ]
    }
  }
}
```

便携包应把 `command` 换成包内 `runtime/node`（Windows 为 `runtime/node.exe`），入口路径也指向便携包。参数逐项填写，不要把 shell 引号写入参数值。其他配置格式使用等效的 command/args 设置。MCP 启动失败写入 stderr，stdout 专用于协议消息。

## CLI

下文的 `gelfigure` 代表已配置的开发版命令或便携包启动器。除帮助、版本及 setup 外，必须提供指向已存在目录的绝对 `--workspace`。所有输入、spec 和输出路径（包括符号链接目标）都必须位于工作区内。JSON 输入上限为 4 MiB，spec 另有嵌套和条目限制。每次输出使用新目录，不覆盖历史运行。

```text
gelfigure --help
gelfigure --version
gelfigure setup
gelfigure doctor --workspace /data/gel-job
gelfigure ladders --workspace /data/gel-job --kind dna --query "GeneRuler 1 kb"
gelfigure analyze --workspace /data/gel-job --input gel.tif --out analysis
gelfigure prepare --workspace /data/gel-job --analysis analysis/analysis.json --spec request.json --out prepared
gelfigure revise --workspace /data/gel-job --plan prepared/plan.json --spec answers.json --out reviewed
gelfigure validate --workspace /data/gel-job --plan reviewed/plan.json
gelfigure render --workspace /data/gel-job --plan reviewed/plan.json --out final
gelfigure mcp --workspace /data/gel-job
```

仅当该 plan 为 `ready_to_render` 且没有待答问题时运行 render。Prepare/revise 不会自动导出最终图。`--spec` 是 JSON 文件路径，不是内联 JSON；CLI 通过工作区 JSON 辅助函数读取，再把解析后的对象传给服务。未知命令/选项、重复选项、当前命令不使用的选项及缺少必填选项均明确报错。

| 退出码 | JSON status | 宿主后续处理 |
| --- | --- | --- |
| 0 | `succeeded`、`ready_to_render` | 检查结果；只有就绪 plan 才能导出 |
| 2 | `awaiting_answers`、`needs_review` | 仍需解析 JSON，收集答案或审核后 revise |
| 1 | `failed` | 查看 `error.code`、`message` 及可选 `details` |

普通命令向 stdout 写入一条紧凑 JSON。帮助与版本输出可读文本；setup 日志写 stderr，最终输出 JSON。MCP 的 stdout 仅包含协议消息，工具 JSON 放在协议结果中，启动错误写 stderr。服务错误不包含堆栈，例如：

```json
{"apiVersion":"1","status":"failed","error":{"code":"STALE_REVISION","message":"The expected revision does not match the current project."}}
```

## 修正裁切与泳道几何

Analyze 可选 `--gel-type dna|protein` 与 `--orientation h|r90|r180|r270|r90h|r180h|r270h`；未指定方向时先保留原方向，再执行正常处理。几何参数使用**完成方向变换和 deskew 后**的图像绝对像素坐标。例如将以下内容保存为 `crop.json`：

```json
{"x":10,"y":20,"w":400,"h":300,"space":"oriented-image-px"}
```

将递增的绝对泳道 x 坐标（例如 `[30,80,130]`）保存为 `lane-positions.json`：

```sh
gelfigure analyze --workspace /data/gel-job --input gel.tif --out corrected-analysis --crop crop.json --lane-positions lane-positions.json
```

若只确认了数量，可改用 `--lane-count 3`。数量必须为 1–60 的整数，与 `--lane-positions` 互斥。Crop 和 positions 都通过与 spec 相同的工作区边界和大小限制读取。数字字符串、非有限数、错误字段会被拒绝，实际图像/裁切边界由服务检查。这些坐标不是相对裁切框的坐标，也不是方向变换前的原始像素。系统不会隐式清理泳道。

修正会产生新的 analysis revision。重新检查诊断图，结合实验记录，按新分析中的实际 ID 重建标签和 Marker 绑定。旧 `expectedRevision` 会失败；单纯替换哈希不能证明泳道对应关系正确。

## MCP 工具

使用官方低层 SDK Server。每个会话只有一个串行化服务与一个可复用浏览器，每次操作使用隔离的浏览器上下文。只暴露七个工具，参数对象拒绝未知字段。产物路径通过文本与 `structuredContent` 返回；受限预览资源可用于观察图像，不开放任意文件系统读取接口。

| 工具 | 必填参数 | 可选参数 |
| --- | --- | --- |
| `gelfigure_doctor` | 无 | 无 |
| `gelfigure_ladders` | 无 | `query`、`kind`（`dna`/`protein`） |
| `gelfigure_analyze` | `input`、`out` | `gelType`、`orientation`、`crop`、`laneCount` 或 `lanePositions` |
| `gelfigure_prepare` | `analysis`、`spec` 对象、`out` | 无 |
| `gelfigure_render` | `plan`、`out` | 无 |
| `gelfigure_revise` | `plan`、`spec` 补丁对象、`out` | 无 |
| `gelfigure_validate` | `plan` | 无 |

MCP 的几何参数直接传对象/数组，不传 CLI 的 JSON 文件名。工具结果同时包含紧凑 JSON 文本与相同的 `structuredContent` 对象。只有失败才设置 `isError: true`；待答问题和质量审核为 `isError: false`。宿主仍须检查 status 并等待答案，不能把协议调用成功当作已经允许导出。

### 观察预览图

本 MCP 会话中的服务调用若在 `diagnostic` 或 `preview` 字段返回可读 PNG，工具结果会额外提供 `resource_link`。`resources/list` 仅列出这些已登记预览；`resources/read` 接收返回的、不透明的 `gelfigure://preview/...` URI，返回 `image/png` 的 base64 blob。原路径与 `structuredContent` 不变。源图、项目文件、任意产物路径和以前会话的文件都不会自动登记。

每个 PNG 的文件字节上限为 4 MiB。登记前和每次读取时，都通过带工作区边界检查的读取器校验大小与 PNG 签名，并要求内容与登记时一致。文件改变、丢失、超限或越出工作区时拒绝读取。未登记 URI、`file://` URI、其他会话的预览 URI 均被拒绝。每个会话最多登记 128 个不同预览文件。预览不可用或超限时，工具仍保留普通服务结果和本地路径，只是不附加资源链接。

实际观察需要宿主能够读取 MCP 资源，**并把 PNG 展示给 Agent**，或使用本地文件查看器打开返回路径。不同宿主支持程度不同。只有路径、元数据或未经显示的 base64，不能算作视觉检查。如果两者都不可用，应请用户确认所需的图像、方向和泳道信息，再记录为已确认。不要宣称所有 MCP 客户端都支持看图，也不要把 base64 粘贴到对话中。

## 证据、默认值与版本绑定

先读取用户提供或授权的实验记录，再填写身份信息。收集当前全部关键问题，用宿主询问工具或普通对话一次提出并等待。关键内容包括 DNA/蛋白类型、方向/泳道顺序、可见泳道标签或明确允许留空、Marker 策略与支持型号，以及记录冲突的解决。找不到 Marker 型号时，应询问支持的有据型号或明确省略，不反复重试同一查询，不替换成相似型号。

开发仓库中可查看便携 skill 的[请求规范](../skills/gelfigure/references/request-schema.md)、[审核与修复](../skills/gelfigure/references/review-and-repair.md)、[示例](../skills/gelfigure/references/examples.md)；便携包中的对应文件位于 `skill/references/`。

格式默认值为 Arial 7 pt、自动标签角度、不显示泳道编号、保留已有宽度、灰度显示、gamma 1、保留反色设置（新 Agent 图像从不反色开始）、600 dpi PNG/SVG。`figureWidthMm` 是包含边距的总图宽。任何默认值都不补全生物学语义。

Doctor 通过本地 `FontFace` 加载探测报告 `fonts[].available`，不使用可能因字体回退而返回成功的 CSS 检查。字体不会嵌入导出文件。请求的字体不可用时，系统产生可确认的 `FONT_SUBSTITUTION` 警告，因为替代字体可能改变排版。应选择可用的受支持字体，或解释后果并获得用户接受；只有此后才能把 `FONT_SUBSTITUTION` 加入 spec 的 `acknowledgements` 并 revise。该数组整体替换时，要保留其他已明确接受的代码。`FONT_ENVIRONMENT` 仅为信息，不能代替对字体替换的确认。

DNA 单位支持 `bp`、`kb`、`auto`、内联 bp/kb 及 `none`；蛋白支持 `kDa`、`kDa-inline`、`none`。`auto` 格式化为 DNA 的 bp/kb。侧文字只支持 left/right/below。接口不支持局部条带修饰、伪造条带、编造样本名或未记录的局部图像编辑。

`provenance` 记录字段、来源（`user`/`record`/`detector`/`default`）、真实证据引用及布尔确认状态。检测分数既不能外部确认样本/型号身份，也不是经过校准的概率。未解决冲突始终产生问题。技术警告只有在明确允许确认且用户已接受其后果时，才可加入 `acknowledgements`；不能静默确认或用它消除语义问题。

`spec.expectedRevision` 在创建时绑定 analysis 或上一版 plan。保存后的 plan 保留该历史输入值；`plan.revision` 单独绑定准备后的项目。Render 另行复核 digest、当前源图/项目 revision、引擎版本、语义与质量。不要编辑哈希或 status 绕过检查。Revise 会生成新的受检查 plan：数组整体替换，`layout`、`image`、`exports` 浅合并。

Revision 是对包含 `{sourceSha256, state, ladders}` 的规范 JSON 计算 SHA-256：分别对应原始源图校验和、完整项目状态，以及项目保存的梯子定义（包含自定义梯子，取 `project.ladders`，缺省为空数组）。项目外层的保存时间戳不参与计算，有意义的 state 字段保留。即使图像和泳道几何不变，修改自定义梯子定义也会改变 revision。

验证未就绪 plan 时，返回待答问题，不应用其 spec。省略 Marker 会禁用继承箭头的大小显示标志并清空其大小文字。隐藏或裁切范围外的校准信息保留在可编辑项目中，但不参与大小估算或导出。替换泳道标签时，会清除原有可见泳道名称，保留隐藏泳道名称。

分析保存 `analysis.json`、`project.gelfig`、`diagnostic.png`；准备保存 `plan.json`、`project.gelfig`、`resolved-spec.json`、`quality-report.json`。最终导出保留可编辑项目与报告，并提供处理日志、图例及 manifest。文件留在磁盘上，向用户报告路径、限制及已接受的警告。

Agent 校准选择需要工具包内的编辑器或 0.6.17-dev 及更新版本。重开项目请使用包内 index.html 或匹配的离线 HTML；旧正式版不识别新的校准开关。CI 附件内采用 tar.gz 保存执行权限，请先解开该归档再运行启动器。

API v1 的泳道名保留原样星号。其他文字仍使用旧文本渲染器；新分组、条件或标注文字包含星号时，会明确返回待确认问题，避免静默改变标签。

过曝比例按当前裁切范围计算，证据中同时返回过曝像素数、区域总像素数及阈值。扩大裁切可能使比例低于警告阈值，但仍会报告残留的过曝像素；不能把警告级别降低解释为原图已修复。
