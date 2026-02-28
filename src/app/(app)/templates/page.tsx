import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TemplatesClient } from './templates-client'
import { PageGuard } from '@/components/page-guard'

export default async function TemplatesPage() {
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

  const [pageTemplatesRes, codeTemplatesRes] = await Promise.all([
    supabase.from('page_templates').select('*').order('name'),
    supabase.from('code_templates').select('*').order('updated_at', { ascending: false }),
  ])

  return (
    <PageGuard pageSlug="templates">
      <TemplatesClient
        pageTemplates={(pageTemplatesRes.data as Array<Record<string, unknown>>) ?? []}
        codeTemplates={(codeTemplatesRes.data as Array<Record<string, unknown>>) ?? []}
      />
    </PageGuard>
  )
}
