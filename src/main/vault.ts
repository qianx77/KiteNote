import { promises as fs, watch, FSWatcher, createReadStream } from 'fs'
import { createHash } from 'crypto'
import path from 'path'
import type { FileEntry, ImportReport, SearchHit } from '../shared/types'

/** 遍历时跳过的目录（.obsidian 等隐藏目录仍会被导入复制，只是不在文件树显示） */
const HIDDEN = (name: string): boolean => name.startsWith('.') || name === 'node_modules'

export const toPosix = (p: string): string => p.split(path.sep).join('/')

export class Vault {
  private watcher: FSWatcher | null = null
  private recentWrites = new Map<string, number>()

  constructor(public readonly root: string) {}

  /** 把相对路径解析为绝对路径，并保证不越出库根目录 */
  abs(rel: string): string {
    const full = path.resolve(this.root, rel)
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep
    if (full !== this.root && !full.startsWith(rootWithSep)) throw new Error(`路径越界: ${rel}`)
    return full
  }

  async list(): Promise<FileEntry[]> {
    const out: FileEntry[] = []
    const walk = async (dir: string): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (HIDDEN(e.name)) continue
        const full = path.join(dir, e.name)
        const rel = toPosix(path.relative(this.root, full))
        if (e.isDirectory()) {
          out.push({ path: rel, isDir: true, mtime: 0, size: 0 })
          await walk(full)
        } else if (e.isFile()) {
          const st = await fs.stat(full)
          out.push({ path: rel, isDir: false, mtime: st.mtimeMs, size: st.size })
        }
      }
    }
    await walk(this.root)
    return out
  }

  read(rel: string): Promise<string> {
    return fs.readFile(this.abs(rel), 'utf8')
  }

  readBinary(rel: string): Promise<Buffer> {
    return fs.readFile(this.abs(rel))
  }

  /** notify：不把这次写入当作「自己写的」，让监听照常通知界面（如冲突副本需要出现在文件树） */
  async write(rel: string, content: string | Uint8Array, notify = false): Promise<void> {
    const full = this.abs(rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    if (!notify) this.recentWrites.set(toPosix(rel), Date.now())
    // 先写临时文件再改名，避免同步盘读到半个文件
    const tmp = `${full}.${process.pid}.tmp`
    await fs.writeFile(tmp, content)
    await fs.rename(tmp, full)
  }

  /**
   * 两台电脑通过同步盘共用一个库时，本机打开后文件可能已被另一台改过。
   * 磁盘内容仍是 expected（打开时读到的版本，null 表示原本不存在）才写入；
   * 否则原文件保持外部版本不动，本机内容另存为「xxx (冲突副本 设备 时间).md」，返回副本路径。
   * 外部删除了文件（读不到）时照常写回，避免正在编辑的内容丢失。
   */
  async writeChecked(rel: string, content: string, expected: string | null, device = ''): Promise<string | null> {
    let current: string | null
    try {
      current = await this.read(rel)
    } catch {
      current = null
    }
    if (current === content) return null
    if (current === null || current === expected) {
      await this.write(rel, content)
      return null
    }
    const copy = await this.conflictPath(rel, device)
    await this.write(copy, content, true)
    return copy
  }

  async conflictPath(rel: string, device = '', now = new Date()): Promise<string> {
    const ext = path.posix.extname(rel)
    const base = rel.slice(0, rel.length - ext.length)
    const p2 = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`
    const dev = device.replace(/[\\/:*?"<>|[\]#^]/g, '').trim()
    const name = `${base} (冲突副本${dev ? ' ' + dev : ''} ${stamp})`
    let out = `${name}${ext}`
    for (let i = 2; await this.exists(out); i++) out = `${name} ${i}${ext}`
    return out
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await fs.access(this.abs(rel))
      return true
    } catch {
      return false
    }
  }

  async mkdir(rel: string): Promise<void> {
    await fs.mkdir(this.abs(rel), { recursive: true })
  }

  async rename(from: string, to: string): Promise<void> {
    const dst = this.abs(to)
    if (await this.exists(to)) throw new Error(`目标已存在: ${to}`)
    await fs.mkdir(path.dirname(dst), { recursive: true })
    await fs.rename(this.abs(from), dst)
  }

  /** 读取 Obsidian 的附件目录设置，保证粘贴图片的位置与 Obsidian 一致 */
  async attachmentDir(notePath: string): Promise<string> {
    let setting: string | undefined
    try {
      const cfg = JSON.parse(await fs.readFile(path.join(this.root, '.obsidian', 'app.json'), 'utf8'))
      setting = cfg.attachmentFolderPath
    } catch {
      setting = undefined
    }
    const noteDir = path.posix.dirname(notePath) === '.' ? '' : path.posix.dirname(notePath)
    if (setting === undefined) return '附件'
    if (setting === '/' || setting === '') return ''
    if (setting === './') return noteDir
    if (setting.startsWith('./')) return path.posix.join(noteDir, setting.slice(2))
    return setting.replace(/^\/+|\/+$/g, '')
  }

  async saveAttachment(fileName: string, data: Uint8Array, notePath: string): Promise<string> {
    const dir = await this.attachmentDir(notePath)
    const ext = path.extname(fileName)
    const base = fileName.slice(0, fileName.length - ext.length)
    let rel = dir ? `${dir}/${fileName}` : fileName
    for (let i = 1; await this.exists(rel); i++) {
      const name = `${base} ${i}${ext}`
      rel = dir ? `${dir}/${name}` : name
    }
    await this.write(rel, data)
    return rel
  }

  async search(query: string, limit = 200): Promise<SearchHit[]> {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hits: SearchHit[] = []
    for (const f of await this.list()) {
      if (f.isDir || !f.path.endsWith('.md')) continue
      if (f.path.toLowerCase().includes(q)) hits.push({ path: f.path, line: 0, text: f.path })
      const lines = (await this.read(f.path)).split(/\r?\n/)
      lines.forEach((l, i) => {
        if (hits.length < limit && l.toLowerCase().includes(q)) hits.push({ path: f.path, line: i + 1, text: l.trim().slice(0, 160) })
      })
      if (hits.length >= limit) break
    }
    return hits
  }

  watch(onChange: (paths: string[]) => void): void {
    this.unwatch()
    let pending = new Set<string>()
    let timer: NodeJS.Timeout | null = null
    try {
      this.watcher = watch(this.root, { recursive: true }, (_evt, file) => {
        if (!file) return
        const rel = toPosix(file.toString())
        if (rel.split('/').some((seg) => seg.startsWith('.')) || rel.endsWith('.tmp')) return
        const wrote = this.recentWrites.get(rel)
        if (wrote && Date.now() - wrote < 1500) return // 忽略自己刚写入的文件
        pending.add(rel)
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          const paths = [...pending]
          pending = new Set()
          onChange(paths)
        }, 400)
      })
    } catch (err) {
      console.warn('文件监听不可用:', err)
    }
  }

  unwatch(): void {
    this.watcher?.close()
    this.watcher = null
  }
}

async function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha1')
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })
}

async function walkAll(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile()) out.push(path.relative(root, full))
    }
  }
  await walk(root)
  return out
}

/**
 * 从 Obsidian 库无损导入：逐字节复制整个目录（含 .obsidian 配置、附件、非 md 文件），
 * 保留目录结构和修改时间，然后逐文件 SHA1 校验。
 */
export async function importVault(source: string, target: string): Promise<ImportReport> {
  const report: ImportReport = { ok: false, source, target, files: 0, bytes: 0, mismatched: [], message: '' }
  const rel = path.relative(source, target)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    report.message = '目标目录不能位于源库内部'
    return report
  }
  try {
    const existing = await fs.readdir(target)
    if (existing.length > 0) {
      report.message = `目标目录不为空：${target}`
      return report
    }
  } catch {
    /* 目标不存在，正常 */
  }
  await fs.cp(source, target, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false })
  const files = await walkAll(source)
  for (const f of files) {
    const a = path.join(source, f)
    const b = path.join(target, f)
    try {
      const [ha, hb] = await Promise.all([hashFile(a), hashFile(b)])
      if (ha !== hb) report.mismatched.push(toPosix(f))
      report.bytes += (await fs.stat(a)).size
    } catch {
      report.mismatched.push(toPosix(f))
    }
  }
  report.files = files.length
  report.ok = report.mismatched.length === 0
  report.message = report.ok
    ? `已复制并校验 ${files.length} 个文件，内容与原库逐字节一致`
    : `${report.mismatched.length} 个文件校验不一致`
  return report
}
