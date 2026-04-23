import { z } from 'zod'

const idSchema = z.string().trim().min(1)
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

export const appItemInputSchema = appIdInputSchema.extend({
  appItemId: idSchema,
})

export const appOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().optional(),
  iconColor: z.string().optional(),
  iconName: z.string().optional(),
  version: z.string().optional(),
  homeItemId: idSchema.optional(),
  schema: z.string().optional(),
  metadata: z.unknown().optional(),
})

export const appItemSimpleOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: appItemTypeSchema,
  iconName: z.string().optional(),
  iconColor: z.string().optional(),
  category: appItemCategorySchema.optional(),
  metadata: z.unknown().optional(),
  children: z.array(z.any()),
})

export const appViewOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  tableCode: z.string().optional(),
  metadata: z.unknown().optional(),
  content: z.string().optional(),
  scene: appViewSceneSchema.optional(),
  type: appViewTypeSchema.optional(),
  platform: appViewPlatformSchema.optional(),
  category: appViewCategorySchema.optional(),
  filter: z.string().optional(),
  bindFields: z.unknown().optional(),
})

export const appItemFormFieldOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  key: z.string(),
  type: z.string(),
  metadata: z.unknown().optional(),
})

export const appItemFormOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string(),
  fields: z.array(appItemFormFieldOutputSchema),
  subForms: z.array(z.any()),
  metadata: z.unknown().optional(),
})

export const appItemOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: appItemTypeSchema,
  iconName: z.string().optional(),
  iconColor: z.string().optional(),
  category: appItemCategorySchema.optional(),
  description: z.string().optional(),
  metadata: z.unknown().optional(),
  schema: z.string().optional(),
  views: z.array(appViewOutputSchema),
  form: appItemFormOutputSchema.optional(),
})

export const appListOutputSchema = z.array(appOutputSchema)
export const appItemSimpleListOutputSchema = z.array(appItemSimpleOutputSchema)

export type AppIdInput = z.infer<typeof appIdInputSchema>
export type AppItemInput = z.infer<typeof appItemInputSchema>
