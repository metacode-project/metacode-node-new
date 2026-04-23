import z from 'zod'
import { appTemplateRouter } from '../modules/app-template'
import { authRouter } from '../modules/auth'
import { designRouter } from '../modules/design'
import { fileRouter } from '../modules/file'
import { runtimeRouter } from '../modules/runtime'
import { publicProcedure, router } from './trpc'

const routes = {
  auth: authRouter,
  design: designRouter,
  runtime: runtimeRouter,
  appTemplate: appTemplateRouter,
  file: fileRouter,
  health: publicProcedure
    .meta({
      openapi: {
        summary: 'Health check',
        tags: ['system'],
      },
    })
    .output(z.object({ message: z.literal('ok') }))
    .query(() => ({ message: 'ok' })),
}

function applyOpenApiDefaultsByProcedure(appRouterRecord: any) {
  const procedures = appRouterRecord?._def?.procedures ?? {}
  for (const [path, procedureUnknown] of Object.entries(procedures)) {
    const procedure = procedureUnknown as any
    const openapiMeta = procedure._def?.meta?.openapi
    if (!openapiMeta) {
      continue
    }
    if (!openapiMeta.method) {
      openapiMeta.method = procedure._def?.type === 'query' ? 'GET' : 'POST'
    }
    if (!openapiMeta.path) {
      openapiMeta.path = `/${path}`
    }
  }
}

export const appRouter = router(routes)
applyOpenApiDefaultsByProcedure(appRouter)

export type AppRouter = typeof appRouter
