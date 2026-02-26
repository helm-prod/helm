import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { PanelDetailClient } from './panel-detail-client'

export default async function PanelDetailPage({
  params,
}: {
  params: { id: string; panelId: string }
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

  const { data: panel } = await supabase
    .from('panels')
    .select(
      '*, assignee:profiles!assigned_to(id, full_name, email), requester:profiles!requester_id(id, full_name, email), event:ad_week_events!event_id(*), ad_week:ad_weeks!ad_week_id(*)'
    )
    .eq('id', params.panelId)
    .single()

  if (!panel) notFound()

  const { data: producers } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role', ['admin', 'producer'])
    .order('full_name')

  const { data: events } = await supabase
    .from('ad_week_events')
    .select('*')
    .eq('ad_week_id', params.id)
    .order('event_code')

  // Check if this panel came from an upload and had conflicts
  let conflicts: unknown[] = []
  if (panel.upload_id) {
    const { data: conflictData } = await supabase
      .from('panel_conflicts')
      .select('*')
      .eq('panel_id', params.panelId)
    conflicts = conflictData ?? []
  }

  return (
    <PanelDetailClient
      profile={profile as Profile}
      panel={panel}
      producers={producers ?? []}
      events={events ?? []}
      adWeekId={params.id}
      conflicts={conflicts}
    />
  )
}
