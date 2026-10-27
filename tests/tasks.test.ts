import { describe, expect, it } from 'vitest'
import { addWeeks, isoWeek, parseTaskFile, serializeTaskFile, weekDays, weekMonday } from '../src/renderer/src/tasks/model'

describe('任务文件', () => {
  it('解析与序列化往返不丢内容', () => {
    const src = [
      '---',
      'labnote: daily',
      'date: 2026-10-26',
      '---',
      '# 2026-10-26 周一',
      '',
      '- [ ] 训练 ViT baseline ⏫ [[实验记录/2026-10-26 训练 ViT baseline]]',
      '\t- [x] 准备数据',
      '\t- [ ] 调学习率',
      '- [x] 写周报 ✅ 2026-10-26',
      '  备注：在 Obsidian 里手写的一行',
      ''
    ].join('\n')
    const f = parseTaskFile(src)
    expect(f.tasks).toHaveLength(2)
    expect(f.tasks[0]).toMatchObject({ title: '训练 ViT baseline', important: true, link: '实验记录/2026-10-26 训练 ViT baseline' })
    expect(f.tasks[0].steps).toEqual([
      { done: true, text: '准备数据' },
      { done: false, text: '调学习率' }
    ])
    expect(f.tasks[1]).toMatchObject({ done: true, doneDate: '2026-10-26' })
    expect(serializeTaskFile(f)).toBe(src)
  })

  it('备注往返', () => {
    const src = '- [x] 消融实验 ✅ 2026-10-26\n\t- [ ] 子步骤\n\t> 【不做】方案已废弃\n\t> 改用 rf-detr\n'
    const f = parseTaskFile(src)
    expect(f.tasks[0].note).toBe('【不做】方案已废弃\n改用 rf-detr')
    expect(f.tasks[0].extra).toEqual([])
    expect(serializeTaskFile(f)).toBe(src)
  })

  it('保留 CRLF 换行', () => {
    const src = '# t\r\n\r\n- [ ] a\r\n'
    expect(serializeTaskFile(parseTaskFile(src))).toBe(src)
  })
})

describe('ISO 周', () => {
  it('计算正确', () => {
    expect(isoWeek('2026-10-26')).toBe('2026-W44')
    expect(isoWeek('2026-01-01')).toBe('2026-W01')
    expect(isoWeek('2027-01-01')).toBe('2026-W53')
    expect(isoWeek('2024-12-30')).toBe('2025-W01')
    expect(weekMonday('2026-W44')).toBe('2026-10-26')
    expect(weekDays('2025-W01')[0]).toBe('2024-12-30')
    expect(addWeeks('2026-W53', 1)).toBe('2027-W01')
  })
})
