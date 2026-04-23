import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '../src/generated/prisma/client'
import type { AppRouter } from '../src/rpc/router'
import { randomUUID } from 'node:crypto'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { jwtSignOptions } from '../src/lib/auth'
import { nextSnowflakeId } from '../src/lib/snowflake'

let app: FastifyInstance
let prisma: PrismaClient
let trpcClient: ReturnType<typeof createTRPCProxyClient<AppRouter>>
let createdAuthUserId: bigint | null = null
const createdAppIds = new Set<string>()

describe('design module tRPC integration', () => {
  beforeAll(async () => {
    const [{ buildApp }, prismaModule] = await Promise.all([
      import('../src/app'),
      import('../src/lib/prisma'),
    ])

    prisma = prismaModule.prisma
    app = buildApp()
    await app.listen({
      host: '127.0.0.1',
      port: 0,
    })

    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve app server address')
    }

    const username = `vitest-design-${randomUUID().slice(0, 8)}`
    const user = await prisma.user.create({
      data: {
        id: nextSnowflakeId(),
        state: 1,
        username,
      },
      select: { id: true, username: true },
    })
    createdAuthUserId = user.id

    const jwt = (app as FastifyInstance & {
      jwt: {
        sign: (payload: object, options?: object) => string
      }
    }).jwt

    const token = jwt.sign({
      sub: user.id.toString(),
      username: user.username ?? username,
      accountId: '0',
    }, jwtSignOptions)

    trpcClient = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `http://127.0.0.1:${address.port}/rpc`,
          transformer: superjson,
          headers() {
            return {
              authorization: `Bearer ${token}`,
            }
          },
        }),
      ],
    })
  })

  afterEach(async () => {
    await cleanupCreatedApps()
  })

  afterAll(async () => {
    await cleanupCreatedApps()
    if (createdAuthUserId) {
      await prisma.user.delete({
        where: {
          id: createdAuthUserId,
        },
      })
    }
    await app.close()
    await prisma.$disconnect()
  })

  it('completes app create/list/get/version/update/delete lifecycle', async () => {
    const suffix = randomUUID().slice(0, 8)
    const created = await trpcClient.design.apps.create.mutate({
      name: `design-app-${suffix}`,
      description: `description-${suffix}`,
    })
    createdAppIds.add(created.appId)

    expect(created.appId).toBeTypeOf('string')
    expect(created.name).toBe(`design-app-${suffix}`)
    expect(created.appBranches?.length).toBe(1)
    expect(created.appBranches?.[0]?.name).toBe('dev')

    const list = await trpcClient.design.apps.list.query()
    expect(list.some(item => item.appId === created.appId)).toBe(true)

    const detail = await trpcClient.design.apps.get.query({
      appId: created.appId,
    })
    expect(detail.appId).toBe(created.appId)
    expect(detail.description).toBe(`description-${suffix}`)

    const version = await trpcClient.design.apps.version.query({
      appId: created.appId,
    })
    expect(version).toEqual({
      appId: created.appId,
      version: null,
    })

    const updated = await trpcClient.design.apps.update.mutate({
      appId: created.appId,
      description: `updated-description-${suffix}`,
      status: 'MAINTENANCE',
    })
    expect(updated.description).toBe(`updated-description-${suffix}`)
    expect(updated.status).toBe('MAINTENANCE')

    const deleted = await trpcClient.design.apps.delete.mutate({
      appId: created.appId,
    })
    expect(deleted).toEqual({ success: true })

    const listAfterDelete = await trpcClient.design.apps.list.query()
    expect(listAfterDelete.some(item => item.appId === created.appId)).toBe(false)
  })

  it('clones branch definitions including items and views', async () => {
    const suffix = randomUUID().slice(0, 8)
    const { appId, branchId } = await createAppWithDefaultBranch(`clone-app-${suffix}`)

    const itemId = `item-${randomUUID()}`
    const viewId = `view-${randomUUID()}`

    await trpcClient.design.items.create.mutate({
      appId,
      branchId,
      appItemId: itemId,
      name: `item-${suffix}`,
      type: 'ITEM',
      client: 'PC',
    })

    await trpcClient.design.views.create.mutate({
      appId,
      itemId,
      branchId,
      appViewId: viewId,
      name: `view-${suffix}`,
      type: 'TABLE_VIEW',
      platform: 'PC',
      scene: 'LIST',
      content: '{"version":1}',
    })

    const newBranch = await trpcClient.design.branches.create.mutate({
      appId,
      name: `feature-${suffix}`,
      sourceBranchId: branchId,
    })

    const clonedItems = await trpcClient.design.items.list.query({
      appId,
      branchId: newBranch.id,
    })
    expect(clonedItems.some(item => item.appItemId === itemId)).toBe(true)

    const clonedViews = await trpcClient.design.views.list.query({
      appId,
      itemId,
      branchId: newBranch.id,
    })
    expect(clonedViews.some(view => view.appViewId === viewId)).toBe(true)
  })

  it('restores a view from history records', async () => {
    const suffix = randomUUID().slice(0, 8)
    const { appId, branchId } = await createAppWithDefaultBranch(`history-app-${suffix}`)

    const itemId = `item-${randomUUID()}`
    const viewId = `view-${randomUUID()}`

    await trpcClient.design.items.create.mutate({
      appId,
      branchId,
      appItemId: itemId,
      name: `item-${suffix}`,
      type: 'ITEM',
      client: 'PC',
    })

    await trpcClient.design.views.create.mutate({
      appId,
      itemId,
      branchId,
      appViewId: viewId,
      name: 'v1-name',
      type: 'TABLE_VIEW',
      platform: 'PC',
      scene: 'LIST',
      content: 'v1-content',
    })

    await trpcClient.design.views.update.mutate({
      appId,
      itemId,
      viewId,
      branchId,
      name: 'v2-name',
      content: 'v2-content',
      type: 'CARD_VIEW',
      platform: 'H5',
    })

    const histories = await trpcClient.design.views.history.query({
      appId,
      itemId,
      viewId,
      branchId,
    })
    expect(histories.length).toBeGreaterThanOrEqual(2)

    const earliestHistory = histories[histories.length - 1]
    const restored = await trpcClient.design.views.restore.mutate({
      appId,
      itemId,
      viewId,
      historyId: earliestHistory.id,
      branchId,
    })

    expect(restored.name).toBe('v1-name')
    expect(restored.content).toBe('v1-content')
    expect(restored.type).toBe('TABLE_VIEW')
    expect(restored.platform).toBe('PC')
  })

  it('deploys branch definitions and restores by deployment history', async () => {
    const suffix = randomUUID().slice(0, 8)
    const { appId, branchId } = await createAppWithDefaultBranch(`deploy-app-${suffix}`)

    const itemId = `item-${randomUUID()}`
    await trpcClient.design.items.create.mutate({
      appId,
      branchId,
      appItemId: itemId,
      name: 'before-deploy-name',
      type: 'ITEM',
      client: 'PC',
    })

    await trpcClient.design.views.create.mutate({
      appId,
      itemId,
      branchId,
      appViewId: `view-${randomUUID()}`,
      name: 'deploy-view',
      type: 'TABLE_VIEW',
      platform: 'PC',
      scene: 'LIST',
    })

    const deploymentVersion = `v-${Date.now()}`
    const deployed = await trpcClient.design.deployment.create.mutate({
      appId,
      branchId,
      version: deploymentVersion,
      remark: 'initial deploy',
    })
    expect(deployed.version).toBe(deploymentVersion)

    const runtimeApp = await prisma.app.findUnique({
      where: { id: appId },
      select: { id: true, version: true },
    })
    expect(runtimeApp?.id).toBe(appId)
    expect(runtimeApp?.version).toBe(deploymentVersion)

    const runtimeItems = await prisma.appItem.findMany({
      where: { appId },
      select: { id: true },
    })
    expect(runtimeItems.length).toBeGreaterThan(0)

    await trpcClient.design.items.update.mutate({
      appId,
      itemId,
      branchId,
      name: 'after-deploy-name',
    })

    const changedItem = await trpcClient.design.items.get.query({
      appId,
      itemId,
      branchId,
    })
    expect(changedItem.name).toBe('after-deploy-name')

    const deploymentHistories = await trpcClient.design.deployment.history.query({
      appId,
      branchId,
    })
    const targetHistory = deploymentHistories.find(history => history.version === deploymentVersion)
    expect(targetHistory).toBeTruthy()

    const restored = await trpcClient.design.deployment.restore.mutate({
      appId,
      historyId: targetHistory!.id,
      branchId,
    })
    expect(restored).toEqual({ success: true })

    const restoredItem = await trpcClient.design.items.get.query({
      appId,
      itemId,
      branchId,
    })
    expect(restoredItem.name).toBe('before-deploy-name')
  })
})

async function createAppWithDefaultBranch(name: string) {
  const created = await trpcClient.design.apps.create.mutate({ name })
  createdAppIds.add(created.appId)

  const detail = await trpcClient.design.apps.get.query({
    appId: created.appId,
  })
  const branchId = detail.appBranches?.[0]?.id
  if (!branchId) {
    throw new Error(`App ${created.appId} has no default branch`)
  }

  return {
    appId: created.appId,
    branchId,
  }
}

async function cleanupCreatedApps() {
  if (createdAppIds.size === 0) {
    return
  }

  const appIds = [...createdAppIds]
  createdAppIds.clear()

  for (const appId of appIds) {
    await cleanupAppById(appId)
  }
}

async function cleanupAppById(appId: string) {
  const definitionItems = await prisma.mdAppItemDefinition.findMany({
    where: { appId },
    select: {
      id: true,
      appItemId: true,
    },
  })

  const definitionItemIds = definitionItems.map(item => item.id)
  const appItemIds = definitionItems
    .map(item => item.appItemId)
    .filter((itemId): itemId is string => Boolean(itemId))

  await prisma.$transaction(async (tx) => {
    if (appItemIds.length > 0) {
      const runtimeAuths = await tx.appDataAuthorization.findMany({
        where: {
          appItemId: {
            in: appItemIds,
          },
        },
        select: { id: true },
      })

      const runtimeAuthIds = runtimeAuths.map(item => item.id)
      if (runtimeAuthIds.length > 0) {
        await tx.appDataPermissionControl.deleteMany({
          where: {
            authorizationId: {
              in: runtimeAuthIds,
            },
          },
        })
      }

      await tx.appDataAuthorization.deleteMany({
        where: {
          appItemId: {
            in: appItemIds,
          },
        },
      })
      await tx.appView.deleteMany({
        where: {
          appItemId: {
            in: appItemIds,
          },
        },
      })
      await tx.appRule.deleteMany({
        where: {
          appItemId: {
            in: appItemIds,
          },
        },
      })
    }

    await tx.appItem.updateMany({
      where: { appId },
      data: { parentId: null },
    })
    await tx.appItem.deleteMany({
      where: { appId },
    })
    await tx.app.deleteMany({
      where: { id: appId },
    })

    if (definitionItemIds.length > 0) {
      await tx.mdAppDataPermissionControlDefinition.deleteMany({
        where: {
          appId,
          appItemDefinitionId: {
            in: definitionItemIds,
          },
        },
      })
    }

    await tx.mdAppDataAuthorizationDefinition.deleteMany({
      where: { appId },
    })
    await tx.mdAppViewDefinitionHistory.deleteMany({
      where: { appId },
    })
    await tx.mdAppViewDefinition.deleteMany({
      where: { appId },
    })
    await tx.mdAppItemDefinition.deleteMany({
      where: { appId },
    })
    await tx.mdAppBranch.deleteMany({
      where: { appId },
    })
    await tx.mdAppDeploymentHistory.deleteMany({
      where: { appId },
    })
    await tx.mdAppDefinition.deleteMany({
      where: { appId },
    })
  })
}
