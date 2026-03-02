import { queryMerchantReports } from '@/lib/gmc/client'
import { createServiceRoleClient } from '@/lib/supabase/service'

const UPSERT_CHUNK_SIZE = 500
const DAYS_TO_SYNC = 7

type SyncStatus = 'success' | 'error'

interface SyncOperationResult {
  rows: number
  status: SyncStatus
  error?: string
}

export interface GmcSyncResult {
  performance: SyncOperationResult
  productStatus: SyncOperationResult
  priceInsights: SyncOperationResult
}

interface GmcDateObject {
  year?: number
  month?: number
  day?: number
}

interface GmcPriceObject {
  amountMicros?: string
  currencyCode?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function formatDateUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromParts(dateLike: unknown): string | null {
  const date = asRecord(dateLike)
  if (!date) return null

  const year = typeof date.year === 'number' ? date.year : Number.NaN
  const month = typeof date.month === 'number' ? date.month : Number.NaN
  const day = typeof date.day === 'number' ? date.day : Number.NaN

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function priceFromMicros(priceLike: unknown): { value: number | null; currency: string | null } {
  const price = asRecord(priceLike) as GmcPriceObject | null
  if (!price) {
    return { value: null, currency: null }
  }

  const micros = typeof price.amountMicros === 'string' ? Number.parseFloat(price.amountMicros) : Number.NaN
  const value = Number.isFinite(micros) ? micros / 1_000_000 : null
  const currency = typeof price.currencyCode === 'string' ? price.currencyCode : null

  return { value, currency }
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

async function upsertInChunks<T extends Record<string, unknown>>(
  table: 'gmc_product_performance' | 'gmc_product_status' | 'gmc_price_insights',
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
  source: string
  rowsSynced: number
  status: SyncStatus
  errorMessage?: string
}) {
  try {
    const supabase = createServiceRoleClient()
    await supabase.from('data_sync_log').insert({
      source: params.source,
      rows_synced: params.rowsSynced,
      status: params.status,
      error_message: params.errorMessage ?? null,
    })
  } catch (error) {
    console.error(`Failed to log ${params.source} sync status`, error)
  }
}

function mapPerformanceRow(row: Record<string, unknown>) {
  const view = asRecord(row.productPerformanceView) ?? row
  const offerId = readString(view, ['offerId', 'offer_id'])
  const date = dateFromParts(view.date)

  if (!offerId || !date) {
    return null
  }

  return {
    date,
    offer_id: offerId,
    title: readString(view, ['title']),
    brand: readString(view, ['brand']),
    category_l1: readString(view, ['categoryL1', 'category_l1']),
    marketing_method: readString(view, ['marketingMethod', 'marketing_method']),
    clicks: Math.round(readNumber(view, ['clicks']) ?? 0),
    impressions: Math.round(readNumber(view, ['impressions']) ?? 0),
    ctr: readNumber(view, ['ctr']) ?? 0,
    fetched_at: new Date().toISOString(),
  }
}

function mapStatusRow(row: Record<string, unknown>) {
  const view = asRecord(row.productView) ?? row
  const offerId = readString(view, ['offerId', 'offer_id'])
  if (!offerId) {
    return null
  }

  const itemIssues = view.itemIssues ?? view.item_issues ?? []

  return {
    offer_id: offerId,
    title: readString(view, ['title']),
    brand: readString(view, ['brand']),
    feed_label: readString(view, ['feedLabel', 'feed_label']),
    status: readString(view, ['aggregatedReportingContextStatus', 'aggregated_reporting_context_status']),
    item_issues: itemIssues,
    fetched_at: new Date().toISOString(),
  }
}

function mapPriceInsightsRow(row: Record<string, unknown>) {
  const view = asRecord(row.priceInsightsProductView) ?? row
  const offerId = readString(view, ['offerId', 'offer_id'])
  if (!offerId) {
    return null
  }

  const currentPrice = priceFromMicros(view.price)
  const suggestedPrice = priceFromMicros(view.suggestedPrice ?? view.suggested_price)

  return {
    offer_id: offerId,
    title: readString(view, ['title']),
    brand: readString(view, ['brand']),
    current_price: currentPrice.value,
    suggested_price: suggestedPrice.value,
    currency: suggestedPrice.currency ?? currentPrice.currency,
    predicted_impressions_change_fraction:
      readNumber(view, ['predictedImpressionsChangeFraction', 'predicted_impressions_change_fraction']) ?? null,
    predicted_clicks_change_fraction:
      readNumber(view, ['predictedClicksChangeFraction', 'predicted_clicks_change_fraction']) ?? null,
    predicted_conversions_change_fraction:
      readNumber(view, ['predictedConversionsChangeFraction', 'predicted_conversions_change_fraction']) ?? null,
    fetched_at: new Date().toISOString(),
  }
}

async function syncPerformance(startDate: string, endDate: string): Promise<SyncOperationResult> {
  const query = `
SELECT date, offer_id, title, brand, category_l1, marketing_method, clicks, impressions, ctr
FROM product_performance_view
WHERE date BETWEEN '${startDate}' AND '${endDate}'
`.trim()

  try {
    const rows = await queryMerchantReports(query, 25_000)
    const mappedRows = rows
      .map(mapPerformanceRow)
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await upsertInChunks('gmc_product_performance', mappedRows, 'date,offer_id,marketing_method')
    await logSync({
      source: 'gmc_performance',
      rowsSynced: mappedRows.length,
      status: 'success',
    })

    return { rows: mappedRows.length, status: 'success' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown GMC performance sync error'
    console.error('GMC performance sync failed', error)
    await logSync({
      source: 'gmc_performance',
      rowsSynced: 0,
      status: 'error',
      errorMessage: message,
    })
    return { rows: 0, status: 'error', error: message }
  }
}

async function syncProductStatus(): Promise<SyncOperationResult> {
  const query = `
SELECT id, offer_id, title, brand, feed_label, aggregated_reporting_context_status, item_issues
FROM product_view
`.trim()

  try {
    const rows = await queryMerchantReports(query, 25_000)
    const mappedRows = rows
      .map(mapStatusRow)
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await upsertInChunks('gmc_product_status', mappedRows, 'offer_id')
    await logSync({
      source: 'gmc_product_status',
      rowsSynced: mappedRows.length,
      status: 'success',
    })

    return { rows: mappedRows.length, status: 'success' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown GMC product status sync error'
    console.error('GMC product status sync failed', error)
    await logSync({
      source: 'gmc_product_status',
      rowsSynced: 0,
      status: 'error',
      errorMessage: message,
    })
    return { rows: 0, status: 'error', error: message }
  }
}

async function syncPriceInsights(): Promise<SyncOperationResult> {
  const query = `
SELECT id, offer_id, title, brand, price, suggested_price, predicted_impressions_change_fraction, predicted_clicks_change_fraction, predicted_conversions_change_fraction
FROM price_insights_product_view
`.trim()

  try {
    const rows = await queryMerchantReports(query, 25_000)
    const mappedRows = rows
      .map(mapPriceInsightsRow)
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await upsertInChunks('gmc_price_insights', mappedRows, 'offer_id')
    await logSync({
      source: 'gmc_price_insights',
      rowsSynced: mappedRows.length,
      status: 'success',
    })

    return { rows: mappedRows.length, status: 'success' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown GMC price insights sync error'
    console.error('GMC price insights sync failed', error)
    await logSync({
      source: 'gmc_price_insights',
      rowsSynced: 0,
      status: 'error',
      errorMessage: message,
    })
    return { rows: 0, status: 'error', error: message }
  }
}

export async function runGmcSync(): Promise<GmcSyncResult> {
  const { startDate, endDate } = buildDateRange(DAYS_TO_SYNC)

  const [performance, productStatus, priceInsights] = await Promise.all([
    syncPerformance(startDate, endDate),
    syncProductStatus(),
    syncPriceInsights(),
  ])

  return {
    performance,
    productStatus,
    priceInsights,
  }
}
