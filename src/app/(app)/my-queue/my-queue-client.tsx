'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CodeEditorPanel } from '@/components/code-editor/CodeEditorPanel'
import type {
  LinkIssue,
  Panel,
  Priority,
  Profile,
  QueueSectionKey,
  RequestType,
  WorkRequest,
} from '@/lib/types/database'

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

interface MyQueueClientProps {
  profile: Profile
  panels: QueuePanel[]
  activeSections: Partial<Record<QueueSectionKey, boolean>>
  linkIssues: LinkIssue[]
  allLinkIssues: LinkIssue[] | null
  corrections: WorkRequest[]
  submittedRequests: WorkRequest[]
  assignedRequests: WorkRequest[]
}

const TEAM_NAMES = ['Megan', 'Maddie', 'Daryl'] as const

const SECTION_COPY: Record<
  QueueSectionKey,
  {
    icon: string
    title: string
    emptyLabel: string
  }
> = {
  panels: { icon: '📋', title: 'Ad week panels', emptyLabel: 'ad week panels' },
  link_issues: { icon: '🔗', title: 'Link health issues', emptyLabel: 'link health issues' },
  corrections: { icon: '✏️', title: 'Panel corrections', emptyLabel: 'panel corrections' },
  submitted_requests: { icon: '📤', title: 'Requests I submitted', emptyLabel: 'submitted requests' },
  assigned_requests: { icon: '📥', title: 'Requests assigned to me', emptyLabel: 'assigned requests' },
  team_overview: { icon: '👥', title: 'Team overview', emptyLabel: 'team overview items' },
  all_link_issues: { icon: '🔗', title: 'All link issues - team', emptyLabel: 'team link issues' },
  junior_aor_issues: { icon: '🔗', title: 'Junior AOR issues', emptyLabel: 'junior AOR issues' },
}

function allowedSectionsForRole(role: Profile['role']): QueueSectionKey[] {
  const base: QueueSectionKey[] = [
    'panels',
    'link_issues',
    'corrections',
    'submitted_requests',
    'assigned_requests',
  ]

  if (role === 'senior_web_producer' || role === 'admin') {
    base.push('junior_aor_issues')
  }

  if (role === 'admin') {
    base.push('team_overview', 'all_link_issues')
  }

  return base
}

function normalizeSections(
  role: Profile['role'],
  savedSections: Partial<Record<QueueSectionKey, boolean>> | null | undefined,
) {
  const allowed = new Set(allowedSectionsForRole(role))
  const next: Partial<Record<QueueSectionKey, boolean>> = {}

  for (const key of Object.keys(SECTION_COPY) as QueueSectionKey[]) {
    if (!allowed.has(key)) continue
    next[key] = savedSections?.[key] ?? false
  }

  return next
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDueDate(value: string | null | undefined) {
  const formatted = formatShortDate(value)
  return formatted ? `Due ${formatted}` : 'No due date'
}

function getWeekLabel(panel: QueuePanel) {
  if (panel.ad_week?.label) return panel.ad_week.label
  const weekNumber = panel.ad_week?.week_number
  const year = panel.ad_week?.year
  if (weekNumber && year) return `Wk ${weekNumber} - ${year}`
  if (weekNumber) return `Wk ${weekNumber}`
  return 'No ad week'
}

function getPanelSubtext(panel: QueuePanel) {
  const week = panel.ad_week?.week_number ? `Wk ${panel.ad_week.week_number}` : 'No week'
  const due = formatShortDate(panel.ad_week?.end_date)
  return due ? `${week} · Due ${due}` : week
}

function getRequestTypeLabel(requestType: RequestType) {
  return requestType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function getPriorityBadge(priority: Priority) {
  if (priority === 'urgent') {
    return {
      label: 'URGENT',
      className: 'border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.1)] text-[#fca5a5]',
    }
  }

  if (priority === 'high') {
    return {
      label: 'HIGH',
      className: 'border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.1)] text-[#d4a017]',
    }
  }

  if (priority === 'normal') {
    return {
      label: 'NORMAL',
      className: 'border-[rgba(0,110,180,0.18)] bg-[rgba(0,110,180,0.1)] text-[#7dd3fc]',
    }
  }

  return {
    label: 'LOW',
    className: 'border-[rgba(148,163,184,0.18)] bg-[rgba(148,163,184,0.1)] text-[#7a94b0]',
  }
}

function getLinkIssueMeta(issue: LinkIssue) {
  if (!issue.link_url) {
    return {
      label: 'UNLINKED',
      className: 'border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.1)] text-[#d4a017]',
      description: 'Panel has no link',
    }
  }

  if (issue.http_status === 404) {
    return {
      label: '404',
      className: 'border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.1)] text-[#d46060]',
      description: 'Link returns 404',
    }
  }

  if (issue.http_status === 403) {
    return {
      label: '403',
      className: 'border-[rgba(148,163,184,0.18)] bg-[rgba(148,163,184,0.1)] text-[#7a94b0]',
      description: 'Blocked (403)',
    }
  }

  return {
    label: 'LOAD',
    className: 'border-[rgba(0,110,180,0.18)] bg-[rgba(0,110,180,0.1)] text-[#5a8fb0]',
    description: issue.error_message ?? 'Issue detected',
  }
}

function countBadge(count: number) {
  if (count > 0) {
    return {
      label: `${count} OPEN`,
      className: 'border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.14)] text-[#fca5a5]',
    }
  }

  return {
    label: 'CLEAR',
    className: 'border-[rgba(52,211,153,0.15)] bg-[rgba(52,211,153,0.08)] text-[#6ee7b7]',
  }
}

function firstWord(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] ?? ''
}

function buildPanelMeta(panels: QueuePanel[]) {
  const labels = Array.from(
    new Set(
      panels
        .map((panel) => panel.ad_week?.week_number)
        .filter((value): value is number => typeof value === 'number')
        .sort((a, b) => a - b)
        .map((weekNumber) => `Wk ${weekNumber}`),
    ),
  )

  return labels.join(' · ') || 'Active weeks'
}

function getEmptyMessage(sectionKey: QueueSectionKey) {
  return `No open ${SECTION_COPY[sectionKey].emptyLabel} assigned to you`
}

export function MyQueueClient({
  profile,
  panels,
  activeSections,
  linkIssues,
  allLinkIssues,
  corrections,
  submittedRequests,
  assignedRequests,
}: MyQueueClientProps) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [configureOpen, setConfigureOpen] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [sections, setSections] = useState<Partial<Record<QueueSectionKey, boolean>>>(
    () => normalizeSections(profile.role, activeSections),
  )
  const [panelState, setPanelState] = useState(panels)
  const [linkIssueState, setLinkIssueState] = useState(linkIssues)
  const [allLinkIssueState, setAllLinkIssueState] = useState<LinkIssue[] | null>(allLinkIssues)
  const [correctionState, setCorrectionState] = useState(corrections)
  const [submittedRequestState, setSubmittedRequestState] = useState(submittedRequests)
  const [assignedRequestState, setAssignedRequestState] = useState(assignedRequests)
  const [openSections, setOpenSections] = useState<Partial<Record<QueueSectionKey, boolean>>>({})
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)

  useEffect(() => {
    setSections(normalizeSections(profile.role, activeSections))
  }, [activeSections, profile.role])

  useEffect(() => {
    setPanelState(panels)
  }, [panels])

  useEffect(() => {
    setLinkIssueState(linkIssues)
  }, [linkIssues])

  useEffect(() => {
    setAllLinkIssueState(allLinkIssues)
  }, [allLinkIssues])

  useEffect(() => {
    setCorrectionState(corrections)
  }, [corrections])

  useEffect(() => {
    setSubmittedRequestState(submittedRequests)
  }, [submittedRequests])

  useEffect(() => {
    setAssignedRequestState(assignedRequests)
  }, [assignedRequests])

  const selectedPanelId = searchParams.get('panel')
  const selectedPanel = useMemo(
    () => panelState.find((panel) => panel.id === selectedPanelId) ?? null,
    [panelState, selectedPanelId],
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

  const juniorIssues = useMemo(
    () =>
      allLinkIssueState?.filter((issue) => {
        const owner = issue.aor_owner?.toLowerCase()
        return owner === 'maddie' || owner === 'daryl'
      }) ?? [],
    [allLinkIssueState],
  )

  const enabledSections = useMemo(
    () => {
      const allowed = allowedSectionsForRole(profile.role)
      const ordered =
        profile.role === 'admin'
          ? ([
              'all_link_issues',
              'panels',
              'link_issues',
              'corrections',
              'submitted_requests',
              'assigned_requests',
              'junior_aor_issues',
            ] as QueueSectionKey[])
          : allowed

      return ordered.filter((key) => allowed.includes(key) && key !== 'team_overview' && sections[key])
    },
    [profile.role, sections],
  )

  const teamOverviewRows = useMemo(
    () =>
      TEAM_NAMES.map((name) => {
        const issueCount = (allLinkIssueState ?? []).filter(
          (issue) => issue.aor_owner?.toLowerCase() === name.toLowerCase(),
        ).length
        const panelCount = panelState.filter((panel) => {
          const assigneeName =
            firstWord(panel.assignee?.full_name) ||
            (panel.assigned_to === profile.id ? firstWord(profile.full_name) : '')
          return assigneeName.toLowerCase() === name.toLowerCase()
        }).length

        return {
          name,
          role: 'Producer',
          issueCount,
          panelCount,
        }
      }),
    [allLinkIssueState, panelState, profile.full_name, profile.id],
  )

  const sectionCountMap = useMemo(
    () => ({
      panels: panelState.length,
      link_issues: linkIssueState.length,
      corrections: correctionState.length,
      submitted_requests: submittedRequestState.length,
      assigned_requests: assignedRequestState.length,
      team_overview: teamOverviewRows.reduce((sum, row) => sum + row.issueCount + row.panelCount, 0),
      all_link_issues: allLinkIssueState?.length ?? 0,
      junior_aor_issues: allLinkIssueState ? juniorIssues.length : 0,
    }),
    [
      allLinkIssueState,
      assignedRequestState.length,
      correctionState.length,
      juniorIssues.length,
      linkIssueState.length,
      panelState.length,
      submittedRequestState.length,
      teamOverviewRows,
    ],
  )

  useEffect(() => {
    setOpenSections((current) => {
      const next = { ...current }
      for (const key of enabledSections) {
        if (typeof next[key] === 'undefined') {
          next[key] = sectionCountMap[key] > 0
        }
      }
      return next
    })
  }, [enabledSections, sectionCountMap])

  async function persistSections(nextSections: Partial<Record<QueueSectionKey, boolean>>) {
    setSavingPrefs(true)
    setPrefsError(null)

    const { error } = await supabase.from('queue_preferences').upsert(
      {
        user_id: profile.id,
        sections: nextSections,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (error) {
      setPrefsError(error.message)
    }

    setSavingPrefs(false)
  }

  async function toggleSection(key: QueueSectionKey) {
    const nextSections = {
      ...sections,
      [key]: !sections[key],
    }
    setSections(nextSections)
    await persistSections(nextSections)
  }

  async function markPanelComplete(panelId: string) {
    setPendingActionId(panelId)

    const { error } = await supabase.from('panels').update({ status: 'complete' }).eq('id', panelId)

    if (!error) {
      setPanelState((current) => current.filter((panel) => panel.id !== panelId))
      if (selectedPanelId === panelId) {
        closePanelDrawer()
      }
    }

    setPendingActionId(null)
  }

  async function resolveLinkIssue(issueId: string) {
    setPendingActionId(issueId)

    const response = await fetch('/api/site-quality/link-check', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'resolve', id: issueId }),
    })

    if (response.ok) {
      setLinkIssueState((current) => current.filter((item) => item.id !== issueId))
      setAllLinkIssueState((current) => current?.filter((item) => item.id !== issueId) ?? null)
    }

    setPendingActionId(null)
  }

  async function markCorrectionComplete(requestId: string) {
    setPendingActionId(requestId)

    const { error } = await supabase
      .from('work_requests')
      .update({ status: 'complete' })
      .eq('id', requestId)

    if (!error) {
      setCorrectionState((current) => current.filter((item) => item.id !== requestId))
      setAssignedRequestState((current) => current.filter((item) => item.id !== requestId))
      setSubmittedRequestState((current) => current.filter((item) => item.id !== requestId))
    }

    setPendingActionId(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-[14px] border border-[rgba(0,110,180,0.2)] bg-[rgba(0,45,90,0.45)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold text-white">My Queue</h1>
            <p className="mt-1 text-[12px] text-[#7a94b0]">Personal work hub for {profile.full_name}</p>
          </div>

          <button
            type="button"
            onClick={() => setConfigureOpen((current) => !current)}
            className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] transition-colors ${
              configureOpen
                ? 'border-[rgba(0,110,180,0.5)] bg-[rgba(0,110,180,0.25)] text-[#93c5fd]'
                : 'border-[rgba(0,110,180,0.3)] bg-[rgba(0,65,115,0.4)] text-[#64748b] hover:border-[rgba(0,110,180,0.5)] hover:bg-[rgba(0,110,180,0.25)] hover:text-[#93c5fd]'
            }`}
          >
            <GearIcon />
            Configure
          </button>
        </div>
      </header>

      {configureOpen && (
        <section className="rounded-[10px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,45,90,0.55)] px-[18px] py-4">
          <div className="space-y-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[11px] uppercase tracking-[0.07em] text-[#7a94b0]">My work</h2>
                {savingPrefs && <span className="text-[11px] text-[#5a8fb0]">Saving...</span>}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {(
                  [
                    ['panels', 'Ad week panels'],
                    ['link_issues', 'Link health issues'],
                    ['corrections', 'Panel corrections'],
                    ['submitted_requests', 'Requests I submitted'],
                    ['assigned_requests', 'Requests assigned to me'],
                  ] as Array<[QueueSectionKey, string]>
                ).map(([key, label]) => (
                  <SectionToggle
                    key={key}
                    label={label}
                    checked={Boolean(sections[key])}
                    onChange={() => void toggleSection(key)}
                  />
                ))}
              </div>
            </div>

            {profile.role === 'admin' && (
              <div>
                <h2 className="mb-3 text-[11px] uppercase tracking-[0.07em] text-[#a78bfa]">Admin &amp; team</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  <SectionToggle
                    label="Team overview"
                    checked={Boolean(sections.team_overview)}
                    tag="Admin"
                    onChange={() => void toggleSection('team_overview')}
                  />
                  <SectionToggle
                    label="All link issues - team"
                    checked={Boolean(sections.all_link_issues)}
                    tag="Admin"
                    onChange={() => void toggleSection('all_link_issues')}
                  />
                </div>
              </div>
            )}

            {(profile.role === 'senior_web_producer' || profile.role === 'admin') && (
              <div>
                <h2 className="mb-3 text-[11px] uppercase tracking-[0.07em] text-[#7dd3fc]">Senior options</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  <SectionToggle
                    label="Junior AOR issues"
                    checked={Boolean(sections.junior_aor_issues)}
                    tag="Sr"
                    onChange={() => void toggleSection('junior_aor_issues')}
                  />
                </div>
              </div>
            )}

            {prefsError && <p className="text-[11px] text-[#fca5a5]">{prefsError}</p>}
          </div>
        </section>
      )}

      {profile.role === 'admin' && sections.team_overview && (
        <section className="rounded-[10px] border border-[rgba(167,139,250,0.2)] bg-[rgba(0,50,100,0.3)] px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.07em] text-[#a78bfa]">Team overview</p>
          <div className="mt-3">
            {teamOverviewRows.map((row, index) => (
              <div
                key={row.name}
                className={`flex flex-wrap items-center justify-between gap-3 py-3 ${
                  index > 0 ? 'border-t border-[rgba(0,110,180,0.1)]' : ''
                }`}
              >
                <div>
                  <p className="text-[12px] font-semibold text-[#cbd5e1]">{row.name}</p>
                  <p className="text-[10px] text-[#475569]">{row.role}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-[11px]">
                  <span className={row.issueCount > 0 ? 'text-[#fca5a5]' : 'text-[#6ee7b7]'}>
                    {row.issueCount > 0 ? `${row.issueCount} open link issues` : '✓ clear'}
                  </span>
                  <span className={row.panelCount > 0 ? 'text-[#7dd3fc]' : 'text-[#6ee7b7]'}>
                    {row.panelCount > 0 ? `${row.panelCount} open panels` : '✓ clear'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {enabledSections.map((sectionKey) => {
          const sectionOpen = openSections[sectionKey] ?? false
          const badge = countBadge(sectionCountMap[sectionKey])

          if (sectionKey === 'panels') {
            const panelGroups = groupPanelsByWeek(panelState)

            return (
              <QueueSection
                key={sectionKey}
                icon={SECTION_COPY[sectionKey].icon}
                title={SECTION_COPY[sectionKey].title}
                meta={buildPanelMeta(panelState)}
                badge={badge}
                open={sectionOpen}
                onToggle={() => setOpenSections((current) => ({ ...current, [sectionKey]: !sectionOpen }))}
              >
                {panelGroups.length === 0 ? (
                  <EmptyState message={getEmptyMessage(sectionKey)} />
                ) : (
                  <div>
                    {panelGroups.map((group) => (
                      <div key={group.weekLabel}>
                        <div className="border-b border-[rgba(0,110,180,0.07)] px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[#3d5a75]">
                          {group.weekLabel}
                        </div>
                        {group.panels.map((panel) => (
                          <QueueRow
                            key={panel.id}
                            done={false}
                            loading={pendingActionId === panel.id}
                            onResolve={(event) => {
                              event.stopPropagation()
                              void markPanelComplete(panel.id)
                            }}
                            onClick={() => openPanelDrawer(panel.id)}
                            thumbnail={<Thumbnail />}
                            label={
                              panel.panel_type
                                ? `${panel.page_location} - Slot ${panel.panel_type}`
                                : panel.page_location
                            }
                            subtext={getPanelSubtext(panel)}
                            badge={<Badge label="LOAD" className="border-[rgba(0,110,180,0.18)] bg-[rgba(0,110,180,0.1)] text-[#5a8fb0]" />}
                            active={selectedPanelId === panel.id}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </QueueSection>
            )
          }

          if (sectionKey === 'link_issues') {
            return (
              <QueueSection
                key={sectionKey}
                icon={SECTION_COPY[sectionKey].icon}
                title={SECTION_COPY[sectionKey].title}
                meta="My AOR"
                badge={badge}
                open={sectionOpen}
                onToggle={() => setOpenSections((current) => ({ ...current, [sectionKey]: !sectionOpen }))}
              >
                {linkIssueState.length === 0 ? (
                  <EmptyState message={getEmptyMessage(sectionKey)} />
                ) : (
                  <div>
                    {linkIssueState.map((issue) => {
                      const meta = getLinkIssueMeta(issue)
                      const week = issue.ad_week ? `Wk ${issue.ad_week}` : 'No week'

                      return (
                        <QueueRow
                          key={issue.id}
                          done={false}
                          loading={pendingActionId === issue.id}
                          onResolve={() => void resolveLinkIssue(issue.id)}
                          thumbnail={<Thumbnail imageUrl={issue.panel_image} />}
                          label={`${issue.page_label || 'Unknown page'} - Slot ${issue.slot ?? '—'}`}
                          subtext={`${week} · ${meta.description}`}
                          badge={<Badge label={meta.label} className={meta.className} />}
                        />
                      )
                    })}
                  </div>
                )}
              </QueueSection>
            )
          }

          if (sectionKey === 'corrections') {
            return (
              <QueueSection
                key={sectionKey}
                icon={SECTION_COPY[sectionKey].icon}
                title={SECTION_COPY[sectionKey].title}
                meta="Mon · Thu"
                badge={badge}
                open={sectionOpen}
                onToggle={() => setOpenSections((current) => ({ ...current, [sectionKey]: !sectionOpen }))}
              >
                {correctionState.length === 0 ? (
                  <EmptyState message={getEmptyMessage(sectionKey)} />
                ) : (
                  <div>
                    {correctionState.map((item) => (
                      <QueueRow
                        key={item.id}
                        done={false}
                        loading={pendingActionId === item.id}
                        onResolve={() => void markCorrectionComplete(item.id)}
                        thumbnail={<Thumbnail />}
                        label={item.title}
                        subtext={formatDueDate(item.due_date)}
                        badge={<Badge label="CORRECTION" className="border-[rgba(167,139,250,0.18)] bg-[rgba(167,139,250,0.1)] text-[#9878e0]" />}
                      />
                    ))}
                  </div>
                )}
              </QueueSection>
            )
          }

          if (sectionKey === 'submitted_requests') {
            return (
              <QueueSection
                key={sectionKey}
                icon={SECTION_COPY[sectionKey].icon}
                title={SECTION_COPY[sectionKey].title}
                meta="Open"
                badge={badge}
                open={sectionOpen}
                onToggle={() => setOpenSections((current) => ({ ...current, [sectionKey]: !sectionOpen }))}
              >
                {submittedRequestState.length === 0 ? (
                  <EmptyState message={getEmptyMessage(sectionKey)} />
                ) : (
                  <div>
                    {submittedRequestState.map((item) => {
                      const priority = getPriorityBadge(item.priority)
                      return (
                        <QueueRow
                          key={item.id}
                          done={false}
                          thumbnail={<Thumbnail />}
                          label={item.title}
                          subtext={`${getRequestTypeLabel(item.request_type)} · ${item.status}`}
                          badge={<Badge label={priority.label} className={priority.className} />}
                          passive
                        />
                      )
                    })}
                  </div>
                )}
              </QueueSection>
            )
          }

          if (sectionKey === 'assigned_requests') {
            return (
              <QueueSection
                key={sectionKey}
                icon={SECTION_COPY[sectionKey].icon}
                title={SECTION_COPY[sectionKey].title}
                meta="Open"
                badge={badge}
                open={sectionOpen}
                onToggle={() => setOpenSections((current) => ({ ...current, [sectionKey]: !sectionOpen }))}
              >
                {assignedRequestState.length === 0 ? (
                  <EmptyState message={getEmptyMessage(sectionKey)} />
                ) : (
                  <div>
                    {assignedRequestState.map((item) => {
                      const priority = getPriorityBadge(item.priority)
                      return (
                        <QueueRow
                          key={item.id}
                          done={false}
                          thumbnail={<Thumbnail />}
                          label={item.title}
                          subtext={`${getRequestTypeLabel(item.request_type)} · ${item.due_date ? formatDueDate(item.due_date) : 'Due —'}`}
                          badge={<Badge label={priority.label} className={priority.className} />}
                          passive
                        />
                      )
                    })}
                  </div>
                )}
              </QueueSection>
            )
          }

          if (sectionKey === 'all_link_issues') {
            const items = allLinkIssueState ?? []
            const grouped = items.reduce<Record<string, LinkIssue[]>>((groups, issue) => {
              const key = issue.aor_owner || 'Unassigned'
              if (!groups[key]) groups[key] = []
              groups[key].push(issue)
              return groups
            }, {})

            return (
              <QueueSection
                key={sectionKey}
                icon={SECTION_COPY[sectionKey].icon}
                title={SECTION_COPY[sectionKey].title}
                meta="All AORs"
                badge={badge}
                open={sectionOpen}
                onToggle={() => setOpenSections((current) => ({ ...current, [sectionKey]: !sectionOpen }))}
              >
                {items.length === 0 ? (
                  <EmptyState message={getEmptyMessage(sectionKey)} />
                ) : (
                  <div>
                    {Object.entries(grouped).map(([owner, ownerItems]) => (
                      <div key={owner}>
                        <div className="border-b border-[rgba(0,110,180,0.07)] px-4 py-2 text-[12px] text-[#475569]">
                          {owner}
                        </div>
                        {ownerItems.map((issue) => {
                          const meta = getLinkIssueMeta(issue)
                          const week = issue.ad_week ? `Wk ${issue.ad_week}` : 'No week'
                          return (
                            <QueueRow
                              key={issue.id}
                              done={false}
                              loading={pendingActionId === issue.id}
                              onResolve={() => void resolveLinkIssue(issue.id)}
                              thumbnail={<Thumbnail imageUrl={issue.panel_image} />}
                              label={`${issue.page_label || 'Unknown page'} - Slot ${issue.slot ?? '—'}`}
                              subtext={`${week} · ${meta.description}`}
                              badge={<Badge label={meta.label} className={meta.className} />}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </QueueSection>
            )
          }

          return (
            <QueueSection
              key={sectionKey}
              icon={SECTION_COPY[sectionKey].icon}
              title={SECTION_COPY[sectionKey].title}
              meta="Maddie · Daryl"
              badge={badge}
              open={sectionOpen}
              onToggle={() => setOpenSections((current) => ({ ...current, [sectionKey]: !sectionOpen }))}
            >
              {!allLinkIssueState ? (
                <EmptyState message="Requires admin data access" />
              ) : juniorIssues.length === 0 ? (
                <EmptyState message={getEmptyMessage(sectionKey)} />
              ) : (
                <div>
                  {juniorIssues.map((issue) => {
                    const meta = getLinkIssueMeta(issue)
                    return (
                      <QueueRow
                        key={issue.id}
                        done={false}
                        loading={pendingActionId === issue.id}
                        onResolve={() => void resolveLinkIssue(issue.id)}
                        thumbnail={<Thumbnail imageUrl={issue.panel_image} />}
                        label={`${issue.page_label || 'Unknown page'} - Slot ${issue.slot ?? '—'}`}
                        subtext={`${issue.aor_owner || 'Unassigned'} · ${meta.description}`}
                        badge={<Badge label={meta.label} className={meta.className} />}
                      />
                    )
                  })}
                </div>
              )}
            </QueueSection>
          )
        })}
      </div>

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

function groupPanelsByWeek(panels: QueuePanel[]) {
  const grouped = new Map<string, { sortWeek: number; panels: QueuePanel[] }>()

  for (const panel of panels) {
    const key = getWeekLabel(panel)
    if (!grouped.has(key)) {
      grouped.set(key, {
        sortWeek: panel.ad_week?.week_number ?? Number.MAX_SAFE_INTEGER,
        panels: [],
      })
    }
    grouped.get(key)?.panels.push(panel)
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[1].sortWeek - b[1].sortWeek)
    .map(([weekLabel, group]) => ({
      weekLabel,
      panels: group.panels.sort((a, b) => {
      const weekA = a.ad_week?.week_number ?? Number.MAX_SAFE_INTEGER
      const weekB = b.ad_week?.week_number ?? Number.MAX_SAFE_INTEGER
      if (weekA !== weekB) return weekA - weekB
      const locationCompare = a.page_location.localeCompare(b.page_location)
      if (locationCompare !== 0) return locationCompare
      return (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
      }),
    }))
}

function QueueSection({
  icon,
  title,
  meta,
  badge,
  open,
  onToggle,
  children,
}: {
  icon: string
  title: string
  meta: string
  badge: { label: string; className: string }
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[rgba(0,110,180,0.2)] bg-[rgba(0,65,115,0.22)]">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${open ? 'border-b border-[rgba(0,110,180,0.12)]' : ''}`}
      >
        <span className="text-[13px] opacity-65">{icon}</span>
        <span className="text-[13px] font-medium text-[#cbd5e1]">{title}</span>
        <span className="text-[11px] text-[#7a94b0]">{meta}</span>
        <span className="h-3 w-px bg-[rgba(0,110,180,0.2)]" />
        <Badge label={badge.label} className={badge.className} />
        <span className="ml-auto text-[10px] text-[#2d4a66]">{open ? '▾' : '▸'}</span>
      </button>

      {open && <div>{children}</div>}
    </section>
  )
}

function QueueRow({
  done,
  loading = false,
  onResolve,
  onClick,
  thumbnail,
  label,
  subtext,
  badge,
  active = false,
  passive = false,
}: {
  done: boolean
  loading?: boolean
  onResolve?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>
  onClick?: () => void
  thumbnail: React.ReactNode
  label: string
  subtext: string
  badge: React.ReactNode
  active?: boolean
  passive?: boolean
}) {
  const content = (
    <>
      <ResolveCircle done={done} loading={loading} onClick={onResolve} passive={passive} />
      {thumbnail}
      <div className={`min-w-0 flex-1 ${done ? 'opacity-35' : ''}`}>
        <p className={`truncate text-[12px] font-medium text-[#cbd5e1] ${done ? 'line-through' : ''}`}>{label}</p>
        <p className={`mt-1 truncate text-[11px] text-[#3d5a75] ${done ? 'line-through' : ''}`}>{subtext}</p>
      </div>
      {badge}
    </>
  )

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick()
          }
        }}
        className={`flex items-center gap-3 border-b border-[rgba(0,110,180,0.07)] px-4 py-[9px] transition-colors hover:bg-[rgba(0,70,140,0.14)] ${
          active ? 'bg-[rgba(0,70,140,0.14)]' : ''
        }`}
      >
        {content}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 border-b border-[rgba(0,110,180,0.07)] px-4 py-[9px] transition-colors hover:bg-[rgba(0,70,140,0.14)]">
      {content}
    </div>
  )
}

function SectionToggle({
  label,
  checked,
  onChange,
  tag,
}: {
  label: string
  checked: boolean
  onChange: () => void
  tag?: string
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex items-center justify-between gap-3 rounded-[7px] border px-[11px] py-[9px] text-left transition-colors ${
        checked
          ? 'border-[rgba(0,110,180,0.45)] bg-[rgba(0,75,150,0.22)]'
          : 'border-[rgba(0,110,180,0.18)] bg-[rgba(0,40,85,0.5)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-[15px] w-[15px] items-center justify-center rounded-[3px] border text-[11px] ${
            checked
              ? 'border-[rgba(0,110,180,0.45)] bg-[rgba(0,110,180,0.45)] text-[#93c5fd]'
              : 'border-[rgba(0,110,180,0.28)] bg-transparent text-transparent'
          }`}
        >
          ✓
        </span>
        <span className={`text-[11px] ${checked ? 'text-[#cbd5e1]' : 'text-[#4e6a85]'}`}>{label}</span>
      </div>
      {tag && (
        <span className="rounded-full border border-[rgba(0,110,180,0.2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.04em] text-[#7a94b0]">
          {tag}
        </span>
      )}
    </button>
  )
}

function ResolveCircle({
  done,
  loading,
  onClick,
  passive = false,
}: {
  done: boolean
  loading?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>
  passive?: boolean
}) {
  if (passive) {
    return <span className="inline-flex h-4 w-4 shrink-0 rounded-full border border-[rgba(0,110,180,0.28)] opacity-40" />
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors ${
        done
          ? 'border-[rgba(52,211,153,0.4)] bg-[rgba(52,211,153,0.18)] text-[#6ee7b7]'
          : 'border-[rgba(0,110,180,0.28)] hover:border-[rgba(52,211,153,0.5)] hover:bg-[rgba(52,211,153,0.08)]'
      } ${loading ? 'opacity-60' : ''}`}
    >
      {done ? '✓' : ''}
    </button>
  )
}

function Thumbnail({ imageUrl }: { imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <span className="inline-flex h-[34px] w-[54px] shrink-0 overflow-hidden rounded-[3px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,40,90,0.6)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      </span>
    )
  }

  return (
    <span className="inline-flex h-[34px] w-[54px] shrink-0 items-center justify-center rounded-[3px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,40,90,0.6)]">
      <svg width="26" height="18" viewBox="0 0 26 18" fill="none" aria-hidden="true" className="opacity-40">
        <rect x="1" y="1" width="24" height="16" rx="2" stroke="#5a8fb0" strokeWidth="1" />
        <path d="M4 13L9 8L12 11L16 6L22 13" stroke="#5a8fb0" strokeWidth="1" />
      </svg>
    </span>
  )
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex rounded-[5px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] ${className}`}>
      {label}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-4 py-4 text-[11px] italic text-[#2d4a66]">{message}</p>
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.325 4.317a1 1 0 0 1 .95-.69h1.45a1 1 0 0 1 .95.69l.3.924a7.977 7.977 0 0 1 1.693.98l.944-.192a1 1 0 0 1 .98.336l1.025 1.025a1 1 0 0 1 .335.98l-.19.944c.39.529.718 1.095.98 1.693l.924.3a1 1 0 0 1 .69.95v1.45a1 1 0 0 1-.69.95l-.924.3a7.977 7.977 0 0 1-.98 1.693l.19.944a1 1 0 0 1-.336.98l-1.025 1.025a1 1 0 0 1-.98.335l-.944-.19a7.978 7.978 0 0 1-1.693.98l-.3.924a1 1 0 0 1-.95.69h-1.45a1 1 0 0 1-.95-.69l-.3-.924a7.977 7.977 0 0 1-1.693-.98l-.944.19a1 1 0 0 1-.98-.336L5.46 17.368a1 1 0 0 1-.335-.98l.19-.944a7.977 7.977 0 0 1-.98-1.693l-.924-.3a1 1 0 0 1-.69-.95v-1.45a1 1 0 0 1 .69-.95l.924-.3a7.978 7.978 0 0 1 .98-1.693l-.19-.944a1 1 0 0 1 .336-.98l1.025-1.025a1 1 0 0 1 .98-.335l.944.19a7.978 7.978 0 0 1 1.693-.98l.3-.924Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
