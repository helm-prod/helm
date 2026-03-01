import { getGa4AccessToken } from './client'

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

interface RunReportParams {
  accessToken: string
  propertyId: string
  startDate: string
  endDate: string
  dimensions: string[]
  metrics: string[]
  limit?: number
  dimensionFilter?: Record<string, unknown>
  orderBys?: Array<{ metric?: { metricName: string }; desc?: boolean }>
}

type SiteReports = {
  overview: Record<string, string | number | null> | null
  devices: Array<Record<string, string | number | null>> | null
  channels: Array<Record<string, string | number | null>> | null
  search_terms: Array<Record<string, string | number | null>> | null
  top_pages: Array<Record<string, string | number | null>> | null
  categories: Array<Record<string, string | number | null>> | null
  brands: Array<Record<string, string | number | null>> | null
  items: Array<Record<string, string | number | null>> | null
  coupons: Array<Record<string, string | number | null>> | null
  items_viewed: Array<Record<string, string | number | null>> | null
}

const MAX_GA4_METRICS_PER_REQUEST = 10

function toNumber(value: string | undefined) {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toInteger(value: string | undefined) {
  const parsed = toNumber(value)
  return parsed === null ? null : Math.round(parsed)
}

async function runReport(params: RunReportParams): Promise<Array<Record<string, string>>> {
  const {
    accessToken,
    propertyId,
    startDate,
    endDate,
    dimensions,
    metrics,
    limit,
    dimensionFilter,
    orderBys,
  } = params

  const body: Record<string, unknown> = {
    metrics: metrics.map((name) => ({ name })),
    dateRanges: [{ startDate, endDate }],
  }

  if (dimensions.length > 0) {
    body.dimensions = dimensions.map((name) => ({ name }))
  }
  if (typeof limit === 'number') {
    body.limit = limit
  }
  if (dimensionFilter) {
    body.dimensionFilter = dimensionFilter
  }
  if (orderBys && orderBys.length > 0) {
    body.orderBys = orderBys
  }

  const metricBatches: string[][] = []
  for (let index = 0; index < metrics.length; index += MAX_GA4_METRICS_PER_REQUEST) {
    metricBatches.push(metrics.slice(index, index + MAX_GA4_METRICS_PER_REQUEST))
  }

  const mergedRows = new Map<string, Record<string, string>>()
  const rowOrder: string[] = []

  for (const metricBatch of metricBatches) {
    body.metrics = metricBatch.map((name) => ({ name }))

    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GA4 runReport failed (${response.status}): ${errorText}`)
    }

    const payload = (await response.json()) as Ga4RunReportResponse
    const rows = payload.rows ?? []
    const dimensionHeaders = payload.dimensionHeaders ?? []
    const metricHeaders = payload.metricHeaders ?? []

    rows.forEach((row, rowIndex) => {
      const dimensionKey =
        dimensions.length === 0
          ? `__row_${rowIndex}`
          : dimensions
            .map((dimensionName) => {
              const dimIndex = dimensionHeaders.findIndex((header) => header.name === dimensionName)
              return dimIndex >= 0 ? row.dimensionValues?.[dimIndex]?.value ?? '' : ''
            })
            .join('__')

      if (!mergedRows.has(dimensionKey)) {
        mergedRows.set(dimensionKey, {})
        rowOrder.push(dimensionKey)
      }

      const target = mergedRows.get(dimensionKey) as Record<string, string>

      dimensionHeaders.forEach((header, index) => {
        target[header.name] = row.dimensionValues?.[index]?.value ?? ''
      })

      metricHeaders.forEach((header, index) => {
        target[header.name] = row.metricValues?.[index]?.value ?? ''
      })
    })
  }

  return rowOrder.map((key) => mergedRows.get(key) as Record<string, string>)
}

async function fetchRawReport(params: {
  startDate: string
  endDate: string
  dimensions: string[]
  metrics: string[]
  limit?: number
  dimensionFilter?: Record<string, unknown>
  orderBys?: Array<{ metric?: { metricName: string }; desc?: boolean }>
}) {
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) {
    throw new Error('Missing GA4_PROPERTY_ID environment variable')
  }

  const accessToken = await getGa4AccessToken()

  return runReport({
    accessToken,
    propertyId,
    startDate: params.startDate,
    endDate: params.endDate,
    dimensions: params.dimensions,
    metrics: params.metrics,
    limit: params.limit,
    dimensionFilter: params.dimensionFilter,
    orderBys: params.orderBys,
  })
}

export async function fetchOverviewReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: [],
    metrics: [
      'totalUsers',
      'sessions',
      'sessionsPerUser',
      'bounceRate',
      'engagementRate',
      'screenPageViews',
      'purchaseRevenue',
      'ecommercePurchases',
      'firstTimePurchasers',
      'averagePurchaseRevenue',
      'addToCarts',
      'purchaserConversionRate',
    ],
    limit: 1,
  })

  const row = rows[0]
  if (!row) return null

  const sessions = toInteger(row.sessions) ?? 0
  const addToCarts = toInteger(row.addToCarts) ?? 0
  const purchaserConversionRate = toNumber(row.purchaserConversionRate)
  const acr = sessions > 0 ? (addToCarts / sessions) * 100 : null

  return {
    total_users: toInteger(row.totalUsers) ?? 0,
    sessions,
    sessions_per_user: toNumber(row.sessionsPerUser) ?? 0,
    bounce_rate: toNumber(row.bounceRate) ?? 0,
    engagement_rate: toNumber(row.engagementRate) ?? 0,
    pageviews: toInteger(row.screenPageViews) ?? 0,
    purchase_revenue: toNumber(row.purchaseRevenue) ?? 0,
    ecommerce_purchases: toInteger(row.ecommercePurchases) ?? 0,
    first_time_purchasers: toInteger(row.firstTimePurchasers) ?? 0,
    average_order_value: toNumber(row.averagePurchaseRevenue) ?? 0,
    add_to_carts: addToCarts,
    purchaser_conversion_rate:
      purchaserConversionRate === null ? 0 : purchaserConversionRate * 100,
    acr: acr ?? 0,
  }
}

export async function fetchDevicesReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['deviceCategory'],
    metrics: ['sessions'],
    limit: 10,
  })

  return rows.map((row) => ({
    device_category: row.deviceCategory || '(not set)',
    sessions: toInteger(row.sessions),
  }))
}

export async function fetchChannelsReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['sessionDefaultChannelGroup'],
    metrics: ['sessions', 'purchaseRevenue'],
    limit: 10,
    orderBys: [{ metric: { metricName: 'purchaseRevenue' }, desc: true }],
  })

  return rows.map((row) => ({
    channel_group: row.sessionDefaultChannelGroup || '(not set)',
    sessions: toInteger(row.sessions),
    purchase_revenue: toNumber(row.purchaseRevenue),
  }))
}

export async function fetchSearchTermsReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['searchTerm'],
    metrics: ['sessions', 'screenPageViews', 'engagementRate'],
    limit: 10,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  })

  return rows.map((row) => ({
    search_term: row.searchTerm || '(not set)',
    sessions: toInteger(row.sessions),
    views: toInteger(row.screenPageViews),
    engagement_rate: toNumber(row.engagementRate),
  }))
}

export async function fetchTopPagesReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['pageTitle', 'pagePath'],
    metrics: ['screenPageViews', 'engagementRate'],
    limit: 10,
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
  })

  return rows.map((row) => ({
    page_title: row.pageTitle || '(untitled)',
    page_path: row.pagePath || '',
    views: toInteger(row.screenPageViews),
    engagement_rate: toNumber(row.engagementRate),
  }))
}

export async function fetchCategoriesReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['itemCategory'],
    metrics: ['sessions', 'addToCarts'],
    limit: 10,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  })

  return rows.map((row) => ({
    item_category: row.itemCategory || '(not set)',
    sessions: toInteger(row.sessions),
    add_to_carts: toInteger(row.addToCarts),
  }))
}

export async function fetchBrandsReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['itemBrand'],
    metrics: ['itemRevenue', 'sessions'],
    limit: 10,
    orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
  })

  return rows.map((row) => ({
    item_brand: row.itemBrand || '(not set)',
    item_revenue: toNumber(row.itemRevenue),
    sessions: toInteger(row.sessions),
  }))
}

export async function fetchItemsReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['itemName'],
    metrics: ['itemRevenue', 'sessions'],
    limit: 10,
    orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
  })

  return rows.map((row) => ({
    item_name: row.itemName || '(not set)',
    item_revenue: toNumber(row.itemRevenue),
    sessions: toInteger(row.sessions),
  }))
}

export async function fetchCouponsReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['orderCoupon'],
    metrics: ['purchaseRevenue', 'averagePurchaseRevenue', 'eventCount'],
    limit: 10,
    orderBys: [{ metric: { metricName: 'purchaseRevenue' }, desc: true }],
  })

  return rows.map((row) => ({
    order_coupon: row.orderCoupon || '(not set)',
    purchase_revenue: toNumber(row.purchaseRevenue),
    avg_purchase_revenue: toNumber(row.averagePurchaseRevenue),
    event_count: toInteger(row.eventCount),
  }))
}

export async function fetchItemsViewedReport(startDate: string, endDate: string) {
  const rows = await fetchRawReport({
    startDate,
    endDate,
    dimensions: ['pagePath'],
    metrics: ['itemsViewed', 'addToCarts', 'sessions'],
    limit: 10,
    orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }],
  })

  return rows.map((row) => ({
    page_path: row.pagePath || '',
    items_viewed: toInteger(row.itemsViewed),
    add_to_carts: toInteger(row.addToCarts),
    sessions: toInteger(row.sessions),
  }))
}

export async function fetchAllSiteReports(startDate: string, endDate: string): Promise<SiteReports> {
  const reportEntries = [
    ['overview', () => fetchOverviewReport(startDate, endDate)],
    ['devices', () => fetchDevicesReport(startDate, endDate)],
    ['channels', () => fetchChannelsReport(startDate, endDate)],
    ['search_terms', () => fetchSearchTermsReport(startDate, endDate)],
    ['top_pages', () => fetchTopPagesReport(startDate, endDate)],
    ['categories', () => fetchCategoriesReport(startDate, endDate)],
    ['brands', () => fetchBrandsReport(startDate, endDate)],
    ['items', () => fetchItemsReport(startDate, endDate)],
    ['coupons', () => fetchCouponsReport(startDate, endDate)],
    ['items_viewed', () => fetchItemsViewedReport(startDate, endDate)],
  ] as const

  const settled = await Promise.allSettled(reportEntries.map((entry) => entry[1]()))

  const base: SiteReports = {
    overview: null,
    devices: null,
    channels: null,
    search_terms: null,
    top_pages: null,
    categories: null,
    brands: null,
    items: null,
    coupons: null,
    items_viewed: null,
  }

  reportEntries.forEach((entry, index) => {
    const key = entry[0]
    const result = settled[index]

    if (result.status === 'fulfilled') {
      ;(base as Record<string, unknown>)[key] = result.value
      return
    }

    console.warn(`GA4 report "${key}" failed:`, result.reason)
  })

  return base
}
