import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addDays,
  addWeeks,
  isoWeek,
  parseTaskFile,
  scopePath,
  today,
  weekDays,
  weekdayName,
  weekMonday,
  type Scope,
  type Task,
  type TaskFile,
  type NoteTemplate,
  type TaskSettings
} from './model'
import { createNoteForTask, exportBuiltinTemplates, lastTemplateName, loadScope, loadTemplates, moveTask, saveScope } from './store'
import { askText, confirmBox, showMenu, toast } from '../ui'
import { vaultIndex } from '../vaultIndex'

interface ListProps {
  scope: Scope
  cfg: TaskSettings
  version: number
  onOpenNote: (link: string) => void
  compact?: boolean
  placeholder?: string
  onChanged?: () => void
}

const clone = (f: TaskFile): TaskFile => JSON.parse(JSON.stringify(f))

export function TaskList({ scope, cfg, version, onOpenNote, compact, placeholder, onChanged }: ListProps) {
  const [file, setFile] = useState<TaskFile | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(!compact)
  const [input, setInput] = useState('')

  const reload = useCallback(() => {
    loadScope(scope, cfg).then(setFile)
  }, [scope.kind, scope.key, cfg])

  useEffect(reload, [reload, version])

  const mutate = async (fn: (f: TaskFile) => void): Promise<void> => {
    if (!file) return
    const next = clone(file)
    fn(next)
    setFile(next)
    try {
      await saveScope(scope, cfg, next)
      onChanged?.()
    } catch (e) {
      toast(`保存失败：${e}`)
    }
  }

  const update = (id: string, patch: Partial<Task>): Promise<void> =>
    mutate((f) => {
      const t = f.tasks.find((x) => x.id === id)
      if (t) Object.assign(t, patch)
    })

  const toggle = (t: Task): Promise<void> => update(t.id, { done: !t.done, doneDate: !t.done ? today() : null })

  const add = async (): Promise<void> => {
    const title = input.trim()
    if (!title) return
    setInput('')
    await mutate((f) => {
      f.tasks.push({ id: `n${Date.now()}`, done: false, title, important: false, doneDate: null, link: null, steps: [], note: '', extra: [] })
    })
  }

  /** 已关联则打开；否则在 (x, y) 弹出模板选择，按所选模板创建笔记 */
  const openOrCreateNote = async (t: Task, x: number, y: number): Promise<void> => {
    if (t.link) return onOpenNote(t.link)
    const templates = await loadTemplates(cfg)
    const last = lastTemplateName()
    const create = async (tpl: NoteTemplate): Promise<void> => {
      // 统一先放在笔记文件夹，之后在文件树里拖到各项目归类（链接会自动更新）
      const link = await createNoteForTask(t, scope, cfg, tpl)
      await update(t.id, { link })
      onOpenNote(link)
    }
    showMenu(x, y, [
      ...templates.map((tpl) => ({
        label: `${tpl.name === last ? '● ' : '　 '}${tpl.name}`,
        action: () => void create(tpl)
      })),
      { separator: true, label: '' },
      {
        label: '编辑 / 新增模板…',
        action: async () => {
          onOpenNote(await exportBuiltinTemplates(cfg))
          toast(`模板在「${cfg.templateFolder}」文件夹：改这里的笔记即改模板，新建笔记即新增模板。可用 {{title}} {{date}} {{time}}`, 6000)
        }
      }
    ])
  }
  const noteMenuAt = (t: Task) => (e: React.MouseEvent): void => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    void openOrCreateNote(t, r.left, r.bottom + 4)
  }

  const move = async (t: Task, to: Scope): Promise<void> => {
    await moveTask(t, scope, to, cfg)
    setSelected(null)
    reload()
    onChanged?.()
    toast(`已移到 ${to.kind === 'day' ? to.key : `${to.key} 周清单`}`)
  }

  const remove = async (t: Task): Promise<void> => {
    if (!(await confirmBox(`删除任务「${t.title}」？${t.link ? '（关联笔记不会被删除）' : ''}`))) return
    setSelected(null)
    await mutate((f) => {
      f.tasks = f.tasks.filter((x) => x.id !== t.id)
    })
  }

  const menu = (e: React.MouseEvent, t: Task): void => {
    e.preventDefault()
    e.stopPropagation()
    const day = scope.kind === 'day' ? scope.key : today()
    showMenu(e.clientX, e.clientY, [
      { label: '移到今天', action: () => move(t, { kind: 'day', key: today() }) },
      { label: '移到明天', action: () => move(t, { kind: 'day', key: addDays(day, 1) }) },
      { label: '移到其他日期…', action: async () => {
        const d = await askText('移到日期（YYYY-MM-DD）', addDays(day, 1))
        if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) move(t, { kind: 'day', key: d })
      } },
      { label: '移到本周清单', action: () => move(t, { kind: 'week', key: isoWeek(day) }) },
      { separator: true, label: '' },
      { label: t.link ? '打开关联笔记' : '创建笔记（选择模板）…', action: () => openOrCreateNote(t, e.clientX, e.clientY) },
      { label: '关联已有笔记…', action: async () => {
        const notes = vaultIndex.files.filter((f) => f.path.endsWith('.md')).map((f) => f.path.slice(0, -3))
        const link = await askText('输入或选择笔记', t.link ?? '', { suggestions: notes })
        if (link !== null) update(t.id, { link: link.trim() || null })
      } },
      { separator: true, label: '' },
      { label: '删除任务', danger: true, action: () => remove(t) }
    ])
  }

  if (!file) return <div className="task-list loading">加载中…</div>
  const open = file.tasks.filter((t) => !t.done).sort((a, b) => Number(b.important) - Number(a.important))
  const done = file.tasks.filter((t) => t.done)
  const sel = file.tasks.find((t) => t.id === selected) ?? null

  const row = (t: Task) => (
    <div
      key={t.id}
      className={`task-row${t.done ? ' done' : ''}${selected === t.id ? ' selected' : ''}`}
      onClick={() => !compact && setSelected(t.id === selected ? null : t.id)}
      onContextMenu={(e) => menu(e, t)}
    >
      <button className={`check${t.done ? ' on' : ''}`} title={t.done ? '标记为未完成' : '标记为完成'} onClick={(e) => { e.stopPropagation(); void toggle(t) }}>
        {t.done ? '✓' : ''}
      </button>
      <div className="task-main">
        <div className="task-title">{t.title}</div>
        {(t.steps.length > 0 || t.link || t.doneDate || t.note) && (
          <div className="task-meta">
            {t.steps.length > 0 && <span>步骤 {t.steps.filter((s) => s.done).length}/{t.steps.length}</span>}
            {t.link && (
              <span className="meta-link" onClick={(e) => { e.stopPropagation(); onOpenNote(t.link!) }}>📝 {t.link.split('/').pop()}</span>
            )}
            {t.done && t.doneDate && <span>✅ {t.doneDate}</span>}
            {t.note && <span className="meta-note" title={t.note}>💬 {t.note.split('\n')[0].slice(0, 40)}</span>}
          </div>
        )}
      </div>
      <button className="icon-btn" title={t.link ? '打开关联笔记' : '为该任务创建笔记（可选模板）'} onClick={noteMenuAt(t)}>
        {t.link ? '📝' : '＋📝'}
      </button>
      <button className={`icon-btn star${t.important ? ' on' : ''}`} title="重要" onClick={(e) => { e.stopPropagation(); void update(t.id, { important: !t.important }) }}>
        {t.important ? '★' : '☆'}
      </button>
      <button className="icon-btn" title="更多" onClick={(e) => menu(e, t)}>⋯</button>
    </div>
  )

  return (
    <div className={`task-wrap${compact ? ' compact' : ''}`}>
      <div className="task-list">
        <div className="task-add">
          <span className="plus">＋</span>
          <input
            value={input}
            placeholder={placeholder ?? '添加任务，回车确认'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void add()}
          />
        </div>
        {open.map(row)}
        {done.length > 0 && (
          <>
            <div className="done-toggle" onClick={() => setShowDone(!showDone)}>
              {showDone ? '▾' : '▸'} 已完成 {done.length}
            </div>
            {showDone && done.map(row)}
          </>
        )}
        {!file.tasks.length && compact && <div className="empty-hint">暂无任务</div>}
      </div>
      {sel && !compact && (
        <TaskDetail
          key={sel.id}
          task={sel}
          onUpdate={(p) => update(sel.id, p)}
          onOpenNote={noteMenuAt(sel)}
          onDelete={() => remove(sel)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function TaskDetail(props: {
  task: Task
  onUpdate: (p: Partial<Task>) => void
  onOpenNote: (e: React.MouseEvent) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { task } = props
  const [title, setTitle] = useState(task.title)
  const [step, setStep] = useState('')
  const [note, setNote] = useState(task.note)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const setSteps = (steps: Task['steps']): void => props.onUpdate({ steps })
  return (
    <div className="task-detail">
      <div className="detail-head">
        <button className={`check${task.done ? ' on' : ''}`} onClick={() => props.onUpdate({ done: !task.done, doneDate: !task.done ? today() : null })}>
          {task.done ? '✓' : ''}
        </button>
        <input
          className="detail-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && props.onUpdate({ title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button className="icon-btn" onClick={props.onClose} title="关闭">✕</button>
      </div>
      <div className="detail-section">
        <div className="detail-label">步骤</div>
        {task.steps.map((s, i) => (
          <div key={i} className={`step${s.done ? ' done' : ''}`}>
            <button className={`check small${s.done ? ' on' : ''}`} onClick={() => setSteps(task.steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}>
              {s.done ? '✓' : ''}
            </button>
            <span className="step-text">{s.text}</span>
            <button className="icon-btn" onClick={() => setSteps(task.steps.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <input
          className="step-input"
          placeholder="＋ 添加步骤"
          value={step}
          onChange={(e) => setStep(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && step.trim()) {
              setSteps([...task.steps, { done: false, text: step.trim() }])
              setStep('')
            }
          }}
        />
      </div>
      <div className="detail-section">
        <div className="detail-label">
          备注
          {!task.note.startsWith('【不做】') && (
            <button
              className="link-btn"
              title="标记为完成，并在备注里记录不做的原因"
              onClick={() => {
                const next = `【不做】${note ? note : ''}`
                setNote(next)
                props.onUpdate({ note: next, done: true, doneDate: today() })
                setTimeout(() => noteRef.current?.focus(), 0)
              }}
            >
              标记为不做
            </button>
          )}
        </div>
        <textarea
          ref={noteRef}
          className="note-input"
          rows={3}
          placeholder="记录情况，例如：这个实验不需要做了，原因是…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== task.note && props.onUpdate({ note })}
        />
      </div>
      <div className="detail-section">
        <div className="detail-label">关联笔记</div>
        {task.link ? (
          <div className="detail-note">
            <a onClick={props.onOpenNote}>📝 {task.link}</a>
            <button className="btn small" onClick={() => props.onUpdate({ link: null })}>取消关联</button>
          </div>
        ) : (
          <button className="btn primary" onClick={props.onOpenNote}>创建笔记（选择模板）▾</button>
        )}
      </div>
      <div className="detail-section row">
        <button className={`btn${task.important ? ' primary' : ''}`} onClick={() => props.onUpdate({ important: !task.important })}>
          {task.important ? '★ 重要' : '☆ 标记为重要'}
        </button>
        <button className="btn danger" onClick={props.onDelete}>删除</button>
      </div>
      {task.extra.some((l) => l.trim()) && (
        <div className="detail-section">
          <div className="detail-label">附加内容（来自 Markdown，原样保留）</div>
          <pre className="extra">{task.extra.join('\n')}</pre>
        </div>
      )}
    </div>
  )
}

// ---------- 今天 ----------

export function DayView({ cfg, version, onOpenNote, date, setDate }: {
  cfg: TaskSettings
  version: number
  onOpenNote: (l: string) => void
  date: string
  setDate: (d: string) => void
}) {
  const [carry, setCarry] = useState<TaskFile | null>(null)
  const [localVer, setLocalVer] = useState(0)
  const yesterday = addDays(date, -1)
  const isToday = date === today()

  useEffect(() => {
    loadScope({ kind: 'day', key: yesterday }, cfg).then(setCarry)
  }, [yesterday, cfg, version, localVer])

  const pending = carry?.tasks.filter((t) => !t.done) ?? []
  const carryOver = async (): Promise<void> => {
    for (const t of pending) await moveTask(t, { kind: 'day', key: yesterday }, { kind: 'day', key: date }, cfg)
    setLocalVer((v) => v + 1)
    toast(`已带入 ${pending.length} 项未完成任务`)
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1>{isToday ? '我的一天' : date}</h1>
          <div className="sub">{date} {weekdayName(date)} · {isoWeek(date)}</div>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setDate(addDays(date, -1))}>‹ 前一天</button>
          {!isToday && <button className="btn" onClick={() => setDate(today())}>回到今天</button>}
          <button className="btn" onClick={() => setDate(addDays(date, 1))}>后一天 ›</button>
          <input type="date" className="date-input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
      </div>
      {pending.length > 0 && (
        <div className="banner">
          {yesterday} 还有 {pending.length} 项未完成
          <button className="btn small primary" onClick={carryOver}>全部带入{isToday ? '今天' : '这天'}</button>
        </div>
      )}
      <TaskList
        scope={{ kind: 'day', key: date }}
        cfg={cfg}
        version={version + localVer}
        onOpenNote={onOpenNote}
        placeholder="添加今天的任务，如：跑 ViT-B/16 baseline，回车确认"
      />
      <div className="section-title">本周目标 · {isoWeek(date)}</div>
      <TaskList scope={{ kind: 'week', key: isoWeek(date) }} cfg={cfg} version={version} onOpenNote={onOpenNote} compact placeholder="添加本周目标" />
    </div>
  )
}

// ---------- 本周 ----------

export function WeekView({ cfg, version, onOpenNote, week, setWeek, openDay }: {
  cfg: TaskSettings
  version: number
  onOpenNote: (l: string) => void
  week: string
  setWeek: (w: string) => void
  openDay: (d: string) => void
}) {
  const days = weekDays(week)
  const [ver, setVer] = useState(0)
  const bump = (): void => setVer((v) => v + 1)

  const copyReport = async (): Promise<void> => {
    const lines: string[] = [`# ${week} 周报（${days[0]} ~ ${days[6]}）`, '', '## 本周目标', '']
    const fmt = (t: Task): string =>
      `- [${t.done ? 'x' : ' '}] ${t.title}${t.link ? `（笔记：${t.link.split('/').pop()}）` : ''}${t.note ? ` —— 备注：${t.note.replace(/\n/g, '；')}` : ''}`
    const wf = await loadScope({ kind: 'week', key: week }, cfg)
    lines.push(...(wf.tasks.length ? wf.tasks.map(fmt) : ['（无）']), '', '## 每日记录', '')
    let doneN = 0
    let total = 0
    for (const d of days) {
      const f = await loadScope({ kind: 'day', key: d }, cfg)
      if (!f.tasks.length) continue
      total += f.tasks.length
      doneN += f.tasks.filter((t) => t.done).length
      lines.push(`### ${d.slice(5)} ${weekdayName(d)}`, '', ...f.tasks.map(fmt), '')
    }
    lines.splice(2, 0, `本周共 ${total} 项日任务，完成 ${doneN} 项。`, '')
    const md = lines.join('\n')
    const html = md
      .split('\n')
      .map((l) => {
        const esc = l.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        if (l.startsWith('### ')) return `<h3>${esc.slice(4)}</h3>`
        if (l.startsWith('## ')) return `<h2>${esc.slice(3)}</h2>`
        if (l.startsWith('# ')) return `<h1>${esc.slice(2)}</h1>`
        if (l.startsWith('- [x] ')) return `<p>☑ ${esc.slice(6)}</p>`
        if (l.startsWith('- [ ] ')) return `<p>☐ ${esc.slice(6)}</p>`
        return l ? `<p>${esc}</p>` : ''
      })
      .join('')
    await window.api.copyRich({ html, text: md })
    toast('周报已复制（富文本 + Markdown），可直接粘贴')
  }

  return (
    <div className="view wide">
      <div className="view-head">
        <div>
          <h1>本周 {week}</h1>
          <div className="sub">{weekMonday(week)} ~ {days[6]}</div>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setWeek(addWeeks(week, -1))}>‹ 上周</button>
          {week !== isoWeek(today()) && <button className="btn" onClick={() => setWeek(isoWeek(today()))}>本周</button>}
          <button className="btn" onClick={() => setWeek(addWeeks(week, 1))}>下周 ›</button>
          <button className="btn primary" onClick={copyReport}>复制周报</button>
        </div>
      </div>
      <div className="section-title">周目标</div>
      <TaskList scope={{ kind: 'week', key: week }} cfg={cfg} version={version + ver} onOpenNote={onOpenNote} placeholder="添加本周目标 / 本周实验计划" onChanged={bump} />
      <div className="section-title">每日安排</div>
      <div className="week-grid">
        {days.map((d) => (
          <div key={d} className={`day-col${d === today() ? ' today' : ''}`}>
            <div className="day-col-head" onClick={() => openDay(d)} title="打开当天">
              {weekdayName(d)} <span>{d.slice(5)}</span>
            </div>
            <TaskList scope={{ kind: 'day', key: d }} cfg={cfg} version={version + ver} onOpenNote={onOpenNote} compact placeholder="添加" onChanged={bump} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- 未完成汇总 ----------

export function PendingView({ cfg, version, onOpenNote, openDay }: {
  cfg: TaskSettings
  version: number
  onOpenNote: (l: string) => void
  openDay: (d: string) => void
}) {
  const [groups, setGroups] = useState<{ scope: Scope; tasks: Task[] }[] | null>(null)
  const [ver, setVer] = useState(0)

  useEffect(() => {
    const prefixDay = `${cfg.taskFolder}/每日/`
    const prefixWeek = `${cfg.taskFolder}/每周/`
    const scopes: Scope[] = []
    for (const f of vaultIndex.files) {
      const m = f.path.match(/\/([^/]+)\.md$/)
      if (!m) continue
      if (f.path.startsWith(prefixDay) && /^\d{4}-\d{2}-\d{2}$/.test(m[1])) scopes.push({ kind: 'day', key: m[1] })
      if (f.path.startsWith(prefixWeek) && /^\d{4}-W\d{2}$/.test(m[1])) scopes.push({ kind: 'week', key: m[1] })
    }
    scopes.sort((a, b) => b.key.localeCompare(a.key))
    Promise.all(
      scopes.map(async (s) => ({ scope: s, tasks: parseTaskFile(await window.api.readFile(scopePath(s, cfg))).tasks.filter((t) => !t.done) }))
    ).then((g) => setGroups(g.filter((x) => x.tasks.length)))
  }, [cfg, version, ver])

  if (!groups) return <div className="view">加载中…</div>
  const total = groups.reduce((n, g) => n + g.tasks.length, 0)
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1>未完成汇总</h1>
          <div className="sub">所有日/周清单中尚未完成的任务，共 {total} 项</div>
        </div>
      </div>
      {!groups.length && <div className="empty-hint big">🎉 没有未完成的任务</div>}
      {groups.map((g) => (
        <div key={g.scope.key} className="pending-group">
          <div className="section-title clickable" onClick={() => g.scope.kind === 'day' && openDay(g.scope.key)}>
            {g.scope.kind === 'day' ? `${g.scope.key} ${weekdayName(g.scope.key)}` : `${g.scope.key} 周清单`}
          </div>
          {g.tasks.map((t, i) => (
            <div key={i} className="task-row">
              <button
                className="check"
                onClick={async () => {
                  const f = await loadScope(g.scope, cfg)
                  const hit = f.tasks.find((x) => x.title === t.title && !x.done)
                  if (hit) {
                    hit.done = true
                    hit.doneDate = today()
                    await saveScope(g.scope, cfg, f)
                  }
                  setVer((v) => v + 1)
                }}
              />
              <div className="task-main">
                <div className="task-title">{t.important ? '★ ' : ''}{t.title}</div>
                {t.link && <div className="task-meta"><span className="meta-link" onClick={() => onOpenNote(t.link!)}>📝 {t.link.split('/').pop()}</span></div>}
              </div>
              {!(g.scope.kind === 'day' && g.scope.key === today()) && (
                <button
                  className="btn small"
                  onClick={async () => {
                    await moveTask(t, g.scope, { kind: 'day', key: today() }, cfg)
                    setVer((v) => v + 1)
                    toast('已移到今天')
                  }}
                >
                  移到今天
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
