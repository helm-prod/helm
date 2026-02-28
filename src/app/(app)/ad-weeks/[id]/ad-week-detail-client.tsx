'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  type AdWeek,
  type AdWeekEvent,
  type AdWeekStatus,
  AD_WEEK_STATUS_COLORS,
  AD_WEEK_STATUS_LABELS,
  computeGeneratedDescription,
  LINK_INTENTS,
  type Panel,
  type PanelCategory,
  PANEL_CATEGORIES,
  PANEL_PREFIXES,
  PANEL_STATUS_LABELS,
  type PanelStatus,
  PANEL_SUFFIXES,
  PANEL_TYPES,
  type Profile,
} from '@/lib/types/database'
import { PanelStatusBadge } from '@/components/panel-status-badge'
import { PanelTypeBadge } from '@/components/panel-type-badge'
import { PriorityCircle } from '@/components/priority-circle'
import { CodeEditorPanel } from '@/components/code-editor/CodeEditorPanel'

interface ProducerOption {
  id: string
  full_name: string
  email: string
  role: string
}

type PanelWithJoins = Omit<Panel, 'assignee' | 'event'> & {
  assignee: { id: string; full_name: string; email: string } | null
  event: { id: string; event_code: string; event_name: string | null } | null
}

interface Props {
  profile: Profile
  adWeek: AdWeek
  events: AdWeekEvent[]
  panels: PanelWithJoins[]
  producers: ProducerOption[]
  aorAssignments: { producer_id: string; category: string }[]
}

const ALL_AD_WEEK_STATUSES: AdWeekStatus[] = [
  'draft',
  'turn_in',
  'in_production',
  'proofing',
  'live',
  'archived',
]

const PAGE_LOCATION_SUGGESTIONS: Partial<Record<PanelCategory, string[]>> = {
  Homepage: ['Homepage L1', 'Homepage L2', 'Homepage Hero', 'Homepage Spotlight'],
  Electronics: ['Electronics L1', 'Electronics L2', 'Watches L2', 'Audio L2'],
  Apparel: ['Apparel L1', 'Apparel L2', 'Apparel Spotlight'],
  Shoes: ['Shoes L1', 'Shoes L2'],
  'Outdoor Home': ['Outdoor Home L1', 'Patio L2'],
  'Everyday Home': ['Everyday Home L1', 'Kitchen L2', 'Bedding L2'],
  Beauty: ['Beauty L1', 'Beauty L2'],
  Toys: ['Toys L1', 'Toys L2'],
}

function formatUtcDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateString))
}

function formatDateRange(startDate: string, endDate: string) {
  const startText = formatUtcDate(startDate)
  const endText = formatUtcDate(endDate)
  return startText === endText ? startText : `${startText} - ${endText}`
}

function getEventDisplayLabel(event: {
  event_code: string
  event_name: string | null
  start_date?: string | null
  end_date?: string | null
}) {
  const base = event.event_name ? `${event.event_code} - ${event.event_name}` : event.event_code
  if (event.start_date && event.end_date) {
    return `${base} (${formatDateRange(event.start_date, event.end_date)})`
  }
  return base
}

export function AdWeekDetailClient({
  profile,
  adWeek: initialAdWeek,
  events: initialEvents,
  panels: initialPanels,
  producers,
  aorAssignments,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const canEdit =
    profile.role === 'admin' ||
    profile.role === 'producer' ||
    profile.role === 'senior_web_producer'
  const isAdmin = profile.role === 'admin'

  const [adWeek, setAdWeek] = useState(initialAdWeek)
  const [events, setEvents] = useState(initialEvents)
  const [panels, setPanels] = useState(initialPanels)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)

  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEvent, setFilterEvent] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [myPanelsOnly, setMyPanelsOnly] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)

  const [collapsedLocations, setCollapsedLocations] = useState<Record<string, boolean>>({})

  const refreshPanels = useCallback(async () => {
    const { data } = await supabase
      .from('panels')
      .select('*, assignee:profiles!assigned_to(id, full_name, email), event:ad_week_events!event_id(id, event_code, event_name)')
      .eq('ad_week_id', adWeek.id)
      .order('page_location')
      .order('priority')

    if (data) {
      setPanels(data)
    }
  }, [supabase, adWeek.id])

  const selectedPanelId = searchParams.get('panel')

  const selectedPanel = useMemo(
    () => panels.find((panel) => panel.id === selectedPanelId) ?? null,
    [panels, selectedPanelId]
  )

  useEffect(() => {
    if (selectedPanelId && !selectedPanel) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('panel')
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    }
  }, [pathname, router, searchParams, selectedPanel, selectedPanelId])

  const openPanelDrawer = useCallback(
    (panelId: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('panel', panelId)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const closePanelDrawer = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('panel')
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  function getProducerForCategory(category: string): string | null {
    const aorProducer = aorAssignments.find((assignment) => assignment.category === category)?.producer_id ?? null
    if (aorProducer) return aorProducer
    return producers.find((producer) => producer.role === 'admin')?.id ?? null
  }

  async function handleWeekStatusChange(newStatus: AdWeekStatus) {
    const { error } = await supabase
      .from('ad_weeks')
      .update({ status: newStatus })
      .eq('id', adWeek.id)

    if (!error) {
      setAdWeek((prev) => ({ ...prev, status: newStatus }))
    }
  }

  async function handleReopenArchivedPanels() {
    if (!isAdmin) return

    const { error } = await supabase
      .from('panels')
      .update({
        archived: false,
        archived_at: null,
      })
      .eq('ad_week_id', adWeek.id)
      .eq('archived', true)

    if (!error) {
      await refreshPanels()
    }
  }

  const filteredPanels = useMemo(() => {
    return panels.filter((panel) => {
      if (!includeArchived && panel.archived) return false
      if (filterAssignee === 'unassigned' && panel.assigned_to) return false
      if (filterAssignee && filterAssignee !== 'unassigned' && panel.assigned_to !== filterAssignee) return false
      if (filterStatus && panel.status !== filterStatus) return false
      if (filterCategory && panel.category !== filterCategory) return false
      if (filterEvent === 'none' && panel.event_id) return false
      if (filterEvent && filterEvent !== 'none' && panel.event_id !== filterEvent) return false
      if (myPanelsOnly && panel.assigned_to !== profile.id) return false
      if (searchQuery) {
        const search = searchQuery.toLowerCase().trim()
        const description = (panel.generated_description || panel.item_description || '').toLowerCase()
        if (!description.includes(search)) return false
      }

      return true
    })
  }, [
    panels,
    includeArchived,
    filterAssignee,
    filterStatus,
    filterCategory,
    filterEvent,
    myPanelsOnly,
    profile.id,
    searchQuery,
  ])

  const groupedByLocation = useMemo(() => {
    const sorted = [...filteredPanels].sort((a, b) => {
      const locationCompare = a.page_location.localeCompare(b.page_location)
      if (locationCompare !== 0) return locationCompare

      const aPriority = a.priority ?? Number.MAX_SAFE_INTEGER
      const bPriority = b.priority ?? Number.MAX_SAFE_INTEGER
      return aPriority - bPriority
    })

    return sorted.reduce<Record<string, PanelWithJoins[]>>((groups, panel) => {
      if (!groups[panel.page_location]) {
        groups[panel.page_location] = []
      }
      groups[panel.page_location].push(panel)
      return groups
    }, {})
  }, [filteredPanels])

  const locationKeys = Object.keys(groupedByLocation)

  useEffect(() => {
    setCollapsedLocations((current) => {
      const next = { ...current }
      for (const location of locationKeys) {
        if (!(location in next)) next[location] = false
      }
      return next
    })
  }, [locationKeys])

  const activePanels = useMemo(() => panels.filter((panel) => !panel.archived), [panels])
  const archivedPanelCount = panels.length - activePanels.length

  const completionDenominator = activePanels.filter((panel) => panel.status !== 'cancelled').length
  const completedCount = activePanels.filter((panel) => panel.status === 'complete').length
  const progressPercent = completionDenominator === 0 ? 0 : Math.round((completedCount / completionDenominator) * 100)

  const stats = {
    total: activePanels.length,
    completed: completedCount,
    inProgress: activePanels.filter((panel) => ['in_production', 'proofing', 'revision'].includes(panel.status)).length,
    pending: activePanels.filter((panel) => panel.status === 'pending').length,
    needsDesign: activePanels.filter((panel) => panel.status === 'design_needed' || panel.design_needed).length,
  }

  const producerBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>()

    for (const panel of activePanels) {
      const name = panel.assignee?.full_name || 'Unassigned'
      const current = map.get(name)
      if (current) {
        current.count += 1
      } else {
        map.set(name, { name, count: 1 })
      }
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [activePanels])

  const dateRangeLabel = useMemo(() => {
    if (adWeek.start_date && adWeek.end_date) {
      return formatDateRange(adWeek.start_date, adWeek.end_date)
    }

    const dates = events.flatMap((event) => [event.start_date, event.end_date]).filter(Boolean) as string[]
    if (dates.length === 0) return 'No date range'

    const sorted = [...dates].sort()
    const min = sorted[0]
    const max = sorted[sorted.length - 1]

    return formatDateRange(min, max)
  }, [adWeek.end_date, adWeek.start_date, events])

  const weekLabel = adWeek.label || `WK ${adWeek.week_number}`

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <Link href="/ad-weeks" className="text-sm text-brand-500 transition-colors hover:text-brand-300">
          &larr; Back to Ad Weeks
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {weekLabel} - {adWeek.year}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${AD_WEEK_STATUS_COLORS[adWeek.status]}`}>
                {AD_WEEK_STATUS_LABELS[adWeek.status]}
              </span>
              {archivedPanelCount > 0 && (
                <span className="inline-flex items-center rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-1 text-xs font-medium text-fuchsia-200">
                  {archivedPanelCount} archived
                </span>
              )}
              <span className="text-brand-500">{dateRangeLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={adWeek.status}
              onChange={(event) => handleWeekStatusChange(event.target.value as AdWeekStatus)}
              className="rounded-full border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
              disabled={!canEdit}
            >
              {ALL_AD_WEEK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {AD_WEEK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>

            {canEdit && (
              <button
                onClick={() => setShowAddPanel(true)}
                className="rounded-full bg-nex-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-nex-redDark"
              >
                Add Panel
              </button>
            )}

            <Link
              href={`/upload?ad_week_id=${adWeek.id}`}
              className="rounded-full border border-brand-700 px-4 py-2 text-sm font-medium text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
            >
              Upload More
            </Link>

            {isAdmin && archivedPanelCount > 0 && (
              <button
                onClick={() => void handleReopenArchivedPanels()}
                className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-100 transition-colors hover:bg-fuchsia-500/20"
              >
                Reopen Archived ({archivedPanelCount})
              </button>
            )}

            {canEdit && (
              <button
                onClick={() => setShowAddEvent(true)}
                className="rounded-full border border-brand-700 px-4 py-2 text-sm font-medium text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
              >
                Add Event
              </button>
            )}
          </div>
        </div>

        {events.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {events.map((event) => (
              <span key={event.id} className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
                {getEventDisplayLabel(event)}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between text-xs text-brand-400">
            <span>
              {completedCount} of {completionDenominator || activePanels.length} panels complete
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-800">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-800 bg-brand-900 p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
          <select
            value={filterAssignee}
            onChange={(event) => setFilterAssignee(event.target.value)}
            className="rounded-xl border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white"
          >
            <option value="">All Producers</option>
            <option value="unassigned">Unassigned</option>
            {producers.map((producer) => (
              <option key={producer.id} value={producer.id}>
                {producer.full_name}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            className="rounded-xl border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white"
          >
            <option value="">All Statuses</option>
            {Object.entries(PANEL_STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={filterEvent}
            onChange={(event) => setFilterEvent(event.target.value)}
            className="rounded-xl border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white"
          >
            <option value="">All Events</option>
            <option value="none">No Event</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {getEventDisplayLabel(event)}
              </option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(event) => setFilterCategory(event.target.value)}
            className="rounded-xl border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white"
          >
            <option value="">All Categories</option>
            {PANEL_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search description"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="rounded-xl border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white placeholder-brand-500"
          />

          <label className="inline-flex items-center gap-2 rounded-xl border border-brand-700 px-3 py-2 text-sm text-brand-300">
            <input
              type="checkbox"
              checked={myPanelsOnly}
              onChange={(event) => setMyPanelsOnly(event.target.checked)}
              className="rounded border-brand-700 bg-brand-900"
            />
            My Panels Only
          </label>

          <label className="inline-flex items-center gap-2 rounded-xl border border-brand-700 px-3 py-2 text-sm text-brand-300">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              className="rounded border-brand-700 bg-brand-900"
            />
            Include Archived
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              const next: Record<string, boolean> = {}
              for (const location of locationKeys) next[location] = false
              setCollapsedLocations(next)
            }}
            className="rounded-full border border-brand-700 px-3 py-1.5 text-xs text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
          >
            Expand All
          </button>
          <button
            onClick={() => {
              const next: Record<string, boolean> = {}
              for (const location of locationKeys) next[location] = true
              setCollapsedLocations(next)
            }}
            className="rounded-full border border-brand-700 px-3 py-1.5 text-xs text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
          >
            Collapse All
          </button>
          <button
            onClick={() => {
              setFilterAssignee('')
              setFilterStatus('')
              setFilterEvent('')
              setFilterCategory('')
              setSearchQuery('')
              setMyPanelsOnly(false)
              setIncludeArchived(false)
            }}
            className="rounded-full border border-brand-700 px-3 py-1.5 text-xs text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {locationKeys.length === 0 ? (
            <div className="rounded-2xl border border-brand-800 bg-brand-900 px-6 py-12 text-center">
              <p className="text-4xl text-brand-700">No Results</p>
              <p className="mt-3 text-brand-400">No panels match your current filters.</p>
              <button
                onClick={() => setShowAddPanel(true)}
                className="mt-4 rounded-full bg-nex-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-nex-redDark"
              >
                Add a Panel
              </button>
            </div>
          ) : (
            locationKeys.map((location) => {
              const locationPanels = groupedByLocation[location]
              const isCollapsed = collapsedLocations[location] ?? false

              return (
                <section key={location} className="overflow-hidden rounded-2xl border border-brand-800 bg-brand-900">
                  <button
                    onClick={() => setCollapsedLocations((current) => ({ ...current, [location]: !isCollapsed }))}
                    className="flex w-full items-center justify-between border-b border-brand-800 px-4 py-3 text-left transition-colors hover:bg-brand-800/40"
                  >
                    <div>
                      <h2 className="text-sm font-semibold text-white">{location}</h2>
                      <p className="text-xs text-brand-500">
                        {locationPanels.length} panel{locationPanels.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="text-brand-500">{isCollapsed ? '+' : '-'}</span>
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-3 p-4">
                      {locationPanels.map((panel) => {
                        const isSelected = selectedPanelId === panel.id
                        return (
                          <article
                            key={panel.id}
                            className={`rounded-xl border transition-colors ${
                              panel.archived
                                ? 'border-brand-800/70 bg-brand-900/40 opacity-70'
                                : isSelected
                                  ? 'border-blue-500/40 bg-blue-500/10'
                                  : 'border-brand-800 bg-brand-900/70 hover:border-brand-600'
                            }`}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => openPanelDrawer(panel.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  openPanelDrawer(panel.id)
                                }
                              }}
                              className="flex w-full flex-wrap items-center gap-3 p-3 text-left"
                            >
                              <PriorityCircle value={panel.priority} />

                              <div className="flex min-w-0 flex-1 items-start gap-2">
                                <PanelTypeBadge panelType={panel.panel_type} />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-white">
                                    {panel.generated_description || panel.item_description || 'No description'}
                                  </p>
                                  <p className="mt-1 text-xs text-brand-500">{panel.category}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
                                <ProducerAvatar name={panel.assignee?.full_name || 'Unassigned'} />
                                <PanelStatusBadge
                                  status={panel.status}
                                  panelId={panel.id}
                                  canEdit={canEdit || panel.assigned_to === profile.id}
                                  onUpdate={refreshPanels}
                                />
                                {panel.event && (
                                  <span className="hidden rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-200 sm:inline-flex">
                                    {panel.event.event_code}
                                  </span>
                                )}
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-brand-800 bg-brand-900 p-4">
            <h3 className="text-sm font-semibold text-white">Week Summary</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <StatChip label="Total" value={stats.total} tone="text-white" />
              <StatChip label="Completed" value={stats.completed} tone="text-emerald-300" />
              <StatChip label="In Progress" value={stats.inProgress} tone="text-blue-300" />
              <StatChip label="Pending" value={stats.pending} tone="text-slate-300" />
              <StatChip label="Needs Design" value={stats.needsDesign} tone="text-amber-300" />
            </div>
          </section>

          <section className="rounded-2xl border border-brand-800 bg-brand-900 p-4">
            <h3 className="text-sm font-semibold text-white">Producer Breakdown</h3>
            <div className="mt-3 space-y-2">
              {producerBreakdown.length === 0 ? (
                <p className="text-sm text-brand-500">No panel assignments yet.</p>
              ) : (
                producerBreakdown.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-lg border border-brand-800 bg-brand-900/50 px-3 py-2 text-sm">
                    <span className="text-brand-300">{item.name}</span>
                    <span className="font-medium text-white">{item.count}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      {showAddEvent && (
        <AddEventModal
          adWeekId={adWeek.id}
          onClose={() => setShowAddEvent(false)}
          onCreated={(event) => {
            setEvents((current) => [...current, event])
            setShowAddEvent(false)
          }}
        />
      )}

      {showAddPanel && (
        <AddPanelModal
          adWeekId={adWeek.id}
          events={events}
          producers={producers}
          getProducerForCategory={getProducerForCategory}
          onClose={() => setShowAddPanel(false)}
          onCreated={() => {
            refreshPanels()
            setShowAddPanel(false)
          }}
        />
      )}

      {selectedPanel && (
        <CodeEditorPanel
          panel={selectedPanel as unknown as Panel}
          canEdit={canEdit || selectedPanel.assigned_to === profile.id}
          onClose={closePanelDrawer}
          onPanelUpdated={() => {
            void refreshPanels()
          }}
        />
      )}
    </div>
  )
}

function ProducerAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
        {initials || '?'}
      </span>
      <span className="hidden max-w-28 truncate text-xs text-brand-300 sm:inline">{name}</span>
    </div>
  )
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-brand-800 bg-brand-900/60 px-3 py-2">
      <p className="text-xs text-brand-500">{label}</p>
      <p className={`text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

function AddEventModal({
  adWeekId,
  onClose,
  onCreated,
}: {
  adWeekId: string
  onClose: () => void
  onCreated: (event: AdWeekEvent) => void
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventCode, setEventCode] = useState('')
  const [eventName, setEventName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const inputClass =
    'w-full rounded-xl border border-brand-700 bg-brand-900 px-3 py-2 text-white placeholder-brand-500 focus:border-brand-500 focus:outline-none'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('ad_week_events')
      .insert({
        ad_week_id: adWeekId,
        event_code: eventCode,
        event_name: eventName || null,
        start_date: startDate || null,
        end_date: endDate || null,
      })
      .select()
      .single()

    if (insertError || !data) {
      setError(insertError?.message || 'Unable to add event')
      setLoading(false)
      return
    }

    onCreated(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <h2 className="text-lg font-semibold text-white">Add Event</h2>

        <div>
          <label className="mb-1 block text-sm text-brand-300">Event Code</label>
          <input value={eventCode} onChange={(e) => setEventCode(e.target.value)} required className={inputClass} placeholder="6AE" />
        </div>

        <div>
          <label className="mb-1 block text-sm text-brand-300">Event Name</label>
          <input value={eventName} onChange={(e) => setEventName(e.target.value)} className={inputClass} placeholder="Get Your Game On" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-brand-300">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-brand-300">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
          </div>
        </div>

        {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading} className="rounded-full bg-nex-red px-4 py-2 text-sm font-medium text-white hover:bg-nex-redDark disabled:opacity-50">
            {loading ? 'Adding...' : 'Add Event'}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-brand-400 hover:text-white">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function AddPanelModal({
  adWeekId,
  events,
  producers,
  getProducerForCategory,
  onClose,
  onCreated,
}: {
  adWeekId: string
  events: AdWeekEvent[]
  producers: ProducerOption[]
  getProducerForCategory: (category: string) => string | null
  onClose: () => void
  onCreated: () => void
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState<PanelCategory>('Homepage')
  const [pageLocation, setPageLocation] = useState('')
  const [priority, setPriority] = useState('')
  const [panelType, setPanelType] = useState('')
  const [eventId, setEventId] = useState('')

  const [prefix, setPrefix] = useState('')
  const [value, setValue] = useState('')
  const [dollarOrPercent, setDollarOrPercent] = useState('')
  const [suffix, setSuffix] = useState('')
  const [itemDescription, setItemDescription] = useState('')
  const [exclusions, setExclusions] = useState('')

  const [imageReference, setImageReference] = useState('')
  const [linkIntent, setLinkIntent] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [direction, setDirection] = useState('')

  const [specialDates, setSpecialDates] = useState('')
  const [brandCategoryTracking, setBrandCategoryTracking] = useState('')
  const [isCarryover, setIsCarryover] = useState(false)
  const [isPickup, setIsPickup] = useState(false)
  const [pickupReference, setPickupReference] = useState('')
  const [notes, setNotes] = useState('')
  const [designNeeded, setDesignNeeded] = useState(false)

  const [showAssets, setShowAssets] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)

  const generatedDesc = computeGeneratedDescription({
    prefix: prefix || null,
    value: value || null,
    dollar_or_percent: dollarOrPercent || null,
    suffix: suffix || null,
    item_description: itemDescription || null,
  })

  const autoAssigneeId = getProducerForCategory(category)
  const autoAssigneeName = producers.find((producer) => producer.id === autoAssigneeId)?.full_name || 'Unassigned'

  const suggestedLocations = PAGE_LOCATION_SUGGESTIONS[category] ?? []

  const inputClass =
    'w-full rounded-xl border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white placeholder-brand-500 focus:border-brand-500 focus:outline-none'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { error: insertError } = await supabase
      .from('panels')
      .insert({
        ad_week_id: adWeekId,
        event_id: eventId || null,
        category,
        page_location: pageLocation,
        priority: priority ? Number.parseInt(priority, 10) : null,
        panel_type: panelType || null,
        prefix: prefix || null,
        value: value || null,
        dollar_or_percent: dollarOrPercent || null,
        suffix: suffix || null,
        item_description: itemDescription || null,
        exclusions: exclusions || null,
        generated_description: generatedDesc || null,
        image_reference: imageReference || null,
        link_intent: linkIntent || null,
        link_url: linkUrl || null,
        direction: direction || null,
        special_dates: specialDates || null,
        brand_category_tracking: brandCategoryTracking || null,
        is_carryover: isCarryover,
        is_pickup: isPickup,
        pickup_reference: pickupReference || null,
        notes: notes || null,
        design_needed: designNeeded,
        assigned_to: autoAssigneeId,
        source: 'manual',
      })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl space-y-4 rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Add Panel</h2>
            <p className="text-sm text-brand-500">Sectioned workflow for placement, content, assets, and metadata.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-brand-400 hover:text-white">
            Close
          </button>
        </div>

        <section className="rounded-xl border border-brand-800 bg-brand-900/50 p-4">
          <h3 className="text-sm font-semibold text-white">1. Placement</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as PanelCategory)} className={inputClass}>
                {PANEL_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Page Location</label>
              <input
                value={pageLocation}
                onChange={(e) => setPageLocation(e.target.value)}
                className={inputClass}
                placeholder="Homepage L1"
                list="page-location-suggestions"
                required
              />
              {suggestedLocations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestedLocations.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setPageLocation(suggestion)}
                      className="rounded-full border border-brand-700 px-2 py-0.5 text-xs text-brand-300 hover:border-brand-600 hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <datalist id="page-location-suggestions">
                {suggestedLocations.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Priority</label>
              <input type="number" min={1} value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass} placeholder="1" />
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Panel Type</label>
              <select value={panelType} onChange={(e) => setPanelType(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                {PANEL_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Event</label>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {getEventDisplayLabel(event)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-brand-800 bg-brand-900/50 p-4">
          <h3 className="text-sm font-semibold text-white">2. Content</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Prefix</label>
              <select value={prefix} onChange={(e) => setPrefix(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {PANEL_PREFIXES.map((value) => (
                  <option key={value} value={value}>
                    {value.trim()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Value</label>
              <input value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">$/%</label>
              <select value={dollarOrPercent} onChange={(e) => setDollarOrPercent(e.target.value)} className={inputClass}>
                <option value="">None</option>
                <option value="$">$</option>
                <option value="%">%</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Suffix</label>
              <select value={suffix} onChange={(e) => setSuffix(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {PANEL_SUFFIXES.map((value) => (
                  <option key={value} value={value}>
                    {value.trim()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Item Description</label>
              <input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Exclusions</label>
              <input value={exclusions} onChange={(e) => setExclusions(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-brand-800 bg-brand-900 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-brand-500">Generated Description Preview</p>
            <p className="mt-1 text-sm text-white">{generatedDesc || 'Description will appear here as you type.'}</p>
          </div>
        </section>

        <section className="rounded-xl border border-brand-800 bg-brand-900/50 p-4">
          <button
            type="button"
            onClick={() => setShowAssets((current) => !current)}
            className="flex w-full items-center justify-between text-left"
          >
            <h3 className="text-sm font-semibold text-white">3. Assets</h3>
            <span className="text-brand-500">{showAssets ? '-' : '+'}</span>
          </button>

          {showAssets && (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Image Reference</label>
                <input value={imageReference} onChange={(e) => setImageReference(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Link Intent</label>
                <select value={linkIntent} onChange={(e) => setLinkIntent(e.target.value)} className={inputClass}>
                  <option value="">Select</option>
                  {LINK_INTENTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Link URL</label>
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Direction</label>
                <input value={direction} onChange={(e) => setDirection(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-brand-800 bg-brand-900/50 p-4">
          <button
            type="button"
            onClick={() => setShowMetadata((current) => !current)}
            className="flex w-full items-center justify-between text-left"
          >
            <h3 className="text-sm font-semibold text-white">4. Metadata</h3>
            <span className="text-brand-500">{showMetadata ? '-' : '+'}</span>
          </button>

          {showMetadata && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Special Dates</label>
                  <input value={specialDates} onChange={(e) => setSpecialDates(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Brand/Category Tracking</label>
                  <input value={brandCategoryTracking} onChange={(e) => setBrandCategoryTracking(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-brand-300">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={designNeeded} onChange={(e) => setDesignNeeded(e.target.checked)} className="rounded border-brand-700 bg-brand-900" />
                  Design Needed
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={isCarryover} onChange={(e) => setIsCarryover(e.target.checked)} className="rounded border-brand-700 bg-brand-900" />
                  Is Carryover
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={isPickup} onChange={(e) => setIsPickup(e.target.checked)} className="rounded border-brand-700 bg-brand-900" />
                  Is Pickup
                </label>
              </div>

              {isPickup && (
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Pickup Reference</label>
                  <input value={pickupReference} onChange={(e) => setPickupReference(e.target.value)} className={inputClass} />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
              </div>
            </div>
          )}
        </section>

        <div className="rounded-xl border border-brand-800 bg-brand-900/60 px-3 py-2 text-sm text-brand-300">
          Auto-assigned producer: <span className="font-medium text-white">{autoAssigneeName}</span>
        </div>

        {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading} className="rounded-full bg-nex-red px-4 py-2 text-sm font-medium text-white hover:bg-nex-redDark disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Panel'}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-brand-400 hover:text-white">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
