import Anthropic from '@anthropic-ai/sdk'
import { L1_PAGES } from '@/config/l1-pages'
import { getAuthenticatedPage } from './nexcom-auth'
import { scrapePanels } from './panel-scraper'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  score: number
  issues: Array<{ type: string; detail: string }>
  aiReasoning: string
  outboundPageTitle: string
  panelImageUrl: string
}

function parseClaudeJson(raw: string) {
  return JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
    score: number
    issues: Array<{ type: string; detail: string }>
    reasoning: string
  }
}

function normalizeMediaType(value: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (value === 'image/png' || value === 'image/gif' || value === 'image/webp') {
    return value
  }

  return 'image/jpeg'
}

async function scorePanelWithPage(page: Awaited<ReturnType<typeof getAuthenticatedPage>>['page'], panel: PanelInput): Promise<PanelScoreResult> {
  await page.goto(panel.outboundUrl, { waitUntil: 'networkidle', timeout: 20000 })
  const outboundPageTitle = await page.title()
  const outboundScreenshot = await page.screenshot({ type: 'jpeg', quality: 75, fullPage: false })
  const outboundBase64 = outboundScreenshot.toString('base64')

  const outboundText = await page.evaluate(() => {
    const priceEls = Array.from(document.querySelectorAll('[class*="price"], [class*="Price"], .price, .sale-price, .product-price'))
    const headingEls = Array.from(document.querySelectorAll('h1, h2, [class*="product-name"], [class*="item-name"]'))
    const prices = priceEls.map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 20)
    const headings = headingEls.map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 10)
    return { prices, headings, title: document.title }
  })

  if (!panel.panelImageUrl) {
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
      score: 45,
      issues: [{ type: 'context_mismatch', detail: 'Panel image URL is not configured for this scraped panel.' }],
      aiReasoning:
        'Panel image URL is empty, so vision scoring could not compare the marketing creative to the destination page. The destination page was captured successfully, but this result should be treated as incomplete until the panel image URL is available.',
      outboundPageTitle,
      panelImageUrl: panel.panelImageUrl,
    }
  }

  const imgRes = await fetch(panel.panelImageUrl)
  const imgBuffer = await imgRes.arrayBuffer()
  const imgBase64 = Buffer.from(imgBuffer).toString('base64')
  const imgMediaType = normalizeMediaType(imgRes.headers.get('content-type') || 'image/jpeg')

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `You are a quality checker for a Navy Exchange e-commerce site. You will be given:\n1. A marketing panel image (what the customer sees and clicks)\n2. A screenshot of the destination page the panel links to\n3. Extracted text from the destination page including prices, product names, and headings\n\nYour job: assess how well the destination page delivers on the promise made by the panel.\n\nDestination page context:\n- Title: ${outboundPageTitle}\n- Prices found: ${outboundText.prices.join(', ') || 'none found'}\n- Headings/items found: ${outboundText.headings.join(', ') || 'none found'}\n\n---\n\nSTEP 1 — CLASSIFY THE PANEL TYPE\n\nBefore scoring, classify the panel into one of these types:\n- PRODUCT: Panel features a specific product (with or without a price). The panel promises the customer can find and buy that product.\n- BRAND: Panel tells a brand story or shows a brand logo/name. The panel promises a brand experience or brand landing page.\n- CATEGORY: Panel promotes a category, department, or collection (e.g. "Shop Women's", "Electronics Sale"). The panel promises a relevant category page.\n\n---\n\nSTEP 2 — APPLY TYPE-APPROPRIATE SCORING RULES\n\nPRODUCT panel scoring:\n- 90-100: The specific featured product is clearly visible and purchasable on the destination page.\n- 70-89: The featured product is present but not prominently featured, or similar products are shown.\n- 50-69: The product category is correct but the specific item is not findable.\n- 30-49: The destination is loosely related but the featured product is absent.\n- 0-29: The destination is wrong, broken, or has nothing to do with the featured product.\n\nCRITICAL for PRODUCT panels: if a specific product is shown in the panel image (e.g., a cologne, a specific shoe, a named appliance), the destination MUST show that product. If it does not, that is the primary finding — flag as item_not_found and score accordingly. This is the most important check.\n\nBRAND panel scoring:\n- 90-100: Destination is a landing page for that specific brand showing their products.\n- 70-89: Destination shows the brand's products but is not a dedicated brand page.\n- 50-69: Destination is a related category but the brand is not prominently featured.\n- 30-49: Destination is off-topic or shows a different brand.\n- 0-29: Destination is broken, wrong, or completely unrelated.\n\nNOTE: A brand panel linking to a brand's dedicated page is correct. Do NOT flag this as context_mismatch just because it is a brand page rather than a product listing.\n\nCATEGORY panel scoring:\n- 90-100: Destination is the correct category/department page.\n- 70-89: Destination is a closely related category.\n- 50-69: Destination is loosely related.\n- 30-49: Destination is a different category entirely.\n- 0-29: Destination is broken or completely unrelated.\n\n---\n\nSTEP 3 — IDENTIFY ISSUES\n\nOnly flag issues that represent a real problem for a customer. Each issue must be meaningful and actionable.\n\nValid issue types:\n- item_not_found: A specific product featured in the panel is not present on the destination page. (PRODUCT panels only — most important issue type)\n- price_mismatch: A specific price is shown in the panel but that price is not reflected on the destination page. Only flag this if the panel actually displays a price.\n- dead_link: The destination URL returns an error, access denied, or empty page.\n- redirect: The destination redirects to an unrelated page.\n- context_mismatch: The panel makes a specific promise (product, brand, offer) that the destination fundamentally fails to deliver — not just a style difference. Reserve this for clear mismatches, not minor differences in page layout or navigation style.\n- none: No issues found.\n\nDo NOT flag:\n- Brand panels linking to brand pages (this is correct behavior)\n- Category panels linking to category pages\n- General "the page could be better" observations\n- Structural observations about page layout unless they block the customer from completing the implied action\n\n---\n\nRespond in this exact JSON format only, no markdown:\n{\n  "panel_type": "<PRODUCT|BRAND|CATEGORY>",\n  "score": <integer 0-100>,\n  "issues": [\n    { "type": "<price_mismatch|item_not_found|dead_link|redirect|context_mismatch|none>", "detail": "<concise, producer-actionable description>" }\n  ],\n  "reasoning": "<2-4 sentences explaining the score in plain language a web producer can act on>"\n}\n\nIf there are no issues, return: "issues": [{"type":"none","detail":"Panel promise fulfilled"}]`
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: imgMediaType, data: imgBase64 },
        },
        {
          type: 'text',
          text: 'Panel image above. Destination page screenshot below:'
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: outboundBase64 },
        },
      ],
    }],
  })

  const textBlock = response.content.find((item) => item.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude did not return a text response')
  }

  const parsed = parseClaudeJson(textBlock.text)
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
