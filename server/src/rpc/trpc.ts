import type { OpenApiMeta } from 'trpc-to-openapi'
import type { Context } from './context'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { getPrismaErrorCode, mapPrismaError } from '../lib/errors'

type OpenApiMetaWithoutMethodAndPath = Omit<OpenApiMeta, 'openapi'> & {
  openapi?: Omit<NonNullable<OpenApiMeta['openapi']>, 'method' | 'path'>
}

const t = initTRPC.context<Context>().meta<OpenApiMetaWithoutMethodAndPath>().create({
  transformer: superjson,
  errorFormatter({ error, shape }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        prismaCode: getPrismaErrorCode(error),
      },
    }
  },
})

export const router = t.router

/**
 * 兼容openapi，构造input对象
 */
const openApiQueryInputCompat = t.middleware(async ({ ctx, input, type, next }) => {
  if (type === 'query' && input === undefined) {
    const query = ctx.req.query as Record<string, unknown> | undefined
    if (query && Object.keys(query).length > 0) {
      return next({ input: query })
    }
  }
  return next()
})

const prismaErrorMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next()
  }
  catch (error) {
    const mappedError = mapPrismaError(error)
    if (mappedError) {
      throw mappedError
    }
    throw error
  }
})

export const publicProcedure = t.procedure
  .use(openApiQueryInputCompat)
  .use(prismaErrorMiddleware)

const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录或登录已失效' })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})

export const authedProcedure = publicProcedure.use(authMiddleware)
