'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Panel, Profile } from '@/lib/types/database'
import { PanelStatusBadge } from '@/components/panel-status-badge'
import { PanelTypeBadge } from '@/components/panel-type-badge'
import { PriorityCircle } from '@/components/priority-circle'
import { CodeEditorPanel } from '@/components/code-editor/CodeEditorPanel'

type QueuePanel = Omit<Panel, 'ad_week' | 'event' | 'assignee'> & {
  ad_week: {
    id: string
    week_number: number
    year: number
    label: string | null
    status: string
    start_date: string | null
    end_date: string | null
  } | null
  event: { id: string; event_code: string; event_name: string | null } | null
  assignee: { id: string; full_name: string; email: string } | null
}

type QueueTab = 'all' | 'this' | 'next'

function adWeekIncludesDate(
  adWeek: { start_date: string | null; end_date: string | null } | null,
  targetDateIso: string
) {
  if (!adWeek?.start_date || !adWeek?.end_date) return false
  return adWeek.start_date <= targetDateIso && adWeek.end_date >= targetDateIso
}

export function MyQueueClient({
  profile,
  panels,
  todayIso,
  nextWeekIso,
}: {
  profile: Profile
  panels: QueuePanel[]
  todayIso: string
  nextWeekIso: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<QueueTab>('all')
  const [panelState, setPanelState] = useState(panels)

  const selectedPanelId = searchParams.get('panel')
  const selectedPanel = useMemo(
    () => panelState.find((panel) => panel.id === selectedPanelId) ?? null,
    [panelState, selectedPanelId]
  )

  function openPanelDrawer(panelId: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('panel', panelId)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function closePanelDrawer() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('panel')
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  const filteredPanels = useMemo(() => {
    if (tab === 'all') return panelState

    if (tab === 'this') {
      return panelState.filter((panel) => adWeekIncludesDate(panel.ad_week, todayIso))
    }

    return panelState.filter((panel) => adWeekIncludesDate(panel.ad_week, nextWeekIso))
  }, [panelState, tab, todayIso, nextWeekIso])

  const groupedByWeek = useMemo(() => {
    const map = new Map<string, { weekId: string; weekLabel: string; year: number; weekNumber: number; panels: QueuePanel[] }>()

    for (const panel of filteredPanels) {
      const weekId = panel.ad_week?.id || 'unknown'
      const weekLabel = panel.ad_week?.label || `WK ${panel.ad_week?.week_number ?? '-'}`
      const year = panel.ad_week?.year ?? 0
      const weekNumber = panel.ad_week?.week_number ?? 0

      const current = map.get(weekId)
      if (current) {
        current.panels.push(panel)
      } else {
        map.set(weekId, {
          weekId,
          weekLabel,
          year,
          weekNumber,
          panels: [panel],
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return a.weekNumber - b.weekNumber
    })
  }, [filteredPanels])

  const totalCount = filteredPanels.length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <h1 className="text-2xl font-bold text-white">My Queue</h1>
        <p className="mt-1 text-brand-400">
          Personal production queue across active ad weeks for {profile.full_name}.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <QueueTabButton label="This Week" active={tab === 'this'} onClick={() => setTab('this')} />
          <QueueTabButton label="Next Week" active={tab === 'next'} onClick={() => setTab('next')} />
          <QueueTabButton label="All Active" active={tab === 'all'} onClick={() => setTab('all')} />
          <span className="ml-2 text-sm text-brand-500">{totalCount} open panels</span>
        </div>
      </div>

      {groupedByWeek.length === 0 ? (
        <div className="rounded-2xl border border-brand-800 bg-brand-900 px-6 py-12 text-center">
          <p className="text-4xl text-brand-700">Done</p>
          <p className="mt-3 text-brand-400">No open panels for this filter.</p>
          <Link href="/ad-weeks" className="mt-4 inline-flex rounded-full bg-nex-red px-4 py-2 text-sm font-medium text-white hover:bg-nex-redDark">
            View Ad Weeks
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByWeek.map((weekGroup) => {
            const byLocation = weekGroup.panels.reduce<Record<string, QueuePanel[]>>((groups, panel) => {
              if (!groups[panel.page_location]) groups[panel.page_location] = []
              groups[panel.page_location].push(panel)
              return groups
            }, {})

            return (
              <section key={weekGroup.weekId} className="overflow-hidden rounded-2xl border border-brand-800 bg-brand-900">
                <div className="flex items-center justify-between border-b border-brand-800 px-4 py-3">
                  <h2 className="text-base font-semibold text-white">
                    {weekGroup.weekLabel} - {weekGroup.year}
                  </h2>
                  {weekGroup.weekId !== 'unknown' && (
                    <Link href={`/ad-weeks/${weekGroup.weekId}`} className="text-sm text-brand-400 hover:text-white">
                      View Week {'->'}
                    </Link>
                  )}
                </div>

                <div className="space-y-3 p-4">
                  {Object.entries(byLocation)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([location, locationPanels]) => (
                      <div key={location} className="rounded-xl border border-brand-800 bg-brand-900/50">
                        <div className="border-b border-brand-800 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">{location}</p>
                        </div>
                        <div className="space-y-2 p-3">
                          {locationPanels
                            .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
                            .map((panel) => (
                              <article
                                key={panel.id}
                                className={`rounded-xl border bg-brand-900/70 p-3 transition-colors hover:border-brand-600 ${
                                  selectedPanelId === panel.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-brand-800'
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
                                  className="flex flex-wrap items-center gap-3"
                                >
                                  <PriorityCircle value={panel.priority} />

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <PanelTypeBadge panelType={panel.panel_type} />
                                      {panel.event && (
                                        <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-200">
                                          {panel.event.event_code}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 truncate text-sm font-medium text-white">
                                      {panel.generated_description || panel.item_description || 'No description'}
                                    </p>
                                    <p className="text-xs text-brand-500">{panel.category}</p>
                                  </div>

                                  <div onClick={(event) => event.stopPropagation()}>
                                    <PanelStatusBadge
                                      status={panel.status}
                                      panelId={panel.id}
                                      canEdit={true}
                                      onUpdate={() => router.refresh()}
                                    />
                                  </div>
                                </div>
                              </article>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {selectedPanel && (
        <CodeEditorPanel
          panel={selectedPanel as unknown as Panel}
          canEdit={true}
          onClose={closePanelDrawer}
          onPanelUpdated={(updatedPanel) => {
            setPanelState((current) => current.map((panel) => (panel.id === updatedPanel.id ? { ...panel, ...updatedPanel } : panel)))
          }}
        />
      )}
    </div>
  )
}

function QueueTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'border-blue-500/40 bg-blue-500/20 text-blue-100'
          : 'border-brand-700 text-brand-300 hover:border-brand-600 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}
