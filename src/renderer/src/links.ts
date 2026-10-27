import type { FileEntry } from '../../shared/types'
import { basename, IMAGE_EXT, stem, vaultIndex } from './vaultIndex'
import { withMarkdown } from './editor/clipboard'

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pathKey = (rel: string): string => (rel.endsWith('.md') ? rel.slice(0, -3) : rel)
const shortKey = (rel: string): string => (rel.endsWith('.md') ? stem(rel) : basename(rel))

/**
 * 移动/重命名文件或文件夹，并像 Obsidian 一样更新全库中指向它们的 [[链接]]（含任务清单里的关联）。
 * 返回被更新链接的笔记数量。
 */
export async function moveWithLinks(from: string, to: string, files: FileEntry[]): Promise<number> {
  const moved = files
    .filter((f) => !f.isDir && (f.path === from || f.path.startsWith(from + '/')))
    .map((f) => ({ old: f.path, now: to + f.path.slice(from.length) }))
  // 短链接（只写文件名）只有在改名且原来能唯一定位到该文件时才需要替换
  const rules = moved.flatMap(({ old, now }) => {
    const r: [RegExp, string][] = [[new RegExp(`(!?\\[\\[)${escRe(pathKey(old))}(?=(\\.md)?[\\]|#\\\\])`, 'g'), `$1${pathKey(now)}`]]
    if (shortKey(old) !== shortKey(now) && vaultIndex.resolve(shortKey(old)) === old) {
      r.push([new RegExp(`(!?\\[\\[)${escRe(shortKey(old))}(?=(\\.md)?[\\]|#\\\\])`, 'g'), `$1${shortKey(now)}`])
    }
    return r
  })
  await window.api.rename(from, to)
  if (!rules.length) return 0
  const movedSet = new Map(moved.map((m) => [m.old, m.now]))
  let updated = 0
  for (const f of files) {
    if (f.isDir || !f.path.endsWith('.md')) continue
    const rel = movedSet.get(f.path) ?? f.path
    const text = await window.api.readFile(rel)
    let next = text
    for (const [re, rep] of rules) next = next.replace(re, rep)
    if (next !== text) {
      await window.api.writeFile(rel, next)
      updated++
    }
  }
  return updated
}

/** 复制指向某文件的链接：粘贴到本软件是可点击的双链，粘贴到别处是 [[...]] 文本 */
export async function copyLinkText(target: string, alias = '', embed = false): Promise<string> {
  const md = `${embed ? '!' : ''}[[${target}${alias ? '|' + alias : ''}]]`
  const label = (alias || target).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  await window.api.copyRich({ html: withMarkdown(`<span>${label}</span>`, md), text: md })
  return md
}

export function copyNoteLink(rel: string): Promise<string> {
  return copyLinkText(vaultIndex.linkText(rel), '', IMAGE_EXT.test(rel))
}

export const folderList = (files: FileEntry[]): string[] => files.filter((f) => f.isDir).map((f) => f.path).sort()
