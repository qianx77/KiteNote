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
}

export const DEFAULT_SETTINGS: TaskSettings = { taskFolder: '任务', noteFolder: '实验记录' }

export function scopePath(s: Scope, cfg: TaskSettings): string {
  return s.kind === 'day' ? `${cfg.taskFolder}/每日/${s.key}.md` : `${cfg.taskFolder}/每周/${s.key}.md`
}

export function emptyTaskFile(s: Scope): TaskFile {
  const title = s.kind === 'day' ? `# ${s.key} ${weekdayName(s.key)}` : `# ${s.key} 周计划（${weekMonday(s.key)} 起）`
  return {
    preamble: ['---', `labnote: ${s.kind === 'day' ? 'daily' : 'weekly'}`, `${s.kind === 'day' ? 'date' : 'week'}: ${s.key}`, '---', title],
    tasks: [],
    eol: '\n'
  }
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '未命名'
}

export function noteTemplate(title: string, s: Scope, cfg: TaskSettings): string {
  const date = s.kind === 'day' ? s.key : weekMonday(s.key)
  const taskLink = scopePath(s, cfg).replace(/\.md$/, '')
  return `---
tags: [实验]
date: ${date}
task: "[[${taskLink}]]"
---
# ${title}

## 目标


## 方法 / 配置


## 过程记录


## 结果


## 结论与下一步

`
}
