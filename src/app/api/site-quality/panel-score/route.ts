import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { scoreLivePanels } from '@/lib/site-quality/panel-scorer'

export const runtime = 'nodejs'

async function getActor(request: NextRequest) {
  if (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) {
    return { userId: null, role: 'admin' as const }
  }

  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { userId: null, role: null }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { userId: user.id, role: profile?.role ?? null }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { adWeek?: number; trigger?: 'manual' | 'scheduled' }
    const actor = await getActor(request)

    if (actor.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const supabase = createServiceRoleClient()
    const { data: run, error } = await supabase
      .from('site_quality_panel_runs')
      .insert({
        ad_week: body.adWeek ?? null,
        trigger: body.trigger ?? 'manual',
        status: 'pending',
        created_by: actor.userId,
      })
      .select('*')
      .single()

    if (error || !run) {
      throw new Error(error?.message ?? 'Failed to create panel scoring run')
    }

    void (async () => {
      try {
        await supabase.from('site_quality_panel_runs').update({ status: 'running' }).eq('id', run.id)
        const results = await scoreLivePanels(body.adWeek)

        if (results.length > 0) {
          const inserts = results.map((item) => ({
            run_id: run.id,
            panel_id: item.panelId,
            panel_name: item.panelName,
            category_l1: item.categoryL1,
            outbound_url: item.outboundUrl,
            aor_owner: item.aorOwner,
            ad_week: item.adWeek ?? null,
            ad_year: item.adYear ?? null,
            slot: item.slot ?? null,
            is_stale: item.isStale ?? null,
            category_folder: item.categoryFolder ?? null,
            score: item.score,
            issues: item.issues,
            ai_reasoning: item.aiReasoning,
            outbound_page_title: item.outboundPageTitle,
            panel_image_url: item.panelImageUrl,
          }))
          const { error: insertError } = await supabase.from('site_quality_panel_results').insert(inserts)
          if (insertError) throw insertError
        }

        const issueCount = results.reduce((sum, item) => sum + item.issues.filter((issue) => issue.type !== 'none').length, 0)
        const passingCount = results.filter((item) => item.score >= 80).length
        const avgScore = results.length > 0 ? results.reduce((sum, item) => sum + item.score, 0) / results.length : null

        const { error: updateError } = await supabase
          .from('site_quality_panel_runs')
          .update({
            status: 'complete',
            total_panels: results.length,
            avg_score: avgScore,
            issues_flagged: issueCount,
            passing_count: passingCount,
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id)
        if (updateError) throw updateError
      } catch {
        await supabase
          .from('site_quality_panel_runs')
          .update({ status: 'failed', completed_at: new Date().toISOString() })
          .eq('id', run.id)
      }
    })()

    return NextResponse.json({ runId: run.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
