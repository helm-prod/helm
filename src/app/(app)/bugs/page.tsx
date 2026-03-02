import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageGuard } from '@/components/page-guard'
import { BugsPageClient, type BugReportWithReporter } from '@/components/bugs/bugs-page-client'
import type { Profile } from '@/lib/types/database'

export default async function BugsPage() {
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

  const { data: bugReports } = await supabase
    .from('bug_reports')
    .select('*, reporter:profiles!reporter_id(full_name)')
    .order('created_at', { ascending: false })

  return (
    <PageGuard pageSlug="bugs">
      <BugsPageClient
        initialBugs={(bugReports ?? []) as BugReportWithReporter[]}
        currentUserRole={(profile as Profile).role}
      />
    </PageGuard>
  )
}
