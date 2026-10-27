import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, net, protocol, shell } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { importVault, Vault } from './vault'
import type { AppConfig } from '../shared/types'

// 便于测试/便携使用：指定独立的配置目录
if (process.env.LABNOTE_USER_DATA) app.setPath('userData', process.env.LABNOTE_USER_DATA)

protocol.registerSchemesAsPrivileged([
  { scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

// 设备本地配置（不放进库里，避免多设备同步冲突）
const configFile = (): string => path.join(app.getPath('userData'), 'config.json')
let config: AppConfig = { vaultPath: null, recentVaults: [] }
let vault: Vault | null = null
let win: BrowserWindow | null = null

async function loadConfig(): Promise<void> {
  try {
    config = { ...config, ...JSON.parse(await fs.readFile(configFile(), 'utf8')) }
  } catch {
    /* 首次启动 */
  }
}

async function saveConfig(): Promise<void> {
  await fs.mkdir(path.dirname(configFile()), { recursive: true })
  await fs.writeFile(configFile(), JSON.stringify(config, null, 2))
}

async function setVault(p: string): Promise<AppConfig> {
  await fs.mkdir(p, { recursive: true })
  vault?.unwatch()
  vault = new Vault(path.resolve(p))
  vault.watch((paths) => win?.webContents.send('vault:changed', paths))
  config.vaultPath = vault.root
  config.recentVaults = [vault.root, ...config.recentVaults.filter((v) => v !== vault!.root)].slice(0, 8)
  await saveConfig()
  return config
}

function requireVault(): Vault {
  if (!vault) throw new Error('尚未打开库')
  return vault
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp'
}

/** vault://file/<相对路径> → 相对路径 */
function relFromVaultUrl(url: string): string {
  const u = new URL(url)
  return decodeURIComponent(u.pathname.replace(/^\/+/, ''))
}

/**
 * 复制到钉钉文档等外部应用：把 HTML 中引用本地库的图片转成 base64 内嵌，
 * 外部应用无需访问本机文件即可显示图片；同时附带 Markdown 纯文本。
 */
async function copyRich(html: string, text: string): Promise<void> {
  const v = requireVault()
  const srcs = [...html.matchAll(/<img[^>]+src="(vault:\/\/[^"]+)"/g)].map((m) => m[1])
  let onlyImage: Electron.NativeImage | null = null
  for (const src of new Set(srcs)) {
    try {
      const rel = relFromVaultUrl(src.replace(/&amp;/g, '&'))
      const buf = await v.readBinary(rel)
      const mime = MIME[path.extname(rel).toLowerCase()] ?? 'image/png'
      html = html.split(src).join(`data:${mime};base64,${buf.toString('base64')}`)
      if (srcs.length === 1) onlyImage = nativeImage.createFromBuffer(buf)
    } catch (err) {
      console.warn('图片转换失败', src, err)
    }
  }
  const textOnly = html.replace(/<img[^>]*>/g, '').replace(/<[^>]+>/g, '').trim()
  const fullHtml = `<html><body><meta charset="utf-8">${html}</body></html>`
  if (onlyImage && !onlyImage.isEmpty() && !textOnly) {
    // 只选中了一张图：同时写入位图，粘贴到任意应用都能得到图片
    clipboard.write({ html: fullHtml, image: onlyImage })
  } else {
    clipboard.write({ html: fullHtml, text })
  }
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => config)
  ipcMain.handle('vault:choose', async () => {
    const r = await dialog.showOpenDialog(win!, { title: '选择笔记库文件夹（可直接选 Obsidian 库）', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return config
    return setVault(r.filePaths[0])
  })
  ipcMain.handle('vault:open', (_e, p: string) => setVault(p))
  ipcMain.handle('vault:import', async () => {
    const src = await dialog.showOpenDialog(win!, { title: '第 1 步：选择要导入的 Obsidian 库', properties: ['openDirectory'] })
    if (src.canceled || !src.filePaths[0]) return null
    const dst = await dialog.showOpenDialog(win!, {
      title: '第 2 步：选择新库存放位置（建议放在同步盘目录内，需为空文件夹）',
      properties: ['openDirectory', 'createDirectory']
    })
    if (dst.canceled || !dst.filePaths[0]) return null
    let target = dst.filePaths[0]
    try {
      if ((await fs.readdir(target)).length > 0) target = path.join(target, path.basename(src.filePaths[0]))
    } catch {
      /* ignore */
    }
    const report = await importVault(src.filePaths[0], target)
    if (report.ok) await setVault(target)
    return report
  })
  ipcMain.handle('fs:list', () => requireVault().list())
  ipcMain.handle('fs:read', (_e, rel: string) => requireVault().read(rel))
  ipcMain.handle('fs:write', (_e, rel: string, content: string) => requireVault().write(rel, content))
  ipcMain.handle('fs:exists', (_e, rel: string) => requireVault().exists(rel))
  ipcMain.handle('fs:mkdir', (_e, rel: string) => requireVault().mkdir(rel))
  ipcMain.handle('fs:rename', (_e, a: string, b: string) => requireVault().rename(a, b))
  ipcMain.handle('fs:trash', (_e, rel: string) => shell.trashItem(requireVault().abs(rel)))
  ipcMain.handle('fs:attach', (_e, name: string, data: Uint8Array, note: string) =>
    requireVault().saveAttachment(name, Buffer.from(data), note)
  )
  ipcMain.handle('fs:search', (_e, q: string) => requireVault().search(q))
  ipcMain.handle('fs:reveal', (_e, rel: string) => shell.showItemInFolder(requireVault().abs(rel)))
  ipcMain.handle('clip:rich', (_e, p: { html: string; text: string }) => copyRich(p.html, p.text))
  ipcMain.handle('clip:image', async (_e, rel: string) => {
    clipboard.writeImage(nativeImage.createFromBuffer(await requireVault().readBinary(rel)))
  })
  ipcMain.handle('shell:open', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'LabNote',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) shell.openExternal(url)
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  await loadConfig()
  if (config.vaultPath) {
    try {
      await setVault(config.vaultPath)
    } catch {
      config.vaultPath = null
    }
  }
  protocol.handle('vault', async (req) => {
    try {
      const full = requireVault().abs(relFromVaultUrl(req.url))
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => {
  vault?.unwatch()
  app.quit()
})
