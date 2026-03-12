import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { buildReportEmail } from '@/lib/site-quality/report-builder'
import { getRecipients } from '@/lib/site-quality/report-recipients'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { type: 'link' | 'panel'; runId: string }
    if (!body.type || !body.runId) {
      return NextResponse.json({ error: 'type and runId are required' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const [recipients, linkRunRes, linkResultsRes, panelRunRes, panelResultsRes] = await Promise.all([
      getRecipients(),
      supabase.from('site_quality_link_runs').select('*').eq('id', body.type === 'link' ? body.runId : '').maybeSingle(),
      body.type === 'link'
        ? supabase.from('site_quality_link_results').select('*').eq('run_id', body.runId)
        : supabase.from('site_quality_link_results').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('site_quality_panel_runs').select('*').order('created_at', { ascending: false }).limit(body.type === 'panel' ? 1 : 1).maybeSingle(),
      supabase.from('site_quality_panel_results').select('*').order('created_at', { ascending: false }).limit(100),
    ])

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? '587'),
      secure: Number(process.env.SMTP_PORT ?? '587') === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    for (const recipient of recipients) {
      const email = buildReportEmail({
        recipient,
        type: body.type,
        linkRun: body.type === 'link' ? linkRunRes.data : null,
        linkResults: linkResultsRes.data ?? [],
        panelRun: panelRunRes.data,
        panelResults: panelResultsRes.data ?? [],
      })

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: recipient.email,
        subject: email.subject,
        html: email.html,
      })
    }

    return NextResponse.json({ sent: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
