import { describe, expect, it } from 'vitest'
import { BUILTIN_TEMPLATES, DEFAULT_SETTINGS, mergeTemplates, renderTemplate, taskTemplateVars } from '../src/renderer/src/tasks/model'

const vars = { title: '训练 ViT', date: '2026-10-27', task: '任务/每日/2026-10-27', now: new Date(2026, 9, 27, 9, 5, 0) }

describe('笔记模板', () => {
  it('内置四种模板', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toEqual(['实验记录', '问题排查', '会议纪要', '通用工作记录'])
  })

  it('替换 Obsidian 变量', () => {
    const out = renderTemplate('# {{title}}\n{{date}} {{time}} {{date:YYYY/MM/DD}} {{ time:HH时mm分 }}', vars)
    expect(out).toContain('# 训练 ViT')
    expect(out).toContain('2026-10-27 09:05 2026/10/27 09时05分')
  })

  it('标题里的 $ 等特殊字符原样保留', () => {
    expect(renderTemplate('# {{title}}', { ...vars, title: 'lr $1e-4$ & $&' })).toContain('# lr $1e-4$ & $&')
  })

  it('没写 task 属性时自动补上，已有 frontmatter 的保留其余属性', () => {
    expect(renderTemplate('# {{title}}\n', vars)).toBe('---\ntask: "[[任务/每日/2026-10-27]]"\n---\n# 训练 ViT\n')
    const out = renderTemplate('---\ntags: [x]\n---\n正文', vars)
    expect(out).toBe('---\ntask: "[[任务/每日/2026-10-27]]"\ntags: [x]\n---\n正文')
  })

  it('已写 task 属性时不重复添加', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const out = renderTemplate(t.body, vars)
      expect(out.match(/^task:/gm)).toHaveLength(1)
      expect(out).not.toMatch(/\{\{/)
    }
  })

  it('库内同名模板覆盖内置，其余追加在后', () => {
    const merged = mergeTemplates([
      { name: '周报', body: 'b', path: '模板/周报.md' },
      { name: '会议纪要', body: '我的会议模板', path: '模板/会议纪要.md' }
    ])
    expect(merged.map((t) => t.name)).toEqual(['实验记录', '问题排查', '会议纪要', '通用工作记录', '周报'])
    expect(merged[2].body).toBe('我的会议模板')
  })

  it('周任务使用周一作为日期', () => {
    const v = taskTemplateVars('x', { kind: 'week', key: '2026-W44' }, DEFAULT_SETTINGS)
    expect(v.date).toBe('2026-10-26')
    expect(v.task).toBe('任务/每周/2026-W44')
  })
})
