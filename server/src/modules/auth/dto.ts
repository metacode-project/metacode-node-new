import { z } from 'zod'

export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export const userOutputSchema = z.object({
  id: z.string(),
  username: z.string(),
  accountId: z.string(),
  fullName: z.string(),
  avatar: z.string(),
  credential: z.object({
    accountId: z.string(),
    identifier: z.string(),
    type: z.enum(['PASSWORD']),
  }),
  spaces: z.array(z.object({
    id: z.string(),
    name: z.string(),
    identifier: z.string(),
  })),
  space: z.object({
    id: z.string(),
    name: z.string(),
    identifier: z.string(),
  }).nullable(),
  principals: z.array(z.any()),
  extendInfo: z.record(z.string(), z.any()),
  unReadNotificationCount: z.number(),
})

export const loginOutputSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
  user: userOutputSchema,
})
