import {
  BUILTIN_TEMPLATES,
  DEFAULT_SETTINGS,
  emptyTaskFile,
  mergeTemplates,
  renderTemplate,
  taskTemplateVars,
  parseTaskFile,
  safeFileName,
  scopePath,
  serializeTaskFile,
  type Scope,
  type Task,
  type NoteTemplate,
  type TaskFile,
  type TaskSettings
} from './model'
import { toast } from '../ui'

const SETTINGS_PATH = '.kitenote/settings.json'
/** 改名前（LabNote）的设置位置，只读不写 */
const LEGACY_SETTINGS_PATH = '.labnote/settings.json'

export async function loadSettings(): Promise<TaskSettings> {
  let saved: Partial<TaskSettings> = {}
  for (const p of [SETTINGS_PATH, LEGACY_SETTINGS_PATH]) {
    try {
      saved = JSON.parse(await window.api.readFile(p))
      break
    } catch {
      /* 尚未保存过设置 */
    }
  }
  const s = { ...DEFAULT_SETTINGS, ...saved }
  // 没单独设置模板文件夹时，沿用 Obsidian「模板」核心插件的文件夹
  if (!saved.templateFolder) {
    try {
      const folder = JSON.parse(await window.api.readFile('.obsidian/templates.json')).folder
      if (typeof folder === 'string' && folder.trim()) s.templateFolder = folder.trim().replace(/^\/+|\/+$/g, '')
    } catch {
      /* 没有配置 */
    }
  }
  return s
}

export async function saveSettings(s: TaskSettings): Promise<void> {
  await window.api.writeFile(SETTINGS_PATH, JSON.stringify(s, null, 2))
}

export async function loadScope(scope: Scope, cfg: TaskSettings): Promise<TaskFile> {
  const p = scopePath(scope, cfg)
  let raw: string
  try {
    raw = await window.api.readFile(p)
  } catch {
    return emptyTaskFile(scope)
  }
  return { ...parseTaskFile(raw), raw }
}

/** 保存清单；返回 false 表示清单已被外部修改，本机版本另存为冲突副本（已提示） */
export async function saveScope(scope: Scope, cfg: TaskSettings, file: TaskFile): Promise<boolean> {
  // 空文件不落盘，避免为每天都生成空清单
  const p = scopePath(scope, cfg)
  if (!file.tasks.length && !(await window.api.exists(p))) return true
  const text = serializeTaskFile(file)
  const copy = await window.api.writeFileChecked(p, text, file.raw ?? null)
  if (copy) {
    toast(`「${p}」已在其他设备或外部被修改，未覆盖。本机版本已另存为「${copy}」，请对照合并`, 10000)
    return false
  }
  file.raw = text
  return true
}

export async function moveTask(task: Task, from: Scope, to: Scope, cfg: TaskSettings): Promise<void> {
  const src = await loadScope(from, cfg)
  const dst = await loadScope(to, cfg)
  src.tasks = src.tasks.filter((t) => t.id !== task.id && !sameTask(t, task))
  dst.tasks.push({ ...task })
  // 目标清单冲突时不从原清单移除，任务不会两头都丢
  if (await saveScope(to, cfg, dst)) await saveScope(from, cfg, src)
}

/** 重新解析后 id 会变化，用内容判断是否为同一任务 */
export const sameTask = (a: Task, b: Task): boolean => a.title === b.title && a.link === b.link && a.done === b.done

/** 内置模板 + 库内模板文件夹里的 .md（同名覆盖内置） */
export async function loadTemplates(cfg: TaskSettings): Promise<NoteTemplate[]> {
  const prefix = cfg.templateFolder ? cfg.templateFolder + '/' : ''
  const files = prefix ? (await window.api.listFiles()).filter((f) => !f.isDir && f.path.startsWith(prefix) && f.path.endsWith('.md')) : []
  const vault: NoteTemplate[] = []
  for (const f of files) {
    try {
      vault.push({ name: f.path.slice(prefix.length, -3), body: await window.api.readFile(f.path), path: f.path })
    } catch {
      /* 文件已被删除 */
    }
  }
  return mergeTemplates(vault)
}

/** 把内置模板写到模板文件夹（已存在的不覆盖），方便直接修改；返回第一个模板的链接目标 */
export async function exportBuiltinTemplates(cfg: TaskSettings): Promise<string> {
  const folder = cfg.templateFolder || DEFAULT_SETTINGS.templateFolder
  for (const t of BUILTIN_TEMPLATES) {
    const rel = `${folder}/${t.name}.md`
    if (!(await window.api.exists(rel))) await window.api.writeFile(rel, t.body)
  }
  return `${folder}/${BUILTIN_TEMPLATES[0].name}`
}

const LAST_TEMPLATE_KEY = 'kitenote.lastTemplate'

/** 上次使用的模板名（设备本地记忆） */
export function lastTemplateName(): string {
  try {
    return localStorage.getItem(LAST_TEMPLATE_KEY) || BUILTIN_TEMPLATES[0].name
  } catch {
    return BUILTIN_TEMPLATES[0].name
  }
}

/** 为任务按模板创建笔记，返回链接目标 */
export async function createNoteForTask(
  task: Task,
  scope: Scope,
  cfg: TaskSettings,
  template: NoteTemplate = BUILTIN_TEMPLATES[0],
  folder = cfg.noteFolder
): Promise<string> {
  const base = `${folder ? folder + '/' : ''}${scope.key} ${safeFileName(task.title)}`
  let rel = `${base}.md`
  for (let i = 2; await window.api.exists(rel); i++) rel = `${base} ${i}.md`
  await window.api.writeFile(rel, renderTemplate(template.body, taskTemplateVars(task.title, scope, cfg)))
  try {
    localStorage.setItem(LAST_TEMPLATE_KEY, template.name)
  } catch {
    /* 忽略 */
  }
  return rel.replace(/\.md$/, '')
}
