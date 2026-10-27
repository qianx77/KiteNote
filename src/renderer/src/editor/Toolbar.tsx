import type { Editor } from '@tiptap/core'
import { useState } from 'react'
import { askText } from '../ui'
import { insertCallout, insertMath, insertWikiLink } from './slash'

const COLORS = ['#000000', '#595959', '#d4380d', '#fa8c16', '#d4b106', '#389e0d', '#13c2c2', '#1677ff', '#722ed1', '#eb2f96']
const BG = ['#fff1b8', '#ffd8bf', '#ffccc7', '#d9f7be', '#b5f5ec', '#bae0ff', '#efdbff', '#f0f0f0']
const SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px']
const CALLOUTS = ['note', 'tip', 'info', 'warning', 'danger', 'success', 'question', 'example', 'quote']

function Btn(props: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`tb-btn${props.active ? ' active' : ''}`}
      title={props.title}
      disabled={props.disabled}
      onMouseDown={(e) => {
        e.preventDefault()
        props.onClick()
      }}
    >
      {props.children}
    </button>
  )
}

function Palette(props: { title: string; label: React.ReactNode; colors: string[]; onPick: (c: string | null) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="tb-drop" onMouseLeave={() => setOpen(false)}>
      <Btn title={props.title} onClick={() => setOpen(!open)}>
        {props.label}
      </Btn>
      {open && (
        <div className="tb-palette">
          {props.colors.map((c) => (
            <span
              key={c}
              className="swatch"
              style={{ background: c }}
              onMouseDown={(e) => {
                e.preventDefault()
                props.onPick(c)
                setOpen(false)
              }}
            />
          ))}
          <span
            className="swatch none"
            title="清除"
            onMouseDown={(e) => {
              e.preventDefault()
              props.onPick(null)
              setOpen(false)
            }}
          >
            ⊘
          </span>
        </div>
      )}
    </span>
  )
}

export function Toolbar({ editor, onPickImage }: { editor: Editor; onPickImage: () => void }) {
  const level = [1, 2, 3, 4, 5, 6].find((l) => editor.isActive('heading', { level: l }))
  const inTable = editor.isActive('table')
  const img = editor.isActive('image')
  const chain = () => editor.chain().focus()

  const setLink = async (): Promise<void> => {
    const prev = editor.getAttributes('link').href ?? ''
    const url = await askText('链接地址（留空则移除链接）', prev || 'https://')
    if (url === null) return
    if (!url || url === 'https://') chain().unsetLink().run()
    else if (editor.state.selection.empty) chain().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    else chain().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="toolbar">
      <Btn title="撤销 Ctrl+Z" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}>↶</Btn>
      <Btn title="重做 Ctrl+Y" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}>↷</Btn>
      <span className="tb-sep" />
      <select
        className="tb-select"
        title="段落样式"
        value={level ? String(level) : '0'}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v) chain().setHeading({ level: v as 1 | 2 | 3 | 4 | 5 | 6 }).run()
          else chain().setParagraph().run()
        }}
      >
        <option value="0">正文</option>
        <option value="1">标题 1</option>
        <option value="2">标题 2</option>
        <option value="3">标题 3</option>
        <option value="4">标题 4</option>
        <option value="5">标题 5</option>
      </select>
      <select
        className="tb-select"
        title="字号（以 HTML 保存，Obsidian 中同样显示）"
        value={editor.getAttributes('textStyle').fontSize ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v) chain().setMark('textStyle', { fontSize: v }).run()
          else chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
        }}
      >
        <option value="">字号</option>
        {SIZES.map((s) => (
          <option key={s} value={s}>{parseInt(s)}</option>
        ))}
      </select>
      <span className="tb-sep" />
      <Btn title="加粗 Ctrl+B" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}><b>B</b></Btn>
      <Btn title="斜体 Ctrl+I" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="下划线 Ctrl+U" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}><u>U</u></Btn>
      <Btn title="删除线" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}><s>S</s></Btn>
      <Btn title="行内代码" active={editor.isActive('code')} onClick={() => chain().toggleCode().run()}>{'</>'}</Btn>
      <Palette
        title="文字颜色"
        label={<span style={{ borderBottom: `3px solid ${editor.getAttributes('textStyle').color ?? '#d4380d'}` }}>A</span>}
        colors={COLORS}
        onPick={(c) => (c ? chain().setColor(c).run() : chain().unsetColor().run())}
      />
      <Palette
        title="背景高亮（默认黄色保存为 ==高亮==）"
        label={<span className="hl-icon">H</span>}
        colors={BG}
        onPick={(c) => {
          if (!c) chain().unsetHighlight().run()
          else if (c === BG[0]) chain().unsetHighlight().setHighlight().run()
          else chain().setHighlight({ color: c }).run()
        }}
      />
      <Btn title="清除格式" onClick={() => chain().unsetAllMarks().run()}>⌫</Btn>
      <span className="tb-sep" />
      <Btn title="无序列表" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>•≡</Btn>
      <Btn title="有序列表" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>1≡</Btn>
      <Btn title="待办清单" active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()}>☑</Btn>
      <Btn title="引用" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>❝</Btn>
      <select
        className="tb-select"
        title="插入 Callout 提示框"
        value=""
        onChange={(e) => e.target.value && insertCallout(editor, e.target.value)}
      >
        <option value="">提示框</option>
        {CALLOUTS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <Btn title="代码块" active={editor.isActive('codeBlock')} onClick={() => chain().toggleCodeBlock().run()}>{'{ }'}</Btn>
      <Btn title="分割线" onClick={() => chain().setHorizontalRule().run()}>―</Btn>
      <span className="tb-sep" />
      <Btn title="插入表格" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞ 表格</Btn>
      <Btn title="插入/编辑链接" active={editor.isActive('link')} onClick={setLink}>🔗</Btn>
      <Btn title="双链到其他笔记 [[ ]]" onClick={() => insertWikiLink(editor)}>[[ ]]</Btn>
      <Btn title="插入图片（也可直接粘贴/拖入）" onClick={onPickImage}>🖼</Btn>
      <Btn title="行内公式" onClick={() => insertMath(editor, false)}>∑</Btn>
      <Btn title="块级公式" onClick={() => insertMath(editor, true)}>∑∑</Btn>
      {inTable && (
        <div className="toolbar-sub">
          <span className="sub-label">表格：</span>
          <Btn title="上方插入行" onClick={() => chain().addRowBefore().run()}>↑+行</Btn>
          <Btn title="下方插入行" onClick={() => chain().addRowAfter().run()}>↓+行</Btn>
          <Btn title="左侧插入列" onClick={() => chain().addColumnBefore().run()}>←+列</Btn>
          <Btn title="右侧插入列" onClick={() => chain().addColumnAfter().run()}>→+列</Btn>
          <Btn title="删除行" onClick={() => chain().deleteRow().run()}>−行</Btn>
          <Btn title="删除列" onClick={() => chain().deleteColumn().run()}>−列</Btn>
          <Btn title="左对齐" onClick={() => chain().setCellAttribute('align', 'left').run()}>⇤</Btn>
          <Btn title="居中" onClick={() => chain().setCellAttribute('align', 'center').run()}>↔</Btn>
          <Btn title="右对齐" onClick={() => chain().setCellAttribute('align', 'right').run()}>⇥</Btn>
          <Btn title="合并单元格（保存为 HTML 表格）" onClick={() => chain().mergeCells().run()}>合并</Btn>
          <Btn title="拆分单元格" onClick={() => chain().splitCell().run()}>拆分</Btn>
          <Btn title="删除表格" onClick={() => chain().deleteTable().run()}>删表</Btn>
        </div>
      )}
      {img && (
        <div className="toolbar-sub">
          <span className="sub-label">图片宽度：</span>
          {[200, 400, 600, 800].map((w) => (
            <Btn key={w} title={`${w}px`} onClick={() => chain().updateAttributes('image', { width: String(w) }).run()}>{w}</Btn>
          ))}
          <Btn title="原始大小" onClick={() => chain().updateAttributes('image', { width: null }).run()}>原始</Btn>
        </div>
      )}
    </div>
  )
}
