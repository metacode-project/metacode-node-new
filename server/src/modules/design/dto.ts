import { z } from 'zod'

const idSchema = z.string().trim().min(1)
const bigintLikeSchema = z.union([
  z.bigint(),
  z.number().int(),
  z.string().regex(/^-?\d+$/),
])

const appStatusSchema = z.enum(['RUNNING', 'MAINTENANCE', 'NOT_RELEASED'])
const clientTypeSchema = z.enum(['PC', 'H5'])
const appItemCategorySchema = z.enum(['DATA', 'FLOW', 'STAT', 'BI', 'CUSTOM', 'THIRD_LINK'])
const appItemTypeSchema = z.enum(['ITEM_GROUP', 'ITEM'])
const appViewCategorySchema = z.enum(['COMMON', 'USER'])
const appViewPlatformSchema = z.enum(['PC', 'H5'])
const appViewSceneSchema = z.enum(['LIST', 'DETAIL'])
const appViewTypeSchema = z.enum([
  'TABLE_VIEW',
  'CARD_VIEW',
  'KANBAN_VIEW',
  'CALENDAR_VIEW',
  'DESIGNER_VIEW',
  'GANTT_VIEW',
])

export const appIdInputSchema = z.object({
  appId: idSchema,
})

export const appVersionOutputSchema = z.object({
  appId: idSchema,
  version: z.string().nullable(),
})

const appMutationFieldsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  iconName: z.string().trim().optional(),
  iconColor: z.string().trim().optional(),
  homeItemId: idSchema.optional(),
  status: appStatusSchema.optional(),
  schema: z.string().trim().optional(),
  items: z.array(z.unknown()).optional(),
  permission: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const createAppInputSchema = appMutationFieldsSchema.extend({
  name: z.string().trim().min(1),
})

export const updateAppInputSchema = appIdInputSchema.merge(appMutationFieldsSchema.partial())

export const branchListInputSchema = appIdInputSchema

export const createBranchInputSchema = appIdInputSchema.extend({
  name: z.string().trim().min(1),
  sourceBranchId: idSchema.optional(),
})

export const updateBranchInputSchema = appIdInputSchema.extend({
  branchId: idSchema,
  name: z.string().trim().min(1),
})

export const deleteBranchInputSchema = appIdInputSchema.extend({
  branchId: idSchema,
})

export const itemListInputSchema = appIdInputSchema.extend({
  branchId: idSchema.optional(),
  client: clientTypeSchema.optional(),
})

export const itemGetInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  branchId: idSchema.optional(),
})

const itemMutationFieldsSchema = z.object({
  appDefinitionId: idSchema.optional(),
  appItemId: idSchema.optional(),
  name: z.string().trim().optional(),
  flowDeploymentId: bigintLikeSchema.optional(),
  tenantId: z.string().trim().optional(),
  iconName: z.string().trim().optional(),
  tableId: bigintLikeSchema.optional(),
  formId: bigintLikeSchema.optional(),
  version: z.string().trim().optional(),
  parentId: idSchema.optional(),
  sortIndex: z.number().int().optional(),
  iconColor: z.string().trim().optional(),
  category: appItemCategorySchema.optional(),
  metadata: z.unknown().optional(),
  description: z.string().trim().optional(),
  flowDefinitionId: bigintLikeSchema.optional(),
  type: appItemTypeSchema.optional(),
  client: clientTypeSchema.optional(),
})

export const createItemInputSchema = appIdInputSchema
  .extend({
    branchId: idSchema.optional(),
  })
  .merge(itemMutationFieldsSchema)

export const updateItemInputSchema = appIdInputSchema
  .extend({
    itemId: idSchema,
    branchId: idSchema.optional(),
  })
  .merge(itemMutationFieldsSchema.partial())

export const patchItemInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  branchId: idSchema.optional(),
  table: z.string().trim().optional(),
})

export const deleteItemInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  branchId: idSchema.optional(),
})

export const viewListInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  branchId: idSchema.optional(),
})

export const viewGetInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  viewId: idSchema,
  branchId: idSchema.optional(),
})

export const viewHistoryInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  viewId: idSchema,
  branchId: idSchema.optional(),
})

const viewMutationFieldsSchema = z.object({
  appItemDefinitionId: idSchema.optional(),
  appViewId: idSchema.optional(),
  filter: z.string().trim().optional(),
  platform: appViewPlatformSchema.optional(),
  type: appViewTypeSchema.optional(),
  tableCode: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
  scene: appViewSceneSchema.optional(),
  name: z.string().trim().optional(),
  metadata: z.unknown().optional(),
  content: z.string().optional(),
  principals: z.unknown().optional(),
  bindFields: z.unknown().optional(),
  category: appViewCategorySchema.optional(),
  userId: bigintLikeSchema.optional(),
})

export const createViewInputSchema = appIdInputSchema
  .extend({
    itemId: idSchema,
    branchId: idSchema.optional(),
  })
  .merge(viewMutationFieldsSchema)

export const updateViewInputSchema = appIdInputSchema
  .extend({
    itemId: idSchema,
    viewId: idSchema,
    branchId: idSchema.optional(),
  })
  .merge(viewMutationFieldsSchema.partial())

export const restoreViewInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  viewId: idSchema,
  historyId: idSchema,
  branchId: idSchema.optional(),
})

export const deleteViewInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  viewId: idSchema,
  branchId: idSchema.optional(),
})

export const dataAuthorizationListInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  branchId: idSchema.optional(),
})

export const dataAuthorizationGetInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  authorizationId: idSchema,
  branchId: idSchema.optional(),
})

const dataAuthorizationMutationFieldsSchema = z.object({
  appItemDefinitionId: idSchema.optional(),
  tenantId: z.string().trim().optional(),
  monitor: z.unknown().optional(),
  condition: z.string().optional(),
  name: z.string().trim().optional(),
  monitored: z.unknown().optional(),
})

export const createDataAuthorizationInputSchema = appIdInputSchema
  .extend({
    itemId: idSchema,
    branchId: idSchema.optional(),
  })
  .merge(dataAuthorizationMutationFieldsSchema)

export const updateDataAuthorizationInputSchema = appIdInputSchema
  .extend({
    itemId: idSchema,
    authorizationId: idSchema,
    branchId: idSchema.optional(),
  })
  .merge(dataAuthorizationMutationFieldsSchema.partial())

export const deleteDataAuthorizationInputSchema = appIdInputSchema.extend({
  itemId: idSchema,
  authorizationId: idSchema,
  branchId: idSchema.optional(),
})

export const deploymentCreateInputSchema = appIdInputSchema.extend({
  branchId: idSchema.optional(),
  version: z.string().trim().min(1),
  remark: z.string().trim().optional(),
})

export const deploymentHistoryInputSchema = appIdInputSchema.extend({
  branchId: idSchema.optional(),
})

export const deploymentRestoreInputSchema = appIdInputSchema.extend({
  historyId: idSchema,
  branchId: idSchema.optional(),
})

const appDefinitionOutputSchema = z.object({
  id: idSchema,
  appId: idSchema,
}).passthrough()

const branchOutputSchema = z.object({
  id: idSchema,
}).passthrough()

const itemOutputSchema = z.object({
  id: idSchema,
}).passthrough()

const viewOutputSchema = z.object({
  id: idSchema,
}).passthrough()

const dataAuthorizationOutputSchema = z.object({
  id: idSchema,
}).passthrough()

const deploymentHistoryOutputSchema = z.object({
  id: idSchema,
}).passthrough()

export const appDefinitionListOutputSchema = z.array(appDefinitionOutputSchema)
export const appDefinitionOutputWithRelationsSchema = appDefinitionOutputSchema
export const branchListOutputSchema = z.array(branchOutputSchema)
export const branchOutputSchemaSingle = branchOutputSchema
export const itemListOutputSchema = z.array(itemOutputSchema)
export const itemOutputSchemaSingle = itemOutputSchema
export const viewListOutputSchema = z.array(viewOutputSchema)
export const viewOutputSchemaSingle = viewOutputSchema
export const viewHistoryListOutputSchema = z.array(z.object({ id: idSchema }).passthrough())
export const dataAuthorizationListOutputSchema = z.array(dataAuthorizationOutputSchema)
export const dataAuthorizationOutputSchemaSingle = dataAuthorizationOutputSchema
export const deploymentHistoryListOutputSchema = z.array(deploymentHistoryOutputSchema)
export const deploymentHistoryOutputSchemaSingle = deploymentHistoryOutputSchema
export const deleteResultSchema = z.object({
  success: z.literal(true),
})

export type BigintLikeInput = z.infer<typeof bigintLikeSchema>
export type CreateAppInput = z.infer<typeof createAppInputSchema>
export type UpdateAppInput = z.infer<typeof updateAppInputSchema>
export type CreateBranchInput = z.infer<typeof createBranchInputSchema>
export type UpdateBranchInput = z.infer<typeof updateBranchInputSchema>
export type CreateItemInput = z.infer<typeof createItemInputSchema>
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>
export type PatchItemInput = z.infer<typeof patchItemInputSchema>
export type CreateViewInput = z.infer<typeof createViewInputSchema>
export type UpdateViewInput = z.infer<typeof updateViewInputSchema>
export type CreateDataAuthorizationInput = z.infer<typeof createDataAuthorizationInputSchema>
export type UpdateDataAuthorizationInput = z.infer<typeof updateDataAuthorizationInputSchema>
export type DeploymentCreateInput = z.infer<typeof deploymentCreateInputSchema>
