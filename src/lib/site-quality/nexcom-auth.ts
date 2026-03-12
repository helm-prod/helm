import chromium from '@sparticuz/chromium'
import playwright from 'playwright-core'

export async function getAuthenticatedPage() {
  const browser = await playwright.chromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; HelmBot/1.0; +https://helm.nexweb.dev)',
  })

  const page = await context.newPage()
  const loginUrl = `${process.env.NEXCOM_SITE_URL}/account/sign-in`
  await page.goto(loginUrl, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"], input[name="email"], #email', process.env.NEXCOM_BOT_EMAIL!)
  await page.fill('input[type="password"], input[name="password"], #password', process.env.NEXCOM_BOT_PASSWORD!)
  await page.click('input[name="/atg/userprofiling/ProfileFormHandler.login"], button[type="submit"]')
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 })

  const isLoggedIn = await page.evaluate(() => {
    return document.body.innerText.includes('Hi ') ||
      !!document.querySelector('[href*="sign-out"], [href*="logout"]')
  })

  if (!isLoggedIn) {
    await browser.close()
    throw new Error('NEXCOM authentication failed - check credentials or login selector')
  }

  return { browser, context, page }
}
