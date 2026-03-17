import playwright from 'playwright-core'

async function getLaunchOptions() {
  // On GitHub Actions (or any CI), use the system Playwright chromium
  if (process.env.CI) {
    return {
      executablePath: undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }
  }

  // On Vercel (serverless), use @sparticuz/chromium
  const chromium = (await import('@sparticuz/chromium')).default
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
  }
}

export async function getAuthenticatedPage() {
  const { executablePath, args } = await getLaunchOptions()

  const browser = await playwright.chromium.launch({
    executablePath,
    args,
    headless: true,
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  })
  await context.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  })

  const page = await context.newPage()
  const loginUrl = `${process.env.NEXCOM_SITE_URL}/account/sign-in`
  await page.goto(loginUrl, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"], input[name="email"], #email', process.env.NEXCOM_BOT_EMAIL!)
  await page.fill('input[type="password"], input[name="password"], #password', process.env.NEXCOM_BOT_PASSWORD!)
  await page.click('button[type="submit"]')
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 })

  const isLoggedIn = await page.evaluate(() => {
    return (
      document.body.innerText.includes('Hi ') ||
      !!document.querySelector('[href*="sign-out"], [href*="logout"]')
    )
  })

  if (!isLoggedIn) {
    await browser.close()
    throw new Error('NEXCOM authentication failed - check credentials or login selector')
  }

  return { browser, context, page }
}
