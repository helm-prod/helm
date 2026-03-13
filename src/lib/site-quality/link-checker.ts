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
