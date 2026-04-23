import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '../src/generated/prisma/client'
import type { AppRouter } from '../src/rpc/router'
import { randomUUID } from 'node:crypto'
import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from '@trpc/client'
import superjson from 'superjson'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { nextSnowflakeId } from '../src/lib/snowflake'

let app: FastifyInstance
let prisma: PrismaClient
let trpcClient: ReturnType<typeof createTRPCProxyClient<AppRouter>>

const createdAppIds = new Set<string>()
const createdItemIds = new Set<string>()
const createdSchemaIds = new Set<bigint>()
const createdTableIds = new Set<bigint>()
const createdRelationIds = new Set<bigint>()

describe('runtime module tRPC integration', () => {
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

    trpcClient = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `http://127.0.0.1:${address.port}/rpc`,
          transformer: superjson,
        }),
      ],
    })
  }, 30_000)

  afterEach(async () => {
    await cleanupRuntimeData()
  })

  afterAll(async () => {
    await cleanupRuntimeData()
    await app.close()
    await prisma.$disconnect()
  })

  it('lists apps and gets app detail', async () => {
    const suffix = randomUUID().slice(0, 8)
    const tenantId = `tenant-runtime-${suffix}`
    const appId = `runtime-app-${suffix}`
    const schemaKey = `runtime-schema-${suffix}`

    const schema = await prisma.schema.create({
      data: {
        key: schemaKey,
        name: `runtime-schema-name-${suffix}`,
        tenantId,
      },
    })
    createdSchemaIds.add(schema.id)

    await prisma.app.create({
      data: {
        id: appId,
        name: `runtime-app-name-${suffix}`,
        description: `runtime-app-desc-${suffix}`,
        schemaId: schema.id,
        tenantId,
        version: '1.0.0',
      },
    })
    createdAppIds.add(appId)

    const apps = await trpcClient.runtime.apps.list.query()
    const listed = apps.find(item => item.id === appId)
    expect(listed).toBeDefined()
    expect(listed?.name).toBe(`runtime-app-name-${suffix}`)

    const appDetail = await trpcClient.runtime.apps.get.query({ appId })
    expect(appDetail.id).toBe(appId)
    expect(appDetail.schema).toBe(schemaKey)
    expect(appDetail.description).toBe(`runtime-app-desc-${suffix}`)
  })

  it('returns NOT_FOUND when app does not exist', async () => {
    try {
      await trpcClient.runtime.apps.get.query({
        appId: `missing-app-${randomUUID()}`,
      })
      throw new Error('Expected missing app query to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCClientError)
      expect((error as TRPCClientError<AppRouter>).data?.code).toBe('NOT_FOUND')
    }
  })

  it('returns nested menu tree by parentId', async () => {
    const suffix = randomUUID().slice(0, 8)
    const appId = `runtime-tree-app-${suffix}`
    const tenantId = `tenant-tree-${suffix}`
    const rootId = `runtime-root-${suffix}`
    const childId = `runtime-child-${suffix}`

    await prisma.app.create({
      data: {
        id: appId,
        name: `runtime-tree-app-name-${suffix}`,
        tenantId,
      },
    })
    createdAppIds.add(appId)

    await prisma.appItem.create({
      data: {
        id: rootId,
        appId,
        name: `root-${suffix}`,
        type: 'ITEM_GROUP',
        sortIndex: 1,
        tenantId,
      },
    })
    createdItemIds.add(rootId)

    await prisma.appItem.create({
      data: {
        id: childId,
        appId,
        parentId: rootId,
        name: `child-${suffix}`,
        type: 'ITEM',
        sortIndex: 2,
        tenantId,
      },
    })
    createdItemIds.add(childId)

    const menuTree = await trpcClient.runtime.apps.listItems.query({ appId })
    expect(menuTree).toHaveLength(1)
    expect(menuTree[0].id).toBe(rootId)
    expect(menuTree[0].children).toHaveLength(1)
    expect(menuTree[0].children[0].id).toBe(childId)
  })

  it('returns app item detail with views and form/subForms', async () => {
    const suffix = randomUUID().slice(0, 8)
    const tenantId = `tenant-item-${suffix}`
    const appId = `runtime-item-app-${suffix}`
    const appItemId = `runtime-item-${suffix}`
    const viewId = `runtime-view-${suffix}`

    const schema = await prisma.schema.create({
      data: {
        key: `runtime-item-schema-${suffix}`,
        name: `runtime-item-schema-name-${suffix}`,
        tenantId,
      },
    })
    createdSchemaIds.add(schema.id)

    const mainTable = await prisma.schemaTable.create({
      data: {
        schemaId: schema.id,
        key: `runtime-main-table-${suffix}`,
        name: `runtime-main-table-name-${suffix}`,
        tenantId,
      },
    })
    createdTableIds.add(mainTable.id)

    const subTable = await prisma.schemaTable.create({
      data: {
        schemaId: schema.id,
        key: `runtime-sub-table-${suffix}`,
        name: `runtime-sub-table-name-${suffix}`,
        tenantId,
      },
    })
    createdTableIds.add(subTable.id)

    await prisma.schemaField.create({
      data: {
        index: 1,
        tableId: mainTable.id,
        name: '主字段',
        key: `main_field_${suffix}`,
        type: 'STRING',
        tenantId,
      },
    })

    await prisma.schemaField.create({
      data: {
        index: 1,
        tableId: subTable.id,
        name: '子字段',
        key: `sub_field_${suffix}`,
        type: 'STRING',
        tenantId,
      },
    })

    const relationId = nextSnowflakeId()
    createdRelationIds.add(relationId)
    await prisma.schemaRelation.create({
      data: {
        id: relationId,
        tableId: mainTable.id,
        referenceTableId: subTable.id,
        cascadeDelete: false,
        tenantId,
      },
    })

    await prisma.app.create({
      data: {
        id: appId,
        name: `runtime-item-app-name-${suffix}`,
        schemaId: schema.id,
        tenantId,
      },
    })
    createdAppIds.add(appId)

    await prisma.appItem.create({
      data: {
        id: appItemId,
        appId,
        name: `runtime-item-name-${suffix}`,
        type: 'ITEM',
        category: 'DATA',
        tableId: mainTable.id,
        tenantId,
        sortIndex: 1,
      },
    })
    createdItemIds.add(appItemId)

    await prisma.appView.create({
      data: {
        id: viewId,
        appItemId,
        name: `runtime-view-name-${suffix}`,
        type: 'TABLE_VIEW',
        scene: 'LIST',
        platform: 'PC',
        tenantId,
      },
    })

    const itemDetail = await trpcClient.runtime.apps.getItem.query({
      appId,
      appItemId,
    })

    expect(itemDetail.id).toBe(appItemId)
    expect(itemDetail.views).toHaveLength(1)
    expect(itemDetail.views[0].id).toBe(viewId)
    expect(itemDetail.form?.id).toBe(mainTable.id.toString())
    expect(itemDetail.form?.fields).toHaveLength(1)
    expect(itemDetail.form?.subForms).toHaveLength(1)
    expect(itemDetail.form?.subForms[0].id).toBe(subTable.id.toString())
  })
})

async function cleanupRuntimeData() {
  const relationIds = Array.from(createdRelationIds)
  if (relationIds.length > 0) {
    await prisma.schemaRelation.deleteMany({
      where: {
        id: {
          in: relationIds,
        },
      },
    })
    createdRelationIds.clear()
  }

  const itemIds = Array.from(createdItemIds)
  if (itemIds.length > 0) {
    await prisma.appView.deleteMany({
      where: {
        appItemId: {
          in: itemIds,
        },
      },
    })
    await prisma.appItem.deleteMany({
      where: {
        id: {
          in: itemIds,
        },
      },
    })
    createdItemIds.clear()
  }

  const appIds = Array.from(createdAppIds)
  if (appIds.length > 0) {
    await prisma.app.deleteMany({
      where: {
        id: {
          in: appIds,
        },
      },
    })
    createdAppIds.clear()
  }

  const tableIds = Array.from(createdTableIds)
  if (tableIds.length > 0) {
    await prisma.schemaField.deleteMany({
      where: {
        tableId: {
          in: tableIds,
        },
      },
    })
    await prisma.schemaTable.deleteMany({
      where: {
        id: {
          in: tableIds,
        },
      },
    })
    createdTableIds.clear()
  }

  const schemaIds = Array.from(createdSchemaIds)
  if (schemaIds.length > 0) {
    await prisma.schema.deleteMany({
      where: {
        id: {
          in: schemaIds,
        },
      },
    })
    createdSchemaIds.clear()
  }
}
