import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import playwright, { type Response } from 'playwright'
import { createHash } from 'crypto'
import { L1_PAGES, type PageConfig } from '../src/config/l1-pages'
import { scrapeNavigation } from '../src/lib/site-quality/nav-scraper'
import { fetchDestinationMetrics } from '../src/lib/site-quality/destination-metrics'
import { triagePage } from '../src/lib/site-quality/page-triage'
import { buildPass1UserMessage, buildPass2UserMessage, type PanelFacts } from '../src/lib/site-quality/panel-prompts'
import { scrapePanels } from '../src/lib/site-quality/panel-scraper'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_DEPTH = Number(process.env.PANEL_SCORE_MAX_DEPTH || 2)
const MAX_PANELS_PER_PAGE = Number(process.env.PANEL_SCORE_MAX_PANELS_PER_PAGE || 20)
const MAX_TOTAL_PANELS = Number(process.env.PANEL_SCORE_MAX_TOTAL_PANELS || 300)

type PanelIssueType =
  | 'item_not_found'
  | 'price_mismatch'
  | 'wrong_destination'
  | 'weak_correlation'
  | 'empty_destination'
  | 'dead_link'
  | 'redirect'
  | 'bot_blocked'
  | 'none'

interface OutboundText {
  prices: string[]
  headings: string[]
  productCount: number | null
  isOutOfStock: boolean
  hasEmptyResults: boolean
}

interface ScoredPanelResult {
  panelId: string
  panelName: string
  categoryL1: string
  sourcePageUrl: string
  outboundUrl: string
  panelImageUrl: string
  aorOwner: string | null
  pageDepth: number
  parentPageLabel?: string | null
  adWeek?: number
  adYear?: number
  slot?: string
  isStale?: boolean
  categoryFolder?: string
  panelType?: 'PRODUCT' | 'BRAND' | 'CATEGORY'
  featuredProduct?: string | null
  brandName?: string | null
  priceShown?: string | null
  offerLanguage?: string | null
  ctaText?: string | null
  destinationRelevanceKeywords?: string[] | null
  hasEmptyResults?: boolean
  isBotBlocked?: boolean
  redirectCount?: number
  productCountOnDestination?: number | null
  isOutOfStock?: boolean
  panelFingerprint: string
  score: number | null
  issues: Array<{ type: PanelIssueType; detail: string }>
  aiReasoning: string
  outboundPageTitle: string
}

interface PreviousPanelResult {
  score: number | null
  issues: Array<{ type: PanelIssueType; detail: string }> | null
  ai_reasoning: string | null
  panel_type: 'PRODUCT' | 'BRAND' | 'CATEGORY' | null
  featured_product: string | null
  brand_name: string | null
  price_shown: string | null
  offer_language: string | null
  cta_text: string | null
  destination_relevance_keywords: string[] | null
}

function computePanelFingerprint(panelImageUrl: string, outboundUrl: string): string {
  const input = `${panelImageUrl}::${outboundUrl}`.toLowerCase().trim()
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

function normalizeMediaType(value: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (value === 'image/png' || value === 'image/gif' || value === 'image/webp') return value
  return 'image/jpeg'
}

function toTitleCase(value: string | undefined) {
  if (!value) return 'unassigned'
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function pageKey(url: string) {
  const nCode = url.match(/N-\d+/i)?.[0]?.toUpperCase()
  if (nCode) return nCode

  try {
    const parsed = new URL(url)
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/'
    return `${parsed.origin}${normalizedPath}${parsed.search}`
  } catch {
    return url.trim()
  }
}

function mergePageConfigs(basePages: PageConfig[], discoveredPages: PageConfig[]) {
  const merged = new Map<string, PageConfig>()

  for (const page of discoveredPages) {
    merged.set(pageKey(page.url), page)
  }

  for (const page of basePages) {
    merged.set(pageKey(page.url), page)
  }

  const labelMap = new Map<string, PageConfig>()
  for (const page of Array.from(merged.values())) labelMap.set(page.label, page)

  return Array.from(merged.values()).map((page) => {
    if (page.aorOwner) return page

    let parentLabel = page.parentLabel
    while (parentLabel) {
      const parent = labelMap.get(parentLabel)
      if (!parent) break
      if (parent.aorOwner) return { ...page, aorOwner: parent.aorOwner }
      parentLabel = parent.parentLabel
    }

    return page
  })
}

function defaultPanelFacts(): PanelFacts {
  return {
    panel_type: 'CATEGORY',
    featured_product: null,
    brand_name: null,
    price_shown: null,
    offer_language: null,
    cta_text: null,
  }
}

function parseScoringJson(raw: string) {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  } else if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1)
  }

  try {
    return JSON.parse(cleaned) as {
      score: number
      issues: Array<{ type: PanelIssueType; detail: string }>
      reasoning: string
      destination_relevance_keywords?: string[] | null
    }
  } catch {
    console.error('JSON parse failed. Raw response (first 500 chars):', raw.slice(0, 500))
    return null
  }
}

function buildBaseResult(panel: {
  panelId: string
  panelName: string
  categoryL1: string
  sourcePageUrl: string
  outboundUrl: string
  panelImageUrl: string
  aorOwner: string | null
  pageDepth: number
  parentPageLabel?: string | null
  adWeek?: number
  adYear?: number
  slot?: string
  isStale?: boolean
  categoryFolder?: string
}) {
  return {
    ...panel,
    panelFingerprint: computePanelFingerprint(panel.panelImageUrl, panel.outboundUrl),
  }
}

function buildPanelFailureResult(
  panel: Parameters<typeof buildBaseResult>[0],
  reasoning: string
): ScoredPanelResult {
  return {
    ...buildBaseResult(panel),
    panelType: undefined,
    featuredProduct: null,
    brandName: null,
    priceShown: null,
    offerLanguage: null,
    ctaText: null,
    destinationRelevanceKeywords: null,
    hasEmptyResults: false,
    isBotBlocked: false,
    redirectCount: 0,
    productCountOnDestination: null,
    isOutOfStock: false,
    score: null,
    issues: [],
    aiReasoning: reasoning,
    outboundPageTitle: '',
  }
}

function buildSuppressedResult(
  panel: Parameters<typeof buildBaseResult>[0],
  previousResult: PreviousPanelResult | null
): ScoredPanelResult {
  return {
    ...buildBaseResult(panel),
    panelType: previousResult?.panel_type ?? undefined,
    featuredProduct: previousResult?.featured_product ?? null,
    brandName: previousResult?.brand_name ?? null,
    priceShown: previousResult?.price_shown ?? null,
    offerLanguage: previousResult?.offer_language ?? null,
    ctaText: previousResult?.cta_text ?? null,
    destinationRelevanceKeywords: previousResult?.destination_relevance_keywords ?? null,
    hasEmptyResults: false,
    isBotBlocked: false,
    redirectCount: 0,
    productCountOnDestination: null,
    isOutOfStock: false,
    score: previousResult?.score ?? null,
    issues: previousResult?.issues ?? [{ type: 'none', detail: 'Scoring suppressed — carried forward from previous run' }],
    aiReasoning: previousResult?.ai_reasoning ?? 'Scoring suppressed by admin',
    outboundPageTitle: '',
  }
}

async function getAuthenticatedPage() {
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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

  console.log(`Navigating to login page: ${loginUrl}`)
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  console.log(`Page title: ${await page.title()}`)
  console.log(`Page URL: ${page.url()}`)
  await page.screenshot({ path: '/tmp/login-page.png', fullPage: false })

  try {
    const emailInput = page.locator('#email').first()
    await emailInput.waitFor({ state: 'visible', timeout: 20000 })
    await emailInput.focus()
    await page.waitForTimeout(200)
    await emailInput.type(process.env.NEXCOM_BOT_EMAIL!, { delay: 50 })

    console.log('Email typed')

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 })
    await passwordInput.focus()
    await page.waitForTimeout(200)
    await passwordInput.type(process.env.NEXCOM_BOT_PASSWORD!, { delay: 50 })

    console.log('Password typed')
    await page.screenshot({ path: '/tmp/login-filled.png', fullPage: false })

    await page.keyboard.press('Enter')
    console.log('Pressed Enter to submit')

    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      page.waitForTimeout(15000),
    ])

    await page.waitForTimeout(2000)

    const postLoginUrl = page.url()
    console.log(`Post-login URL: ${postLoginUrl}`)
    await page.screenshot({ path: '/tmp/post-login.png', fullPage: false })

    if (postLoginUrl.includes('sign-in') || postLoginUrl.includes('login')) {
      console.log('Still on login page — trying JS button click')
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], button, a'))
          .find((el) => {
            const text = (el.textContent || (el as HTMLInputElement).value || '').toUpperCase().trim()
            return text === 'SIGN IN' || text === 'LOGIN' || text === 'SUBMIT'
          }) as HTMLElement | null
        btn?.click()
      })
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
      await page.screenshot({ path: '/tmp/post-login-retry.png', fullPage: false })
    }
  } catch (err) {
    await page.screenshot({ path: '/tmp/login-error.png', fullPage: false }).catch(() => {})
    console.error('Login error:', err)
    throw err
  }

  const finalUrl = page.url()
  const isLoggedIn = (!finalUrl.includes('sign-in') && !finalUrl.includes('/login')) ||
    await page.evaluate(() => {
      return document.body.innerText.includes('Hi ') ||
        !!document.querySelector('[href*="sign-out"], [href*="logout"], [href*="signout"]')
    })

  console.log(`Final URL: ${finalUrl}`)
  console.log(`Is logged in: ${isLoggedIn}`)

  if (!isLoggedIn) {
    console.log('WARNING: Login may have failed — proceeding anyway')
  }

  return { browser, page }
}

async function scorePanelWithPage(
  page: Awaited<ReturnType<typeof getAuthenticatedPage>>['page'],
  panel: {
    panelId: string
    panelName: string
    categoryL1: string
    sourcePageUrl: string
    outboundUrl: string
    panelImageUrl: string
    aorOwner: string | null
    pageDepth: number
    parentPageLabel?: string | null
    adWeek?: number
    adYear?: number
    slot?: string
    isStale?: boolean
    categoryFolder?: string
  }
): Promise<ScoredPanelResult> {
  const baseResult = buildBaseResult(panel)

  if (!panel.panelImageUrl) {
    return {
      ...baseResult,
      panelType: 'CATEGORY',
      featuredProduct: null,
      brandName: null,
      priceShown: null,
      offerLanguage: null,
      ctaText: null,
      destinationRelevanceKeywords: null,
      hasEmptyResults: false,
      isBotBlocked: false,
      redirectCount: 0,
      productCountOnDestination: null,
      isOutOfStock: false,
      score: 45,
      issues: [{ type: 'wrong_destination', detail: 'Panel image URL is not configured for this scraped panel.' }],
      aiReasoning: 'Panel image URL is empty, so vision scoring could not compare the marketing creative to the destination page.',
      outboundPageTitle: '',
    }
  }

  const imgRes = await fetch(panel.panelImageUrl)
  const imgBuffer = await imgRes.arrayBuffer()
  const imgBase64 = Buffer.from(imgBuffer).toString('base64')
  const imgMediaType = normalizeMediaType(imgRes.headers.get('content-type') || 'image/jpeg')

  const panelParseResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: buildPass1UserMessage()
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: imgMediaType, data: imgBase64 }
        }
      ]
    }]
  })

  let panelFacts = defaultPanelFacts()
  try {
    const panelParseText = panelParseResponse.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
    panelFacts = JSON.parse(panelParseText) as PanelFacts
  } catch {
    panelFacts = defaultPanelFacts()
  }

  let httpStatus: number | null = null
  let redirectCount = 0
  const responseListener = (response: Response) => {
    const url = response.url()
    const status = response.status()
    if (url.startsWith('http') && (status >= 300 && status < 400)) {
      redirectCount += 1
    }
    if (url === panel.outboundUrl || response.request().resourceType() === 'document') {
      httpStatus = status
    }
  }

  page.on('response', responseListener)

  let navigationError: string | null = null
  try {
    await page.goto(panel.outboundUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)
  } catch (err) {
    navigationError = err instanceof Error ? err.message : String(err)
  } finally {
    page.off('response', responseListener)
  }

  if (navigationError) {
    return {
      ...baseResult,
      panelType: panelFacts.panel_type,
      featuredProduct: panelFacts.featured_product,
      brandName: panelFacts.brand_name,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      ctaText: panelFacts.cta_text,
      destinationRelevanceKeywords: null,
      hasEmptyResults: false,
      score: 0,
      issues: [{ type: 'dead_link', detail: `Navigation failed: ${navigationError}` }],
      aiReasoning: 'The destination URL could not be reached.',
      isBotBlocked: false,
      redirectCount,
      productCountOnDestination: null,
      isOutOfStock: false,
      outboundPageTitle: '',
    }
  }

  if (httpStatus === 403) {
    return {
      ...baseResult,
      panelType: panelFacts.panel_type,
      featuredProduct: panelFacts.featured_product,
      brandName: panelFacts.brand_name,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      ctaText: panelFacts.cta_text,
      destinationRelevanceKeywords: null,
      hasEmptyResults: false,
      score: null,
      issues: [{ type: 'bot_blocked', detail: 'Destination returned 403. Page may be access-restricted or blocking automated requests. Manual verification required.' }],
      aiReasoning: 'This URL requires manual review — automated access was blocked (403). This does not necessarily mean the link is broken.',
      isBotBlocked: true,
      redirectCount,
      productCountOnDestination: null,
      isOutOfStock: false,
      outboundPageTitle: await page.title().catch(() => ''),
    }
  }

  if (httpStatus !== null && (httpStatus === 404 || httpStatus === 410 || httpStatus >= 500)) {
    return {
      ...baseResult,
      panelType: panelFacts.panel_type,
      featuredProduct: panelFacts.featured_product,
      brandName: panelFacts.brand_name,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      ctaText: panelFacts.cta_text,
      destinationRelevanceKeywords: null,
      hasEmptyResults: false,
      score: 0,
      issues: [{ type: 'dead_link', detail: `Destination returned HTTP ${httpStatus}.` }],
      aiReasoning: `The destination page returned an error (HTTP ${httpStatus}).`,
      isBotBlocked: false,
      redirectCount,
      productCountOnDestination: null,
      isOutOfStock: false,
      outboundPageTitle: await page.title().catch(() => ''),
    }
  }

  const outboundPageTitle = await page.title()
  const outboundScreenshot = await page.screenshot({ type: 'jpeg', quality: 75, fullPage: false })
  const outboundBase64 = outboundScreenshot.toString('base64')

  const outboundText = await page.evaluate(() => {
    const priceEls = Array.from(document.querySelectorAll(
      '[class*="price"], [class*="Price"], .price, .sale-price, .product-price'
    ))
    const headingEls = Array.from(document.querySelectorAll(
      'h1, h2, [class*="product-name"], [class*="item-name"]'
    ))
    const productCards = Array.from(document.querySelectorAll(
      '[class*="product-card"], [class*="product-item"], [class*="product-tile"], [class*="productCard"], [class*="productItem"]'
    ))
    const productContainers = Array.from(document.querySelectorAll(
      '[class*="product-grid"], [class*="product-list"], [class*="search-results"], [class*="results-grid"], [class*="results-list"]'
    ))
    const bodyText = document.body.innerText.toLowerCase()
    const outOfStockSignals = ['out of stock', 'notify me when available', 'coming soon', 'temporarily unavailable', 'sold out']
    const emptyResultSignals = ['no results', 'no products found', '0 results', 'nothing found', 'no items']
    const isOutOfStock = outOfStockSignals.some((signal) => bodyText.includes(signal))
    const hasEmptyStateText = emptyResultSignals.some((signal) => bodyText.includes(signal))
    const hasEmptyContainer = productContainers.some((container) => container.querySelectorAll(
      '[class*="product-card"], [class*="product-item"], [class*="product-tile"], [class*="productCard"], [class*="productItem"]'
    ).length === 0)
    const hasEmptyResults = hasEmptyStateText || hasEmptyContainer || productCards.length === 0

    return {
      prices: priceEls.map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 20) as string[],
      headings: headingEls.map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 10) as string[],
      productCount: productCards.length,
      isOutOfStock,
      hasEmptyResults,
    }
  }) as OutboundText

  const scoringPrompt = buildPass2UserMessage({
    panelFacts,
    outboundPageTitle,
    httpStatus,
    redirectCount,
    outboundText,
  })

  const scoringResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: scoringPrompt },
        { type: 'image', source: { type: 'base64', media_type: imgMediaType, data: imgBase64 } },
        { type: 'text', text: 'Panel image above. Destination page screenshot below:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: outboundBase64 } },
      ],
    }],
  })

  const textBlock = scoringResponse.content.find((item) => item.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Claude did not return a text response')

  const parsed = parseScoringJson(textBlock.text)
  if (!parsed) {
    return {
      ...baseResult,
      panelType: panelFacts.panel_type,
      featuredProduct: panelFacts.featured_product,
      brandName: panelFacts.brand_name,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      ctaText: panelFacts.cta_text,
      destinationRelevanceKeywords: null,
      hasEmptyResults: outboundText.hasEmptyResults,
      isBotBlocked: false,
      redirectCount,
      productCountOnDestination: outboundText.productCount ?? null,
      isOutOfStock: outboundText.isOutOfStock ?? false,
      score: null,
      issues: [],
      aiReasoning: 'Scoring failed: unable to parse AI response.',
      outboundPageTitle,
    }
  }

  return {
    ...baseResult,
    panelType: panelFacts.panel_type,
    featuredProduct: panelFacts.featured_product,
    brandName: panelFacts.brand_name,
    priceShown: panelFacts.price_shown,
    offerLanguage: panelFacts.offer_language,
    ctaText: panelFacts.cta_text,
    destinationRelevanceKeywords: parsed.destination_relevance_keywords ?? null,
    hasEmptyResults: outboundText.hasEmptyResults,
    isBotBlocked: false,
    redirectCount,
    productCountOnDestination: outboundText.productCount ?? null,
    isOutOfStock: outboundText.isOutOfStock ?? false,
    score: parsed.score,
    issues: parsed.issues,
    aiReasoning: parsed.reasoning,
    outboundPageTitle,
  }
}

async function main() {
  let runId = process.env.PANEL_SCORE_RUN_ID

  if (!runId) {
    const { data: newRun, error: insertError } = await supabase
      .from('site_quality_panel_runs')
      .insert({
        status: 'pending',
        trigger: 'manual',
        trigger_type: 'manual',
      })
      .select('id')
      .single()

    if (insertError || !newRun) {
      console.error('Failed to create run record:', insertError)
      console.error('SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'MISSING')
      console.error('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING')
      throw new Error(`Cannot create run record: ${insertError?.message}`)
    }

    runId = newRun.id
    console.log(`Created new run record: ${runId}`)
  } else {
    console.log(`Using provided run ID: ${runId}`)
  }

  const adWeekEnv = process.env.PANEL_SCORE_AD_WEEK
  const adWeek = adWeekEnv ? parseInt(adWeekEnv, 10) : undefined

  console.log(`Starting panel score run ${runId}${adWeek ? ` for ad week ${adWeek}` : ''}`)

  const { error: runningError } = await supabase.from('site_quality_panel_runs').update({
    status: 'running',
    started_at: new Date().toISOString(),
  }).eq('id', runId)
  if (runningError) console.error('Failed to set running status:', runningError)
  else console.log('Run status set to running')

  const { browser, page } = await getAuthenticatedPage()

  try {
    const results: ScoredPanelResult[] = []
    const { data: suppressions, error: suppressionsError } = await supabase
      .from('panel_reviews')
      .select('panel_fingerprint, suppress_scoring_until')
      .eq('status', 'suppressed')
      .gt('suppress_scoring_until', new Date().toISOString())

    if (suppressionsError) {
      throw new Error(`Failed to load suppressions: ${suppressionsError.message}`)
    }

    const suppressedFingerprints = new Set((suppressions || []).map((suppression) => suppression.panel_fingerprint))
    console.log(`${suppressedFingerprints.size} panels suppressed — will carry forward previous scores`)

    let pagesToScore = [...L1_PAGES]
    try {
      const discoveredPages = await scrapeNavigation(page)
      if (discoveredPages.length > 0) {
        console.log(`Nav scraper found ${discoveredPages.length} additional pages`)
        pagesToScore = mergePageConfigs(L1_PAGES, discoveredPages)
      }
    } catch (error) {
      console.error('Nav scraping failed, falling back to hardcoded L1 pages:', error)
    }

    const pages = pagesToScore
      .filter((pageConfig) => pageConfig.depth <= MAX_DEPTH)
      .sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth
        return a.label.localeCompare(b.label)
      })
    const depthCounts = pages.reduce((counts, pageConfig) => {
      counts[pageConfig.depth] = (counts[pageConfig.depth] ?? 0) + 1
      return counts
    }, {} as Record<number, number>)
    console.log(`Scoring ${pages.length} pages (${depthCounts[1] ?? 0} L1, ${depthCounts[2] ?? 0} L2, ${depthCounts[3] ?? 0} L3)`)

    let totalPanelsProcessed = 0

    pageLoop:
    for (const pageConfig of pages) {
      if (totalPanelsProcessed >= MAX_TOTAL_PANELS) {
        console.warn(`Reached total panel limit of ${MAX_TOTAL_PANELS}; skipping remaining pages and triage`)
        break
      }

      console.log(`Scraping ${pageConfig.label}...`)
      const scrapeResult = await scrapePanels(page, pageConfig.url, pageConfig.label)
      const panels = adWeek
        ? scrapeResult.panels.filter((p) => p.adWeek === adWeek)
        : scrapeResult.panels
      const limitedPanels = panels.slice(0, MAX_PANELS_PER_PAGE)
      const isHomepage = pageConfig.depth === 0 || pageConfig.url === 'https://www.mynavyexchange.com'

      if (limitedPanels.length > 0 || isHomepage) {
        try {
          const fullPageScreenshot = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true })
          const triage = await triagePage(anthropic, fullPageScreenshot.toString('base64'), pageConfig.url, limitedPanels.length)
          console.log(`  Page triage: AI found ${triage.total_zones_identified} zones, scraper found ${limitedPanels.length} panels`)
          for (const gap of triage.scraper_coverage_gaps) console.warn(`  Coverage gap: ${gap}`)
          for (const issue of triage.page_level_issues) console.warn(`  Page issue: ${issue}`)
          if (triage.total_zones_identified > 0 && limitedPanels.length === 0) {
            console.warn(`WARNING: ${pageConfig.label} has ${triage.total_zones_identified} marketing zones but scraper found 0 panels`)
          }

          const { error: triageInsertError } = await supabase.from('site_quality_page_triage').insert({
            run_id: runId,
            page_url: triage.page_url,
            page_label: pageConfig.label,
            screenshot_taken: true,
            total_zones_ai: triage.total_zones_identified,
            total_panels_scraper: limitedPanels.length,
            zones: triage.zones,
            page_level_issues: triage.page_level_issues,
            scraper_coverage_gaps: triage.scraper_coverage_gaps,
          })

          if (triageInsertError) {
            throw new Error(`Failed to insert page triage for ${pageConfig.label}: ${triageInsertError.message}`)
          }
        } catch (error) {
          console.error(`Page triage failed for ${pageConfig.url}:`, error)
        }
      } else {
        console.log(`  Skipping page triage for ${pageConfig.label} — no scraped panels`)
      }

      if (panels.length > MAX_PANELS_PER_PAGE) {
        console.warn(`  ${pageConfig.label} has ${panels.length} panels; limiting scoring to ${MAX_PANELS_PER_PAGE}`)
      }

      for (let i = 0; i < limitedPanels.length; i += 1) {
        if (totalPanelsProcessed >= MAX_TOTAL_PANELS) {
          console.warn(`Reached total panel limit of ${MAX_TOTAL_PANELS}; ending run early`)
          break pageLoop
        }

        const panel = limitedPanels[i]
        const panelInput = {
          panelId: `${pageConfig.label}-${panel.slot}-${i + 1}`,
          panelName: panel.altText || `${pageConfig.label} ${panel.slot}`,
          categoryL1: pageConfig.label,
          sourcePageUrl: pageConfig.url,
          outboundUrl: panel.outboundHref || pageConfig.url,
          panelImageUrl: panel.imageUrl,
          aorOwner: pageConfig.aorOwner ? toTitleCase(pageConfig.aorOwner) : null,
          pageDepth: pageConfig.depth,
          parentPageLabel: pageConfig.parentLabel ?? null,
          adWeek: panel.adWeek,
          adYear: panel.adYear,
          slot: panel.slot,
          isStale: panel.isStale,
          categoryFolder: panel.categoryFolder,
        }
        totalPanelsProcessed += 1
        const fingerprint = computePanelFingerprint(panelInput.panelImageUrl, panelInput.outboundUrl)

        if (suppressedFingerprints.has(fingerprint)) {
          console.log(`  Skipping ${panelInput.panelName} — scoring suppressed`)

          const { data: previousResult, error: previousResultError } = await supabase
            .from('site_quality_panel_results')
            .select('score, issues, ai_reasoning, panel_type, featured_product, brand_name, price_shown, offer_language, cta_text, destination_relevance_keywords')
            .eq('panel_fingerprint', fingerprint)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle<PreviousPanelResult>()

          if (previousResultError) {
            throw new Error(`Failed to load previous result for suppressed panel ${panelInput.panelName}: ${previousResultError.message}`)
          }

          results.push(buildSuppressedResult(panelInput, previousResult))
          continue
        }

        console.log(`  Scoring panel ${i + 1}/${limitedPanels.length}: ${panelInput.panelName}`)

        try {
          const scored = await scorePanelWithPage(page, panelInput)
          results.push(scored)
        } catch (error) {
          console.error(`Scoring failed for panel ${panelInput.panelName}:`, error)
          const message = error instanceof Error ? error.message : String(error)
          results.push(buildPanelFailureResult(panelInput, `Scoring failed: ${message}`))
        }
      }
    }

    if (results.length > 0) {
      const inserts = results.map((item) => ({
        run_id: runId,
        panel_id: item.panelId,
        panel_name: item.panelName,
        category_l1: item.categoryL1,
        source_page_url: item.sourcePageUrl,
        page_depth: item.pageDepth,
        parent_page_label: item.parentPageLabel ?? null,
        outbound_url: item.outboundUrl,
        aor_owner: item.aorOwner,
        ad_week: item.adWeek ?? null,
        ad_year: item.adYear ?? null,
        slot: item.slot ?? null,
        is_stale: item.isStale ?? null,
        category_folder: item.categoryFolder ?? null,
        panel_type: item.panelType ?? null,
        featured_product: item.featuredProduct ?? null,
        brand_name: item.brandName ?? null,
        price_shown: item.priceShown ?? null,
        offer_language: item.offerLanguage ?? null,
        cta_text: item.ctaText ?? null,
        destination_relevance_keywords: item.destinationRelevanceKeywords ?? null,
        has_empty_results: item.hasEmptyResults ?? false,
        is_bot_blocked: item.isBotBlocked ?? false,
        redirect_count: item.redirectCount ?? 0,
        product_count_on_destination: item.productCountOnDestination ?? null,
        is_out_of_stock: item.isOutOfStock ?? false,
        panel_fingerprint: item.panelFingerprint,
        score: item.score ?? null,
        issues: item.issues,
        ai_reasoning: item.aiReasoning,
        outbound_page_title: item.outboundPageTitle,
        panel_image_url: item.panelImageUrl,
      }))

      const { error: resultError } = await supabase.from('site_quality_panel_results').insert(inserts)
      if (resultError) {
        console.error('Failed to insert panel result:', resultError)
        throw resultError
      }

      const uniqueDestinationUrls = Array.from(new Set(results.map((item) => item.outboundUrl).filter(Boolean)))
      try {
        const destinationMetrics = await fetchDestinationMetrics(uniqueDestinationUrls)

        for (const [url, metrics] of Array.from(destinationMetrics.entries())) {
          const { error: metricsUpdateError } = await supabase
            .from('site_quality_panel_results')
            .update({
              destination_sessions_7d: metrics.sessions_7d,
              destination_bounce_rate_7d: metrics.bounce_rate_7d,
              destination_add_to_cart_rate_7d: metrics.add_to_cart_rate_7d,
              destination_revenue_7d: metrics.revenue_7d,
              destination_transactions_7d: metrics.transactions_7d,
            })
            .eq('run_id', runId)
            .eq('outbound_url', url)

          if (metricsUpdateError) {
            throw new Error(`Failed to update destination metrics for ${url}: ${metricsUpdateError.message}`)
          }
        }

        const atRiskRevenue = results
          .filter((result) => result.score !== null && result.score < 70)
          .reduce((sum, result) => sum + (destinationMetrics.get(result.outboundUrl)?.revenue_7d ?? 0), 0)

        const { error: atRiskRevenueError } = await supabase
          .from('site_quality_panel_runs')
          .update({ at_risk_revenue_7d: atRiskRevenue })
          .eq('id', runId)

        if (atRiskRevenueError) {
          throw new Error(`Failed to update at-risk revenue: ${atRiskRevenueError.message}`)
        }
      } catch (ga4Error) {
        console.warn('GA4 destination metrics enrichment failed. Continuing without revenue data.', ga4Error)
      }
    }

    const issueCount = results.reduce((sum, item) => sum + item.issues.filter((i) => i.type !== 'none').length, 0)
    const scoredResults = results.filter((item): item is ScoredPanelResult & { score: number } => item.score !== null)
    const passingCount = scoredResults.filter((item) => item.score >= 80).length
    const avgScore = scoredResults.length > 0 ? scoredResults.reduce((sum, item) => sum + item.score, 0) / scoredResults.length : null

    const { error: completeError } = await supabase.from('site_quality_panel_runs').update({
      status: 'complete',
      panels_scored: results.length,
      avg_score: avgScore,
      issues_found: issueCount,
      panels_flagged: passingCount,
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
    if (completeError) console.error('Failed to set complete status:', completeError)
    else console.log(`Run complete. panels_scored=${results.length} avg_score=${avgScore}`)

    console.log(`Done. ${results.length} panels scored, ${issueCount} issues, avg score ${avgScore?.toFixed(1)}`)
  } catch (error) {
    console.error('Scoring failed:', error)
    const { error: failedError } = await supabase.from('site_quality_panel_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
    if (failedError) console.error('Failed to set failed status:', failedError)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
