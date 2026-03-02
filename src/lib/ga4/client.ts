import { getGoogleAccessToken } from '@/lib/google-auth'

export interface FetchGa4ReportArgs {
  startDate: string
  endDate: string
}

export interface Ga4ReportRow {
  page_path: string
  page_title: string | null
  screenpage_views: number | null
  active_users: number | null
  sessions: number | null
  bounce_rate: number | null
  avg_session_duration: number | null
  conversions: number | null
  add_to_carts: number | null
  ecommerce_purchases: number | null
  item_revenue: number | null
  cart_to_view_rate: number | null
  purchase_to_view_rate: number | null
  transactions_per_purchaser: number | null
  purchase_revenue: number | null
}

interface Ga4Header {
  name: string
}

interface Ga4Value {
  value: string
}

interface Ga4ApiRow {
  dimensionValues?: Ga4Value[]
  metricValues?: Ga4Value[]
}

interface Ga4RunReportResponse {
  dimensionHeaders?: Ga4Header[]
  metricHeaders?: Ga4Header[]
  rows?: Ga4ApiRow[]
}

type MetricName =
  | 'screenPageViews'
  | 'activeUsers'
  | 'totalUsers'
  | 'sessions'
  | 'engagedSessions'
  | 'userEngagementDuration'
  | 'engagementRate'
  | 'screenPageViewsPerSession'
  | 'newUsers'
  | 'bounceRate'
  | 'averageSessionDuration'
  | 'conversions'
  | 'addToCarts'
  | 'ecommercePurchases'
  | 'itemRevenue'
  | 'cartToViewRate'
  | 'purchaseToViewRate'
  | 'transactionsPerPurchaser'
  | 'purchaseRevenue'

const CORE_METRICS_BATCH: MetricName[] = [
  'screenPageViews',
  'totalUsers',
  'sessions',
  'engagedSessions',
  'userEngagementDuration',
  'bounceRate',
  'engagementRate',
  'averageSessionDuration',
  'screenPageViewsPerSession',
  'newUsers',
]

const ECOMMERCE_METRICS_BATCH: MetricName[] = [
  'conversions',
  'addToCarts',
  'ecommercePurchases',
  'itemRevenue',
  'cartToViewRate',
  'purchaseToViewRate',
  'transactionsPerPurchaser',
  'purchaseRevenue',
]

const CORE_FALLBACK_BATCHES: MetricName[][] = [
  ['screenPageViews', 'totalUsers', 'sessions', 'bounceRate', 'averageSessionDuration'],
  ['engagedSessions', 'userEngagementDuration', 'engagementRate', 'screenPageViewsPerSession', 'newUsers'],
]

const MAX_GA4_METRICS_PER_REQUEST = 10

const DIMENSIONS = ['pagePath', 'pageTitle']

const PATH_FILTER = {
  orGroup: {
    expressions: [
      {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'BEGINS_WITH',
            value: '/browse/',
          },
        },
      },
      {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'EXACT',
            value: '/',
          },
        },
      },
      {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'BEGINS_WITH',
            value: '/coupons',
          },
        },
      },
      {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'BEGINS_WITH',
            value: '/account/digitalflyer',
          },
        },
      },
      {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'BEGINS_WITH',
            value: '/giftcards',
          },
        },
      },
    ],
  },
}

export async function getGa4AccessToken(): Promise<string> {
  return getGoogleAccessToken('https://www.googleapis.com/auth/analytics.readonly')
}

async function runReportRequest({
  accessToken,
  propertyId,
  startDate,
  endDate,
  metrics,
}: {
  accessToken: string
  propertyId: string
  startDate: string
  endDate: string
  metrics: MetricName[]
}): Promise<Ga4RunReportResponse> {
  if (metrics.length > MAX_GA4_METRICS_PER_REQUEST) {
    throw new Error(
      `GA4 metric batch exceeds ${MAX_GA4_METRICS_PER_REQUEST} metrics (${metrics.length})`
    )
  }

  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dimensions: DIMENSIONS.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: PATH_FILTER,
      limit: 500,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GA4 runReport failed (${response.status}): ${errorText}`)
  }

  return (await response.json()) as Ga4RunReportResponse
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toInteger(value: string | undefined): number | null {
  const parsed = toNumber(value)
  return parsed === null ? null : Math.round(parsed)
}

function emptyReportRow(pagePath: string, pageTitle: string | null): Ga4ReportRow {
  return {
    page_path: pagePath,
    page_title: pageTitle,
    screenpage_views: null,
    active_users: null,
    sessions: null,
    bounce_rate: null,
    avg_session_duration: null,
    conversions: null,
    add_to_carts: null,
    ecommerce_purchases: null,
    item_revenue: null,
    cart_to_view_rate: null,
    purchase_to_view_rate: null,
    transactions_per_purchaser: null,
    purchase_revenue: null,
  }
}

function mapMetricToColumn(row: Ga4ReportRow, metricName: string, value: string | undefined) {
  switch (metricName) {
    case 'screenPageViews':
      row.screenpage_views = toInteger(value)
      return
    case 'totalUsers':
    case 'activeUsers':
      row.active_users = toInteger(value)
      return
    case 'sessions':
      row.sessions = toInteger(value)
      return
    case 'bounceRate':
      row.bounce_rate = toNumber(value)
      return
    case 'averageSessionDuration':
      row.avg_session_duration = toNumber(value)
      return
    case 'conversions':
      row.conversions = toInteger(value)
      return
    case 'addToCarts':
      row.add_to_carts = toInteger(value)
      return
    case 'ecommercePurchases':
      row.ecommerce_purchases = toInteger(value)
      return
    case 'itemRevenue':
      row.item_revenue = toNumber(value)
      return
    case 'cartToViewRate':
      row.cart_to_view_rate = toNumber(value)
      return
    case 'purchaseToViewRate':
      row.purchase_to_view_rate = toNumber(value)
      return
    case 'transactionsPerPurchaser':
      row.transactions_per_purchaser = toNumber(value)
      return
    case 'purchaseRevenue':
      row.purchase_revenue = toNumber(value)
      return
    default:
      return
  }
}

function mergeReportRows(target: Map<string, Ga4ReportRow>, report: Ga4RunReportResponse) {
  const dimensionHeaders = report.dimensionHeaders ?? []
  const metricHeaders = report.metricHeaders ?? []
  const rows = report.rows ?? []

  const dimensionIndexByName = new Map(dimensionHeaders.map((header, index) => [header.name, index]))

  for (const row of rows) {
    const pagePath = row.dimensionValues?.[dimensionIndexByName.get('pagePath') ?? 0]?.value ?? ''
    const pageTitle = row.dimensionValues?.[dimensionIndexByName.get('pageTitle') ?? 1]?.value ?? null

    if (!pagePath) {
      continue
    }

    const key = `${pagePath}__${pageTitle ?? ''}`
    const existing = target.get(key) ?? emptyReportRow(pagePath, pageTitle)

    metricHeaders.forEach((header, metricIndex) => {
      const metricValue = row.metricValues?.[metricIndex]?.value
      mapMetricToColumn(existing, header.name, metricValue)
    })

    target.set(key, existing)
  }
}

export async function fetchGa4Report({ startDate, endDate }: FetchGa4ReportArgs): Promise<Ga4ReportRow[]> {
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) {
    throw new Error('Missing GA4_PROPERTY_ID')
  }

  const accessToken = await getGa4AccessToken()
  const mergedRows = new Map<string, Ga4ReportRow>()
  let hasCoreData = false

  try {
    const coreReport = await runReportRequest({
      accessToken,
      propertyId,
      startDate,
      endDate,
      metrics: CORE_METRICS_BATCH,
    })

    mergeReportRows(mergedRows, coreReport)
    hasCoreData = true
  } catch (coreBatchError) {
    console.warn(
      'GA4 core batch failed, switching to fallback core batches (<=10 metrics each).',
      coreBatchError
    )

    for (const batch of CORE_FALLBACK_BATCHES) {
      try {
        const report = await runReportRequest({
          accessToken,
          propertyId,
          startDate,
          endDate,
          metrics: batch,
        })
        mergeReportRows(mergedRows, report)
        hasCoreData = true
      } catch (fallbackError) {
        console.warn(`GA4 fallback core metric batch failed: ${batch.join(', ')}`, fallbackError)
      }
    }
  }

  if (!hasCoreData) {
    throw new Error('Failed to fetch required GA4 core metrics')
  }

  try {
    const ecommerceReport = await runReportRequest({
      accessToken,
      propertyId,
      startDate,
      endDate,
      metrics: ECOMMERCE_METRICS_BATCH,
    })
    mergeReportRows(mergedRows, ecommerceReport)
  } catch (error) {
    console.warn('GA4 ecommerce metric batch unavailable. Continuing with core metrics only.', error)
  }

  return Array.from(mergedRows.values())
}
