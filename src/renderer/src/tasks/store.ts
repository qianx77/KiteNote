import {
  DEFAULT_SETTINGS,
  emptyTaskFile,
  noteTemplate,
  parseTaskFile,
  safeFileName,
  scopePath,
  serializeTaskFile,
  type Scope,
  type Task,
  type TaskFile,
  type TaskSettings
} from './model'

const SETTINGS_PATH = '.labnote/settings.json'

export async function loadSettings(): Promise<TaskSettings> {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await window.api.readFile(SETTINGS_PATH)) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
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

/** 为任务创建实验笔记（若不存在），返回链接目标 */
export async function createNoteForTask(task: Task, scope: Scope, cfg: TaskSettings, folder = cfg.noteFolder): Promise<string> {
  const base = `${folder ? folder + '/' : ''}${scope.key} ${safeFileName(task.title)}`
  let rel = `${base}.md`
  for (let i = 2; await window.api.exists(rel); i++) rel = `${base} ${i}.md`
  await window.api.writeFile(rel, noteTemplate(task.title, scope, cfg))
  return rel.replace(/\.md$/, '')
}
