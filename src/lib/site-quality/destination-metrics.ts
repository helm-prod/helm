import { getGoogleAccessToken } from '@/lib/google-auth'

export interface DestinationMetrics {
  url: string
  sessions_7d: number
  bounce_rate_7d: number
  add_to_cart_rate_7d: number
  revenue_7d: number
  transactions_7d: number
}

interface Ga4Value {
  value: string
}

interface Ga4Row {
  dimensionValues?: Ga4Value[]
  metricValues?: Ga4Value[]
}

interface Ga4RunReportResponse {
  rows?: Ga4Row[]
}

const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
const MAX_PATHS_PER_BATCH = 100

function toNumber(value: string | undefined) {
  const parsed = Number.parseFloat(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeUrl(url: string) {
  try {
    return new URL(url).toString()
  } catch {
    return url
  }
}

function extractPath(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.pathname || '/'
  } catch {
    return '/'
  }
}

async function runDestinationReport(accessToken: string, propertyId: string, pagePaths: string[]) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'addToCarts' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          inListFilter: {
            values: pagePaths,
          },
        },
      },
      limit: pagePaths.length,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`GA4 destination metrics runReport failed (${response.status}): ${text}`)
  }

  return (await response.json()) as Ga4RunReportResponse
}

export async function fetchDestinationMetrics(destinationUrls: string[]): Promise<Map<string, DestinationMetrics>> {
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) {
    throw new Error('Missing GA4_PROPERTY_ID')
  }

  const normalizedUrls = Array.from(new Set(destinationUrls.map(normalizeUrl)))
  const pathToUrls = new Map<string, string[]>()
  for (const url of normalizedUrls) {
    const path = extractPath(url)
    const matches = pathToUrls.get(path) ?? []
    matches.push(url)
    pathToUrls.set(path, matches)
  }

  const allPaths = Array.from(pathToUrls.keys())
  const accessToken = await getGoogleAccessToken(ANALYTICS_SCOPE)
  const metricsByUrl = new Map<string, DestinationMetrics>()

  for (let index = 0; index < allPaths.length; index += MAX_PATHS_PER_BATCH) {
    const batchPaths = allPaths.slice(index, index + MAX_PATHS_PER_BATCH)
    const report = await runDestinationReport(accessToken, propertyId, batchPaths)

    for (const row of report.rows ?? []) {
      const pagePath = row.dimensionValues?.[0]?.value
      if (!pagePath) continue

      const sessions = Math.round(toNumber(row.metricValues?.[0]?.value))
      const bounceRate = toNumber(row.metricValues?.[1]?.value)
      const addToCarts = toNumber(row.metricValues?.[2]?.value)
      const revenue = toNumber(row.metricValues?.[3]?.value)
      const transactions = Math.round(toNumber(row.metricValues?.[4]?.value))
      const addToCartRate = sessions > 0 ? addToCarts / sessions : 0

      for (const url of pathToUrls.get(pagePath) ?? []) {
        metricsByUrl.set(url, {
          url,
          sessions_7d: sessions,
          bounce_rate_7d: bounceRate,
          add_to_cart_rate_7d: addToCartRate,
          revenue_7d: revenue,
          transactions_7d: transactions,
        })
      }
    }
  }

  return metricsByUrl
}
