export interface FileEntry {
  /** 相对库根目录的 posix 路径，如 `实验/exp-001.md` */
  path: string
  isDir: boolean
  mtime: number
  size: number
}

export interface AppConfig {
  vaultPath: string | null
  recentVaults: string[]
}

export interface ImportReport {
  ok: boolean
  source: string
  target: string
  files: number
  bytes: number
  mismatched: string[]
  message: string
}

export interface SearchHit {
  path: string
  line: number
  text: string
}

export interface VaultApi {
  getConfig(): Promise<AppConfig>
  chooseVault(): Promise<AppConfig>
  openVault(path: string): Promise<AppConfig>
  importObsidian(): Promise<ImportReport | null>
  listFiles(): Promise<FileEntry[]>
  readFile(rel: string): Promise<string>
  writeFile(rel: string, content: string): Promise<void>
  exists(rel: string): Promise<boolean>
  createFolder(rel: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  trash(rel: string): Promise<void>
  saveAttachment(fileName: string, data: Uint8Array, notePath: string): Promise<string>
  copyRich(payload: { html: string; text: string }): Promise<void>
  copyImage(rel: string): Promise<void>
  search(query: string): Promise<SearchHit[]>
  reveal(rel: string): Promise<void>
  openExternal(url: string): Promise<void>
  onVaultChanged(cb: (paths: string[]) => void): () => void
}
