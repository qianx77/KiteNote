import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createExtensions, PARSE_OPTIONS } from '../src/renderer/src/editor/extensions'
import { splitFrontmatter, joinFrontmatter } from '../src/renderer/src/editor/markdownIt'
import { vaultIndex } from '../src/renderer/src/vaultIndex'

vaultIndex.update([
  { path: '附件/loss.png', isDir: false, mtime: 0, size: 1 },
  { path: '实验/exp-001.md', isDir: false, mtime: 0, size: 1 }
])

function roundtrip(md: string): string {
  const editor = new Editor({ extensions: createExtensions(), content: md, parseOptions: PARSE_OPTIONS })
  const out = (editor.storage as any).markdown.getMarkdown() as string
  editor.destroy()
  return out.replace(/\n+$/, '')
}

/** 这些写法应当一字不差地往返 */
const LOSSLESS = [
  '# 标题\n\n正文段落，含 **加粗**、*斜体*、~~删除~~、`code` 和 ==高亮==。',
  '第一行\n第二行（软换行）\n第三行',
  '链接到 [[exp-001]] 和 [[实验/exp-001|别名]]，嵌入 ![[exp-001]]。',
  '![[loss.png]]\n\n![[loss.png|400]]',
  '![图](附件/loss.png)',
  '> [!note] 提示\n> 这里是 callout 内容',
  '- [ ] 待办\n- [x] 已完成',
  '- 一\n- 二\n  - 嵌套',
  '1. 第一\n2. 第二',
  '| 模型 | 准确率 | 备注 |\n| --- | :---: | ---: |\n| ViT | 81.2 | [[exp-001\\|实验]] |\n| ResNet | 76.1 |  |',
  '```python\nfor i in range(10):\n    print(i)\n```',
  '行内公式 $E=mc^2$ 与块公式：\n\n$$\n\\mathcal{L} = -\\sum_i y_i \\log \\hat{y}_i\n$$',
  '#实验 #tag/子标签 文本',
  '脚注引用[^1]\n\n[^1]: 脚注内容',
  '路径 C:\\Users\\data 和 learning_rate 以及 a * b',
  '价格 $5 和 50% ~ 60% 之间',
  '<span style="color: #d4380d">红色文字</span> 与 <u>下划线</u>',
  '<details>\n<summary>折叠</summary>\n内容\n</details>',
  '---\n\n分割线之后'
]

describe('Markdown 往返', () => {
  for (const md of LOSSLESS) {
    it(md.slice(0, 30).replace(/\n/g, '⏎'), () => {
      expect(roundtrip(md)).toBe(md)
    })
  }

  it('frontmatter 原样保留', () => {
    const src = '---\ntags: [实验]\ndate: 2026-10-26\n---\n# 标题\n'
    const { frontmatter, body } = splitFrontmatter(src)
    expect(frontmatter).toBe('---\ntags: [实验]\ndate: 2026-10-26\n---')
    expect(joinFrontmatter(frontmatter, body)).toBe(src)
  })

  it('单元格内多段（文字 + 拖入的图片）仍保存为 Markdown 表格', () => {
    const editor = new Editor({ extensions: createExtensions(), content: '| a | b |\n| --- | --- |\n| x | y |', parseOptions: PARSE_OPTIONS })
    let cellPos = -1
    editor.state.doc.descendants((n, p) => {
      if (n.type.name === 'tableCell' && n.textContent === 'x') cellPos = p
    })
    const cell = editor.state.doc.nodeAt(cellPos)!
    editor.commands.insertContentAt(cellPos + cell.nodeSize - 1, { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'vault://file/x', embed: 'loss.png' } }] })
    const md = (editor.storage as any).markdown.getMarkdown().trim()
    expect(md).toBe('| a | b |\n| --- | --- |\n| x<br>![[loss.png]] | y |')
    expect(roundtrip(md)).toBe(md)
    editor.destroy()
  })

  it('HTML 表格中的图片能解析为本地地址并原样保存', () => {
    const md = '<table><tbody><tr><td><p><img src="附件/loss.png" alt="a"></p></td></tr></tbody></table>'
    const editor = new Editor({ extensions: createExtensions(), content: md, parseOptions: PARSE_OPTIONS })
    let img: any = null
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'image') img = n.attrs
    })
    expect(img).toMatchObject({ src: 'vault://file/%E9%99%84%E4%BB%B6/loss.png', mdSrc: '附件/loss.png' })
    editor.destroy()
  })

  it('图片嵌入解析为本地图片地址', () => {
    const editor = new Editor({ extensions: createExtensions(), content: '![[loss.png|300]]' })
    const img = editor.getJSON().content![0].content![0]
    expect(img.type).toBe('image')
    expect(img.attrs).toMatchObject({ src: 'vault://file/%E9%99%84%E4%BB%B6/loss.png', embed: 'loss.png', width: '300' })
    editor.destroy()
  })
})
