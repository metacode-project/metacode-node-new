import { Buffer } from 'node:buffer'
import { TRPCError } from '@trpc/server'
import { md5Credential } from '../../lib/auth'
import { prisma } from '../../lib/prisma'

const numericAccountRegex = /^\d+$/

export interface AuthUser {
  id: string
  username: string
  accountId: string
  state: number
  fullName: string
  avatar: string
  credential: {
    accountId: string
    identifier: string
    type: 'PASSWORD'
  }
  spaces: Array<{
    id: string
    name: string
    identifier: string
  }>
  space: {
    id: string
    name: string
    identifier: string
  } | null
  principals: Array<Record<string, unknown>>
  extendInfo: Record<string, unknown>
  unReadNotificationCount: number
}

async function getUserByAccount(account: string) {
  const whereOr: Array<{ identifier?: string, accountId?: bigint }> = [
    { identifier: account },
  ]
  if (numericAccountRegex.test(account)) {
    whereOr.push({ accountId: BigInt(account) })
  }

  return prisma.authCredential.findFirst({
    where: { OR: whereOr as any },
    include: {
      account: {
        include: {
          user: true,
        },
      },
    },
  })
}

export async function loginByPassword(username: string, password: string): Promise<{ user: AuthUser, token: string, refreshToken: string }> {
  const credential = await getUserByAccount(username)

  if (!credential) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '用户名或密码错误' })
  }

  // metacode 使用 MD5(username + password) 校验
  const passwordHash = md5Credential(username, password)
  if (credential.credential !== passwordHash) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '用户名或密码错误' })
  }

  const account = credential.account
  if (!account) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '账号不存在' })
  }

  const user = account.user[0]
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '用户不存在' })
  }

  return {
    user: await buildCurrentUserDto(user, account, credential),
    token: '',
    refreshToken: '',
  }
}

export async function getUserByToken(token: string): Promise<AuthUser> {
  if (!token) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Token is missing' })
  }

  // Parse JWT payload without verification (authedProcedure already verified it)
  const payload = parseJwtPayload(token)
  if (!payload) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid token' })
  }

  const user = await prisma.user.findUnique({ where: { id: BigInt(payload.sub) } })
  const account = await prisma.account.findUnique({ where: { id: BigInt(payload.accountId) } })

  if (!user || !account) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '账号不存在' })
  }

  const credential = await prisma.authCredential.findFirst({
    where: { accountId: account.id },
  })

  return await buildCurrentUserDto(user, account, credential)
}

function parseJwtPayload(token: string): { sub: string, username: string, accountId: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3)
      return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string')
      return null
    return payload
  }
  catch {
    return null
  }
}

async function buildCurrentUserDto(user: any, account: any, credential: any): Promise<AuthUser> {
  const username = credential?.identifier ?? account?.username ?? user?.username ?? ''

  const spaces = await prisma.accountSpace.findMany({
    where: { accountId: account.id },
    include: { space: true },
  })

  let defaultSpace = null
  if (account.defaultSpaceId) {
    const space = await prisma.space.findUnique({ where: { id: account.defaultSpaceId } })
    if (space) {
      defaultSpace = {
        id: space.id.toString(),
        name: space.name || '',
        identifier: space.key || '',
      }
    }
  }

  return {
    id: user.id.toString(),
    username,
    accountId: account.id.toString(),
    state: Number(account.state ?? user.state ?? 1),
    fullName: account.fullName || '',
    avatar: account.avatar || '',
    credential: {
      accountId: account.id.toString(),
      identifier: credential?.identifier ?? username,
      type: 'PASSWORD' as const,
    },
    spaces: spaces.map(as => ({
      id: as.space.id.toString(),
      name: as.space.name || '',
      identifier: as.space.key || '',
    })),
    space: defaultSpace,
    principals: [],
    extendInfo: {},
    unReadNotificationCount: 0,
  }
}
