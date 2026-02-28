import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageGuard } from '@/components/page-guard'

interface UploadSummary {
  rows_skipped_empty?: number
  panels_created_by_category?: Array<{ category: string; count: number }>
  aor_assignment_summary?: Array<{
    producer_id: string
    producer_name: string
    panel_count: number
    aor_fallback_count: number
  }>
  conflicts?: Array<{
    row: number
    page_location: string
    panel_name: string
    priority: number | null
    first_seen_row: number | null
    message: string
  }>
  calendar_seed?: {
    weeks_created: number
    weeks_updated: number
    created: Array<{ week_number: number; year: number; start_date: string; end_date: string }>
    updated: Array<{ week_number: number; year: number; start_date: string; end_date: string }>
  }
}

function formatDateRange(startDate: string, endDate: string) {
  const format = (value: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value))
  return `${format(startDate)} - ${format(endDate)}`
}

export default async function UploadResultPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: upload } = await supabase
    .from('uploads')
    .select(
      'id, filename, upload_type, status, total_rows, imported_rows, conflict_rows, error_log, summary, created_at, ad_week:ad_weeks!ad_week_id(id, label, week_number, year)'
    )
    .eq('id', params.id)
    .single()

  if (!upload) notFound()

  const summary = (upload.summary as UploadSummary | null) ?? {}

  const [panelsRes, conflictsRes] = upload.upload_type === 'ad_week_calendar'
    ? [{ data: [] }, { data: [] }]
    : await Promise.all([
      supabase
        .from('panels')
        .select('id, category, event_id, assignee:profiles!assigned_to(id, full_name)')
        .eq('upload_id', upload.id),
      supabase
        .from('panel_conflicts')
        .select('id, conflict_type, uploaded_data')
        .eq('upload_id', upload.id)
        .order('created_at', { ascending: true })
        .limit(100),
    ])

  const panels = panelsRes.data ?? []
  const distinctEventCount = new Set(panels.map((panel) => panel.event_id).filter(Boolean)).size

  const fallbackBreakdownMap = new Map<string, { category: string; producer: string; count: number }>()
  for (const panel of panels) {
    const assignee = Array.isArray(panel.assignee) ? panel.assignee[0] : panel.assignee
    const producer = assignee?.full_name || 'Unassigned'
    const key = `${panel.category}::${producer}`
    const current = fallbackBreakdownMap.get(key)
    if (current) {
      current.count += 1
    } else {
      fallbackBreakdownMap.set(key, {
        category: panel.category,
        producer,
        count: 1,
      })
    }
  }

  const fallbackBreakdown = Array.from(fallbackBreakdownMap.values()).sort((a, b) => {
    if (a.category === b.category) return b.count - a.count
    return a.category.localeCompare(b.category)
  })

  const errors = (upload.error_log as Array<{ row: number; message: string }> | null) ?? []
  const conflicts = conflictsRes.data ?? []
  const adWeek = Array.isArray(upload.ad_week) ? upload.ad_week[0] : upload.ad_week
  const weekLabel = adWeek?.label || `WK ${adWeek?.week_number ?? '-'}`

  const rowsSkipped = summary.rows_skipped_empty ?? 0

  return (
    <PageGuard pageSlug="upload">
      <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <p className="text-sm text-brand-400">Import Results</p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          {upload.upload_type === 'ad_week_calendar'
            ? `Calendar seed processed ${upload.imported_rows} rows`
            : `Imported ${upload.imported_rows} panels across ${distinctEventCount} events for ${weekLabel}`}
        </h1>
        <p className="mt-2 text-sm text-brand-400">
          File: {upload.filename} / {new Date(upload.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <MetricCard label="Spreadsheet Rows" value={upload.total_rows} tone="text-blue-300" />
          <MetricCard label="Skipped Empty" value={rowsSkipped} tone="text-slate-300" />
          <MetricCard label="Created" value={upload.imported_rows} tone="text-emerald-300" />
          <MetricCard label="Conflicts" value={upload.conflict_rows} tone="text-amber-300" />
          <MetricCard label="Errors" value={errors.length} tone="text-red-300" />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {adWeek?.id && (
            <Link
              href={`/ad-weeks/${adWeek.id}`}
              className="rounded-full bg-nex-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-nex-redDark"
            >
              View Week
            </Link>
          )}
          <Link
            href="/upload"
            className="rounded-full border border-brand-700 px-4 py-2 text-sm font-medium text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
          >
            Upload Another
          </Link>
          {upload.conflict_rows > 0 && (
            <Link
              href={`/upload/${upload.id}/conflicts`}
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
            >
              Resolve Conflicts ({upload.conflict_rows})
            </Link>
          )}
        </div>
      </div>

      {summary.calendar_seed && (
        <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
          <h2 className="text-lg font-semibold text-white">Calendar Seed Summary</h2>
          <p className="mt-2 text-sm text-brand-400">
            Weeks created: {summary.calendar_seed.weeks_created} / Weeks updated: {summary.calendar_seed.weeks_updated}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-brand-300">Created</h3>
              {summary.calendar_seed.created.length === 0 ? (
                <p className="mt-2 text-sm text-brand-500">No new weeks created.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {summary.calendar_seed.created.map((week) => (
                    <li key={`created-${week.year}-${week.week_number}`} className="rounded-lg border border-brand-800 bg-brand-900/50 px-3 py-2 text-sm text-brand-200">
                      WK {week.week_number} ({week.year}) - {formatDateRange(week.start_date, week.end_date)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-brand-300">Updated</h3>
              {summary.calendar_seed.updated.length === 0 ? (
                <p className="mt-2 text-sm text-brand-500">No existing weeks updated.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {summary.calendar_seed.updated.map((week) => (
                    <li key={`updated-${week.year}-${week.week_number}`} className="rounded-lg border border-brand-800 bg-brand-900/50 px-3 py-2 text-sm text-brand-200">
                      WK {week.week_number} ({week.year}) - {formatDateRange(week.start_date, week.end_date)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {upload.upload_type !== 'ad_week_calendar' && (
        <>
          <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
            <h2 className="text-lg font-semibold text-white">Panels Created by Category</h2>
            {(summary.panels_created_by_category ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-brand-500">No imported panels to summarize yet.</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-brand-800">
                <table className="w-full text-sm">
                  <thead className="bg-brand-900/80">
                    <tr className="text-brand-400">
                      <th className="px-4 py-3 text-left font-medium">Category</th>
                      <th className="px-4 py-3 text-left font-medium">Panels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.panels_created_by_category ?? []).map((item, index) => (
                      <tr key={item.category} className={index % 2 === 0 ? 'bg-brand-900/40' : 'bg-brand-900/10'}>
                        <td className="px-4 py-3 text-white">{item.category}</td>
                        <td className="px-4 py-3 text-brand-300">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
            <h2 className="text-lg font-semibold text-white">AOR Assignment Summary</h2>
            {(summary.aor_assignment_summary ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-brand-500">No assignment summary found. Showing fallback from imported rows.</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-brand-800">
                <table className="w-full text-sm">
                  <thead className="bg-brand-900/80">
                    <tr className="text-brand-400">
                      <th className="px-4 py-3 text-left font-medium">Producer</th>
                      <th className="px-4 py-3 text-left font-medium">Panels</th>
                      <th className="px-4 py-3 text-left font-medium">No AOR Fallbacks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.aor_assignment_summary ?? []).map((item, index) => (
                      <tr key={item.producer_id} className={index % 2 === 0 ? 'bg-brand-900/40' : 'bg-brand-900/10'}>
                        <td className="px-4 py-3 text-white">{item.producer_name}</td>
                        <td className="px-4 py-3 text-brand-300">{item.panel_count}</td>
                        <td className="px-4 py-3 text-brand-300">{item.aor_fallback_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(summary.aor_assignment_summary ?? []).length === 0 && fallbackBreakdown.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm text-brand-300">
                {fallbackBreakdown.map((item) => (
                  <li key={`${item.category}-${item.producer}`}>
                    {item.category} - {item.producer}: {item.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {(errors.length > 0 || conflicts.length > 0 || (summary.conflicts ?? []).length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
            <h2 className="text-lg font-semibold text-red-200">Errors</h2>
            {errors.length === 0 ? (
              <p className="mt-3 text-sm text-brand-500">No row errors reported.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {errors.slice(0, 50).map((error, index) => (
                  <li key={`${error.row}-${index}`} className="rounded-lg border border-red-500/20 bg-brand-900/40 px-3 py-2 text-sm text-red-200">
                    Row {error.row}: {error.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <h2 className="text-lg font-semibold text-amber-200">Conflicts</h2>
            {upload.conflict_rows === 0 ? (
              <p className="mt-3 text-sm text-brand-500">No conflicts found.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {(summary.conflicts ?? []).map((conflict, index) => (
                  <li key={`summary-${conflict.row}-${index}`} className="rounded-lg border border-amber-500/20 bg-brand-900/40 px-3 py-2 text-sm text-amber-100">
                    Row {conflict.row}: {conflict.page_location} / {conflict.panel_name} / Priority {conflict.priority ?? '-'}
                  </li>
                ))}
                {(summary.conflicts ?? []).length === 0 && conflicts.map((conflict) => {
                  const payload = conflict.uploaded_data as Record<string, unknown>
                  const location = String(payload?.page_location ?? 'Unknown')
                  const panelName = String(payload?.panel_name ?? payload?.panel_type ?? 'Unknown')
                  const priority = String(payload?.priority ?? '-')
                  return (
                    <li key={conflict.id} className="rounded-lg border border-amber-500/20 bg-brand-900/40 px-3 py-2 text-sm text-amber-100">
                      {location} / {panelName} / Priority {priority}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      </div>
    </PageGuard>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-brand-800 bg-brand-900/70 p-4">
      <p className="text-xs uppercase tracking-wide text-brand-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  )
}
