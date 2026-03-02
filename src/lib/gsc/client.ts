import { getGoogleAccessToken } from '@/lib/google-auth'

const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3'
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const MAX_ROWS_PER_REQUEST = 25_000
const MAX_TOTAL_ROWS = 100_000

export function getGscAccessToken(): Promise<string> {
  return getGoogleAccessToken(GSC_SCOPE)
}

export interface GscSearchAnalyticsRequest {
  startDate: string
  endDate: string
  dimensions: string[]
  rowLimit?: number
  startRow?: number
  dimensionFilterGroups?: Array<Record<string, unknown>>
}

export interface GscSearchAnalyticsRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GscSearchAnalyticsResponse {
  rows?: GscSearchAnalyticsRow[]
  responseAggregationType?: string
}

export async function querySearchAnalytics(
  request: GscSearchAnalyticsRequest
): Promise<GscSearchAnalyticsRow[]> {
  const token = await getGscAccessToken()
  const siteUrl = process.env.GSC_SITE_URL

  if (!siteUrl) {
    throw new Error('GSC_SITE_URL env var not set')
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl)
  const url = `${GSC_API_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`

  const allRows: GscSearchAnalyticsRow[] = []
  const requestedRowLimit = request.rowLimit ?? MAX_ROWS_PER_REQUEST
  const pageRowLimit = Math.min(requestedRowLimit, MAX_ROWS_PER_REQUEST)
  let startRow = request.startRow ?? 0

  while (true) {
    const body: Record<string, unknown> = {
      startDate: request.startDate,
      endDate: request.endDate,
      dimensions: request.dimensions,
      rowLimit: pageRowLimit,
      startRow,
    }

    if (request.dimensionFilterGroups && request.dimensionFilterGroups.length > 0) {
      body.dimensionFilterGroups = request.dimensionFilterGroups
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`GSC API error ${response.status}: ${error}`)
    }

    const data = (await response.json()) as GscSearchAnalyticsResponse
    const rows = data.rows ?? []
    allRows.push(...rows)

    if (rows.length < pageRowLimit) {
      break
    }

    startRow += rows.length
    if (allRows.length >= MAX_TOTAL_ROWS) {
      break
    }
  }

  return allRows
}
