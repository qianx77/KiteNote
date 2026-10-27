import { describe, expect, it, beforeEach } from 'vitest'
import type { FileEntry } from '../src/shared/types'
import { moveWithLinks } from '../src/renderer/src/links'
import { vaultIndex } from '../src/renderer/src/vaultIndex'

let fs: Record<string, string>

beforeEach(() => {
  fs = {
    '实验记录/2026-10-26 跑 baseline.md': '# 实验',
    '任务/每日/2026-10-26.md': '- [ ] 跑 baseline [[实验记录/2026-10-26 跑 baseline]]\n- [ ] 其他 [[实验记录/2026-10-26 跑 baseline 2]]',
    '汇总.md': '见 [[2026-10-26 跑 baseline|这里]] 和 [[实验记录/2026-10-26 跑 baseline#结果]]'
  }
  ;(window as any).api = {
    rename: async (a: string, b: string) => {
      for (const k of Object.keys(fs)) if (k === a || k.startsWith(a + '/')) {
        fs[b + k.slice(a.length)] = fs[k]
        delete fs[k]
      }
    },
    readFile: async (p: string) => fs[p],
    writeFile: async (p: string, c: string) => void (fs[p] = c)
  }
})

const entries = (): FileEntry[] => Object.keys(fs).map((path) => ({ path, isDir: false, mtime: 0, size: 0 }))

describe('移动笔记并更新链接', () => {
  it('移到项目文件夹：路径链接更新，短链接仍可用', async () => {
    vaultIndex.update(entries())
    const n = await moveWithLinks('实验记录/2026-10-26 跑 baseline.md', '01深度修复/2026-10-26 跑 baseline.md', entries())
    expect(n).toBe(2)
    expect(fs['任务/每日/2026-10-26.md']).toBe('- [ ] 跑 baseline [[01深度修复/2026-10-26 跑 baseline]]\n- [ ] 其他 [[实验记录/2026-10-26 跑 baseline 2]]')
    expect(fs['汇总.md']).toBe('见 [[2026-10-26 跑 baseline|这里]] 和 [[01深度修复/2026-10-26 跑 baseline#结果]]')
  })

  it('重命名：短链接也更新', async () => {
    vaultIndex.update(entries())
    await moveWithLinks('实验记录/2026-10-26 跑 baseline.md', '实验记录/exp-001.md', entries())
    expect(fs['汇总.md']).toBe('见 [[exp-001|这里]] 和 [[实验记录/exp-001#结果]]')
  })
})
