import { _electron as electron } from 'playwright-core'
import { promises as fs } from 'fs'
import path from 'path'
const PROJECT = process.cwd()
const S = process.argv[2] ?? (await import('os')).tmpdir() + '/kitenote-demo'
const V = path.join(S, 'demo-vault')
const UD = path.join(S, 'ud-demo')
const OUT = path.join(PROJECT, 'docs/images')
await fs.rm(V, { recursive: true, force: true })
await fs.rm(UD, { recursive: true, force: true })
for (const d of ['.obsidian', '任务/每日', '任务/每周', '实验记录', '项目/ViT 蒸馏', '项目/检测模型', '附件']) await fs.mkdir(path.join(V, d), { recursive: true })
await fs.mkdir(UD, { recursive: true })
await fs.writeFile(path.join(V, '.obsidian/app.json'), JSON.stringify({ attachmentFolderPath: '附件' }))
await fs.writeFile(path.join(UD, 'config.json'), JSON.stringify({ vaultPath: V, recentVaults: [V] }))
const w = (p, s) => fs.writeFile(path.join(V, p), s)

await w('任务/每日/2026-10-27.md', `- [x] 复现 baseline：ViT-B/16 在子集上 top-1 ✅ 2026-10-27
- [ ] 蒸馏实验 exp-012：温度 T=4 vs T=8 ⏫ [[项目/ViT 蒸馏/2026-10-27 蒸馏温度对比]]
\t- [x] 准备 teacher logits 缓存
\t- [x] 跑 T=4
\t- [ ] 跑 T=8
\t- [ ] 画 loss 曲线
- [ ] 检测模型推理耗时分析 [[项目/检测模型/推理耗时分析]]
- [ ] 读论文：DeiT III
\t> 周四组会前读完，重点看 3-Augment
- [x] 【不做】重跑 exp-009 ✅ 2026-10-27
\t> 数据集版本已废弃，结论被 exp-011 覆盖
`)
await w('任务/每日/2026-10-26.md', `- [x] 整理上周实验结论 ✅ 2026-10-26
- [x] 搭建蒸馏训练脚本 ✅ 2026-10-26
`)
await w('任务/每周/2026-W44.md', `- [ ] 完成蒸馏温度消融并写结论 ⏫
- [ ] 检测模型 TensorRT 部署验证
- [x] 周报 ✅ 2026-10-26
`)
await w('项目/ViT 蒸馏/2026-10-27 蒸馏温度对比.md', `---
task: "[[任务/每日/2026-10-27]]"
tags: [实验, 蒸馏]
---
# 蒸馏温度对比 exp-012

> [!note] 目标
> 验证蒸馏温度 T 对学生模型 ViT-S 精度的影响，teacher 为 [[ViT-B 基线]]

## 方法

损失函数：

$$
\\mathcal{L} = \\alpha \\, \\mathcal{L}_{ce}(y, p_s) + (1-\\alpha) \\, T^2 \\, \\mathrm{KL}(p_t^{T} \\,\\|\\, p_s^{T})
$$

## 配置

| 参数 | T=4 | T=8 |
| --- | :---: | :---: |
| lr | 5e-4 | 5e-4 |
| α | 0.5 | 0.5 |
| epochs | 100 | 100 |
| top-1 | ==81.3== | 80.7 |

## 过程记录

- [x] 准备 teacher logits 缓存（节省 40% 训练时间）
- [x] 跑 T=4
- [ ] 跑 T=8

![[loss-curve.png|560]]

## 结论与下一步

T=4 略优于 T=8，下一步试 **T=2** 和 α=0.7。#todo
`)
await w('项目/ViT 蒸馏/ViT-B 基线.md', `# ViT-B 基线\n\ntop-1 83.1\n`)
await w('项目/检测模型/推理耗时分析.md', `# 推理耗时分析\n\n## 前处理\n\n## 模型\n\n## 后处理\n`)
await w('实验记录/2026-10-24 数据增强消融.md', `# 数据增强消融\n`)
await w('欢迎.md', `# 欢迎使用 KiteNote\n`)

const app = await electron.launch({ executablePath: path.join(PROJECT, 'node_modules/electron/dist/electron.exe'), args: [PROJECT], env: { ...process.env, KITENOTE_USER_DATA: UD } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: 1440, height: 900 })
// 生成一张 loss 曲线图作为附件
const dataUrl = await win.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1120; c.height = 520
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = '#e5e7eb'; g.lineWidth = 1
  for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(70, 40 + i * 80); g.lineTo(1080, 40 + i * 80); g.stroke() }
  g.fillStyle = '#6b7280'; g.font = '22px sans-serif'; g.fillText('loss', 14, 36); g.fillText('epoch', 1010, 505)
  const curve = (col, k, n) => { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= 100; x++) { const y = 2.4 * Math.exp(-x / k) + 0.35 + n * Math.sin(x * 1.7) * Math.exp(-x / 60); const px = 70 + x * 10.1, py = 440 - (y / 2.8) * 400; x ? g.lineTo(px, py) : g.moveTo(px, py) } g.stroke() }
  curve('#3370ff', 18, 0.05); curve('#f59e0b', 24, 0.08)
  g.font = '24px sans-serif'; g.fillStyle = '#3370ff'; g.fillText('T=4', 960, 80); g.fillStyle = '#f59e0b'; g.fillText('T=8', 960, 115)
  return c.toDataURL('image/png')
})
await fs.writeFile(path.join(V, '附件/loss-curve.png'), Buffer.from(dataUrl.split(',')[1], 'base64'))
await win.reload()
await win.waitForTimeout(2000)
const shot = (n) => win.screenshot({ path: path.join(OUT, n) })

// 1 我的一天
await win.click('text=我的一天')
await win.waitForTimeout(800)
const row = await win.$('.task-row:has-text("蒸馏实验")')
if (row) await row.click()
await win.waitForTimeout(500)
await shot('today.png')
// 2 本周
await win.click('text=本周计划')
await win.waitForTimeout(800)
await shot('week.png')
// 3 笔记
await win.click('text=我的一天'); await win.waitForTimeout(600)
await win.click('.meta-link:has-text("蒸馏温度对比")')
await win.waitForSelector('.outline'); await win.waitForTimeout(1500)
await win.mouse.move(1300, 300)
await shot('note.png')
// 4 表格手柄
const cell = await win.$('.ProseMirror td:has-text("5e-4")')
await cell.scrollIntoViewIfNeeded()
const b = await cell.boundingBox()
await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
await win.waitForTimeout(400)
await shot('table.png')
// 5 原图查看
const img = await win.$('.ProseMirror img[src^="vault"]')
await img.scrollIntoViewIfNeeded()
const ib = await img.boundingBox()
await win.mouse.dblclick(ib.x + 40, ib.y + 40)
await win.waitForTimeout(700)
await shot('viewer.png')
await win.keyboard.press('Escape')
// 6 斜杠菜单
await win.click('.ProseMirror h1')
await win.keyboard.press('End'); await win.keyboard.press('Enter'); await win.keyboard.type('/')
await win.waitForTimeout(500)
await win.evaluate(() => document.querySelector('.editor-scroll').scrollTo(0, 0))
await shot('slash.png')
console.log('errors', errors)
await app.close()
