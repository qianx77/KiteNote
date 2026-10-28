import { describe, expect, it } from 'vitest'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Editor } from '@tiptap/core'
import type { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { isWholeTableSelected, markdownFromHtml, selectionToCopy, withMarkdown } from '../src/renderer/src/editor/clipboard'
import { createExtensions, PARSE_OPTIONS } from '../src/renderer/src/editor/extensions'

describe('复制时夹带 Markdown', () => {
  it('中文与特殊字符往返', () => {
    const md = '见 [[实验/exp-001|基线]]，公式 $\\alpha$\n- [ ] 待办'
    const html = withMarkdown('<p>见 基线</p>', md)
    expect(html.startsWith('<p>见 基线</p><!--kitenote-md:')).toBe(true)
    expect(markdownFromHtml(`<html><body>${html}</body></html>`)).toBe(md)
  })

  it('长文本不溢出', () => {
    const md = '实验记录'.repeat(50000)
    expect(markdownFromHtml(withMarkdown('', md))).toBe(md)
  })

  it('兼容改名前（LabNote）复制的内容', () => {
    const b64 = withMarkdown('', '- [ ] 旧版待办').split('kitenote-md:')[1]
    expect(markdownFromHtml(`<p>x</p><!--labnote-md:${b64}`)).toBe('- [ ] 旧版待办')
  })

  it('外部 HTML 无标记', () => {
    expect(markdownFromHtml('<p>钉钉内容</p>')).toBeNull()
  })
})

describe('表格选区复制', () => {
  const md = '| 参数 | A | B |\n| --- | --- | --- |\n| lr | 1e-4 | 3e-4 |\n| bs | 32 | 64 |'
  const setup = () => new Editor({ extensions: createExtensions(), content: md, parseOptions: PARSE_OPTIONS })
  /** 第 r 行第 c 列单元格的位置 */
  const cellPos = (ed: Editor, r: number, c: number): number => {
    const map = TableMap.get(ed.state.doc.firstChild!)
    return 1 + map.map[r * map.width + c]
  }
  const serialize = (ed: Editor, f: Fragment): string => (ed.storage as any).markdown.serializer.serialize(f).trim()

  it('只选中一个格子：复制格内内容', () => {
    const ed = setup()
    const p = cellPos(ed, 1, 1)
    ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, p)))
    const c = selectionToCopy(ed.state)
    expect(serialize(ed, c.markdown)).toBe('1e-4')
    ed.destroy()
  })

  it('格内文字选区带出外层表格时也只复制文字', () => {
    const ed = setup()
    const p = cellPos(ed, 1, 1)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, p + 2, p + 6)))
    expect(serialize(ed, selectionToCopy(ed.state).markdown)).toBe('1e-4')
    ed.destroy()
  })

  it('跨行跨列：复制为表格，首行作表头', () => {
    const ed = setup()
    ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, cellPos(ed, 1, 1), cellPos(ed, 2, 2))))
    const c = selectionToCopy(ed.state)
    expect(c.fragment.firstChild!.type.name).toBe('table')
    expect(serialize(ed, c.markdown)).toBe('| 1e-4 | 3e-4 |\n| --- | --- |\n| 32 | 64 |')
    expect(isWholeTableSelected(ed.state)).toBe(false)
    ed.destroy()
  })

  it('整表选中', () => {
    const ed = setup()
    ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, cellPos(ed, 0, 0), cellPos(ed, 2, 2))))
    expect(isWholeTableSelected(ed.state)).toBe(true)
    expect(serialize(ed, selectionToCopy(ed.state).markdown)).toBe(md)
    ed.destroy()
  })
})
