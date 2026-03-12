import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedPage } from './nexcom-auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface PanelInput {
  panelId: string
  panelName: string
  categoryL1: string
  outboundUrl: string
  panelImageUrl: string
  aorOwner: 'Megan' | 'Maddie' | 'Daryl'
  adWeek?: string
}

export interface PanelScoreResult {
  panelId: string
  panelName: string
  categoryL1: string
  outboundUrl: string
  aorOwner: string
  adWeek?: string
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

export async function scorePanel(panel: PanelInput): Promise<PanelScoreResult> {
  const { browser, page } = await getAuthenticatedPage()

  try {
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
        outboundUrl: panel.outboundUrl,
        aorOwner: panel.aorOwner,
        adWeek: panel.adWeek,
        score: 45,
        issues: [{ type: 'context_mismatch', detail: 'Panel image URL is not configured for this seed entry.' }],
        aiReasoning:
          'Panel image URL is empty, so vision scoring could not compare the marketing creative to the destination page. The destination page was captured successfully, but this result should be treated as incomplete until the panel image URL is populated.',
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
            text: `You are a quality checker for a Navy Exchange e-commerce site. You will be given:\n1. A marketing panel image (what the customer sees and clicks)\n2. A screenshot of the destination page the panel links to\n3. Extracted text from the destination page including prices and product names\n\nYour job: assess how well the destination page fulfills the promise made by the panel.\n\nDestination page context:\n- Title: ${outboundPageTitle}\n- Prices found: ${outboundText.prices.join(', ') || 'none found'}\n- Headings/items found: ${outboundText.headings.join(', ') || 'none found'}\n\nScore the panel 0-100 where:\n- 90-100: Panel promise fully fulfilled. Items and prices visible and match.\n- 70-89: Minor gap. Featured item present but price unclear or not prominent.\n- 50-69: Moderate gap. Item findable but not featured, or price absent.\n- 30-49: Significant gap. Item or price from panel not clearly present on destination.\n- 0-29: Critical failure. Destination is irrelevant, empty, 404, or fundamentally mismatches panel.\n\nRespond in this exact JSON format only, no markdown:\n{\n  "score": <integer 0-100>,\n  "issues": [\n    { "type": "<price_mismatch|item_not_found|dead_link|redirect|context_mismatch|none>", "detail": "<concise description>" }\n  ],\n  "reasoning": "<2-4 sentence explanation of score for the producer>"\n}\n\nIf there are no issues, return issues as [{"type":"none","detail":"Panel promise fulfilled"}].`
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
      outboundUrl: panel.outboundUrl,
      aorOwner: panel.aorOwner,
      adWeek: panel.adWeek,
      score: parsed.score,
      issues: parsed.issues,
      aiReasoning: parsed.reasoning,
      outboundPageTitle,
      panelImageUrl: panel.panelImageUrl,
    }
  } finally {
    await browser.close()
  }
}
