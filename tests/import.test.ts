// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { importVault, Vault } from '../src/main/vault'

async function makeObsidianVault(root: string): Promise<void> {
  await fs.mkdir(path.join(root, '.obsidian'), { recursive: true })
  await fs.mkdir(path.join(root, '实验/子目录'), { recursive: true })
  await fs.mkdir(path.join(root, 'assets'), { recursive: true })
  await fs.writeFile(path.join(root, '.obsidian/app.json'), JSON.stringify({ attachmentFolderPath: 'assets' }))
  await fs.writeFile(path.join(root, '实验/exp-001.md'), '---\ntags: [a]\n---\n# exp\r\n![[loss.png]]\r\n')
  await fs.writeFile(path.join(root, '实验/子目录/空.md'), '')
  await fs.writeFile(path.join(root, 'assets/loss.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))
  await fs.writeFile(path.join(root, 'data.csv'), 'a,b\n1,2\n')
}

describe('Obsidian 导入', () => {
  it('逐字节复制并校验，保留目录结构和隐藏配置', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'labnote-'))
    const src = path.join(tmp, 'src')
    const dst = path.join(tmp, 'dst')
    await makeObsidianVault(src)
    const r = await importVault(src, dst)
    expect(r.ok).toBe(true)
    expect(r.files).toBe(5)
    expect(await fs.readFile(path.join(dst, '实验/exp-001.md'), 'utf8')).toBe('---\ntags: [a]\n---\n# exp\r\n![[loss.png]]\r\n')
    expect(await fs.readFile(path.join(dst, '.obsidian/app.json'), 'utf8')).toContain('assets')
    // 拒绝导入到非空目录
    expect((await importVault(src, dst)).ok).toBe(false)
    // 附件目录遵循 .obsidian/app.json
    const v = new Vault(dst)
    expect(await v.saveAttachment('a.png', new Uint8Array([1]), '实验/exp-001.md')).toBe('assets/a.png')
    expect(await v.saveAttachment('a.png', new Uint8Array([1]), '实验/exp-001.md')).toBe('assets/a 1.png')
    expect(() => v.abs('../外部.md')).toThrow()
    await fs.rm(tmp, { recursive: true, force: true })
  })
})
