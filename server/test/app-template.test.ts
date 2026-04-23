import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '../src/generated/prisma/client'
import type { AppRouter } from '../src/rpc/router'
import { randomUUID } from 'node:crypto'
import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from '@trpc/client'
import superjson from 'superjson'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { jwtSignOptions } from '../src/lib/auth'
import { nextSnowflakeId } from '../src/lib/snowflake'

let app: FastifyInstance
let prisma: PrismaClient
let trpcClient: ReturnType<typeof createTRPCProxyClient<AppRouter>>
let createdAuthUserId: bigint | null = null

const trackedTemplateIds = new Set<string>()
const trackedHistoryIds = new Set<string>()
const trackedAppIds = new Set<string>()
const trackedSchemaIds = new Set<bigint>()

describe('app-template module tRPC integration', () => {
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

    const username = `vitest-template-${randomUUID().slice(0, 8)}`
    const user = await prisma.user.create({
      data: {
        id: nextSnowflakeId(),
        state: 1,
        username,
      },
      select: {
        id: true,
        username: true,
      },
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
  }, 30_000)

  afterEach(async () => {
    await cleanupTemplateData()
  })

  afterAll(async () => {
    await cleanupTemplateData()

    if (createdAuthUserId) {
      await prisma.user.delete({
        where: {
          id: createdAuthUserId,
        },
      })
    }

    if (app) {
      await app.close()
    }
    if (prisma) {
      await prisma.$disconnect()
    }
  })

  it('supports create/list/categories/detail/update/delete lifecycle', async () => {
    const suffix = randomUUID().slice(0, 8)
    const fixture = await seedDeploymentHistoryFixture(suffix)

    const created = await trpcClient.appTemplate.create.mutate({
      name: `模版-${suffix}`,
      description: `描述-${suffix}`,
      icon: `icon-${suffix}`,
      category: 'CRM',
      tags: ['客户管理', '线索'],
      sourceAppId: fixture.sourceAppId,
      sourceVersion: fixture.sourceVersion,
    })
    trackedTemplateIds.add(created.id)

    expect(created.name).toBe(`模版-${suffix}`)
    expect(created.sourceAppId).toBe(fixture.sourceAppId)
    expect(created.sourceVersion).toBe(fixture.sourceVersion)

    const list = await trpcClient.appTemplate.list.query({
      page: 1,
      pageSize: 20,
    })
    expect(list.total).toBeGreaterThanOrEqual(1)
    expect(list.data.some(item => item.id === created.id)).toBe(true)

    const filteredByCategory = await trpcClient.appTemplate.list.query({
      page: 1,
      pageSize: 20,
      category: 'CRM',
    })
    expect(filteredByCategory.data.some(item => item.id === created.id)).toBe(true)

    const filteredByKeyword = await trpcClient.appTemplate.list.query({
      page: 1,
      pageSize: 20,
      keyword: `模版-${suffix}`,
    })
    expect(filteredByKeyword.data.some(item => item.id === created.id)).toBe(true)

    const categories = await trpcClient.appTemplate.categories.query()
    expect(categories.categories).toContain('CRM')

    const detail = await trpcClient.appTemplate.detail.query({ id: created.id })
    expect(detail.id).toBe(created.id)
    expect(detail.configuration).toBeDefined()

    const updated = await trpcClient.appTemplate.update.mutate({
      id: created.id,
      name: `更新后模版-${suffix}`,
      description: `更新后描述-${suffix}`,
      category: 'OA',
      tags: ['审批'],
    })
    expect(updated.name).toBe(`更新后模版-${suffix}`)
    expect(updated.category).toBe('OA')

    const deleted = await trpcClient.appTemplate.delete.mutate({ id: created.id })
    expect(deleted).toEqual({ success: true })

    try {
      await trpcClient.appTemplate.detail.query({ id: created.id })
      throw new Error('Expected deleted template detail query to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCClientError)
      expect((error as TRPCClientError<AppRouter>).data?.code).toBe('NOT_FOUND')
    }

    try {
      await trpcClient.appTemplate.create.mutate({
        name: `无效模版-${suffix}`,
        sourceAppId: `missing-app-${suffix}`,
        sourceVersion: '1.0.0',
      })
      throw new Error('Expected create from missing history to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCClientError)
      expect((error as TRPCClientError<AppRouter>).data?.code).toBe('NOT_FOUND')
    }
  })

  it('applies template and clones schema and definitions', async () => {
    const suffix = randomUUID().slice(0, 8)
    const fixture = await seedDeploymentHistoryFixture(suffix)

    const template = await trpcClient.appTemplate.create.mutate({
      name: `套用模版-${suffix}`,
      sourceAppId: fixture.sourceAppId,
      sourceVersion: fixture.sourceVersion,
      category: 'ERP',
    })
    trackedTemplateIds.add(template.id)

    const applyResult = await trpcClient.appTemplate.applyTemplate.mutate({
      id: template.id,
      appName: `新应用-${suffix}`,
      appDescription: `由模版创建-${suffix}`,
      tenantId: `tenant-apply-${suffix}`,
    })

    trackedAppIds.add(applyResult.appId)

    expect(applyResult.appId).toBeTypeOf('string')
    expect(applyResult.appDefinitionId).toBeTypeOf('string')
    expect(applyResult.branchId).toBeTypeOf('string')
    expect(applyResult.message).toBe('应用创建成功')

    const appDefinition = await prisma.mdAppDefinition.findUnique({
      where: {
        id: applyResult.appDefinitionId,
      },
    })

    expect(appDefinition).not.toBeNull()
    expect(appDefinition?.name).toBe(`新应用-${suffix}`)
    expect(appDefinition?.appId).toBe(applyResult.appId)
    expect(appDefinition?.schemaId).not.toBeNull()

    if (appDefinition?.schemaId) {
      trackedSchemaIds.add(appDefinition.schemaId)

      const schema = await prisma.schema.findUnique({
        where: { id: appDefinition.schemaId },
      })
      expect(schema).not.toBeNull()

      const tables = await prisma.schemaTable.findMany({
        where: {
          schemaId: appDefinition.schemaId,
        },
      })
      expect(tables.length).toBeGreaterThan(0)
    }

    const itemDefinitions = await prisma.mdAppItemDefinition.findMany({
      where: {
        appId: applyResult.appId,
        appBranchId: applyResult.branchId,
      },
    })
    expect(itemDefinitions.length).toBeGreaterThan(0)

    const viewDefinitions = await prisma.mdAppViewDefinition.findMany({
      where: {
        appId: applyResult.appId,
        appBranchId: applyResult.branchId,
      },
    })
    expect(viewDefinitions.length).toBeGreaterThan(0)
  })

  it('returns BAD_REQUEST when template configuration is invalid JSON', async () => {
    const suffix = randomUUID().slice(0, 8)
    const invalidTemplateId = `invalid-template-${suffix}`

    await prisma.mdAppTemplate.create({
      data: {
        id: invalidTemplateId,
        name: `invalid-${suffix}`,
        sourceAppId: null,
        sourceVersion: null,
        configuration: 'not-json',
        createTime: new Date(),
      },
    })
    trackedTemplateIds.add(invalidTemplateId)

    try {
      await trpcClient.appTemplate.applyTemplate.mutate({
        id: invalidTemplateId,
        appName: `invalid-app-${suffix}`,
      })
      throw new Error('Expected invalid template apply to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCClientError)
      expect((error as TRPCClientError<AppRouter>).data?.code).toBe('BAD_REQUEST')
    }
  })
})

async function seedDeploymentHistoryFixture(suffix: string) {
  const tenantId = `tenant-template-${suffix}`
  const sourceAppId = `source-app-${suffix}`
  const sourceBranchId = `source-branch-${suffix}`
  const sourceVersion = `1.0.${suffix}`
  const sourceItemDefinitionId = `source-item-${suffix}`
  const sourceViewDefinitionId = `source-view-${suffix}`

  trackedAppIds.add(sourceAppId)

  const schema = await prisma.schema.create({
    data: {
      key: `schema_${suffix}`,
      name: `schema-name-${suffix}`,
      tenantId,
    },
  })
  trackedSchemaIds.add(schema.id)

  const table = await prisma.schemaTable.create({
    data: {
      schemaId: schema.id,
      key: `table_${suffix}`,
      name: `table-name-${suffix}`,
      tenantId,
    },
  })

  const field = await prisma.schemaField.create({
    data: {
      index: 1,
      tableId: table.id,
      name: `字段-${suffix}`,
      key: `field_${suffix}`,
      type: 'STRING',
      tenantId,
    },
  })

  const indexId = nextSnowflakeId()
  await prisma.schemaIndex.create({
    data: {
      id: indexId,
      tableId: table.id,
      name: `索引-${suffix}`,
      key: `index_${suffix}`,
      fields: JSON.stringify([field.id.toString()]),
      unique: false,
      tenantId,
    },
  })

  await prisma.mdAppDefinition.create({
    data: {
      id: sourceAppId,
      appId: sourceAppId,
      name: `source-name-${suffix}`,
      description: `source-description-${suffix}`,
      schemaId: schema.id,
      homeItemId: sourceItemDefinitionId,
      status: 'NOT_RELEASED',
      createTime: new Date(),
      tenantId,
    },
  })

  await prisma.mdAppBranch.create({
    data: {
      id: sourceBranchId,
      appId: sourceAppId,
      appDefinitionId: sourceAppId,
      name: 'dev',
      createTime: new Date(),
      tenantId,
    },
  })

  await prisma.mdAppItemDefinition.create({
    data: {
      id: sourceItemDefinitionId,
      appDefinitionId: sourceAppId,
      appId: sourceAppId,
      appItemId: sourceItemDefinitionId,
      appBranchId: sourceBranchId,
      name: `source-item-name-${suffix}`,
      tableId: table.id,
      type: 'ITEM',
      client: 'PC',
      category: 'DATA',
      tenantId,
      sortIndex: 1,
    },
  })

  await prisma.mdAppViewDefinition.create({
    data: {
      id: sourceViewDefinitionId,
      appId: sourceAppId,
      appItemId: sourceItemDefinitionId,
      appItemDefinitionId: sourceItemDefinitionId,
      appViewId: sourceViewDefinitionId,
      appBranchId: sourceBranchId,
      name: `source-view-name-${suffix}`,
      type: 'TABLE_VIEW',
      platform: 'PC',
      scene: 'LIST',
      tenantId,
    },
  })

  const historyId = `history-${suffix}`
  trackedHistoryIds.add(historyId)

  await prisma.mdAppDeploymentHistory.create({
    data: {
      id: historyId,
      appId: sourceAppId,
      appDefinitionId: sourceAppId,
      appBranchId: sourceBranchId,
      version: sourceVersion,
      remark: `history-${suffix}`,
      createTime: new Date(),
      tenantId,
      configuration: JSON.stringify({
        appDefinition: {
          id: sourceAppId,
          appId: sourceAppId,
          name: `source-name-${suffix}`,
          schemaId: schema.id.toString(),
          homeItemId: sourceItemDefinitionId,
          sortIndex: 1,
          metadata: null,
          iconColor: null,
          iconName: null,
          description: `source-description-${suffix}`,
          status: 'NOT_RELEASED',
          tenantId,
          createTime: new Date().toISOString(),
        },
        itemDefinitions: [
          {
            id: sourceItemDefinitionId,
            appDefinitionId: sourceAppId,
            appId: sourceAppId,
            appItemId: sourceItemDefinitionId,
            appBranchId: sourceBranchId,
            name: `source-item-name-${suffix}`,
            tableId: table.id.toString(),
            formId: null,
            parentId: null,
            sortIndex: 1,
            iconColor: null,
            iconName: null,
            category: 'DATA',
            metadata: null,
            description: null,
            type: 'ITEM',
            client: 'PC',
            tenantId,
            flowDefinitionId: null,
            flowDeploymentId: null,
            version: null,
          },
        ],
        viewDefinitions: [
          {
            id: sourceViewDefinitionId,
            appId: sourceAppId,
            appItemId: sourceItemDefinitionId,
            appItemDefinitionId: sourceItemDefinitionId,
            appViewId: sourceViewDefinitionId,
            appBranchId: sourceBranchId,
            filter: null,
            platform: 'PC',
            type: 'TABLE_VIEW',
            tableCode: null,
            scene: 'LIST',
            name: `source-view-name-${suffix}`,
            metadata: null,
            content: null,
            principals: null,
            bindFields: null,
            category: 'COMMON',
            userId: null,
            tenantId,
          },
        ],
        authDefinitions: [],
        permissionControls: [],
        schema: {
          id: schema.id.toString(),
          name: schema.name,
          metadata: schema.metadata,
          tenantId,
          key: schema.key,
          tables: [
            {
              id: table.id.toString(),
              name: table.name,
              key: table.key,
              metadata: table.metadata,
              schemaId: schema.id.toString(),
              tenantId,
              fields: [
                {
                  id: field.id.toString(),
                  name: field.name,
                  type: field.type,
                  key: field.key,
                  index: field.index,
                  metadata: field.metadata,
                  tableId: table.id.toString(),
                  tenantId,
                },
              ],
              indexes: [
                {
                  id: indexId.toString(),
                  name: `索引-${suffix}`,
                  key: `index_${suffix}`,
                  fields: JSON.stringify([field.id.toString()]),
                  unique: false,
                  tableId: table.id.toString(),
                  tenantId,
                },
              ],
            },
          ],
          relations: [],
        },
      }),
    },
  })

  return {
    sourceAppId,
    sourceVersion,
  }
}

async function cleanupTemplateData() {
  if (trackedTemplateIds.size > 0) {
    await prisma.mdAppTemplate.deleteMany({
      where: {
        id: {
          in: Array.from(trackedTemplateIds),
        },
      },
    })
    trackedTemplateIds.clear()
  }

  const schemaIds = new Set<bigint>(trackedSchemaIds)

  for (const appId of trackedAppIds) {
    const definitions = await prisma.mdAppDefinition.findMany({
      where: {
        appId,
      },
      select: {
        schemaId: true,
      },
    })

    for (const definition of definitions) {
      if (definition.schemaId) {
        schemaIds.add(definition.schemaId)
      }
    }

    await prisma.mdAppDataPermissionControlDefinition.deleteMany({
      where: {
        appId,
      },
    })

    await prisma.mdAppDataAuthorizationDefinition.deleteMany({
      where: {
        appId,
      },
    })

    await prisma.mdAppViewDefinition.deleteMany({
      where: {
        appId,
      },
    })

    await prisma.mdAppItemDefinition.deleteMany({
      where: {
        appId,
      },
    })

    await prisma.mdAppBranch.deleteMany({
      where: {
        appId,
      },
    })

    await prisma.mdAppDeploymentHistory.deleteMany({
      where: {
        appId,
      },
    })

    await prisma.mdAppDefinition.deleteMany({
      where: {
        appId,
      },
    })
  }

  trackedAppIds.clear()

  if (trackedHistoryIds.size > 0) {
    await prisma.mdAppDeploymentHistory.deleteMany({
      where: {
        id: {
          in: Array.from(trackedHistoryIds),
        },
      },
    })
    trackedHistoryIds.clear()
  }

  for (const schemaId of schemaIds) {
    const tables = await prisma.schemaTable.findMany({
      where: {
        schemaId,
      },
      select: {
        id: true,
      },
    })

    const tableIds = tables.map(item => item.id)

    if (tableIds.length > 0) {
      await prisma.schemaRelation.deleteMany({
        where: {
          OR: [
            {
              tableId: {
                in: tableIds,
              },
            },
            {
              referenceTableId: {
                in: tableIds,
              },
            },
          ],
        },
      })

      await prisma.schemaIndex.deleteMany({
        where: {
          tableId: {
            in: tableIds,
          },
        },
      })

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
    }

    await prisma.schema.deleteMany({
      where: {
        id: schemaId,
      },
    })
  }

  trackedSchemaIds.clear()
}
