/**
 * 任务以纯 Markdown 清单保存（每天/每周一个文件），Obsidian 与手机端均可直接查看和勾选。
 *
 *   - [ ] 训练 ViT baseline ⏫ [[实验/2026-10-26 训练 ViT baseline]]
 *   	- [x] 准备数据
 *   - [x] 写周报 ✅ 2026-10-26
 *
 * ⏫ = 重要，✅ 日期 = 完成日期（与 Obsidian Tasks 插件写法兼容）。
 * 非任务行会原样保留在所属任务之后，保证用 Obsidian 改过的文件不会被本软件破坏。
 */

export interface Step {
  done: boolean
  text: string
}

export interface Task {
  id: string
  done: boolean
  title: string
  important: boolean
  doneDate: string | null
  /** 关联笔记的链接目标（[[...]] 中 | 之前的部分） */
  link: string | null
  steps: Step[]
  /** 备注（如实验取消的原因），保存为任务下缩进的 `> ` 引用行 */
  note: string
  /** 任务下方的非清单行（原样保留） */
  extra: string[]
}

export interface TaskFile {
  preamble: string[]
  tasks: Task[]
  eol: string
  /** 读取时磁盘上的原文（null/缺省 = 文件原本不存在），保存时用来发现外部修改 */
  raw?: string | null
}

export type Scope = { kind: 'day'; key: string } | { kind: 'week'; key: string }

const TASK_RE = /^- \[( |x|X)\] ?(.*)$/
const STEP_RE = /^(\t| {2,})- \[( |x|X)\] ?(.*)$/
const NOTE_RE = /^(\t| {2,})> ?(.*)$/
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/
const DONE_RE = /\s*✅\s*(\d{4}-\d{2}-\d{2})/

let seq = 0
export const newId = (): string => `t${Date.now().toString(36)}${(seq++).toString(36)}`

export function parseTaskLine(body: string, done: boolean): Task {
  let text = body
  let doneDate: string | null = null
  const d = text.match(DONE_RE)
  if (d) {
    doneDate = d[1]
    text = text.replace(DONE_RE, '')
  }
  const important = text.includes('⏫')
  text = text.replace(/\s*⏫/g, '')
  let link: string | null = null
  const l = text.match(LINK_RE)
  if (l) {
    link = l[1].trim()
    text = text.replace(l[0], '')
  }
  return { id: newId(), done, title: text.trim(), important, doneDate, link, steps: [], note: '', extra: [] }
}

export function parseTaskFile(src: string): TaskFile {
  const eol = src.includes('\r\n') ? '\r\n' : '\n'
  const lines = src.split(/\r?\n/)
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  const file: TaskFile = { preamble: [], tasks: [], eol }
  let cur: Task | null = null
  for (const line of lines) {
    const t = line.match(TASK_RE)
    if (t) {
      cur = parseTaskLine(t[2], t[1] !== ' ')
      file.tasks.push(cur)
      continue
    }
    const s = line.match(STEP_RE)
    if (s && cur && cur.extra.length === 0) {
      cur.steps.push({ done: s[2] !== ' ', text: s[3] })
      continue
    }
    const n = line.match(NOTE_RE)
    if (n && cur && cur.extra.length === 0) {
      cur.note = cur.note ? `${cur.note}\n${n[2]}` : n[2]
      continue
    }
    if (cur) cur.extra.push(line)
    else file.preamble.push(line)
  }
  return file
}

export function serializeTask(t: Task): string[] {
  let line = `- [${t.done ? 'x' : ' '}] ${t.title}`
  if (t.important) line += ' ⏫'
  if (t.link) line += ` [[${t.link}]]`
  if (t.done && t.doneDate) line += ` ✅ ${t.doneDate}`
  const note = t.note.trim() ? t.note.replace(/\s+$/, '').split(/\r?\n/).map((l) => `\t> ${l}`.trimEnd()) : []
  return [line, ...t.steps.map((s) => `\t- [${s.done ? 'x' : ' '}] ${s.text}`), ...note, ...t.extra]
}

export function serializeTaskFile(f: TaskFile): string {
  const lines = [...f.preamble]
  // 保证任务列表与标题之间有空行（Markdown 渲染需要）
  if (f.tasks.length && lines.length && lines[lines.length - 1].trim() !== '') lines.push('')
  for (const t of f.tasks) lines.push(...serializeTask(t))
  return lines.join(f.eol) + f.eol
}

// ---------- 日期 / 周 ----------

const pad = (n: number): string => String(n).padStart(2, '0')
export const fmtDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = (): string => fmtDate(new Date())

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

/** ISO 周，如 2026-W43 */
export function isoWeek(s: string): string {
  const d = parseDate(s)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day + 3) // 本周四
  const dayOfYear = Math.round((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000)
  const week = Math.floor(dayOfYear / 7) + 1
  return `${d.getFullYear()}-W${pad(week)}`
}

/** 某 ISO 周的周一 */
export function weekMonday(week: string): string {
  const [y, w] = week.split('-W').map(Number)
  const jan4 = new Date(y, 0, 4)
  const mon = new Date(jan4)
  mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7)
  return fmtDate(mon)
}

export const weekDays = (week: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekMonday(week), i))
export const addWeeks = (week: string, n: number): string => isoWeek(addDays(weekMonday(week), n * 7))

const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const weekdayName = (s: string): string => WD[parseDate(s).getDay()]

// ---------- 文件路径 ----------

export interface TaskSettings {
  taskFolder: string
  noteFolder: string
  /** 自定义模板所在文件夹（与 Obsidian 核心插件「模板」兼容，默认读取 .obsidian/templates.json） */
  templateFolder: string
}

export const DEFAULT_SETTINGS: TaskSettings = { taskFolder: '任务', noteFolder: '实验记录', templateFolder: '模板' }

export function scopePath(s: Scope, cfg: TaskSettings): string {
  return s.kind === 'day' ? `${cfg.taskFolder}/每日/${s.key}.md` : `${cfg.taskFolder}/每周/${s.key}.md`
}

export function emptyTaskFile(s: Scope): TaskFile {
  const title = s.kind === 'day' ? `# ${s.key} ${weekdayName(s.key)}` : `# ${s.key} 周计划（${weekMonday(s.key)} 起）`
  return {
    preamble: ['---', `kitenote: ${s.kind === 'day' ? 'daily' : 'weekly'}`, `${s.kind === 'day' ? 'date' : 'week'}: ${s.key}`, '---', title],
    tasks: [],
    eol: '\n'
  }
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '未命名'
}

// ---------- 笔记模板 ----------

export interface NoteTemplate {
  name: string
  /** 模板原文，支持 {{title}} {{date}} {{time}} {{task}} 与 {{date:YYYY-MM-DD}} 等 Obsidian 写法 */
  body: string
  /** 来自库内模板文件夹时为文件路径 */
  path?: string
}

const fm = (tag: string): string => `---
tags: [${tag}]
date: {{date}}
task: "[[{{task}}]]"
---
# {{title}}
`

export const BUILTIN_TEMPLATES: NoteTemplate[] = [
  {
    name: '实验记录',
    body: `${fm('实验')}
## 目标


## 方法 / 配置


## 过程记录


## 结果


## 结论与下一步

`
  },
  {
    name: '问题排查',
    body: `${fm('排查')}
## 现象

- 环境：
- 复现步骤：
- 影响范围：

## 排查过程


## 根因


## 解决方案


## 后续预防

`
  },
  {
    name: '会议纪要',
    body: `${fm('会议')}
- 时间：{{date}} {{time}}
- 参会人：

## 议题


## 讨论要点


## 结论


## 待办

- [ ] 
`
  },
  {
    name: '通用工作记录',
    body: `${fm('工作')}
## 背景 / 目标


## 做了什么


## 结果


## 下一步

`
  }
]

/** 同名的库内模板覆盖内置模板；内置模板在前，其余按名称排序 */
export function mergeTemplates(vault: NoteTemplate[]): NoteTemplate[] {
  const byName = new Map(vault.map((t) => [t.name, t]))
  const merged = BUILTIN_TEMPLATES.map((b) => byName.get(b.name) ?? b)
  const extra = vault.filter((t) => !BUILTIN_TEMPLATES.some((b) => b.name === t.name)).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return [...merged, ...extra]
}


function formatDate(d: Date, fmt: string): string {
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) =>
    ({ YYYY: String(d.getFullYear()), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()), HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) })[k]!
  )
}

export interface TemplateVars {
  title: string
  /** 任务所在日期（周任务为周一），YYYY-MM-DD */
  date: string
  /** 任务清单的链接目标 */
  task: string
  now?: Date
}

/** 渲染模板；模板没有写 task 属性时自动补上，保证笔记顶部能跳回任务 */
export function renderTemplate(body: string, v: TemplateVars): string {
  const now = v.now ?? new Date()
  const [y, m, d] = v.date.split('-').map(Number)
  const day = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds())
  let out = body.replace(/\{\{\s*(title|date|time|task)(?::([^}]*))?\s*\}\}/g, (_all, key: string, fmt?: string) => {
    if (key === 'title') return v.title
    if (key === 'task') return v.task
    if (key === 'date') return fmt ? formatDate(day, fmt.trim()) : v.date
    return formatDate(now, fmt?.trim() || 'HH:mm')
  })
  const taskLine = `task: "[[${v.task}]]"`
  const head = out.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/)
  if (!head) out = `---\n${taskLine}\n---\n${out}`
  else if (!/^task\s*:/m.test(head[1])) out = out.replace(/^---\r?\n/, `---\n${taskLine}\n`)
  return out
}

export function taskTemplateVars(title: string, s: Scope, cfg: TaskSettings): TemplateVars {
  return { title, date: s.kind === 'day' ? s.key : weekMonday(s.key), task: scopePath(s, cfg).replace(/\.md$/, '') }
}

/** 默认（实验记录）模板，保留给旧调用 */
export function noteTemplate(title: string, s: Scope, cfg: TaskSettings): string {
  return renderTemplate(BUILTIN_TEMPLATES[0].body, taskTemplateVars(title, s, cfg))
}
