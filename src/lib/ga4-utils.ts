export interface ProfileOption {
  id: string
  full_name: string
}

export interface Ga4MetricRow {
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
  period_type?: 'current_week' | 'previous_week'
  period_start?: string
  period_end?: string
  category_label?: string | null
  producer_name?: string | null
}

export interface MetricsResponse {
  current_week: Ga4MetricRow[]
  previous_week: Ga4MetricRow[]
  last_refreshed: string | null
  ad_week: {
    week_number: number
    start_date: string
    end_date: string
    notes: string
  }
}

export interface DeltaBadge {
  text: string
  className: string
}

export interface CategoryAggregate {
  category: string
  pageviews: number
  sessions: number
  users: number
  purchases: number
  revenue: number
  wowViews: number | null
  pages: Ga4MetricRow[]
}

export interface ProducerAggregate {
  producerName: string
  pageviews: number
  sessions: number
  purchases: number
  revenue: number
  topCategories: Array<{ category: string; views: number }>
}

export interface PageHighlightRow extends Ga4MetricRow {
  views: number
  conversionRate: number | null
  wow: number | null
}

export interface PageHighlights {
  topPages: PageHighlightRow[]
  bottomPages: PageHighlightRow[]
}

export function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function sumMetric(rows: Ga4MetricRow[], key: keyof Ga4MetricRow) {
  return rows.reduce((acc, row) => {
    const raw = row[key]
    if (raw === null || raw === undefined) return acc
    return acc + toNumber(raw)
  }, 0)
}

export function averageMetric(rows: Ga4MetricRow[], key: keyof Ga4MetricRow) {
  let sum = 0
  let count = 0

  for (const row of rows) {
    const raw = row[key]
    if (raw === null || raw === undefined) continue

    const parsed = toNumber(raw)
    sum += parsed
    count += 1
  }

  return count === 0 ? null : sum / count
}

export function calculateConversionRate(rows: Ga4MetricRow[]) {
  const sessions = sumMetric(rows, 'sessions')
  const purchases = sumMetric(rows, 'ecommerce_purchases')

  if (sessions <= 0) return null
  return (purchases / sessions) * 100
}

export function calculateRevenue(rows: Ga4MetricRow[]) {
  return rows.reduce((acc, row) => {
    const revenue = row.purchase_revenue ?? row.item_revenue
    if (revenue === null || revenue === undefined) return acc
    return acc + toNumber(revenue)
  }, 0)
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`
}

export function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)

  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return `${startLabel} – ${endLabel}`
}

export function formatRelativeTime(isoTimestamp: string | null, nowMs: number) {
  if (!isoTimestamp) return 'Never'

  const timestamp = new Date(isoTimestamp).getTime()
  if (!Number.isFinite(timestamp)) return 'Unknown'

  const diffMs = Math.max(0, nowMs - timestamp)
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

export function pctChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null
  }

  return ((current - previous) / previous) * 100
}

export function pointsDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null
  return current - previous
}

export function buildDeltaBadge({
  change,
  suffix = '%',
  invertDirection = false,
}: {
  change: number | null
  suffix?: '%' | 'pts'
  invertDirection?: boolean
}): DeltaBadge {
  if (change === null || !Number.isFinite(change)) {
    return { text: '—', className: 'text-brand-500' }
  }

  if (Math.abs(change) < 0.001) {
    return { text: '—', className: 'text-brand-500' }
  }

  const isPositive = change > 0
  const isGood = invertDirection ? !isPositive : isPositive
  const arrow = isPositive ? '▲' : '▼'
  const tone = isGood ? 'text-emerald-400' : 'text-red-400'
  const absoluteValue = Math.abs(change)
  const sign = isPositive ? '+' : '-'

  if (suffix === 'pts') {
    return { text: `${arrow} ${sign}${absoluteValue.toFixed(1)} pts`, className: tone }
  }

  return { text: `${arrow} ${sign}${absoluteValue.toFixed(1)}%`, className: tone }
}

export function truncatePath(path: string, max = 42) {
  if (path.length <= max) return path
  return `${path.slice(0, max - 3)}...`
}

export function hasEcommerceData(rows: Ga4MetricRow[]) {
  return rows.some((row) => {
    const fields = [row.purchase_revenue, row.item_revenue, row.ecommerce_purchases, row.add_to_carts]
    return fields.some((value) => value !== null && value !== undefined && toNumber(value) > 0)
  })
}

export function aggregateCategories(currentRows: Ga4MetricRow[], previousRows: Ga4MetricRow[]) {
  const categoryMap = new Map<string, CategoryAggregate>()
  const previousViewsMap = new Map<string, number>()

  for (const row of previousRows) {
    const category = row.category_label || 'Unmapped'
    previousViewsMap.set(category, (previousViewsMap.get(category) ?? 0) + toNumber(row.screenpage_views ?? 0))
  }

  for (const row of currentRows) {
    const category = row.category_label || 'Unmapped'
    const existing =
      categoryMap.get(category) ??
      ({
        category,
        pageviews: 0,
        sessions: 0,
        users: 0,
        purchases: 0,
        revenue: 0,
        wowViews: null,
        pages: [],
      } as CategoryAggregate)

    existing.pageviews += toNumber(row.screenpage_views ?? 0)
    existing.sessions += toNumber(row.sessions ?? 0)
    existing.users += toNumber(row.active_users ?? 0)
    existing.purchases += toNumber(row.ecommerce_purchases ?? 0)
    existing.revenue += toNumber(row.purchase_revenue ?? row.item_revenue ?? 0)
    existing.pages.push(row)

    categoryMap.set(category, existing)
  }

  Array.from(categoryMap.values()).forEach((entry) => {
    const previousViews = previousViewsMap.get(entry.category) ?? 0
    entry.wowViews = pctChange(entry.pageviews, previousViews)
    entry.pages.sort((a, b) => toNumber(b.screenpage_views ?? 0) - toNumber(a.screenpage_views ?? 0))
  })

  return Array.from(categoryMap.values()).sort((a, b) => b.pageviews - a.pageviews)
}

export function aggregateProducers(rows: Ga4MetricRow[]) {
  const producerMap = new Map<
    string,
    {
      pageviews: number
      sessions: number
      purchases: number
      revenue: number
      categoryViews: Map<string, number>
    }
  >()

  for (const row of rows) {
    const producerName = row.producer_name || 'Unassigned'
    const category = row.category_label || 'Unmapped'
    const existing =
      producerMap.get(producerName) ?? {
        pageviews: 0,
        sessions: 0,
        purchases: 0,
        revenue: 0,
        categoryViews: new Map<string, number>(),
      }

    const views = toNumber(row.screenpage_views ?? 0)
    existing.pageviews += views
    existing.sessions += toNumber(row.sessions ?? 0)
    existing.purchases += toNumber(row.ecommerce_purchases ?? 0)
    existing.revenue += toNumber(row.purchase_revenue ?? row.item_revenue ?? 0)
    existing.categoryViews.set(category, (existing.categoryViews.get(category) ?? 0) + views)

    producerMap.set(producerName, existing)
  }

  const results: ProducerAggregate[] = []

  Array.from(producerMap.entries()).forEach(([producerName, stats]) => {
    const topCategories = Array.from(stats.categoryViews.entries())
      .map(([category, views]) => ({ category, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 3)

    results.push({
      producerName,
      pageviews: stats.pageviews,
      sessions: stats.sessions,
      purchases: stats.purchases,
      revenue: stats.revenue,
      topCategories,
    })
  })

  return results.sort((a, b) => b.pageviews - a.pageviews)
}

export function buildPageHighlights(currentRows: Ga4MetricRow[], previousRows: Ga4MetricRow[]): PageHighlights {
  const previousViews = new Map<string, number>()

  for (const row of previousRows) {
    previousViews.set(row.page_path, (previousViews.get(row.page_path) ?? 0) + toNumber(row.screenpage_views ?? 0))
  }

  const sortedByViewsDesc = [...currentRows].sort(
    (a, b) => toNumber(b.screenpage_views ?? 0) - toNumber(a.screenpage_views ?? 0)
  )

  const withHighlightData: PageHighlightRow[] = sortedByViewsDesc.map((row) => {
    const views = toNumber(row.screenpage_views ?? 0)
    const sessions = toNumber(row.sessions ?? 0)
    const purchases = toNumber(row.ecommerce_purchases ?? 0)
    const conversionRate = sessions > 0 ? (purchases / sessions) * 100 : null

    return {
      ...row,
      views,
      conversionRate,
      wow: pctChange(views, previousViews.get(row.page_path) ?? 0),
    }
  })

  return {
    topPages: withHighlightData.slice(0, 10),
    bottomPages: [...withHighlightData]
      .filter((row) => row.views >= 10)
      .sort((a, b) => a.views - b.views)
      .slice(0, 10),
  }
}
