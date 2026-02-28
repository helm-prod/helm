import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Profile, AdWeekStatus } from '@/lib/types/database'
import { AD_WEEK_STATUS_LABELS, AD_WEEK_STATUS_COLORS } from '@/lib/types/database'
import { AdWeekCreateButton } from './ad-weeks-client'
import { PageGuard } from '@/components/page-guard'

export default async function AdWeeksPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const p = profile as Profile
  const canCreate = p.role === 'admin' || p.role === 'producer'

  const { data: adWeeks } = await supabase
    .from('ad_weeks')
    .select('*, events:ad_week_events(*)')
    .order('year', { ascending: false })
    .order('week_number', { ascending: false })

  // Get panel counts per ad_week
  const { data: panelCounts } = await supabase
    .from('panels')
    .select('ad_week_id, archived')

  const countMap: Record<string, number> = {}
  const archivedCountMap: Record<string, number> = {}
  for (const row of panelCounts ?? []) {
    if (row.archived) {
      archivedCountMap[row.ad_week_id] = (archivedCountMap[row.ad_week_id] || 0) + 1
    } else {
      countMap[row.ad_week_id] = (countMap[row.ad_week_id] || 0) + 1
    }
  }

  return (
    <PageGuard pageSlug="ad-weeks">
      <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Ad Weeks</h1>
          <p className="text-brand-400 mt-1">
            Manage weekly promotional panels and events.
          </p>
        </div>
        {canCreate && <AdWeekCreateButton />}
      </div>

      <div className="bg-brand-900 border border-brand-800 rounded-xl overflow-hidden">
        {!adWeeks || adWeeks.length === 0 ? (
          <div className="px-6 py-12 text-center text-brand-500">
            No ad weeks yet. Create one to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-800 text-brand-400">
                  <th className="text-left px-4 py-3 font-medium">Week</th>
                  <th className="text-left px-4 py-3 font-medium">Year</th>
                  <th className="text-left px-4 py-3 font-medium">Events</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Panels</th>
                  <th className="text-left px-4 py-3 font-medium">Date Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-800/50">
                {adWeeks.map((week: {
                  id: string
                  week_number: number
                  year: number
                  label: string | null
                  status: AdWeekStatus
                  start_date: string | null
                  end_date: string | null
                  events: Array<{
                    id: string
                    event_code: string
                    event_name: string | null
                    start_date: string | null
                    end_date: string | null
                  }>
                }, index: number) => {
                  const events = week.events ?? []
                  const dates = events
                    .flatMap((e) => [e.start_date, e.end_date])
                    .filter(Boolean) as string[]
                  const minDate = week.start_date || (dates.length > 0 ? dates.sort()[0] : null)
                  const maxDate = week.end_date || (dates.length > 0 ? dates.sort().reverse()[0] : null)

                  return (
                    <tr
                      key={week.id}
                      className={`${index % 2 === 0 ? 'bg-brand-900/30' : 'bg-brand-900/10'} hover:bg-brand-800/30 transition-colors`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/ad-weeks/${week.id}`}
                          className="text-white hover:text-brand-300 font-medium transition-colors"
                        >
                          {week.label || `WK ${week.week_number}`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-brand-400">{week.year}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {events.length === 0 ? (
                            <span className="text-brand-600">—</span>
                          ) : (
                            events.map((e) => (
                              <span
                                key={e.id}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-brand-800 text-brand-300"
                                title={e.event_name || undefined}
                              >
                                {e.event_code}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${AD_WEEK_STATUS_COLORS[week.status]}`}
                        >
                          {AD_WEEK_STATUS_LABELS[week.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-brand-400">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{countMap[week.id] ?? 0}</span>
                          {(archivedCountMap[week.id] ?? 0) > 0 && (
                            <span className="inline-flex items-center rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-xs text-fuchsia-200">
                              +{archivedCountMap[week.id]} archived
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-brand-400 text-xs">
                        {minDate && maxDate
                          ? `${new Date(minDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(maxDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </PageGuard>
  )
}
