import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '../src/generated/prisma/client'
import type { AppRouter } from '../src/rpc/router'
import { randomUUID } from 'node:crypto'
import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from '@trpc/client'
import superjson from 'superjson'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { md5Credential } from '../src/lib/auth'
import { nextSnowflakeId } from '../src/lib/snowflake'

let app: FastifyInstance
let prisma: PrismaClient
let noAuthClient: ReturnType<typeof createTRPCProxyClient<AppRouter>>
let authClient: ReturnType<typeof createTRPCProxyClient<AppRouter>>
let account: string
let password: string
let createdAuthUserId: bigint | null = null
let createdAccountId: bigint | null = null
let createdCredentialId: bigint | null = null

describe('auth module tRPC integration', () => {
  beforeAll(async () => {
    const [{ buildApp }, prismaModule] = await Promise.all([
      import('../src/app'),
      import('../src/lib/prisma'),
    ])

    prisma = prismaModule.prisma
    app = buildApp()
    await app.listen({ host: '127.0.0.1', port: 0 })

    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve app server address')
    }

    const baseUrl = `http://127.0.0.1:${address.port}/rpc`
    noAuthClient = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: baseUrl,
          transformer: superjson,
        }),
      ],
    })

    const suffix = randomUUID().slice(0, 8)
    account = `vitest-auth-${suffix}`
    password = `secret-${suffix}`
    const createdAccount = await prisma.account.create({
      data: {
        username: account,
        fullName: `测试用户-${suffix}`,
        state: 1,
      },
      select: { id: true },
    })
    createdAccountId = createdAccount.id

    const user = await prisma.user.create({
      data: {
        id: nextSnowflakeId(),
        state: 1,
        username: account,
        accountId: createdAccount.id,
      },
      select: { id: true },
    })
    createdAuthUserId = user.id

    const credential = await prisma.authCredential.create({
      data: {
        identifier: account,
        credential: md5Credential(account, password),
        identityType: 1,
        accountId: createdAccount.id,
      },
      select: { id: true },
    })
    createdCredentialId = credential.id

    const loginResult = await noAuthClient.auth.login.mutate({ account, password })
    authClient = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: baseUrl,
          transformer: superjson,
          headers() {
            return { authorization: `Bearer ${loginResult.token}` }
          },
        }),
      ],
    })
  }, 30_000)

  afterAll(async () => {
    if (createdCredentialId && prisma) {
      await prisma.authCredential.delete({ where: { id: createdCredentialId } })
    }
    if (createdAuthUserId && prisma) {
      await prisma.user.delete({ where: { id: createdAuthUserId } })
    }
    if (createdAccountId && prisma) {
      await prisma.account.delete({ where: { id: createdAccountId } })
    }
    if (app) {
      await app.close()
    }
    if (prisma) {
      await prisma.$disconnect()
    }
  })

  it('logs in with account and password', async () => {
    const result = await noAuthClient.auth.login.mutate({
      account,
      password,
    })

    expect(result.token.length).toBeGreaterThan(0)
    expect(result.user.id).toBe(createdAuthUserId?.toString())
    expect(result.user.username).toBe(account)
  })

  it('returns current user profile for authenticated request', async () => {
    const me = await authClient.auth.me.query()

    expect(me.id).toBe(createdAuthUserId?.toString())
    expect(me.username).toBe(account)
    expect(me.state).toBe(1)
  })

  it('rejects unauthenticated me query', async () => {
    try {
      await noAuthClient.auth.me.query()
      throw new Error('Expected unauthenticated request to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCClientError)
      expect((error as TRPCClientError<AppRouter>).data?.code).toBe('UNAUTHORIZED')
    }
  })
})
