import type { VaultApi } from '../../shared/types'

declare global {
  interface Window {
    api: VaultApi
  }
}

export {}
