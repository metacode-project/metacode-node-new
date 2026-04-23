import { TRPCError } from '@trpc/server'
import { Prisma } from '../generated/prisma/client'

type TrpcErrorCode = ConstructorParameters<typeof TRPCError>[0]['code']

const PrismaErrorMap: Record<string, { code: TrpcErrorCode, message: string }> = {
  P2002: { code: 'CONFLICT', message: '数据唯一性冲突' },
  P2003: { code: 'BAD_REQUEST', message: '关联数据不存在或受限' },
  P2025: { code: 'NOT_FOUND', message: '数据不存在或已被删除' },
}

function findPrismaKnownError(error: unknown): Prisma.PrismaClientKnownRequestError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error
  }

  if (error && typeof error === 'object' && 'cause' in error) {
    return findPrismaKnownError((error as { cause?: unknown }).cause)
  }

  return null
}

export function getPrismaErrorCode(error: unknown): string | null {
  return findPrismaKnownError(error)?.code ?? null
}

export function mapPrismaError(error: unknown): TRPCError | null {
  const prismaError = findPrismaKnownError(error)
  if (!prismaError) {
    return null
  }

  const mapped = PrismaErrorMap[prismaError.code]
  if (!mapped) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: '数据库操作失败',
      cause: error,
    })
  }

  return new TRPCError({
    code: mapped.code,
    message: mapped.message,
    cause: error,
  })
}
