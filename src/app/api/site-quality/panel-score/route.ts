import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

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

async function dispatchWorkflow(runId: string, adWeek?: number) {
  const token = process.env.GITHUB_PAT
  const repo = 'helm-prod/helm'

  if (!token) {
    throw new Error('GITHUB_PAT env var not set — cannot dispatch scoring workflow')
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/panel-score.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        run_id: runId,
        ad_week: adWeek ? String(adWeek) : '',
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`GitHub dispatch failed: ${response.status} ${text}`)
  }
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

    await dispatchWorkflow(run.id, body.adWeek)

    return NextResponse.json({ runId: run.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
