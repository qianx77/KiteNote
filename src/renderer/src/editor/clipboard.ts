/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Editor } from '@tiptap/core'
import { DOMSerializer, Fragment, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { vaultIndex, vaultUrl } from '../vaultIndex'

/**
 * 把编辑器 HTML 转成钉钉文档 / 飞书 / Word 都能识别的“朴素”富文本：
 * 待办转为 ☑/☐，双链转为文字，公式转为 LaTeX 文本，表格加内联边框样式。
 * 图片仍是 vault:// 地址，由主进程统一替换为 base64 内嵌。
 */
export function toPortableHtml(root: HTMLElement): string {
  root.querySelectorAll('span[data-wikilink]').forEach((el) => {
    el.replaceWith(document.createTextNode(el.getAttribute('data-alias') || el.getAttribute('data-wikilink') || ''))
  })
  root.querySelectorAll('[data-math]').forEach((el) => {
    const tex = el.getAttribute('data-tex') ?? ''
    const block = el.getAttribute('data-math') === 'block'
    const code = document.createElement(block ? 'pre' : 'code')
    code.textContent = block ? `$$\n${tex}\n$$` : `$${tex}$`
    el.replaceWith(code)
  })
  root.querySelectorAll('[data-raw-html]').forEach((el) => {
    const div = document.createElement('div')
    div.innerHTML = el.getAttribute('data-raw-html') ?? ''
    el.replaceWith(div)
  })
  root.querySelectorAll('li[data-type="taskItem"], li[data-checked]').forEach((li) => {
    const checked = li.getAttribute('data-checked') === 'true'
    li.querySelector(':scope > label')?.remove()
    const content = li.querySelector(':scope > div')
    const mark = document.createTextNode(checked ? '☑ ' : '☐ ')
    const target = content?.querySelector('p') ?? content ?? li
    target.insertBefore(mark, target.firstChild)
    if (content) {
      while (content.firstChild) li.insertBefore(content.firstChild, content)
      content.remove()
    }
    li.setAttribute('style', 'list-style: none;')
  })
  root.querySelectorAll('table').forEach((t) => {
    t.setAttribute('style', 'border-collapse: collapse;')
    t.querySelectorAll('td, th').forEach((c) => {
      const align = (c as HTMLElement).style.textAlign
      c.setAttribute('style', `border: 1px solid #bbb; padding: 4px 8px;${align ? ` text-align: ${align};` : ''}`)
    })
    t.querySelectorAll('colgroup').forEach((c) => c.remove())
  })
  root.querySelectorAll('blockquote').forEach((b) => {
    b.setAttribute('style', 'border-left: 4px solid #ccc; margin: 0; padding: 4px 12px; color: #555;')
  })
  root.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'))
  root.querySelectorAll('[data-type], [data-embed], [data-md-src], [data-soft], [contenteditable]').forEach((el) => {
    for (const a of ['data-type', 'data-embed', 'data-md-src', 'data-soft', 'contenteditable', 'data-checked']) el.removeAttribute(a)
  })
  return root.innerHTML
}

export function fragmentToHtml(editor: Editor, fragment: Fragment): string {
  const div = document.createElement('div')
  div.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(fragment))
  return toPortableHtml(div)
}

// 复制时在 HTML 里夹带原始 Markdown（HTML 注释，钉钉等外部应用会忽略），
// 粘贴回本软件时据此还原 [[双链]]、公式、待办等，避免变成纯文字而失效。
// 同时认旧名 labnote-md，兼容改名前复制的内容。
const MARK_RE = /<!--(?:kitenote|labnote)-md:([A-Za-z0-9+/=]+)-->/

export function withMarkdown(html: string, md: string): string {
  const bytes = new TextEncoder().encode(md)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const b64 = btoa(bin)
  return `${html}<!--kitenote-md:${b64}-->`
}

export function markdownFromHtml(html: string): string | null {
  const m = html.match(MARK_RE)
  if (!m) return null
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/**
 * 选区要复制的内容。表格选区（CellSelection）原样只有若干「行」，不处理会丢掉表格结构：
 * 只选中一个格子时复制格内内容；跨格（多行/多列）时补上外层表格一起复制。
 * markdown 用的副本把首行转为表头，保证存成标准 Markdown 表格。
 */
export function selectionToCopy(state: EditorState): { fragment: Fragment; markdown: Fragment } {
  const sel = state.selection
  if (!(sel instanceof CellSelection)) {
    // 在同一个格子里拖到格子边缘时，选区会带上外层表格结构：拆掉只剩一格的表格 / 行 / 格外壳
    let fragment = sel.content().content
    const shell = new Set(['table', 'tableRow', 'tableCell', 'tableHeader'])
    while (fragment.childCount === 1 && shell.has(fragment.firstChild!.type.name) && fragment.firstChild!.childCount <= 1) {
      fragment = fragment.firstChild!.content
    }
    return { fragment, markdown: fragment }
  }
  const cells: PMNode[] = []
  sel.forEachCell((c) => void cells.push(c))
  if (cells.length === 1) return { fragment: cells[0].content, markdown: cells[0].content }
  const source = sel.$anchorCell.node(-1)
  const content = sel.content().content
  const table = content.firstChild?.type.name === 'table' ? content.firstChild : source.type.create(source.attrs, content)
  const header = state.schema.nodes.tableHeader
  const rows: PMNode[] = []
  table.forEach((row, _o, i) => {
    if (i > 0 || !header) return void rows.push(row)
    const hs: PMNode[] = []
    row.forEach((c) => void hs.push(c.type === header ? c : header.create(c.attrs, c.content, c.marks)))
    rows.push(row.copy(Fragment.from(hs)))
  })
  return { fragment: Fragment.from(table), markdown: Fragment.from(table.copy(Fragment.from(rows))) }
}

/** 是否选中了整张表格（全部行和列） */
export function isWholeTableSelected(state: EditorState): boolean {
  const sel = state.selection
  return sel instanceof CellSelection && sel.isRowSelection() && sel.isColSelection()
}

export async function copyFragment(editor: Editor, fragment: Fragment, markdown: Fragment = fragment): Promise<void> {
  const html = fragmentToHtml(editor, fragment)
  let text = ''
  try {
    text = editor.storage.markdown.serializer.serialize(markdown)
  } catch {
    text = markdown.textBetween(0, markdown.size, '\n')
  }
  await window.api.copyRich({ html: text ? withMarkdown(html, text) : html, text })
}

const pad = (n: number): string => String(n).padStart(2, '0')
function pastedName(ext: string): string {
  const d = new Date()
  return `Pasted image ${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`
}

/** 保存文件到库的附件目录，返回插入编辑器用的节点 JSON */
export async function saveFileAsNode(file: File | Blob, notePath: string, name?: string): Promise<any> {
  const mime = file.type || ''
  const isImage = mime.startsWith('image/')
  const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')
  const fileName = name && !/^image\.\w+$/i.test(name) ? name : isImage ? pastedName(ext) : name || `附件 ${Date.now()}`
  const data = new Uint8Array(await file.arrayBuffer())
  const rel = await window.api.saveAttachment(fileName, data, notePath)
  vaultIndex.update([...vaultIndex.files, { path: rel, isDir: false, mtime: Date.now(), size: data.length }])
  const link = vaultIndex.linkText(rel)
  if (isImage) return { type: 'image', attrs: { src: vaultUrl(rel), embed: link, alt: link } }
  return { type: 'wikiLink', attrs: { target: link, alias: '', embed: true } }
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}
