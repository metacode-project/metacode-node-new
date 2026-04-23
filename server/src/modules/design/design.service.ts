import type {
  AppItemCategory,
  AppItemType,
  AppStatus,
  AppViewCategory,
  AppViewPlatform,
  AppViewScene,
  AppViewType,
  ClientTypeEnum,
} from '../../generated/prisma/enums'
import type {
  BigintLikeInput,
  CreateAppInput,
  CreateBranchInput,
  CreateDataAuthorizationInput,
  CreateItemInput,
  CreateViewInput,
  DeploymentCreateInput,
  PatchItemInput,
  UpdateAppInput,
  UpdateBranchInput,
  UpdateDataAuthorizationInput,
  UpdateItemInput,
  UpdateViewInput,
} from './dto'
import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'

function toPrismaJsonInput(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return Prisma.JsonNull
  }
  return value as Prisma.InputJsonValue
}

function toNullableBigInt(value: BigintLikeInput | null | undefined): bigint | null {
  if (value === undefined || value === null || value === '') {
    return null
  }
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number') {
    return BigInt(value)
  }
  return BigInt(value)
}

function toBigIntOrUndefined(value: BigintLikeInput | undefined): bigint | undefined {
  if (value === undefined) {
    return undefined
  }
  return toNullableBigInt(value) ?? undefined
}

function serializeOutput<T>(value: T): T {
  if (typeof value === 'bigint') {
    return value.toString() as T
  }
  if (Array.isArray(value)) {
    return value.map(item => serializeOutput(item)) as T
  }
  if (value && typeof value === 'object') {
    if (value instanceof Date) {
      return value
    }
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = serializeOutput(child)
    }
    return output as T
  }
  return value
}

function throwNotFound(message: string): never {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message,
  })
}

function throwBadRequest(message: string): never {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message,
  })
}

export async function findApps() {
  const list = await prisma.mdAppDefinition.findMany()
  const schemaIds = [...new Set(list
    .map(item => item.schemaId)
    .filter((schemaId): schemaId is bigint => schemaId != null))]
  const schemas = schemaIds.length === 0
    ? []
    : await prisma.schema.findMany({
        where: {
          id: {
            in: schemaIds,
          },
        },
      })
  const schemaById = new Map(schemas.map(item => [item.id, item]))

  const output = list.map(item => ({
    ...item,
    schema: item.schemaId ? (schemaById.get(item.schemaId) ?? null) : null,
  }))

  return serializeOutput(output)
}

export async function findAppByAppId(appId: string) {
  const app = await prisma.mdAppDefinition.findFirst({
    where: { appId },
  })

  if (!app) {
    throwNotFound(`应用 ${appId} 不存在`)
  }

  const [schema, branches] = await Promise.all([
    app.schemaId
      ? prisma.schema.findFirst({
          where: { id: app.schemaId },
        })
      : Promise.resolve(null),
    prisma.mdAppBranch.findMany({
      where: { appId },
    }),
  ])

  return serializeOutput({
    ...app,
    appBranches: branches,
    schema,
  })
}

export async function findCurrentAppVersion(appId: string) {
  const appDefinition = await prisma.mdAppDefinition.findFirst({
    where: { appId },
    select: { appId: true },
  })

  if (!appDefinition) {
    throwNotFound(`应用 ${appId} 不存在`)
  }

  const app = await prisma.app.findUnique({
    where: { id: appId },
    select: { version: true },
  })

  return {
    appId,
    version: app?.version ?? null,
  }
}

export async function createApp(input: CreateAppInput) {
  return prisma.$transaction(async (tx) => {
    const appId = randomUUID()
    const schema = input.schema
      ? await tx.schema.findFirst({
          where: { key: input.schema },
        })
      : null

    const appDefinition = await tx.mdAppDefinition.create({
      data: {
        id: appId,
        appId,
        name: input.name,
        description: input.description,
        iconName: input.iconName,
        iconColor: input.iconColor,
        homeItemId: input.homeItemId,
        status: input.status ?? 'NOT_RELEASED',
        schemaId: schema?.id,
        metadata: toPrismaJsonInput(input.metadata),
        createTime: new Date(),
        tenantId: input.tenantId ?? 'default',
      },
    })

    const appBranch = await tx.mdAppBranch.create({
      data: {
        id: randomUUID(),
        name: 'dev',
        appId,
        appDefinitionId: appDefinition.id,
        createTime: new Date(),
        tenantId: input.tenantId ?? 'default',
      },
    })

    return serializeOutput({
      ...appDefinition,
      appBranches: [appBranch],
      schema,
    })
  })
}

export async function updateApp(input: UpdateAppInput) {
  return prisma.$transaction(async (tx) => {
    const schema = input.schema
      ? await tx.schema.findFirst({
          where: { key: input.schema },
        })
      : null

    const appDefinition = await tx.mdAppDefinition.upsert({
      where: { id: input.appId },
      update: {
        appId: input.appId,
        name: input.name,
        description: input.description,
        iconName: input.iconName,
        iconColor: input.iconColor,
        homeItemId: input.homeItemId,
        status: input.status,
        schemaId: input.schema ? (schema?.id ?? null) : undefined,
        metadata: toPrismaJsonInput(input.metadata),
        tenantId: input.tenantId,
      },
      create: {
        id: input.appId,
        appId: input.appId,
        name: input.name ?? input.appId,
        description: input.description ?? null,
        iconName: input.iconName ?? null,
        iconColor: input.iconColor ?? null,
        homeItemId: input.homeItemId ?? null,
        status: input.status ?? 'NOT_RELEASED',
        schemaId: input.schema ? (schema?.id ?? null) : null,
        metadata: toPrismaJsonInput(input.metadata),
        createTime: new Date(),
        tenantId: input.tenantId ?? 'default',
      },
    })

    return serializeOutput(appDefinition)
  })
}

export async function deleteAppById(appId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.mdAppDefinition.deleteMany({
      where: { appId },
    })
  })

  return { success: true as const }
}

export async function findDeploymentHistory(appId: string, branchId?: string) {
  const list = await prisma.mdAppDeploymentHistory.findMany({
    where: {
      appId,
      appBranchId: branchId,
    },
    orderBy: {
      createTime: 'desc',
    },
  })

  return serializeOutput(list)
}

export async function findAppBranches(appId: string) {
  const list = await prisma.mdAppBranch.findMany({
    where: { appId },
  })

  return serializeOutput(list)
}

export async function createAppBranch(input: CreateBranchInput) {
  const { appId, name, sourceBranchId } = input

  return prisma.$transaction(async (tx) => {
    const branch = await tx.mdAppBranch.create({
      data: {
        id: randomUUID(),
        name,
        appId,
        appDefinitionId: appId,
        sourceBranchId,
        createTime: new Date(),
        tenantId: 'default',
      },
    })

    if (!sourceBranchId) {
      return serializeOutput(branch)
    }

    const sourceItems = await tx.mdAppItemDefinition.findMany({
      where: {
        appId,
        appBranchId: sourceBranchId,
      },
    })

    for (const item of sourceItems) {
      const newItemDefinition = await tx.mdAppItemDefinition.create({
        data: {
          id: randomUUID(),
          appDefinitionId: item.appDefinitionId,
          appId,
          appItemId: item.appItemId,
          appBranchId: branch.id,
          name: item.name,
          flowDeploymentId: item.flowDeploymentId,
          tenantId: item.tenantId,
          iconName: item.iconName,
          tableId: item.tableId,
          formId: item.formId,
          version: item.version,
          parentId: item.parentId,
          sortIndex: item.sortIndex,
          iconColor: item.iconColor,
          category: item.category,
          metadata: toPrismaJsonInput(item.metadata),
          description: item.description,
          flowDefinitionId: item.flowDefinitionId,
          type: item.type,
          client: item.client,
        },
      })

      const sourceViews = await tx.mdAppViewDefinition.findMany({
        where: {
          appId,
          appItemId: item.appItemId,
          appBranchId: sourceBranchId,
        },
      })

      for (const view of sourceViews) {
        await tx.mdAppViewDefinition.create({
          data: {
            id: randomUUID(),
            appId,
            appItemId: view.appItemId,
            appItemDefinitionId: newItemDefinition.id,
            appViewId: view.appViewId,
            appBranchId: branch.id,
            filter: view.filter,
            platform: view.platform,
            type: view.type,
            tableCode: view.tableCode,
            tenantId: view.tenantId,
            scene: view.scene,
            name: view.name,
            metadata: toPrismaJsonInput(view.metadata),
            content: view.content,
            principals: toPrismaJsonInput(view.principals),
            bindFields: toPrismaJsonInput(view.bindFields),
            category: view.category,
            userId: view.userId,
          },
        })
      }
    }

    return serializeOutput(branch)
  })
}

export async function updateAppBranch(input: UpdateBranchInput) {
  const branch = await prisma.mdAppBranch.findFirst({
    where: {
      appId: input.appId,
      id: input.branchId,
    },
  })

  if (!branch) {
    throwNotFound(`分支 ${input.branchId} 不存在`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    return tx.mdAppBranch.update({
      where: { id: input.branchId },
      data: { name: input.name },
    })
  })

  return serializeOutput(updated)
}

export async function deleteAppBranch(appId: string, branchId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.mdAppBranch.deleteMany({
      where: { appId, id: branchId },
    })
  })

  return { success: true as const }
}

export async function findAppItems(appId: string, branchId?: string, client?: 'PC' | 'H5') {
  const list = await prisma.mdAppItemDefinition.findMany({
    where: {
      appId,
      appBranchId: branchId,
      client,
    },
  })

  const tableIds = [...new Set(list
    .map(item => item.tableId)
    .filter((id): id is bigint => id != null))]

  const tables = tableIds.length === 0
    ? []
    : await prisma.schemaTable.findMany({
        where: {
          id: {
            in: tableIds,
          },
        },
      })

  const tableById = new Map(tables.map(table => [table.id, {
    ...table,
    code: table.key,
  }]))

  const output = list.map(item => ({
    ...item,
    form: item.tableId ? (tableById.get(item.tableId) ?? null) : null,
  }))

  return serializeOutput(output)
}

export async function findAppItem(appId: string, itemId: string, branchId?: string) {
  const item = await prisma.mdAppItemDefinition.findFirst({
    where: {
      appId,
      appItemId: itemId,
      appBranchId: branchId,
    },
  })

  if (!item) {
    throwNotFound(`页面 ${itemId} 不存在`)
  }

  const views = await prisma.mdAppViewDefinition.findMany({
    where: {
      appId,
      appItemId: itemId,
      appBranchId: branchId,
    },
  })

  const table = item.tableId
    ? await prisma.schemaTable.findUnique({
        where: { id: item.tableId },
      })
    : null

  const appDefinition = !table?.schemaId
    ? await prisma.mdAppDefinition.findFirst({
        where: { appId },
        select: { schemaId: true },
      })
    : null

  const schemaId = table?.schemaId ?? appDefinition?.schemaId ?? null
  const fields = item.tableId
    ? await prisma.schemaField.findMany({
        where: { tableId: item.tableId },
      })
    : []
  const relations = item.tableId
    ? await prisma.schemaRelation.findMany({
        where: { tableId: item.tableId },
      })
    : []
  const subTableIds = relations
    .map(relation => relation.referenceTableId)
    .filter((tableId): tableId is bigint => tableId !== null)

  const subTables = subTableIds.length === 0
    ? []
    : await prisma.schemaTable.findMany({
        where: {
          id: {
            in: subTableIds,
          },
        },
      })

  const subFormList = await Promise.all(subTables.map(async (subTable) => {
    const subFields = await prisma.schemaField.findMany({
      where: { tableId: subTable.id },
    })
    return {
      ...subTable,
      code: subTable.key,
      fields: subFields,
    }
  }))

  const output = {
    ...item,
    views,
    form: table
      ? {
          ...table,
          code: table.key,
          fields,
          subForms: subFormList,
        }
      : null,
    schemaId,
  }

  return serializeOutput(output)
}

export async function createAppItem(input: CreateItemInput) {
  const appItemId = input.appItemId ?? randomUUID()

  const item = await prisma.$transaction(async (tx) => {
    return tx.mdAppItemDefinition.create({
      data: {
        id: randomUUID(),
        appDefinitionId: input.appDefinitionId ?? input.appId,
        appId: input.appId,
        appItemId,
        appBranchId: input.branchId,
        name: input.name,
        flowDeploymentId: toNullableBigInt(input.flowDeploymentId),
        tenantId: input.tenantId ?? 'default',
        iconName: input.iconName,
        tableId: toNullableBigInt(input.tableId),
        formId: toNullableBigInt(input.formId),
        version: input.version,
        parentId: input.parentId,
        sortIndex: input.sortIndex,
        iconColor: input.iconColor,
        category: input.category,
        metadata: toPrismaJsonInput(input.metadata),
        description: input.description,
        flowDefinitionId: toNullableBigInt(input.flowDefinitionId),
        type: input.type,
        client: input.client,
      },
    })
  })

  return serializeOutput(item)
}

export async function updateAppItem(input: UpdateItemInput) {
  const older = await prisma.mdAppItemDefinition.findFirst({
    where: {
      appId: input.appId,
      appItemId: input.itemId,
      appBranchId: input.branchId,
    },
  })

  if (!older) {
    throwNotFound(`页面 ${input.itemId} 不存在`)
  }

  const item = await prisma.$transaction(async (tx) => {
    return tx.mdAppItemDefinition.update({
      where: { id: older.id },
      data: {
        appDefinitionId: input.appDefinitionId ?? older.appDefinitionId,
        appId: input.appId,
        appItemId: input.itemId,
        appBranchId: input.branchId,
        name: input.name,
        flowDeploymentId: toBigIntOrUndefined(input.flowDeploymentId),
        tenantId: input.tenantId,
        iconName: input.iconName,
        tableId: input.tableId === undefined ? undefined : toNullableBigInt(input.tableId),
        formId: input.formId === undefined ? undefined : toNullableBigInt(input.formId),
        version: input.version,
        parentId: input.parentId,
        sortIndex: input.sortIndex,
        iconColor: input.iconColor,
        category: input.category,
        metadata: toPrismaJsonInput(input.metadata),
        description: input.description,
        flowDefinitionId: toBigIntOrUndefined(input.flowDefinitionId),
        type: input.type,
        client: input.client,
      },
    })
  })

  return serializeOutput(item)
}

export async function patchAppItem(input: PatchItemInput) {
  const older = await prisma.mdAppItemDefinition.findFirst({
    where: {
      appId: input.appId,
      appItemId: input.itemId,
      appBranchId: input.branchId,
    },
  })

  if (!older) {
    throwNotFound(`页面 ${input.itemId} 不存在`)
  }

  let tableId = older.tableId
  if (input.table) {
    const app = await prisma.mdAppDefinition.findFirst({
      where: {
        appId: input.appId,
      },
    })
    if (!app) {
      throwNotFound(`应用 ${input.appId} 不存在`)
    }
    if (!app.schemaId) {
      throwNotFound(`应用 ${input.appId} 未绑定数据模型`)
    }
    const schemaTable = await prisma.schemaTable.findFirst({
      where: {
        schemaId: app.schemaId,
        key: input.table,
      },
    })
    if (!schemaTable) {
      throwNotFound(`数据表 ${input.table} 不存在`)
    }
    tableId = schemaTable.id
  }

  const item = await prisma.$transaction(async (tx) => {
    return tx.mdAppItemDefinition.update({
      where: { id: older.id },
      data: {
        tableId: tableId ?? null,
      },
    })
  })

  return serializeOutput(item)
}

export async function deleteAppItem(appId: string, itemId: string, branchId?: string) {
  await prisma.$transaction(async (tx) => {
    await tx.mdAppItemDefinition.deleteMany({
      where: {
        appId,
        appItemId: itemId,
        appBranchId: branchId,
      },
    })
  })

  return { success: true as const }
}

export async function findAppViews(appId: string, itemId: string, branchId?: string) {
  const list = await prisma.mdAppViewDefinition.findMany({
    where: {
      appId,
      appItemId: itemId,
      appBranchId: branchId,
    },
  })

  return serializeOutput(list)
}

export async function findAppView(appId: string, itemId: string, viewId: string, branchId?: string) {
  const view = await prisma.mdAppViewDefinition.findFirst({
    where: {
      appId,
      appItemId: itemId,
      appViewId: viewId,
      appBranchId: branchId,
    },
  })

  if (!view) {
    throwNotFound(`视图 ${viewId} 不存在`)
  }

  return serializeOutput(view)
}

export async function findAppViewHistory(appId: string, itemId: string, viewId: string, branchId?: string) {
  const list = await prisma.mdAppViewDefinitionHistory.findMany({
    where: {
      appId,
      appItemId: itemId,
      appViewId: viewId,
      appBranchId: branchId,
    },
    orderBy: {
      createTime: 'desc',
    },
  })

  return serializeOutput(list)
}

export async function restoreAppView(appId: string, itemId: string, viewId: string, historyId: string, branchId?: string) {
  await prisma.$transaction(async (tx) => {
    const history = await tx.mdAppViewDefinitionHistory.findUnique({
      where: { id: historyId },
    })

    if (!history) {
      throwNotFound(`视图历史 ${historyId} 不存在`)
    }

    if (!history.appViewDefinitionId) {
      throwBadRequest('历史记录缺少 appViewDefinitionId，无法恢复')
    }

    const view = await tx.mdAppViewDefinition.update({
      where: { id: history.appViewDefinitionId },
      data: {
        filter: history.filter,
        platform: history.platform,
        type: history.type,
        tableCode: history.tableCode,
        tenantId: history.tenantId,
        scene: history.scene,
        name: history.name,
        metadata: history.metadata ?? Prisma.JsonNull,
        content: history.content,
        principals: history.principals ?? Prisma.JsonNull,
        bindFields: history.bindFields ?? Prisma.JsonNull,
        category: history.category,
        userId: history.userId,
      },
    })

    await tx.mdAppViewDefinitionHistory.create({
      data: {
        id: randomUUID(),
        appViewDefinitionId: view.id,
        appId: view.appId,
        appItemId: view.appItemId,
        appItemDefinitionId: view.appItemDefinitionId,
        appBranchId: view.appBranchId,
        appViewId: view.appViewId,
        filter: view.filter,
        platform: view.platform,
        type: view.type,
        tableCode: view.tableCode,
        tenantId: view.tenantId,
        scene: view.scene,
        name: view.name,
        metadata: toPrismaJsonInput(view.metadata),
        content: view.content,
        principals: toPrismaJsonInput(view.principals),
        bindFields: toPrismaJsonInput(view.bindFields),
        category: view.category,
        userId: view.userId,
        createTime: new Date(),
      },
    })
  })

  return findAppView(appId, itemId, viewId, branchId)
}

export async function createAppView(input: CreateViewInput) {
  const appItem = await prisma.mdAppItemDefinition.findFirst({
    where: {
      appId: input.appId,
      appItemId: input.itemId,
      appBranchId: input.branchId,
    },
  })

  if (!appItem) {
    throwNotFound(`页面 ${input.itemId} 不存在`)
  }

  const appViewId = input.appViewId ?? randomUUID()

  const view = await prisma.$transaction(async (tx) => {
    const createdView = await tx.mdAppViewDefinition.create({
      data: {
        id: randomUUID(),
        appId: input.appId,
        appItemId: input.itemId,
        appItemDefinitionId: appItem.id,
        appViewId,
        appBranchId: input.branchId,
        filter: input.filter,
        platform: input.platform,
        type: input.type,
        tableCode: input.tableCode,
        tenantId: input.tenantId ?? 'default',
        scene: input.scene,
        name: input.name,
        metadata: toPrismaJsonInput(input.metadata),
        content: input.content,
        principals: toPrismaJsonInput(input.principals),
        bindFields: toPrismaJsonInput(input.bindFields),
        category: input.category,
        userId: toNullableBigInt(input.userId),
      },
    })

    await tx.mdAppViewDefinitionHistory.create({
      data: {
        id: randomUUID(),
        appViewDefinitionId: createdView.id,
        appId: createdView.appId,
        appItemId: createdView.appItemId,
        appItemDefinitionId: createdView.appItemDefinitionId,
        appBranchId: createdView.appBranchId,
        appViewId: createdView.appViewId,
        filter: createdView.filter,
        platform: createdView.platform,
        type: createdView.type,
        tableCode: createdView.tableCode,
        tenantId: createdView.tenantId,
        scene: createdView.scene,
        name: createdView.name,
        metadata: toPrismaJsonInput(createdView.metadata),
        content: createdView.content,
        principals: toPrismaJsonInput(createdView.principals),
        bindFields: toPrismaJsonInput(createdView.bindFields),
        category: createdView.category,
        userId: createdView.userId,
        createTime: new Date(),
      },
    })

    return createdView
  })

  return serializeOutput(view)
}

export async function updateAppView(input: UpdateViewInput) {
  const older = await prisma.mdAppViewDefinition.findFirst({
    where: {
      appId: input.appId,
      appItemId: input.itemId,
      appViewId: input.viewId,
      appBranchId: input.branchId,
    },
  })

  if (!older) {
    throwNotFound(`视图 ${input.viewId} 不存在`)
  }

  const view = await prisma.$transaction(async (tx) => {
    const updatedView = await tx.mdAppViewDefinition.update({
      where: { id: older.id },
      data: {
        appId: input.appId,
        appItemId: input.itemId,
        appItemDefinitionId: older.appItemDefinitionId,
        appViewId: input.viewId,
        appBranchId: input.branchId,
        filter: input.filter,
        platform: input.platform,
        type: input.type,
        tableCode: input.tableCode,
        tenantId: input.tenantId,
        scene: input.scene,
        name: input.name,
        metadata: toPrismaJsonInput(input.metadata),
        content: input.content,
        principals: toPrismaJsonInput(input.principals),
        bindFields: toPrismaJsonInput(input.bindFields),
        category: input.category,
        userId: toBigIntOrUndefined(input.userId),
      },
    })

    await tx.mdAppViewDefinitionHistory.create({
      data: {
        id: randomUUID(),
        appViewDefinitionId: updatedView.id,
        appId: updatedView.appId,
        appItemId: updatedView.appItemId,
        appItemDefinitionId: updatedView.appItemDefinitionId,
        appBranchId: updatedView.appBranchId,
        appViewId: updatedView.appViewId,
        filter: updatedView.filter,
        platform: updatedView.platform,
        type: updatedView.type,
        tableCode: updatedView.tableCode,
        tenantId: updatedView.tenantId,
        scene: updatedView.scene,
        name: updatedView.name,
        metadata: toPrismaJsonInput(updatedView.metadata),
        content: updatedView.content,
        principals: toPrismaJsonInput(updatedView.principals),
        bindFields: toPrismaJsonInput(updatedView.bindFields),
        category: updatedView.category,
        userId: updatedView.userId,
        createTime: new Date(),
      },
    })

    return updatedView
  })

  return serializeOutput(view)
}

export async function deleteAppView(appId: string, itemId: string, viewId: string, branchId?: string) {
  await prisma.$transaction(async (tx) => {
    await tx.mdAppViewDefinition.deleteMany({
      where: {
        appId,
        appItemId: itemId,
        appViewId: viewId,
        appBranchId: branchId,
      },
    })
  })

  return { success: true as const }
}

export async function findDataAuthorizations(appId: string, itemId: string, branchId?: string) {
  const list = await prisma.mdAppDataAuthorizationDefinition.findMany({
    where: {
      appId,
      appItemId: itemId,
      appBranchId: branchId,
    },
  })

  return serializeOutput(list)
}

export async function findDataAuthorization(appId: string, itemId: string, authorizationId: string, branchId?: string) {
  const authorization = await prisma.mdAppDataAuthorizationDefinition.findFirst({
    where: {
      appId,
      appItemId: itemId,
      authorizationId,
      appBranchId: branchId,
    },
  })

  if (!authorization) {
    throwNotFound(`数据权限 ${authorizationId} 不存在`)
  }

  return serializeOutput(authorization)
}

export async function createDataAuthorization(input: CreateDataAuthorizationInput) {
  const created = await prisma.$transaction(async (tx) => {
    return tx.mdAppDataAuthorizationDefinition.create({
      data: {
        id: randomUUID(),
        appId: input.appId,
        appItemId: input.itemId,
        appItemDefinitionId: input.appItemDefinitionId ?? input.itemId,
        authorizationId: randomUUID(),
        appBranchId: input.branchId,
        tenantId: input.tenantId ?? 'default',
        monitor: toPrismaJsonInput(input.monitor),
        condition: input.condition,
        name: input.name,
        monitored: toPrismaJsonInput(input.monitored),
      },
    })
  })

  return serializeOutput(created)
}

export async function updateDataAuthorization(input: UpdateDataAuthorizationInput) {
  const older = await prisma.mdAppDataAuthorizationDefinition.findFirst({
    where: {
      appId: input.appId,
      appItemId: input.itemId,
      authorizationId: input.authorizationId,
      appBranchId: input.branchId,
    },
  })

  if (!older) {
    throwNotFound(`数据权限 ${input.authorizationId} 不存在`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    return tx.mdAppDataAuthorizationDefinition.update({
      where: { id: older.id },
      data: {
        appId: input.appId,
        appItemId: input.itemId,
        appItemDefinitionId: input.appItemDefinitionId ?? older.appItemDefinitionId,
        authorizationId: input.authorizationId,
        appBranchId: input.branchId,
        tenantId: input.tenantId,
        monitor: toPrismaJsonInput(input.monitor),
        condition: input.condition,
        name: input.name,
        monitored: toPrismaJsonInput(input.monitored),
      },
    })
  })

  return serializeOutput(updated)
}

export async function deleteDataAuthorization(appId: string, itemId: string, authorizationId: string, branchId?: string) {
  await prisma.$transaction(async (tx) => {
    await tx.mdAppDataAuthorizationDefinition.deleteMany({
      where: {
        appId,
        appItemId: itemId,
        authorizationId,
        appBranchId: branchId,
      },
    })
  })

  return { success: true as const }
}

export async function deployApp(input: DeploymentCreateInput) {
  const history = await prisma.$transaction(async (tx) => {
    const appDefinition = await tx.mdAppDefinition.findFirst({
      where: { appId: input.appId },
    })

    if (!appDefinition) {
      throwNotFound(`应用 ${input.appId} 不存在`)
    }

    await tx.app.upsert({
      where: { id: input.appId },
      update: {
        name: appDefinition.name,
        description: appDefinition.description,
        iconName: appDefinition.iconName,
        iconColor: appDefinition.iconColor,
        homeItemId: appDefinition.homeItemId,
        version: input.version,
        schemaId: appDefinition.schemaId,
        tenantId: appDefinition.tenantId ?? 'default',
        sortIndex: appDefinition.sortIndex,
        metadata: toPrismaJsonInput(appDefinition.metadata),
      },
      create: {
        id: input.appId,
        name: appDefinition.name,
        description: appDefinition.description,
        iconName: appDefinition.iconName,
        iconColor: appDefinition.iconColor,
        homeItemId: appDefinition.homeItemId,
        version: input.version,
        schemaId: appDefinition.schemaId,
        tenantId: appDefinition.tenantId ?? 'default',
        sortIndex: appDefinition.sortIndex,
        metadata: toPrismaJsonInput(appDefinition.metadata),
      },
    })

    const existingAppItems = await tx.appItem.findMany({
      where: { appId: input.appId },
      select: { id: true },
    })
    const existingAppItemIds = existingAppItems.map(item => item.id)

    if (existingAppItemIds.length > 0) {
      await tx.appRule.deleteMany({
        where: {
          appItemId: {
            in: existingAppItemIds,
          },
        },
      })

      await tx.appView.deleteMany({
        where: {
          appItemId: {
            in: existingAppItemIds,
          },
        },
      })

      const existingAuthorizations = await tx.appDataAuthorization.findMany({
        where: {
          appItemId: {
            in: existingAppItemIds,
          },
        },
        select: { id: true },
      })
      const existingAuthorizationIds = existingAuthorizations.map(item => item.id)

      if (existingAuthorizationIds.length > 0) {
        await tx.appDataPermissionControl.deleteMany({
          where: {
            authorizationId: {
              in: existingAuthorizationIds,
            },
          },
        })
        await tx.appDataAuthorization.deleteMany({
          where: {
            id: {
              in: existingAuthorizationIds,
            },
          },
        })
      }

      await tx.appItem.updateMany({
        where: {
          id: {
            in: existingAppItemIds,
          },
        },
        data: {
          parentId: null,
        },
      })
    }

    await tx.appItem.deleteMany({
      where: { appId: input.appId },
    })

    const itemDefinitions = await tx.mdAppItemDefinition.findMany({
      where: {
        appId: input.appId,
        appBranchId: input.branchId,
      },
    })

    const appItems = itemDefinitions.map(item => ({
      id: item.appItemId ?? randomUUID(),
      name: item.name,
      description: item.description,
      iconColor: item.iconColor,
      iconName: item.iconName,
      metadata: toPrismaJsonInput(item.metadata),
      type: item.type,
      version: item.version,
      appId: input.appId,
      tableId: item.tableId,
      parentId: item.parentId,
      category: item.category,
      tenantId: item.tenantId ?? 'default',
      flowDefinitionId: item.flowDefinitionId,
      flowDeploymentId: item.flowDeploymentId,
      sortIndex: item.sortIndex,
      formId: item.formId,
      client: item.client,
    }))

    if (appItems.length > 0) {
      await tx.appItem.createMany({
        data: appItems,
      })
    }

    const itemIds = itemDefinitions
      .map(item => item.appItemId)
      .filter((itemId): itemId is string => Boolean(itemId))

    if (itemIds.length > 0) {
      await tx.appView.deleteMany({
        where: {
          appItemId: {
            in: itemIds,
          },
        },
      })
    }

    const viewDefinitions = await tx.mdAppViewDefinition.findMany({
      where: {
        appId: input.appId,
        appBranchId: input.branchId,
      },
    })

    const appViews = viewDefinitions.map(view => ({
      id: view.appViewId ?? randomUUID(),
      category: view.category,
      content: view.content,
      metadata: toPrismaJsonInput(view.metadata),
      name: view.name,
      platform: view.platform,
      scene: view.scene,
      type: view.type,
      appItemId: view.appItemId,
      userId: view.userId,
      tenantId: view.tenantId ?? 'default',
      tableCode: view.tableCode,
      filter: view.filter,
      principals: toPrismaJsonInput(view.principals),
      bindFields: toPrismaJsonInput(view.bindFields),
    }))

    if (appViews.length > 0) {
      await tx.appView.createMany({
        data: appViews,
      })
    }

    if (itemIds.length > 0) {
      const existingAuthorizations = await tx.appDataAuthorization.findMany({
        where: {
          appItemId: {
            in: itemIds,
          },
        },
        select: { id: true },
      })
      const existingAuthorizationIds = existingAuthorizations.map(item => item.id)

      if (existingAuthorizationIds.length > 0) {
        await tx.appDataPermissionControl.deleteMany({
          where: {
            authorizationId: {
              in: existingAuthorizationIds,
            },
          },
        })
      }

      await tx.appDataAuthorization.deleteMany({
        where: {
          appItemId: {
            in: itemIds,
          },
        },
      })
    }

    const authDefinitions = await tx.mdAppDataAuthorizationDefinition.findMany({
      where: {
        appId: input.appId,
        appBranchId: input.branchId,
      },
    })

    const appDataAuthorizations = authDefinitions.map(item => ({
      id: item.authorizationId ?? item.id,
      condition: item.condition,
      monitor: toPrismaJsonInput(item.monitor),
      monitored: toPrismaJsonInput(item.monitored),
      name: item.name,
      appItemId: item.appItemId,
      tenantId: item.tenantId ?? 'default',
    }))

    if (appDataAuthorizations.length > 0) {
      await tx.appDataAuthorization.createMany({
        data: appDataAuthorizations,
      })

      const authorizationIdByItemDefinitionId = new Map(
        authDefinitions.map(item => [item.appItemDefinitionId, item.authorizationId ?? item.id]),
      )

      const permissionControls = await tx.mdAppDataPermissionControlDefinition.findMany({
        where: {
          appId: input.appId,
          appItemDefinitionId: {
            in: authDefinitions
              .map(item => item.appItemDefinitionId)
              .filter((itemDefinitionId): itemDefinitionId is string => Boolean(itemDefinitionId)),
          },
        },
      })

      const appDataPermissionControls = permissionControls.map(control => ({
        id: control.id,
        fieldControls: toPrismaJsonInput(control.fieldControls),
        fieldDeleteAll: control.fieldDeleteAll,
        fieldReadAll: control.fieldReadAll,
        fieldWriteAll: control.fieldWriteAll,
        authorizationId: authorizationIdByItemDefinitionId.get(control.appItemDefinitionId ?? '')
          ?? (control.authorizationId ? control.authorizationId.toString() : null),
        tableId: control.tableId,
        tenantId: control.tenantId ?? 'default',
        condition: control.condition,
      }))

      if (appDataPermissionControls.length > 0) {
        await tx.appDataPermissionControl.createMany({
          data: appDataPermissionControls,
        })
      }
    }

    const permissionControlsSnapshot = await tx.mdAppDataPermissionControlDefinition.findMany({
      where: {
        appId: input.appId,
        appItemDefinitionId: {
          in: authDefinitions
            .map(item => item.appItemDefinitionId)
            .filter((itemDefinitionId): itemDefinitionId is string => Boolean(itemDefinitionId)),
        },
      },
    })

    let schemaSnapshot: Record<string, unknown> | null = null
    if (appDefinition.schemaId) {
      const schema = await tx.schema.findUnique({
        where: { id: appDefinition.schemaId },
      })

      if (schema) {
        const tableIdsFromItems = itemDefinitions
          .map(item => item.tableId)
          .filter((tableId): tableId is bigint => tableId !== null)
        const schemaRelations = await tx.schemaRelation.findMany({
          where: {
            tableId: {
              in: tableIdsFromItems,
            },
          },
        })
        const schemaTables = await tx.schemaTable.findMany({
          where: {
            schemaId: schema.id,
            id: {
              in: tableIdsFromItems,
            },
          },
          include: {
            indexes: true,
            fields: true,
          },
        })
        schemaSnapshot = {
          ...schema,
          tables: schemaTables,
          relations: schemaRelations,
        }
      }
    }

    const snapshot = {
      appDefinition,
      itemDefinitions,
      viewDefinitions,
      authDefinitions,
      permissionControls: permissionControlsSnapshot,
      schema: schemaSnapshot,
    }

    const configuration = JSON.stringify(snapshot, (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }
      return value
    })

    await tx.mdAppDeploymentHistory.deleteMany({
      where: {
        appId: input.appId,
        version: input.version,
      },
    })

    return tx.mdAppDeploymentHistory.create({
      data: {
        id: randomUUID(),
        appId: input.appId,
        appDefinitionId: appDefinition.id,
        appBranchId: input.branchId,
        version: input.version,
        remark: input.remark ?? '',
        createTime: new Date(),
        tenantId: appDefinition.tenantId ?? 'default',
        configuration,
      },
    })
  })

  return serializeOutput(history)
}

export async function restoreApp(appId: string, historyId: string, branchId?: string) {
  await prisma.$transaction(async (tx) => {
    const history = await tx.mdAppDeploymentHistory.findFirst({
      where: {
        id: historyId,
        appId,
      },
    })

    if (!history) {
      throwNotFound(`部署历史 ${historyId} 不存在`)
    }

    if (!history.configuration) {
      throwBadRequest(`部署历史 ${historyId} 缺少配置快照`)
    }

    const snapshot = JSON.parse(history.configuration) as {
      appDefinition: Record<string, unknown>
      itemDefinitions: Array<Record<string, unknown>>
      viewDefinitions: Array<Record<string, unknown>>
      authDefinitions: Array<Record<string, unknown>>
      permissionControls: Array<Record<string, unknown>>
    }

    const appDefinition = snapshot.appDefinition
    const itemDefinitions = snapshot.itemDefinitions ?? []
    const viewDefinitions = snapshot.viewDefinitions ?? []
    const authDefinitions = snapshot.authDefinitions ?? []
    const permissionControls = snapshot.permissionControls ?? []
    const targetBranchId = branchId ?? null

    await tx.mdAppDefinition.update({
      where: {
        id: String(appDefinition.id),
      },
      data: {
        appId: String(appDefinition.appId ?? appId),
        name: typeof appDefinition.name === 'string' ? appDefinition.name : null,
        schemaId: toNullableBigInt(appDefinition.schemaId as BigintLikeInput),
        homeItemId: typeof appDefinition.homeItemId === 'string' ? appDefinition.homeItemId : null,
        sortIndex: typeof appDefinition.sortIndex === 'number' ? appDefinition.sortIndex : null,
        metadata: toPrismaJsonInput(appDefinition.metadata),
        iconColor: typeof appDefinition.iconColor === 'string' ? appDefinition.iconColor : null,
        iconName: typeof appDefinition.iconName === 'string' ? appDefinition.iconName : null,
        description: typeof appDefinition.description === 'string' ? appDefinition.description : null,
        status: typeof appDefinition.status === 'string' ? appDefinition.status as AppStatus : null,
        operator: typeof appDefinition.operator === 'string' ? appDefinition.operator : null,
        createTime: appDefinition.createTime ? new Date(String(appDefinition.createTime)) : new Date(),
        tenantId: typeof appDefinition.tenantId === 'string' ? appDefinition.tenantId : null,
      },
    })

    const existingItemDefinitions = await tx.mdAppItemDefinition.findMany({
      where: {
        appId,
        appBranchId: targetBranchId,
      },
      select: { id: true },
    })

    const existingItemDefinitionIds = existingItemDefinitions.map(item => item.id)
    if (existingItemDefinitionIds.length > 0) {
      await tx.mdAppDataPermissionControlDefinition.deleteMany({
        where: {
          appId,
          appItemDefinitionId: {
            in: existingItemDefinitionIds,
          },
        },
      })
    }

    await tx.mdAppDataAuthorizationDefinition.deleteMany({
      where: {
        appId,
        appBranchId: targetBranchId,
      },
    })
    await tx.mdAppViewDefinition.deleteMany({
      where: {
        appId,
        appBranchId: targetBranchId,
      },
    })
    await tx.mdAppItemDefinition.deleteMany({
      where: {
        appId,
        appBranchId: targetBranchId,
      },
    })

    if (itemDefinitions.length > 0) {
      await tx.mdAppItemDefinition.createMany({
        data: itemDefinitions.map(item => ({
          id: String(item.id),
          appDefinitionId: item.appDefinitionId ? String(item.appDefinitionId) : null,
          appId: item.appId ? String(item.appId) : appId,
          appItemId: item.appItemId ? String(item.appItemId) : null,
          appBranchId: targetBranchId,
          name: typeof item.name === 'string' ? item.name : null,
          flowDeploymentId: toNullableBigInt(item.flowDeploymentId as BigintLikeInput),
          tenantId: typeof item.tenantId === 'string' ? item.tenantId : null,
          iconName: typeof item.iconName === 'string' ? item.iconName : null,
          tableId: toNullableBigInt(item.tableId as BigintLikeInput),
          formId: toNullableBigInt(item.formId as BigintLikeInput),
          version: typeof item.version === 'string' ? item.version : null,
          parentId: typeof item.parentId === 'string' ? item.parentId : null,
          sortIndex: typeof item.sortIndex === 'number' ? item.sortIndex : null,
          iconColor: typeof item.iconColor === 'string' ? item.iconColor : null,
          category: typeof item.category === 'string' ? item.category as AppItemCategory : null,
          metadata: toPrismaJsonInput(item.metadata),
          description: typeof item.description === 'string' ? item.description : null,
          flowDefinitionId: toNullableBigInt(item.flowDefinitionId as BigintLikeInput),
          type: typeof item.type === 'string' ? item.type as AppItemType : null,
          client: typeof item.client === 'string' ? item.client as ClientTypeEnum : null,
        })),
      })
    }

    if (viewDefinitions.length > 0) {
      await tx.mdAppViewDefinition.createMany({
        data: viewDefinitions.map(view => ({
          id: String(view.id),
          appId: view.appId ? String(view.appId) : appId,
          appItemId: view.appItemId ? String(view.appItemId) : null,
          appItemDefinitionId: view.appItemDefinitionId ? String(view.appItemDefinitionId) : null,
          appViewId: view.appViewId ? String(view.appViewId) : null,
          appBranchId: targetBranchId,
          filter: typeof view.filter === 'string' ? view.filter : null,
          platform: typeof view.platform === 'string' ? view.platform as AppViewPlatform : null,
          type: typeof view.type === 'string' ? view.type as AppViewType : null,
          tableCode: typeof view.tableCode === 'string' ? view.tableCode : null,
          tenantId: typeof view.tenantId === 'string' ? view.tenantId : null,
          scene: typeof view.scene === 'string' ? view.scene as AppViewScene : null,
          name: typeof view.name === 'string' ? view.name : null,
          metadata: toPrismaJsonInput(view.metadata),
          content: typeof view.content === 'string' ? view.content : null,
          principals: toPrismaJsonInput(view.principals),
          bindFields: toPrismaJsonInput(view.bindFields),
          category: typeof view.category === 'string' ? view.category as AppViewCategory : null,
          userId: toNullableBigInt(view.userId as BigintLikeInput),
        })),
      })
    }

    if (authDefinitions.length > 0) {
      await tx.mdAppDataAuthorizationDefinition.createMany({
        data: authDefinitions.map(authorization => ({
          id: String(authorization.id),
          appId: authorization.appId ? String(authorization.appId) : appId,
          appItemId: authorization.appItemId ? String(authorization.appItemId) : null,
          appItemDefinitionId: authorization.appItemDefinitionId ? String(authorization.appItemDefinitionId) : null,
          authorizationId: authorization.authorizationId ? String(authorization.authorizationId) : null,
          appBranchId: targetBranchId,
          tenantId: typeof authorization.tenantId === 'string' ? authorization.tenantId : null,
          monitor: toPrismaJsonInput(authorization.monitor),
          condition: typeof authorization.condition === 'string' ? authorization.condition : null,
          name: typeof authorization.name === 'string' ? authorization.name : null,
          monitored: toPrismaJsonInput(authorization.monitored),
        })),
      })
    }

    if (permissionControls.length > 0) {
      await tx.mdAppDataPermissionControlDefinition.createMany({
        data: permissionControls.map(control => ({
          id: String(control.id),
          appId: control.appId ? String(control.appId) : appId,
          appItemId: control.appItemId ? String(control.appItemId) : null,
          appItemDefinitionId: control.appItemDefinitionId ? String(control.appItemDefinitionId) : null,
          tenantId: typeof control.tenantId === 'string' ? control.tenantId : null,
          fieldDeleteAll: Boolean(control.fieldDeleteAll),
          fieldReadAll: Boolean(control.fieldReadAll),
          condition: typeof control.condition === 'string' ? control.condition : null,
          fieldWriteAll: Boolean(control.fieldWriteAll),
          authorizationId: toNullableBigInt(control.authorizationId as BigintLikeInput),
          tableId: toNullableBigInt(control.tableId as BigintLikeInput),
          fieldControls: toPrismaJsonInput(control.fieldControls),
        })),
      })
    }
  })

  return { success: true as const }
}
