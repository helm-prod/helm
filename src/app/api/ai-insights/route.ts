import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

type InsightInsertBody = {
  insight_type?: string
  scope?: string | null
  prompt_summary?: string | null
  response_text?: string
  model_used?: string
  tokens_used?: number | null
  expires_at?: string | null
}

export async function POST(request: NextRequest) {
  const authClient = createServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: InsightInsertBody
  try {
    body = (await request.json()) as InsightInsertBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const insightType = body.insight_type?.trim()
  const responseText = body.response_text?.trim()
  const modelUsed = body.model_used?.trim()
  const scope = body.scope?.trim() || null
  const promptSummary = body.prompt_summary?.trim() || null
  const tokensUsed =
    typeof body.tokens_used === 'number' && Number.isFinite(body.tokens_used)
      ? body.tokens_used
      : null

  if (!insightType || !responseText || !modelUsed) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const expiresAt = body.expires_at || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()

  let supabase
  try {
    supabase = createServiceRoleClient()
  } catch (error) {
    console.error('Failed to create Supabase service client', error)
    return NextResponse.json({ error: 'Supabase service role is not configured' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('ai_insights')
    .insert({
      insight_type: insightType,
      scope,
      prompt_summary: promptSummary,
      response_text: responseText,
      model_used: modelUsed,
      tokens_used: tokensUsed,
      expires_at: expiresAt,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
