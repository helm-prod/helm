'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bug, ChevronDown, Clock, Monitor, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { BugReport, UserRole } from '@/lib/types/database'

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

type StatusFilter = 'all' | BugReport['status']
type Toast = {
  tone: 'success' | 'error'
  message: string
}

export type BugReportWithReporter = BugReport & {
  reporter: { full_name: string | null } | null
}

const STATUS_LABELS: Record<BugReport['status'], string> = {
  new: 'New',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const STATUS_BADGE_CLASSES: Record<BugReport['status'], string> = {
  new: 'border-red-500/30 bg-red-500/10 text-red-300',
  in_progress: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  resolved: 'border-green-500/30 bg-green-500/10 text-green-300',
  closed: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
}

const PRIORITY_BADGE_CLASSES: Record<BugReport['priority'], string> = {
  low: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
  medium: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
  high: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  critical: 'border-red-500/30 bg-red-500/10 text-red-300',
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

type Props = {
  initialBugs: BugReportWithReporter[]
  currentUserRole: UserRole
}

export function BugsPageClient({ initialBugs, currentUserRole }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const isAdmin = currentUserRole === 'admin'

  const [bugs, setBugs] = useState<BugReportWithReporter[]>(initialBugs)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expandedBugId, setExpandedBugId] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [notesDraftById, setNotesDraftById] = useState<Record<string, string>>(() =>
    initialBugs.reduce<Record<string, string>>((acc, bug) => {
      acc[bug.id] = bug.admin_notes ?? ''
      return acc
    }, {}),
  )

  function showToast(tone: Toast['tone'], message: string) {
    setToast({ tone, message })
    window.setTimeout(() => setToast(null), 2200)
  }

  const filteredBugs = useMemo(() => {
    if (filter === 'all') return bugs
    return bugs.filter((bug) => bug.status === filter)
  }, [bugs, filter])

  const statusCounts = useMemo(() => {
    return bugs.reduce(
      (acc, bug) => {
        acc[bug.status] += 1
        return acc
      },
      { new: 0, in_progress: 0, resolved: 0, closed: 0 },
    )
  }, [bugs])

  async function updateBug(
    bugId: string,
    patch: Partial<Pick<BugReport, 'status' | 'priority' | 'admin_notes'>>,
    successMessage: string,
  ) {
    const previousBug = bugs.find((bug) => bug.id === bugId)
    if (!previousBug) return

    const nextUpdatedAt = new Date().toISOString()
    const patchKey = Object.keys(patch).join('-')
    setSavingKey(`${bugId}:${patchKey}`)

    setBugs((prev) =>
      prev.map((bug) =>
        bug.id === bugId ? { ...bug, ...patch, updated_at: nextUpdatedAt } : bug,
      ),
    )

    const { error } = await supabase
      .from('bug_reports')
      .update({ ...patch, updated_at: nextUpdatedAt })
      .eq('id', bugId)

    if (error) {
      setBugs((prev) => prev.map((bug) => (bug.id === bugId ? previousBug : bug)))
      showToast('error', error.message)
      setSavingKey(null)
      return
    }

    showToast('success', successMessage)
    router.refresh()
    setSavingKey(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-lg border px-3 py-2 text-sm shadow-lg ${
            toast.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
              : 'border-red-500/30 bg-red-500/15 text-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Bug className="h-6 w-6 text-amber-400" />
          Bug Reports
        </h1>
        <p className="mt-1 text-zinc-400">Track reported issues and monitor fix progress.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
          New: {statusCounts.new}
        </span>
        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          In Progress: {statusCounts.in_progress}
        </span>
        <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-300">
          Resolved: {statusCounts.resolved}
        </span>
        <span className="inline-flex items-center rounded-full border border-zinc-500/30 bg-zinc-500/10 px-3 py-1 text-xs font-medium text-zinc-300">
          Closed: {statusCounts.closed}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 p-2">
        {([
          { value: 'all', label: 'All' },
          { value: 'new', label: 'New' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'closed', label: 'Closed' },
        ] as const).map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              filter === item.value
                ? 'bg-amber-500 text-black'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredBugs.length === 0 ? (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-4 py-10 text-center text-zinc-400">
            No bug reports found for this filter.
          </div>
        ) : (
          filteredBugs.map((bug) => {
            const isExpanded = expandedBugId === bug.id
            const reporterName = bug.reporter?.full_name || 'Unknown reporter'
            const isSavingStatus = savingKey === `${bug.id}:status`
            const isSavingPriority = savingKey === `${bug.id}:priority`
            const isSavingNotes = savingKey === `${bug.id}:admin_notes`
            const notesValue = notesDraftById[bug.id] ?? ''

            return (
              <div
                key={bug.id}
                className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-800/50"
              >
                <button
                  type="button"
                  onClick={() => setExpandedBugId(isExpanded ? null : bug.id)}
                  className="w-full p-4 text-left hover:bg-zinc-800/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{bug.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {reporterName}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatRelativeTime(bug.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[bug.status]}`}
                      >
                        {STATUS_LABELS[bug.status]}
                      </span>
                      {bug.priority !== 'medium' && (
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASSES[bug.priority]}`}
                        >
                          {bug.priority}
                        </span>
                      )}
                      <ChevronDown
                        className={`h-4 w-4 text-zinc-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>

                  <p className="mt-2 truncate text-xs text-zinc-500">{bug.page_url}</p>
                  {bug.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{bug.description}</p>
                  ) : null}
                </button>

                {isExpanded && (
                  <div className="space-y-4 border-t border-zinc-700/60 px-4 py-4">
                    <div>
                      <h3 className="text-sm font-medium text-zinc-200">Description</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">
                        {bug.description || 'No description provided.'}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-zinc-200">Screenshot</h3>
                      {bug.screenshot_url ? (
                        <a
                          href={bug.screenshot_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block overflow-hidden rounded-lg border border-zinc-700"
                        >
                          <img
                            src={bug.screenshot_url}
                            alt="Bug screenshot"
                            className="max-h-72 w-full object-contain"
                          />
                        </a>
                      ) : (
                        <p className="mt-1 text-sm text-zinc-400">No screenshot available.</p>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Page Title</p>
                        <p className="mt-1 text-sm text-zinc-200">{bug.page_title || 'Unknown'}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                        <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500">
                          <Monitor className="h-3.5 w-3.5" />
                          Viewport
                        </p>
                        <p className="mt-1 text-sm text-zinc-200">{bug.viewport || 'Unknown'}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                      <p className="text-xs uppercase tracking-wide text-zinc-500">User Agent</p>
                      <p className="mt-1 break-all text-sm text-zinc-300">{bug.user_agent || 'Unknown'}</p>
                    </div>

                    {isAdmin ? (
                      <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                        <h3 className="text-sm font-semibold text-white">Admin</h3>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                              Status
                            </label>
                            <select
                              value={bug.status}
                              onChange={(event) =>
                                void updateBug(
                                  bug.id,
                                  { status: event.target.value as BugReport['status'] },
                                  'Status updated.',
                                )
                              }
                              disabled={isSavingStatus}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                            >
                              <option value="new">New</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                              <option value="closed">Closed</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                              Priority
                            </label>
                            <select
                              value={bug.priority}
                              onChange={(event) =>
                                void updateBug(
                                  bug.id,
                                  { priority: event.target.value as BugReport['priority'] },
                                  'Priority updated.',
                                )
                              }
                              disabled={isSavingPriority}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                            Admin Notes
                          </label>
                          <textarea
                            value={notesValue}
                            onChange={(event) =>
                              setNotesDraftById((prev) => ({
                                ...prev,
                                [bug.id]: event.target.value,
                              }))
                            }
                            rows={4}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                            placeholder="Internal notes for the team..."
                          />
                          <div className="mt-2 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                void updateBug(
                                  bug.id,
                                  { admin_notes: notesValue.trim() || null },
                                  'Admin notes saved.',
                                )
                              }
                              disabled={isSavingNotes || (bug.admin_notes ?? '') === notesValue}
                              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Save
                            </button>
                            {isSavingStatus || isSavingPriority || isSavingNotes ? (
                              <span className="text-xs text-zinc-400">Saving changes...</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 text-sm text-zinc-300">
                        <p>
                          Status:{' '}
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[bug.status]}`}
                          >
                            {STATUS_LABELS[bug.status]}
                          </span>
                        </p>
                        <p className="mt-2">
                          Priority:{' '}
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASSES[bug.priority]}`}
                          >
                            {bug.priority}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
