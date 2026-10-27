/**
 * markdown-it 插件：让 Obsidian 特有语法在 解析 → 所见即所得 → 序列化 往返中不丢失。
 * 支持 [[双链]]、![[嵌入/图片]]、==高亮==、$公式$ / $$公式$$、软换行、原样 HTML 块、相对路径图片。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// markdown-it 由 tiptap-markdown 内部提供，这里只用到少量 API，按宽松类型处理
type MarkdownIt = any
type StateInline = any
type StateBlock = any
import { IMAGE_EXT, vaultIndex, vaultUrl } from '../vaultIndex'

/** 当前正在解析的笔记路径（用于解析相对路径图片） */
export const parseContext = { notePath: '' }

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function resolveImageSrc(src: string): string {
  if (/^(https?:|data:|vault:)/i.test(src)) return src
  const rel = vaultIndex.resolve(src, parseContext.notePath)
  return rel ? vaultUrl(rel) : src
}

/** HTML 里的 <img src="附件/x.png">：显示时换成库内地址，并记住原始路径以便原样保存 */
function resolveHtmlImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/\ssrc=(["'])(.*?)\1/i)
    if (!m || /^(https?:|data:|vault:)/i.test(m[2])) return tag
    const embed = tag.match(/\sdata-embed=(["'])(.*?)\1/i)?.[2]
    const resolved = resolveImageSrc(embed ?? m[2].replace(/&amp;/g, '&'))
    const mdSrc = embed || /\sdata-md-src=/i.test(tag) ? '' : ` data-md-src="${m[2]}"`
    return tag.replace(m[0], ` src="${esc(resolved)}"${mdSrc}`)
  })
}

function wikilink(state: StateInline, silent: boolean): boolean {
  const src = state.src
  let pos = state.pos
  let embed = false
  if (src.charCodeAt(pos) === 0x21 /* ! */ && src.startsWith('[[', pos + 1)) {
    embed = true
    pos += 1
  } else if (!src.startsWith('[[', pos)) return false
  const end = src.indexOf(']]', pos + 2)
  if (end < 0 || end > state.posMax) return false
  const inner = src.slice(pos + 2, end)
  if (!inner.trim() || /[\n[\]]/.test(inner)) return false
  if (!silent) {
    const tok = state.push('wikilink', '', 0)
    tok.meta = { embed, inner }
  }
  state.pos = end + 2
  return true
}

function renderWikilink(meta: { embed: boolean; inner: string }): string {
  // 表格内的别名分隔符写作 \|
  const parts = meta.inner.split(/\\?\|/)
  const target = parts[0].trim()
  const alias = parts.slice(1).join('|').trim()
  if (meta.embed && IMAGE_EXT.test(target.replace(/#.*$/, ''))) {
    const width = /^\d+(x\d+)?$/.test(alias) ? alias.split('x')[0] : ''
    return `<img src="${esc(resolveImageSrc(target))}" data-embed="${esc(target)}"${width ? ` width="${width}"` : ''} alt="${esc(alias && !width ? alias : target)}">`
  }
  return `<span data-wikilink="${esc(target)}" data-alias="${esc(alias)}"${meta.embed ? ' data-embed="1"' : ''}></span>`
}

function highlight(state: StateInline, silent: boolean): boolean {
  const start = state.pos
  const src = state.src
  if (!src.startsWith('==', start) || src.startsWith('===', start)) return false
  const end = src.indexOf('==', start + 2)
  if (end < 0 || end > state.posMax) return false
  const content = src.slice(start + 2, end)
  if (!content || /^\s|\s$/.test(content) || content.includes('\n\n')) return false
  if (!silent) {
    const oldMax = state.posMax
    state.push('mark_open', 'mark', 1)
    state.pos = start + 2
    state.posMax = end
    state.md.inline.tokenize(state)
    state.posMax = oldMax
    state.push('mark_close', 'mark', -1)
  }
  state.pos = end + 2
  return true
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false
  const display = src.charCodeAt(start + 1) === 0x24
  const open = display ? 2 : 1
  let end = start + open
  for (;;) {
    end = src.indexOf(display ? '$$' : '$', end)
    if (end < 0 || end > state.posMax) return false
    if (src.charCodeAt(end - 1) === 0x5c /* \ */) {
      end += 1
      continue
    }
    break
  }
  const tex = src.slice(start + open, end)
  if (!tex.trim() || (!display && (/^\s|\s$/.test(tex) || tex.includes('\n')))) return false
  if (!silent) {
    const tok = state.push('math_inline', 'span', 0)
    tok.content = tex
    tok.meta = { display }
  }
  state.pos = end + open
  return true
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const lineText = (l: number): string => state.src.slice(state.bMarks[l] + state.tShift[l], state.eMarks[l])
  const first = lineText(startLine)
  if (!first.startsWith('$$') || state.sCount[startLine] - state.blkIndent >= 4) return false
  let content: string
  let next = startLine
  const rest = first.slice(2)
  if (rest.trim().endsWith('$$') && rest.trim().length >= 2) {
    content = rest.trim().slice(0, -2)
  } else {
    const lines = [rest]
    let found = false
    while (++next < endLine) {
      const t = lineText(next)
      if (t.trim().endsWith('$$')) {
        lines.push(t.trim().slice(0, -2))
        found = true
        break
      }
      lines.push(t)
    }
    if (!found) return false
    content = lines.filter((l, i) => !(i === 0 && l.trim() === '')).join('\n').replace(/\n$/, '')
  }
  if (silent) return true
  const tok = state.push('math_block', 'div', 0)
  tok.content = content.trim() === content ? content : content.replace(/^\n+|\n+$/g, '')
  tok.map = [startLine, next + 1]
  state.line = next + 1
  return true
}

export function obsidianMarkdownIt(md: MarkdownIt): void {
  const anyMd = md as MarkdownIt & { __labnote?: boolean }
  if (anyMd.__labnote) return
  anyMd.__labnote = true

  // 不解析引用式链接定义：`[^1]: 脚注`、`[id]: url` 原样作为文本保留，避免内容消失
  md.block.ruler.disable('reference')
  // 链接/图片地址保持原文（默认会把中文路径转成 %E9%99%84 这类编码）
  md.normalizeLink = (url: string) => url
  md.inline.ruler.before('link', 'wikilink', wikilink)
  md.inline.ruler.before('emphasis', 'highlight', highlight)
  md.inline.ruler.after('escape', 'math_inline', mathInline)
  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })

  md.renderer.rules.wikilink = (tokens: any[], idx: number) => renderWikilink(tokens[idx].meta)
  md.renderer.rules.math_inline = (tokens: any[], idx: number) =>
    `<span data-math="inline" data-display="${tokens[idx].meta.display ? '1' : ''}" data-tex="${esc(tokens[idx].content)}"></span>`
  md.renderer.rules.math_block = (tokens: any[], idx: number) => `<div data-math="block" data-tex="${esc(tokens[idx].content)}"></div>`
  md.renderer.rules.softbreak = () => '<br data-soft="1">'

  const defaultImage = md.renderer.rules.image!
  md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const tok = tokens[idx]
    const src = tok.attrGet('src') ?? ''
    tok.attrSet('data-md-src', src)
    tok.attrSet('src', resolveImageSrc(src))
    return defaultImage(tokens, idx, options, env, self)
  }

  // 未知 HTML 块原样保留（表格交给编辑器解析成可编辑表格）
  md.renderer.rules.html_inline = (tokens: any[], idx: number) => resolveHtmlImages(tokens[idx].content)
  md.renderer.rules.html_block = (tokens: any[], idx: number) => {
    const html = tokens[idx].content
    if (/^\s*<(table|img|p|h[1-6]|ul|ol|blockquote|pre|hr|br)\b/i.test(html)) return resolveHtmlImages(html)
    return `<div data-raw-html="${esc(html.replace(/\n$/, ''))}"></div>`
  }
}

// ---------- Front matter ----------

export function splitFrontmatter(src: string): { frontmatter: string; body: string } {
  const m = src.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/)
  if (!m) return { frontmatter: '', body: src }
  return { frontmatter: m[0].replace(/\r?\n$/, ''), body: src.slice(m[0].length) }
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  return frontmatter.trim() ? `${frontmatter.replace(/\s+$/, '')}\n${body}` : body
}

export function frontmatterField(frontmatter: string, key: string): string | null {
  const m = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
