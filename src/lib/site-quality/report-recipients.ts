import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export interface ReportRecipient {
  id: string
  name: string
  email: string
  report_type: 'full' | 'aor'
  aor_owner: string | null
  active: boolean
}

export async function getRecipients(): Promise<ReportRecipient[]> {
  const { data, error } = await supabase
    .from('site_quality_report_recipients')
    .select('*')
    .eq('active', true)
    .order('name')

  if (error) throw new Error(`Failed to fetch report recipients: ${error.message}`)
  return data ?? []
}
