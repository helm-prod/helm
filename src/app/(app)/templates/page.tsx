import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { TemplatesClient } from './templates-client'

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

  if (!profile || (profile as Profile).role !== 'admin') {
    redirect('/dashboard')
  }

  const [pageTemplatesRes, codeTemplatesRes] = await Promise.all([
    supabase.from('page_templates').select('*').order('name'),
    supabase.from('code_templates').select('*').order('updated_at', { ascending: false }),
  ])

  return (
    <TemplatesClient
      pageTemplates={(pageTemplatesRes.data as Array<Record<string, unknown>>) ?? []}
      codeTemplates={(codeTemplatesRes.data as Array<Record<string, unknown>>) ?? []}
    />
  )
}
