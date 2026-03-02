import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type MetricsType = 'summary' | 'queries' | 'pages'
type SortKey = 'clicks' | 'impressions' | 'ctr' | 'position'
type SortOrder = 'asc' | 'desc'
type DeviceFilter = 'DESKTOP' | 'MOBILE' | 'TABLET'

interface GscQueryPerformanceRow {
  date: string
  query: string
  page: string
  device: string
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}

interface GscPagePerformanceRow {
  date: string
  page: string
  device: string
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}

interface AggregatedMetric {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface AggregationBucket {
  key: string
  clicks: number
  impressions: number
  weightedPositionSum: number
  positionSamples: number
}

const DEFAULT_DAYS = 7
const MAX_DAYS = 90
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

function toIsoDateUtc(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDateRange(days: number) {
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() - 1)

  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))

  const previousEnd = new Date(start)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)

  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1))

  return {
    current: {
      startDate: toIsoDateUtc(start),
      endDate: toIsoDateUtc(end),
    },
    previous: {
      startDate: toIsoDateUtc(previousStart),
      endDate: toIsoDateUtc(previousEnd),
    },
  }
}

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
  if (value === 'queries' || value === 'pages' || value === 'summary') {
    return value
  }
  return 'summary'
}

function parseSort(value: string | null): SortKey {
  if (value === 'clicks' || value === 'impressions' || value === 'ctr' || value === 'position') {
    return value
  }
  return 'clicks'
}

function parseOrder(value: string | null): SortOrder {
  if (value === 'asc' || value === 'desc') {
    return value
  }
  return 'desc'
}

function parseDevice(value: string | null): DeviceFilter | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (normalized === 'DESKTOP' || normalized === 'MOBILE' || normalized === 'TABLET') {
    return normalized
  }
  return null
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

function normalizeAggregatedMetric(bucket: AggregationBucket): AggregatedMetric {
  const ctr = bucket.impressions > 0 ? (bucket.clicks / bucket.impressions) * 100 : 0
  const position =
    bucket.impressions > 0
      ? bucket.weightedPositionSum / bucket.impressions
      : bucket.positionSamples > 0
        ? bucket.weightedPositionSum / bucket.positionSamples
        : 0

  return {
    clicks: bucket.clicks,
    impressions: bucket.impressions,
    ctr,
    position,
  }
}

function emptyBucket(key: string): AggregationBucket {
  return {
    key,
    clicks: 0,
    impressions: 0,
    weightedPositionSum: 0,
    positionSamples: 0,
  }
}

function aggregateByKey<T extends { clicks: number | null; impressions: number | null; position: number | null }>(
  rows: T[],
  keySelector: (row: T) => string
) {
  const map = new Map<string, AggregationBucket>()

  for (const row of rows) {
    const key = keySelector(row).trim() || '(not set)'
    const bucket = map.get(key) ?? emptyBucket(key)

    const clicks = toNumber(row.clicks)
    const impressions = toNumber(row.impressions)
    const position = toNumber(row.position)

    bucket.clicks += clicks
    bucket.impressions += impressions

    if (impressions > 0) {
      bucket.weightedPositionSum += position * impressions
      bucket.positionSamples += impressions
    } else if (position > 0) {
      bucket.weightedPositionSum += position
      bucket.positionSamples += 1
    }

    map.set(key, bucket)
  }

  return map
}

function summarizeRows<T extends { clicks: number | null; impressions: number | null; position: number | null }>(
  rows: T[]
): AggregatedMetric {
  const bucket = emptyBucket('summary')

  for (const row of rows) {
    const clicks = toNumber(row.clicks)
    const impressions = toNumber(row.impressions)
    const position = toNumber(row.position)

    bucket.clicks += clicks
    bucket.impressions += impressions

    if (impressions > 0) {
      bucket.weightedPositionSum += position * impressions
      bucket.positionSamples += impressions
    } else if (position > 0) {
      bucket.weightedPositionSum += position
      bucket.positionSamples += 1
    }
  }

  return normalizeAggregatedMetric(bucket)
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return null
  }

  return ((current - previous) / previous) * 100
}

function sortRows<T extends Record<string, string | number>>(
  rows: T[],
  sort: SortKey,
  order: SortOrder
) {
  const direction = order === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    const left = typeof a[sort] === 'number' ? (a[sort] as number) : 0
    const right = typeof b[sort] === 'number' ? (b[sort] as number) : 0

    if (left !== right) {
      return (left - right) * direction
    }

    const aLabel = typeof a.query === 'string' ? a.query : typeof a.page === 'string' ? a.page : ''
    const bLabel = typeof b.query === 'string' ? b.query : typeof b.page === 'string' ? b.page : ''
    return aLabel.localeCompare(bLabel)
  })
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
    const sort = parseSort(params.get('sort'))
    const order = parseOrder(params.get('order'))
    const device = parseDevice(params.get('device'))
    const queryFilter = params.get('query')?.trim() ?? ''
    const pageFilter = params.get('page')?.trim() ?? ''

    const range = buildDateRange(days)

    const [lastSyncResult] = await Promise.all([
      supabase
        .from('data_sync_log')
        .select('created_at')
        .eq('source', 'gsc')
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (lastSyncResult.error) {
      throw lastSyncResult.error
    }

    const lastSync = lastSyncResult.data?.created_at ?? null

    if (type === 'summary') {
      const currentPageQuery = supabase
        .from('gsc_page_performance')
        .select('clicks,impressions,position')
        .gte('date', range.current.startDate)
        .lte('date', range.current.endDate)

      const previousPageQuery = supabase
        .from('gsc_page_performance')
        .select('clicks,impressions,position')
        .gte('date', range.previous.startDate)
        .lte('date', range.previous.endDate)

      const currentQueryRowsQuery = supabase
        .from('gsc_query_performance')
        .select('query,clicks')
        .gte('date', range.current.startDate)
        .lte('date', range.current.endDate)

      const previousQueryRowsQuery = supabase
        .from('gsc_query_performance')
        .select('query,clicks')
        .gte('date', range.previous.startDate)
        .lte('date', range.previous.endDate)

      if (device) {
        currentPageQuery.eq('device', device)
        previousPageQuery.eq('device', device)
        currentQueryRowsQuery.eq('device', device)
        previousQueryRowsQuery.eq('device', device)
      }

      const [currentPageResult, previousPageResult, currentQueryResult, previousQueryResult] =
        await Promise.all([
          currentPageQuery,
          previousPageQuery,
          currentQueryRowsQuery,
          previousQueryRowsQuery,
        ])

      if (currentPageResult.error) throw currentPageResult.error
      if (previousPageResult.error) throw previousPageResult.error
      if (currentQueryResult.error) throw currentQueryResult.error
      if (previousQueryResult.error) throw previousQueryResult.error

      const currentMetric = summarizeRows((currentPageResult.data ?? []) as GscPagePerformanceRow[])
      const previousMetric = summarizeRows((previousPageResult.data ?? []) as GscPagePerformanceRow[])

      const currentQueryClicks = new Map<string, number>()
      for (const row of (currentQueryResult.data ?? []) as Array<{ query: string; clicks: number | null }>) {
        const key = row.query?.trim() || '(not set)'
        currentQueryClicks.set(key, (currentQueryClicks.get(key) ?? 0) + toNumber(row.clicks))
      }

      const previousQueryClicks = new Map<string, number>()
      for (const row of (previousQueryResult.data ?? []) as Array<{ query: string; clicks: number | null }>) {
        const key = row.query?.trim() || '(not set)'
        previousQueryClicks.set(key, (previousQueryClicks.get(key) ?? 0) + toNumber(row.clicks))
      }

      const topGainingQueries = Array.from(currentQueryClicks.entries())
        .map(([query, clicks]) => {
          const previousClicks = previousQueryClicks.get(query) ?? 0
          return {
            query,
            clicks,
            previous_clicks: previousClicks,
            click_change: clicks - previousClicks,
          }
        })
        .filter((row) => row.click_change > 0)
        .sort((a, b) => b.click_change - a.click_change)
        .slice(0, 5)

      return NextResponse.json({
        type: 'summary',
        days,
        device,
        date_range: range.current,
        previous_date_range: range.previous,
        current: currentMetric,
        previous: previousMetric,
        changes: {
          clicks: percentChange(currentMetric.clicks, previousMetric.clicks),
          impressions: percentChange(currentMetric.impressions, previousMetric.impressions),
          ctr: percentChange(currentMetric.ctr, previousMetric.ctr),
          position: percentChange(currentMetric.position, previousMetric.position),
        },
        top_gaining_queries: topGainingQueries,
        last_sync: lastSync,
      })
    }

    if (type === 'queries') {
      let queryBuilder = supabase
        .from('gsc_query_performance')
        .select('query,page,device,clicks,impressions,position')
        .gte('date', range.current.startDate)
        .lte('date', range.current.endDate)

      if (device) {
        queryBuilder = queryBuilder.eq('device', device)
      }

      if (queryFilter) {
        queryBuilder = queryBuilder.ilike('query', `%${queryFilter}%`)
      }

      if (pageFilter) {
        queryBuilder = queryBuilder.ilike('page', `%${pageFilter}%`)
      }

      const result = await queryBuilder
      if (result.error) {
        throw result.error
      }

      const grouped = aggregateByKey(
        (result.data ?? []) as GscQueryPerformanceRow[],
        (row) => row.query
      )

      const normalizedRows = Array.from(grouped.values()).map((bucket) => ({
        query: bucket.key,
        ...normalizeAggregatedMetric(bucket),
      }))

      const sorted = sortRows(normalizedRows, sort, order)
      const total = sorted.length
      const totalPages = Math.max(1, Math.ceil(total / limit))
      const startIndex = (pageNumber - 1) * limit
      const pagedRows = sorted.slice(startIndex, startIndex + limit)

      return NextResponse.json({
        type: 'queries',
        days,
        sort,
        order,
        page: pageNumber,
        limit,
        total,
        total_pages: totalPages,
        date_range: range.current,
        last_sync: lastSync,
        rows: pagedRows,
      })
    }

    let pageBuilder = supabase
      .from('gsc_page_performance')
      .select('page,device,clicks,impressions,position')
      .gte('date', range.current.startDate)
      .lte('date', range.current.endDate)

    if (device) {
      pageBuilder = pageBuilder.eq('device', device)
    }

    if (pageFilter) {
      pageBuilder = pageBuilder.ilike('page', `%${pageFilter}%`)
    }

    const pageResult = await pageBuilder
    if (pageResult.error) {
      throw pageResult.error
    }

    const groupedPages = aggregateByKey(
      (pageResult.data ?? []) as GscPagePerformanceRow[],
      (row) => row.page
    )

    const normalizedPages = Array.from(groupedPages.values()).map((bucket) => ({
      page: bucket.key,
      ...normalizeAggregatedMetric(bucket),
    }))

    const sortedPages = sortRows(normalizedPages, sort, order)
    const totalPagesRows = sortedPages.length
    const totalPages = Math.max(1, Math.ceil(totalPagesRows / limit))
    const startIndex = (pageNumber - 1) * limit
    const pagedRows = sortedPages.slice(startIndex, startIndex + limit)

    return NextResponse.json({
      type: 'pages',
      days,
      sort,
      order,
      page: pageNumber,
      limit,
      total: totalPagesRows,
      total_pages: totalPages,
      date_range: range.current,
      last_sync: lastSync,
      rows: pagedRows,
    })
  } catch (error) {
    console.error('Failed to load GSC metrics', error)
    const message = error instanceof Error ? error.message : 'Unable to load search performance data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
