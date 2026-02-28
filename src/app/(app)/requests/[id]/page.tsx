import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Profile, WorkRequest } from '@/lib/types/database'
import { RequestDetailClient } from './request-detail-client'
import { PageGuard } from '@/components/page-guard'

export default async function RequestDetailPage({
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

  const { data: request } = await supabase
    .from('work_requests')
    .select(
      '*, requester:profiles!requester_id(*), assignee:profiles!assigned_to(*)'
    )
    .eq('id', params.id)
    .single()

  if (!request) notFound()

  // Fetch producers for assignment dropdown
  const { data: producers } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['admin', 'producer'])
    .order('full_name')

  return (
    <PageGuard pageSlug="requests">
      <RequestDetailClient
        request={request as WorkRequest & { requester: Profile; assignee: Profile | null }}
        profile={profile as Profile}
        producers={producers ?? []}
      />
    </PageGuard>
  )
}
