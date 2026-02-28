import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PriorityBadge } from '@/components/priority-badge'
import { StaticStatusBadge } from '@/components/status-badge'
import { PageGuard } from '@/components/page-guard'
import { Ga4Section } from '@/components/dashboard/ga4-section'
import {
  type Profile,
  REQUEST_TYPE_LABELS,
  type RequestType,
  type WorkRequest,
} from '@/lib/types/database'

export default async function DashboardPage() {
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

  const activeStatuses = ['turn_in', 'in_production', 'proofing']

  const [activeWeeksRes, currentWeekRes, recentRequestsRes, allProfilesRes] = await Promise.all([
    supabase
      .from('ad_weeks')
      .select('id, week_number, year, label, status')
      .in('status', activeStatuses),
    supabase
      .from('ad_weeks')
      .select('id, week_number, year, label, status')
      .in('status', ['in_production', 'proofing'])
      .order('year', { ascending: false })
      .order('week_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('work_requests')
      .select('*, requester:profiles!requester_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name'),
  ])

  const activeWeeks = activeWeeksRes.data ?? []
  const activeWeekIds = activeWeeks.map((week) => week.id)

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [myOpenPanelsRes, designNeededRes, completedThisWeekRes, currentWeekPanelsRes] = await Promise.all([
    activeWeekIds.length > 0
      ? supabase
        .from('panels')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .in('ad_week_id', activeWeekIds)
        .not('status', 'in', '("complete","cancelled")')
      : Promise.resolve({ count: 0 } as { count: number | null }),
    activeWeekIds.length > 0
      ? supabase
        .from('panels')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'design_needed')
        .in('ad_week_id', activeWeekIds)
      : Promise.resolve({ count: 0 } as { count: number | null }),
    supabase
      .from('panels')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'complete')
      .gte('updated_at', sevenDaysAgo.toISOString()),
    currentWeekRes.data
      ? supabase
        .from('panels')
        .select('id, priority, status, generated_description, item_description, category, event:ad_week_events!event_id(event_code)')
        .eq('ad_week_id', currentWeekRes.data.id)
        .order('priority', { ascending: true })
      : Promise.resolve({ data: [] } as { data: Array<Record<string, unknown>> }),
  ])

  const currentWeekPanels = (currentWeekPanelsRes.data ?? []) as Array<{
    id: string
    priority: number | null
    status: string
    generated_description: string | null
    item_description: string | null
    category: string
    event: { event_code: string } | null
  }>

  const currentWeekOpenPanels = currentWeekPanels.filter(
    (panel) => panel.status !== 'complete' && panel.status !== 'cancelled'
  )
  const currentWeekTopFive = currentWeekOpenPanels.slice(0, 5)
  const currentWeekComplete = currentWeekPanels.filter((panel) => panel.status === 'complete').length
  const currentWeekTotal = currentWeekPanels.filter((panel) => panel.status !== 'cancelled').length
  const currentWeekProgress =
    currentWeekTotal === 0 ? 0 : Math.round((currentWeekComplete / currentWeekTotal) * 100)

  const stats = [
    { label: 'Active Ad Weeks', value: activeWeeks.length, tone: 'text-blue-300' },
    { label: 'My Open Panels', value: myOpenPanelsRes.count ?? 0, tone: 'text-indigo-300' },
    { label: 'Panels Needing Design', value: designNeededRes.count ?? 0, tone: 'text-amber-300' },
    { label: 'Completed This Week', value: completedThisWeekRes.count ?? 0, tone: 'text-emerald-300' },
  ]

  const recentRequests = (recentRequestsRes.data ?? []) as (WorkRequest & {
    requester: { full_name: string } | null
  })[]
  const allProfiles = (allProfilesRes.data ?? []) as Array<{ id: string; full_name: string }>

  return (
    <PageGuard pageSlug="dashboard">
      <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-brand-400">Production health, weekly focus, and incoming ad-hoc requests.</p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-brand-800 bg-brand-900 p-5">
            <p className="text-sm text-brand-400">{stat.label}</p>
            <p className={`mt-1 text-3xl font-bold ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Current Week</h2>
          {currentWeekRes.data && (
            <Link href={`/ad-weeks/${currentWeekRes.data.id}`} className="text-sm text-brand-400 hover:text-white">
              View Full Week {'->'}
            </Link>
          )}
        </div>

        {!currentWeekRes.data ? (
          <p className="mt-4 text-sm text-brand-500">No week currently in production or proofing.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-brand-300">
              {currentWeekRes.data.label || `WK ${currentWeekRes.data.week_number}`} - {currentWeekRes.data.year}
            </p>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-brand-400">
                <span>
                  {currentWeekComplete} of {currentWeekTotal || currentWeekPanels.length} complete
                </span>
                <span>{currentWeekProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-brand-800">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${currentWeekProgress}%` }} />
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {currentWeekTopFive.length === 0 ? (
                <p className="text-sm text-brand-500">No high-priority open panels in this week.</p>
              ) : (
                currentWeekTopFive.map((panel) => (
                  <div key={panel.id} className="flex items-center gap-3 rounded-xl border border-brand-800 bg-brand-900/60 px-3 py-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-brand-700 bg-brand-800 text-xs font-semibold text-white">
                      {panel.priority ?? '-'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">
                        {panel.generated_description || panel.item_description || 'No description'}
                      </p>
                      <p className="text-xs text-brand-500">
                        {panel.category}
                        {panel.event?.event_code ? ` / ${panel.event.event_code}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full border border-brand-700 px-2 py-0.5 text-xs text-brand-300">
                      {panel.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-brand-800 bg-brand-900">
        <div className="flex items-center justify-between border-b border-brand-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Recent Requests</h2>
          <Link href="/requests" className="text-sm text-brand-400 hover:text-white">
            View all
          </Link>
        </div>

        {recentRequests.length === 0 ? (
          <div className="px-6 py-12 text-center text-brand-500">
            No requests yet.{' '}
            <Link href="/requests/new" className="text-brand-400 underline-offset-2 hover:text-white hover:underline">
              Submit your first request
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-brand-800">
            {recentRequests.map((request, index) => (
              <Link
                key={request.id}
                href={`/requests/${request.id}`}
                className={`flex items-center justify-between px-6 py-4 transition-colors hover:bg-brand-800/50 ${
                  index % 2 === 0 ? 'bg-brand-900/20' : 'bg-brand-900/5'
                }`}
              >
                <div className="mr-4 min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{request.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-brand-500">
                    <span>{REQUEST_TYPE_LABELS[request.request_type as RequestType]}</span>
                    <span>/</span>
                    <span>{request.requester?.full_name ?? 'Unknown'}</span>
                    {request.ad_week && (
                      <>
                        <span>/</span>
                        <span>{request.ad_week}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <PriorityBadge priority={request.priority} />
                  <StaticStatusBadge status={request.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* GA4 Analytics */}
      {profile?.id ? (
        <div className="border-t border-brand-800 pt-8">
          <Ga4Section profileId={profile.id} allProfiles={allProfiles} userRole={profile.role} />
        </div>
      ) : null}
      </div>
    </PageGuard>
  )
}
