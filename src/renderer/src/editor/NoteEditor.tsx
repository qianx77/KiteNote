/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { createExtensions, PARSE_OPTIONS } from './extensions'
import { Toolbar } from './Toolbar'
import { frontmatterField, joinFrontmatter, parseContext, splitFrontmatter } from './markdownIt'
import { copyFragment, dataUrlToBlob, markdownFromHtml, saveFileAsNode } from './clipboard'
import { askText, showImageViewer, showMenu, toast } from '../ui'
import { copyLinkText } from '../links'
import { vaultIndex } from '../vaultIndex'
import { CellSelection } from '@tiptap/pm/tables'
import { TableHover, tableMenuItems } from './TableTools'
import { Outline } from './Outline'

const OUTLINE_KEY = 'labnote.outline'
const readOutlinePref = (): boolean => {
  try {
    return localStorage.getItem(OUTLINE_KEY) !== '0'
  } catch {
    return true
  }
}

/** 图片文件名，用于原图查看器标题 */
const imageTitle = (src: string): string => {
  try {
    return decodeURIComponent(new URL(src).pathname).split('/').pop() ?? ''
  } catch {
    return ''
  }
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const norm = (s: string): string => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n\n').trim()

interface Props {
  path: string
  onOpenLink: (target: string, from: string) => void
}

/** 笔记页：负责读写文件、frontmatter、源码/富文本切换；富文本编辑器每次加载时重新创建以保证撤销栈干净 */
export function NoteEditor({ path, onOpenLink }: Props) {
  const [loaded, setLoaded] = useState<{ text: string; nonce: number } | null>(null)
  const [mode, setMode] = useState<'rich' | 'source'>('rich')
  const [frontmatter, setFrontmatter] = useState('')
  const [body, setBody] = useState('')
  const [source, setSource] = useState('')
  const [status, setStatus] = useState<SaveState>('saved')
  const [showProps, setShowProps] = useState(false)
  const [normalized, setNormalized] = useState(false)
  const [showOutline, setShowOutline] = useState(readOutlinePref)
  const lastSaved = useRef('')
  const trailingNl = useRef(true)
  const eol = useRef('\n')
  const getText = useRef<() => string>(() => lastSaved.current)
  const timer = useRef<number | null>(null)
  const statusRef = useRef<SaveState>('saved')
  statusRef.current = status

  const load = useCallback(async () => {
    const text = await window.api.readFile(path)
    lastSaved.current = text
    trailingNl.current = /\n$/.test(text) || text === ''
    eol.current = text.includes('\r\n') ? '\r\n' : '\n'
    const lf = text.replace(/\r\n/g, '\n')
    const fm = splitFrontmatter(lf)
    setFrontmatter(fm.frontmatter)
    setBody(fm.body)
    setSource(lf)
    setStatus('saved')
    setLoaded((l) => ({ text, nonce: (l?.nonce ?? 0) + 1 }))
  }, [path])

  useEffect(() => {
    load().catch((e) => toast(`打开失败：${e}`))
  }, [load])

  const saveNow = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    let text = getText.current()
    if (trailingNl.current && !text.endsWith('\n')) text += '\n'
    if (eol.current === '\r\n') text = text.replace(/\r?\n/g, '\r\n')
    if (text === lastSaved.current) {
      setStatus('saved')
      return
    }
    setStatus('saving')
    try {
      await window.api.writeFile(path, text)
      lastSaved.current = text
      setStatus('saved')
    } catch (e) {
      setStatus('error')
      toast(`保存失败：${e}`)
    }
  }, [path])

  const scheduleSave = useCallback(() => {
    setStatus('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void saveNow(), 600)
  }, [saveNow])

  // 离开页面时立即保存
  useEffect(() => () => void (timer.current && saveNow()), [saveNow])

  // 外部（同步盘 / Obsidian）修改了当前文件：未编辑时自动重新加载
  useEffect(
    () =>
      window.api.onVaultChanged(async (paths) => {
        if (!paths.includes(path) || statusRef.current !== 'saved') return
        try {
          const text = await window.api.readFile(path)
          if (text !== lastSaved.current) {
            await load()
            toast('文件已在外部更新，已重新加载')
          }
        } catch {
          /* 文件被删除 */
        }
      }),
    [path, load]
  )

  const switchMode = (): void => {
    if (mode === 'rich') {
      setSource(getText.current())
      setMode('source')
    } else {
      const fm = splitFrontmatter(source)
      setFrontmatter(fm.frontmatter)
      setBody(fm.body)
      setLoaded((l) => (l ? { ...l, nonce: l.nonce + 1 } : l))
      setMode('rich')
    }
  }

  if (mode === 'source') getText.current = () => source

  const taskLink = frontmatterField(frontmatter, 'task')?.replace(/^\[\[|\]\]$/g, '')

  return (
    <div className="note">
      <div className="note-header">
        <div className="note-path" title={path}>{path.replace(/\.md$/, '')}</div>
        {taskLink && (
          <button className="chip" title="打开关联的任务清单" onClick={() => onOpenLink(taskLink, path)}>
            ↩ 关联任务 {taskLink.split('/').pop()}
          </button>
        )}
        {normalized && mode === 'rich' && (
          <span className="chip warn" title="此笔记中有部分写法（如多余空行、* 列表符、setext 标题）在可视化编辑并保存后会被规范化。内容不会丢失；如需保持原样，请切到源码模式编辑。打开但不编辑不会改动文件。">
            ⚠ 保存时会规范化格式
          </span>
        )}
        <span className={`save-state ${status}`}>
          {{ saved: '已保存', dirty: '编辑中…', saving: '保存中…', error: '保存失败' }[status]}
        </span>
        <button className="btn small" onClick={() => setShowProps(!showProps)} title="编辑 YAML 属性（frontmatter）">属性</button>
        {mode === 'rich' && (
          <button
            className={`btn small${showOutline ? ' on' : ''}`}
            title="显示/隐藏右侧目录"
            onClick={() => {
              setShowOutline(!showOutline)
              try {
                localStorage.setItem(OUTLINE_KEY, showOutline ? '0' : '1')
              } catch {
                /* 忽略 */
              }
            }}
          >
            目录
          </button>
        )}
        <button className="btn small" onClick={switchMode}>{mode === 'rich' ? '源码模式' : '所见即所得'}</button>
        <button
          className="btn small"
          title="复制本笔记的 [[链接]]，粘贴到其他笔记即为双链"
          onClick={() => copyLinkText(vaultIndex.linkText(path)).then((m) => toast(`已复制 ${m}`))}
        >
          复制链接
        </button>
        <button className="btn small" onClick={() => window.api.reveal(path)} title="在资源管理器中显示">📂</button>
      </div>
      {showProps && mode === 'rich' && (
        <textarea
          className="frontmatter"
          spellCheck={false}
          value={frontmatter}
          placeholder={'---\ntags: [实验]\n---'}
          onChange={(e) => {
            setFrontmatter(e.target.value)
            scheduleSave()
          }}
        />
      )}
      {mode === 'source' ? (
        <textarea
          className="source-editor"
          spellCheck={false}
          value={source}
          onChange={(e) => {
            setSource(e.target.value)
            scheduleSave()
          }}
        />
      ) : (
        loaded && (
          <RichEditor
            key={`${path}#${loaded.nonce}`}
            path={path}
            body={body}
            frontmatterRef={frontmatter}
            onOpenLink={onOpenLink}
            onChange={scheduleSave}
            onBlur={() => void (statusRef.current === 'dirty' && saveNow())}
            bindGetter={(fn) => (getText.current = fn)}
            onNormalizedCheck={(md) => setNormalized(norm(md) !== norm(body))}
            showOutline={showOutline}
          />
        )
      )}
    </div>
  )
}

interface RichProps {
  path: string
  body: string
  frontmatterRef: string
  onOpenLink: (target: string, from: string) => void
  onChange: () => void
  onBlur: () => void
  bindGetter: (fn: () => string) => void
  onNormalizedCheck: (md: string) => void
  showOutline: boolean
}

function RichEditor({ path, body, frontmatterRef, onOpenLink, onChange, onBlur, bindGetter, onNormalizedCheck, showOutline }: RichProps) {
  const editorRef = useRef<Editor | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const fmRef = useRef(frontmatterRef)
  fmRef.current = frontmatterRef
  const converting = useRef(new Set<string>())
  parseContext.notePath = path

  const insertFiles = async (files: File[], pos?: number): Promise<void> => {
    const ed = editorRef.current
    if (!ed || !files.length) return
    try {
      const nodes = []
      for (const f of files) nodes.push(await saveFileAsNode(f, path, f.name))
      if (pos !== undefined) ed.chain().focus().insertContentAt(pos, nodes).run()
      else ed.chain().focus().insertContent(nodes).run()
    } catch (e) {
      toast(`保存附件失败：${e}`)
    }
  }

  /** 从网页/钉钉粘贴进来的 base64 图片，自动落盘为附件，避免 md 文件里出现超长 data URL */
  const convertDataImages = (ed: Editor): void => {
    ed.state.doc.descendants((node: PMNode) => {
      const src: string = node.type.name === 'image' ? node.attrs.src ?? '' : ''
      if (!src.startsWith('data:image/') || converting.current.has(src)) return
      converting.current.add(src)
      dataUrlToBlob(src)
        .then((blob) => saveFileAsNode(blob, path))
        .then((json) => {
          ed.state.doc.descendants((n, p) => {
            if (n.type.name === 'image' && n.attrs.src === src) {
              ed.view.dispatch(ed.state.tr.setNodeMarkup(p, undefined, { ...n.attrs, ...json.attrs }))
              return false
            }
            return true
          })
        })
        .catch(() => converting.current.delete(src))
    })
  }

  const editor = useEditor({
    extensions: createExtensions(),
    content: body,
    parseOptions: PARSE_OPTIONS,
    shouldRerenderOnTransaction: true,
    onCreate: ({ editor }) => {
      editorRef.current = editor as Editor
      const getMd = (): string =>
        joinFrontmatter(fmRef.current, ((editor.storage as any).markdown.getMarkdown() as string).replace(/\n+$/, ''))
      bindGetter(getMd)
      onNormalizedCheck((editor.storage as any).markdown.getMarkdown())
    },
    onUpdate: ({ editor }) => {
      onChange()
      convertDataImages(editor as Editor)
    },
    onBlur: () => onBlur(),
    editorProps: {
      // 双链：单击只选中（可复制/删除），双击或 Ctrl+单击 打开；双击图片查看原图
      handleDoubleClickOn: (_view, _pos, node, _nodePos, _event, direct) => {
        if (direct && node.type.name === 'wikiLink') {
          onOpenLink(node.attrs.target, path)
          return true
        }
        if (direct && node.type.name === 'image' && node.attrs.src) {
          showImageViewer(node.attrs.src, imageTitle(node.attrs.src))
          return true
        }
        return false
      },
      handleClickOn: (_view, _pos, node, _nodePos, event, direct) => {
        if (direct && node.type.name === 'wikiLink' && (event.ctrlKey || event.metaKey)) {
          onOpenLink(node.attrs.target, path)
          return true
        }
        return false
      },
      handleClick: (view, pos, event) => {
        const link = view.state.doc.resolve(pos).marks().find((m) => m.type.name === 'link')
        if (link && (event.ctrlKey || event.metaKey)) {
          window.api.openExternal(link.attrs.href)
          return true
        }
        return false
      },
      handlePaste: (view, event) => {
        const dt = event.clipboardData
        if (!dt) return false
        // 从本软件复制的内容：按原始 Markdown 还原（双链、公式、待办都保持可用）
        const md = view.state.selection.$from.parent.type.spec.code ? null : markdownFromHtml(dt.getData('text/html'))
        if (md !== null) {
          event.preventDefault()
          editorRef.current?.chain().focus().insertContent(md.replace(/\n+$/, '')).run()
          return true
        }
        const files = [...dt.files]
        if (!files.length) return false
        const html = dt.getData('text/html')
        const text = dt.getData('text/plain')
        const htmlText = html.replace(/<img[^>]*>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '')
        // 带文字的富文本（如 Word/网页段落）走默认粘贴；纯图片（截图、复制图片）保存为本地附件
        if (htmlText || (!html && text.trim())) return false
        event.preventDefault()
        void insertFiles(files)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])]
        if (moved || !files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertFiles(files, pos)
        return true
      },
      handleDOMEvents: {
        copy: (view, event) => {
          const sel = view.state.selection
          if (sel.empty || sel.$from.parent.type.spec.code) return false
          event.preventDefault()
          void copyFragment(editorRef.current!, sel.content().content)
          return true
        },
        cut: (view, event) => {
          const sel = view.state.selection
          if (sel.empty || sel.$from.parent.type.spec.code) return false
          event.preventDefault()
          void copyFragment(editorRef.current!, sel.content().content)
          view.dispatch(view.state.tr.deleteSelection())
          return true
        },
        contextmenu: (view, event) => {
          const t = event.target as HTMLElement
          const wl = t.closest('[data-wikilink]') as HTMLElement | null
          if (wl) {
            event.preventDefault()
            const ed = editorRef.current!
            const pos = view.posAtDOM(wl, 0)
            const node = view.state.doc.nodeAt(pos)
            if (!node || node.type.name !== 'wikiLink') return true
            const { target, alias, embed } = node.attrs
            const setAttrs = (attrs: Record<string, unknown>): void => {
              ed.chain().focus().command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
                return true
              }).run()
            }
            showMenu(event.clientX, event.clientY, [
              { label: '打开笔记', action: () => onOpenLink(target, path) },
              { label: '复制链接', action: () => copyLinkText(target, alias, embed).then((m) => toast(`已复制 ${m}`)) },
              { separator: true, label: '' },
              { label: '修改显示文字…', action: async () => {
                const v = await askText('链接显示的文字（留空则显示笔记名）', alias || '')
                if (v !== null) setAttrs({ alias: v.trim() })
              } },
              { label: '修改链接目标…', action: async () => {
                const notes = vaultIndex.files.filter((f) => f.path.endsWith('.md')).map((f) => f.path.slice(0, -3))
                const v = await askText('链接到笔记', target, { suggestions: notes })
                if (v?.trim()) setAttrs({ target: v.trim() })
              } },
              { label: '移除链接（保留文字）', action: () => {
                ed.chain().focus().command(({ tr }) => {
                  tr.replaceWith(pos, pos + node.nodeSize, view.state.schema.text(alias || target))
                  return true
                }).run()
              } }
            ])
            return true
          }
          if (t.closest('td, th') && t.tagName !== 'IMG') {
            // 右键表格：先把光标移到点击的单元格，再弹出表格菜单
            event.preventDefault()
            const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
            const ed = editorRef.current!
            if (hit && !(view.state.selection instanceof CellSelection)) ed.commands.setTextSelection(hit.pos)
            showMenu(event.clientX, event.clientY, tableMenuItems(ed))
            return true
          }
          if (t.tagName !== 'IMG') return false
          const src = (t as HTMLImageElement).src
          if (!src.startsWith('vault://')) return false
          event.preventDefault()
          const rel = decodeURIComponent(new URL(src).pathname.slice(1))
          showMenu(event.clientX, event.clientY, [
            { label: '查看原图', action: () => showImageViewer(src, imageTitle(src)) },
            { label: '复制图片', action: () => window.api.copyImage(rel).then(() => toast('图片已复制，可粘贴到钉钉/微信')) },
            { label: '在文件夹中显示', action: () => window.api.reveal(rel) }
          ])
          return true
        }
      }
    }
  })

  useEffect(() => {
    const pick = (): void => fileInput.current?.click()
    window.addEventListener('labnote:pick-image', pick)
    return () => window.removeEventListener('labnote:pick-image', pick)
  }, [])

  if (!editor) return null
  return (
    <>
      <div className="toolbar-wrap">
        <Toolbar editor={editor as Editor} onPickImage={() => fileInput.current?.click()} />
        <button
          className="btn small copy-all"
          title="复制整篇为富文本（图片内嵌），可直接粘贴到钉钉文档 / 飞书 / Word"
          onClick={() => copyFragment(editor as Editor, editor.state.doc.content).then(() => toast('已复制整篇，可粘贴到钉钉文档'))}
        >
          复制到钉钉
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void insertFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <div className="editor-body">
        <div ref={setScrollEl} className="editor-scroll" onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
          <EditorContent editor={editor} className="editor-content" />
          <TableHover editor={editor as Editor} container={scrollEl} />
        </div>
        {showOutline && <Outline editor={editor as Editor} container={scrollEl} />}
      </div>
    </>
  )
}
