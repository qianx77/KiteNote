import { describe, expect, it } from 'vitest'
import { markdownFromHtml, withMarkdown } from '../src/renderer/src/editor/clipboard'

describe('复制时夹带 Markdown', () => {
  it('中文与特殊字符往返', () => {
    const md = '见 [[实验/exp-001|基线]]，公式 $\\alpha$\n- [ ] 待办'
    const html = withMarkdown('<p>见 基线</p>', md)
    expect(html.startsWith('<p>见 基线</p><!--labnote-md:')).toBe(true)
    expect(markdownFromHtml(`<html><body>${html}</body></html>`)).toBe(md)
  })

  it('长文本不溢出', () => {
    const md = '实验记录'.repeat(50000)
    expect(markdownFromHtml(withMarkdown('', md))).toBe(md)
  })

  it('外部 HTML 无标记', () => {
    expect(markdownFromHtml('<p>钉钉内容</p>')).toBeNull()
  })
})
