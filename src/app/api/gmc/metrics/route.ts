import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type MetricsType = 'summary' | 'performance' | 'status' | 'pricing'
type SortOrder = 'asc' | 'desc'
type MarketingMethod = 'ADS' | 'ORGANIC'
type StatusFilter = 'ELIGIBLE' | 'NOT_ELIGIBLE_OR_DISAPPROVED'

interface GmcPerformanceRow {
  date: string
  offer_id: string
  title: string | null
  brand: string | null
  category_l1: string | null
  marketing_method: string | null
  clicks: number | null
  impressions: number | null
  ctr: number | null
}

interface GmcStatusRow {
  offer_id: string
  title: string | null
  brand: string | null
  status: string | null
  feed_label: string | null
  item_issues: unknown
}

interface GmcPricingRow {
  offer_id: string
  title: string | null
  brand: string | null
  current_price: number | null
  suggested_price: number | null
  currency: string | null
  predicted_impressions_change_fraction: number | null
  predicted_clicks_change_fraction: number | null
  predicted_conversions_change_fraction: number | null
  [key: string]: unknown
}

const DEFAULT_DAYS = 7
const MAX_DAYS = 90
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500
const GMC_SYNC_SOURCES = ['gmc_performance', 'gmc_product_status', 'gmc_price_insights'] as const

function parseInteger(
  value: string | null,
  { fallback, min, max }: { fallback: number; min: number; max: number }
) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function parseType(value: string | null): MetricsType {
  if (value === 'performance' || value === 'status' || value === 'pricing' || value === 'summary') {
    return value
  }
  return 'summary'
}

function parseSortOrder(value: string | null): SortOrder {
  if (value === 'asc' || value === 'desc') {
    return value
  }
  return 'desc'
}

function parseMarketingMethod(value: string | null): MarketingMethod | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (normalized === 'ADS' || normalized === 'ORGANIC') {
    return normalized
  }
  return null
}

function parseStatusFilter(value: string | null): StatusFilter | null {
  if (!value) return null
  if (value === 'ELIGIBLE' || value === 'NOT_ELIGIBLE_OR_DISAPPROVED') {
    return value
  }
  return null
}

function toIsoDateUtc(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDateRange(days: number) {
  const endDate = new Date()
  endDate.setUTCHours(0, 0, 0, 0)
  endDate.setUTCDate(endDate.getUTCDate() - 1)

  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1))

  return {
    startDate: toIsoDateUtc(startDate),
    endDate: toIsoDateUtc(endDate),
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 0
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isNotEligibleOrDisapproved(status: string | null): boolean {
  if (!status) return false
  const normalized = status.toUpperCase()
  return normalized.includes('NOT_ELIGIBLE') || normalized.includes('DISAPPROVED')
}

function isEligibleStatus(status: string | null): boolean {
  if (!status) return false
  const normalized = status.toUpperCase()
  return normalized.includes('ELIGIBLE') && !isNotEligibleOrDisapproved(status)
}

function sortByStringOrNumber<T extends Record<string, unknown>>(
  rows: T[],
  sortKey: string,
  order: SortOrder
) {
  const direction = order === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    const left = a[sortKey]
    const right = b[sortKey]

    if (typeof left === 'number' && typeof right === 'number') {
      if (left !== right) return (left - right) * direction
    } else {
      const leftText = toStringOrEmpty(left)
      const rightText = toStringOrEmpty(right)
      const compared = leftText.localeCompare(rightText)
      if (compared !== 0) return compared * direction
    }

    return toStringOrEmpty(a.offer_id).localeCompare(toStringOrEmpty(b.offer_id))
  })
}

function paginateRows<T>(rows: T[], page: number, limit: number) {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit
  const pagedRows = rows.slice(start, start + limit)

  return {
    rows: pagedRows,
    total,
    total_pages: totalPages,
    page,
    limit,
  }
}

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const params = request.nextUrl.searchParams
    const type = parseType(params.get('type'))
    const days = parseInteger(params.get('days'), { fallback: DEFAULT_DAYS, min: 1, max: MAX_DAYS })
    const limit = parseInteger(params.get('limit'), { fallback: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT })
    const pageNumber = parseInteger(params.get('pageNumber'), { fallback: 1, min: 1, max: 10_000 })
    const order = parseSortOrder(params.get('order'))
    const marketingMethod = parseMarketingMethod(params.get('marketing_method'))
    const statusFilter = parseStatusFilter(params.get('status_filter'))
    const offerIdFilter = params.get('offer_id')?.trim() ?? ''
    const requestedSort = params.get('sort')?.trim() ?? ''
    const dateRange = buildDateRange(days)

    const lastSyncResult = await supabase
      .from('data_sync_log')
      .select('created_at')
      .in('source', [...GMC_SYNC_SOURCES])
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastSyncResult.error) {
      throw lastSyncResult.error
    }

    const lastSync = lastSyncResult.data?.created_at ?? null

    if (type === 'summary') {
      const summaryRange = buildDateRange(7)

      const [statusResult, performanceResult, pricingResult] = await Promise.all([
        supabase
          .from('gmc_product_status')
          .select('offer_id,status'),
        supabase
          .from('gmc_product_performance')
          .select('clicks,impressions')
          .gte('date', summaryRange.startDate)
          .lte('date', summaryRange.endDate),
        supabase
          .from('gmc_price_insights')
          .select('*'),
      ])

      if (statusResult.error) throw statusResult.error
      if (performanceResult.error) throw performanceResult.error
      if (pricingResult.error) throw pricingResult.error

      const statusRows = (statusResult.data ?? []) as Array<{ offer_id: string; status: string | null }>
      const performanceRows = (performanceResult.data ?? []) as Array<{ clicks: number | null; impressions: number | null }>
      const pricingRows = (pricingResult.data ?? []) as GmcPricingRow[]

      const totalProducts = new Set(statusRows.map((row) => row.offer_id)).size
      const eligibleCount = statusRows.filter((row) => isEligibleStatus(row.status)).length
      const disapprovedCount = statusRows.filter((row) => isNotEligibleOrDisapproved(row.status)).length

      let totalClicks = 0
      let totalImpressions = 0
      for (const row of performanceRows) {
        totalClicks += Math.round(toNumber(row.clicks))
        totalImpressions += Math.round(toNumber(row.impressions))
      }

      const withPriceInsightsCount = pricingRows.length
      const highEffectivenessCount = pricingRows.filter((row) => {
        const effectRaw = row.effectiveness
        if (typeof effectRaw === 'string' && effectRaw.toUpperCase() === 'HIGH') {
          return true
        }
        return toNumber(row.predicted_clicks_change_fraction) >= 0.15
      }).length

      const topPriceOpportunities = [...pricingRows]
        .map((row) => ({
          offer_id: row.offer_id,
          title: row.title,
          current_price: row.current_price,
          suggested_price: row.suggested_price,
          currency: row.currency,
          predicted_clicks_change_fraction: toNumber(row.predicted_clicks_change_fraction),
        }))
        .filter((row) => row.predicted_clicks_change_fraction > 0)
        .sort((a, b) => b.predicted_clicks_change_fraction - a.predicted_clicks_change_fraction)
        .slice(0, 5)

      return NextResponse.json({
        type: 'summary',
        summary: {
          total_products: totalProducts,
          eligible_count: eligibleCount,
          disapproved_count: disapprovedCount,
          total_clicks_7d: totalClicks,
          total_impressions_7d: totalImpressions,
          products_with_price_insights: withPriceInsightsCount,
          high_effectiveness_suggestions: highEffectivenessCount,
        },
        top_price_opportunities: topPriceOpportunities,
        last_sync: lastSync,
      })
    }

    if (type === 'performance') {
      let query = supabase
        .from('gmc_product_performance')
        .select('date,offer_id,title,brand,category_l1,marketing_method,clicks,impressions,ctr')
        .gte('date', dateRange.startDate)
        .lte('date', dateRange.endDate)

      if (marketingMethod) {
        query = query.eq('marketing_method', marketingMethod)
      }

      if (offerIdFilter) {
        query = query.ilike('offer_id', `%${offerIdFilter}%`)
      }

      const result = await query
      if (result.error) throw result.error

      const grouped = new Map<
        string,
        {
          offer_id: string
          title: string | null
          brand: string | null
          category_l1: string | null
          clicks: number
          impressions: number
        }
      >()

      for (const row of (result.data ?? []) as GmcPerformanceRow[]) {
        const key = row.offer_id
        if (!key) continue

        const current = grouped.get(key) ?? {
          offer_id: key,
          title: row.title,
          brand: row.brand,
          category_l1: row.category_l1,
          clicks: 0,
          impressions: 0,
        }

        current.clicks += Math.round(toNumber(row.clicks))
        current.impressions += Math.round(toNumber(row.impressions))
        if (!current.title && row.title) current.title = row.title
        if (!current.brand && row.brand) current.brand = row.brand
        if (!current.category_l1 && row.category_l1) current.category_l1 = row.category_l1

        grouped.set(key, current)
      }

      const rows = Array.from(grouped.values()).map((row) => ({
        ...row,
        ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
      }))

      const totalClicks = rows.reduce((sum, row) => sum + row.clicks, 0)
      const totalImpressions = rows.reduce((sum, row) => sum + row.impressions, 0)
      const averageCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

      const allowedSortKeys = new Set(['offer_id', 'title', 'brand', 'category_l1', 'clicks', 'impressions', 'ctr'])
      const sortKey = allowedSortKeys.has(requestedSort) ? requestedSort : 'clicks'
      const sortedRows = sortByStringOrNumber(rows, sortKey, order)
      const paginated = paginateRows(sortedRows, pageNumber, limit)

      return NextResponse.json({
        type: 'performance',
        days,
        marketing_method: marketingMethod,
        sort: sortKey,
        order,
        date_range: dateRange,
        last_sync: lastSync,
        summary: {
          total_clicks: totalClicks,
          total_impressions: totalImpressions,
          average_ctr: averageCtr,
        },
        ...paginated,
      })
    }

    if (type === 'status') {
      let query = supabase
        .from('gmc_product_status')
        .select('offer_id,title,brand,status,feed_label,item_issues')

      if (offerIdFilter) {
        query = query.ilike('offer_id', `%${offerIdFilter}%`)
      }

      const result = await query
      if (result.error) throw result.error

      let rows = (result.data ?? []) as GmcStatusRow[]

      if (statusFilter === 'ELIGIBLE') {
        rows = rows.filter((row) => isEligibleStatus(row.status))
      }

      if (statusFilter === 'NOT_ELIGIBLE_OR_DISAPPROVED') {
        rows = rows.filter((row) => isNotEligibleOrDisapproved(row.status))
      }

      const mappedRows = rows.map((row) => {
        const issues = Array.isArray(row.item_issues) ? row.item_issues : []
        return {
          offer_id: row.offer_id,
          title: row.title,
          brand: row.brand,
          status: row.status,
          feed_label: row.feed_label,
          item_issues: issues,
          issue_count: issues.length,
        }
      })

      const allowedSortKeys = new Set(['offer_id', 'title', 'brand', 'status', 'feed_label', 'issue_count'])
      const sortKey = allowedSortKeys.has(requestedSort) ? requestedSort : 'offer_id'
      const sortedRows = sortByStringOrNumber(mappedRows, sortKey, order)
      const paginated = paginateRows(sortedRows, pageNumber, limit)

      const eligibleCount = mappedRows.filter((row) => isEligibleStatus(row.status)).length
      const disapprovedCount = mappedRows.filter((row) => isNotEligibleOrDisapproved(row.status)).length

      return NextResponse.json({
        type: 'status',
        status_filter: statusFilter,
        sort: sortKey,
        order,
        last_sync: lastSync,
        summary: {
          total_products: mappedRows.length,
          eligible_count: eligibleCount,
          disapproved_count: disapprovedCount,
        },
        ...paginated,
      })
    }

    let pricingQuery = supabase
      .from('gmc_price_insights')
      .select(
        'offer_id,title,brand,current_price,suggested_price,currency,predicted_impressions_change_fraction,predicted_clicks_change_fraction,predicted_conversions_change_fraction'
      )

    if (offerIdFilter) {
      pricingQuery = pricingQuery.ilike('offer_id', `%${offerIdFilter}%`)
    }

    const pricingResult = await pricingQuery
    if (pricingResult.error) throw pricingResult.error

    const pricingRows = (pricingResult.data ?? []) as GmcPricingRow[]
    const mappedRows = pricingRows.map((row) => ({
      offer_id: row.offer_id,
      title: row.title,
      brand: row.brand,
      current_price: row.current_price,
      suggested_price: row.suggested_price,
      price_diff:
        row.current_price !== null && row.suggested_price !== null
          ? row.suggested_price - row.current_price
          : null,
      currency: row.currency,
      predicted_impressions_change_fraction: toNumber(row.predicted_impressions_change_fraction),
      predicted_clicks_change_fraction: toNumber(row.predicted_clicks_change_fraction),
      predicted_conversions_change_fraction: toNumber(row.predicted_conversions_change_fraction),
    }))

    const allowedSortKeys = new Set([
      'offer_id',
      'title',
      'brand',
      'current_price',
      'suggested_price',
      'price_diff',
      'predicted_impressions_change_fraction',
      'predicted_clicks_change_fraction',
      'predicted_conversions_change_fraction',
    ])
    const sortKey = allowedSortKeys.has(requestedSort)
      ? requestedSort
      : 'predicted_clicks_change_fraction'
    const sortedRows = sortByStringOrNumber(mappedRows, sortKey, order)
    const paginated = paginateRows(sortedRows, pageNumber, limit)

    const withSuggestions = mappedRows.filter(
      (row) => row.suggested_price !== null || row.predicted_clicks_change_fraction !== 0
    )
    const averagePredictedClickIncrease =
      withSuggestions.length > 0
        ? withSuggestions.reduce((sum, row) => sum + row.predicted_clicks_change_fraction, 0) /
          withSuggestions.length
        : 0

    return NextResponse.json({
      type: 'pricing',
      sort: sortKey,
      order,
      last_sync: lastSync,
      summary: {
        products_with_suggestions: withSuggestions.length,
        average_predicted_click_increase_fraction: averagePredictedClickIncrease,
      },
      ...paginated,
    })
  } catch (error) {
    console.error('Failed to load GMC metrics', error)
    const message = error instanceof Error ? error.message : 'Unable to load product analytics data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
