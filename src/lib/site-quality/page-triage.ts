import Anthropic from '@anthropic-ai/sdk'

export interface PageMarketingZone {
  description: string
  zone_type: 'promotional' | 'brand' | 'navigational' | 'hero' | 'unknown'
  approximate_position: 'top' | 'middle' | 'bottom'
  has_clickable_link: boolean
  appears_broken: boolean
  notes: string | null
}

export interface PageTriageResult {
  page_url: string
  total_zones_identified: number
  zones: PageMarketingZone[]
  page_level_issues: string[]
  scraper_coverage_gaps: string[]
}

function parseTriageJson(raw: string): Omit<PageTriageResult, 'page_url'> | null {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  try {
    return JSON.parse(cleaned) as Omit<PageTriageResult, 'page_url'>
  } catch {
    return null
  }
}

export async function triagePage(
  anthropic: Anthropic,
  pageScreenshotBase64: string,
  pageUrl: string,
  scraperFoundCount: number
): Promise<PageTriageResult> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1400,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            `You are analyzing a page from a Navy Exchange e-commerce site (mynavyexchange.com).\n\n` +
            `This is a full-page screenshot. Identify every marketing panel, banner, and promotional content zone visible on this page.\n\n` +
            `For context: a CSS-based scraper found ${scraperFoundCount} clickable panel images on this page. Your job is to identify ALL marketing content, including anything the scraper might have missed — such as carousel slides, hero banners, background-image promotions, or embedded promotional sections.\n\n` +
            `For each marketing zone you identify, classify it as:\n` +
            `- promotional: Changes with the ad cycle (weekly sales, seasonal offers, limited-time deals)\n` +
            `- brand: Semi-permanent brand storytelling or brand partnerships\n` +
            `- navigational: Static category links, menu items, or permanent site features\n` +
            `- hero: Large featured rotating content at the top of the page\n` +
            `- unknown: Cannot determine\n\n` +
            `Also note:\n` +
            `- Whether the zone appears to have a clickable link\n` +
            `- Whether anything appears broken (empty space, missing image, broken layout)\n` +
            `- Any other observations that would help a web producer\n\n` +
            `Respond in this exact JSON format only, no markdown:\n` +
            `{\n` +
            `  "total_zones_identified": <number>,\n` +
            `  "zones": [\n` +
            `    {\n` +
            `      "description": "<brief description of what this zone shows>",\n` +
            `      "zone_type": "<promotional|brand|navigational|hero|unknown>",\n` +
            `      "approximate_position": "<top|middle|bottom>",\n` +
            `      "has_clickable_link": <true|false>,\n` +
            `      "appears_broken": <true|false>,\n` +
            `      "notes": "<any notable observation, or null>"\n` +
            `    }\n` +
            `  ],\n` +
            `  "page_level_issues": ["<any page-wide issues: broken layout, large empty spaces, etc.>"],\n` +
            `  "scraper_coverage_gaps": ["<description of any marketing content that a CSS-based img scraper would likely miss>"]\n` +
            `}`
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: pageScreenshotBase64 },
        },
      ],
    }],
  })

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('')
  const parsed = parseTriageJson(text)

  if (!parsed) {
    return {
      page_url: pageUrl,
      total_zones_identified: 0,
      zones: [],
      page_level_issues: ['Page triage parsing failed'],
      scraper_coverage_gaps: [],
    }
  }

  return {
    page_url: pageUrl,
    total_zones_identified: parsed.total_zones_identified ?? parsed.zones?.length ?? 0,
    zones: parsed.zones ?? [],
    page_level_issues: parsed.page_level_issues ?? [],
    scraper_coverage_gaps: parsed.scraper_coverage_gaps ?? [],
  }
}
