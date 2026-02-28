import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { AdWeekDetailClient } from './ad-week-detail-client'
import { PageGuard } from '@/components/page-guard'

export default async function AdWeekDetailPage({
  params,
}: {
  params: { id: string }
}) {
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

  const { data: adWeek } = await supabase
    .from('ad_weeks')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!adWeek) notFound()

  const { data: events } = await supabase
    .from('ad_week_events')
    .select('*')
    .eq('ad_week_id', params.id)
    .order('event_code')

  const { data: panels } = await supabase
    .from('panels')
    .select('*, assignee:profiles!assigned_to(id, full_name, email), event:ad_week_events!event_id(id, event_code, event_name)')
    .eq('ad_week_id', params.id)
    .order('page_location')
    .order('priority')

  const { data: producers } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['admin', 'senior_web_producer', 'producer'])
    .order('full_name')

  const { data: aorAssignments } = await supabase
    .from('aor_assignments')
    .select('producer_id, category')

  return (
    <PageGuard pageSlug="ad-weeks">
      <AdWeekDetailClient
        profile={profile as Profile}
        adWeek={adWeek}
        events={events ?? []}
        panels={panels ?? []}
        producers={producers ?? []}
        aorAssignments={aorAssignments ?? []}
      />
    </PageGuard>
  )
}
