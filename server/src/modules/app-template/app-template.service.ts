import type {
  AppItemCategory,
  AppItemType,
  AppViewCategory,
  AppViewPlatform,
  AppViewScene,
  AppViewType,
  ClientTypeEnum,
} from '../../generated/prisma/enums'
import type {
  ApplyTemplateInput,
  CreateTemplateInput,
  QueryTemplateInput,
  UpdateTemplateInput,
} from './dto'
import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import { nextSnowflakeId } from '../../lib/snowflake'

interface TemplateConfiguration {
  appDefinition: {
    id: string
    appId: string
    name: string | null
    schemaId: string | null
    homeItemId: string | null
    sortIndex: number | null
    metadata: unknown
    iconColor: string | null
    iconName: string | null
    description: string | null
    status: string | null
    tenantId: string | null
    createTime: string | null
  }
  itemDefinitions: Array<{
    id: string
    appDefinitionId: string | null
    appId: string | null
    appItemId: string | null
    appBranchId: string | null
    name: string | null
    tableId: string | null
    formId: string | null
    parentId: string | null
    sortIndex: number | null
    iconColor: string | null
    iconName: string | null
    category: string | null
    metadata: unknown
    description: string | null
    type: string | null
    client: string | null
    tenantId: string | null
    flowDefinitionId: string | null
    flowDeploymentId: string | null
    version: string | null
  }>
  viewDefinitions: Array<{
    id: string
    appId: string | null
    appItemId: string | null
    appItemDefinitionId: string | null
    appViewId: string | null
    appBranchId: string | null
    filter: string | null
    platform: string | null
    type: string | null
    tableCode: string | null
    scene: string | null
    name: string | null
    metadata: unknown
    content: string | null
    principals: unknown
    bindFields: unknown
    category: string | null
    userId: string | null
    tenantId: string | null
  }>
  authDefinitions: Array<{
    id: string
    appId: string | null
    appItemId: string | null
    appItemDefinitionId: string | null
    authorizationId: string | null
    appBranchId: string | null
    monitor: unknown
    condition: string | null
    name: string | null
    monitored: unknown
    tenantId: string | null
  }>
  permissionControls: Array<{
    id: string
    appId: string | null
    appItemId: string | null
    appItemDefinitionId: string | null
    tenantId: string | null
    fieldDeleteAll: boolean
    fieldReadAll: boolean
    condition: string | null
    fieldWriteAll: boolean
    authorizationId: string | null
    tableId: string | null
    fieldControls: unknown
  }>
  schema: {
    id: string
    name: string | null
    metadata: unknown
    tenantId: string | null
    key: string | null
    tables: Array<{
      id: string
      name: string | null
      key: string | null
      metadata: unknown
      schemaId: string | null
      tenantId: string | null
      fields: Array<{
        id: string
        name: string | null
        type: string | null
        key: string | null
        index: number
        metadata: unknown
        tableId: string | null
        tenantId: string | null
      }>
      indexes: Array<{
        id: string
        name: string | null
        key: string | null
        fields: string | null
        unique: boolean
        tableId: string | null
        tenantId: string | null
      }>
    }>
    relations: Array<{
      id: string
      type: number | null
      tableId: string | null
      referenceTableId: string | null
      fieldId: string | null
      referenceFieldId: string | null
      cascadeDelete: boolean
      mode: string | null
      condition: string | null
      tenantId: string | null
    }>
  } | null
}

interface IdMapping {
  appId: string
  appDefinitionId: string
  branchId: string
  itemDefinitionId: Map<string, string>
  viewDefinitionId: Map<string, string>
  authDefinitionId: Map<string, string>
  permissionControlId: Map<string, string>
  tableId: Map<string, bigint>
  fieldId: Map<string, bigint>
  indexId: Map<string, bigint>
  relationId: Map<string, bigint>
}

function toPrismaJsonInput(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return Prisma.JsonNull
  }
  return value as Prisma.InputJsonValue
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

function normalizeSnapshotId(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return null
}

function parseRequiredString(value: unknown, fieldName: string): string {
  const normalized = normalizeSnapshotId(value)
  if (!normalized) {
    throwBadRequest(`应用模版配置字段 ${fieldName} 缺失`)
  }
  return normalized
}

function parseOptionalBigInt(value: unknown, fieldName: string): bigint | null {
  const normalized = normalizeSnapshotId(value)
  if (!normalized) {
    return null
  }

  try {
    return BigInt(normalized)
  }
  catch {
    throwBadRequest(`应用模版配置字段 ${fieldName} 不是有效数字`)
  }
}

function ensureMappedBigInt(map: Map<string, bigint>, sourceId: string, fieldName: string): bigint {
  const mapped = map.get(sourceId)
  if (!mapped) {
    throwBadRequest(`应用模版配置字段 ${fieldName} 引用不存在：${sourceId}`)
  }
  return mapped
}

function parseTemplateConfiguration(configuration: string): TemplateConfiguration {
  let parsed: unknown

  try {
    parsed = JSON.parse(configuration)
  }
  catch {
    throwBadRequest('应用模版配置解析失败')
  }

  if (!parsed || typeof parsed !== 'object') {
    throwBadRequest('应用模版配置格式错误')
  }

  const config = parsed as Partial<TemplateConfiguration>
  if (!config.appDefinition || typeof config.appDefinition !== 'object') {
    throwBadRequest('应用模版配置缺少 appDefinition')
  }

  const appDefinition = config.appDefinition
  appDefinition.id = parseRequiredString(appDefinition.id, 'appDefinition.id')
  appDefinition.appId = parseRequiredString(appDefinition.appId, 'appDefinition.appId')

  return {
    appDefinition,
    itemDefinitions: Array.isArray(config.itemDefinitions) ? config.itemDefinitions : [],
    viewDefinitions: Array.isArray(config.viewDefinitions) ? config.viewDefinitions : [],
    authDefinitions: Array.isArray(config.authDefinitions) ? config.authDefinitions : [],
    permissionControls: Array.isArray(config.permissionControls) ? config.permissionControls : [],
    schema: config.schema && typeof config.schema === 'object'
      ? config.schema
      : null,
  }
}

function toTemplateOutput(template: {
  id: string
  name: string
  description: string | null
  icon: string | null
  category: string | null
  tags: unknown
  sourceAppId: string | null
  sourceVersion: string | null
  creator: string | null
  createTime: Date
  updateTime: Date | null
}) {
  return serializeOutput({
    id: template.id,
    name: template.name,
    description: template.description,
    icon: template.icon,
    category: template.category,
    tags: Array.isArray(template.tags) ? template.tags : null,
    sourceAppId: template.sourceAppId,
    sourceVersion: template.sourceVersion,
    creator: template.creator,
    createTime: template.createTime,
    updateTime: template.updateTime,
  })
}

function buildTemplateDetailOutput(template: {
  id: string
  name: string
  description: string | null
  icon: string | null
  category: string | null
  tags: unknown
  sourceAppId: string | null
  sourceVersion: string | null
  creator: string | null
  createTime: Date
  updateTime: Date | null
  configuration: string
}) {
  let configuration: unknown
  try {
    configuration = JSON.parse(template.configuration)
  }
  catch {
    configuration = template.configuration
  }

  return serializeOutput({
    ...toTemplateOutput(template),
    configuration,
  })
}

function buildSchemaKey(baseKey: string | null | undefined) {
  return `${baseKey ?? 'schema'}_${randomUUID().slice(0, 8)}`
}

function generateIdMapping(config: TemplateConfiguration): IdMapping {
  const mapping: IdMapping = {
    appId: randomUUID(),
    appDefinitionId: randomUUID(),
    branchId: randomUUID(),
    itemDefinitionId: new Map(),
    viewDefinitionId: new Map(),
    authDefinitionId: new Map(),
    permissionControlId: new Map(),
    tableId: new Map(),
    fieldId: new Map(),
    indexId: new Map(),
    relationId: new Map(),
  }

  for (const item of config.itemDefinitions) {
    mapping.itemDefinitionId.set(parseRequiredString(item.id, 'itemDefinitions.id'), randomUUID())
  }

  for (const view of config.viewDefinitions) {
    mapping.viewDefinitionId.set(parseRequiredString(view.id, 'viewDefinitions.id'), randomUUID())
  }

  for (const auth of config.authDefinitions) {
    mapping.authDefinitionId.set(parseRequiredString(auth.id, 'authDefinitions.id'), randomUUID())
  }

  for (const control of config.permissionControls) {
    mapping.permissionControlId.set(parseRequiredString(control.id, 'permissionControls.id'), randomUUID())
  }

  if (config.schema) {
    for (const table of config.schema.tables) {
      mapping.tableId.set(parseRequiredString(table.id, 'schema.tables.id'), nextSnowflakeId())
      for (const field of table.fields) {
        mapping.fieldId.set(parseRequiredString(field.id, 'schema.tables.fields.id'), nextSnowflakeId())
      }
      for (const index of table.indexes) {
        mapping.indexId.set(parseRequiredString(index.id, 'schema.tables.indexes.id'), nextSnowflakeId())
      }
    }

    for (const relation of config.schema.relations) {
      mapping.relationId.set(parseRequiredString(relation.id, 'schema.relations.id'), nextSnowflakeId())
    }
  }

  return mapping
}

async function cloneSchema(
  schema: NonNullable<TemplateConfiguration['schema']>,
  idMapping: IdMapping,
  tenantId: string,
  tx: Prisma.TransactionClient,
): Promise<bigint> {
  const clonedSchema = await tx.schema.create({
    data: {
      name: schema.name,
      metadata: toPrismaJsonInput(schema.metadata),
      tenantId,
      key: buildSchemaKey(schema.key),
    },
    select: {
      id: true,
    },
  })

  for (const table of schema.tables) {
    const sourceTableId = parseRequiredString(table.id, 'schema.tables.id')
    const newTableId = ensureMappedBigInt(idMapping.tableId, sourceTableId, 'schema.tables.id')

    await tx.schemaTable.create({
      data: {
        id: newTableId,
        name: table.name,
        key: table.key,
        metadata: toPrismaJsonInput(table.metadata),
        schemaId: clonedSchema.id,
        tenantId,
      },
    })

    for (const field of table.fields) {
      const sourceFieldId = parseRequiredString(field.id, 'schema.tables.fields.id')
      const newFieldId = ensureMappedBigInt(idMapping.fieldId, sourceFieldId, 'schema.tables.fields.id')

      await tx.schemaField.create({
        data: {
          id: newFieldId,
          name: field.name,
          type: field.type,
          key: field.key,
          index: typeof field.index === 'number' ? field.index : 0,
          metadata: toPrismaJsonInput(field.metadata),
          tableId: newTableId,
          tenantId,
        },
      })
    }

    for (const index of table.indexes) {
      const sourceIndexId = parseRequiredString(index.id, 'schema.tables.indexes.id')
      const newIndexId = ensureMappedBigInt(idMapping.indexId, sourceIndexId, 'schema.tables.indexes.id')

      await tx.schemaIndex.create({
        data: {
          id: newIndexId,
          name: index.name,
          key: index.key,
          fields: index.fields,
          unique: Boolean(index.unique),
          tableId: newTableId,
          tenantId,
        },
      })
    }
  }

  for (const relation of schema.relations) {
    const sourceRelationId = parseRequiredString(relation.id, 'schema.relations.id')
    const newRelationId = ensureMappedBigInt(idMapping.relationId, sourceRelationId, 'schema.relations.id')

    const sourceTableId = normalizeSnapshotId(relation.tableId)
    const sourceReferenceTableId = normalizeSnapshotId(relation.referenceTableId)
    const sourceFieldId = normalizeSnapshotId(relation.fieldId)
    const sourceReferenceFieldId = normalizeSnapshotId(relation.referenceFieldId)

    const newTableId = sourceTableId
      ? ensureMappedBigInt(idMapping.tableId, sourceTableId, 'schema.relations.tableId')
      : null
    const newReferenceTableId = sourceReferenceTableId
      ? ensureMappedBigInt(idMapping.tableId, sourceReferenceTableId, 'schema.relations.referenceTableId')
      : null
    const newFieldId = sourceFieldId
      ? ensureMappedBigInt(idMapping.fieldId, sourceFieldId, 'schema.relations.fieldId')
      : null
    const newReferenceFieldId = sourceReferenceFieldId
      ? ensureMappedBigInt(idMapping.fieldId, sourceReferenceFieldId, 'schema.relations.referenceFieldId')
      : null

    await tx.schemaRelation.create({
      data: {
        id: newRelationId,
        type: typeof relation.type === 'number' ? relation.type : null,
        tableId: newTableId,
        referenceTableId: newReferenceTableId,
        fieldId: newFieldId,
        referenceFieldId: newReferenceFieldId,
        cascadeDelete: Boolean(relation.cascadeDelete),
        mode: relation.mode,
        condition: relation.condition,
        tenantId,
      },
    })
  }

  return clonedSchema.id
}

function resolveMappedOrOriginalBigInt(
  value: string | null,
  mapping: Map<string, bigint>,
  fieldName: string,
): bigint | null {
  if (!value) {
    return null
  }

  const mapped = mapping.get(value)
  if (mapped) {
    return mapped
  }

  return parseOptionalBigInt(value, fieldName)
}

async function createAppFromConfig(
  config: TemplateConfiguration,
  idMapping: IdMapping,
  dto: ApplyTemplateInput,
  newSchemaId: bigint | null,
  userId: string | undefined,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const newAppId = idMapping.appId
  const newAppDefinitionId = idMapping.appDefinitionId
  const newBranchId = idMapping.branchId
  const tenantId = dto.tenantId ?? 'default'

  await tx.mdAppDefinition.create({
    data: {
      id: newAppDefinitionId,
      appId: newAppId,
      name: dto.appName,
      description: dto.appDescription ?? config.appDefinition.description,
      schemaId: newSchemaId,
      homeItemId: config.appDefinition.homeItemId
        ? idMapping.itemDefinitionId.get(config.appDefinition.homeItemId) ?? null
        : null,
      sortIndex: config.appDefinition.sortIndex,
      metadata: toPrismaJsonInput(config.appDefinition.metadata),
      iconColor: config.appDefinition.iconColor,
      iconName: config.appDefinition.iconName,
      status: 'NOT_RELEASED',
      createTime: new Date(),
      tenantId,
    },
  })

  await tx.mdAppBranch.create({
    data: {
      id: newBranchId,
      name: 'dev',
      appId: newAppId,
      appDefinitionId: newAppDefinitionId,
      createUser: userId ?? null,
      createTime: new Date(),
      tenantId,
    },
  })

  for (const item of config.itemDefinitions) {
    const sourceItemId = parseRequiredString(item.id, 'itemDefinitions.id')
    const newItemId = idMapping.itemDefinitionId.get(sourceItemId)

    if (!newItemId) {
      throwBadRequest(`应用模版配置字段 itemDefinitions.id 引用不存在：${sourceItemId}`)
    }

    const tableId = resolveMappedOrOriginalBigInt(item.tableId, idMapping.tableId, 'itemDefinitions.tableId')

    await tx.mdAppItemDefinition.create({
      data: {
        id: newItemId,
        appDefinitionId: newAppDefinitionId,
        appId: newAppId,
        appItemId: newItemId,
        appBranchId: newBranchId,
        name: item.name,
        tableId,
        formId: parseOptionalBigInt(item.formId, 'itemDefinitions.formId'),
        parentId: item.parentId
          ? idMapping.itemDefinitionId.get(item.parentId) ?? null
          : null,
        sortIndex: item.sortIndex,
        iconColor: item.iconColor,
        iconName: item.iconName,
        category: item.category as AppItemCategory | null,
        metadata: toPrismaJsonInput(item.metadata),
        description: item.description,
        type: item.type as AppItemType | null,
        client: item.client as ClientTypeEnum | null,
        tenantId,
        flowDefinitionId: parseOptionalBigInt(item.flowDefinitionId, 'itemDefinitions.flowDefinitionId'),
        flowDeploymentId: parseOptionalBigInt(item.flowDeploymentId, 'itemDefinitions.flowDeploymentId'),
        version: item.version,
      },
    })
  }

  for (const view of config.viewDefinitions) {
    const sourceViewId = parseRequiredString(view.id, 'viewDefinitions.id')
    const newViewId = idMapping.viewDefinitionId.get(sourceViewId)

    if (!newViewId) {
      throwBadRequest(`应用模版配置字段 viewDefinitions.id 引用不存在：${sourceViewId}`)
    }

    await tx.mdAppViewDefinition.create({
      data: {
        id: newViewId,
        appId: newAppId,
        appItemId: view.appItemId && idMapping.itemDefinitionId.has(view.appItemId)
          ? idMapping.itemDefinitionId.get(view.appItemId)!
          : null,
        appItemDefinitionId: view.appItemDefinitionId && idMapping.itemDefinitionId.has(view.appItemDefinitionId)
          ? idMapping.itemDefinitionId.get(view.appItemDefinitionId)!
          : null,
        appViewId: newViewId,
        appBranchId: newBranchId,
        filter: view.filter,
        platform: view.platform as AppViewPlatform | null,
        type: view.type as AppViewType | null,
        tableCode: view.tableCode,
        scene: view.scene as AppViewScene | null,
        name: view.name,
        metadata: toPrismaJsonInput(view.metadata),
        content: view.content,
        principals: toPrismaJsonInput(view.principals),
        bindFields: toPrismaJsonInput(view.bindFields),
        category: view.category as AppViewCategory | null,
        userId: parseOptionalBigInt(view.userId, 'viewDefinitions.userId'),
        tenantId,
      },
    })
  }

  for (const auth of config.authDefinitions) {
    const sourceAuthId = parseRequiredString(auth.id, 'authDefinitions.id')
    const newAuthId = idMapping.authDefinitionId.get(sourceAuthId)

    if (!newAuthId) {
      throwBadRequest(`应用模版配置字段 authDefinitions.id 引用不存在：${sourceAuthId}`)
    }

    await tx.mdAppDataAuthorizationDefinition.create({
      data: {
        id: newAuthId,
        appId: newAppId,
        appItemId: auth.appItemId && idMapping.itemDefinitionId.has(auth.appItemId)
          ? idMapping.itemDefinitionId.get(auth.appItemId)!
          : null,
        appItemDefinitionId: auth.appItemDefinitionId && idMapping.itemDefinitionId.has(auth.appItemDefinitionId)
          ? idMapping.itemDefinitionId.get(auth.appItemDefinitionId)!
          : null,
        authorizationId: randomUUID(),
        appBranchId: newBranchId,
        monitor: toPrismaJsonInput(auth.monitor),
        condition: auth.condition,
        name: auth.name,
        monitored: toPrismaJsonInput(auth.monitored),
        tenantId,
      },
    })
  }

  for (const control of config.permissionControls) {
    const sourceControlId = parseRequiredString(control.id, 'permissionControls.id')
    const newControlId = idMapping.permissionControlId.get(sourceControlId)

    if (!newControlId) {
      throwBadRequest(`应用模版配置字段 permissionControls.id 引用不存在：${sourceControlId}`)
    }

    const newTableId = resolveMappedOrOriginalBigInt(control.tableId, idMapping.tableId, 'permissionControls.tableId')

    await tx.mdAppDataPermissionControlDefinition.create({
      data: {
        id: newControlId,
        appId: newAppId,
        appItemId: control.appItemId && idMapping.itemDefinitionId.has(control.appItemId)
          ? idMapping.itemDefinitionId.get(control.appItemId)!
          : null,
        appItemDefinitionId: control.appItemDefinitionId && idMapping.itemDefinitionId.has(control.appItemDefinitionId)
          ? idMapping.itemDefinitionId.get(control.appItemDefinitionId)!
          : null,
        tenantId,
        fieldDeleteAll: Boolean(control.fieldDeleteAll),
        fieldReadAll: Boolean(control.fieldReadAll),
        condition: control.condition,
        fieldWriteAll: Boolean(control.fieldWriteAll),
        authorizationId: parseOptionalBigInt(control.authorizationId, 'permissionControls.authorizationId'),
        tableId: newTableId,
        fieldControls: toPrismaJsonInput(control.fieldControls),
      },
    })
  }
}

export async function createFromHistory(input: CreateTemplateInput, userId?: string) {
  const history = await prisma.mdAppDeploymentHistory.findFirst({
    where: {
      appId: input.sourceAppId,
      version: input.sourceVersion,
    },
  })

  if (!history) {
    throwNotFound(`应用 ${input.sourceAppId} 的版本 ${input.sourceVersion} 不存在`)
  }

  if (!history.configuration) {
    throwBadRequest(`应用 ${input.sourceAppId} 的版本 ${input.sourceVersion} 没有配置快照`)
  }

  const template = await prisma.mdAppTemplate.create({
    data: {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      category: input.category ?? null,
      tags: toPrismaJsonInput(input.tags ?? null),
      sourceAppId: input.sourceAppId,
      sourceVersion: input.sourceVersion,
      configuration: history.configuration,
      creator: userId ?? null,
      createTime: new Date(),
    },
  })

  return toTemplateOutput(template)
}

export async function findAll(input?: Partial<QueryTemplateInput>) {
  const page = input?.page ?? 1
  const pageSize = input?.pageSize ?? 20
  const category = input?.category
  const keyword = input?.keyword
  const creator = input?.creator
  const skip = (page - 1) * pageSize

  const where: Prisma.MdAppTemplateWhereInput = {}

  if (category) {
    where.category = category
  }

  if (creator) {
    where.creator = creator
  }

  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { description: { contains: keyword } },
    ]
  }

  const [total, templates] = await Promise.all([
    prisma.mdAppTemplate.count({ where }),
    prisma.mdAppTemplate.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: {
        createTime: 'desc',
      },
    }),
  ])

  return {
    data: templates.map(template => toTemplateOutput(template)),
    total,
    current: page,
    pageSize,
  }
}

export async function findCategories() {
  const categories = await prisma.mdAppTemplate.findMany({
    where: {
      category: {
        not: null,
      },
    },
    select: {
      category: true,
    },
    distinct: ['category'],
  })

  return {
    categories: categories
      .map(item => item.category)
      .filter((item): item is string => item !== null),
  }
}

export async function findOne(id: string) {
  const template = await prisma.mdAppTemplate.findUnique({
    where: { id },
  })

  if (!template) {
    throwNotFound(`应用模版 ${id} 不存在`)
  }

  return buildTemplateDetailOutput(template)
}

export async function updateTemplate(input: UpdateTemplateInput) {
  const existing = await prisma.mdAppTemplate.findUnique({
    where: {
      id: input.id,
    },
  })

  if (!existing) {
    throwNotFound(`应用模版 ${input.id} 不存在`)
  }

  const template = await prisma.mdAppTemplate.update({
    where: {
      id: input.id,
    },
    data: {
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      icon: input.icon ?? existing.icon,
      category: input.category ?? existing.category,
      tags: input.tags === undefined
        ? undefined
        : toPrismaJsonInput(input.tags),
      updateTime: new Date(),
    },
  })

  return toTemplateOutput(template)
}

export async function deleteTemplate(id: string) {
  const existing = await prisma.mdAppTemplate.findUnique({
    where: { id },
  })

  if (!existing) {
    throwNotFound(`应用模版 ${id} 不存在`)
  }

  await prisma.mdAppTemplate.delete({
    where: { id },
  })

  return { success: true as const }
}

export async function applyTemplate(input: ApplyTemplateInput, userId?: string) {
  const template = await prisma.mdAppTemplate.findUnique({
    where: {
      id: input.id,
    },
  })

  if (!template) {
    throwNotFound(`应用模版 ${input.id} 不存在`)
  }

  const config = parseTemplateConfiguration(template.configuration)
  const idMapping = generateIdMapping(config)

  await prisma.$transaction(async (tx) => {
    let newSchemaId: bigint | null = null

    if (config.schema) {
      newSchemaId = await cloneSchema(config.schema, idMapping, input.tenantId ?? 'default', tx)
    }

    await createAppFromConfig(config, idMapping, input, newSchemaId, userId, tx)
  })

  return {
    appId: idMapping.appId,
    appDefinitionId: idMapping.appDefinitionId,
    branchId: idMapping.branchId,
    message: '应用创建成功',
  }
}
