import { z } from 'zod'

const idSchema = z.string().trim().min(1)

export const templateIdInputSchema = z.object({
  id: idSchema,
})

export const createTemplateInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tags: z.array(z.string().trim()).optional(),
  sourceAppId: idSchema,
  sourceVersion: z.string().trim().min(1),
})

export const queryTemplateInputSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  category: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
  creator: z.string().trim().optional(),
})

export const updateTemplateInputSchema = templateIdInputSchema.extend({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tags: z.array(z.string().trim()).optional(),
})

export const applyTemplateInputSchema = templateIdInputSchema.extend({
  appName: z.string().trim().min(1),
  appDescription: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
})

const templateOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
}).passthrough()

export const templateListOutputSchema = z.object({
  data: z.array(templateOutputSchema),
  total: z.number().int().nonnegative(),
  current: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const templateDetailOutputSchema = templateOutputSchema

export const categoryListOutputSchema = z.object({
  categories: z.array(z.string()),
})

export const applyResultOutputSchema = z.object({
  appId: idSchema,
  appDefinitionId: idSchema,
  branchId: idSchema,
  message: z.string(),
})

export const deleteResultSchema = z.object({
  success: z.literal(true),
})

export type CreateTemplateInput = z.infer<typeof createTemplateInputSchema>
export type QueryTemplateInput = z.infer<typeof queryTemplateInputSchema>
export type UpdateTemplateInput = z.infer<typeof updateTemplateInputSchema>
export type ApplyTemplateInput = z.infer<typeof applyTemplateInputSchema>
