import { NextRequest, NextResponse } from 'next/server'

function buildPageUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value
  const siteUrl = process.env.NEXCOM_SITE_URL ?? 'https://www.mynavyexchange.com'
  return `${siteUrl}${value.startsWith('/') ? '' : '/'}${value}`
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://helm.nexweb.dev'

  const startRes = await fetch(`${baseUrl}/api/site-quality/link-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ action: 'start', scope: 'all', trigger: 'scheduled' }),
  })

  const startData = await startRes.json()
  if (!startRes.ok) {
    return NextResponse.json({ error: startData.error || 'Failed to start scheduled link scan' }, { status: 500 })
  }

  const { runId, totalPages, pages } = startData as {
    runId: string
    totalPages: number
    pages: Array<{ label: string; url: string; aorOwner: string }>
  }

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const pageRes = await fetch(`${baseUrl}/api/site-quality/link-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({
        action: 'scan-page',
        runId,
        pageIndex: index,
        pageUrl: buildPageUrl(page.url),
        pageLabel: page.label,
        aorOwner: page.aorOwner,
        totalPages,
      }),
    })

    if (!pageRes.ok) {
      const pageData = await pageRes.json().catch(() => null)
      return NextResponse.json({ error: pageData?.error || `Failed scheduled scan for ${page.label}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, runId })
}
