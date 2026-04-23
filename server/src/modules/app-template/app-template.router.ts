import { authedProcedure, router } from '../../rpc/trpc'
import {
  applyTemplate,
  createFromHistory,
  deleteTemplate,
  findAll,
  findCategories,
  findOne,
  updateTemplate,
} from './app-template.service'
import {
  applyResultOutputSchema,
  applyTemplateInputSchema,
  categoryListOutputSchema,
  createTemplateInputSchema,
  deleteResultSchema,
  queryTemplateInputSchema,
  templateDetailOutputSchema,
  templateIdInputSchema,
  templateListOutputSchema,
  updateTemplateInputSchema,
} from './dto'

export const appTemplateRouter = router({
  create: authedProcedure
    .meta({
      openapi: {
        summary: '从发布历史创建应用模版',
        tags: ['app-template'],
      },
    })
    .input(createTemplateInputSchema)
    .output(templateDetailOutputSchema)
    .mutation(({ input, ctx }) => createFromHistory(input, ctx.user.id)),

  list: authedProcedure
    .meta({
      openapi: {
        summary: '查询应用模版列表',
        tags: ['app-template'],
      },
    })
    .input(queryTemplateInputSchema.optional())
    .output(templateListOutputSchema)
    .query(({ input }) => findAll(input)),

  categories: authedProcedure
    .meta({
      openapi: {
        summary: '查询应用模版分类列表',
        tags: ['app-template'],
      },
    })
    .output(categoryListOutputSchema)
    .query(() => findCategories()),

  detail: authedProcedure
    .meta({
      openapi: {
        summary: '查询应用模版详情',
        tags: ['app-template'],
      },
    })
    .input(templateIdInputSchema)
    .output(templateDetailOutputSchema)
    .query(({ input }) => findOne(input.id)),

  update: authedProcedure
    .meta({
      openapi: {
        summary: '更新应用模版信息',
        tags: ['app-template'],
      },
    })
    .input(updateTemplateInputSchema)
    .output(templateDetailOutputSchema)
    .mutation(({ input }) => updateTemplate(input)),

  delete: authedProcedure
    .meta({
      openapi: {
        summary: '删除应用模版',
        tags: ['app-template'],
      },
    })
    .input(templateIdInputSchema)
    .output(deleteResultSchema)
    .mutation(({ input }) => deleteTemplate(input.id)),

  applyTemplate: authedProcedure
    .meta({
      openapi: {
        summary: '基于应用模版创建新应用',
        tags: ['app-template'],
      },
    })
    .input(applyTemplateInputSchema)
    .output(applyResultOutputSchema)
    .mutation(({ input, ctx }) => applyTemplate(input, ctx.user.id)),
})
