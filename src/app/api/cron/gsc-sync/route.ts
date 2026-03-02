import { NextRequest, NextResponse } from 'next/server'
import { runGscSync } from '@/lib/gsc/sync'

export const dynamic = 'force-dynamic'

function isBearerTokenValid(request: NextRequest) {
  const header = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.warn('CRON_SECRET is missing. Allowing GSC sync request.')
    return true
  }

  if (!header) {
    return false
  }

  const token = header.replace(/^Bearer\s+/i, '').trim()
  return token === cronSecret
}

export async function GET(request: NextRequest) {
  if (!isBearerTokenValid(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runGscSync()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown GSC sync error'
    console.error('GSC cron sync failed', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
