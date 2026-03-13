import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import playwright from 'playwright'
import { L1_PAGES } from '../src/config/l1-pages'
import { scrapePanels } from '../src/lib/site-quality/panel-scraper'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function normalizeMediaType(value: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (value === 'image/png' || value === 'image/gif' || value === 'image/webp') return value
  return 'image/jpeg'
}

function toTitleCase(value: string | undefined) {
  if (!value) return 'unassigned'
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

async function getAuthenticatedPage() {
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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
    return (
      document.body.innerText.includes('Hi ') ||
      !!document.querySelector('[href*="sign-out"], [href*="logout"]')
    )
  })

  if (!isLoggedIn) {
    await browser.close()
    throw new Error('NEXCOM authentication failed')
  }

  return { browser, page }
}

async function scorePanelWithPage(
  page: Awaited<ReturnType<typeof getAuthenticatedPage>>['page'],
  panel: {
    panelId: string
    panelName: string
    categoryL1: string
    outboundUrl: string
    panelImageUrl: string
    aorOwner: string
    adWeek?: number
    adYear?: number
    slot?: string
    isStale?: boolean
    categoryFolder?: string
  }
) {
  await page.goto(panel.outboundUrl, { waitUntil: 'networkidle', timeout: 20000 })
  const outboundPageTitle = await page.title()
  const outboundScreenshot = await page.screenshot({ type: 'jpeg', quality: 75, fullPage: false })
  const outboundBase64 = outboundScreenshot.toString('base64')

  const outboundText = await page.evaluate(() => {
    const priceEls = Array.from(document.querySelectorAll('[class*="price"], [class*="Price"], .price, .sale-price, .product-price'))
    const headingEls = Array.from(document.querySelectorAll('h1, h2, [class*="product-name"], [class*="item-name"]'))
    return {
      prices: priceEls.map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 20),
      headings: headingEls.map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 10),
    }
  })

  if (!panel.panelImageUrl) {
    return {
      ...panel,
      score: 45,
      issues: [{ type: 'context_mismatch', detail: 'Panel image URL is not configured for this scraped panel.' }],
      aiReasoning: 'Panel image URL is empty, so vision scoring could not compare the marketing creative to the destination page.',
      outboundPageTitle,
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
          text: `You are a quality checker for a Navy Exchange e-commerce site. You will be given:\n1. A marketing panel image (what the customer sees and clicks)\n2. A screenshot of the destination page the panel links to\n3. Extracted text from the destination page including prices and product names\n\nYour job: assess how well the destination page fulfills the promise made by the panel.\n\nDestination page context:\n- Title: ${outboundPageTitle}\n- Prices found: ${outboundText.prices.join(', ') || 'none found'}\n- Headings/items found: ${outboundText.headings.join(', ') || 'none found'}\n\nScore the panel 0-100 where:\n- 90-100: Panel promise fully fulfilled. Items and prices visible and match.\n- 70-89: Minor gap. Featured item present but price unclear or not prominent.\n- 50-69: Moderate gap. Item findable but not featured, or price absent.\n- 30-49: Significant gap. Item or price from panel not clearly present on destination.\n- 0-29: Critical failure. Destination is irrelevant, empty, 404, or fundamentally mismatches panel.\n\nRespond in this exact JSON format only, no markdown:\n{\n  "score": <integer 0-100>,\n  "issues": [\n    { "type": "<price_mismatch|item_not_found|dead_link|redirect|context_mismatch|none>", "detail": "<concise description>" }\n  ],\n  "reasoning": "<2-4 sentence explanation of score for the producer>"\n}\n\nIf there are no issues, return issues as [{"type":"none","detail":"Panel promise fulfilled"}].`,
        },
        { type: 'image', source: { type: 'base64', media_type: imgMediaType, data: imgBase64 } },
        { type: 'text', text: 'Panel image above. Destination page screenshot below:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: outboundBase64 } },
      ],
    }],
  })

  const textBlock = response.content.find((item) => item.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Claude did not return a text response')

  const parsed = JSON.parse(textBlock.text.replace(/```json|```/g, '').trim()) as {
    score: number
    issues: Array<{ type: string; detail: string }>
    reasoning: string
  }

  return {
    ...panel,
    score: parsed.score,
    issues: parsed.issues,
    aiReasoning: parsed.reasoning,
    outboundPageTitle,
  }
}

async function main() {
  const runId = process.env.PANEL_SCORE_RUN_ID
  if (!runId) throw new Error('PANEL_SCORE_RUN_ID env var is required')

  const adWeekEnv = process.env.PANEL_SCORE_AD_WEEK
  const adWeek = adWeekEnv ? parseInt(adWeekEnv, 10) : undefined

  console.log(`Starting panel score run ${runId}${adWeek ? ` for ad week ${adWeek}` : ''}`)

  await supabase.from('site_quality_panel_runs').update({ status: 'running' }).eq('id', runId)

  const { browser, page } = await getAuthenticatedPage()

  try {
    const results = []

    for (const l1Page of L1_PAGES) {
      console.log(`Scraping ${l1Page.label}...`)
      const scrapeResult = await scrapePanels(page, l1Page.url, l1Page.label)
      const panels = adWeek
        ? scrapeResult.panels.filter((p) => p.adWeek === adWeek)
        : scrapeResult.panels

      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i]
        console.log(`  Scoring panel ${i + 1}/${panels.length}: ${panel.slot}`)

        const scored = await scorePanelWithPage(page, {
          panelId: `${l1Page.label}-${panel.slot}-${i + 1}`,
          panelName: panel.altText || `${l1Page.label} ${panel.slot}`,
          categoryL1: l1Page.label,
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
        outbound_url: item.outboundUrl,
        aor_owner: item.aorOwner,
        ad_week: item.adWeek ?? null,
        ad_year: item.adYear ?? null,
        slot: item.slot ?? null,
        is_stale: item.isStale ?? null,
        category_folder: item.categoryFolder ?? null,
        score: item.score,
        issues: item.issues,
        ai_reasoning: item.aiReasoning,
        outbound_page_title: item.outboundPageTitle,
        panel_image_url: item.panelImageUrl,
      }))

      const { error } = await supabase.from('site_quality_panel_results').insert(inserts)
      if (error) throw error
    }

    const issueCount = results.reduce((sum, item) => sum + item.issues.filter((i) => i.type !== 'none').length, 0)
    const passingCount = results.filter((item) => item.score >= 80).length
    const avgScore = results.length > 0 ? results.reduce((sum, item) => sum + item.score, 0) / results.length : null

    await supabase.from('site_quality_panel_runs').update({
      status: 'complete',
      total_panels: results.length,
      avg_score: avgScore,
      issues_flagged: issueCount,
      passing_count: passingCount,
      completed_at: new Date().toISOString(),
    }).eq('id', runId)

    console.log(`Done. ${results.length} panels scored, ${issueCount} issues, avg score ${avgScore?.toFixed(1)}`)
  } catch (error) {
    console.error('Scoring failed:', error)
    await supabase.from('site_quality_panel_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
