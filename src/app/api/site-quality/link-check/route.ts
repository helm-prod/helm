import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { runLinkCheckForScope } from '@/lib/site-quality/link-checker'

export const runtime = 'nodejs'

async function getRequestUserId(request: NextRequest) {
  if (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) {
    return null
  }

  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      scope?: 'all' | 'aor' | 'url'
      scopeValue?: string
      trigger?: 'manual' | 'scheduled'
    }

    const scope = body.scope ?? 'all'
    const scopeValue = body.scopeValue ?? null
    const trigger = body.trigger ?? 'manual'
    const userId = await getRequestUserId(request)

    if (!userId && trigger !== 'scheduled') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const { data: run, error } = await supabase
      .from('site_quality_link_runs')
      .insert({
        scope,
        scope_value: scopeValue,
        trigger,
        status: 'pending',
        created_by: userId,
      })
      .select('*')
      .single()

    if (error || !run) {
      throw new Error(error?.message ?? 'Failed to create link check run')
    }

    void (async () => {
      try {
        await supabase.from('site_quality_link_runs').update({ status: 'running' }).eq('id', run.id)
        const checked = await runLinkCheckForScope(scope, scopeValue)

        if (checked.results.length > 0) {
          const inserts = checked.results.map((item) => ({
            run_id: run.id,
            page_url: item.pageUrl,
            link_url: item.linkUrl,
            source_type: item.sourceType,
            source_label: item.sourceLabel,
            http_status: item.httpStatus,
            error_message: item.errorMessage,
            redirect_target: item.redirectTarget,
            aor_owner: item.aorOwner,
          }))
          const { error: insertError } = await supabase.from('site_quality_link_results').insert(inserts)
          if (insertError) throw insertError
        }

        const { error: updateError } = await supabase
          .from('site_quality_link_runs')
          .update({
            status: 'complete',
            total_pages: checked.summary.totalPages,
            total_links: checked.summary.totalLinks,
            broken_links: checked.summary.brokenLinks,
            redirect_links: checked.summary.redirectLinks,
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id)
        if (updateError) throw updateError
      } catch (error) {
        await supabase
          .from('site_quality_link_runs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id)
      }
    })()

    return NextResponse.json({ runId: run.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
