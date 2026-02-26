import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { RequestsListClient } from './requests-list-client'

export default async function RequestsPage() {
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

  // Fetch all producers/admins for the assignee filter
  const { data: producers } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['admin', 'producer'])
    .order('full_name')

  return (
    <RequestsListClient
      profile={profile as Profile}
      producers={producers ?? []}
    />
  )
}
