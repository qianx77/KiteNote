# LabNote

**把每天的任务和工作记录连起来：To Do 式的日/周任务，每个任务一键生成一篇所见即所得、兼容 Obsidian 的 Markdown 记录。**

适合：算法实验记录、开发/排查日志、项目推进、会议纪要、周报——任何「做了什么、怎么做的、结果如何」需要留痕的工作。

[English](README.en.md) · [下载](../../releases) · 数据全是本地 `.md` 文件，可直接用 Obsidian 打开

![LabNote 笔记页](docs/images/note.png)

## 为什么做这个

我是做算法的，一直在两个工具之间来回切：To Do 记今天要做什么，Obsidian 记每件事怎么做的、结果怎样（对我来说主要是实验）。痛点是：

- 任务和记录是割裂的，周末回头看「这周到底做了什么、结论是什么」要翻半天；
- Obsidian 要记 Markdown 语法，表格尤其难写；
- 笔记里的图和表复制到钉钉文档就丢了，写周报/汇报要重新贴一遍。

LabNote 把这三件事放进一个窗口，并且**不发明新格式**——任务和笔记都是普通 Markdown，继续兼容你的 Obsidian 库和同步方式。

## 功能

| | |
| --- | --- |
| **日 / 周任务** | 「我的一天」「本周计划」「未完成汇总」，重要 ⭐、步骤、备注、移到明天、带入昨天未完成、一键复制周报 |
| **任务 → 工作记录** | 任务上点一下生成带「目标 / 方法 / 过程 / 结果 / 结论」模板的笔记，并双链关联；笔记顶部可跳回任务 |
| **所见即所得** | 钉钉风格工具栏 + `/` 菜单：标题、颜色、高亮、表格、Callout、代码块、LaTeX 公式、`[[双链]]`，不用记语法；随时切源码模式 |
| **表格** | 鼠标悬停出现行/列手柄，就地插入、删除、对齐；拖动列宽；单元格内可放图片 |
| **图片** | 截图直接粘贴自动存为附件；双击查看原图（缩放、拖动）；**复制到钉钉 / 飞书 / Word 图片不丢**（内嵌 base64） |
| **目录** | 右侧显示当前笔记标题目录，点击跳转、滚动高亮 |
| **Obsidian 兼容** | 直接打开现有库原地使用，或整库导入（逐字节复制 + SHA1 校验）；`[[双链]]`、`![[嵌入]]`、Callout、`==高亮==`、公式、Obsidian Tasks 的 ⏫ / ✅ 都能读写；移动/重命名自动更新全库链接 |
| **多设备同步** | 库就是普通文件夹：百度网盘同步空间 / 坚果云 / OneDrive / Syncthing / Git 都行；手机端用 Obsidian App 打开同一个库 |

| 我的一天 | 本周计划 |
| --- | --- |
| ![我的一天](docs/images/today.png) | ![本周计划](docs/images/week.png) |

| 表格手柄 | 原图查看 |
| --- | --- |
| ![表格](docs/images/table.png) | ![原图查看](docs/images/viewer.png) |

## 数据格式

```
库/
├─ 任务/每日/2026-10-27.md    - [ ] 蒸馏实验 exp-012 ⏫ [[项目/ViT 蒸馏/2026-10-27 蒸馏温度对比]]
├─ 任务/每周/2026-W44.md      ⏫ 重要，✅ 日期 = 完成日（兼容 Obsidian Tasks 插件）
├─ 项目/… 实验记录/…          普通 Markdown 笔记
├─ 附件/                      图片，遵循 .obsidian/app.json 的附件目录
└─ .labnote/settings.json     任务/笔记文件夹设置
```

不用 LabNote 了？什么都不用迁移，用 Obsidian 或任何编辑器打开同一个文件夹即可。

## 关于「无损」

- 只打开不编辑，文件不会被改写；外部（同步盘 / Obsidian）修改会自动重新加载。
- 可视化编辑后保存，内容不丢，但部分**渲染效果相同的写法会被规范化**（如多余的 `\_` 转义、`|a|b|` → `| a | b |`、列表缩进统一为 2 空格）。出现这种情况时笔记顶部会提示「保存时会规范化格式」，需要保留原样请用源码模式编辑。
- 表格拖动调整过列宽或合并过单元格后，会以 HTML 表格保存（Obsidian 能显示，但不能再按 Markdown 表格编辑）；右键「恢复平均列宽」即恢复为 Markdown 表格。

## 安装

目前提供 Windows 安装版与便携版（单文件免安装），见 Releases。未做代码签名，首次运行 SmartScreen 可能提示，选「仍要运行」。macOS / Linux 暂未打包测试。

## 开发

技术栈：Electron + React + TypeScript + TipTap（ProseMirror）+ markdown-it。

```bash
npm install          # 国内网络建议先设置 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dev          # 开发模式
npm test             # 单元测试（任务格式、Markdown 无损往返、Obsidian 导入、链接、剪贴板）
npm run dist         # 打包 Windows 安装版 / 便携版到 release/
node scripts/demo-shots.mjs   # 用虚构的演示库重新生成 docs/images 截图（需先 npm run build）
```

本机打包时，若 electron-builder 默认缓存目录跨盘移动失败，先把缓存指到项目内（PowerShell）：

```powershell
$env:ELECTRON_BUILDER_CACHE="$PWD\.cache\electron-builder"; $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"; npm run dist
```

## 同步建议

百度网盘同步空间可用，但冲突处理较弱：避免两台设备同时编辑同一篇笔记（任务按天分文件，冲突概率很低）。需要更可靠的冲突处理，推荐坚果云（WebDAV，Obsidian 手机端可配合 Remotely Save 插件）或 Syncthing（局域网 P2P，免费）。

## License

MIT
