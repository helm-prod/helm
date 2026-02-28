import { JWT } from 'google-auth-library'

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
  | 'sessions'
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

const CORE_METRICS: MetricName[] = [
  'screenPageViews',
  'activeUsers',
  'sessions',
  'bounceRate',
  'averageSessionDuration',
]

const OPTIONAL_METRICS: MetricName[] = [
  'conversions',
  'addToCarts',
  'ecommercePurchases',
  'itemRevenue',
  'cartToViewRate',
  'purchaseToViewRate',
  'transactionsPerPurchaser',
  'purchaseRevenue',
]

const ALL_METRICS: MetricName[] = [...CORE_METRICS, ...OPTIONAL_METRICS]

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
  const clientEmail = process.env.GA4_CLIENT_EMAIL
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!clientEmail || !privateKey) {
    throw new Error('Missing GA4 service account credentials (GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY)')
  }

  const jwt = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  })

  const tokenResponse = await jwt.authorize()
  if (!tokenResponse.access_token) {
    throw new Error('Failed to get GA4 access token')
  }

  return tokenResponse.access_token
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

  try {
    const fullReport = await runReportRequest({
      accessToken,
      propertyId,
      startDate,
      endDate,
      metrics: ALL_METRICS,
    })

    mergeReportRows(mergedRows, fullReport)
    return Array.from(mergedRows.values())
  } catch (fullReportError) {
    console.warn('GA4 full metric fetch failed, falling back to partial fetch strategy.', fullReportError)
  }

  const baseReport = await runReportRequest({
    accessToken,
    propertyId,
    startDate,
    endDate,
    metrics: CORE_METRICS,
  })
  mergeReportRows(mergedRows, baseReport)

  for (const metric of OPTIONAL_METRICS) {
    try {
      const report = await runReportRequest({
        accessToken,
        propertyId,
        startDate,
        endDate,
        metrics: [metric],
      })
      mergeReportRows(mergedRows, report)
    } catch (error) {
      console.warn(`GA4 optional metric unavailable: ${metric}`, error)
    }
  }

  return Array.from(mergedRows.values())
}
