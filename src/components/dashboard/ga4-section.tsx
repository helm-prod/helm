'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

interface ProfileOption {
  id: string
  full_name: string
}

interface Ga4MetricRow {
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

interface MetricsResponse {
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

interface DeltaBadge {
  text: string
  className: string
}

interface CategoryAggregate {
  category: string
  pageviews: number
  sessions: number
  users: number
  purchases: number
  revenue: number
  wowViews: number | null
  pages: Ga4MetricRow[]
}

interface ProducerAggregate {
  producerName: string
  pageviews: number
  sessions: number
  purchases: number
  revenue: number
  topCategories: Array<{ category: string; views: number }>
}

interface Props {
  profileId: string
  allProfiles: ProfileOption[]
  userRole?: string | null
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function sumMetric(rows: Ga4MetricRow[], key: keyof Ga4MetricRow) {
  return rows.reduce((acc, row) => {
    const raw = row[key]
    if (raw === null || raw === undefined) return acc
    return acc + toNumber(raw)
  }, 0)
}

function averageMetric(rows: Ga4MetricRow[], key: keyof Ga4MetricRow) {
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

function calculateConversionRate(rows: Ga4MetricRow[]) {
  const sessions = sumMetric(rows, 'sessions')
  const purchases = sumMetric(rows, 'ecommerce_purchases')

  if (sessions <= 0) return null
  return (purchases / sessions) * 100
}

function calculateRevenue(rows: Ga4MetricRow[]) {
  return rows.reduce((acc, row) => {
    const revenue = row.purchase_revenue ?? row.item_revenue
    if (revenue === null || revenue === undefined) return acc
    return acc + toNumber(revenue)
  }, 0)
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`
}

function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)

  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return `${startLabel} – ${endLabel}`
}

function formatRelativeTime(isoTimestamp: string | null, nowMs: number) {
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

function pctChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null
  }

  return ((current - previous) / previous) * 100
}

function pointsDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null
  return current - previous
}

function buildDeltaBadge({
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

function truncatePath(path: string, max = 42) {
  if (path.length <= max) return path
  return `${path.slice(0, max - 3)}...`
}

function hasEcommerceData(rows: Ga4MetricRow[]) {
  return rows.some((row) => {
    const fields = [row.purchase_revenue, row.item_revenue, row.ecommerce_purchases, row.add_to_carts]
    return fields.some((value) => value !== null && value !== undefined && toNumber(value) > 0)
  })
}

function aggregateCategories(currentRows: Ga4MetricRow[], previousRows: Ga4MetricRow[]) {
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

function aggregateProducers(rows: Ga4MetricRow[]) {
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

function buildPageHighlights(currentRows: Ga4MetricRow[], previousRows: Ga4MetricRow[]) {
  const previousViews = new Map<string, number>()

  for (const row of previousRows) {
    previousViews.set(row.page_path, (previousViews.get(row.page_path) ?? 0) + toNumber(row.screenpage_views ?? 0))
  }

  const sortedByViewsDesc = [...currentRows].sort(
    (a, b) => toNumber(b.screenpage_views ?? 0) - toNumber(a.screenpage_views ?? 0)
  )

  const withHighlightData = sortedByViewsDesc.map((row) => {
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

function StatsCard({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta: DeltaBadge
}) {
  return (
    <div className="rounded-2xl border border-[#1a3a4a] bg-brand-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      <p className={`mt-2 text-sm font-medium ${delta.className}`}>{delta.text}</p>
    </div>
  )
}

function SecondaryCard({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta: DeltaBadge
}) {
  return (
    <div className="rounded-2xl border border-[#1a3a4a] bg-brand-900/80 p-4">
      <p className="text-xs uppercase tracking-wide text-brand-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className={`mt-2 text-sm font-medium ${delta.className}`}>{delta.text}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <section className="animate-pulse space-y-4 rounded-2xl border border-brand-800 bg-brand-900/40 p-5">
      <div className="h-10 rounded-lg bg-brand-800/60" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl bg-brand-800/50" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-brand-800/40" />
    </section>
  )
}

export function Ga4Section({ profileId, allProfiles, userRole }: Props) {
  const isAdmin = userRole === 'admin'
  const [siteData, setSiteData] = useState<MetricsResponse | null>(null)
  const [aorDataByProfile, setAorDataByProfile] = useState<Record<string, MetricsResponse>>({})
  const [teamAorData, setTeamAorData] = useState<MetricsResponse | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState<string | null>(null)
  const [aorLoading, setAorLoading] = useState(false)
  const [aorError, setAorError] = useState<string | null>(null)
  const [aorView, setAorView] = useState<'producer' | 'team'>('producer')
  const [selectedAorProfileId, setSelectedAorProfileId] = useState(profileId)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const fetchMetrics = useCallback(async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? 'Unable to load analytics data.')
    }

    return (await response.json()) as MetricsResponse
  }, [])

  const loadSiteData = useCallback(async () => {
    setSiteLoading(true)
    setSiteError(null)

    try {
      const data = await fetchMetrics('/api/ga4/metrics?scope=site')
      setSiteData(data)
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : 'Unable to load analytics data.')
    } finally {
      setSiteLoading(false)
    }
  }, [fetchMetrics])

  const loadProfileAorData = useCallback(
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
        setAorError(error instanceof Error ? error.message : 'Unable to load analytics data.')
      } finally {
        setAorLoading(false)
      }
    },
    [fetchMetrics, aorDataByProfile]
  )

  const loadTeamAorData = useCallback(
    async (force = false) => {
      if (!force && teamAorData) return

      setAorLoading(true)
      setAorError(null)

      try {
        const data = await fetchMetrics('/api/ga4/metrics?scope=aor')
        setTeamAorData(data)
      } catch (error) {
        setAorError(error instanceof Error ? error.message : 'Unable to load analytics data.')
      } finally {
        setAorLoading(false)
      }
    },
    [fetchMetrics, teamAorData]
  )

  useEffect(() => {
    loadSiteData()
  }, [loadSiteData])

  useEffect(() => {
    if (!isAdmin) {
      setSelectedAorProfileId(profileId)
      return
    }

    const isSelectedInList = allProfiles.some((profile) => profile.id === selectedAorProfileId)
    if (!isSelectedInList) {
      setSelectedAorProfileId(allProfiles[0]?.id ?? profileId)
    }
  }, [allProfiles, isAdmin, profileId, selectedAorProfileId])

  useEffect(() => {
    if (aorView === 'team') {
      if (isAdmin) {
        loadTeamAorData()
      }
      return
    }

    const targetProfileId = isAdmin ? selectedAorProfileId : profileId
    if (targetProfileId) {
      loadProfileAorData(targetProfileId)
    }
  }, [aorView, isAdmin, loadProfileAorData, loadTeamAorData, profileId, selectedAorProfileId])

  const handleRefresh = useCallback(async () => {
    if (refreshing || nowMs < cooldownUntil) {
      return
    }

    setRefreshing(true)
    setCooldownUntil(Date.now() + 60_000)

    try {
      const response = await fetch('/api/ga4/refresh', { method: 'POST' })
      if (!response.ok) {
        throw new Error('Refresh failed')
      }

      await loadSiteData()
      const targetProfileId = isAdmin ? selectedAorProfileId : profileId
      if (targetProfileId) {
        await loadProfileAorData(targetProfileId, true)
      }
      if (isAdmin && (teamAorData || aorView === 'team')) {
        await loadTeamAorData(true)
      }
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }, [
    refreshing,
    nowMs,
    cooldownUntil,
    isAdmin,
    selectedAorProfileId,
    profileId,
    loadSiteData,
    aorView,
    loadProfileAorData,
    teamAorData,
    loadTeamAorData,
  ])

  const currentRows = siteData?.current_week ?? []
  const previousRows = siteData?.previous_week ?? []

  const pageviewsCurrent = sumMetric(currentRows, 'screenpage_views')
  const pageviewsPrevious = sumMetric(previousRows, 'screenpage_views')

  const sessionsCurrent = sumMetric(currentRows, 'sessions')
  const sessionsPrevious = sumMetric(previousRows, 'sessions')

  const usersCurrent = sumMetric(currentRows, 'active_users')
  const usersPrevious = sumMetric(previousRows, 'active_users')

  const conversionCurrent = calculateConversionRate(currentRows)
  const conversionPrevious = calculateConversionRate(previousRows)

  const revenueCurrent = calculateRevenue(currentRows)
  const revenuePrevious = calculateRevenue(previousRows)

  const transactionsCurrent = sumMetric(currentRows, 'ecommerce_purchases')
  const transactionsPrevious = sumMetric(previousRows, 'ecommerce_purchases')

  const addToCartsCurrent = sumMetric(currentRows, 'add_to_carts')
  const addToCartsPrevious = sumMetric(previousRows, 'add_to_carts')

  const bounceCurrent = averageMetric(currentRows, 'bounce_rate')
  const bouncePrevious = averageMetric(previousRows, 'bounce_rate')

  const ecommerceVisible = hasEcommerceData([...currentRows, ...previousRows])

  const highlights = useMemo(
    () => buildPageHighlights(currentRows, previousRows),
    [currentRows, previousRows]
  )

  const activeProducerProfileId = isAdmin ? selectedAorProfileId : profileId
  const activeProducerAorData = activeProducerProfileId
    ? (aorDataByProfile[activeProducerProfileId] ?? null)
    : null

  const myAorCategories = useMemo(() => {
    if (!activeProducerAorData) return []
    return aggregateCategories(activeProducerAorData.current_week, activeProducerAorData.previous_week)
  }, [activeProducerAorData])

  const teamProducerCards = useMemo(() => {
    if (!teamAorData) return []
    return aggregateProducers(teamAorData.current_week)
  }, [teamAorData])

  const activeAorData =
    aorView === 'team' && isAdmin
      ? teamAorData
      : activeProducerAorData

  const adWeek = siteData?.ad_week
  const adWeekLabel = adWeek
    ? `Ad Week ${adWeek.week_number}`
    : 'Ad Week'

  const disabledForCooldown = nowMs < cooldownUntil
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - nowMs) / 1000))

  const isEmpty = !siteLoading && !siteError && currentRows.length === 0 && previousRows.length === 0

  return (
    <section className="space-y-6">
      {siteLoading && !siteData ? (
        <LoadingSkeleton />
      ) : null}

      {!siteLoading && siteError && !siteData ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-sm text-red-300">Unable to load analytics data.</p>
          <button
            type="button"
            onClick={loadSiteData}
            className="mt-3 rounded-lg border border-brand-700 px-3 py-1.5 text-sm text-white hover:bg-brand-800/60"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!siteLoading && !siteError && isEmpty ? (
        <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6 text-sm text-brand-400">
          No analytics data yet. Data refreshes automatically every 4 hours, or click Refresh to pull data now.
        </div>
      ) : null}

      {siteData ? (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-[#1a3a4a] border-l-4 border-l-cyan-400 bg-[#0d2137] px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm">
              <span className="font-semibold text-white">{adWeekLabel}</span>
              {adWeek ? <span className="ml-2 text-brand-300">{formatDateRange(adWeek.start_date, adWeek.end_date)}</span> : null}
            </div>
            <p className="text-xs italic text-brand-400">{adWeek?.notes || ' '}</p>
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Site Performance</h2>
              <p className="mt-1 text-sm text-brand-400">
                All pages · Ad Week {adWeek?.week_number ?? '--'} vs Ad Week{' '}
                {adWeek?.week_number ? Math.max(1, adWeek.week_number - 1) : '--'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatsCard
                label="Pageviews"
                value={formatInteger(pageviewsCurrent)}
                delta={buildDeltaBadge({ change: pctChange(pageviewsCurrent, pageviewsPrevious) })}
              />
              <StatsCard
                label="Sessions"
                value={formatInteger(sessionsCurrent)}
                delta={buildDeltaBadge({ change: pctChange(sessionsCurrent, sessionsPrevious) })}
              />
              <StatsCard
                label="Active Users"
                value={formatInteger(usersCurrent)}
                delta={buildDeltaBadge({ change: pctChange(usersCurrent, usersPrevious) })}
              />
              <StatsCard
                label="Conversion Rate"
                value={conversionCurrent === null ? '—' : formatPercent(conversionCurrent, 2)}
                delta={buildDeltaBadge({ change: pointsDelta(conversionCurrent, conversionPrevious), suffix: 'pts' })}
              />
            </div>

            {ecommerceVisible ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SecondaryCard
                  label="Revenue"
                  value={formatCurrency(revenueCurrent)}
                  delta={buildDeltaBadge({ change: pctChange(revenueCurrent, revenuePrevious) })}
                />
                <SecondaryCard
                  label="Transactions"
                  value={formatInteger(transactionsCurrent)}
                  delta={buildDeltaBadge({ change: pctChange(transactionsCurrent, transactionsPrevious) })}
                />
                <SecondaryCard
                  label="Add to Carts"
                  value={formatInteger(addToCartsCurrent)}
                  delta={buildDeltaBadge({ change: pctChange(addToCartsCurrent, addToCartsPrevious) })}
                />
                <SecondaryCard
                  label="Avg Bounce Rate"
                  value={bounceCurrent === null ? '—' : formatPercent(bounceCurrent, 1)}
                  delta={buildDeltaBadge({
                    change: pointsDelta(bounceCurrent, bouncePrevious),
                    suffix: 'pts',
                    invertDirection: true,
                  })}
                />
              </div>
            ) : (
              <p className="text-sm text-brand-500">Ecommerce tracking data not yet available</p>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-brand-800 bg-brand-900 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold text-white">Category Performance</h3>
              {isAdmin ? (
                <div className="inline-flex rounded-xl border border-brand-700 bg-brand-950 p-1">
                  <button
                    type="button"
                    onClick={() => setAorView('producer')}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      aorView === 'producer' ? 'bg-brand-700 text-white' : 'text-brand-300 hover:text-white'
                    }`}
                  >
                    Producer View
                  </button>
                  <button
                    type="button"
                    onClick={() => setAorView('team')}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      aorView === 'team' ? 'bg-brand-700 text-white' : 'text-brand-300 hover:text-white'
                    }`}
                  >
                    Team Overview
                  </button>
                </div>
              ) : (
                <p className="text-xs text-brand-500">Your AOR breakdown</p>
              )}
            </div>

            {isAdmin && aorView === 'producer' ? (
              <div className="flex items-center gap-2">
                <label htmlFor="aor-producer" className="text-xs uppercase tracking-wide text-brand-400">
                  Producer
                </label>
                <select
                  id="aor-producer"
                  value={selectedAorProfileId}
                  onChange={(event) => setSelectedAorProfileId(event.target.value)}
                  className="rounded-lg border border-brand-700 bg-brand-950 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {allProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {aorLoading && !activeAorData ? (
              <div className="h-28 animate-pulse rounded-xl bg-brand-800/50" />
            ) : null}

            {!aorLoading && aorError ? <p className="text-sm text-red-300">{aorError}</p> : null}

            {!aorLoading && !aorError && aorView === 'producer' ? (
              myAorCategories.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Pageviews</th>
                        <th className="px-3 py-2">Sessions</th>
                        <th className="px-3 py-2">Users</th>
                        <th className="px-3 py-2">Conv. Rate</th>
                        <th className="px-3 py-2">Revenue</th>
                        <th className="px-3 py-2">WoW Δ Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myAorCategories.map((category) => {
                        const conversionRate =
                          category.sessions > 0 ? (category.purchases / category.sessions) * 100 : null
                        const wowBadge = buildDeltaBadge({ change: category.wowViews })
                        const isExpanded = expandedCategory === category.category

                        return (
                          <Fragment key={category.category}>
                            <tr
                              className="cursor-pointer hover:bg-[#0d2137]"
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
                              <td className="px-3 py-2 text-white">
                                {conversionRate === null ? '—' : formatPercent(conversionRate, 1)}
                              </td>
                              <td className="px-3 py-2 text-white">{formatCurrency(category.revenue)}</td>
                              <td className={`px-3 py-2 font-medium ${wowBadge.className}`}>{wowBadge.text}</td>
                            </tr>
                            {isExpanded ? (
                              <tr className="bg-brand-950/40">
                                <td colSpan={7} className="px-3 py-3">
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                      <thead>
                                        <tr className="text-left uppercase text-brand-400">
                                          <th className="pb-2">Top Pages</th>
                                          <th className="pb-2">Views</th>
                                          <th className="pb-2">Sessions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {category.pages.slice(0, 5).map((page) => (
                                          <tr key={`${category.category}-${page.page_path}`}>
                                            <td className="py-1 text-brand-200" title={page.page_path}>
                                              {truncatePath(page.page_path, 65)}
                                            </td>
                                            <td className="py-1 text-white">{formatInteger(toNumber(page.screenpage_views))}</td>
                                            <td className="py-1 text-white">{formatInteger(toNumber(page.sessions))}</td>
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
                <p className="text-sm text-brand-500">
                  {isAdmin
                    ? 'No AOR-mapped pages found for the selected producer.'
                    : 'No AOR-mapped pages found for your profile.'}
                </p>
              )
            ) : null}

            {!aorLoading && !aorError && isAdmin && aorView === 'team' ? (
              teamProducerCards.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-brand-500">Team Overview across {allProfiles.length} profiles</p>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {teamProducerCards.map((producer) => {
                      const conversionRate =
                        producer.sessions > 0 ? (producer.purchases / producer.sessions) * 100 : null

                      return (
                        <div
                          key={producer.producerName}
                          className="rounded-2xl border border-[#1a3a4a] bg-brand-900/80 p-4"
                        >
                          <h4 className="text-base font-semibold text-white">{producer.producerName}</h4>
                          <p className="mt-2 text-sm text-brand-300">
                            {formatInteger(producer.pageviews)} views | {formatInteger(producer.sessions)} sessions |{' '}
                            {conversionRate === null ? '—' : formatPercent(conversionRate, 1)} conv |{' '}
                            {formatCurrency(producer.revenue)}
                          </p>

                          <div className="mt-3 space-y-1 text-sm">
                            {producer.topCategories.map((category) => (
                              <div key={`${producer.producerName}-${category.category}`} className="flex items-center justify-between text-brand-200">
                                <span>{category.category}</span>
                                <span className="text-white">{formatInteger(category.views)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-brand-500">No team-level AOR mappings available yet.</p>
              )
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-brand-800 bg-brand-900 p-5">
            <h3 className="text-lg font-semibold text-white">Page Performance Highlights</h3>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-white">Top Pages</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                        <th className="px-2 py-2">Page</th>
                        <th className="px-2 py-2">Views</th>
                        <th className="px-2 py-2">Conv. Rate</th>
                        <th className="px-2 py-2">WoW</th>
                      </tr>
                    </thead>
                    <tbody>
                      {highlights.topPages.map((page) => {
                        const wowBadge = buildDeltaBadge({ change: page.wow })

                        return (
                          <tr key={`top-${page.page_path}`} className="hover:bg-[#0d2137]">
                            <td className="px-2 py-1.5 text-brand-200" title={page.page_path}>
                              {truncatePath(page.page_path)}
                            </td>
                            <td className="px-2 py-1.5 text-white">{formatInteger(page.views)}</td>
                            <td className="px-2 py-1.5 text-white">
                              {page.conversionRate === null ? '—' : formatPercent(page.conversionRate, 1)}
                            </td>
                            <td className={`px-2 py-1.5 font-medium ${wowBadge.className}`}>{wowBadge.text}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-white">Needs Attention</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                        <th className="px-2 py-2">Page</th>
                        <th className="px-2 py-2">Views</th>
                        <th className="px-2 py-2">Conv. Rate</th>
                        <th className="px-2 py-2">WoW</th>
                      </tr>
                    </thead>
                    <tbody>
                      {highlights.bottomPages.map((page) => {
                        const wowBadge = buildDeltaBadge({ change: page.wow })

                        return (
                          <tr key={`bottom-${page.page_path}`} className="hover:bg-[#0d2137]">
                            <td className="px-2 py-1.5 text-brand-200" title={page.page_path}>
                              {truncatePath(page.page_path)}
                            </td>
                            <td className="px-2 py-1.5 text-white">{formatInteger(page.views)}</td>
                            <td className="px-2 py-1.5 text-white">
                              {page.conversionRate === null ? '—' : formatPercent(page.conversionRate, 1)}
                            </td>
                            <td className={`px-2 py-1.5 font-medium ${wowBadge.className}`}>{wowBadge.text}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t border-brand-800 pt-4 text-sm text-brand-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Last updated {formatRelativeTime(siteData.last_refreshed, nowMs)}</p>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || disabledForCooldown}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-700 px-3 py-1.5 text-sm text-brand-200 transition-colors hover:bg-brand-800/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? <span className="h-3 w-3 animate-spin rounded-full border border-brand-300 border-t-transparent" /> : null}
              <span>↻ Refresh</span>
              {disabledForCooldown && !refreshing ? <span>({cooldownSeconds}s)</span> : null}
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}
