'use client'

import { useMemo, useState } from 'react'
import {
  Bug,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  Inbox,
  Lightbulb,
  Monitor,
  Shield,
  Trash2,
  User,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface BugWithReporter {
  id: string
  reporter_id: string
  title: string
  description: string | null
  screenshot_url: string | null
  page_url: string
  page_title: string | null
  user_agent: string | null
  viewport: string | null
  type: 'bug' | 'feature_request'
  status: 'new' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  admin_notes: string | null
  created_at: string
  updated_at: string
  reporter_name: string
}

interface BugsPageClientProps {
  bugs: BugWithReporter[]
  isAdmin: boolean
  currentUserId: string
}

type StatusFilter = 'all' | BugWithReporter['status']
type TypeFilter = 'all' | BugWithReporter['type']

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const STATUS_LABELS: Record<BugWithReporter['status'], string> = {
  new: 'New',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const STATUS_BADGE_STYLES: Record<BugWithReporter['status'], string> = {
  new: 'bg-red-500/10 text-red-400',
  in_progress: 'bg-amber-500/10 text-amber-400',
  resolved: 'bg-green-500/10 text-green-400',
  closed: 'bg-zinc-700/50 text-zinc-400',
}

function formatRelativeTime(isoString: string) {
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return 'Unknown time'

  const diffSeconds = Math.round((parsed.getTime() - Date.now()) / 1000)
  const absSeconds = Math.abs(diffSeconds)

  if (absSeconds < 60) return RELATIVE_TIME_FORMATTER.format(diffSeconds, 'second')
  if (absSeconds < 3600) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 60), 'minute')
  if (absSeconds < 86400) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 3600), 'hour')
  if (absSeconds < 2592000) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 86400), 'day')
  if (absSeconds < 31536000) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 2592000), 'month')
  }
  return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 31536000), 'year')
}

function formatSubmittedDate(isoString: string) {
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getPathPreview(pageUrl: string) {
  try {
    const parsed = new URL(pageUrl)
    const pathOnly = `${parsed.pathname}${parsed.search}`
    if (!pathOnly) return '/'
    return pathOnly.length > 40 ? `${pathOnly.slice(0, 40)}...` : pathOnly
  } catch {
    return pageUrl.length > 40 ? `${pageUrl.slice(0, 40)}...` : pageUrl
  }
}

function parseBrowserName(userAgent: string | null) {
  if (!userAgent) return 'Unknown'

  const chromeMatch = userAgent.match(/Chrome\/([\d.]+)/)
  if (chromeMatch && !/Edg\//.test(userAgent)) {
    return `Chrome ${chromeMatch[1]}`
  }

  const firefoxMatch = userAgent.match(/Firefox\/([\d.]+)/)
  if (firefoxMatch) {
    return `Firefox ${firefoxMatch[1]}`
  }

  const safariMatch = userAgent.match(/Version\/([\d.]+).*Safari/)
  if (safariMatch) {
    return `Safari ${safariMatch[1]}`
  }

  return 'Unknown'
}

function extractStoragePathFromPublicUrl(url: string) {
  try {
    const parsed = new URL(url)
    const marker = '/storage/v1/object/public/bug-screenshots/'
    const markerIndex = parsed.pathname.indexOf(marker)
    if (markerIndex === -1) return null
    const path = parsed.pathname.slice(markerIndex + marker.length)
    if (!path) return null
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

function EmptyState({ typeFilter, statusFilter }: { typeFilter: TypeFilter; statusFilter: StatusFilter }) {
  let TitleIcon = Inbox
  let title = 'No reports match this filter'

  if (typeFilter === 'bug' && statusFilter === 'all') {
    TitleIcon = Bug
    title = 'No bug reports yet'
  } else if (typeFilter === 'feature_request' && statusFilter === 'all') {
    TitleIcon = Lightbulb
    title = 'No feature requests yet'
  } else if (typeFilter === 'bug') {
    TitleIcon = Bug
    title = 'No bug reports match this filter'
  } else if (typeFilter === 'feature_request') {
    TitleIcon = Lightbulb
    title = 'No feature requests match this filter'
  }

  return (
    <div className="py-16 flex flex-col items-center">
      <TitleIcon className="h-12 w-12 text-zinc-700" />
      <p className="mt-4 font-medium text-zinc-400">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">Reports submitted via the bug button will appear here.</p>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: BugWithReporter['priority'] }) {
  if (priority === 'medium') return null

  if (priority === 'critical') {
    return (
      <span className="animate-pulse rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
        critical
      </span>
    )
  }

  if (priority === 'high') {
    return (
      <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
        high
      </span>
    )
  }

  return (
    <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs font-medium text-zinc-500">
      low
    </span>
  )
}

export default function BugsPageClient({ bugs, isAdmin, currentUserId }: BugsPageClientProps) {
  const supabase = useMemo(() => createClient(), [])

  const [bugRows, setBugRows] = useState<BugWithReporter[]>(bugs)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingBugId, setDeletingBugId] = useState<string | null>(null)
  const [notesDraftById, setNotesDraftById] = useState<Record<string, string>>(() =>
    bugs.reduce<Record<string, string>>((acc, bug) => {
      acc[bug.id] = bug.admin_notes ?? ''
      return acc
    }, {}),
  )
  const [savedByBugId, setSavedByBugId] = useState<Record<string, boolean>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const filteredRows = useMemo(() => {
    return bugRows.filter((bug) => {
      const matchesType = typeFilter === 'all' || bug.type === typeFilter
      const matchesStatus = statusFilter === 'all' || bug.status === statusFilter
      return matchesType && matchesStatus
    })
  }, [bugRows, statusFilter, typeFilter])

  const statusCounts = useMemo(() => {
    return bugRows.reduce(
      (acc, bug) => {
        acc[bug.status] += 1
        return acc
      },
      { new: 0, in_progress: 0, resolved: 0, closed: 0 },
    )
  }, [bugRows])

  const typeCounts = useMemo(() => {
    return bugRows.reduce(
      (acc, bug) => {
        if (bug.type === 'feature_request') {
          acc.feature_request += 1
        } else {
          acc.bug += 1
        }
        return acc
      },
      { bug: 0, feature_request: 0 },
    )
  }, [bugRows])

  function markSaved(bugId: string) {
    setSavedByBugId((prev) => ({ ...prev, [bugId]: true }))
    window.setTimeout(() => {
      setSavedByBugId((prev) => {
        if (!prev[bugId]) return prev
        const next = { ...prev }
        delete next[bugId]
        return next
      })
    }, 2000)
  }

  function showError(message: string) {
    setErrorMessage(message)
    window.setTimeout(() => setErrorMessage(null), 2500)
  }

  async function updateBug(
    bugId: string,
    patch: Partial<Pick<BugWithReporter, 'status' | 'priority' | 'admin_notes'>>,
  ) {
    const previous = bugRows.find((bug) => bug.id === bugId)
    if (!previous) return

    const nextUpdatedAt = new Date().toISOString()

    setBugRows((prev) =>
      prev.map((bug) => (bug.id === bugId ? { ...bug, ...patch, updated_at: nextUpdatedAt } : bug)),
    )

    const { error } = await supabase
      .from('bug_reports')
      .update({ ...patch, updated_at: nextUpdatedAt })
      .eq('id', bugId)

    if (error) {
      setBugRows((prev) => prev.map((bug) => (bug.id === bugId ? previous : bug)))
      showError('Unable to save changes. Please try again.')
      return
    }

    markSaved(bugId)
  }

  async function deleteBugReport(bugId: string) {
    const bugToDelete = bugRows.find((bug) => bug.id === bugId)
    if (!bugToDelete) return

    const originalIndex = bugRows.findIndex((bug) => bug.id === bugId)
    setDeleteConfirmId(null)
    setDeletingBugId(bugId)
    setExpandedId((prev) => (prev === bugId ? null : prev))
    setBugRows((prev) => prev.filter((bug) => bug.id !== bugId))

    try {
      if (bugToDelete.screenshot_url) {
        try {
          const storagePath = extractStoragePathFromPublicUrl(bugToDelete.screenshot_url)
          if (storagePath) {
            await supabase.storage.from('bug-screenshots').remove([storagePath])
          }
        } catch {
          // Best-effort cleanup; do not block bug report deletion.
        }
      }

      const { error } = await supabase
        .from('bug_reports')
        .delete()
        .eq('id', bugId)

      if (error) {
        throw error
      }

      setNotesDraftById((prev) => {
        const next = { ...prev }
        delete next[bugId]
        return next
      })
      setSavedByBugId((prev) => {
        const next = { ...prev }
        delete next[bugId]
        return next
      })
    } catch {
      setBugRows((prev) => {
        if (prev.some((bug) => bug.id === bugToDelete.id)) return prev
        const next = [...prev]
        const insertAt = originalIndex < 0 ? next.length : Math.min(originalIndex, next.length)
        next.splice(insertAt, 0, bugToDelete)
        return next
      })
      setExpandedId(bugId)
      showError('Unable to delete this report. Please try again.')
    } finally {
      setDeletingBugId(null)
    }
  }

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Bug className="h-6 w-6 text-amber-400" />
            Bug Reports
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Track bugs and feature requests across Helm</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400">
            New {statusCounts.new}
          </span>
          <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400">
            In Progress {statusCounts.in_progress}
          </span>
          <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400">
            Resolved {statusCounts.resolved}
          </span>
          <span className="rounded-full bg-zinc-700/50 px-2 py-1 text-xs font-medium text-zinc-400">
            Closed {statusCounts.closed}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400">
            <Bug className="h-3 w-3" />
            {typeCounts.bug}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-1 text-xs font-medium text-purple-400">
            <Lightbulb className="h-3 w-3" />
            {typeCounts.feature_request}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/40 p-2">
        <div className="flex flex-wrap items-center gap-1">
          {([
            { value: 'all', label: 'All' },
            { value: 'bug', label: 'Bugs' },
            { value: 'feature_request', label: 'Features' },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTypeFilter(option.value)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === option.value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mx-3 h-5 self-center border-l border-zinc-700" />

        <div className="flex flex-wrap items-center gap-1">
          {([
            { value: 'all', label: 'All' },
            { value: 'new', label: 'New' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === option.value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filteredRows.length === 0 ? (
          <EmptyState typeFilter={typeFilter} statusFilter={statusFilter} />
        ) : (
          filteredRows.map((bug) => {
            const isExpanded = expandedId === bug.id
            const reporterLabel = bug.reporter_id === currentUserId ? 'You' : bug.reporter_name
            const browser = parseBrowserName(bug.user_agent)

            return (
              <div
                key={bug.id}
                className="cursor-pointer rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4 transition-all hover:border-zinc-600/50 hover:bg-zinc-800/60"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : bug.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-3">
                    {bug.type === 'feature_request' ? (
                      <Lightbulb className="h-4 w-4 text-purple-400" />
                    ) : (
                      <Bug className="h-4 w-4 text-red-400" />
                    )}
                    <p className="flex-1 truncate text-sm font-medium text-white">{bug.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLES[bug.status]}`}
                    >
                      {STATUS_LABELS[bug.status]}
                    </span>
                    <PriorityBadge priority={bug.priority} />
                    <ChevronDown
                      className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {reporterLabel}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(bug.created_at)}
                    </span>
                    <span>·</span>
                    <span className="truncate">{getPathPreview(bug.page_url)}</span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="mt-4 border-t border-zinc-700/50 pt-4">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      <div className="lg:col-span-2">
                        <div>
                          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Description</p>
                          {bug.description ? (
                            <p className="whitespace-pre-wrap text-sm text-zinc-300">{bug.description}</p>
                          ) : (
                            <p className="text-sm italic text-zinc-500">No description provided.</p>
                          )}
                        </div>

                        {bug.screenshot_url ? (
                          <div className="mt-5">
                            <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Screenshot</p>
                            <img
                              src={bug.screenshot_url}
                              alt="Bug screenshot"
                              className="max-h-64 cursor-pointer rounded-lg border border-zinc-700 object-contain"
                              onClick={() => window.open(bug.screenshot_url!, '_blank')}
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="lg:col-span-1">
                        <div className="space-y-4 rounded-lg bg-zinc-900/50 p-4">
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Status</p>
                            <p className="mt-1 text-sm text-zinc-200">{STATUS_LABELS[bug.status]}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Priority</p>
                            <p className="mt-1 text-sm text-zinc-200">{bug.priority}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Reporter</p>
                            <p className="mt-1 text-sm text-zinc-200">{reporterLabel}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Submitted</p>
                            <p className="mt-1 text-sm text-zinc-200">{formatSubmittedDate(bug.created_at)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Page</p>
                            <a
                              href={bug.page_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-start gap-1 break-all text-xs text-amber-400 hover:underline"
                            >
                              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{bug.page_url}</span>
                              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            </a>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Viewport</p>
                            <p className="mt-1 inline-flex items-center gap-1 text-sm text-zinc-200">
                              <Monitor className="h-3.5 w-3.5" />
                              {bug.viewport || 'Unknown'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Browser</p>
                            <p className="mt-1 text-sm text-zinc-200">{browser}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {isAdmin ? (
                      <div className="mt-6 border-t border-zinc-700/50 pt-6">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-amber-400" />
                          <p className="text-sm font-medium text-zinc-300">Admin Controls</p>
                        </div>

                        <div className="mt-3 flex flex-wrap items-start gap-4">
                          <div>
                            <label className="mb-1 block text-xs text-zinc-500">Status</label>
                            <select
                              value={bug.status}
                              onChange={(event) =>
                                void updateBug(bug.id, {
                                  status: event.target.value as BugWithReporter['status'],
                                })
                              }
                              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-amber-500/50 focus:outline-none"
                            >
                              <option value="new">New</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                              <option value="closed">Closed</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs text-zinc-500">Priority</label>
                            <select
                              value={bug.priority}
                              onChange={(event) =>
                                void updateBug(bug.id, {
                                  priority: event.target.value as BugWithReporter['priority'],
                                })
                              }
                              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-amber-500/50 focus:outline-none"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>

                          <div className="min-w-[200px] flex-1">
                            <label className="mb-1 block text-xs text-zinc-500">Admin Notes</label>
                            <textarea
                              rows={2}
                              placeholder="Internal notes..."
                              value={notesDraftById[bug.id] ?? ''}
                              onChange={(event) =>
                                setNotesDraftById((prev) => ({ ...prev, [bug.id]: event.target.value }))
                              }
                              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 p-3 text-sm text-white"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void updateBug(bug.id, {
                                  admin_notes: (notesDraftById[bug.id] ?? '').trim() || null,
                                })
                              }
                              className="mt-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                            >
                              Save Notes
                            </button>
                          </div>

                          <div className="ml-auto self-end">
                            {deleteConfirmId === bug.id ? (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <p className="text-sm text-red-400">
                                  Delete this report? This cannot be undone.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteBugReport(bug.id)}
                                  disabled={deletingBugId === bug.id}
                                  className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingBugId === bug.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(bug.id)}
                                disabled={deletingBugId === bug.id}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete Report
                              </button>
                            )}
                          </div>
                        </div>

                        {savedByBugId[bug.id] ? (
                          <p className="mt-3 text-xs text-green-400 transition-opacity">Saved</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
