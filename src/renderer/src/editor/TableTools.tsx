import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { CellSelection } from '@tiptap/pm/tables'
import { showMenu, type MenuItem } from '../ui'

/** 找到光标所在表格的位置与节点 */
export function currentTable(editor: Editor): { pos: number; node: PMNode } | null {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'table') return { pos: $from.before(d), node }
  }
  return null
}

/** 清除手动拖动的列宽，表格恢复为标准 Markdown 表格保存 */
function resetWidths(editor: Editor): void {
  const t = currentTable(editor)
  if (!t) return
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      t.node.descendants((n, p) => {
        if (n.attrs.colwidth) tr.setNodeMarkup(t.pos + 1 + p, undefined, { ...n.attrs, colwidth: null })
      })
      return true
    })
    .run()
}

const align = (editor: Editor, a: string): void => {
  editor.chain().focus().setCellAttribute('align', a).run()
}

function tableItems(editor: Editor): MenuItem[] {
  const c = () => editor.chain().focus()
  return [
    { label: '合并选中单元格', action: () => c().mergeCells().run() },
    { label: '拆分单元格', action: () => c().splitCell().run() },
    { label: '恢复平均列宽', action: () => resetWidths(editor) },
    { label: '切换首行表头', action: () => c().toggleHeaderRow().run() },
    { separator: true, label: '' },
    { label: '删除表格', danger: true, action: () => c().deleteTable().run() }
  ]
}

/** 单元格右键菜单 */
export function tableMenuItems(editor: Editor): MenuItem[] {
  const c = () => editor.chain().focus()
  return [
    { label: '上方插入行', action: () => c().addRowBefore().run() },
    { label: '下方插入行', action: () => c().addRowAfter().run() },
    { label: '左侧插入列', action: () => c().addColumnBefore().run() },
    { label: '右侧插入列', action: () => c().addColumnAfter().run() },
    { separator: true, label: '' },
    { label: '删除当前行', action: () => c().deleteRow().run() },
    { label: '删除当前列', action: () => c().deleteColumn().run() },
    { separator: true, label: '' },
    { label: '本列左对齐', action: () => align(editor, 'left') },
    { label: '本列居中', action: () => align(editor, 'center') },
    { label: '本列右对齐', action: () => align(editor, 'right') },
    { separator: true, label: '' },
    ...tableItems(editor)
  ]
}

interface Hover {
  cell: HTMLElement
  table: HTMLElement
}

/**
 * 钉钉式表格手柄：鼠标悬停单元格时，在该列上方、该行左侧显示手柄；
 * 点手柄选中整列/整行并弹出菜单，点 ＋ 在此处插入列/行，左上角 ⋯ 为整表操作。
 */
export function TableHover({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const [hover, setHover] = useState<Hover | null>(null)
  const hideTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!container) return
    const onMove = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (t.closest('.tbl-ui')) {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        return
      }
      const cell = t.closest('.ProseMirror td, .ProseMirror th') as HTMLElement | null
      if (cell) {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        const table = cell.closest('table') as HTMLElement
        setHover((h) => (h?.cell === cell ? h : { cell, table }))
      } else if (!hideTimer.current) {
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = null
          setHover(null)
        }, 500)
      }
    }
    const onLeave = (): void => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => {
        hideTimer.current = null
        setHover(null)
      }, 500)
    }
    container.addEventListener('mousemove', onMove)
    container.addEventListener('mouseleave', onLeave)
    return () => {
      container.removeEventListener('mousemove', onMove)
      container.removeEventListener('mouseleave', onLeave)
    }
  }, [container])

  if (!hover || !container || !hover.cell.isConnected || !editor.isEditable) return null
  const view = editor.view
  const outer = container.getBoundingClientRect()
  const rel = (r: DOMRect) => ({
    left: r.left - outer.left + container.scrollLeft,
    top: r.top - outer.top + container.scrollTop,
    width: r.width,
    height: r.height
  })
  const tb = rel(hover.table.getBoundingClientRect())
  const cb = rel(hover.cell.getBoundingClientRect())
  const rb = rel((hover.cell.parentElement as HTMLElement).getBoundingClientRect())

  /** 单元格节点位置（CellSelection 需要指向单元格之前的位置） */
  const cellPos = (): number | null => {
    try {
      const $p = view.state.doc.resolve(view.posAtDOM(hover.cell, 0))
      for (let d = $p.depth; d > 0; d--) {
        const n = $p.node(d).type.name
        if (n === 'tableCell' || n === 'tableHeader') return $p.before(d)
      }
    } catch {
      /* DOM 已变化 */
    }
    return null
  }

  type Kind = 'col' | 'row' | 'cell'
  const selectionFor = (kind: Kind): CellSelection | null => {
    const p = cellPos()
    if (p === null) return null
    const $cell = view.state.doc.resolve(p)
    return kind === 'col' ? CellSelection.colSelection($cell) : kind === 'row' ? CellSelection.rowSelection($cell) : new CellSelection($cell)
  }
  /** 菜单弹出期间高亮目标行/列，下一次点击（选菜单或点别处）后消失 */
  const highlight = (kind: Kind): boolean => {
    if (!selectionFor(kind)) return false
    const box = kind === 'col' ? { left: cb.left, top: tb.top, width: cb.width, height: tb.height } : { left: tb.left, top: rb.top, width: tb.width, height: rb.height }
    const el = document.createElement('div')
    el.className = 'tbl-hl'
    Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
    container.appendChild(el)
    setTimeout(() => document.addEventListener('mouseup', () => setTimeout(() => el.remove(), 0), { once: true }), 0)
    return true
  }
  /** 在同一事务里先选中目标行/列再执行命令，不依赖选区在菜单弹出期间保持 */
  type Chain = ReturnType<Editor['chain']>
  const runOn = (kind: Kind, cmd: (ch: Chain) => Chain) => (): void => {
    const sel = selectionFor(kind)
    if (!sel) return
    cmd(editor.chain().command(({ tr }) => {
      tr.setSelection(sel)
      return true
    }))
      .focus()
      .run()
  }

  const colMenu = (e: React.MouseEvent): void => {
    if (!highlight('col')) return
    showMenu(e.clientX, e.clientY + 8, [
      { label: '左侧插入列', action: runOn('col', (ch) => ch.addColumnBefore()) },
      { label: '右侧插入列', action: runOn('col', (ch) => ch.addColumnAfter()) },
      { separator: true, label: '' },
      { label: '左对齐', action: runOn('col', (ch) => ch.setCellAttribute('align', 'left')) },
      { label: '居中', action: runOn('col', (ch) => ch.setCellAttribute('align', 'center')) },
      { label: '右对齐', action: runOn('col', (ch) => ch.setCellAttribute('align', 'right')) },
      { separator: true, label: '' },
      { label: '删除此列', danger: true, action: runOn('col', (ch) => ch.deleteColumn()) }
    ])
  }
  const rowMenu = (e: React.MouseEvent): void => {
    if (!highlight('row')) return
    showMenu(e.clientX + 8, e.clientY, [
      { label: '上方插入行', action: runOn('row', (ch) => ch.addRowBefore()) },
      { label: '下方插入行', action: runOn('row', (ch) => ch.addRowAfter()) },
      { separator: true, label: '' },
      { label: '删除此行', danger: true, action: runOn('row', (ch) => ch.deleteRow()) }
    ])
  }
  const insertAfter = (kind: 'col' | 'row'): void =>
    runOn('cell', (ch) => (kind === 'col' ? ch.addColumnAfter() : ch.addRowAfter()))()
  const down = (fn: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    fn(e)
  }

  return (
    <>
      <div className="tbl-ui tbl-colbar" title="选中此列 / 列操作" style={{ left: cb.left, top: tb.top - 14, width: cb.width }} onMouseDown={down(colMenu)} />
      <div className="tbl-ui tbl-rowbar" title="选中此行 / 行操作" style={{ left: tb.left - 14, top: rb.top, height: rb.height }} onMouseDown={down(rowMenu)} />
      <div className="tbl-ui tbl-plus" title="在右侧插入一列" style={{ left: cb.left + cb.width - 9, top: tb.top - 34 }} onMouseDown={down(() => insertAfter('col'))}>＋</div>
      <div className="tbl-ui tbl-plus" title="在下方插入一行" style={{ left: tb.left - 34, top: rb.top + rb.height - 9 }} onMouseDown={down(() => insertAfter('row'))}>＋</div>
      <div
        className="tbl-ui tbl-corner"
        title="整个表格"
        style={{ left: tb.left - 14, top: tb.top - 14 }}
        onMouseDown={down((e) => {
          const items = tableItems(editor).map((it) =>
            it.action ? { ...it, action: () => { runOn('cell', (ch) => ch)(); it.action!() } } : it
          )
          showMenu(e.clientX, e.clientY + 8, items)
        })}
      >
        ⋯
      </div>
    </>
  )
}
