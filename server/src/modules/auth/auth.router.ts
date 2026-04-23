import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { jwtSignOptions, jwtRefreshSignOptions } from '../../lib/auth'
import { authedProcedure, publicProcedure, router } from '../../rpc/trpc'
import { getUserByToken } from './auth.service'
import { loginInputSchema, loginOutputSchema, userOutputSchema } from './dto'

const outputValidator = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema as z.ZodType<z.output<TSchema>>

export const authRouter = router({
  login: publicProcedure
    .meta({
      openapi: {
        summary: '用户登录',
        tags: ['auth'],
      },
    })
    .input(loginInputSchema)
    .output(outputValidator(loginOutputSchema))
    .mutation(async ({ ctx, input }) => {
      const { user } = await import('./auth.service').then(m => m.loginByPassword(input.username, input.password))

      const jwt = (ctx.req.server as typeof ctx.req.server & {
        jwt: { sign: (payload: object, options: object) => string }
      }).jwt

      const signedToken = jwt.sign(
        { sub: user.id, username: user.username, accountId: user.accountId },
        jwtSignOptions,
      )

      const signedRefreshToken = jwt.sign(
        { sub: user.id, username: user.username, accountId: user.accountId },
        jwtRefreshSignOptions,
      )

      return { token: signedToken, refreshToken: signedRefreshToken, user }
    }),

  refresh: publicProcedure
    .meta({
      openapi: {
        summary: '刷新 Token',
        tags: ['auth'],
      },
    })
    .output(z.object({ token: z.string(), user: userOutputSchema }))
    .mutation(async ({ ctx }) => {
      const cookieHeader = ctx.req.headers.cookie || ''
      const refreshTokenMatch = cookieHeader.match(/refreshToken=([^;]+)/)
      const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : undefined

      if (!refreshToken) {
        throw new Error('Refresh token not found')
      }

      const jwt = (ctx.req.server as typeof ctx.req.server & {
        jwt: {
          sign: (payload: object, options: object) => string
          verify: <T>(token: string) => T
        }
      }).jwt

      jwt.verify<{ sub: string; username: string; accountId: string }>(refreshToken)
      const user = await getUserByToken(refreshToken)

      const newToken = jwt.sign(
        { sub: user.id, username: user.username, accountId: user.accountId },
        jwtSignOptions,
      )

      return { token: newToken, user }
    }),

  me: authedProcedure
    .meta({
      openapi: {
        summary: '当前用户',
        tags: ['auth'],
      },
    })
    .output(outputValidator(userOutputSchema))
    .query(async ({ ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录' })
      }
      // ctx.user only has basic info from JWT, fetch full profile from db
      const { getUserByToken } = await import('./auth.service')
      const token = ctx.req.headers.authorization?.split(' ')[1] || ''
      return getUserByToken(token)
    }),
})
