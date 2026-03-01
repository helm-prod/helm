'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  aggregateCategories,
  averageMetric,
  formatCurrency,
  formatDateRange,
  formatInteger,
  formatPercent,
  formatRelativeTime,
  pctChange,
  toNumber,
  truncatePath,
  sumMetric,
} from '@/lib/ga4-utils'
import type { MetricsResponse, ProfileOption } from '@/lib/ga4-utils'

interface Props {
  profileId: string
  allProfiles: ProfileOption[]
  userRole?: string | null
}

type SortKey =
  | 'category'
  | 'pageviews'
  | 'sessions'
  | 'users'
  | 'addToCartRate'
  | 'bounceRate'
  | 'conversionRate'
  | 'revenue'
  | 'wowViews'

type SortDirection = 'asc' | 'desc'

type ReportBucket = {
  current?: unknown
  previous?: unknown
  last_year?: unknown
}

type SiteReportsApiResponse = {
  reports: Record<string, ReportBucket>
  ad_week_number: number | null
  period_start: string | null
  period_end: string | null
  last_refreshed: string | null
}

interface OverviewReport {
  total_users: number | null
  sessions: number | null
  sessions_per_user: number | null
  bounce_rate: number | null
  engagement_rate: number | null
  pageviews: number | null
  purchase_revenue: number | null
  ecommerce_purchases: number | null
  first_time_purchasers: number | null
  average_order_value: number | null
  add_to_carts: number | null
  purchaser_conversion_rate: number | null
  acr: number | null
}

interface DeviceReportRow {
  device_category: string
  sessions: number | null
}

interface ChannelReportRow {
  channel_group: string
  sessions: number | null
  purchase_revenue: number | null
}

interface SearchTermReportRow {
  search_term: string
  sessions: number | null
  views: number | null
  engagement_rate: number | null
}

interface TopPageReportRow {
  page_title: string
  page_path: string
  views: number | null
  engagement_rate: number | null
}

interface CategoryReportRow {
  item_category: string
  sessions: number | null
  add_to_carts: number | null
}

interface BrandReportRow {
  item_brand: string
  item_revenue: number | null
  sessions: number | null
}

interface ItemReportRow {
  item_name: string
  item_revenue: number | null
  sessions: number | null
}

interface CouponReportRow {
  order_coupon: string
  purchase_revenue: number | null
  avg_purchase_revenue: number | null
  event_count: number | null
}

interface ItemsViewedReportRow {
  page_path: string
  items_viewed: number | null
  add_to_carts: number | null
  sessions: number | null
}

interface CategoryTableRow {
  category: string
  pageviews: number
  sessions: number
  users: number
  revenue: number
  wowViews: number | null
  pages: MetricsResponse['current_week']
  addToCarts: number
  addToCartRate: number | null
  bounceRate: number | null
  conversionRate: number | null
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString('en-US')
}

function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeRate(raw: number | null): number | null {
  if (raw === null) return null
  return raw <= 1 ? raw * 100 : raw
}

function parseOverview(value: unknown): OverviewReport | null {
  const record = asRecord(value)
  if (!record) return null

  const purchaserConversionRate = normalizeRate(asNumber(record.purchaser_conversion_rate))

  return {
    total_users: asNumber(record.total_users),
    sessions: asNumber(record.sessions),
    sessions_per_user: asNumber(record.sessions_per_user),
    bounce_rate: normalizeRate(asNumber(record.bounce_rate)),
    engagement_rate: normalizeRate(asNumber(record.engagement_rate)),
    pageviews: asNumber(record.pageviews),
    purchase_revenue: asNumber(record.purchase_revenue),
    ecommerce_purchases: asNumber(record.ecommerce_purchases),
    first_time_purchasers: asNumber(record.first_time_purchasers),
    average_order_value: asNumber(record.average_order_value),
    add_to_carts: asNumber(record.add_to_carts),
    purchaser_conversion_rate: purchaserConversionRate,
    acr: asNumber(record.acr),
  }
}

function parseDevices(value: unknown): DeviceReportRow[] {
  return asRecordArray(value).map((row) => ({
    device_category: asString(row.device_category, '(not set)'),
    sessions: asNumber(row.sessions),
  }))
}

function parseChannels(value: unknown): ChannelReportRow[] {
  return asRecordArray(value).map((row) => ({
    channel_group: asString(row.channel_group, '(not set)'),
    sessions: asNumber(row.sessions),
    purchase_revenue: asNumber(row.purchase_revenue),
  }))
}

function parseSearchTerms(value: unknown): SearchTermReportRow[] {
  return asRecordArray(value).map((row) => ({
    search_term: asString(row.search_term, '(not set)'),
    sessions: asNumber(row.sessions),
    views: asNumber(row.views),
    engagement_rate: normalizeRate(asNumber(row.engagement_rate)),
  }))
}

function parseTopPages(value: unknown): TopPageReportRow[] {
  return asRecordArray(value).map((row) => ({
    page_title: asString(row.page_title, '(untitled)'),
    page_path: asString(row.page_path, ''),
    views: asNumber(row.views),
    engagement_rate: normalizeRate(asNumber(row.engagement_rate)),
  }))
}

function parseCategories(value: unknown): CategoryReportRow[] {
  return asRecordArray(value).map((row) => ({
    item_category: asString(row.item_category, '(not set)'),
    sessions: asNumber(row.sessions),
    add_to_carts: asNumber(row.add_to_carts),
  }))
}

function parseBrands(value: unknown): BrandReportRow[] {
  return asRecordArray(value).map((row) => ({
    item_brand: asString(row.item_brand, '(not set)'),
    item_revenue: asNumber(row.item_revenue),
    sessions: asNumber(row.sessions),
  }))
}

function parseItems(value: unknown): ItemReportRow[] {
  return asRecordArray(value).map((row) => ({
    item_name: asString(row.item_name, '(not set)'),
    item_revenue: asNumber(row.item_revenue),
    sessions: asNumber(row.sessions),
  }))
}

function parseCoupons(value: unknown): CouponReportRow[] {
  return asRecordArray(value).map((row) => ({
    order_coupon: asString(row.order_coupon, '(not set)'),
    purchase_revenue: asNumber(row.purchase_revenue),
    avg_purchase_revenue: asNumber(row.avg_purchase_revenue),
    event_count: asNumber(row.event_count),
  }))
}

function parseItemsViewed(value: unknown): ItemsViewedReportRow[] {
  return asRecordArray(value).map((row) => ({
    page_path: asString(row.page_path, ''),
    items_viewed: asNumber(row.items_viewed),
    add_to_carts: asNumber(row.add_to_carts),
    sessions: asNumber(row.sessions),
  }))
}

function compareNullableNumber(a: number | null, b: number | null) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

function atcRateTone(rate: number | null) {
  if (rate === null) return 'text-brand-500'
  if (rate > 5) return 'text-emerald-400'
  if (rate > 2) return 'text-amber-400'
  return 'text-red-400'
}

function bounceRateTone(rate: number | null) {
  if (rate === null) return 'text-brand-500'
  if (rate < 40) return 'text-emerald-400'
  if (rate < 60) return 'text-amber-400'
  return 'text-red-400'
}

function sortIndicator(sortKey: SortKey, activeKey: SortKey, direction: SortDirection) {
  if (sortKey !== activeKey) return ''
  return direction === 'asc' ? ' ▲' : ' ▼'
}

function DeltaLine({
  label,
  change,
  invertDirection,
  suffix,
}: {
  label: string
  change: number | null
  invertDirection: boolean
  suffix: '%' | 'pts'
}) {
  if (change === null || !Number.isFinite(change)) {
    return <p className="text-brand-500">— {label}</p>
  }

  const isPositive = change > 0
  const isGood = invertDirection ? !isPositive : isPositive
  const arrow = isPositive ? '▲' : '▼'
  const sign = isPositive ? '+' : '-'
  const tone = isGood ? 'text-emerald-400' : 'text-red-400'
  const suffixText = suffix === 'pts' ? ' pts' : '%'

  return (
    <p className={tone}>
      {arrow} {sign}
      {Math.abs(change).toFixed(1)}
      {suffixText} {label}
    </p>
  )
}

function DualDeltaBadge({
  currentValue,
  previousValue,
  lastYearValue,
  invertDirection = false,
  suffix = '%',
}: {
  currentValue: number | null
  previousValue: number | null
  lastYearValue: number | null
  invertDirection?: boolean
  suffix?: '%' | 'pts'
}) {
  const lyDelta =
    currentValue === null || lastYearValue === null ? null : pctChange(currentValue, lastYearValue)
  const previousDelta =
    currentValue === null || previousValue === null ? null : pctChange(currentValue, previousValue)

  return (
    <div className="mt-3 space-y-1 text-xs font-medium">
      <DeltaLine label="LY" change={lyDelta} invertDirection={invertDirection} suffix={suffix} />
      <DeltaLine
        label="Previous Period"
        change={previousDelta}
        invertDirection={invertDirection}
        suffix={suffix}
      />
    </div>
  )
}

function KpiCard({
  label,
  value,
  current,
  previous,
  lastYear,
  invertDirection,
  dimmed,
  pending,
}: {
  label: string
  value: string
  current: number | null
  previous: number | null
  lastYear: number | null
  invertDirection?: boolean
  dimmed?: boolean
  pending?: boolean
}) {
  return (
    <div className={`rounded-2xl border border-[#1a3a4a] bg-brand-900 p-4 ${dimmed ? 'opacity-75' : ''}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-[#4a9ead]">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      {pending ? (
        <p className="mt-3 text-xs font-medium text-brand-500">TBD</p>
      ) : (
        <DualDeltaBadge
          currentValue={current}
          previousValue={previous}
          lastYearValue={lastYear}
          invertDirection={Boolean(invertDirection)}
        />
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <section className="animate-pulse space-y-4 rounded-2xl border border-brand-800 bg-brand-900/40 p-5">
      <div className="h-10 rounded-lg bg-brand-800/60" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 rounded-xl bg-brand-800/50" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="h-72 rounded-xl bg-brand-800/45" />
        <div className="h-72 rounded-xl bg-brand-800/45" />
        <div className="h-72 rounded-xl bg-brand-800/45" />
      </div>
    </section>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-brand-800 bg-brand-900 p-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#4a9ead]">{title}</h3>
      {children}
    </section>
  )
}

function NoData() {
  return <p className="text-sm text-brand-500">No data available</p>
}

function DevicesDonut({ data }: { data: DeviceReportRow[] }) {
  const total = data.reduce((sum, row) => sum + (row.sessions ?? 0), 0)

  if (total <= 0 || data.length === 0) {
    return <NoData />
  }

  const colorMap: Record<string, string> = {
    mobile: '#eab308',
    desktop: '#1e3a5f',
    tablet: '#3b82f6',
    'smart tv': '#6b7280',
    other: '#8b5cf6',
  }

  let cumulative = 0
  const segments = data.map((row) => {
    const categoryKey = row.device_category.toLowerCase()
    const color = colorMap[categoryKey] ?? colorMap.other
    const percentage = ((row.sessions ?? 0) / total) * 100
    const start = cumulative
    cumulative += percentage

    return {
      ...row,
      color,
      percentage,
      gradientStop: `${color} ${start}% ${cumulative}%`,
    }
  })

  const gradient = `conic-gradient(${segments.map((segment) => segment.gradientStop).join(', ')})`

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr] md:items-center">
      <div className="relative mx-auto h-44 w-44 rounded-full" style={{ backgroundImage: gradient }}>
        <div className="absolute inset-8 rounded-full bg-brand-900" />
      </div>
      <div className="space-y-2 text-sm">
        {segments.map((segment) => (
          <div key={segment.device_category} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-brand-200">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="capitalize">{segment.device_category}</span>
            </div>
            <span className="text-white">{segment.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PerformanceDashboard({ profileId, allProfiles }: Props) {
  const [siteReports, setSiteReports] = useState<SiteReportsApiResponse | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState<string | null>(null)

  const [aorDataByProfile, setAorDataByProfile] = useState<Record<string, MetricsResponse>>({})
  const [aorLoading, setAorLoading] = useState(false)
  const [aorError, setAorError] = useState<string | null>(null)

  const [refreshing, setRefreshing] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())

  const [sortKey, setSortKey] = useState<SortKey>('pageviews')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const producerOptions = useMemo(
    () => allProfiles.filter((profile) => !profile.full_name.toLowerCase().includes('ashton')),
    [allProfiles]
  )

  const [selectedProducerId, setSelectedProducerId] = useState<string>(profileId)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (producerOptions.length === 0) {
      setSelectedProducerId('')
      return
    }

    const hasSelected = producerOptions.some((profile) => profile.id === selectedProducerId)
    if (hasSelected) return

    const hasCurrentUser = producerOptions.some((profile) => profile.id === profileId)
    if (hasCurrentUser) {
      setSelectedProducerId(profileId)
      return
    }

    setSelectedProducerId(producerOptions[0].id)
  }, [producerOptions, selectedProducerId, profileId])

  const fetchMetrics = useCallback(async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? 'Unable to load analytics data.')
    }

    return (await response.json()) as MetricsResponse
  }, [])

  const loadSiteReports = useCallback(async () => {
    setSiteLoading(true)
    setSiteError(null)

    try {
      const response = await fetch('/api/ga4/site-reports', { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Unable to load site reports')
      }

      const payload = (await response.json()) as SiteReportsApiResponse
      setSiteReports(payload)
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : 'Unable to load site reports')
    } finally {
      setSiteLoading(false)
    }
  }, [])

  const loadAorData = useCallback(
    async (targetProfileId: string, force = false) => {
      if (!targetProfileId) return
      if (!force && aorDataByProfile[targetProfileId]) return

      setAorLoading(true)
      setAorError(null)

      try {
        const data = await fetchMetrics(
          `/api/ga4/metrics?scope=aor&profile_id=${encodeURIComponent(targetProfileId)}`
        )
        setAorDataByProfile((prev) => ({ ...prev, [targetProfileId]: data }))
      } catch (error) {
        setAorError(error instanceof Error ? error.message : 'Unable to load producer AOR data.')
      } finally {
        setAorLoading(false)
      }
    },
    [aorDataByProfile, fetchMetrics]
  )

  useEffect(() => {
    void loadSiteReports()
  }, [loadSiteReports])

  useEffect(() => {
    if (!selectedProducerId) return
    void loadAorData(selectedProducerId)
  }, [selectedProducerId, loadAorData])

  const disabledForCooldown = nowMs < cooldownUntil
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - nowMs) / 1000))

  const handleRefresh = useCallback(async () => {
    if (refreshing || disabledForCooldown) return

    setRefreshing(true)
    setCooldownUntil(Date.now() + 60_000)

    try {
      const response = await fetch('/api/ga4/site-reports', { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Refresh failed')
      }

      await loadSiteReports()
      if (selectedProducerId) {
        await loadAorData(selectedProducerId, true)
      }
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }, [disabledForCooldown, loadAorData, loadSiteReports, refreshing, selectedProducerId])

  const getBucket = useCallback(
    (reportType: string): ReportBucket => {
      if (!siteReports) return {}
      return siteReports.reports[reportType] ?? {}
    },
    [siteReports]
  )

  const overviewCurrent = useMemo(() => parseOverview(getBucket('overview').current), [getBucket])
  const overviewPrevious = useMemo(() => parseOverview(getBucket('overview').previous), [getBucket])
  const overviewLastYear = useMemo(() => parseOverview(getBucket('overview').last_year), [getBucket])

  const devicesCurrent = useMemo(() => parseDevices(getBucket('devices').current), [getBucket])
  const channelsCurrent = useMemo(() => parseChannels(getBucket('channels').current), [getBucket])
  const searchTermsCurrent = useMemo(() => parseSearchTerms(getBucket('search_terms').current), [getBucket])
  const topPagesCurrent = useMemo(() => parseTopPages(getBucket('top_pages').current), [getBucket])
  const categoriesCurrent = useMemo(() => parseCategories(getBucket('categories').current), [getBucket])
  const couponsCurrent = useMemo(() => parseCoupons(getBucket('coupons').current), [getBucket])
  const brandsCurrent = useMemo(() => parseBrands(getBucket('brands').current), [getBucket])
  const itemsCurrent = useMemo(() => parseItems(getBucket('items').current), [getBucket])
  const itemsViewedCurrent = useMemo(
    () => parseItemsViewed(getBucket('items_viewed').current),
    [getBucket]
  )

  const activeAorData = selectedProducerId ? (aorDataByProfile[selectedProducerId] ?? null) : null

  const producerCategories = useMemo(() => {
    if (!activeAorData) return []

    const categories = aggregateCategories(activeAorData.current_week, activeAorData.previous_week)

    return categories.map((category): CategoryTableRow => {
      const categoryAddToCarts = sumMetric(category.pages, 'add_to_carts')
      const categoryBounceRate = averageMetric(category.pages, 'bounce_rate')
      const categoryConversionRate =
        category.sessions > 0 ? (category.purchases / category.sessions) * 100 : null
      const hasCategoryEcommerce = category.pages.some(
        (row) =>
          row.add_to_carts !== null ||
          row.ecommerce_purchases !== null ||
          row.purchase_revenue !== null ||
          row.item_revenue !== null
      )
      const categoryAtcRate =
        hasCategoryEcommerce && category.sessions > 0
          ? (categoryAddToCarts / category.sessions) * 100
          : null

      return {
        category: category.category,
        pageviews: category.pageviews,
        sessions: category.sessions,
        users: category.users,
        revenue: category.revenue,
        wowViews: category.wowViews,
        pages: category.pages,
        addToCarts: categoryAddToCarts,
        addToCartRate: categoryAtcRate,
        bounceRate: categoryBounceRate,
        conversionRate: categoryConversionRate,
      }
    })
  }, [activeAorData])

  const sortedCategories = useMemo(() => {
    const rows = [...producerCategories]

    rows.sort((a, b) => {
      switch (sortKey) {
        case 'category':
          return a.category.localeCompare(b.category)
        case 'pageviews':
          return a.pageviews - b.pageviews
        case 'sessions':
          return a.sessions - b.sessions
        case 'users':
          return a.users - b.users
        case 'addToCartRate':
          return compareNullableNumber(a.addToCartRate, b.addToCartRate)
        case 'bounceRate':
          return compareNullableNumber(a.bounceRate, b.bounceRate)
        case 'conversionRate':
          return compareNullableNumber(a.conversionRate, b.conversionRate)
        case 'revenue':
          return a.revenue - b.revenue
        case 'wowViews':
          return compareNullableNumber(a.wowViews, b.wowViews)
        default:
          return 0
      }
    })

    if (sortDirection === 'desc') {
      rows.reverse()
    }

    return rows
  }, [producerCategories, sortDirection, sortKey])

  const selectedProducerName =
    producerOptions.find((profile) => profile.id === selectedProducerId)?.full_name ?? 'Producer'

  function handleSort(column: SortKey) {
    setExpandedCategory(null)

    if (sortKey === column) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }

    setSortKey(column)
    setSortDirection(column === 'category' ? 'asc' : 'desc')
  }

  const hasSiteData = Boolean(siteReports && Object.keys(siteReports.reports ?? {}).length > 0)

  return (
    <section className="space-y-8">
      {siteLoading && !siteReports ? <LoadingSkeleton /> : null}

      {!siteLoading && siteError && !siteReports ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-sm text-red-300">Unable to load analytics data.</p>
          <button
            type="button"
            onClick={() => void loadSiteReports()}
            className="mt-3 rounded-lg border border-brand-700 px-3 py-1.5 text-sm text-white hover:bg-brand-800/60"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!siteLoading && !siteError && !hasSiteData ? (
        <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6 text-sm text-brand-400">
          No site data available. Click Refresh to pull latest analytics.
        </div>
      ) : null}

      {siteReports && hasSiteData ? (
        <>
          <div className="space-y-3 rounded-xl border border-[#1a3a4a] border-l-4 border-l-cyan-400 bg-[#0d2137] px-4 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                <span className="font-semibold text-white">
                  Ad Week {siteReports.ad_week_number ?? '--'}
                </span>
                {siteReports.period_start && siteReports.period_end ? (
                  <span className="ml-2 text-brand-300">
                    {formatDateRange(siteReports.period_start, siteReports.period_end)}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-brand-500">Powered by GA4</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing || disabledForCooldown}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-700 px-3 py-1.5 text-sm text-brand-200 transition-colors hover:bg-brand-800/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-brand-300 border-t-transparent" />
                ) : null}
                <span>↻ Refresh</span>
                {disabledForCooldown && !refreshing ? <span>({cooldownSeconds}s)</span> : null}
              </button>
              <p className="text-sm text-brand-500">
                Last updated {formatRelativeTime(siteReports.last_refreshed, nowMs)}
              </p>
            </div>
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Site Performance</h2>
              <p className="mt-1 text-sm text-brand-400">
                All pages · Ad Week {siteReports.ad_week_number ?? '--'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                label="Total Users"
                value={formatCompact(overviewCurrent?.total_users ?? 0)}
                current={overviewCurrent?.total_users ?? null}
                previous={overviewPrevious?.total_users ?? null}
                lastYear={overviewLastYear?.total_users ?? null}
              />
              <KpiCard
                label="Sessions"
                value={formatCompact(overviewCurrent?.sessions ?? 0)}
                current={overviewCurrent?.sessions ?? null}
                previous={overviewPrevious?.sessions ?? null}
                lastYear={overviewLastYear?.sessions ?? null}
              />
              <KpiCard
                label="Sessions per User"
                value={overviewCurrent?.sessions_per_user === null ? '—' : (overviewCurrent?.sessions_per_user ?? 0).toFixed(1)}
                current={overviewCurrent?.sessions_per_user ?? null}
                previous={overviewPrevious?.sessions_per_user ?? null}
                lastYear={overviewLastYear?.sessions_per_user ?? null}
              />
              <KpiCard
                label="Bounce Rate"
                value={overviewCurrent?.bounce_rate === null ? '—' : formatPercent(overviewCurrent?.bounce_rate ?? 0, 1)}
                current={overviewCurrent?.bounce_rate ?? null}
                previous={overviewPrevious?.bounce_rate ?? null}
                lastYear={overviewLastYear?.bounce_rate ?? null}
                invertDirection
              />
              <KpiCard
                label="PDP View Rate"
                value="—"
                current={null}
                previous={null}
                lastYear={null}
                dimmed
                pending
              />
              <KpiCard
                label="Add-to-Cart Rate"
                value={overviewCurrent?.acr === null ? '—' : formatPercent(overviewCurrent?.acr ?? 0, 2)}
                current={overviewCurrent?.acr ?? null}
                previous={overviewPrevious?.acr ?? null}
                lastYear={overviewLastYear?.acr ?? null}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Panel title="Devices Used">
                <DevicesDonut data={devicesCurrent} />
              </Panel>

              <Panel title="Top User Channels">
                {channelsCurrent.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                          <th className="px-2 py-2">Channel Group</th>
                          <th className="px-2 py-2">Sessions</th>
                          <th className="px-2 py-2">Purchase Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channelsCurrent.slice(0, 10).map((row) => (
                          <tr key={row.channel_group} className="border-b border-brand-800/50 hover:bg-[#0d2137]">
                            <td className="px-2 py-2 text-brand-200">{row.channel_group}</td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.sessions ?? 0)}</td>
                            <td className="px-2 py-2 text-white">{formatCurrency(row.purchase_revenue ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="Top 10 Searched Products">
                {searchTermsCurrent.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Search term</th>
                          <th className="px-2 py-2">Sessions</th>
                          <th className="px-2 py-2">Views</th>
                          <th className="px-2 py-2">Engagement rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchTermsCurrent.slice(0, 10).map((row, index) => (
                          <tr key={`${row.search_term}-${index}`} className="border-b border-brand-800/50 hover:bg-[#0d2137]">
                            <td className="px-2 py-2 text-brand-400">{index + 1}.</td>
                            <td className="px-2 py-2 text-brand-200">{row.search_term}</td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.sessions ?? 0)}</td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.views ?? 0)}</td>
                            <td className="px-2 py-2 text-white">
                              {row.engagement_rate === null ? '—' : formatPercent(row.engagement_rate, 2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Panel title="Top Viewed Pages">
                {topPagesCurrent.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Page title and screen class</th>
                          <th className="px-2 py-2">Page path</th>
                          <th className="px-2 py-2">Views</th>
                          <th className="px-2 py-2">Engagement rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPagesCurrent.slice(0, 10).map((row, index) => (
                          <tr key={`${row.page_path}-${index}`} className="border-b border-brand-800/50 hover:bg-[#0d2137]">
                            <td className="px-2 py-2 text-brand-400">{index + 1}.</td>
                            <td className="px-2 py-2 text-brand-200" title={row.page_title}>
                              {truncatePath(row.page_title, 60)}
                            </td>
                            <td className="px-2 py-2 text-brand-400" title={row.page_path}>
                              {truncatePath(row.page_path, 40)}
                            </td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.views ?? 0)}</td>
                            <td className="px-2 py-2 text-white">
                              {row.engagement_rate === null ? '—' : formatPercent(row.engagement_rate, 2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="Top 10 Viewed Categories">
                {categoriesCurrent.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Item category</th>
                          <th className="px-2 py-2">Sessions</th>
                          <th className="px-2 py-2">Items added to cart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoriesCurrent.slice(0, 10).map((row, index) => (
                          <tr key={`${row.item_category}-${index}`} className="border-b border-brand-800/50 hover:bg-[#0d2137]">
                            <td className="px-2 py-2 text-brand-400">{index + 1}.</td>
                            <td className="px-2 py-2 text-brand-200">{row.item_category}</td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.sessions ?? 0)}</td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.add_to_carts ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Revenue</h2>
              <p className="mt-1 text-sm text-brand-400">Ecommerce metrics · Ad Week {siteReports.ad_week_number ?? '--'}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                label="Total Revenue"
                value={formatCurrencyCompact(overviewCurrent?.purchase_revenue ?? 0)}
                current={overviewCurrent?.purchase_revenue ?? null}
                previous={overviewPrevious?.purchase_revenue ?? null}
                lastYear={overviewLastYear?.purchase_revenue ?? null}
              />
              <KpiCard
                label="Total Purchasers"
                value={formatCompact(overviewCurrent?.ecommerce_purchases ?? 0)}
                current={overviewCurrent?.ecommerce_purchases ?? null}
                previous={overviewPrevious?.ecommerce_purchases ?? null}
                lastYear={overviewLastYear?.ecommerce_purchases ?? null}
              />
              <KpiCard
                label="First Time Purchasers"
                value={formatCompact(overviewCurrent?.first_time_purchasers ?? 0)}
                current={overviewCurrent?.first_time_purchasers ?? null}
                previous={overviewPrevious?.first_time_purchasers ?? null}
                lastYear={overviewLastYear?.first_time_purchasers ?? null}
              />
              <KpiCard
                label="Purchase Conversion Rate"
                value={overviewCurrent?.purchaser_conversion_rate === null ? '—' : formatPercent(overviewCurrent?.purchaser_conversion_rate ?? 0, 2)}
                current={overviewCurrent?.purchaser_conversion_rate ?? null}
                previous={overviewPrevious?.purchaser_conversion_rate ?? null}
                lastYear={overviewLastYear?.purchaser_conversion_rate ?? null}
              />
              <KpiCard
                label="Add-to-Cart Rate"
                value={overviewCurrent?.acr === null ? '—' : formatPercent(overviewCurrent?.acr ?? 0, 2)}
                current={overviewCurrent?.acr ?? null}
                previous={overviewPrevious?.acr ?? null}
                lastYear={overviewLastYear?.acr ?? null}
              />
              <KpiCard
                label="Orders"
                value={formatCompact(overviewCurrent?.ecommerce_purchases ?? 0)}
                current={overviewCurrent?.ecommerce_purchases ?? null}
                previous={overviewPrevious?.ecommerce_purchases ?? null}
                lastYear={overviewLastYear?.ecommerce_purchases ?? null}
              />
            </div>

            <div className="grid grid-cols-1">
              <KpiCard
                label="Average Order Value"
                value={formatCurrency(overviewCurrent?.average_order_value ?? 0)}
                current={overviewCurrent?.average_order_value ?? null}
                previous={overviewPrevious?.average_order_value ?? null}
                lastYear={overviewLastYear?.average_order_value ?? null}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Panel title="Top Used Coupons">
                {couponsCurrent.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                          <th className="px-2 py-2">Order Coupon</th>
                          <th className="px-2 py-2">Purchase Revenue</th>
                          <th className="px-2 py-2">Avg Purchase Revenue</th>
                          <th className="px-2 py-2">Event Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {couponsCurrent.slice(0, 10).map((row, index) => (
                          <tr key={`${row.order_coupon}-${index}`} className="border-b border-brand-800/50 hover:bg-[#0d2137]">
                            <td className="px-2 py-2 text-brand-200">{row.order_coupon}</td>
                            <td className="px-2 py-2 text-white">{formatCurrency(row.purchase_revenue ?? 0)}</td>
                            <td className="px-2 py-2 text-white">{formatCurrency(row.avg_purchase_revenue ?? 0)}</td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.event_count ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="Top 10 Brands by Revenue">
                {brandsCurrent.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Item brand</th>
                          <th className="px-2 py-2">Item revenue</th>
                          <th className="px-2 py-2">Sessions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brandsCurrent.slice(0, 10).map((row, index) => (
                          <tr key={`${row.item_brand}-${index}`} className="border-b border-brand-800/50 hover:bg-[#0d2137]">
                            <td className="px-2 py-2 text-brand-400">{index + 1}.</td>
                            <td className="px-2 py-2 text-brand-200" title={row.item_brand}>
                              {truncatePath(row.item_brand, 36)}
                            </td>
                            <td className="px-2 py-2 text-white">{formatCurrency(row.item_revenue ?? 0)}</td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.sessions ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="Top 10 Items by Revenue">
                {itemsCurrent.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Item name</th>
                          <th className="px-2 py-2">Item revenue</th>
                          <th className="px-2 py-2">Sessions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsCurrent.slice(0, 10).map((row, index) => (
                          <tr key={`${row.item_name}-${index}`} className="border-b border-brand-800/50 hover:bg-[#0d2137]">
                            <td className="px-2 py-2 text-brand-400">{index + 1}.</td>
                            <td className="px-2 py-2 text-brand-200" title={row.item_name}>
                              {truncatePath(row.item_name, 44)}
                            </td>
                            <td className="px-2 py-2 text-white">{formatCurrency(row.item_revenue ?? 0)}</td>
                            <td className="px-2 py-2 text-white">{formatInteger(row.sessions ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="Top Pages by Items Viewed">
              {itemsViewedCurrent.length === 0 ? (
                <NoData />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                        <th className="px-2 py-2">#</th>
                        <th className="px-2 py-2">Page path</th>
                        <th className="px-2 py-2">Items viewed</th>
                        <th className="px-2 py-2">Items added to cart</th>
                        <th className="px-2 py-2">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsViewedCurrent.slice(0, 10).map((row, index) => (
                        <tr key={`${row.page_path}-${index}`} className="border-b border-brand-800/50 hover:bg-[#0d2137]">
                          <td className="px-2 py-2 text-brand-400">{index + 1}.</td>
                          <td className="px-2 py-2 text-brand-200" title={row.page_path}>
                            {truncatePath(row.page_path, 70)}
                          </td>
                          <td className="px-2 py-2 text-white">{formatInteger(row.items_viewed ?? 0)}</td>
                          <td className="px-2 py-2 text-white">{formatInteger(row.add_to_carts ?? 0)}</td>
                          <td className="px-2 py-2 text-white">{formatInteger(row.sessions ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </section>

          <section className="space-y-4 rounded-2xl border border-brand-800 bg-brand-900 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold text-white">Category Performance by Producer</h3>
              <div className="flex items-center gap-2">
                <label htmlFor="performance-producer" className="text-xs uppercase tracking-wide text-brand-400">
                  Producer
                </label>
                <select
                  id="performance-producer"
                  value={selectedProducerId}
                  onChange={(event) => {
                    setSelectedProducerId(event.target.value)
                    setExpandedCategory(null)
                  }}
                  className="rounded-lg border border-brand-700 bg-brand-950 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {producerOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs text-brand-500">Showing AOR breakdown for {selectedProducerName}</p>

            {aorLoading && !activeAorData ? (
              <div className="h-28 animate-pulse rounded-xl bg-brand-800/50" />
            ) : null}

            {!aorLoading && aorError ? <p className="text-sm text-red-300">{aorError}</p> : null}

            {!aorLoading && !aorError ? (
              sortedCategories.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('category')}>
                          Category{sortIndicator('category', sortKey, sortDirection)}
                        </th>
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('pageviews')}>
                          Pageviews{sortIndicator('pageviews', sortKey, sortDirection)}
                        </th>
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('sessions')}>
                          Sessions{sortIndicator('sessions', sortKey, sortDirection)}
                        </th>
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('users')}>
                          Users{sortIndicator('users', sortKey, sortDirection)}
                        </th>
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('addToCartRate')}>
                          Add-to-Cart Rate{sortIndicator('addToCartRate', sortKey, sortDirection)}
                        </th>
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('bounceRate')}>
                          Bounce Rate{sortIndicator('bounceRate', sortKey, sortDirection)}
                        </th>
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('conversionRate')}>
                          Conv. Rate{sortIndicator('conversionRate', sortKey, sortDirection)}
                        </th>
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('revenue')}>
                          Revenue{sortIndicator('revenue', sortKey, sortDirection)}
                        </th>
                        <th className="cursor-pointer px-3 py-2" onClick={() => handleSort('wowViews')}>
                          WoW Δ Views{sortIndicator('wowViews', sortKey, sortDirection)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCategories.map((category) => {
                        const wowBadge = (() => {
                          const change = category.wowViews
                          if (change === null || !Number.isFinite(change) || Math.abs(change) < 0.001) {
                            return { text: '—', className: 'text-brand-500' }
                          }

                          const isPositive = change > 0
                          const arrow = isPositive ? '▲' : '▼'
                          const tone = isPositive ? 'text-emerald-400' : 'text-red-400'
                          const sign = isPositive ? '+' : '-'
                          return {
                            text: `${arrow} ${sign}${Math.abs(change).toFixed(1)}%`,
                            className: tone,
                          }
                        })()

                        const isExpanded = expandedCategory === category.category
                        const atcTone = atcRateTone(category.addToCartRate)
                        const bounceTone = bounceRateTone(category.bounceRate)

                        return (
                          <Fragment key={category.category}>
                            <tr
                              className="cursor-pointer border-b border-brand-800/50 hover:bg-[#0d2137]"
                              onClick={() =>
                                setExpandedCategory((current) =>
                                  current === category.category ? null : category.category
                                )
                              }
                            >
                              <td className="px-3 py-2 font-medium text-white">{category.category}</td>
                              <td className="px-3 py-2 text-white">{formatInteger(category.pageviews)}</td>
                              <td className="px-3 py-2 text-white">{formatInteger(category.sessions)}</td>
                              <td className="px-3 py-2 text-white">{formatInteger(category.users)}</td>
                              <td className={`px-3 py-2 font-medium ${atcTone}`}>
                                {category.addToCartRate === null ? '—' : formatPercent(category.addToCartRate, 1)}
                              </td>
                              <td className={`px-3 py-2 font-medium ${bounceTone}`}>
                                {category.bounceRate === null ? '—' : formatPercent(category.bounceRate, 1)}
                              </td>
                              <td className="px-3 py-2 text-white">
                                {category.conversionRate === null ? '—' : formatPercent(category.conversionRate, 1)}
                              </td>
                              <td className="px-3 py-2 text-white">{formatCurrency(category.revenue)}</td>
                              <td className={`px-3 py-2 font-medium ${wowBadge.className}`}>{wowBadge.text}</td>
                            </tr>
                            {isExpanded ? (
                              <tr className="bg-brand-950/40">
                                <td colSpan={9} className="px-3 py-3">
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                      <thead>
                                        <tr className="text-left uppercase text-brand-400">
                                          <th className="pb-2">Page Path</th>
                                          <th className="pb-2">Pageviews</th>
                                          <th className="pb-2">Sessions</th>
                                          <th className="pb-2">Bounce Rate</th>
                                          <th className="pb-2">Add-to-Carts</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {category.pages.slice(0, 10).map((page) => (
                                          <tr key={`${category.category}-${page.page_path}`}>
                                            <td className="py-1 text-brand-200" title={page.page_path}>
                                              {truncatePath(page.page_path, 80)}
                                            </td>
                                            <td className="py-1 text-white">
                                              {formatInteger(toNumber(page.screenpage_views))}
                                            </td>
                                            <td className="py-1 text-white">
                                              {formatInteger(toNumber(page.sessions))}
                                            </td>
                                            <td className="py-1 text-white">
                                              {page.bounce_rate === null || page.bounce_rate === undefined
                                                ? '—'
                                                : formatPercent(toNumber(page.bounce_rate), 1)}
                                            </td>
                                            <td className="py-1 text-white">
                                              {formatInteger(toNumber(page.add_to_carts))}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-brand-500">No AOR-mapped pages found for this producer.</p>
              )
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  )
}
