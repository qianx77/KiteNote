/* eslint-disable @typescript-eslint/no-explicit-any */
import { Extension, Editor, Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { askText } from '../ui'
import { vaultIndex } from '../vaultIndex'

export interface SlashItem {
  title: string
  hint: string
  keys: string
  run: (editor: Editor) => void
}

export async function insertWikiLink(editor: Editor): Promise<void> {
  const notes = vaultIndex.files.filter((f) => f.path.endsWith('.md')).map((f) => f.path.slice(0, -3))
  const target = await askText('链接到笔记（可输入新名字，点击时自动创建）', '', { suggestions: notes })
  if (!target) return
  editor.chain().focus().insertContent({ type: 'wikiLink', attrs: { target: target.trim(), alias: '' } }).insertContent(' ').run()
}

export async function insertMath(editor: Editor, block: boolean): Promise<void> {
  const tex = await askText(block ? '块级公式（LaTeX）' : '行内公式（LaTeX）', block ? '\\mathcal{L} = -\\sum_i y_i \\log \\hat{y}_i' : 'x^2', { multiline: block })
  if (!tex) return
  editor.chain().focus().insertContent(block ? { type: 'mathBlock', attrs: { tex } } : { type: 'mathInline', attrs: { tex } }).run()
}

export function insertCallout(editor: Editor, type = 'note'): void {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: `[!${type}] 标题` }, { type: 'hardBreak', attrs: { soft: true } }, { type: 'text', text: '内容' }]
        }
      ]
    })
    .run()
}

export const SLASH_ITEMS: SlashItem[] = [
  { title: '一级标题', hint: '# ', keys: 'h1 bt', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: '二级标题', hint: '## ', keys: 'h2 bt', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: '三级标题', hint: '### ', keys: 'h3 bt', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: '无序列表', hint: '- ', keys: 'ul list lb', run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: '有序列表', hint: '1. ', keys: 'ol list lb', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: '待办清单', hint: '- [ ] ', keys: 'todo task db', run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: '表格', hint: '3×3', keys: 'table bg', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: '引用', hint: '> ', keys: 'quote yy', run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: '提示框 Callout', hint: '> [!note]', keys: 'callout tsk', run: (e) => insertCallout(e, 'note') },
  { title: '警告框 Callout', hint: '> [!warning]', keys: 'warning jg', run: (e) => insertCallout(e, 'warning') },
  { title: '代码块', hint: '```', keys: 'code dmk', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: '分割线', hint: '---', keys: 'hr fgx', run: (e) => e.chain().focus().setHorizontalRule().run() },
  { title: '双链 [[ ]]', hint: '[[笔记]]', keys: 'link wiki sl', run: (e) => void insertWikiLink(e) },
  { title: '行内公式', hint: '$x$', keys: 'math gs', run: (e) => void insertMath(e, false) },
  { title: '块级公式', hint: '$$', keys: 'math gs', run: (e) => void insertMath(e, true) },
  { title: '图片', hint: '从文件插入', keys: 'image tp', run: () => window.dispatchEvent(new CustomEvent('labnote:pick-image')) }
]

function createMenu() {
  let el: HTMLDivElement | null = null
  let items: SlashItem[] = []
  let active = 0
  let command: ((item: SlashItem) => void) | null = null

  const draw = (): void => {
    if (!el) return
    el.innerHTML = ''
    if (!items.length) {
      el.innerHTML = '<div class="slash-empty">无匹配项</div>'
      return
    }
    items.forEach((it, i) => {
      const row = document.createElement('div')
      row.className = 'slash-item' + (i === active ? ' active' : '')
      row.innerHTML = `<span></span><code></code>`
      row.children[0].textContent = it.title
      row.children[1].textContent = it.hint
      row.onmousedown = (e) => {
        e.preventDefault()
        command?.(it)
      }
      el!.appendChild(row)
    })
    el.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }
  const place = (rect: DOMRect | null): void => {
    if (!el || !rect) return
    el.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`
    const below = rect.bottom + 6
    el.style.top = below + 300 > window.innerHeight ? `${Math.max(8, rect.top - 306)}px` : `${below}px`
  }
  return {
    onStart: (props: any) => {
      el = document.createElement('div')
      el.className = 'slash-menu'
      document.body.appendChild(el)
      items = props.items
      active = 0
      command = props.command
      draw()
      place(props.clientRect?.())
    },
    onUpdate: (props: any) => {
      items = props.items
      active = 0
      command = props.command
      draw()
      place(props.clientRect?.())
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowDown') {
        active = (active + 1) % Math.max(items.length, 1)
        draw()
        return true
      }
      if (event.key === 'ArrowUp') {
        active = (active - 1 + items.length) % Math.max(items.length, 1)
        draw()
        return true
      }
      if (event.key === 'Enter' && items[active]) {
        command?.(items[active])
        return true
      }
      if (event.key === 'Escape') {
        el?.remove()
        el = null
        return true
      }
      return false
    },
    onExit: () => {
      el?.remove()
      el = null
    }
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allowSpaces: false,
        allow: ({ state }: any) => !state.selection.$from.parent.type.spec.code,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return SLASH_ITEMS.filter((i) => !q || i.title.toLowerCase().includes(q) || i.keys.includes(q))
        },
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          editor.chain().focus().deleteRange(range).run()
          props.run(editor)
        },
        render: createMenu
      })
    ]
  }
})
