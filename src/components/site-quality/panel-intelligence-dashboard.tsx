'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import { PanelDetailDrawer } from '@/components/site-quality/panel-detail-drawer'
import { ReportRecipientsManager } from '@/components/site-quality/report-recipients-manager'
import type { ReportRecipient } from '@/lib/site-quality/report-recipients'
import type { SiteQualityPanelResult, SiteQualityPanelRun } from '@/lib/site-quality/types'
import type { UserRole } from '@/lib/types/database'

type PanelResult = Omit<SiteQualityPanelResult, 'score' | 'panel_type'> & {
  score: number | null
  panel_type?: 'PRODUCT' | 'BRAND' | 'CATEGORY' | null
  featured_product?: string | null
  brand_name?: string | null
  cta_text?: string | null
  price_shown?: string | null
  offer_language?: string | null
  is_bot_blocked?: boolean
  redirect_count?: number
  product_count_on_destination?: number | null
  is_out_of_stock?: boolean
  has_empty_results?: boolean
  source_page_url?: string | null
  destination_relevance_keywords?: string[] | null
  panel_fingerprint?: string | null
}

type PanelSeverity = 'action_needed' | 'optimization' | 'bot_blocked' | 'passing'

type ActiveFilter =
  | { kind: 'all' }
  | { kind: 'page'; key: string }
  | { kind: 'producer'; owner: string }
  | { kind: 'quick'; key: 'action-needed' | 'bot-blocked' | 'assigned' | 'escalated' }

interface ReviewComment {
  id: string
  review_id: string
  author_id: string | null
  author_name: string
  comment: string
  created_at: string | null
}

interface PanelReview {
  id: string
  panel_fingerprint: string
  status: 'open' | 'addressed' | 'suppressed'
  priority: 'normal' | 'elevated' | 'critical'
  suppress_scoring_until: string | null
  assigned_to: string | null
  assigned_to_name: string | null
  assigned_by: string | null
  assigned_by_name: string | null
  assigned_at: string | null
  addressed_by: string | null
  addressed_by_name: string | null
  addressed_at: string | null
  comments: ReviewComment[]
}

interface AssignableUser {
  id: string
  full_name: string
  role: string
}

function extractPageLabel(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname

    if (path === '/' || path === '') return 'Homepage'

    const segments = path.split('/').filter(Boolean)
    const meaningful = segments.filter((s) => s !== 'browse' && !s.startsWith('_') && !s.startsWith('N-'))

    if (meaningful.length > 0) {
      const raw = meaningful[meaningful.length - 1]
      return raw
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    }

    return 'Unknown Page'
  } catch {
    return 'Unknown Page'
  }
}

function formatIssueType(type: string): string {
  const labels: Record<string, string> = {
    item_not_found: 'Item Not Found',
    price_mismatch: 'Price Mismatch',
    wrong_destination: 'Wrong Destination',
    weak_correlation: 'Weak Correlation',
    empty_destination: 'Empty Destination',
    dead_link: 'Dead Link',
    redirect: 'Redirect',
    bot_blocked: 'Bot Blocked',
    none: 'No Issues',
  }
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function issueColor(type: string): { bg: string; text: string; border: string } {
  switch (type) {
    case 'dead_link':
    case 'wrong_destination':
      return { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/25' }
    case 'item_not_found':
    case 'price_mismatch':
    case 'empty_destination':
      return { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/25' }
    case 'weak_correlation':
      return { bg: 'bg-yellow-500/10', text: 'text-yellow-300', border: 'border-yellow-500/25' }
    default:
      return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' }
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-slate-500'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function pageHealthColor(panels: PanelResult[]): string {
  const hasRed = panels.some((panel) => panel.issues?.some((issue) => ['wrong_destination', 'dead_link'].includes(issue.type)))
  if (hasRed) return 'bg-red-400'
  const hasAmber = panels.some((panel) => panel.issues?.some((issue) => ['empty_destination', 'weak_correlation', 'item_not_found', 'price_mismatch'].includes(issue.type)))
  if (hasAmber) return 'bg-amber-400'
  return 'bg-emerald-400'
}

function getPageLabel(panel: PanelResult) {
  return panel.source_page_url ? extractPageLabel(panel.source_page_url) : panel.category_l1 || 'Unknown Page'
}

function getVisibleIssues(panel: PanelResult) {
  return (panel.issues ?? []).filter((issue) => issue.type !== 'none')
}

function classifyPanel(panel: PanelResult): PanelSeverity {
  if (panel.is_bot_blocked) return 'bot_blocked'

  const issueTypes = getVisibleIssues(panel).map((issue) => issue.type)
  const actionTypes = ['wrong_destination', 'dead_link', 'empty_destination']
  if (issueTypes.some((type) => actionTypes.includes(type))) return 'action_needed'

  const optimizationTypes = ['weak_correlation', 'item_not_found', 'price_mismatch']
  if (issueTypes.some((type) => optimizationTypes.includes(type))) return 'optimization'

  return 'passing'
}

function getHighestSeverityIssue(panel: PanelResult) {
  const issues = getVisibleIssues(panel)
  const order = ['wrong_destination', 'dead_link', 'empty_destination', 'weak_correlation', 'item_not_found', 'price_mismatch', 'redirect']
  for (const type of order) {
    const issue = issues.find((entry) => entry.type === type)
    if (issue) return issue
  }
  return issues[0] ?? null
}

function formatRunDate(value: string | null | undefined) {
  if (!value) return 'Current run'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Current run'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDelta(value: number | null, positiveIsGood = true) {
  if (value === null || value === 0) return { label: '—', className: 'bg-slate-500/10 text-slate-400' }
  const improved = positiveIsGood ? value > 0 : value < 0
  return {
    label: `${value > 0 ? '+' : ''}${value}`,
    className: improved ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300',
  }
}

function SparkBars({ values, tone }: { values: Array<number | null>; tone: 'emerald' | 'amber' }) {
  if (values.length === 0 || values.every((value) => value === null)) {
    return <div className="mt-3 h-6 text-[10px] text-slate-500">—</div>
  }

  const palette = tone === 'emerald'
    ? ['bg-emerald-400/30', 'bg-emerald-400/40', 'bg-emerald-400/50', 'bg-emerald-400/60', 'bg-emerald-400/70', 'bg-emerald-400/90']
    : ['bg-amber-400/30', 'bg-amber-400/40', 'bg-amber-400/50', 'bg-amber-400/60', 'bg-amber-400/70', 'bg-amber-400/90']

  return (
    <div className="mt-3 flex h-6 items-end gap-1">
      {values.map((value, index) => {
        const height = value === null ? 3 : Math.max(3, Math.round((value / 100) * 24))
        return <div key={`${tone}-${index}`} className={`w-full rounded-t ${palette[Math.min(index, palette.length - 1)]}`} style={{ height }} />
      })}
    </div>
  )
}

function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[rgba(71,85,105,0.3)] bg-[rgba(30,41,59,0.3)] p-5 text-center">
      <div className="text-[11px] text-slate-500">{title}</div>
      <div className="mt-1 text-[10px] text-slate-500 opacity-60">{description}</div>
    </div>
  )
}

function IssuePill({ type }: { type: string }) {
  const color = issueColor(type)
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${color.bg} ${color.text} ${color.border}`}>{formatIssueType(type)}</span>
}

function ReviewMarkers({
  review,
  currentUserId,
}: {
  review: PanelReview | null
  currentUserId: string | null
}) {
  if (!review) return null

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {review.priority === 'critical' && <span className="inline-flex h-2 w-2 rounded-full bg-red-400" />}
      {review.priority === 'elevated' && <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />}
      {review.status === 'suppressed' && <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-400">Suppressed</span>}
      {currentUserId && review.assigned_to === currentUserId && review.status === 'open' && (
        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300">Assigned to you</span>
      )}
    </div>
  )
}

function TableSection({
  title,
  subtitle,
  titleClassName,
  rows,
  reviewMap,
  currentUserId,
  onSelect,
}: {
  title: string
  subtitle: string
  titleClassName: string
  rows: PanelResult[]
  reviewMap: Map<string, PanelReview>
  currentUserId: string | null
  onSelect: (panel: PanelResult) => void
}) {
  return (
    <section className="rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#111827] p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className={`text-xs font-medium ${titleClassName}`}>{title}</h3>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Panel', 'Page', 'Issue', 'Destination shows', 'Score', 'Δ'].map((heading) => (
                <th key={heading} className="border-b border-[rgba(71,85,105,0.15)] px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((panel) => {
              const issue = getHighestSeverityIssue(panel)
              const review = panel.panel_fingerprint ? reviewMap.get(panel.panel_fingerprint) ?? null : null

              return (
                <tr key={panel.id} className="cursor-pointer transition-colors hover:bg-blue-500/[0.03]" onClick={() => onSelect(panel)}>
                  <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2 align-middle">
                    <div className={`${review?.status === 'suppressed' ? 'opacity-50' : ''}`}>
                      <div className="text-[13px] text-slate-100">{panel.panel_name}</div>
                      {(panel.featured_product || panel.offer_language) && (
                        <div className="mt-0.5 text-[11px] text-slate-500">{panel.featured_product || panel.offer_language}</div>
                      )}
                      <ReviewMarkers review={review} currentUserId={currentUserId} />
                    </div>
                  </td>
                  <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2 align-middle">
                    <span className="rounded bg-[#1a2332] px-1.5 py-0.5 text-[10px] text-slate-500">{getPageLabel(panel)}</span>
                  </td>
                  <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2 align-middle">
                    {issue ? <IssuePill type={issue.type} /> : <span className="text-[10px] text-slate-500">—</span>}
                  </td>
                  <td className="max-w-[200px] border-b border-[rgba(71,85,105,0.15)] px-2 py-2 align-middle">
                    <div className="truncate text-[10px] italic text-slate-500">
                      {panel.destination_relevance_keywords?.slice(0, 4).join(', ') || '—'}
                    </div>
                  </td>
                  <td className={`border-b border-[rgba(71,85,105,0.15)] px-2 py-2 text-sm font-medium tabular-nums ${scoreColor(panel.score)}`}>
                    {panel.score ?? '—'}
                  </td>
                  <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2 text-[11px] text-slate-500">—</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function PanelIntelligenceDashboard({
  initialRun,
  initialResults,
  initialRecipients,
  userRole,
}: {
  initialRun: SiteQualityPanelRun | null
  initialResults: SiteQualityPanelResult[]
  initialRecipients: ReportRecipient[]
  userRole: UserRole
}) {
  const [run, setRun] = useState(initialRun)
  const [results, setResults] = useState<PanelResult[]>(initialResults as PanelResult[])
  const [selectedPanel, setSelectedPanel] = useState<PanelResult | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [runId, setRunId] = useState(initialRun?.id ?? null)
  const [activeTab, setActiveTab] = useState<'panel-intelligence' | 'link-health' | 'page-overview'>('panel-intelligence')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>({ kind: 'all' })
  const [passingSort, setPassingSort] = useState<'score' | 'page' | 'aor'>('score')
  const [showAllPassing, setShowAllPassing] = useState(false)
  const [reviews, setReviews] = useState<PanelReview[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([])

  useEffect(() => {
    if (!runId || !running) return

    const timer = window.setInterval(async () => {
      const query = new URLSearchParams({ runId, pageSize: '250' })
      const response = await fetch(`/api/site-quality/panel-results?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        setRunning(false)
        setMessage(data.error || 'Failed to refresh panel results')
        return
      }
      setRun(data.run)
      setResults((data.results ?? []) as PanelResult[])
      if (data.run?.status === 'complete' || data.run?.status === 'failed') {
        setRunning(false)
      }
    }, 5000)

    return () => window.clearInterval(timer)
  }, [runId, running])

  useEffect(() => {
    let cancelled = false

    async function loadReviews() {
      const response = await fetch('/api/panel-reviews')
      const data = await response.json()
      if (!response.ok || cancelled) return
      setReviews(data.reviews ?? [])
      setCurrentUserId(data.currentUserId ?? null)
      setAssignableUsers(data.assignableUsers ?? [])
    }

    void loadReviews()
    return () => {
      cancelled = true
    }
  }, [])

  const reviewMap = useMemo(() => {
    const map = new Map<string, PanelReview>()
    for (const review of reviews) map.set(review.panel_fingerprint, review)
    return map
  }, [reviews])

  const pageGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; panels: PanelResult[] }>()
    for (const panel of results) {
      const key = panel.source_page_url || panel.category_l1
      const existing = map.get(key)
      if (existing) {
        existing.panels.push(panel)
      } else {
        map.set(key, {
          key,
          label: panel.source_page_url ? extractPageLabel(panel.source_page_url) : panel.category_l1 || 'Unknown Page',
          panels: [panel],
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [results])

  const producerGroups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const panel of results) counts.set(panel.aor_owner, (counts.get(panel.aor_owner) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => a.owner.localeCompare(b.owner))
  }, [results])

  const quickCounts = useMemo(() => {
    const assignedToMe = currentUserId
      ? results.filter((panel) => {
        if (!panel.panel_fingerprint) return false
        const review = reviewMap.get(panel.panel_fingerprint)
        return review?.assigned_to === currentUserId && review.status === 'open'
      }).length
      : 0

    const escalated = results.filter((panel) => {
      if (!panel.panel_fingerprint) return false
      return reviewMap.get(panel.panel_fingerprint)?.priority === 'critical'
    }).length

    return {
      actionNeeded: results.filter((panel) => classifyPanel(panel) === 'action_needed').length,
      botBlocked: results.filter((panel) => classifyPanel(panel) === 'bot_blocked').length,
      assignedToMe,
      escalated,
    }
  }, [currentUserId, results, reviewMap])

  const filteredResults = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return results.filter((panel) => {
      const review = panel.panel_fingerprint ? reviewMap.get(panel.panel_fingerprint) ?? null : null
      const matchesFilter = (() => {
        switch (activeFilter.kind) {
          case 'all':
            return true
          case 'page':
            return (panel.source_page_url || panel.category_l1) === activeFilter.key
          case 'producer':
            return panel.aor_owner === activeFilter.owner
          case 'quick':
            if (activeFilter.key === 'action-needed') return classifyPanel(panel) === 'action_needed'
            if (activeFilter.key === 'bot-blocked') return classifyPanel(panel) === 'bot_blocked'
            if (activeFilter.key === 'assigned') return Boolean(currentUserId && review?.assigned_to === currentUserId && review.status === 'open')
            if (activeFilter.key === 'escalated') return review?.priority === 'critical'
            return false
        }
      })()

      if (!matchesFilter) return false
      if (!normalizedSearch) return true

      const haystack = [
        panel.panel_name,
        panel.source_page_url || '',
        panel.brand_name || '',
        ...(panel.destination_relevance_keywords ?? []),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [activeFilter, currentUserId, results, reviewMap, search])

  const groupedPanels = useMemo(() => {
    const groups: Record<PanelSeverity, PanelResult[]> = {
      action_needed: [],
      optimization: [],
      bot_blocked: [],
      passing: [],
    }

    for (const panel of filteredResults) {
      groups[classifyPanel(panel)].push(panel)
    }

    return groups
  }, [filteredResults])

  const scoredPanels = useMemo(() => filteredResults.filter((panel) => panel.score !== null), [filteredResults])
  const avgScore = useMemo(() => {
    if (scoredPanels.length === 0) return null
    return Math.round(scoredPanels.reduce((sum, panel) => sum + (panel.score ?? 0), 0) / scoredPanels.length)
  }, [scoredPanels])

  const panelsWithIssues = useMemo(
    () => filteredResults.filter((panel) => classifyPanel(panel) === 'action_needed' || classifyPanel(panel) === 'optimization'),
    [filteredResults]
  )

  const passingPanels = useMemo(() => {
    return [...groupedPanels.passing].sort((a, b) => {
      if (passingSort === 'page') return getPageLabel(a).localeCompare(getPageLabel(b))
      if (passingSort === 'aor') return a.aor_owner.localeCompare(b.aor_owner)
      return (b.score ?? -1) - (a.score ?? -1)
    })
  }, [groupedPanels.passing, passingSort])

  const visiblePassing = showAllPassing ? passingPanels : passingPanels.slice(0, 8)
  const avgDelta = formatDelta(null, true)
  const issueDelta = formatDelta(null, false)
  const sparkScores = avgScore === null ? [] : [avgScore]
  const sparkIssues = panelsWithIssues.length === 0 ? [] : [Math.min(100, Math.round((panelsWithIssues.length / Math.max(filteredResults.length, 1)) * 100))]
  const runOptions = run ? [{ id: run.id, label: formatRunDate(run.completed_at ?? run.created_at) }] : []

  function setQuickFilter(key: 'action-needed' | 'bot-blocked' | 'assigned' | 'escalated') {
    setActiveFilter({ kind: 'quick', key })
  }

  async function refreshReviews() {
    const response = await fetch('/api/panel-reviews')
    const data = await response.json()
    if (!response.ok) return
    setReviews(data.reviews ?? [])
    setCurrentUserId(data.currentUserId ?? null)
    setAssignableUsers(data.assignableUsers ?? [])
  }

  async function handleRescore() {
    setRunning(true)
    setMessage(null)
    const response = await fetch('/api/site-quality/panel-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await response.json()
    if (!response.ok) {
      setRunning(false)
      setMessage(data.error || 'Failed to start scoring run')
      return
    }
    setRunId(data.runId)
  }

  async function handleSendReport() {
    if (!run?.id) return
    setSending(true)
    setMessage(null)
    const response = await fetch('/api/site-quality/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'panel', runId: run.id }),
    })
    const data = await response.json()
    setSending(false)
    setMessage(response.ok ? 'Report sent' : data.error || 'Failed to send report')
  }

  function renderTabPlaceholder(label: string) {
    return (
      <div className="rounded-lg border border-dashed border-[rgba(71,85,105,0.3)] bg-[#111827] p-10 text-center">
        <div className="text-sm text-slate-100">{label}</div>
        <div className="mt-2 text-xs text-slate-500">This tab is a placeholder for the next phase.</div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[rgba(71,85,105,0.15)] bg-[#0a0f1a] text-slate-100">
      <div className="grid min-h-[840px] grid-cols-[220px_1fr] grid-rows-[auto_1fr]">
        <div className="col-span-2 flex items-center gap-4 border-b border-[rgba(71,85,105,0.3)] bg-[#0a0f1a] px-5 py-3">
          <div className="text-sm font-medium text-slate-100">Site quality</div>
          <div className="h-5 w-px bg-[rgba(71,85,105,0.3)]" />
          <div className="flex items-end gap-5 text-sm">
            {[
              ['panel-intelligence', 'Panel intelligence'],
              ['link-health', 'Link health'],
              ['page-overview', 'Page overview'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as 'panel-intelligence' | 'link-health' | 'page-overview')}
                className={`border-b-2 pb-2 ${activeTab === key ? 'border-blue-400 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center rounded-md border border-[rgba(71,85,105,0.15)] bg-[#1a2332] px-3 py-1.5 text-xs text-slate-400">
              <span className="mr-2 text-slate-500">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search panels, pages, brands"
                className="w-60 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
            <select
              value={run?.id ?? ''}
              onChange={(event) => setRunId(event.target.value || null)}
              className="rounded border border-[rgba(71,85,105,0.15)] bg-[#1a2332] px-2 py-1 text-xs text-slate-400"
            >
              {runOptions.length === 0 ? <option value="">No runs</option> : runOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>
        </div>

        <aside className="overflow-y-auto border-r border-[rgba(71,85,105,0.3)] bg-[#111827] py-3">
          <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">Pages</div>
          <div className="space-y-1 px-2">
            <button
              type="button"
              onClick={() => setActiveFilter({ kind: 'all' })}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${activeFilter.kind === 'all' ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:bg-white/5'}`}
            >
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="flex-1">All pages</span>
              <span className="rounded bg-[#1a2332] px-1.5 py-0.5 text-[10px] text-slate-500">{results.length}</span>
            </button>
            {pageGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setActiveFilter({ kind: 'page', key: group.key })}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${activeFilter.kind === 'page' && activeFilter.key === group.key ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:bg-white/5'}`}
              >
                <span className={`h-2 w-2 rounded-full ${pageHealthColor(group.panels)}`} />
                <span className="flex-1 truncate">{group.label}</span>
                <span className="rounded bg-[#1a2332] px-1.5 py-0.5 text-[10px] text-slate-500">{group.panels.length}</span>
              </button>
            ))}
          </div>

          <div className="px-3 pb-1.5 pt-5 text-[10px] font-medium uppercase tracking-wider text-slate-500">Producers</div>
          <div className="space-y-1 px-2">
            {producerGroups.map((group) => (
              <button
                key={group.owner}
                type="button"
                onClick={() => setActiveFilter({ kind: 'producer', owner: group.owner })}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${activeFilter.kind === 'producer' && activeFilter.owner === group.owner ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:bg-white/5'}`}
              >
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                <span className="flex-1 truncate">{group.owner}</span>
                <span className="rounded bg-[#1a2332] px-1.5 py-0.5 text-[10px] text-slate-500">{group.count}</span>
              </button>
            ))}
          </div>

          <div className="px-3 pb-1.5 pt-5 text-[10px] font-medium uppercase tracking-wider text-slate-500">Quick filters</div>
          <div className="space-y-1 px-2">
            {[
              ['action-needed', 'Action needed', 'bg-red-400', quickCounts.actionNeeded],
              ['bot-blocked', 'Bot blocked', 'bg-amber-400', quickCounts.botBlocked],
              ['assigned', 'Assigned to me', 'bg-blue-400', quickCounts.assignedToMe],
              ['escalated', 'Escalated', 'bg-yellow-400', quickCounts.escalated],
            ].map(([key, label, dot, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setQuickFilter(key as 'action-needed' | 'bot-blocked' | 'assigned' | 'escalated')}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${activeFilter.kind === 'quick' && activeFilter.key === key ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:bg-white/5'}`}
              >
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                <span className="flex-1 truncate">{label}</span>
                <span className="rounded bg-[#1a2332] px-1.5 py-0.5 text-[10px] text-slate-500">{count}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-4 overflow-y-auto bg-[#0a0f1a] p-4">
          {activeTab !== 'panel-intelligence' ? (
            renderTabPlaceholder(activeTab === 'link-health' ? 'Link health' : 'Page overview')
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#111827] px-3 py-2">
                <div>
                  <div className="text-xs text-slate-400">Current run</div>
                  <div className="mt-0.5 text-sm text-slate-100">{formatRunDate(run?.completed_at ?? run?.created_at)}</div>
                </div>
                <div className="min-h-5 text-xs text-slate-500">{message ?? ' '}</div>
                <div className="flex items-center gap-2">
                  {userRole === 'admin' && (
                    <button
                      type="button"
                      onClick={handleRescore}
                      disabled={running}
                      className="inline-flex items-center gap-2 rounded-md border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300 disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
                      {running ? 'Scoring...' : 'Re-score'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSendReport}
                    disabled={sending || !run?.id}
                    className="inline-flex items-center gap-2 rounded-md border border-[rgba(71,85,105,0.15)] bg-[#1a2332] px-3 py-1.5 text-xs text-slate-300 disabled:opacity-60"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sending ? 'Sending...' : 'Send report'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-400">Avg panel score</div>
                  <div className={`mt-2 text-xl font-medium ${scoreColor(avgScore)}`}>{avgScore ?? '—'}</div>
                  <div className={`mt-2 inline-flex rounded px-1.5 py-0.5 text-xs ${avgDelta.className}`}>{avgDelta.label}</div>
                  <SparkBars values={sparkScores} tone="emerald" />
                </div>
                <div className="rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-400">Panels with issues</div>
                  <div className="mt-2 text-xl font-medium text-amber-400">{panelsWithIssues.length}</div>
                  <div className={`mt-2 inline-flex rounded px-1.5 py-0.5 text-xs ${issueDelta.className}`}>{issueDelta.label}</div>
                  <SparkBars values={sparkIssues} tone="amber" />
                </div>
                <div className="rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-400">At-risk destination revenue</div>
                  <div className="mt-2 text-xl font-medium text-slate-500">—</div>
                  <div className="mt-2 inline-flex rounded bg-slate-500/10 px-1.5 py-0.5 text-xs text-slate-400">GA4 pending</div>
                  <div className="mt-2 text-[10px] text-slate-500 opacity-60">Revenue data from GA4 will appear here once integrated</div>
                </div>
              </div>

              {groupedPanels.action_needed.length > 0 && (
                <TableSection
                  title="Action needed"
                  subtitle="— production errors and empty destinations"
                  titleClassName="text-red-400"
                  rows={groupedPanels.action_needed}
                  reviewMap={reviewMap}
                  currentUserId={currentUserId}
                  onSelect={(panel) => {
                    setSelectedPanel(panel)
                    setDrawerOpen(true)
                  }}
                />
              )}

              {groupedPanels.optimization.length > 0 && (
                <TableSection
                  title="Optimization opportunities"
                  subtitle="— destination doesn't fully deliver on panel promise"
                  titleClassName="text-yellow-400"
                  rows={groupedPanels.optimization}
                  reviewMap={reviewMap}
                  currentUserId={currentUserId}
                  onSelect={(panel) => {
                    setSelectedPanel(panel)
                    setDrawerOpen(true)
                  }}
                />
              )}

              {groupedPanels.bot_blocked.length > 0 && (
                <section className="rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#111827] p-3">
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3 className="text-xs font-medium text-amber-400">Bot blocked</h3>
                    <span className="text-xs text-slate-500">— manual verification needed</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {['Panel', 'Page', 'Status'].map((heading) => (
                            <th key={heading} className="border-b border-[rgba(71,85,105,0.15)] px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupedPanels.bot_blocked.map((panel) => (
                          <tr key={panel.id} className="cursor-pointer transition-colors hover:bg-blue-500/[0.03]" onClick={() => { setSelectedPanel(panel); setDrawerOpen(true) }}>
                            <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2 text-[13px] text-slate-100">
                              <div className={`${panel.panel_fingerprint && reviewMap.get(panel.panel_fingerprint)?.status === 'suppressed' ? 'opacity-50' : ''}`}>
                                {panel.panel_name}
                                <ReviewMarkers review={panel.panel_fingerprint ? reviewMap.get(panel.panel_fingerprint) ?? null : null} currentUserId={currentUserId} />
                              </div>
                            </td>
                            <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2">
                              <span className="rounded bg-[#1a2332] px-1.5 py-0.5 text-[10px] text-slate-500">{getPageLabel(panel)}</span>
                            </td>
                            <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2 text-[11px] text-amber-300">⚠ Verify manually</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className="rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#111827] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xs font-medium text-slate-400">Passing panels</h3>
                    <span className="text-xs text-slate-500">{passingPanels.length}</span>
                  </div>
                  <select
                    value={passingSort}
                    onChange={(event) => setPassingSort(event.target.value as 'score' | 'page' | 'aor')}
                    className="rounded border border-[rgba(71,85,105,0.15)] bg-[#1a2332] px-2 py-1 text-xs text-slate-400"
                  >
                    <option value="score">Sort by score</option>
                    <option value="page">Sort by page</option>
                    <option value="aor">Sort by AOR</option>
                  </select>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Panel', 'Page', 'Destination shows', 'Score'].map((heading) => (
                          <th key={heading} className="border-b border-[rgba(71,85,105,0.15)] px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePassing.map((panel) => (
                        <tr key={panel.id} className="cursor-pointer transition-colors hover:bg-blue-500/[0.03]" onClick={() => { setSelectedPanel(panel); setDrawerOpen(true) }}>
                          <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2 text-[13px] text-slate-100">
                            <div className={`${panel.panel_fingerprint && reviewMap.get(panel.panel_fingerprint)?.status === 'suppressed' ? 'opacity-50' : ''}`}>
                              {panel.panel_name}
                              <ReviewMarkers review={panel.panel_fingerprint ? reviewMap.get(panel.panel_fingerprint) ?? null : null} currentUserId={currentUserId} />
                            </div>
                          </td>
                          <td className="border-b border-[rgba(71,85,105,0.15)] px-2 py-2">
                            <span className="rounded bg-[#1a2332] px-1.5 py-0.5 text-[10px] text-slate-500">{getPageLabel(panel)}</span>
                          </td>
                          <td className="max-w-[220px] border-b border-[rgba(71,85,105,0.15)] px-2 py-2">
                            <div className="truncate text-[10px] italic text-slate-500">{panel.destination_relevance_keywords?.slice(0, 4).join(', ') || 'Aligned destination'}</div>
                          </td>
                          <td className={`border-b border-[rgba(71,85,105,0.15)] px-2 py-2 text-sm font-medium tabular-nums ${scoreColor(panel.score)}`}>
                            {panel.score ?? '—'}
                          </td>
                        </tr>
                      ))}
                      {passingPanels.length > visiblePassing.length && (
                        <tr>
                          <td colSpan={4} className="px-2 py-3 text-center text-xs text-slate-500">
                            <button type="button" onClick={() => setShowAllPassing(true)} className="hover:text-slate-300">
                              {passingPanels.length - visiblePassing.length} more passing panels...
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid gap-3 md:grid-cols-2">
                <SectionPlaceholder title="Page-level triage" description="AI pre-scan identifies all marketing zones per page — catches panels the scraper misses" />
                <SectionPlaceholder title="Review activity" description="Assigned reviews, suppressed panels, comments, and escalation history will appear here" />
              </div>

              {userRole === 'admin' && <ReportRecipientsManager initialRecipients={initialRecipients} />}
            </>
          )}
        </main>
      </div>

      <PanelDetailDrawer
        panel={selectedPanel}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userRole={userRole}
        assignableUsers={assignableUsers}
        onReviewChange={refreshReviews}
      />
    </div>
  )
}
