import { useMemo, useState } from 'react'
import type { FileEntry } from '../../shared/types'
import { askText, confirmBox, showMenu, toast } from './ui'
import { basename, dirname, IMAGE_EXT } from './vaultIndex'
import { copyNoteLink, folderList, moveWithLinks } from './links'

/** 双击展开时不要选中文字 */
const noSelect = (e: React.MouseEvent): void => {
  if (e.detail > 1) e.preventDefault()
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }
  const dirs = new Map<string, TreeNode>([['', root]])
  const ensure = (p: string): TreeNode => {
    const hit = dirs.get(p)
    if (hit) return hit
    const node: TreeNode = { name: basename(p), path: p, isDir: true, children: [] }
    dirs.set(p, node)
    ensure(dirname(p)).children.push(node)
    return node
  }
  for (const f of files) {
    if (f.isDir) ensure(f.path)
    else ensure(dirname(f.path)).children.push({ name: basename(f.path), path: f.path, isDir: false, children: [] })
  }
  const sort = (n: TreeNode): void => {
    n.children.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) : a.isDir ? -1 : 1))
    n.children.forEach(sort)
  }
  sort(root)
  return root
}

interface Props {
  files: FileEntry[]
  active: string | null
  onOpen: (path: string) => void
  onChanged: () => void
}

export function FileTree({ files, active, onOpen, onChanged }: Props) {
  const tree = useMemo(() => buildTree(files), [files])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  /** 单击选中的文件夹，顶部「＋」新建时放在这里 */
  const [selectedDir, setSelectedDir] = useState('')

  const newNote = async (dir: string): Promise<void> => {
    const name = await askText('新建笔记名称', '未命名')
    if (!name?.trim()) return
    const rel = `${dir ? dir + '/' : ''}${name.trim().replace(/\.md$/, '')}.md`
    if (await window.api.exists(rel)) return toast('同名笔记已存在')
    await window.api.writeFile(rel, '')
    onChanged()
    onOpen(rel)
  }

  const newFolder = async (dir: string): Promise<void> => {
    const name = await askText('新建文件夹名称', '新文件夹')
    if (!name?.trim()) return
    await window.api.createFolder(`${dir ? dir + '/' : ''}${name.trim()}`)
    setOpen((o) => ({ ...o, [dir]: true }))
    onChanged()
  }

  const relocate = async (from: string, to: string): Promise<void> => {
    if (from === to) return
    try {
      const n = await moveWithLinks(from, to, files)
      onChanged()
      if (active && (active === from || active.startsWith(from + '/'))) onOpen(to + active.slice(from.length))
      toast(n ? `已移动，并更新了 ${n} 篇笔记中的链接` : '已移动')
    } catch (e) {
      toast(String(e))
    }
  }

  /** 移动到某个文件夹（拖放或菜单） */
  const move = async (from: string, dir: string): Promise<void> => {
    if (dir === from || dir.startsWith(from + '/') || dirname(from) === dir) return
    await relocate(from, `${dir ? dir + '/' : ''}${basename(from)}`)
    setOpen((o) => ({ ...o, [dir]: true }))
  }

  const rename = async (n: TreeNode): Promise<void> => {
    const name = await askText('重命名（会自动更新指向它的 [[链接]]）', n.isDir ? n.name : n.name.replace(/\.md$/, ''))
    if (!name?.trim()) return
    const ext = !n.isDir && n.name.endsWith('.md') && !name.endsWith('.md') ? '.md' : ''
    await relocate(n.path, `${dirname(n.path) ? dirname(n.path) + '/' : ''}${name.trim()}${ext}`)
  }

  const moveTo = async (n: TreeNode): Promise<void> => {
    const dir = await askText('移动到文件夹（可输入新文件夹名，留空为库根目录）', dirname(n.path), { suggestions: folderList(files) })
    if (dir === null) return
    await move(n.path, dir.trim().replace(/^\/+|\/+$/g, ''))
  }

  const menu = (e: React.MouseEvent, n: TreeNode): void => {
    e.preventDefault()
    e.stopPropagation()
    const dir = n.isDir ? n.path : dirname(n.path)
    showMenu(e.clientX, e.clientY, [
      { label: '新建笔记', action: () => newNote(dir) },
      { label: '新建文件夹', action: () => newFolder(dir) },
      { separator: true, label: '' },
      ...(n.path
        ? [
            ...(!n.isDir
              ? [{ label: '复制链接 [[ ]]', action: () => copyNoteLink(n.path).then((t) => toast(`已复制 ${t}，可粘贴到任意笔记`)) }]
              : []),
            { label: '重命名', action: () => rename(n) },
            { label: '移动到…', action: () => moveTo(n) },
            ...(IMAGE_EXT.test(n.path) ? [{ label: '复制图片', action: () => window.api.copyImage(n.path).then(() => toast('图片已复制')) }] : []),
            { label: '在文件夹中显示', action: () => window.api.reveal(n.path) },
            { separator: true, label: '' },
            {
              label: '删除（移到回收站）',
              danger: true,
              action: async () => {
                if (await confirmBox(`把「${n.name}」移到系统回收站？`)) {
                  await window.api.trash(n.path)
                  onChanged()
                }
              }
            }
          ]
        : [])
    ])
  }

  const render = (n: TreeNode, depth: number): React.ReactNode => {
    if (n.isDir) {
      // 默认只显示一级目录；当前打开的笔记所在目录自动展开
      const isOpen = open[n.path] ?? (!!active && active.startsWith(n.path + '/'))
      return (
        <div key={n.path}>
          <div
            className={`tree-row dir${dropTarget === n.path ? ' drop' : ''}${selectedDir === n.path ? ' selected' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onMouseDown={noSelect}
            onClick={() => {
              setSelectedDir(n.path)
              setOpen({ ...open, [n.path]: !isOpen })
            }}
            onContextMenu={(e) => menu(e, n)}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('kitenote/path', n.path)}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('kitenote/path')) {
                e.preventDefault()
                setDropTarget(n.path)
              }
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDropTarget(null)
              const from = e.dataTransfer.getData('kitenote/path')
              if (from) void move(from, n.path)
            }}
          >
            <span className="caret">{isOpen ? '▾' : '▸'}</span>
            {n.name}
          </div>
          {isOpen && n.children.map((c) => render(c, depth + 1))}
        </div>
      )
    }
    const isMd = n.name.endsWith('.md')
    return (
      <div
        key={n.path}
        className={`tree-row file${active === n.path ? ' active' : ''}${isMd ? '' : ' other'}`}
        style={{ paddingLeft: 22 + depth * 14 }}
        onMouseDown={noSelect}
        onClick={() => onOpen(n.path)}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('kitenote/path', n.path)}
        onContextMenu={(e) => menu(e, n)}
        title={n.path}
      >
        {isMd ? n.name.slice(0, -3) : n.name}
      </div>
    )
  }

  const q = filter.trim().toLowerCase()
  const flat = q ? files.filter((f) => !f.isDir && f.path.toLowerCase().includes(q)).slice(0, 200) : []

  return (
    <div className="tree">
      <div className="tree-tools">
        <input className="tree-filter" placeholder="筛选文件名…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="icon-btn" title={`新建笔记（在 ${selectedDir || '库根目录'}）`} onClick={() => newNote(selectedDir)}>＋</button>
        <button className="icon-btn" title={`新建文件夹（在 ${selectedDir || '库根目录'}）`} onClick={() => newFolder(selectedDir)}>📁</button>
      </div>
      <div
        className={`tree-body${dropTarget === "" ? " drop" : ""}`}
        onContextMenu={(e) => menu(e, tree)}
        onDragOver={(e) => { if (e.target === e.currentTarget && e.dataTransfer.types.includes("kitenote/path")) { e.preventDefault(); setDropTarget("") } }}
        onDrop={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); setDropTarget(null); const from = e.dataTransfer.getData("kitenote/path"); if (from) void move(from, "") }}
      >
        {q
          ? flat.map((f) => (
              <div key={f.path} className={`tree-row file${active === f.path ? ' active' : ''}`} style={{ paddingLeft: 10 }}
                onClick={() => onOpen(f.path)}
                onContextMenu={(e) => menu(e, { name: basename(f.path), path: f.path, isDir: false, children: [] })}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('kitenote/path', f.path)}
                title={f.path}
              >
                {f.path.replace(/\.md$/, '')}
              </div>
            ))
          : tree.children.map((c) => render(c, 0))}
      </div>
    </div>
  )
}
