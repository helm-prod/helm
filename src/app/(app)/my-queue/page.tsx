import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LinkIssue, Profile, QueuePreferences, QueueSectionKey, WorkRequest } from '@/lib/types/database'
import { MyQueueClient } from './my-queue-client'
import { PageGuard } from '@/components/page-guard'

export default async function MyQueuePage() {
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

  const { data: activeWeeks } = await supabase
    .from('ad_weeks')
    .select('id')
    .neq('status', 'archived')

  const activeWeekIds = (activeWeeks ?? []).map((week) => week.id)

  const { data: panels } = activeWeekIds.length
    ? await supabase
      .from('panels')
      .select(
        '*, ad_week:ad_weeks!ad_week_id(id, week_number, year, label, status, start_date, end_date), event:ad_week_events!event_id(id, event_code, event_name), assignee:profiles!assigned_to(id, full_name, email)'
      )
      .eq('assigned_to', user.id)
      .in('ad_week_id', activeWeekIds)
      .eq('archived', false)
      .not('status', 'in', '("complete","cancelled")')
      .order('page_location', { ascending: true })
      .order('priority', { ascending: true })
    : { data: [] }

  const firstName = profile.full_name?.split(' ')[0] ?? ''

  const [
    queuePrefsRes,
    linkIssuesRes,
    correctionsRes,
    submittedRequestsRes,
    assignedRequestsRes,
  ] = await Promise.all([
    supabase
      .from('queue_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('site_quality_link_results')
      .select('id, page_label, page_url, panel_image, slot, ad_week, http_status, link_url, error_message, is_broken, resolved, resolved_by, resolved_at, aor_owner')
      .eq('resolved', false)
      .ilike('aor_owner', firstName)
      .order('page_label', { ascending: true }),
    supabase
      .from('work_requests')
      .select('id, title, description, priority, status, due_date, created_at')
      .eq('assigned_to', user.id)
      .eq('request_type', 'correction')
      .neq('status', 'complete')
      .order('due_date', { ascending: true }),
    supabase
      .from('work_requests')
      .select('id, title, request_type, priority, status, due_date, created_at')
      .eq('requester_id', user.id)
      .neq('status', 'complete')
      .order('created_at', { ascending: false }),
    supabase
      .from('work_requests')
      .select('id, title, request_type, priority, status, due_date, requester_id, created_at')
      .eq('assigned_to', user.id)
      .neq('status', 'complete')
      .order('due_date', { ascending: true }),
  ])

  let allLinkIssues: LinkIssue[] | null = null

  if (profile.role === 'admin') {
    const { data } = await supabase
      .from('site_quality_link_results')
      .select('id, page_label, page_url, panel_image, slot, ad_week, http_status, link_url, error_message, is_broken, resolved, aor_owner')
      .eq('resolved', false)
      .order('aor_owner', { ascending: true })

    allLinkIssues = (data ?? []) as LinkIssue[]
  }

  const adminDefaults: Partial<Record<QueueSectionKey, boolean>> = {
    team_overview: true,
    all_link_issues: true,
    panels: false,
    link_issues: false,
    corrections: false,
    submitted_requests: false,
    assigned_requests: false,
  }

  const producerDefaults: Partial<Record<QueueSectionKey, boolean>> = {
    panels: true,
    link_issues: true,
    corrections: true,
  }

  const defaultSections = profile.role === 'admin' ? adminDefaults : producerDefaults
  const activeSections: Partial<Record<QueueSectionKey, boolean>> =
    ((queuePrefsRes.data as QueuePreferences | null)?.sections ?? defaultSections)

  return (
    <PageGuard pageSlug="my-queue">
      <MyQueueClient
        profile={profile as Profile}
        panels={panels ?? []}
        activeSections={activeSections}
        linkIssues={(linkIssuesRes.data ?? []) as LinkIssue[]}
        allLinkIssues={allLinkIssues}
        corrections={(correctionsRes.data ?? []) as WorkRequest[]}
        submittedRequests={(submittedRequestsRes.data ?? []) as WorkRequest[]}
        assignedRequests={(assignedRequestsRes.data ?? []) as WorkRequest[]}
      />
    </PageGuard>
  )
}
