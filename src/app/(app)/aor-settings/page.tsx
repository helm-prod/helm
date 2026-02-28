import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AorSettingsClient } from './aor-settings-client'
import { PageGuard } from '@/components/page-guard'

export default async function AorSettingsPage() {
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

  const { data: assignments } = await supabase
    .from('aor_assignments')
    .select('*, producer:profiles!producer_id(id, full_name, email)')
    .order('category')

  const { data: producers } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role', ['admin', 'producer'])
    .order('full_name')

  return (
    <PageGuard pageSlug="aor-settings">
      <AorSettingsClient
        assignments={assignments ?? []}
        producers={producers ?? []}
      />
    </PageGuard>
  )
}
