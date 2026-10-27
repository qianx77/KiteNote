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

const SETTINGS_PATH = '.labnote/settings.json'

export async function loadSettings(): Promise<TaskSettings> {
  let saved: Partial<TaskSettings> = {}
  try {
    saved = JSON.parse(await window.api.readFile(SETTINGS_PATH))
  } catch {
    /* 尚未保存过设置 */
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
  try {
    return parseTaskFile(await window.api.readFile(p))
  } catch {
    return emptyTaskFile(scope)
  }
}

export async function saveScope(scope: Scope, cfg: TaskSettings, file: TaskFile): Promise<void> {
  // 空文件不落盘，避免为每天都生成空清单
  const p = scopePath(scope, cfg)
  if (!file.tasks.length && !(await window.api.exists(p))) return
  await window.api.writeFile(p, serializeTaskFile(file))
}

export async function moveTask(task: Task, from: Scope, to: Scope, cfg: TaskSettings): Promise<void> {
  const src = await loadScope(from, cfg)
  const dst = await loadScope(to, cfg)
  src.tasks = src.tasks.filter((t) => t.id !== task.id && !sameTask(t, task))
  dst.tasks.push({ ...task })
  await saveScope(to, cfg, dst)
  await saveScope(from, cfg, src)
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

const LAST_TEMPLATE_KEY = 'labnote.lastTemplate'

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
