import type { FileEntry } from '../../shared/types'

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i

export const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1)
export const dirname = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
export const stem = (p: string): string => basename(p).replace(/\.md$/i, '')

export function vaultUrl(rel: string): string {
  return 'vault://file/' + rel.split('/').map(encodeURIComponent).join('/')
}

/** 按 Obsidian 规则解析链接：完整路径 → 补 .md → 同名文件（优先同目录、路径最短） */
export class VaultIndex {
  files: FileEntry[] = []
  private paths = new Map<string, string>()
  private byBase = new Map<string, string[]>()

  update(files: FileEntry[]): void {
    this.files = files
    this.paths.clear()
    this.byBase.clear()
    for (const f of files) {
      if (f.isDir) continue
      this.paths.set(f.path.toLowerCase(), f.path)
      for (const key of [basename(f.path).toLowerCase(), stem(f.path).toLowerCase()]) {
        const arr = this.byBase.get(key) ?? []
        if (!arr.includes(f.path)) arr.push(f.path)
        this.byBase.set(key, arr)
      }
    }
  }

  resolve(link: string, from = ''): string | null {
    let target = link.trim().replace(/^\/+/, '')
    try {
      target = decodeURI(target)
    } catch {
      /* 保持原样 */
    }
    const lower = target.toLowerCase()
    const fromDir = dirname(from)
    const rel = fromDir ? `${fromDir}/${target}`.toLowerCase() : lower
    for (const cand of [lower, `${lower}.md`, rel, `${rel}.md`]) {
      const hit = this.paths.get(normalize(cand))
      if (hit) return hit
    }
    const cands = this.byBase.get(basename(lower)) ?? []
    if (!cands.length) return null
    const same = cands.find((c) => dirname(c) === fromDir)
    if (same) return same
    return [...cands].sort((a, b) => a.length - b.length)[0]
  }

  /** 生成最短可唯一定位的链接文本（同 Obsidian 默认“尽可能简短”） */
  linkText(rel: string): string {
    const short = IMAGE_EXT.test(rel) || !rel.endsWith('.md') ? basename(rel) : stem(rel)
    const cands = this.byBase.get(short.toLowerCase()) ?? []
    if (cands.length <= 1) return short
    return rel.endsWith('.md') ? rel.slice(0, -3) : rel
  }
}

function normalize(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop()
    else if (seg && seg !== '.') out.push(seg)
  }
  return out.join('/')
}

export const vaultIndex = new VaultIndex()
