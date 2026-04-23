import type { AddFileInput, CreateFileInput, FileListInput, FileSignedUrlInput } from './dto'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { prisma } from '../../lib/prisma'
import { nextSnowflakeId } from '../../lib/snowflake'
import { getStorageProvider } from './storage'

const fileSelect = {
  id: true,
  key: true,
  name: true,
  size: true,
  type: true,
  url: true,
  storageId: true,
  createTime: true,
} as const

interface FileRow {
  id: bigint
  key: string | null
  name: string | null
  size: bigint | null
  type: string | null
  url: string | null
  storageId: string | null
  createTime: Date | null
}

function normalizeFile(file: FileRow) {
  return {
    id: file.id,
    key: file.key ?? '',
    name: file.name ?? '',
    size: file.size ?? 0n,
    type: file.type ?? 'application/octet-stream',
    url: file.url ?? '',
    storageId: file.storageId,
    createTime: file.createTime,
  }
}

function buildFetchUrl(key: string) {
  return `/file/fetch/${encodeURIComponent(key)}`
}

function sanitizeFileName(filename: string) {
  return filename.replace(/[^\w.-]/g, '_')
}

function decodeBase64(contentBase64: string) {
  const parts = contentBase64.split(',')
  const normalized = parts.length > 1 ? parts.at(-1) : contentBase64
  const buffer = Buffer.from(normalized!, 'base64')

  if (buffer.byteLength === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '文件内容不能为空' })
  }

  return buffer
}

async function createFileRecord(input: {
  key: string
  name: string
  type: string
  size: bigint
}) {
  const file = await prisma.storageFile.create({
    data: {
      id: nextSnowflakeId(),
      key: input.key,
      name: input.name,
      type: input.type,
      size: input.size,
      url: buildFetchUrl(input.key),
      storageId: process.env.FILE_SERVER?.trim() || 'memory',
      createTime: new Date(),
    },
    select: fileSelect,
  })

  return normalizeFile(file)
}

export async function listFiles(input: FileListInput) {
  const page = input?.page ?? 1
  const pageSize = input?.pageSize ?? 20
  const keyword = input?.keyword?.trim()
  const where = keyword
    ? {
        OR: [
          { key: { contains: keyword } },
          { name: { contains: keyword } },
        ],
      }
    : undefined

  const [items, total] = await prisma.$transaction([
    prisma.storageFile.findMany({
      where,
      orderBy: [{ createTime: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: fileSelect,
    }),
    prisma.storageFile.count({ where }),
  ])

  return {
    items: items.map(normalizeFile),
    total,
  }
}

export async function createFile(input: CreateFileInput) {
  const storage = getStorageProvider()
  await storage.ensureBucket()

  const key = input.key?.trim() || `${randomUUID()}_${sanitizeFileName(input.name)}`
  const body = decodeBase64(input.contentBase64)

  await storage.putObject(key, body)

  return createFileRecord({
    key,
    name: input.name.trim(),
    type: input.type.trim(),
    size: BigInt(body.byteLength),
  })
}

export async function addFile(input: AddFileInput) {
  const key = input.key.trim()
  const storage = getStorageProvider()
  const metadata = await storage.getObjectMeta(key).catch(() => null)

  if (!metadata) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `找不到文件：${key}` })
  }

  return createFileRecord({
    key,
    name: input.name.trim(),
    type: metadata.type,
    size: metadata.size,
  })
}

export async function getSignedUrl(input: FileSignedUrlInput) {
  const file = await prisma.storageFile.findUnique({
    where: { key: input.key },
    select: { key: true },
  })

  if (!file?.key) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `找不到文件：${input.key}` })
  }

  const storage = getStorageProvider()
  const url = await storage.getSignedUrl(file.key, input.expires)
  return { url }
}

export async function getStorageToken() {
  const storage = getStorageProvider()
  return storage.getStsToken()
}

export async function listStorageBuckets() {
  const storage = getStorageProvider()
  return storage.listBuckets()
}

export async function getFileStreamByKey(key: string) {
  const file = await prisma.storageFile.findUnique({
    where: { key },
    select: { key: true, name: true, type: true },
  })

  if (!file?.key) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `找不到文件：${key}` })
  }

  const storage = getStorageProvider()
  const stream = await storage.getFileStream(file.key)

  return {
    stream,
    name: file.name ?? file.key,
    type: file.type ?? 'application/octet-stream',
  }
}
