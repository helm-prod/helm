import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { MyQueueClient } from './my-queue-client'

function toIsoDateUTC(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

  const now = new Date()
  const nextWeekDate = new Date(now)
  nextWeekDate.setUTCDate(now.getUTCDate() + 7)

  return (
    <MyQueueClient
      profile={profile as Profile}
      panels={panels ?? []}
      todayIso={toIsoDateUTC(now)}
      nextWeekIso={toIsoDateUTC(nextWeekDate)}
    />
  )
}
