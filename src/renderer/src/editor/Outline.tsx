import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'

interface Heading {
  level: number
  text: string
  pos: number
  end: number
}

function collectHeadings(editor: Editor): Heading[] {
  const list: Heading[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      list.push({ level: node.attrs.level, text: node.textContent.trim() || '（空标题）', pos, end: pos + node.nodeSize - 1 })
      return false
    }
    // 标题只出现在顶层或引用/Callout 内，不进入段落等文本块
    return !node.isTextblock
  })
  return list
}

/** 右侧目录：列出当前笔记的标题，点击跳转，滚动时高亮当前所在章节 */
export function Outline({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const headings = collectHeadings(editor)
  const [active, setActive] = useState(-1)
  const key = headings.map((h) => h.pos).join(',')

  useEffect(() => {
    if (!container) return
    const update = (): void => {
      const top = container.getBoundingClientRect().top + 40
      let idx = -1
      headings.forEach((h, i) => {
        const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null
        if (dom && dom.getBoundingClientRect().top <= top) idx = i
      })
      // 滚到底部时高亮最后一个标题
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2 && headings.length) idx = headings.length - 1
      setActive(idx)
    }
    update()
    container.addEventListener('scroll', update, { passive: true })
    return () => container.removeEventListener('scroll', update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, key])

  const jump = (h: Heading): void => {
    const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null
    if (!dom || !container) return
    const offset = dom.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTo({ top: container.scrollTop + offset - 16, behavior: 'smooth' })
    editor.chain().setTextSelection(h.end).focus(undefined, { scrollIntoView: false }).run()
  }

  const minLevel = Math.min(...headings.map((h) => h.level))
  return (
    <aside className="outline">
      <div className="outline-head">目录</div>
      {headings.length === 0 && <div className="outline-empty">用工具栏或 / 菜单插入标题后，这里会显示目录</div>}
      {headings.map((h, i) => (
        <div
          key={h.pos}
          className={`outline-item l${h.level - minLevel + 1}${i === active ? ' active' : ''}`}
          style={{ paddingLeft: 8 + (h.level - minLevel) * 14 }}
          title={h.text}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => jump(h)}
        >
          {h.text}
        </div>
      ))}
    </aside>
  )
}
