import { publicProcedure, router } from '../../rpc/trpc'
import {
  appIdInputSchema,
  appItemInputSchema,
  appItemOutputSchema,
  appItemSimpleListOutputSchema,
  appListOutputSchema,
  appOutputSchema,
} from './dto'
import {
  findApp,
  findAppItem,
  findAppItems,
  findApps,
} from './runtime.service'

export const runtimeRouter = router({
  apps: router({
    list: publicProcedure
      .meta({
        openapi: {
          summary: '查询运行时应用列表',
          tags: ['runtime'],
        },
      })
      .output(appListOutputSchema)
      .query(() => findApps()),
    get: publicProcedure
      .meta({
        openapi: {
          summary: '查询运行时应用详情',
          tags: ['runtime'],
        },
      })
      .input(appIdInputSchema)
      .output(appOutputSchema)
      .query(({ input }) => findApp(input.appId)),
    listItems: publicProcedure
      .meta({
        openapi: {
          summary: '查询运行时应用菜单树',
          tags: ['runtime'],
        },
      })
      .input(appIdInputSchema)
      .output(appItemSimpleListOutputSchema)
      .query(({ input }) => findAppItems(input.appId)),
    getItem: publicProcedure
      .meta({
        openapi: {
          summary: '查询运行时应用页面详情',
          tags: ['runtime'],
        },
      })
      .input(appItemInputSchema)
      .output(appItemOutputSchema)
      .query(({ input }) => findAppItem(input.appId, input.appItemId)),
  }),
})
