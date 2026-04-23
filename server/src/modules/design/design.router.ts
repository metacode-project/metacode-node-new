import { authedProcedure, router } from '../../rpc/trpc'
import {
  createApp,
  createAppBranch,
  createAppItem,
  createAppView,
  createDataAuthorization,
  deleteAppBranch,
  deleteAppById,
  deleteAppItem,
  deleteAppView,
  deleteDataAuthorization,
  deployApp,
  findAppBranches,
  findAppByAppId,
  findAppItem,
  findAppItems,
  findApps,
  findAppView,
  findAppViewHistory,
  findAppViews,
  findCurrentAppVersion,
  findDataAuthorization,
  findDataAuthorizations,
  findDeploymentHistory,
  patchAppItem,
  restoreApp,
  restoreAppView,
  updateApp,
  updateAppBranch,
  updateAppItem,
  updateAppView,
  updateDataAuthorization,
} from './design.service'
import {
  appDefinitionListOutputSchema,
  appDefinitionOutputWithRelationsSchema,
  appIdInputSchema,
  appVersionOutputSchema,
  branchListInputSchema,
  branchListOutputSchema,
  branchOutputSchemaSingle,
  createAppInputSchema,
  createBranchInputSchema,
  createDataAuthorizationInputSchema,
  createItemInputSchema,
  createViewInputSchema,
  dataAuthorizationGetInputSchema,
  dataAuthorizationListInputSchema,
  dataAuthorizationListOutputSchema,
  dataAuthorizationOutputSchemaSingle,
  deleteBranchInputSchema,
  deleteDataAuthorizationInputSchema,
  deleteItemInputSchema,
  deleteResultSchema,
  deleteViewInputSchema,
  deploymentCreateInputSchema,
  deploymentHistoryInputSchema,
  deploymentHistoryListOutputSchema,
  deploymentHistoryOutputSchemaSingle,
  deploymentRestoreInputSchema,
  itemGetInputSchema,
  itemListInputSchema,
  itemListOutputSchema,
  itemOutputSchemaSingle,
  patchItemInputSchema,
  restoreViewInputSchema,
  updateAppInputSchema,
  updateBranchInputSchema,
  updateDataAuthorizationInputSchema,
  updateItemInputSchema,
  updateViewInputSchema,
  viewGetInputSchema,
  viewHistoryInputSchema,
  viewHistoryListOutputSchema,
  viewListInputSchema,
  viewListOutputSchema,
  viewOutputSchemaSingle,
} from './dto'

export const designRouter = router({
  apps: router({
    list: authedProcedure
      .meta({
        openapi: {
          summary: '查询应用列表',
          tags: ['design'],
        },
      })
      .output(appDefinitionListOutputSchema)
      .query(() => findApps()),
    get: authedProcedure
      .meta({
        openapi: {
          summary: '查询应用详情',
          tags: ['design'],
        },
      })
      .input(appIdInputSchema)
      .output(appDefinitionOutputWithRelationsSchema)
      .query(({ input }) => findAppByAppId(input.appId)),
    version: authedProcedure
      .meta({
        openapi: {
          summary: '查询应用当前版本',
          tags: ['design'],
        },
      })
      .input(appIdInputSchema)
      .output(appVersionOutputSchema)
      .query(({ input }) => findCurrentAppVersion(input.appId)),
    create: authedProcedure
      .meta({
        openapi: {
          summary: '创建应用',
          tags: ['design'],
        },
      })
      .input(createAppInputSchema)
      .output(appDefinitionOutputWithRelationsSchema)
      .mutation(({ input }) => createApp(input)),
    update: authedProcedure
      .meta({
        openapi: {
          summary: '更新应用',
          tags: ['design'],
        },
      })
      .input(updateAppInputSchema)
      .output(appDefinitionOutputWithRelationsSchema)
      .mutation(({ input }) => updateApp(input)),
    delete: authedProcedure
      .meta({
        openapi: {
          summary: '删除应用',
          tags: ['design'],
        },
      })
      .input(appIdInputSchema)
      .output(deleteResultSchema)
      .mutation(({ input }) => deleteAppById(input.appId)),
  }),

  branches: router({
    list: authedProcedure
      .meta({
        openapi: {
          summary: '查询应用分支列表',
          tags: ['design'],
        },
      })
      .input(branchListInputSchema)
      .output(branchListOutputSchema)
      .query(({ input }) => findAppBranches(input.appId)),
    create: authedProcedure
      .meta({
        openapi: {
          summary: '创建应用分支',
          tags: ['design'],
        },
      })
      .input(createBranchInputSchema)
      .output(branchOutputSchemaSingle)
      .mutation(({ input }) => createAppBranch(input)),
    update: authedProcedure
      .meta({
        openapi: {
          summary: '更新应用分支',
          tags: ['design'],
        },
      })
      .input(updateBranchInputSchema)
      .output(branchOutputSchemaSingle)
      .mutation(({ input }) => updateAppBranch(input)),
    delete: authedProcedure
      .meta({
        openapi: {
          summary: '删除应用分支',
          tags: ['design'],
        },
      })
      .input(deleteBranchInputSchema)
      .output(deleteResultSchema)
      .mutation(({ input }) => deleteAppBranch(input.appId, input.branchId)),
  }),

  items: router({
    list: authedProcedure
      .meta({
        openapi: {
          summary: '查询应用页面列表',
          tags: ['design'],
        },
      })
      .input(itemListInputSchema)
      .output(itemListOutputSchema)
      .query(({ input }) => findAppItems(input.appId, input.branchId, input.client)),
    get: authedProcedure
      .meta({
        openapi: {
          summary: '查询应用页面详情',
          tags: ['design'],
        },
      })
      .input(itemGetInputSchema)
      .output(itemOutputSchemaSingle)
      .query(({ input }) => findAppItem(input.appId, input.itemId, input.branchId)),
    create: authedProcedure
      .meta({
        openapi: {
          summary: '创建应用页面',
          tags: ['design'],
        },
      })
      .input(createItemInputSchema)
      .output(itemOutputSchemaSingle)
      .mutation(({ input }) => createAppItem(input)),
    update: authedProcedure
      .meta({
        openapi: {
          summary: '更新应用页面',
          tags: ['design'],
        },
      })
      .input(updateItemInputSchema)
      .output(itemOutputSchemaSingle)
      .mutation(({ input }) => updateAppItem(input)),
    patch: authedProcedure
      .meta({
        openapi: {
          summary: '局部更新应用页面',
          tags: ['design'],
        },
      })
      .input(patchItemInputSchema)
      .output(itemOutputSchemaSingle)
      .mutation(({ input }) => patchAppItem(input)),
    delete: authedProcedure
      .meta({
        openapi: {
          summary: '删除应用页面',
          tags: ['design'],
        },
      })
      .input(deleteItemInputSchema)
      .output(deleteResultSchema)
      .mutation(({ input }) => deleteAppItem(input.appId, input.itemId, input.branchId)),
  }),

  views: router({
    list: authedProcedure
      .meta({
        openapi: {
          summary: '查询页面视图列表',
          tags: ['design'],
        },
      })
      .input(viewListInputSchema)
      .output(viewListOutputSchema)
      .query(({ input }) => findAppViews(input.appId, input.itemId, input.branchId)),
    get: authedProcedure
      .meta({
        openapi: {
          summary: '查询页面视图详情',
          tags: ['design'],
        },
      })
      .input(viewGetInputSchema)
      .output(viewOutputSchemaSingle)
      .query(({ input }) => findAppView(input.appId, input.itemId, input.viewId, input.branchId)),
    history: authedProcedure
      .meta({
        openapi: {
          summary: '查询页面视图历史',
          tags: ['design'],
        },
      })
      .input(viewHistoryInputSchema)
      .output(viewHistoryListOutputSchema)
      .query(({ input }) => findAppViewHistory(input.appId, input.itemId, input.viewId, input.branchId)),
    restore: authedProcedure
      .meta({
        openapi: {
          summary: '恢复页面视图历史',
          tags: ['design'],
        },
      })
      .input(restoreViewInputSchema)
      .output(viewOutputSchemaSingle)
      .mutation(({ input }) => restoreAppView(input.appId, input.itemId, input.viewId, input.historyId, input.branchId)),
    create: authedProcedure
      .meta({
        openapi: {
          summary: '创建页面视图',
          tags: ['design'],
        },
      })
      .input(createViewInputSchema)
      .output(viewOutputSchemaSingle)
      .mutation(({ input }) => createAppView(input)),
    update: authedProcedure
      .meta({
        openapi: {
          summary: '更新页面视图',
          tags: ['design'],
        },
      })
      .input(updateViewInputSchema)
      .output(viewOutputSchemaSingle)
      .mutation(({ input }) => updateAppView(input)),
    delete: authedProcedure
      .meta({
        openapi: {
          summary: '删除页面视图',
          tags: ['design'],
        },
      })
      .input(deleteViewInputSchema)
      .output(deleteResultSchema)
      .mutation(({ input }) => deleteAppView(input.appId, input.itemId, input.viewId, input.branchId)),
  }),

  dataAuthorizations: router({
    list: authedProcedure
      .meta({
        openapi: {
          summary: '查询页面数据权限列表',
          tags: ['design'],
        },
      })
      .input(dataAuthorizationListInputSchema)
      .output(dataAuthorizationListOutputSchema)
      .query(({ input }) => findDataAuthorizations(input.appId, input.itemId, input.branchId)),
    get: authedProcedure
      .meta({
        openapi: {
          summary: '查询页面数据权限详情',
          tags: ['design'],
        },
      })
      .input(dataAuthorizationGetInputSchema)
      .output(dataAuthorizationOutputSchemaSingle)
      .query(({ input }) => findDataAuthorization(input.appId, input.itemId, input.authorizationId, input.branchId)),
    create: authedProcedure
      .meta({
        openapi: {
          summary: '创建页面数据权限',
          tags: ['design'],
        },
      })
      .input(createDataAuthorizationInputSchema)
      .output(dataAuthorizationOutputSchemaSingle)
      .mutation(({ input }) => createDataAuthorization(input)),
    update: authedProcedure
      .meta({
        openapi: {
          summary: '更新页面数据权限',
          tags: ['design'],
        },
      })
      .input(updateDataAuthorizationInputSchema)
      .output(dataAuthorizationOutputSchemaSingle)
      .mutation(({ input }) => updateDataAuthorization(input)),
    delete: authedProcedure
      .meta({
        openapi: {
          summary: '删除页面数据权限',
          tags: ['design'],
        },
      })
      .input(deleteDataAuthorizationInputSchema)
      .output(deleteResultSchema)
      .mutation(({ input }) => deleteDataAuthorization(input.appId, input.itemId, input.authorizationId, input.branchId)),
  }),

  deployment: router({
    create: authedProcedure
      .meta({
        openapi: {
          summary: '部署应用',
          tags: ['design'],
        },
      })
      .input(deploymentCreateInputSchema)
      .output(deploymentHistoryOutputSchemaSingle)
      .mutation(({ input }) => deployApp(input)),
    history: authedProcedure
      .meta({
        openapi: {
          summary: '查询部署历史',
          tags: ['design'],
        },
      })
      .input(deploymentHistoryInputSchema)
      .output(deploymentHistoryListOutputSchema)
      .query(({ input }) => findDeploymentHistory(input.appId, input.branchId)),
    restore: authedProcedure
      .meta({
        openapi: {
          summary: '恢复部署历史',
          tags: ['design'],
        },
      })
      .input(deploymentRestoreInputSchema)
      .output(deleteResultSchema)
      .mutation(({ input }) => restoreApp(input.appId, input.historyId, input.branchId)),
  }),
})
