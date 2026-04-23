import * as crypto from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

export interface JwtPayload {
  sub: string      // user.id (BigInt as string)
  username: string
  accountId: string // account.id (BigInt as string)
}

export const JWT_ALGORITHM = 'HS256'
export const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7  // 7 days
export const JWT_REFRESH_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30  // 30 days

export function getJwtSecret() {
  return process.env.JWT_SECRET || 'metacode-dev-secret-2026'
}

export const jwtSignOptions = {
  algorithm: JWT_ALGORITHM,
  expiresIn: JWT_EXPIRES_IN_SECONDS,
} as const

export const jwtRefreshSignOptions = {
  algorithm: JWT_ALGORITHM,
  expiresIn: JWT_REFRESH_EXPIRES_IN_SECONDS,
} as const

// metacode 使用 MD5(username + password) 校验密码
export function md5Credential(username: string, password: string): string {
  const md5 = crypto.createHash('md5')
  md5.update(username)
  md5.update(password)
  const buffer = md5.digest()
  return BigInt(`0x${buffer.toString('hex')}`).toString(16)
}

export async function hashPassword(password: string) {
  return hash(password, { algorithm: 2 })
}

export async function verifyPassword(password: string, passwordHash: string) {
  return verify(passwordHash, password, { algorithm: 2 })
}
