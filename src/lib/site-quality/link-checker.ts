import * as cheerio from 'cheerio'

export interface LinkResult {
  pageUrl: string
  linkUrl: string
  sourceType: string
  sourceLabel: string
  httpStatus: number | null
  errorMessage: string | null
  redirectTarget: string | null
  aorOwner: string | null
}

export interface PanelLink {
  url: string
  panelImage: string
  slot: string
  adWeek: number | null
  adYear: number | null
  isLinked: boolean
}

const AOR_MAP: Array<{ pattern: RegExp; owner: string }> = [
  { pattern: /\/(electronics|computers|cameras|phones)/i, owner: 'Megan' },
  { pattern: /\/(home|furniture|appliances|kitchen)/i, owner: 'Megan' },
  { pattern: /\/(outdoor|sports|fitness|camping|grills)/i, owner: 'Maddie' },
  { pattern: /\/(clothing|apparel|shoes|uniforms|jewelry|accessories)/i, owner: 'Daryl' },
]

const DEFAULT_PAGE_URLS = [
  'https://www.mynavyexchange.com/',
  'https://www.mynavyexchange.com/electronics',
  'https://www.mynavyexchange.com/home',
  'https://www.mynavyexchange.com/outdoor',
  'https://www.mynavyexchange.com/clothing',
] as const

const AOR_PAGE_URLS: Record<string, string[]> = {
  Megan: [
    'https://www.mynavyexchange.com/electronics',
    'https://www.mynavyexchange.com/home',
  ],
  Maddie: ['https://www.mynavyexchange.com/outdoor'],
  Daryl: ['https://www.mynavyexchange.com/clothing'],
}

function getBaseSiteUrl() {
  return process.env.NEXCOM_SITE_URL ?? 'https://www.mynavyexchange.com'
}

export function resolveAorOwner(url: string): string | null {
  for (const { pattern, owner } of AOR_MAP) {
    if (pattern.test(url)) return owner
  }
  return null
}

export function resolveScopePageUrls(scope: 'all' | 'aor' | 'url', scopeValue?: string | null) {
  if (scope === 'url' && scopeValue) {
    return [scopeValue]
  }

  if (scope === 'aor' && scopeValue && scopeValue in AOR_PAGE_URLS) {
    return AOR_PAGE_URLS[scopeValue]
  }

  return [...DEFAULT_PAGE_URLS]
}

export async function checkLink(
  url: string,
): Promise<Pick<LinkResult, 'httpStatus' | 'errorMessage' | 'redirectTarget'>> {
  try {
    const headRes = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HelmBot/1.0; +https://helm.nexweb.dev)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    })

    const status = headRes.status

    if (status === 403 || status === 405) {
      throw new Error('HEAD blocked, trying GET')
    }

    const redirectTarget = status >= 300 && status < 400 ? headRes.headers.get('location') ?? null : null
    return { httpStatus: status, errorMessage: null, redirectTarget }
  } catch {
    try {
      const getRes = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HelmBot/1.0; +https://helm.nexweb.dev)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Range: 'bytes=0-0',
        },
        signal: AbortSignal.timeout(10000),
      })

      const status = getRes.status
      const reportedStatus = status === 206 ? 200 : status
      const redirectTarget = status >= 300 && status < 400 ? getRes.headers.get('location') ?? null : null

      return { httpStatus: reportedStatus, errorMessage: null, redirectTarget }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      return { httpStatus: null, errorMessage: message, redirectTarget: null }
    }
  }
}

export async function extractPageLinks(
  pageUrl: string,
): Promise<PanelLink[]> {
  const siteBase = 'https://www.mynavyexchange.com'

  let html: string
  try {
    const res = await fetch(pageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HelmBot/1.0; +https://helm.nexweb.dev)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Page fetch returned ${res.status}`)
    html = await res.text()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    throw new Error(`Failed to fetch ${pageUrl}: ${message}`)
  }

  const $ = cheerio.load(html)
  const panels: PanelLink[] = []
  const endecaZones = $('#pageContainerTagBody .container.homePage')

  endecaZones.find('img').each((_, imgEl) => {
    const src = $(imgEl).attr('src') || ''
    if (!src.includes('/assets/')) return

    const panelImage = src.startsWith('http') ? src : `${siteBase}${src}`
    const slotMatch = src.match(/-([A-Z]\d+)\.(?:jpg|jpeg|png|gif|svg|webp)/i)
    const slot = slotMatch ? slotMatch[1].toUpperCase() : ''

    const weekMatch = src.match(/\/(\d{2})-(\d{2})W_/)
    const adYear = weekMatch ? Number.parseInt(weekMatch[1], 10) : null
    const adWeek = weekMatch ? Number.parseInt(weekMatch[2], 10) : null

    const anchor = $(imgEl).closest('a')
    const href = anchor.attr('href') || null

    let url = ''
    let isLinked = false

    if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
      isLinked = true
      url = href.startsWith('http') ? href : `${siteBase}${href}`
    }

    panels.push({ url, panelImage, slot, adWeek, adYear, isLinked })
  })

  const seen = new Set<string>()
  return panels.filter((panel) => {
    if (seen.has(panel.panelImage)) return false
    seen.add(panel.panelImage)
    return true
  })
}

export async function runLinkCheckForScope(scope: 'all' | 'aor' | 'url', scopeValue?: string | null) {
  const pageUrls = resolveScopePageUrls(scope, scopeValue)
  const extracted = await Promise.all(pageUrls.map((pageUrl) => extractPageLinks(pageUrl)))
  const results: LinkResult[] = []

  for (let pageIndex = 0; pageIndex < extracted.length; pageIndex += 1) {
    const pageUrl = pageUrls[pageIndex]
    const panels = extracted[pageIndex]

    for (const panel of panels) {
      if (!panel.isLinked || !panel.url) {
        results.push({
          pageUrl,
          linkUrl: '',
          sourceType: 'in-page',
          sourceLabel: panel.slot,
          httpStatus: null,
          errorMessage: 'Panel has no link (unlinked panel)',
          redirectTarget: null,
          aorOwner: resolveAorOwner(pageUrl),
        })
        continue
      }

      const status = await checkLink(panel.url)
      results.push({
        pageUrl,
        linkUrl: panel.url,
        sourceType: 'in-page',
        sourceLabel: panel.slot,
        aorOwner: resolveAorOwner(pageUrl),
        ...status,
      })
    }
  }

  return {
    pageUrls,
    results,
    summary: {
      totalPages: pageUrls.length,
      totalLinks: results.length,
      brokenLinks: results.filter((item) => item.httpStatus === 404 || item.errorMessage).length,
      redirectLinks: results.filter((item) => item.httpStatus === 301).length,
    },
  }
}
