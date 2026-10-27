import { useCallback, useEffect, useState } from 'react'
import type { AppConfig, FileEntry, SearchHit } from '../../shared/types'
import { FileTree } from './FileTree'
import { NoteEditor } from './editor/NoteEditor'
import { DayView, PendingView, WeekView } from './tasks/TaskViews'
import { DEFAULT_SETTINGS, isoWeek, today, type TaskSettings } from './tasks/model'
import { loadSettings, saveSettings } from './tasks/store'
import { askText, showImageViewer, toast } from './ui'
import { basename, IMAGE_EXT, vaultIndex, vaultUrl } from './vaultIndex'

type View =
  | { type: 'day' }
  | { type: 'week' }
  | { type: 'pending' }
  | { type: 'search' }
  | { type: 'note'; path: string }
  | { type: 'image'; path: string }

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [cfg, setCfg] = useState<TaskSettings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<View>({ type: 'day' })
  const [history, setHistory] = useState<View[]>([])
  const [date, setDate] = useState(today())
  const [week, setWeek] = useState(isoWeek(today()))
  const [version, setVersion] = useState(0)

  const refresh = useCallback(async () => {
    const list = await window.api.listFiles()
    vaultIndex.update(list)
    setFiles(list)
  }, [])

  useEffect(() => {
    window.api.getConfig().then(setConfig)
  }, [])

  useEffect(() => {
    if (!config?.vaultPath) return
    refresh()
    loadSettings().then(setCfg)
    setView({ type: 'day' })
    setHistory([])
    setVersion((v) => v + 1)
  }, [config?.vaultPath, refresh])

  useEffect(
    () =>
      window.api.onVaultChanged((paths) => {
        refresh()
        if (paths.some((p) => p.startsWith(cfg.taskFolder + '/'))) setVersion((v) => v + 1)
      }),
    [refresh, cfg.taskFolder]
  )

  const go = useCallback(
    (v: View) => {
      setHistory((h) => [...h.slice(-30), view])
      setView(v)
    },
    [view]
  )

  const back = (): void => {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory(history.slice(0, -1))
    setView(prev)
  }

  const openFile = useCallback(
    (path: string) => {
      const day = path.match(new RegExp(`^${cfg.taskFolder}/每日/(\\d{4}-\\d{2}-\\d{2})\\.md$`))
      const wk = path.match(new RegExp(`^${cfg.taskFolder}/每周/(\\d{4}-W\\d{2})\\.md$`))
      if (day) {
        setDate(day[1])
        go({ type: 'day' })
      } else if (wk) {
        setWeek(wk[1])
        go({ type: 'week' })
      } else if (path.endsWith('.md')) go({ type: 'note', path })
      else if (IMAGE_EXT.test(path)) go({ type: 'image', path })
      else window.api.reveal(path)
    },
    [cfg.taskFolder, go]
  )

  /** 打开 [[链接]]：不存在则像 Obsidian 一样新建 */
  const openLink = useCallback(
    async (target: string, from = '') => {
      const clean = target.replace(/#.*$/, '').trim()
      let hit = vaultIndex.resolve(clean, from)
      if (!hit) {
        // 索引可能还没包含刚创建的文件，先刷新再判断
        await refresh()
        hit = vaultIndex.resolve(clean, from)
      }
      if (hit) return openFile(hit)
      const rel = clean.endsWith('.md') ? clean : `${clean}.md`
      // 绝不覆盖已存在的文件
      if (!(await window.api.exists(rel))) {
        await window.api.writeFile(rel, '')
        toast(`已新建笔记：${rel}`)
      }
      await refresh()
      openFile(rel)
    },
    [openFile, refresh]
  )

  useEffect(() => {
    const onKey = async (e: KeyboardEvent): Promise<void> => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault()
        const notes = vaultIndex.files.filter((f) => f.path.endsWith('.md')).map((f) => f.path.slice(0, -3))
        const t = await askText('快速打开笔记（Ctrl+O）', '', { suggestions: notes })
        if (t) openLink(t)
      } else if (e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        go({ type: 'search' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openLink, go])

  if (!config) return null
  if (!config.vaultPath) return <Welcome config={config} setConfig={setConfig} />

  const vaultName = basename(config.vaultPath.replace(/\\/g, '/'))
  const nav = (type: 'day' | 'week' | 'pending' | 'search', label: string, icon: string) => (
    <div
      className={`nav-item${view.type === type ? ' active' : ''}`}
      onClick={() => {
        if (type === 'day') setDate(today())
        if (type === 'week') setWeek(isoWeek(today()))
        go({ type })
      }}
    >
      <span className="nav-icon">{icon}</span>
      {label}
    </div>
  )

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="vault-switch" title={config.vaultPath}>
          <span className="logo">◆</span>
          <span className="vault-name">{vaultName}</span>
          <VaultMenu config={config} setConfig={setConfig} cfg={cfg} setCfg={setCfg} />
        </div>
        <nav>
          {nav('day', '我的一天', '☀')}
          {nav('week', '本周计划', '▦')}
          {nav('pending', '未完成汇总', '◷')}
          {nav('search', '全文搜索', '⌕')}
        </nav>
        <div className="sidebar-label">笔记</div>
        <FileTree files={files} active={view.type === 'note' || view.type === 'image' ? view.path : null} onOpen={openFile} onChanged={refresh} />
      </aside>
      <main className="main">
        {history.length > 0 && (view.type === 'note' || view.type === 'image') && (
          <button className="back-btn" onClick={back} title="返回">‹ 返回</button>
        )}
        {view.type === 'day' && <DayView cfg={cfg} version={version} onOpenNote={(l) => openLink(l)} date={date} setDate={setDate} />}
        {view.type === 'week' && (
          <WeekView
            cfg={cfg}
            version={version}
            onOpenNote={(l) => openLink(l)}
            week={week}
            setWeek={setWeek}
            openDay={(d) => {
              setDate(d)
              go({ type: 'day' })
            }}
          />
        )}
        {view.type === 'pending' && (
          <PendingView
            cfg={cfg}
            version={version}
            onOpenNote={(l) => openLink(l)}
            openDay={(d) => {
              setDate(d)
              go({ type: 'day' })
            }}
          />
        )}
        {view.type === 'search' && <SearchView onOpen={openFile} />}
        {view.type === 'note' && <NoteEditor key={view.path} path={view.path} onOpenLink={openLink} />}
        {view.type === 'image' && (
          <div className="view image-view">
            <div className="view-head">
              <h1>{basename(view.path)}</h1>
              <div className="head-actions">
                <button className="btn primary" onClick={() => window.api.copyImage(view.path).then(() => toast('图片已复制'))}>复制图片</button>
                <button className="btn" onClick={() => window.api.reveal(view.path)}>在文件夹中显示</button>
              </div>
            </div>
            <img src={vaultUrl(view.path)} title="双击查看原图" style={{ cursor: 'zoom-in' }} onDoubleClick={() => showImageViewer(vaultUrl(view.path), basename(view.path))} />
          </div>
        )}
      </main>
    </div>
  )
}

function VaultMenu({ config, setConfig, cfg, setCfg }: {
  config: AppConfig
  setConfig: (c: AppConfig) => void
  cfg: TaskSettings
  setCfg: (c: TaskSettings) => void
}) {
  const [open, setOpen] = useState(false)
  const item = (label: string, fn: () => void) => (
    <div className="ctx-item" onClick={() => { setOpen(false); fn() }}>{label}</div>
  )
  return (
    <span className="vault-menu">
      <button className="icon-btn" onClick={() => setOpen(!open)} title="库与设置">⚙</button>
      {open && (
        <div className="ctx-menu static" onMouseLeave={() => setOpen(false)}>
          {item('打开其他库 / Obsidian 库…', () => window.api.chooseVault().then(setConfig))}
          {item('从 Obsidian 导入（复制一份）…', async () => {
            const r = await window.api.importObsidian()
            if (r) {
              toast(r.message, 5000)
              if (r.ok) setConfig(await window.api.getConfig())
            }
          })}
          {config.recentVaults
            .filter((v) => v !== config.vaultPath)
            .map((v) => (
              <div key={v} className="ctx-item" title={v} onClick={() => { setOpen(false); window.api.openVault(v).then(setConfig) }}>
                ↺ {basename(v.replace(/\\/g, '/'))}
              </div>
            ))}
          <div className="ctx-sep" />
          {item(`任务文件夹：${cfg.taskFolder}`, async () => {
            const v = await askText('任务清单保存的文件夹', cfg.taskFolder)
            if (v?.trim()) {
              const next = { ...cfg, taskFolder: v.trim().replace(/^\/+|\/+$/g, '') }
              await saveSettings(next)
              setCfg(next)
            }
          })}
          {item(`实验笔记文件夹：${cfg.noteFolder}`, async () => {
            const v = await askText('从任务创建的实验笔记保存到', cfg.noteFolder)
            if (v?.trim()) {
              const next = { ...cfg, noteFolder: v.trim().replace(/^\/+|\/+$/g, '') }
              await saveSettings(next)
              setCfg(next)
            }
          })}
          {item('在资源管理器中打开库', () => window.api.reveal(''))}
        </div>
      )}
    </span>
  )
}

function SearchView({ onOpen }: { onOpen: (p: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  useEffect(() => {
    const t = setTimeout(() => window.api.search(q).then(setHits), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="view">
      <div className="view-head">
        <h1>全文搜索</h1>
      </div>
      <input className="search-input" autoFocus placeholder="搜索所有笔记内容（Ctrl+Shift+F）" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="search-results">
        {hits.map((h, i) => (
          <div key={i} className="search-hit" onClick={() => onOpen(h.path)}>
            <div className="hit-path">{h.path.replace(/\.md$/, '')}{h.line ? `:${h.line}` : ''}</div>
            {h.line > 0 && <div className="hit-text">{h.text}</div>}
          </div>
        ))}
        {q && !hits.length && <div className="empty-hint">无结果</div>}
      </div>
    </div>
  )
}

function Welcome({ config, setConfig }: { config: AppConfig; setConfig: (c: AppConfig) => void }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>◆ LabNote</h1>
        <p className="sub">实验记录 + 每日/每周任务。所有数据都是普通 Markdown 文件，与 Obsidian 完全兼容。</p>
        <button className="btn primary big" onClick={() => window.api.chooseVault().then(setConfig)}>
          打开或新建库文件夹
          <small>可直接选择现有的 Obsidian 库，原地使用</small>
        </button>
        <button
          className="btn big"
          onClick={async () => {
            const r = await window.api.importObsidian()
            if (r) {
              toast(r.message, 5000)
              if (r.ok) setConfig(await window.api.getConfig())
            }
          }}
        >
          从 Obsidian 导入（复制一份）
          <small>逐字节复制整个库并 SHA1 校验，目录结构、附件、.obsidian 配置全部保留</small>
        </button>
        {config.recentVaults.length > 0 && (
          <div className="recent">
            <div className="sidebar-label">最近打开</div>
            {config.recentVaults.map((v) => (
              <div key={v} className="ctx-item" onClick={() => window.api.openVault(v).then(setConfig)}>{v}</div>
            ))}
          </div>
        )}
        <p className="tip">多设备同步：把库文件夹放在 坚果云 / OneDrive / 百度网盘同步空间 / Syncthing 目录中即可；手机端可用 Obsidian App 打开同一个库。</p>
      </div>
    </div>
  )
}
