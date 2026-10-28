// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { Vault } from '../src/main/vault'

describe('保存前检测外部修改', () => {
  it('同步盘改过的文件不被覆盖，本机内容另存为冲突副本', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kitenote-'))
    const v = new Vault(tmp)
    await v.write('笔记/日志.md', '原文\n')

    // 未被外部修改：正常写入
    expect(await v.writeChecked('笔记/日志.md', 'A 的改动\n', '原文\n', 'PC-A')).toBeNull()
    expect(await v.read('笔记/日志.md')).toBe('A 的改动\n')

    // 另一台电脑（B）的版本被同步下来，A 还拿着旧版本保存
    await fs.writeFile(path.join(tmp, '笔记/日志.md'), 'B 的改动\n')
    const copy = await v.writeChecked('笔记/日志.md', 'A 的第二次改动\n', 'A 的改动\n', 'PC:A')
    expect(copy).toMatch(/^笔记\/日志 \(冲突副本 PCA \d{4}-\d{2}-\d{2} \d{6}\)\.md$/)
    expect(await v.read('笔记/日志.md')).toBe('B 的改动\n')
    expect(await v.read(copy!)).toBe('A 的第二次改动\n')

    // 同一秒再次冲突：副本不重名
    const copy2 = await v.writeChecked('笔记/日志.md', '第三次\n', 'A 的改动\n', 'PC:A')
    expect(copy2).not.toBe(copy)
    expect(await v.read(copy2!)).toBe('第三次\n')

    // 内容与磁盘一致：无需写入也不算冲突
    expect(await v.writeChecked('笔记/日志.md', 'B 的改动\n', '旧\n')).toBeNull()

    // 原本不存在、期间被外部创建：不覆盖
    await fs.writeFile(path.join(tmp, '新.md'), '外部创建\n')
    expect(await v.writeChecked('新.md', '本机\n', null)).not.toBeNull()
    expect(await v.read('新.md')).toBe('外部创建\n')

    // 外部删除了正在编辑的文件：写回，不丢内容
    await fs.rm(path.join(tmp, '笔记/日志.md'))
    expect(await v.writeChecked('笔记/日志.md', '还在编辑\n', 'B 的改动\n')).toBeNull()
    expect(await v.read('笔记/日志.md')).toBe('还在编辑\n')

    await fs.rm(tmp, { recursive: true, force: true })
  })
})
