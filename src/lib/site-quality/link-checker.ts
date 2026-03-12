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
): Promise<Array<Omit<LinkResult, 'httpStatus' | 'errorMessage' | 'redirectTarget'>>> {
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'HelmBot/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await res.text()
    const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    const links: Array<Omit<LinkResult, 'httpStatus' | 'errorMessage' | 'redirectTarget'>> = []
    const dedupe = new Set<string>()
    let match: RegExpExecArray | null

    while ((match = hrefRegex.exec(html)) !== null) {
      const href = match[1]
      const label = match[2]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue

      const absolute = href.startsWith('http')
        ? href
        : `${getBaseSiteUrl()}${href.startsWith('/') ? '' : '/'}${href}`

      if (!absolute.includes('mynavyexchange.com')) continue

      const key = `${pageUrl}|${absolute}|${label}`
      if (dedupe.has(key)) continue
      dedupe.add(key)

      links.push({
        pageUrl,
        linkUrl: absolute,
        sourceType: 'in-page',
        sourceLabel: label,
        aorOwner: resolveAorOwner(absolute),
      })
    }

    return links
  } catch {
    return []
  }
}

export async function runLinkCheckForScope(scope: 'all' | 'aor' | 'url', scopeValue?: string | null) {
  const pageUrls = resolveScopePageUrls(scope, scopeValue)
  const extracted = await Promise.all(pageUrls.map((pageUrl) => extractPageLinks(pageUrl)))
  const links = extracted.flat()
  const results: LinkResult[] = []

  for (const link of links) {
    const status = await checkLink(link.linkUrl)
    results.push({ ...link, ...status })
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
