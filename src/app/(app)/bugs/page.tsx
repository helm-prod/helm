import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageGuard } from '@/components/page-guard'
import { BugsPageClient, type BugReportWithReporter } from '@/components/bugs/bugs-page-client'

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
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  const { data: bugReports } = await supabase
    .from('bug_reports')
    .select('*, reporter:profiles!reporter_id(display_name, email)')
    .order('created_at', { ascending: false })

  const bugsWithReporter = (bugReports ?? []).map((bug) => {
    const reporter = (bug as { reporter?: { display_name?: string | null; email?: string | null } | null }).reporter
    return {
      ...(bug as Record<string, unknown>),
      reporter_name: reporter?.display_name ?? 'Unknown reporter',
      reporter_email: reporter?.email ?? null,
    }
  }) as BugReportWithReporter[]

  return (
    <PageGuard pageSlug="bugs">
      <BugsPageClient initialBugs={bugsWithReporter} isAdmin={profile.role === 'admin'} />
    </PageGuard>
  )
}
