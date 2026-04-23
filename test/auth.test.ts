import { expect, test } from '@playwright/test'
import { createE2ELoginAccount } from './helpers/auth'

test('redirect to login when not authenticated', async ({ page }) => {
  await page.goto('/file-demo')

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
})

test('login with account password', async ({ page }) => {
  const loginAccount = await createE2ELoginAccount('pw-auth')

  try {
    await page.goto('/login')
    await page.getByPlaceholder('请输入账号').fill(loginAccount.account)
    await page.getByPlaceholder('请输入密码').fill(loginAccount.password)
    await page.getByRole('button', { name: '登录' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByText(`当前用户: ${loginAccount.account}`)).toBeVisible()
  }
  finally {
    await loginAccount.cleanup()
  }
})
