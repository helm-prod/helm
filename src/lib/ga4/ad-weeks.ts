import { readFileSync } from 'node:fs'
import path from 'node:path'

export interface AdWeekRecord {
  adWeek: number
  startDate: string
  endDate: string
  adYearGroup: string
  notes: string
}

interface CsvRow {
  [key: string]: string
}

const CSV_PATH = path.resolve(process.cwd(), 'src/data/ad-weeks-calendar.csv')

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase()
}

function parseCsv(content: string): CsvRow[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row: CsvRow = {}

    headers.forEach((header, index) => {
      row[header] = values[index] ?? ''
    })

    return row
  })
}

function readColumn(row: CsvRow, aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias)
    if (row[key] !== undefined) {
      return row[key]
    }
  }
  return ''
}

function parseDateToTimestamp(dateString: string) {
  const [year, month, day] = dateString.split('-').map((value) => Number.parseInt(value, 10))
  if (!year || !month || !day) return Number.NaN
  return Date.UTC(year, month - 1, day)
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function loadCalendar(): AdWeekRecord[] {
  const csv = readFileSync(CSV_PATH, 'utf8')
  const rows = parseCsv(csv)

  const records: AdWeekRecord[] = rows
    .map((row) => {
      const adWeekRaw = readColumn(row, ['Ad Week'])
      const adWeek = Number.parseInt(adWeekRaw, 10)
      const startDate = readColumn(row, ['Start Date'])
      const endDate = readColumn(row, ['End Date'])
      const adYearGroup = readColumn(row, ['Ad Year Group'])
      const notes = readColumn(row, ['Notes', 'Notes (as shown on calendar)'])

      if (!Number.isFinite(adWeek) || !startDate || !endDate || !adYearGroup) {
        return null
      }

      return {
        adWeek,
        startDate,
        endDate,
        adYearGroup,
        notes,
      }
    })
    .filter((record): record is AdWeekRecord => record !== null)

  records.sort((a, b) => parseDateToTimestamp(a.startDate) - parseDateToTimestamp(b.startDate))

  return records
}

const AD_WEEKS = loadCalendar()

function findWeekIndexByDate(date: Date) {
  const isoDate = toIsoDate(date)
  const timestamp = parseDateToTimestamp(isoDate)

  return AD_WEEKS.findIndex((week) => {
    const start = parseDateToTimestamp(week.startDate)
    const end = parseDateToTimestamp(week.endDate)
    return timestamp >= start && timestamp <= end
  })
}

export function getAdWeekByDate(date: Date): AdWeekRecord | null {
  const index = findWeekIndexByDate(date)
  return index >= 0 ? AD_WEEKS[index] : null
}

export function getCurrentAdWeek(): AdWeekRecord {
  const current = getAdWeekByDate(new Date())
  if (current) return current

  if (AD_WEEKS.length === 0) {
    throw new Error('Ad week calendar is empty or unreadable')
  }

  const today = parseDateToTimestamp(toIsoDate(new Date()))
  const first = AD_WEEKS[0]
  const last = AD_WEEKS[AD_WEEKS.length - 1]

  if (today < parseDateToTimestamp(first.startDate)) {
    return first
  }

  return last
}

export function getPreviousAdWeek(): AdWeekRecord {
  const current = getCurrentAdWeek()
  const currentIndex = AD_WEEKS.findIndex(
    (week) => week.adWeek === current.adWeek && week.adYearGroup === current.adYearGroup
  )

  if (currentIndex > 0) {
    return AD_WEEKS[currentIndex - 1]
  }

  if (AD_WEEKS.length > 1) {
    return AD_WEEKS[0]
  }

  return current
}

export function getAdWeekDates(adWeek: number, adYearGroup?: string) {
  const match = AD_WEEKS.find((week) => {
    if (week.adWeek !== adWeek) return false
    if (!adYearGroup) return true
    return week.adYearGroup === adYearGroup
  })

  if (!match) return null

  return {
    startDate: match.startDate,
    endDate: match.endDate,
  }
}

export function getAllAdWeeks() {
  return AD_WEEKS
}
