import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import type { Profile } from '@/lib/types/database'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  const { data: activeWeeks } = await supabase
    .from('ad_weeks')
    .select('id')
    .neq('status', 'archived')

  const activeWeekIds = (activeWeeks ?? []).map((week) => week.id)
  let myQueueCount = 0

  if (activeWeekIds.length > 0) {
    const { count } = await supabase
      .from('panels')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', user.id)
      .in('ad_week_id', activeWeekIds)
      .not('status', 'in', '("complete","cancelled")')
    myQueueCount = count ?? 0
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile as Profile} myQueueCount={myQueueCount} />
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  )
}
