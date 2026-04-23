import { createHash, randomUUID } from 'node:crypto'
import { config as loadEnv } from 'dotenv'
import mariadb from 'mariadb'

loadEnv({ path: 'server/.env', quiet: true })

function getDatabaseConnectionOptions() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('缺少 DATABASE_URL，无法创建 Playwright 登录测试账号')
  }

  const normalizedUrl = databaseUrl
    .replace(/^mysql:\/\//, '')
    .replace(/^mariadb:\/\//, '')

  const slashIndex = normalizedUrl.indexOf('/')
  if (slashIndex < 0) {
    throw new Error(`DATABASE_URL 格式不正确: ${databaseUrl}`)
  }

  const authAndHost = normalizedUrl.slice(0, slashIndex)
  const databasePart = normalizedUrl.slice(slashIndex + 1)
  const atIndex = authAndHost.lastIndexOf('@')
  if (atIndex < 0) {
    throw new Error(`DATABASE_URL 缺少账号信息: ${databaseUrl}`)
  }

  const credentials = authAndHost.slice(0, atIndex)
  const hostPart = authAndHost.slice(atIndex + 1)
  const colonIndex = credentials.indexOf(':')
  if (colonIndex < 0) {
    throw new Error(`DATABASE_URL 缺少密码信息: ${databaseUrl}`)
  }

  const user = credentials.slice(0, colonIndex)
  const password = credentials.slice(colonIndex + 1)
  const [host, portRaw] = hostPart.split(':')
  const [database] = databasePart.split('?')

  return {
    host,
    port: Number(portRaw || 3306),
    user,
    password,
    database,
  }
}

function md5Credential(username: string, password: string) {
  const md5 = createHash('md5')
  md5.update(username)
  md5.update(password)
  return BigInt(`0x${md5.digest('hex')}`).toString(16)
}

export interface E2ELoginAccount {
  account: string
  password: string
  cleanup: () => Promise<void>
}

export async function createE2ELoginAccount(prefix: string): Promise<E2ELoginAccount> {
  const suffix = randomUUID().slice(0, 8)
  const account = `${prefix}-${suffix}`
  const password = `pw-${suffix}`
  const credential = md5Credential(account, password)

  const conn = await mariadb.createConnection(getDatabaseConnectionOptions())

  const accountInsert = await conn.query(
    'INSERT INTO `account` (`state`, `username`, `full_name`) VALUES (1, ?, ?)',
    [account, `Playwright-${suffix}`],
  )
  const accountId = BigInt(accountInsert.insertId)

  const userInsert = await conn.query(
    'INSERT INTO `user` (`state`, `username`, `account_id`) VALUES (1, ?, ?)',
    [account, accountId.toString()],
  )
  const userId = BigInt(userInsert.insertId)

  const credentialInsert = await conn.query(
    'INSERT INTO `auth_credential` (`identifier`, `credential`, `identity_type`, `account_id`) VALUES (?, ?, 1, ?)',
    [account, credential, accountId.toString()],
  )
  const credentialId = BigInt(credentialInsert.insertId)

  await conn.end()

  return {
    account,
    password,
    cleanup: async () => {
      const cleanupConn = await mariadb.createConnection(getDatabaseConnectionOptions())
      await cleanupConn.query('DELETE FROM `auth_credential` WHERE `id` = ?', [credentialId.toString()])
      await cleanupConn.query('DELETE FROM `user` WHERE `id` = ?', [userId.toString()])
      await cleanupConn.query('DELETE FROM `account` WHERE `id` = ?', [accountId.toString()])
      await cleanupConn.end()
    },
  }
}
