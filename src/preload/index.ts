import { contextBridge, ipcRenderer } from 'electron'
import type { VaultApi } from '../shared/types'

const api: VaultApi = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  openVault: (p) => ipcRenderer.invoke('vault:open', p),
  importObsidian: () => ipcRenderer.invoke('vault:import'),
  listFiles: () => ipcRenderer.invoke('fs:list'),
  readFile: (rel) => ipcRenderer.invoke('fs:read', rel),
  writeFile: (rel, content) => ipcRenderer.invoke('fs:write', rel, content),
  writeFileChecked: (rel, content, expected) => ipcRenderer.invoke('fs:write-checked', rel, content, expected),
  exists: (rel) => ipcRenderer.invoke('fs:exists', rel),
  createFolder: (rel) => ipcRenderer.invoke('fs:mkdir', rel),
  rename: (a, b) => ipcRenderer.invoke('fs:rename', a, b),
  trash: (rel) => ipcRenderer.invoke('fs:trash', rel),
  saveAttachment: (name, data, note) => ipcRenderer.invoke('fs:attach', name, data, note),
  copyRich: (p) => ipcRenderer.invoke('clip:rich', p),
  copyImage: (rel) => ipcRenderer.invoke('clip:image', rel),
  search: (q) => ipcRenderer.invoke('fs:search', q),
  reveal: (rel) => ipcRenderer.invoke('fs:reveal', rel),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  onVaultChanged: (cb) => {
    const fn = (_e: unknown, paths: string[]): void => cb(paths)
    ipcRenderer.on('vault:changed', fn)
    return () => ipcRenderer.removeListener('vault:changed', fn)
  }
}

contextBridge.exposeInMainWorld('api', api)
