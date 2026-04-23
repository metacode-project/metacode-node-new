import type { StorageProvider } from './storage-provider'
import { MemoryStorage } from './memory-storage'
import { MinioStorage } from './minio-storage'
import { OssStorage } from './oss-storage'

let storageProvider: StorageProvider | null = null

function detectDriver() {
  const server = process.env.FILE_SERVER?.trim().toLowerCase()
  if (server === 'minio') {
    return 'minio' as const
  }
  if (server === 'oss') {
    return 'oss' as const
  }
  return 'memory' as const
}

export function getStorageProvider() {
  if (storageProvider) {
    return storageProvider
  }

  const driver = detectDriver()
  try {
    if (driver === 'minio') {
      storageProvider = new MinioStorage(process.env.MINIO_BUCKET ?? 'uploads')
    }
    else if (driver === 'oss') {
      storageProvider = new OssStorage(process.env.OSS_BUCKET ?? 'uploads')
    }
    else {
      storageProvider = new MemoryStorage()
    }
  }
  catch (error) {
    console.warn('[file] 初始化对象存储失败，自动回退到内存存储', error)
    storageProvider = new MemoryStorage()
  }

  return storageProvider
}
