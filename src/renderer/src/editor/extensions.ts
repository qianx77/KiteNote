/* eslint-disable @typescript-eslint/no-explicit-any */
import { Extension, Node, getHTMLFromFragment } from '@tiptap/core'
import { Fragment, Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Text from '@tiptap/extension-text'
import Code from '@tiptap/extension-code'
import HardBreak from '@tiptap/extension-hard-break'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { Markdown } from 'tiptap-markdown'
import katex from 'katex'
import { obsidianMarkdownIt } from './markdownIt'
import { SlashCommand } from './slash'
import { askText } from '../ui'
import { vaultIndex } from '../vaultIndex'

// ---------- 文本转义：只转义真正会改变语义的字符，尽量保持原文不变 ----------

export function escapeText(text: string, atLineStart: boolean, inTable: boolean): string {
  const dollars = (text.match(/\$/g) ?? []).length
  const stars = (text.match(/\*/g) ?? []).length
  let s = text.replace(/\\|`|\*|_|~~|==|\$|<(?=[A-Za-z/!?])|&(?=#?\w+;)|\|/g, (m, i: number) => {
    const prev = text[i - 1] ?? ' '
    const next = text[i + m.length] ?? ' '
    switch (m) {
      case '\\':
        // 只有当反斜杠后面是可被转义的标点时才需要双写（如 C:\path 保持不变）
        return /[!-/:-@[-`{-~]/.test(next) ? '\\\\' : '\\'
      case '*':
      case '_':
        if (/\s/.test(prev) && /\s/.test(next)) return m
        if (m === '_' && /[\p{L}\p{N}]/u.test(prev) && /[\p{L}\p{N}]/u.test(next)) return m
        // 单个 * 无法单独构成强调（如 NG*0.2），保持原样
        if (m === '*' && stars === 1 && !/\s/.test(next)) return m
        return '\\' + m
      case '$':
        return dollars >= 2 ? '\\$' : '$'
      case '&':
        return '&amp;'
      case '|':
        return inTable ? '\\|' : '|'
      default:
        return '\\' + m
    }
  })
  if (atLineStart) {
    s = s
      .replace(/^(#{1,6})(?=\s|$)/, '\\$1')
      .replace(/^([-+*])(?=\s)/, '\\$1')
      .replace(/^(\d+)([.)])(?=\s)/, '$1\\$2')
      .replace(/^>/, '\\>')
      .replace(/^(\[[ xX]\])(?=\s)/, '\\$1')
  }
  return s
}

const ObsidianText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          state.text(escapeText(node.text ?? '', state.atBlockStart || /(^|\n)$/.test(state.out), !!state.inTable), false)
        }
      }
    }
  }
})

// 行内代码允许与加粗等格式共存（**改 `config.yaml`** 不丢加粗）
const InlineCode = Code.extend({ excludes: '' })

// ---------- 软换行：Obsidian 中单个换行即显示为换行，往返时保持为普通换行 ----------

const SoftHardBreak = HardBreak.extend({
  addAttributes() {
    return {
      soft: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-soft') === '1',
        renderHTML: (a) => (a.soft ? { 'data-soft': '1' } : {})
      }
    }
  },
  addKeyboardShortcuts() {
    return {
      'Shift-Enter': () => this.editor.commands.insertContent({ type: 'hardBreak', attrs: { soft: true } }),
      'Mod-Enter': () => this.editor.commands.setHardBreak()
    }
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode, parent: PMNode, index: number) {
          if (state.inTable) {
            state.write('<br>')
            return
          }
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) {
              state.write(node.attrs.soft ? '\n' : '\\\n')
              return
            }
          }
          if (node.attrs.soft) state.write('\n')
        }
      }
    }
  }
})

// ---------- [[双链]] / ![[嵌入]] ----------

export const WikiLink = Node.create({
  name: 'wikiLink',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      target: { default: '' },
      alias: { default: '' },
      embed: { default: false }
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-wikilink]',
        getAttrs: (el) => ({
          target: (el as HTMLElement).dataset.wikilink ?? '',
          alias: (el as HTMLElement).dataset.alias ?? '',
          embed: (el as HTMLElement).dataset.embed === '1'
        })
      }
    ]
  },
  renderHTML({ node }) {
    const { target, alias, embed } = node.attrs
    const resolved = vaultIndex.resolve(String(target).replace(/#.*$/, ''))
    return [
      'span',
      {
        'data-wikilink': target,
        'data-alias': alias,
        'data-embed': embed ? '1' : null,
        class: `wikilink${embed ? ' embed' : ''}${resolved ? '' : ' unresolved'}`,
        title: `${embed ? `嵌入：${target}` : target}\n双击打开 · 右键复制/修改`
      },
      `${embed ? '⧉ ' : ''}${alias || target}`
    ]
  },
  renderText({ node }) {
    return node.attrs.alias || node.attrs.target
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          const sep = state.inTable ? '\\|' : '|'
          const { target, alias, embed } = node.attrs
          state.write(`${embed ? '!' : ''}[[${target}${alias ? sep + alias : ''}]]`)
        }
      }
    }
  }
})

// ---------- 图片：保留 Obsidian 嵌入写法与原始相对路径 ----------

const VaultImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      embed: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-embed'),
        renderHTML: (a) => (a.embed ? { 'data-embed': a.embed } : {})
      },
      mdSrc: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-md-src'),
        renderHTML: (a) => (a.mdSrc ? { 'data-md-src': a.mdSrc } : {})
      },
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('width'),
        renderHTML: (a) => (a.width ? { width: a.width } : {})
      }
    }
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          const { embed, mdSrc, src, alt, title, width } = node.attrs
          const sep = state.inTable ? '\\|' : '|'
          if (embed) {
            state.write(`![[${embed}${width ? sep + width : ''}]]`)
            return
          }
          const url: string = mdSrc ?? src ?? ''
          const altText = String(alt ?? '').replace(/([[\]])/g, '\\$1')
          state.write(
            `![${altText}${width ? sep + width : ''}](${/[\s()]/.test(url) ? `<${url}>` : url}${title ? ` "${String(title).replace(/"/g, '\\"')}"` : ''})`
          )
        }
      }
    }
  }
}).configure({ inline: true, allowBase64: true })

// ---------- 公式（KaTeX 渲染，双击编辑） ----------

function mathView(display: boolean) {
  return ({ node, getPos, editor }: any) => {
    const dom = document.createElement(display ? 'div' : 'span')
    dom.className = display ? 'math-block' : 'math-inline'
    const render = (tex: string): void => {
      try {
        dom.innerHTML = katex.renderToString(tex, { throwOnError: false, displayMode: display || node.attrs.display })
      } catch {
        dom.textContent = tex
      }
    }
    render(node.attrs.tex)
    dom.title = '双击编辑公式'
    dom.ondblclick = async () => {
      const tex = await askText('编辑 LaTeX 公式', node.attrs.tex, { multiline: display })
      if (tex === null || typeof getPos !== 'function') return
      editor.chain().focus().command(({ tr }: any) => {
        tr.setNodeMarkup(getPos(), undefined, { ...node.attrs, tex })
        return true
      }).run()
    }
    return {
      dom,
      update: (n: PMNode) => {
        if (n.type !== node.type) return false
        node = n
        render(n.attrs.tex)
        return true
      }
    }
  }
}

export const MathInline = Node.create({
  name: 'mathInline',
  inline: true,
  group: 'inline',
  atom: true,
  addAttributes() {
    return { tex: { default: '' }, display: { default: false } }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-math="inline"]',
        getAttrs: (el) => ({ tex: (el as HTMLElement).dataset.tex ?? '', display: (el as HTMLElement).dataset.display === '1' })
      }
    ]
  },
  renderHTML({ node }) {
    return ['span', { 'data-math': 'inline', 'data-tex': node.attrs.tex }, `$${node.attrs.tex}$`]
  },
  addNodeView() {
    return mathView(false)
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          const d = node.attrs.display ? '$$' : '$'
          state.write(`${d}${node.attrs.tex}${d}`)
        }
      }
    }
  }
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return { tex: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-math="block"]', getAttrs: (el) => ({ tex: (el as HTMLElement).dataset.tex ?? '' }) }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-math': 'block', 'data-tex': node.attrs.tex }, `$$${node.attrs.tex}$$`]
  },
  addNodeView() {
    return mathView(true)
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          state.write(`$$\n${node.attrs.tex}\n$$`)
          state.closeBlock(node)
        }
      }
    }
  }
})

// ---------- 原样保留的 HTML 块 ----------

export const RawHtml = Node.create({
  name: 'rawHtml',
  group: 'block',
  atom: true,
  addAttributes() {
    return { html: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-raw-html]', getAttrs: (el) => ({ html: (el as HTMLElement).dataset.rawHtml ?? '' }) }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-raw-html': node.attrs.html, class: 'raw-html' }, node.attrs.html]
  },
  addNodeView() {
    return ({ node, getPos, editor }: any) => {
      const dom = document.createElement('pre')
      dom.className = 'raw-html'
      dom.title = 'HTML 块（原样保留，双击编辑）'
      dom.textContent = node.attrs.html
      dom.ondblclick = async () => {
        const html = await askText('编辑 HTML 块', node.attrs.html, { multiline: true })
        if (html === null) return
        editor.chain().command(({ tr }: any) => {
          tr.setNodeMarkup(getPos(), undefined, { html })
          return true
        }).run()
      }
      return { dom }
    }
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          state.write(node.attrs.html)
          state.closeBlock(node)
        }
      }
    }
  }
})

// ---------- 高亮：无颜色时写作 ==文本==，有颜色时写 HTML ----------

const ObsidianHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-color') || rawStyle(el, 'background-color'),
        renderHTML: (a) => (a.color ? { 'data-color': a.color, style: `background-color: ${a.color}; color: inherit` } : {})
      }
    }
  },
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_s: any, mark: any) => (mark.attrs.color ? `<mark style="background-color: ${mark.attrs.color}">` : '=='),
          close: (_s: any, mark: any) => (mark.attrs.color ? '</mark>' : '=='),
          mixable: true,
          expelEnclosingWhitespace: true
        }
      }
    }
  }
}).configure({ multicolor: true })

// ---------- 颜色：保持原始写法（浏览器会把 #d4380d 规范成 rgb(...)） ----------

const rawStyle = (el: HTMLElement, prop: string): string | null =>
  el.getAttribute('style')?.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))?.[1].trim() ?? null

const RawColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          color: {
            default: null,
            parseHTML: (el) => rawStyle(el, 'color'),
            renderHTML: (a) => (a.color ? { style: `color: ${a.color}` } : {})
          }
        }
      }
    ]
  }
})

/** 直接由属性拼 HTML（经 DOM 序列化会被浏览器改写成 rgb(...)） */
const styleOf = (attrs: Record<string, unknown>): string =>
  [attrs.color && `color: ${attrs.color}`, attrs.fontSize && `font-size: ${attrs.fontSize}`].filter(Boolean).join('; ')

const MdTextStyle = TextStyle.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_s: any, mark: any) => (styleOf(mark.attrs) ? `<span style="${styleOf(mark.attrs)}">` : ''),
          close: (_s: any, mark: any) => (styleOf(mark.attrs) ? '</span>' : '')
        }
      }
    }
  }
})

// ---------- 待办列表保持紧凑（tiptap-markdown 只处理了普通列表） ----------

const TightTaskList = Extension.create({
  name: 'tightTaskList',
  addGlobalAttributes() {
    return [
      {
        types: ['taskList'],
        attributes: {
          tight: {
            default: true,
            parseHTML: (el) => el.getAttribute('data-tight') === 'true' || !el.querySelector('p'),
            renderHTML: (a) => (a.tight ? { 'data-tight': 'true' } : {})
          }
        }
      }
    ]
  }
})

// ---------- 字号 ----------

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize || null,
            renderHTML: (a) => (a.fontSize ? { style: `font-size: ${a.fontSize}` } : {})
          }
        }
      }
    ]
  }
})

// ---------- 表格：保留对齐方式；复杂表格（合并单元格/多段落）回落为 HTML ----------

const alignAttr = {
  align: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.textAlign || el.getAttribute('align') || null,
    renderHTML: (a: any) => (a.align ? { style: `text-align: ${a.align}` } : {})
  }
}
const AlignedCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...alignAttr } } })
const AlignedHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...alignAttr } } })

function isSimpleTable(node: PMNode): boolean {
  let ok = true
  node.forEach((row, _o, i) => {
    row.forEach((cell) => {
      if (cell.attrs.colspan > 1 || cell.attrs.rowspan > 1 || cell.attrs.colwidth) ok = false
      // 单元格里有多段文字/图片也可以用 <br> 写进 Markdown 表格；只有列表、代码块等才回落为 HTML
      cell.forEach((c) => {
        if (c.type.name !== 'paragraph') ok = false
      })
      if ((i === 0) !== (cell.type.name === 'tableHeader')) ok = false
    })
  })
  return ok
}

const MarkdownTable = Table.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          if (!isSimpleTable(node)) {
            // 内部的 vault:// 图片地址换回库内路径，保证 Obsidian 也能显示
            const html = getHTMLFromFragment(Fragment.from(node), node.type.schema).replace(
              /src="vault:\/\/file\/([^"]+)"/g,
              (_m, p: string) => `src="${decodeURIComponent(p)}"`
            )
            state.write(html)
            state.closeBlock(node)
            return
          }
          state.inTable = true
          node.forEach((row, _o, i) => {
            state.write('| ')
            row.forEach((cell, _p, j) => {
              if (j) state.write(' | ')
              const paras = [...Array(cell.childCount).keys()].map((k) => cell.child(k)).filter((p) => p.childCount)
              paras.forEach((p, k) => {
                if (k) state.write('<br>')
                state.renderInline(p)
              })
            })
            state.write(' |')
            state.ensureNewLine()
            if (i === 0) {
              const delim: string[] = []
              row.forEach((cell) => {
                const a = cell.attrs.align
                delim.push(a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---')
              })
              state.write(`| ${delim.join(' | ')} |`)
              state.ensureNewLine()
            }
          })
          state.closeBlock(node)
          state.inTable = false
        }
      }
    }
  }
})

// ---------- Callout 与 #标签 的显示装饰（不改动文档内容） ----------

function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'blockquote') {
      const m = node.firstChild?.textContent.match(/^\[!([\w-]+)\]/)
      if (m) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: `callout callout-${m[1].toLowerCase()}` }))
    }
    if (node.isText && node.text && !node.marks.some((mk) => mk.type.name === 'code')) {
      for (const m of node.text.matchAll(/(^|\s)(#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)) {
        const start = pos + (m.index ?? 0) + m[1].length
        decos.push(Decoration.inline(start, start + m[2].length, { class: 'tag' }))
      }
    }
  })
  return DecorationSet.create(doc, decos)
}

const ObsidianDecorations = Extension.create({
  name: 'obsidianDecorations',
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>('obsidianDecorations')
    return [
      new Plugin({
        key,
        state: {
          init: (_c, state) => buildDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old)
        },
        props: { decorations: (state) => key.getState(state) }
      })
    ]
  }
})

// ---------- Obsidian 语法接入 markdown-it ----------

/**
 * 解析时保留了空白（见 PARSE_OPTIONS），这里清掉 markdown-it 在列表/表格结构间插入的排版空白，
 * 以及待办复选框后的那个空格，只保留真正属于正文的空格。
 */
function cleanListWhitespace(root: HTMLElement): void {
  const BLOCK = /^(UL|OL|LI|P|TABLE|THEAD|TBODY|TR|TD|TH|BLOCKQUOTE|PRE|H[1-6]|DIV|HR)$/
  root.querySelectorAll('ul, ol, li, table, thead, tbody, tr, blockquote').forEach((el) => {
    for (const n of [...el.childNodes]) {
      if (n.nodeType !== 3) continue
      const prev = n.previousSibling as HTMLElement | null
      const next = n.nextSibling as HTMLElement | null
      let t = n.textContent ?? ''
      if (!prev || BLOCK.test(prev.nodeName) || prev.nodeName === 'INPUT') t = t.replace(/^\s+/, '')
      if (!next || BLOCK.test(next.nodeName)) t = t.replace(/\s+$/, '')
      if (t) n.textContent = t
      else n.remove()
    }
  })
}

const ObsidianSyntax = Extension.create({
  name: 'obsidianSyntax',
  addStorage() {
    return { markdown: { parse: { setup: (md: any) => obsidianMarkdownIt(md), updateDOM: cleanListWhitespace } } }
  }
})

/** 解析时保留连续空格/行首空格（命令行参数、对齐文本常见） */
export const PARSE_OPTIONS = { preserveWhitespace: 'full' as const }

export function createExtensions(placeholder = '输入 / 唤出插入菜单，或直接粘贴图片、表格……') {
  return [
    StarterKit.configure({
      text: false,
      code: false,
      hardBreak: false,
      codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
      heading: { levels: [1, 2, 3, 4, 5, 6] }
    }),
    ObsidianText,
    InlineCode,
    SoftHardBreak,
    Underline,
    MdTextStyle,
    FontSize,
    RawColor,
    ObsidianHighlight,
    TightTaskList,
    Link.configure({ openOnClick: false, autolink: true }),
    VaultImage,
    TaskList,
    TaskItem.configure({ nested: true }),
    MarkdownTable.configure({ resizable: true, cellMinWidth: 60 }),
    TableRow,
    AlignedHeader,
    AlignedCell,
    WikiLink,
    MathInline,
    MathBlock,
    RawHtml,
    ObsidianDecorations,
    ObsidianSyntax,
    SlashCommand,
    Placeholder.configure({ placeholder }),
    Markdown.configure({
      html: true,
      tightLists: true,
      bulletListMarker: '-',
      linkify: false,
      breaks: false,
      transformPastedText: true,
      transformCopiedText: true
    })
  ]
}

