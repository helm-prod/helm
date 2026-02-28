import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import {
  computeGeneratedDescription,
  type PanelCategory,
  PANEL_CATEGORIES,
  type PanelType,
} from '@/lib/types/database'
import { mergeTemplateHtml, normalizeTemplateName } from '@/lib/codegen'

const VALID_PANEL_TYPES: PanelType[] = ['Marketing Header', 'Banner', 'Left Nav', 'A', 'B', 'C']
const CATEGORY_LOOKUP = new Map<string, PanelCategory>(
  PANEL_CATEGORIES.map((category) => [normalizeLookupKey(category), category])
)
const EVENT_COLUMN_INDEXES = [2, 3, 4]
const GENERIC_EVENT_HEADER = /^event\s*\d+$/i
const EVENT_DATE_RANGE =
  /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*(?:-|\u2013|to)\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/i

type UploadMode = 'turn_in' | 'corrections' | 'ad_week_calendar'

interface SpreadsheetSource {
  source: 'file' | 'google_sheets'
  filename: string
  rows: unknown[][]
}

interface EventHeader {
  columnIndex: number
  event_code: string
  event_name: string | null
  start_date: string | null
  end_date: string | null
}

interface CalendarSeedRow {
  rowNumber: number
  weekNumber: number
  year: number
  startDate: string
  endDate: string
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeLookupKey(value: string) {
  return normalizeWhitespace(value).toLowerCase()
}

function detectWeekAndYear(filename: string): { weekNumber: number | null; year: number | null } {
  const basename = filename.replace(/\.[^.]+$/, '')
  const weekMatch =
    basename.match(/\bWK[_\-\s]?(\d{1,2})\b/i) ??
    basename.match(/\bWEEK[_\-\s]?(\d{1,2})\b/i)
  const yearMatch = basename.match(/\b(20\d{2})\b/)

  const weekNumber = weekMatch ? Number.parseInt(weekMatch[1], 10) : null
  const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : null

  return {
    weekNumber: weekNumber && weekNumber > 0 && weekNumber <= 53 ? weekNumber : null,
    year,
  }
}

function isMarkedForEvent(cell: unknown, eventCode?: string): boolean {
  if (typeof cell === 'boolean') return cell
  if (typeof cell === 'number') return cell > 0

  const value = String(cell ?? '').trim().toLowerCase()
  if (!value) return false

  if (['x', '✓', '✔', 'yes', 'y', 'true', '1'].includes(value)) {
    return true
  }

  if (eventCode && value === eventCode.toLowerCase()) {
    return true
  }

  return false
}

function parseSheetIdFromUrl(url: string): string | null {
  const match = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

function toIsoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDateToken(token: string, fallbackYear: number | null): string | null {
  const normalized = normalizeWhitespace(token)
  if (!normalized) return null

  const parsed = normalized.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (parsed) {
    const month = Number.parseInt(parsed[1], 10)
    const day = Number.parseInt(parsed[2], 10)

    let year: number
    if (parsed[3]) {
      const rawYear = Number.parseInt(parsed[3], 10)
      year = parsed[3].length === 2 ? 2000 + rawYear : rawYear
    } else {
      year = fallbackYear ?? new Date().getFullYear()
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return toIsoDate(year, month, day)
    }

    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  const timestamp = Date.parse(normalized)
  if (Number.isNaN(timestamp)) return null

  const date = new Date(timestamp)
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

function parseSpreadsheetDate(value: unknown, fallbackYear: number | null): string | null {
  if (value === null || value === undefined) return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return toIsoDate(parsed.y, parsed.m, parsed.d)
    }
  }

  return parseDateToken(String(value), fallbackYear)
}

function parseEventHeader(rawHeader: unknown, fallbackYear: number | null): Omit<EventHeader, 'columnIndex'> | null {
  const normalized = normalizeWhitespace(String(rawHeader ?? ''))
  if (!normalized) return null
  if (GENERIC_EVENT_HEADER.test(normalized)) return null

  const dateMatch = normalized.match(EVENT_DATE_RANGE)
  const headerWithoutDates = dateMatch ? normalizeWhitespace(normalized.slice(0, dateMatch.index)) : normalized
  const startDate = dateMatch ? parseDateToken(dateMatch[1], fallbackYear) : null
  const endDate = dateMatch ? parseDateToken(dateMatch[2], fallbackYear) : null

  const tokens = headerWithoutDates.split(' ').filter(Boolean)
  if (tokens.length === 0) return null

  const eventCode = tokens[0]
  if (!/^[A-Za-z0-9]{2,12}$/.test(eventCode)) {
    return null
  }

  const eventName = normalizeWhitespace(tokens.slice(1).join(' ')) || null

  return {
    event_code: eventCode.toUpperCase(),
    event_name: eventName,
    start_date: startDate,
    end_date: endDate,
  }
}

function readRowsFromWorkbook(buffer: ArrayBuffer, preferMainSheet: boolean): unknown[][] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName =
    (preferMainSheet ? workbook.SheetNames.find((name) => name.toLowerCase().includes('main')) : null) ??
    workbook.SheetNames[0]

  if (!sheetName) {
    return []
  }

  const sheet = workbook.Sheets[sheetName]
  return (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][]) ?? []
}

function getUploadMode(rawValue: string | null): UploadMode {
  if (rawValue === 'corrections') return 'corrections'
  if (rawValue === 'ad_week_calendar') return 'ad_week_calendar'
  return 'turn_in'
}

async function resolveSpreadsheetSource(formData: FormData, uploadMode: UploadMode): Promise<SpreadsheetSource> {
  const file = formData.get('file') as File | null
  const googleSheetUrl = normalizeWhitespace(String(formData.get('google_sheet_url') ?? ''))

  if (file) {
    const buffer = await file.arrayBuffer()
    return {
      source: 'file',
      filename: file.name,
      rows: readRowsFromWorkbook(buffer, uploadMode !== 'ad_week_calendar'),
    }
  }

  if (!googleSheetUrl) {
    throw new Error('No file provided')
  }

  const sheetId = parseSheetIdFromUrl(googleSheetUrl)
  if (!sheetId) {
    throw new Error('Invalid Google Sheets URL. Paste a full docs.google.com/spreadsheets link.')
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`
  const response = await fetch(exportUrl, { cache: 'no-store' })

  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
      throw new Error("Couldn't access that sheet. Make sure it's shared as 'Anyone with the link can view.'")
    }
    throw new Error('Failed to download Google Sheet')
  }

  const buffer = await response.arrayBuffer()

  try {
    return {
      source: 'google_sheets',
      filename: `google-sheet-${sheetId}.xlsx`,
      rows: readRowsFromWorkbook(buffer, uploadMode !== 'ad_week_calendar'),
    }
  } catch {
    throw new Error("Couldn't access that sheet. Make sure it's shared as 'Anyone with the link can view.'")
  }
}

function detectCalendarColumns(headerRow: unknown[]) {
  const normalizedHeaders = headerRow.map((cell) => normalizeLookupKey(String(cell ?? '')))

  const findColumn = (aliases: string[]) => {
    return normalizedHeaders.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)))
  }

  const weekColumn = findColumn(['week number', 'week', 'ad week'])
  const startColumn = findColumn(['start date', 'week start'])
  const endColumn = findColumn(['end date', 'week end'])

  return {
    weekColumn: weekColumn >= 0 ? weekColumn : 0,
    startColumn: startColumn >= 0 ? startColumn : 1,
    endColumn: endColumn >= 0 ? endColumn : 2,
  }
}

function parseCalendarWeekNumber(rawValue: unknown): number | null {
  const normalized = normalizeWhitespace(String(rawValue ?? ''))
  if (!normalized) return null

  const match = normalized.match(/(\d{1,2})/)
  if (!match) return null

  const weekNumber = Number.parseInt(match[1], 10)
  if (weekNumber < 1 || weekNumber > 53) return null
  return weekNumber
}

async function runCalendarSeedImport({
  supabase,
  rows,
  uploadId,
  uploadedBy,
  defaultYear,
}: {
  supabase: ReturnType<typeof createClient>
  rows: unknown[][]
  uploadId: string
  uploadedBy: string
  defaultYear: number
}) {
  const totalSpreadsheetRows = Math.max(rows.length - 1, 0)
  let skippedEmptyRows = 0
  let appliedRows = 0

  const errors: Array<{ row: number; message: string }> = []
  const seededRows: CalendarSeedRow[] = []

  const headerRow = rows[0] ?? []
  const { weekColumn, startColumn, endColumn } = detectCalendarColumns(headerRow)

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? []

    const weekRaw = row[weekColumn]
    const startRaw = row[startColumn]
    const endRaw = row[endColumn]

    const weekText = normalizeWhitespace(String(weekRaw ?? ''))
    const startText = normalizeWhitespace(String(startRaw ?? ''))
    const endText = normalizeWhitespace(String(endRaw ?? ''))

    if (!weekText && !startText && !endText) {
      skippedEmptyRows += 1
      continue
    }

    const weekNumber = parseCalendarWeekNumber(weekRaw)
    if (!weekNumber) {
      errors.push({ row: i + 1, message: `Invalid week number: "${weekText || String(weekRaw ?? '')}"` })
      continue
    }

    const startDate = parseSpreadsheetDate(startRaw, defaultYear)
    const endDate = parseSpreadsheetDate(endRaw, defaultYear)

    if (!startDate || !endDate) {
      errors.push({
        row: i + 1,
        message: 'Invalid start or end date. Expected columns: Week Number | Start Date | End Date.',
      })
      continue
    }

    const year = Number.parseInt(startDate.slice(0, 4), 10)

    seededRows.push({
      rowNumber: i + 1,
      weekNumber,
      year,
      startDate,
      endDate,
    })
  }

  const years = Array.from(new Set(seededRows.map((row) => row.year)))
  const existingWeekMap = new Map<string, { id: string }>()

  for (const year of years) {
    const weekNumbers = Array.from(
      new Set(seededRows.filter((row) => row.year === year).map((row) => row.weekNumber))
    )

    if (weekNumbers.length === 0) continue

    const { data } = await supabase
      .from('ad_weeks')
      .select('id, week_number, year')
      .eq('year', year)
      .in('week_number', weekNumbers)

    for (const week of data ?? []) {
      existingWeekMap.set(`${week.year}:${week.week_number}`, { id: week.id })
    }
  }

  const createdWeeks: Array<{ week_number: number; year: number; start_date: string; end_date: string }> = []
  const updatedWeeks: Array<{ week_number: number; year: number; start_date: string; end_date: string }> = []

  for (const row of seededRows) {
    const key = `${row.year}:${row.weekNumber}`
    const existing = existingWeekMap.get(key)

    if (existing) {
      const { error } = await supabase
        .from('ad_weeks')
        .update({
          start_date: row.startDate,
          end_date: row.endDate,
        })
        .eq('id', existing.id)

      if (error) {
        errors.push({ row: row.rowNumber, message: error.message })
        continue
      }

      updatedWeeks.push({
        week_number: row.weekNumber,
        year: row.year,
        start_date: row.startDate,
        end_date: row.endDate,
      })
      appliedRows += 1
      continue
    }

    const { data: insertedWeek, error } = await supabase
      .from('ad_weeks')
      .insert({
        week_number: row.weekNumber,
        year: row.year,
        label: `WK ${row.weekNumber}`,
        status: 'draft',
        created_by: uploadedBy,
        start_date: row.startDate,
        end_date: row.endDate,
      })
      .select('id')
      .single()

    if (error || !insertedWeek) {
      errors.push({ row: row.rowNumber, message: error?.message || 'Failed to create ad week' })
      continue
    }

    existingWeekMap.set(key, { id: insertedWeek.id })
    createdWeeks.push({
      week_number: row.weekNumber,
      year: row.year,
      start_date: row.startDate,
      end_date: row.endDate,
    })
    appliedRows += 1
  }

  const finalStatus =
    errors.length > 0 && appliedRows === 0
      ? 'failed'
      : errors.length > 0
        ? 'partial'
        : 'complete'

  const summary = {
    mode: 'ad_week_calendar',
    total_rows_in_spreadsheet: totalSpreadsheetRows,
    rows_skipped_empty: skippedEmptyRows,
    rows_processed: totalSpreadsheetRows - skippedEmptyRows,
    calendar_seed: {
      weeks_created: createdWeeks.length,
      weeks_updated: updatedWeeks.length,
      created: createdWeeks,
      updated: updatedWeeks,
    },
  }

  await supabase
    .from('uploads')
    .update({
      status: finalStatus,
      total_rows: totalSpreadsheetRows,
      imported_rows: appliedRows,
      conflict_rows: 0,
      error_log: errors,
      summary,
    })
    .eq('id', uploadId)

  return {
    status: finalStatus,
    total_rows: totalSpreadsheetRows,
    imported_rows: appliedRows,
    conflict_rows: 0,
    errors,
    summary,
  }
}

async function runTurnInImport({
  supabase,
  rows,
  uploadId,
  uploadType,
  uploadedBy,
  targetWeek,
}: {
  supabase: ReturnType<typeof createClient>
  rows: unknown[][]
  uploadId: string
  uploadType: UploadMode
  uploadedBy: string
  targetWeek: { id: string; week_number: number; year: number; label: string | null }
}) {
  const [aorRes, profileRes, existingEventsRes, pageTemplatesRes] = await Promise.all([
    supabase.from('aor_assignments').select('producer_id, category'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .in('role', ['admin', 'senior_web_producer', 'producer']),
    supabase
      .from('ad_week_events')
      .select('id, event_code, event_name, start_date, end_date')
      .eq('ad_week_id', targetWeek.id),
    supabase.from('page_templates').select('id, name'),
  ])

  const aorMap = new Map<string, string>()
  for (const assignment of aorRes.data ?? []) {
    aorMap.set(normalizeLookupKey(String(assignment.category ?? '')), assignment.producer_id)
  }

  const producerNames = new Map<string, string>()
  for (const producer of profileRes.data ?? []) {
    producerNames.set(producer.id, producer.full_name || 'Unknown')
  }

  const pageTemplateByName = new Map<string, { id: string; name: string }>()
  for (const template of pageTemplatesRes.data ?? []) {
    pageTemplateByName.set(normalizeTemplateName(template.name), {
      id: template.id,
      name: template.name,
    })
  }

  const codeTemplatesByKey = new Map<
    string,
    {
      page_template_id: string
      slot_name: string
      html_template: string
      variable_map: Record<string, string>
    }
  >()

  if (pageTemplateByName.size > 0) {
    const pageTemplateIds = Array.from(new Set(Array.from(pageTemplateByName.values()).map((value) => value.id)))
    const { data: codeTemplates } = await supabase
      .from('code_templates')
      .select('page_template_id, slot_name, html_template, variable_map')
      .in('page_template_id', pageTemplateIds)

    for (const template of codeTemplates ?? []) {
      const key = `${template.page_template_id}::${normalizeLookupKey(template.slot_name)}`
      codeTemplatesByKey.set(key, {
        page_template_id: template.page_template_id,
        slot_name: template.slot_name,
        html_template: template.html_template || '',
        variable_map: (template.variable_map as Record<string, string>) ?? {},
      })
    }
  }

  const headerRow = rows[0] ?? []
  const detectedEvents = EVENT_COLUMN_INDEXES.map((columnIndex) => {
    const parsed = parseEventHeader(headerRow[columnIndex], targetWeek.year)
    if (!parsed) return null
    return {
      columnIndex,
      ...parsed,
    }
  }).filter(Boolean) as EventHeader[]

  const existingEventByCode = new Map(
    (existingEventsRes.data ?? []).map((event) => [event.event_code.toLowerCase(), event])
  )

  const eventIdByColumn = new Map<number, string>()
  const eventCodeByColumn = new Map<number, string>()

  for (const detectedEvent of detectedEvents) {
    let eventCode = detectedEvent.event_code
    let suffix = 2

    while (
      Array.from(eventCodeByColumn.values()).some((value) => value.toLowerCase() === eventCode.toLowerCase())
    ) {
      eventCode = `${detectedEvent.event_code}_${suffix}`
      suffix += 1
    }

    eventCodeByColumn.set(detectedEvent.columnIndex, eventCode)

    const existing = existingEventByCode.get(eventCode.toLowerCase())
    if (existing) {
      eventIdByColumn.set(detectedEvent.columnIndex, existing.id)

      const shouldUpdateName = detectedEvent.event_name && detectedEvent.event_name !== existing.event_name
      const shouldUpdateStart = detectedEvent.start_date && detectedEvent.start_date !== existing.start_date
      const shouldUpdateEnd = detectedEvent.end_date && detectedEvent.end_date !== existing.end_date

      if (shouldUpdateName || shouldUpdateStart || shouldUpdateEnd) {
        await supabase
          .from('ad_week_events')
          .update({
            event_name: detectedEvent.event_name ?? existing.event_name,
            start_date: detectedEvent.start_date ?? existing.start_date,
            end_date: detectedEvent.end_date ?? existing.end_date,
          })
          .eq('id', existing.id)
      }
      continue
    }

    const { data: insertedEvent } = await supabase
      .from('ad_week_events')
      .insert({
        ad_week_id: targetWeek.id,
        event_code: eventCode,
        event_name: detectedEvent.event_name,
        start_date: detectedEvent.start_date,
        end_date: detectedEvent.end_date,
      })
      .select('id')
      .single()

    if (insertedEvent) {
      eventIdByColumn.set(detectedEvent.columnIndex, insertedEvent.id)
    }
  }

  const totalSpreadsheetRows = Math.max(rows.length - 1, 0)
  let skippedEmptyRows = 0
  let importedRows = 0
  let conflictRows = 0

  const errors: Array<{ row: number; message: string }> = []
  const conflictItems: Array<{
    row: number
    page_location: string
    panel_name: string
    priority: number | null
    first_seen_row: number | null
    message: string
  }> = []

  const createdByCategory = new Map<string, number>()
  const assignmentByProducer = new Map<
    string,
    {
      producer_id: string
      producer_name: string
      panel_count: number
      aor_fallback_count: number
    }
  >()

  const seenImportPositions = new Map<string, number>()
  let pageTemplateMatches = 0
  let generatedCodeCount = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) {
      skippedEmptyRows += 1
      continue
    }

    const rawCategory = normalizeWhitespace(String(row[0] ?? ''))
    const rawPageLocation = normalizeWhitespace(String(row[1] ?? ''))

    if (!rawCategory && !rawPageLocation) {
      skippedEmptyRows += 1
      continue
    }

    const categoryKey = normalizeLookupKey(rawCategory)
    const category = CATEGORY_LOOKUP.get(categoryKey)
    if (!category) {
      errors.push({ row: i + 1, message: `Invalid category: "${rawCategory}"` })
      continue
    }

    if (!rawPageLocation) {
      errors.push({ row: i + 1, message: 'Missing page location' })
      continue
    }

    let matchedEventId: string | null = null
    for (const columnIndex of EVENT_COLUMN_INDEXES) {
      const eventCode = eventCodeByColumn.get(columnIndex)
      if (!eventCode) continue

      if (isMarkedForEvent(row[columnIndex], eventCode)) {
        matchedEventId = eventIdByColumn.get(columnIndex) ?? null
        break
      }
    }

    const specialDates = normalizeWhitespace(String(row[5] ?? '')) || null

    const priorityRaw = normalizeWhitespace(String(row[6] ?? ''))
    let priorityNum: number | null = null
    if (priorityRaw) {
      const parsedPriority = Number.parseInt(priorityRaw, 10)
      if (Number.isNaN(parsedPriority)) {
        errors.push({ row: i + 1, message: `Invalid priority: "${priorityRaw}"` })
        continue
      }
      priorityNum = parsedPriority
    }

    const panelNameRaw = normalizeWhitespace(String(row[7] ?? ''))
    const panelType = VALID_PANEL_TYPES.includes(panelNameRaw as PanelType)
      ? (panelNameRaw as PanelType)
      : null

    if (priorityNum !== null && panelNameRaw) {
      const conflictKey = `${normalizeLookupKey(rawPageLocation)}::${normalizeLookupKey(panelNameRaw)}::${priorityNum}`
      const firstSeenRow = seenImportPositions.get(conflictKey)

      if (firstSeenRow) {
        conflictRows += 1

        const conflictDetail = {
          row: i + 1,
          page_location: rawPageLocation,
          panel_name: panelNameRaw,
          priority: priorityNum,
          first_seen_row: firstSeenRow,
          message: 'Duplicate panel position in this upload (page location + panel name + priority)',
        }

        conflictItems.push(conflictDetail)

        await supabase.from('panel_conflicts').insert({
          panel_id: null,
          upload_id: uploadId,
          conflict_type: 'duplicate_in_upload',
          uploaded_data: {
            category,
            page_location: rawPageLocation,
            panel_name: panelNameRaw,
            priority: priorityNum,
            first_seen_row: firstSeenRow,
          },
        })

        continue
      }

      seenImportPositions.set(conflictKey, i + 1)
    }

    const prefixRaw = normalizeWhitespace(String(row[8] ?? '')) || null
    const valueRaw = normalizeWhitespace(String(row[9] ?? '')) || null
    const dollarPercentRaw = normalizeWhitespace(String(row[10] ?? '')) || null
    const suffixRaw = normalizeWhitespace(String(row[11] ?? '')) || null
    const itemDescRaw = normalizeWhitespace(String(row[12] ?? '')) || null
    const exclusionsRaw = normalizeWhitespace(String(row[13] ?? '')) || null
    const brandCatRaw = normalizeWhitespace(String(row[15] ?? '')) || null
    const directionRaw = normalizeWhitespace(String(row[16] ?? '')) || null
    const imgRefRaw = normalizeWhitespace(String(row[17] ?? '')) || null
    const linkIntentRaw = normalizeWhitespace(String(row[18] ?? '')) || null
    const linkUrlRaw = normalizeWhitespace(String(row[19] ?? '')) || null

    const validDollarPercent = dollarPercentRaw === '$' || dollarPercentRaw === '%' ? dollarPercentRaw : null

    const generatedDesc = computeGeneratedDescription({
      prefix: prefixRaw,
      value: valueRaw,
      dollar_or_percent: validDollarPercent,
      suffix: suffixRaw,
      item_description: itemDescRaw,
    })

    const matchedPageTemplate = pageTemplateByName.get(normalizeTemplateName(rawPageLocation)) ?? null
    if (matchedPageTemplate) {
      pageTemplateMatches += 1
    }
    const matchedPageTemplateId = matchedPageTemplate?.id ?? null

    const imageRefUpper = (imgRefRaw ?? '').toUpperCase()
    const isCarryover = /\bC\/O\b/.test(imageRefUpper)
    const isPickup = /\bP\/\s?U(?:P)?\b/.test(imageRefUpper)
    const pickupReference = isPickup ? imgRefRaw : null

    const aorProducerId = aorMap.get(categoryKey) ?? null
    const assignedTo = aorProducerId ?? uploadedBy
    const noAorMatchNote = aorProducerId
      ? null
      : `Unassigned - no AOR match for category "${rawCategory}"`

    const templateKey =
      matchedPageTemplateId && panelType
        ? `${matchedPageTemplateId}::${normalizeLookupKey(panelType)}`
        : null
    const matchedCodeTemplate = templateKey ? codeTemplatesByKey.get(templateKey) : null

    const generatedCode = matchedCodeTemplate
      ? mergeTemplateHtml({
          htmlTemplate: matchedCodeTemplate.html_template,
          variableMap: matchedCodeTemplate.variable_map,
          panel: {
            category,
            page_location: rawPageLocation,
            panel_type: panelType,
            prefix: prefixRaw,
            value: valueRaw,
            dollar_or_percent: validDollarPercent,
            suffix: suffixRaw,
            item_description: itemDescRaw,
            exclusions: exclusionsRaw,
            generated_description: generatedDesc || null,
            image_reference: imgRefRaw,
            link_intent: linkIntentRaw,
            link_url: linkUrlRaw,
          },
        })
      : null

    if (generatedCode) {
      generatedCodeCount += 1
    }

    const { error: panelError } = await supabase.from('panels').insert({
      ad_week_id: targetWeek.id,
      event_id: matchedEventId,
      category,
      page_location: rawPageLocation,
      priority: priorityNum,
      panel_type: panelType,
      prefix: prefixRaw,
      value: valueRaw,
      dollar_or_percent: validDollarPercent,
      suffix: suffixRaw,
      item_description: itemDescRaw,
      exclusions: exclusionsRaw,
      generated_description: generatedDesc || null,
      brand_category_tracking: brandCatRaw,
      direction: directionRaw,
      image_reference: imgRefRaw,
      link_intent: linkIntentRaw,
      link_url: linkUrlRaw,
      special_dates: specialDates,
      assigned_to: assignedTo,
      notes: noAorMatchNote,
      is_carryover: isCarryover,
      is_pickup: isPickup,
      pickup_reference: pickupReference,
      source: uploadType === 'corrections' ? 'correction' : 'upload',
      upload_id: uploadId,
      page_template_id: matchedPageTemplateId,
      generated_code: generatedCode,
      code_status: generatedCode ? 'generated' : 'none',
    })

    if (panelError) {
      errors.push({ row: i + 1, message: panelError.message })
      continue
    }

    importedRows += 1

    createdByCategory.set(category, (createdByCategory.get(category) ?? 0) + 1)

    const producerName = producerNames.get(assignedTo) ?? 'Unknown'
    const producerSummary = assignmentByProducer.get(assignedTo)
    if (producerSummary) {
      producerSummary.panel_count += 1
      if (!aorProducerId) producerSummary.aor_fallback_count += 1
    } else {
      assignmentByProducer.set(assignedTo, {
        producer_id: assignedTo,
        producer_name: producerName,
        panel_count: 1,
        aor_fallback_count: aorProducerId ? 0 : 1,
      })
    }
  }

  const finalStatus =
    errors.length > 0 && importedRows === 0
      ? 'failed'
      : errors.length > 0 || conflictRows > 0
        ? 'partial'
        : 'complete'

  const summary = {
    mode: uploadType,
    total_rows_in_spreadsheet: totalSpreadsheetRows,
    rows_skipped_empty: skippedEmptyRows,
    rows_processed: totalSpreadsheetRows - skippedEmptyRows,
    panels_created_by_category: Array.from(createdByCategory.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    conflicts: conflictItems,
    aor_assignment_summary: Array.from(assignmentByProducer.values()).sort((a, b) => b.panel_count - a.panel_count),
    page_template_matching: {
      matched_panels: pageTemplateMatches,
      generated_code_panels: generatedCodeCount,
    },
    events_detected: detectedEvents.map((event) => ({
      event_code: eventCodeByColumn.get(event.columnIndex) ?? event.event_code,
      event_name: event.event_name,
      start_date: event.start_date,
      end_date: event.end_date,
    })),
  }

  await supabase
    .from('uploads')
    .update({
      status: finalStatus,
      total_rows: totalSpreadsheetRows,
      imported_rows: importedRows,
      conflict_rows: conflictRows,
      error_log: errors,
      summary,
    })
    .eq('id', uploadId)

  return {
    status: finalStatus,
    total_rows: totalSpreadsheetRows,
    imported_rows: importedRows,
    conflict_rows: conflictRows,
    errors,
    summary,
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const uploadMode = getUploadMode((formData.get('upload_type') as string) || null)
    const adWeekId = normalizeWhitespace(String(formData.get('ad_week_id') ?? '')) || null
    const archiveExisting =
      normalizeWhitespace(String(formData.get('archive_existing') ?? '')).toLowerCase() === 'true' ||
      normalizeWhitespace(String(formData.get('archive_existing') ?? '')) === '1'

    const source = await resolveSpreadsheetSource(formData, uploadMode)

    let targetWeek: {
      id: string
      week_number: number
      year: number
      label: string | null
    } | null = null

    if (uploadMode !== 'ad_week_calendar') {
      const detectedFromFilename = detectWeekAndYear(source.filename)
      const currentYear = new Date().getFullYear()

      if (adWeekId) {
        const { data: selectedWeek } = await supabase
          .from('ad_weeks')
          .select('id, week_number, year, label')
          .eq('id', adWeekId)
          .single()

        if (!selectedWeek) {
          return NextResponse.json({ error: 'Selected ad week not found' }, { status: 400 })
        }

        targetWeek = selectedWeek
      } else {
        if (!detectedFromFilename.weekNumber) {
          return NextResponse.json(
            {
              error:
                'Unable to detect ad week from filename. Use a pattern like WK_6_Web_Marketing_Doc.xlsx or choose a week manually.',
            },
            { status: 400 }
          )
        }

        const detectedYear = detectedFromFilename.year ?? currentYear

        const { data: existingWeek } = await supabase
          .from('ad_weeks')
          .select('id, week_number, year, label')
          .eq('week_number', detectedFromFilename.weekNumber)
          .eq('year', detectedYear)
          .limit(1)
          .maybeSingle()

        if (existingWeek) {
          targetWeek = existingWeek
        } else {
          const { data: createdWeek, error: createdWeekError } = await supabase
            .from('ad_weeks')
            .insert({
              week_number: detectedFromFilename.weekNumber,
              year: detectedYear,
              label: `WK ${detectedFromFilename.weekNumber}`,
              status: 'turn_in',
              created_by: user.id,
            })
            .select('id, week_number, year, label')
            .single()

          if (createdWeekError || !createdWeek) {
            return NextResponse.json(
              { error: createdWeekError?.message || 'Failed to create ad week' },
              { status: 500 }
            )
          }

          targetWeek = createdWeek
        }
      }

      if (!targetWeek) {
        return NextResponse.json({ error: 'Unable to resolve ad week' }, { status: 500 })
      }

      if (uploadMode === 'turn_in') {
        const { count } = await supabase
          .from('panels')
          .select('id', { count: 'exact', head: true })
          .eq('ad_week_id', targetWeek.id)
          .eq('archived', false)

        const existingCount = count ?? 0
        if (existingCount > 0 && !archiveExisting) {
          return NextResponse.json(
            {
              error: `${targetWeek.label || `WK ${targetWeek.week_number}`} already has ${existingCount} panels.`,
              requires_archive_confirmation: true,
              panel_count: existingCount,
              ad_week_id: targetWeek.id,
              ad_week_label: targetWeek.label || `WK ${targetWeek.week_number}`,
              week_number: targetWeek.week_number,
              year: targetWeek.year,
            },
            { status: 409 }
          )
        }

        if (existingCount > 0 && archiveExisting) {
          await supabase
            .from('panels')
            .update({
              archived: true,
              archived_at: new Date().toISOString(),
            })
            .eq('ad_week_id', targetWeek.id)
            .eq('archived', false)
        }
      }
    }

    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .insert({
        filename: source.filename,
        uploaded_by: user.id,
        upload_type: uploadMode,
        ad_week_id: targetWeek?.id ?? null,
        status: 'processing',
      })
      .select('id')
      .single()

    if (uploadError || !upload) {
      return NextResponse.json({ error: uploadError?.message || 'Failed to create upload record' }, { status: 500 })
    }

    if (uploadMode === 'ad_week_calendar') {
      const calendarResult = await runCalendarSeedImport({
        supabase,
        rows: source.rows,
        uploadId: upload.id,
        uploadedBy: user.id,
        defaultYear: new Date().getFullYear(),
      })

      return NextResponse.json({
        upload_id: upload.id,
        ...calendarResult,
        source: source.source,
      })
    }

    const turnInResult = await runTurnInImport({
      supabase,
      rows: source.rows,
      uploadId: upload.id,
      uploadType: uploadMode,
      uploadedBy: user.id,
      targetWeek: targetWeek!,
    })

    return NextResponse.json({
      upload_id: upload.id,
      ad_week_id: targetWeek!.id,
      ad_week_label: targetWeek!.label || `WK ${targetWeek!.week_number}`,
      week_number: targetWeek!.week_number,
      year: targetWeek!.year,
      source: source.source,
      ...turnInResult,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Couldn\'t access that sheet') || message.includes('Invalid Google Sheets URL') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
