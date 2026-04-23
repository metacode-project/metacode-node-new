import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import type { JwtPayload } from '../lib/auth'
import { prisma } from '../lib/prisma'

export interface AuthUser {
  id: string
  username: string
  accountId: string
}

function parseBearerToken(authHeader: string | string[] | undefined): string | null {
  if (!authHeader || Array.isArray(authHeader)) {
    return null
  }
  const [type, token] = authHeader.split(' ')
  if (type !== 'Bearer' || !token) {
    return null
  }
  return token
}

async function resolveCurrentUser(payload: JwtPayload): Promise<AuthUser | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      select: { id: true, username: true },
    })
    if (!user) {
      return null
    }
    return {
      id: user.id.toString(),
      username: user.username ?? '',
      accountId: payload.accountId || '',
    }
  }
  catch {
    return null
  }
}

export async function createContext(opts: CreateFastifyContextOptions) {
  const token = parseBearerToken(opts.req.headers.authorization)
  const payload = token ? verifyToken(opts, token) : null
  const user = payload ? await resolveCurrentUser(payload) : null

  return {
    req: opts.req,
    res: opts.res,
    user,
  }
}

function verifyToken(opts: CreateFastifyContextOptions, token: string): JwtPayload | null {
  try {
    const jwt = (opts.req.server as typeof opts.req.server & {
      jwt: {
        verify: <T>(jwtToken: string) => T
      }
    }).jwt

    const payload = jwt.verify<JwtPayload>(token)
    if (
      typeof payload.sub !== 'string'
      || typeof payload.username !== 'string'
    ) {
      return null
    }
    return payload
  }
  catch {
    return null
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
