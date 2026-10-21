// The first link in every release leads to the complete HTML, not a source ZIP.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag || '')) throw new Error('Expected a version tag, e.g. v0.6.3');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
const section = changelog.split(/^## /m).find(s => s.startsWith(`[${tag.slice(1)}]`));
if (!section) throw new Error(`Missing changelog entry for ${tag}`);
const changes = section.slice(section.indexOf('\n') + 1).trim();
const file = `GelFigure-${tag}.html`;
const url = `https://github.com/poplarity/GelFigure/releases/download/${tag}/${file}`;
const intro = `## Start here / 从这里开始

**[Download ${file} / 下载单文件 HTML](${url})**

1. Save this HTML file to your computer. / 保存到电脑。
2. Double-click to open it in Firefox, Chrome, Edge or Safari. / 双击，用浏览器打开。
3. Choose your gel image, check the labels and export. / 导入胶图，核对标注后导出。

No installation, ZIP extraction or GitHub account is needed. This one file is the complete offline tool. Use **Save project** to keep your work before closing.

不用安装、不用解压、不用注册 GitHub。一个 HTML 文件就是完整的离线工具。关闭前请用 **保存项目** 保留进度。

The ZIP and GitHub's “Source code” downloads are optional source distributions. Most users only need the HTML above.

ZIP 和 “Source code” 是可选的源码下载，普通使用只需要上面的 HTML 文件。

## Changes / 更新内容

`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/release-notes.md'), intro + changes + '\n');
