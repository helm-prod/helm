import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import type { Response } from 'playwright-core'
import { L1_PAGES } from '@/config/l1-pages'
import { buildPass1UserMessage, buildPass2UserMessage, type PanelFacts } from './panel-prompts'
import { getAuthenticatedPage } from './nexcom-auth'
import { scrapePanels } from './panel-scraper'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  panelImageUrl: string
}

function computePanelFingerprint(panelImageUrl: string, outboundUrl: string): string {
  const input = `${panelImageUrl}::${outboundUrl}`.toLowerCase().trim()
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

function parseClaudeJson(raw: string) {
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
    panelFingerprint: computePanelFingerprint(panel.panelImageUrl, panel.outboundUrl),
  }
}

function buildPanelFailureResult(panel: PanelInput, reasoning: string): PanelScoreResult {
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
          text: buildPass1UserMessage(),
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
      brandName: panelFacts.brand_name,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      ctaText: panelFacts.cta_text,
      destinationRelevanceKeywords: null,
      hasEmptyResults: false,
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
      brandName: panelFacts.brand_name,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      ctaText: panelFacts.cta_text,
      destinationRelevanceKeywords: null,
      hasEmptyResults: false,
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
      brandName: panelFacts.brand_name,
      priceShown: panelFacts.price_shown,
      offerLanguage: panelFacts.offer_language,
      ctaText: panelFacts.cta_text,
      destinationRelevanceKeywords: null,
      hasEmptyResults: false,
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
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude did not return a text response')
  }

  const parsed = parseClaudeJson(textBlock.text)
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
      panelImageUrl: panel.panelImageUrl,
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
        const panelInput = {
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
        }

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

    return results
  } finally {
    await browser.close()
  }
}
