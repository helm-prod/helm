import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BugsPageClient from '@/components/bugs/bugs-page-client'

export default async function BugsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  const { data: bugs } = await supabase
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: false })

  const reporterIds = Array.from(new Set((bugs ?? []).map((bug) => bug.reporter_id).filter(Boolean)))
  const { data: reporters } = reporterIds.length > 0
    ? await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', reporterIds)
    : { data: [] as Array<{ id: string; display_name: string | null; email: string | null }> }

  const reporterMap: Record<string, { display_name: string | null; email: string | null }> = {}
  for (const reporter of reporters ?? []) {
    reporterMap[reporter.id] = {
      display_name: reporter.display_name,
      email: reporter.email,
    }
  }

  const bugsWithReporters = (bugs ?? []).map((bug) => ({
    ...bug,
    reporter_name:
      reporterMap[bug.reporter_id]?.display_name ||
      reporterMap[bug.reporter_id]?.email ||
      'Unknown',
  }))

  return (
    <div className="p-6">
      <BugsPageClient bugs={bugsWithReporters} isAdmin={isAdmin} currentUserId={user.id} />
    </div>
  )
}
