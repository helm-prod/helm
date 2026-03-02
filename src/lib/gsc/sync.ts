import { querySearchAnalytics, type GscSearchAnalyticsRow } from '@/lib/gsc/client'
import { createServiceRoleClient } from '@/lib/supabase/service'

const UPSERT_CHUNK_SIZE = 500
const DAYS_TO_SYNC = 7

export interface GscSyncResult {
  success: true
  queryRows: number
  pageRows: number
  startDate: string
  endDate: string
}

function formatDateUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDateRange(days: number) {
  const endDate = new Date()
  endDate.setUTCHours(0, 0, 0, 0)
  endDate.setUTCDate(endDate.getUTCDate() - 1)

  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1))

  return {
    startDate: formatDateUtc(startDate),
    endDate: formatDateUtc(endDate),
  }
}

function mapQueryRow(row: GscSearchAnalyticsRow) {
  return {
    date: row.keys[0] ?? '',
    query: row.keys[1] ?? '',
    page: row.keys[2] ?? '',
    device: row.keys[3] ?? '',
    country: row.keys[4] ?? '',
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    fetched_at: new Date().toISOString(),
  }
}

function mapPageRow(row: GscSearchAnalyticsRow) {
  return {
    date: row.keys[0] ?? '',
    page: row.keys[1] ?? '',
    device: row.keys[2] ?? '',
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    fetched_at: new Date().toISOString(),
  }
}

async function upsertInChunks<T extends Record<string, unknown>>(
  table: 'gsc_query_performance' | 'gsc_page_performance',
  rows: T[],
  conflictColumns: string
) {
  if (rows.length === 0) {
    return
  }

  const supabase = createServiceRoleClient()

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflictColumns })
    if (error) {
      throw new Error(`Upsert ${table} failed: ${error.message}`)
    }
  }
}

async function logSync(params: {
  rowsSynced: number
  status: 'success' | 'error'
  errorMessage?: string | null
}) {
  try {
    const supabase = createServiceRoleClient()
    await supabase.from('data_sync_log').insert({
      source: 'gsc',
      rows_synced: params.rowsSynced,
      status: params.status,
      error_message: params.errorMessage ?? null,
    })
  } catch (error) {
    console.error('Failed to log GSC sync status', error)
  }
}

export async function runGscSync(): Promise<GscSyncResult> {
  const { startDate, endDate } = buildDateRange(DAYS_TO_SYNC)

  try {
    const [queryRows, pageRows] = await Promise.all([
      querySearchAnalytics({
        startDate,
        endDate,
        dimensions: ['date', 'query', 'page', 'device', 'country'],
        rowLimit: 25_000,
      }),
      querySearchAnalytics({
        startDate,
        endDate,
        dimensions: ['date', 'page', 'device'],
        rowLimit: 25_000,
      }),
    ])

    const queryRecords = queryRows.map(mapQueryRow)
    const pageRecords = pageRows.map(mapPageRow)

    await upsertInChunks('gsc_query_performance', queryRecords, 'date,query,page,device,country')
    await upsertInChunks('gsc_page_performance', pageRecords, 'date,page,device')

    await logSync({
      rowsSynced: queryRows.length + pageRows.length,
      status: 'success',
    })

    return {
      success: true,
      queryRows: queryRows.length,
      pageRows: pageRows.length,
      startDate,
      endDate,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown GSC sync error'

    await logSync({
      rowsSynced: 0,
      status: 'error',
      errorMessage: message,
    })

    throw error
  }
}
