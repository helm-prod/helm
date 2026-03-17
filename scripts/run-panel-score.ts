import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import playwright, { type Response } from 'playwright'
import { L1_PAGES } from '../src/config/l1-pages'
import { scrapePanels } from '../src/lib/site-quality/panel-scraper'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type PanelIssueType = 'price_mismatch' | 'item_not_found' | 'dead_link' | 'redirect' | 'context_mismatch' | 'bot_blocked' | 'none'

interface PanelFacts {
  panel_type: 'PRODUCT' | 'BRAND' | 'CATEGORY'
  featured_product: string | null
  brand_name: string | null
  price_shown: string | null
  offer_language: string | null
  cta_text: string | null
}

interface OutboundText {
  prices: string[]
  headings: string[]
  productCount: number
  isOutOfStock: boolean
}

interface ScoredPanelResult {
  panelId: string
  panelName: string
  categoryL1: string
  sourcePageUrl: string
  outboundUrl: string
  panelImageUrl: string
  aorOwner: string
  adWeek?: number
  adYear?: number
  slot?: string
  isStale?: boolean
  categoryFolder?: string
  panelType?: 'PRODUCT' | 'BRAND' | 'CATEGORY'
  featuredProduct?: string | null
  priceShown?: string | null
  offerLanguage?: string | null
  isBotBlocked?: boolean
  redirectCount?: number
  productCountOnDestination?: number | null
  isOutOfStock?: boolean
  score: number | null
  issues: Array<{ type: PanelIssueType; detail: string }>
  aiReasoning: string
  outboundPageTitle: string
}

function normalizeMediaType(value: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (value === 'image/png' || value === 'image/gif' || value === 'image/webp') return value
  return 'image/jpeg'
}

function toTitleCase(value: string | undefined) {
  if (!value) return 'unassigned'
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
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
  return JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
    score: number
    issues: Array<{ type: PanelIssueType; detail: string }>
    reasoning: string
  }
}

function buildBaseResult(panel: {
  panelId: string
  panelName: string
  categoryL1: string
  sourcePageUrl: string
  outboundUrl: string
  panelImageUrl: string
  aorOwner: string
  adWeek?: number
  adYear?: number
  slot?: string
  isStale?: boolean
  categoryFolder?: string
}) {
  return {
    ...panel,
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
    aorOwner: string
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
      priceShown: null,
      offerLanguage: null,
      isBotBlocked: false,
      redirectCount: 0,
      productCountOnDestination: null,
      isOutOfStock: false,
      score: 45,
      issues: [{ type: 'context_mismatch', detail: 'Panel image URL is not configured for this scraped panel.' }],
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
          text: `You are analyzing a marketing panel image from a Navy Exchange e-commerce site.

Extract the following facts from this panel image. Be specific and literal — only report what you can actually see.

Respond in this exact JSON format only, no markdown:
{
  "panel_type": "<PRODUCT|BRAND|CATEGORY>",
  "featured_product": "<specific product name visible in the panel, or null if none>",
  "brand_name": "<brand name or logo visible, or null if none>",
  "price_shown": "<exact price text visible in the panel image, or null if no price shown>",
  "offer_language": "<any promotional or sale copy visible, e.g. 'Save 30%', 'Free Gift', 'New Arrivals', or null if none>",
  "cta_text": "<call to action text if visible, e.g. 'Shop Now', 'Learn More', or null>"
}

Panel type definitions:
- PRODUCT: Panel features a specific product. Customer expects to find and buy that exact product.
- BRAND: Panel tells a brand story or shows a brand logo. Customer expects a brand landing page or brand products.
- CATEGORY: Panel promotes a category or department. Customer expects a relevant category page.

Only classify as PRODUCT if a specific named product is clearly visible. A brand logo with products shown is still BRAND.`
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
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
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
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
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
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
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
    const bodyText = document.body.innerText.toLowerCase()
    const outOfStockSignals = ['out of stock', 'notify me when available', 'coming soon', 'temporarily unavailable', 'sold out']
    const isOutOfStock = outOfStockSignals.some((signal) => bodyText.includes(signal))

    return {
      prices: priceEls.map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 20) as string[],
      headings: headingEls.map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 10) as string[],
      productCount: productCards.length,
      isOutOfStock,
    }
  }) as OutboundText

  const scoringPrompt = `You are a quality checker for a Navy Exchange e-commerce site.

PANEL FACTS (extracted from the panel image):
- Panel type: ${panelFacts.panel_type}
- Featured product: ${panelFacts.featured_product || 'none identified'}
- Brand shown: ${panelFacts.brand_name || 'none identified'}
- Price shown on panel: ${panelFacts.price_shown || 'none'}
- Promotional copy: ${panelFacts.offer_language || 'none'}
- CTA text: ${panelFacts.cta_text || 'none'}

DESTINATION PAGE CONTEXT:
- Title: ${outboundPageTitle}
- HTTP status: ${httpStatus ?? 'unknown'}
- Redirect hops: ${redirectCount}
- Prices found on destination: ${outboundText.prices.join(', ') || 'none found'}
- Headings/products found on destination: ${outboundText.headings.join(', ') || 'none found'}
- Products visible above fold: ${outboundText.productCount ?? 'unknown'}
- Out of stock signals detected: ${outboundText.isOutOfStock ? 'yes' : 'no'}

Your job: using the panel facts above as ground truth, assess how well the destination page delivers on the promise made by the panel.

SCORING RULES BY PANEL TYPE:

PRODUCT panel (featured_product is not null):
- 90-100: The specific featured product is clearly visible and purchasable.
- 70-89: The featured product is present but not prominently featured.
- 50-69: Correct category but the specific product is not findable.
- 30-49: Loosely related destination but the featured product is absent.
- 0-29: Destination is wrong, broken, or the product is completely absent.
CRITICAL: If featured_product is not null, the destination MUST show that product. If it does not, flag item_not_found as the primary issue.

BRAND panel:
- 90-100: Destination is a landing page for that brand showing their products.
- 70-89: Destination shows brand products but is not a dedicated brand page.
- 50-69: Related category but the brand is not prominent.
- 30-49: Off-topic or different brand featured.
- 0-29: Broken, wrong, or completely unrelated.
NOTE: A brand panel correctly linking to that brand's page is intended behavior. Do NOT flag as context_mismatch.

CATEGORY panel:
- 90-100: Destination is the correct category page.
- 70-89: Closely related category.
- 50-69: Loosely related.
- 30-49: Different category entirely.
- 0-29: Broken or completely unrelated.

PRICE CHECK (only applies when price_shown is not null):
If price_shown is not null, check whether that price appears on the destination. If the destination shows significantly higher prices and the panel price is nowhere to be found, flag price_mismatch.

OFFER CHECK (only applies when offer_language is not null):
If offer_language mentions a specific discount or promotion, check whether the destination reflects that promotion. If there is no evidence of the promotion on the destination, flag context_mismatch.

ISSUE TYPES — only flag real problems a customer would encounter:
- item_not_found: Specific featured product not on destination. PRODUCT panels only.
- price_mismatch: Panel shows a specific price not found on destination. Only when price_shown is not null.
- dead_link: Destination is a hard error page.
- redirect: Destination redirects to something unrelated.
- context_mismatch: Panel makes a specific promise the destination fundamentally fails to deliver.
- none: No issues.

Do NOT flag:
- Brand panels linking to brand pages
- Category panels linking to category pages  
- Promotional landing pages that match the panel's offer
- Page layout or navigation structure differences

Respond in this exact JSON format only, no markdown:
{
  "score": <integer 0-100>,
  "issues": [
    { "type": "<price_mismatch|item_not_found|dead_link|redirect|context_mismatch|none>", "detail": "<concise, producer-actionable description>" }
  ],
  "reasoning": "<2-4 sentences in plain language a web producer can act on>"
}

If there are no issues: "issues": [{"type":"none","detail":"Panel promise fulfilled"}]`

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

  return {
    ...baseResult,
    panelType: panelFacts.panel_type,
    featuredProduct: panelFacts.featured_product,
    priceShown: panelFacts.price_shown,
    offerLanguage: panelFacts.offer_language,
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

    for (const l1Page of L1_PAGES) {
      console.log(`Scraping ${l1Page.label}...`)
      const scrapeResult = await scrapePanels(page, l1Page.url, l1Page.label)
      const panels = adWeek
        ? scrapeResult.panels.filter((p) => p.adWeek === adWeek)
        : scrapeResult.panels

      for (let i = 0; i < panels.length; i += 1) {
        const panel = panels[i]
        console.log(`  Scoring panel ${i + 1}/${panels.length}: ${panel.slot}`)

        const scored = await scorePanelWithPage(page, {
          panelId: `${l1Page.label}-${panel.slot}-${i + 1}`,
          panelName: panel.altText || `${l1Page.label} ${panel.slot}`,
          categoryL1: l1Page.label,
          sourcePageUrl: l1Page.url,
          outboundUrl: panel.outboundHref || l1Page.url,
          panelImageUrl: panel.imageUrl,
          aorOwner: toTitleCase(l1Page.aorOwner),
          adWeek: panel.adWeek,
          adYear: panel.adYear,
          slot: panel.slot,
          isStale: panel.isStale,
          categoryFolder: panel.categoryFolder,
        })
        results.push(scored)
      }
    }

    if (results.length > 0) {
      const inserts = results.map((item) => ({
        run_id: runId,
        panel_id: item.panelId,
        panel_name: item.panelName,
        category_l1: item.categoryL1,
        source_page_url: item.sourcePageUrl,
        outbound_url: item.outboundUrl,
        aor_owner: item.aorOwner,
        ad_week: item.adWeek ?? null,
        ad_year: item.adYear ?? null,
        slot: item.slot ?? null,
        is_stale: item.isStale ?? null,
        category_folder: item.categoryFolder ?? null,
        panel_type: item.panelType ?? null,
        featured_product: item.featuredProduct ?? null,
        price_shown: item.priceShown ?? null,
        offer_language: item.offerLanguage ?? null,
        is_bot_blocked: item.isBotBlocked ?? false,
        redirect_count: item.redirectCount ?? 0,
        product_count_on_destination: item.productCountOnDestination ?? null,
        is_out_of_stock: item.isOutOfStock ?? false,
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
