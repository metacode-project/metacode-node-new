import { TRPCError } from '@trpc/server'
import { prisma } from '../../lib/prisma'

interface RuntimeMenuNode {
  id: string
  name: string
  type: 'ITEM_GROUP' | 'ITEM'
  iconName?: string
  iconColor?: string
  category?: 'DATA' | 'FLOW' | 'STAT' | 'BI' | 'CUSTOM' | 'THIRD_LINK'
  metadata?: unknown
  children: RuntimeMenuNode[]
}

interface RuntimeFormField {
  id: string
  name: string
  key: string
  type: string
  metadata?: unknown
}

interface RuntimeAppItemFormData {
  id: string
  name: string
  code: string
  fields: RuntimeFormField[]
  subForms: RuntimeAppItemFormData[]
  metadata?: unknown
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

export async function findApps() {
  const apps = await prisma.app.findMany({
    include: {
      schema: true,
    },
  })

  const output = apps.map(app => ({
    id: app.id,
    name: app.name ?? '',
    description: app.description ?? undefined,
    iconColor: app.iconColor ?? undefined,
    iconName: app.iconName ?? undefined,
    version: app.version ?? undefined,
    homeItemId: app.homeItemId ?? undefined,
    schema: app.schema?.key ?? undefined,
    metadata: app.metadata ?? undefined,
  }))

  return serializeOutput(output)
}

export async function findApp(appId: string) {
  const app = await prisma.app.findUnique({
    where: { id: appId },
    include: {
      schema: true,
    },
  })

  if (!app) {
    throwNotFound(`应用 ${appId} 不存在`)
  }

  return serializeOutput({
    id: app.id,
    name: app.name ?? '',
    description: app.description ?? undefined,
    iconColor: app.iconColor ?? undefined,
    iconName: app.iconName ?? undefined,
    version: app.version ?? undefined,
    homeItemId: app.homeItemId ?? undefined,
    schema: app.schema?.key ?? undefined,
    metadata: app.metadata ?? undefined,
  })
}

function buildAppItemTree(
  items: Array<{
    id: string
    parentId: string | null
    name: string | null
    type: 'ITEM_GROUP' | 'ITEM' | null
    iconName: string | null
    iconColor: string | null
    category: 'DATA' | 'FLOW' | 'STAT' | 'BI' | 'CUSTOM' | 'THIRD_LINK' | null
    metadata: unknown
  }>,
  parentId: string | null,
): RuntimeMenuNode[] {
  return items
    .filter(item => item.parentId === parentId)
    .map((item) => {
      const current: RuntimeMenuNode = {
        id: item.id,
        name: item.name ?? '',
        type: item.type!,
        iconName: item.iconName ?? undefined,
        iconColor: item.iconColor ?? undefined,
        category: item.category ?? undefined,
        metadata: item.metadata ?? undefined,
        children: [],
      }
      current.children = buildAppItemTree(items, item.id)
      return current
    })
}

export async function findAppItems(appId: string) {
  const appItems = await prisma.appItem.findMany({
    where: { appId },
    orderBy: {
      sortIndex: 'asc',
    },
  })

  return serializeOutput(buildAppItemTree(appItems, null))
}

export async function findAppItem(appId: string, appItemId: string) {
  const appItem = await prisma.appItem.findUnique({
    where: { id: appItemId },
    include: {
      appView: true,
      schemaTable: {
        include: {
          schema: true,
        },
      },
    },
  })

  if (!appItem || appItem.appId !== appId) {
    throwNotFound(`应用 ${appId} 下未找到页面 ${appItemId}`)
  }

  let form: RuntimeAppItemFormData | undefined
  if (appItem.schemaTable) {
    const fields = await prisma.schemaField.findMany({
      where: {
        tableId: appItem.schemaTable.id,
      },
      orderBy: {
        index: 'asc',
      },
    })

    const relations = await prisma.schemaRelation.findMany({
      where: {
        tableId: appItem.schemaTable.id,
      },
    })

    const subForms: Array<RuntimeAppItemFormData | null> = await Promise.all(relations.map(async (relation) => {
      if (!relation.referenceTableId) {
        return null
      }

      const table = await prisma.schemaTable.findUnique({
        where: { id: relation.referenceTableId },
      })

      if (!table) {
        return null
      }

      const subFields = await prisma.schemaField.findMany({
        where: {
          tableId: table.id,
        },
        orderBy: {
          index: 'asc',
        },
      })

      return {
        id: table.id.toString(),
        name: table.name ?? '',
        code: table.key ?? '',
        metadata: table.metadata ?? undefined,
        fields: subFields.map(field => ({
          id: field.id.toString(),
          name: field.name ?? '',
          key: field.key ?? '',
          type: field.type ?? '',
          metadata: field.metadata ?? undefined,
        })),
        subForms: [],
      }
    }))

    const normalizedSubForms: RuntimeAppItemFormData[] = []
    for (const subForm of subForms) {
      if (subForm) {
        normalizedSubForms.push(subForm)
      }
    }

    form = {
      id: appItem.schemaTable.id.toString(),
      name: appItem.schemaTable.name ?? '',
      code: appItem.schemaTable.key ?? '',
      metadata: appItem.schemaTable.metadata ?? undefined,
      fields: fields.map(field => ({
        id: field.id.toString(),
        name: field.name ?? '',
        key: field.key ?? '',
        type: field.type ?? '',
        metadata: field.metadata ?? undefined,
      })),
      subForms: normalizedSubForms,
    }
  }

  return serializeOutput({
    id: appItem.id,
    name: appItem.name ?? '',
    type: appItem.type!,
    iconName: appItem.iconName ?? undefined,
    iconColor: appItem.iconColor ?? undefined,
    category: appItem.category ?? undefined,
    description: appItem.description ?? undefined,
    metadata: appItem.metadata ?? undefined,
    schema: appItem.schemaTable?.schema?.key ?? undefined,
    views: appItem.appView.map(view => ({
      id: view.id,
      name: view.name ?? '',
      tableCode: view.tableCode ?? undefined,
      metadata: view.metadata ?? undefined,
      content: view.content ?? undefined,
      scene: view.scene ?? undefined,
      type: view.type ?? undefined,
      platform: view.platform ?? undefined,
      category: view.category ?? undefined,
      filter: view.filter ?? undefined,
      bindFields: view.bindFields ?? undefined,
    })),
    form,
  })
}
