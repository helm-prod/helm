import Anthropic from '@anthropic-ai/sdk'
import type { Response } from 'playwright-core'
import { L1_PAGES } from '@/config/l1-pages'
import { getAuthenticatedPage } from './nexcom-auth'
import { scrapePanels } from './panel-scraper'

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

export interface PanelInput {
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

export interface PanelScoreResult {
  panelId: string
  panelName: string
  categoryL1: string
  sourcePageUrl: string
  outboundUrl: string
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
  panelImageUrl: string
}

function parseClaudeJson(raw: string) {
  return JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
    score: number
    issues: Array<{ type: PanelIssueType; detail: string }>
    reasoning: string
  }
}

function normalizeMediaType(value: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (value === 'image/png' || value === 'image/gif' || value === 'image/webp') {
    return value
  }

  return 'image/jpeg'
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

function buildBaseResult(panel: PanelInput) {
  return {
    panelId: panel.panelId,
    panelName: panel.panelName,
    categoryL1: panel.categoryL1,
    sourcePageUrl: panel.sourcePageUrl,
    outboundUrl: panel.outboundUrl,
    aorOwner: panel.aorOwner,
    adWeek: panel.adWeek,
    adYear: panel.adYear,
    slot: panel.slot,
    isStale: panel.isStale,
    categoryFolder: panel.categoryFolder,
    panelImageUrl: panel.panelImageUrl,
  }
}

async function scorePanelWithPage(page: Awaited<ReturnType<typeof getAuthenticatedPage>>['page'], panel: PanelInput): Promise<PanelScoreResult> {
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
      aiReasoning:
        'Panel image URL is empty, so vision scoring could not compare the marketing creative to the destination page. This result should be treated as incomplete until the panel image URL is available.',
      outboundPageTitle: '',
      panelImageUrl: panel.panelImageUrl,
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

Only classify as PRODUCT if a specific named product is clearly visible. A brand logo with products shown is still BRAND.`,
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: imgMediaType, data: imgBase64 },
        },
      ],
    }],
  })

  let panelFacts = defaultPanelFacts()
  try {
    const panelParseText = panelParseResponse.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
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
    if (url.startsWith('http') && status >= 300 && status < 400) {
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
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error)
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
      isBotBlocked: false,
      redirectCount,
      productCountOnDestination: null,
      isOutOfStock: false,
      score: 0,
      issues: [{ type: 'dead_link', detail: `Navigation failed: ${navigationError}` }],
      aiReasoning: 'The destination URL could not be reached.',
      outboundPageTitle: '',
      panelImageUrl: panel.panelImageUrl,
    }
  }

  if (httpStatus === 403) {
    return {
      ...baseResult,
      panelType: panelFacts.panel_type,
      featuredProduct: panelFacts.featured_product,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      isBotBlocked: true,
      redirectCount,
      productCountOnDestination: null,
      isOutOfStock: false,
      score: null,
      issues: [{ type: 'bot_blocked', detail: 'Destination returned 403. Page may be access-restricted or blocking automated requests. Manual verification required.' }],
      aiReasoning: 'This URL requires manual review — automated access was blocked (403). This does not necessarily mean the link is broken.',
      outboundPageTitle: await page.title().catch(() => ''),
      panelImageUrl: panel.panelImageUrl,
    }
  }

  if (httpStatus !== null && (httpStatus === 404 || httpStatus === 410 || httpStatus >= 500)) {
    return {
      ...baseResult,
      panelType: panelFacts.panel_type,
      featuredProduct: panelFacts.featured_product,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      isBotBlocked: false,
      redirectCount,
      productCountOnDestination: null,
      isOutOfStock: false,
      score: 0,
      issues: [{ type: 'dead_link', detail: `Destination returned HTTP ${httpStatus}.` }],
      aiReasoning: `The destination page returned an error (HTTP ${httpStatus}).`,
      outboundPageTitle: await page.title().catch(() => ''),
      panelImageUrl: panel.panelImageUrl,
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
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude did not return a text response')
  }

  const parsed = parseClaudeJson(textBlock.text)
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
    panelImageUrl: panel.panelImageUrl,
  }
}

function toTitleCase(value: string | undefined) {
  if (!value) return 'unassigned'
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export async function scorePanel(panel: PanelInput): Promise<PanelScoreResult> {
  const { browser, page } = await getAuthenticatedPage()

  try {
    return await scorePanelWithPage(page, panel)
  } finally {
    await browser.close()
  }
}

export async function scoreLivePanels(adWeek?: number) {
  const { browser, page } = await getAuthenticatedPage()

  try {
    const results: PanelScoreResult[] = []

    for (const l1Page of L1_PAGES) {
      const scraped = await scrapePanels(page, l1Page.url, l1Page.label)
      const panels = adWeek ? scraped.panels.filter((panel) => panel.adWeek === adWeek) : scraped.panels

      for (let index = 0; index < panels.length; index += 1) {
        const panel = panels[index]
        const scored = await scorePanelWithPage(page, {
          panelId: `${l1Page.label}-${panel.slot}-${index + 1}`,
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

    return results
  } finally {
    await browser.close()
  }
}
