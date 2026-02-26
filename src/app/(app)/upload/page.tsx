'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface AdWeekOption {
  id: string
  label: string | null
  week_number: number
  year: number
}

type UploadType = 'turn_in' | 'corrections' | 'ad_week_calendar'
type UploadMethod = 'file' | 'google'

function detectWeekFromFilename(filename: string): { weekNumber: number | null; year: number | null } {
  const basename = filename.replace(/\.[^.]+$/, '')
  const weekMatch = basename.match(/\bWK[_\-\s]?(\d{1,2})\b/i) ?? basename.match(/\bWEEK[_\-\s]?(\d{1,2})\b/i)
  const yearMatch = basename.match(/\b(20\d{2})\b/)

  return {
    weekNumber: weekMatch ? Number.parseInt(weekMatch[1], 10) : null,
    year: yearMatch ? Number.parseInt(yearMatch[1], 10) : null,
  }
}

export default function UploadPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const preselectedWeek = searchParams.get('ad_week_id') || ''

  const [adWeeks, setAdWeeks] = useState<AdWeekOption[]>([])
  const [selectedWeek, setSelectedWeek] = useState(preselectedWeek)
  const [uploadType, setUploadType] = useState<UploadType>('turn_in')
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>('file')
  const [file, setFile] = useState<File | null>(null)
  const [googleSheetUrl, setGoogleSheetUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCalendarUpload = uploadType === 'ad_week_calendar'

  useEffect(() => {
    async function fetchWeeks() {
      const { data } = await supabase
        .from('ad_weeks')
        .select('id, label, week_number, year')
        .order('year', { ascending: false })
        .order('week_number', { ascending: false })
      setAdWeeks(data ?? [])
    }
    fetchWeeks()
  }, [supabase])

  useEffect(() => {
    if (preselectedWeek) {
      setSelectedWeek(preselectedWeek)
    }
  }, [preselectedWeek])

  useEffect(() => {
    if (isCalendarUpload) {
      setUploadMethod('file')
      setSelectedWeek('')
      setGoogleSheetUrl('')
    }
  }, [isCalendarUpload])

  const detected = useMemo(() => {
    if (!file) return { weekNumber: null, year: null }
    return detectWeekFromFilename(file.name)
  }, [file])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()

    if (uploadMethod === 'file' && !file) {
      setError('Select a file to continue.')
      return
    }

    if (uploadMethod === 'google' && !googleSheetUrl.trim()) {
      setError('Paste a Google Sheets URL to continue.')
      return
    }

    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('upload_type', uploadType)

    if (uploadMethod === 'file' && file) {
      formData.append('file', file)
    }

    if (uploadMethod === 'google') {
      formData.append('google_sheet_url', googleSheetUrl.trim())
    }

    if (selectedWeek && !isCalendarUpload) {
      formData.append('ad_week_id', selectedWeek)
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Upload failed')
        setLoading(false)
        return
      }

      router.push(`/upload/${data.upload_id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-brand-700 bg-brand-900/70 px-3 py-2 text-white placeholder-brand-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40'

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="rounded-2xl border border-brand-800 bg-brand-900 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-white">Smart Upload Turn-In</h1>
        <p className="mt-2 text-brand-400">
          Import turn-in docs from file or Google Sheets, or seed ad week calendar dates for the year.
        </p>

        <form onSubmit={handleUpload} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-300">Upload Type</label>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as UploadType)}
                className={inputClass}
              >
                <option value="turn_in">Turn-In Doc</option>
                <option value="corrections">Corrections</option>
                <option value="ad_week_calendar">Ad Week Calendar</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              {!isCalendarUpload && (
                <div className="mb-2 inline-flex rounded-full border border-brand-700 bg-brand-900/60 p-1">
                  <button
                    type="button"
                    onClick={() => setUploadMethod('file')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      uploadMethod === 'file'
                        ? 'bg-blue-500/30 text-blue-100'
                        : 'text-brand-300 hover:text-white'
                    }`}
                  >
                    Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMethod('google')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      uploadMethod === 'google'
                        ? 'bg-blue-500/30 text-blue-100'
                        : 'text-brand-300 hover:text-white'
                    }`}
                  >
                    Paste Google Sheets Link
                  </button>
                </div>
              )}

              {(uploadMethod === 'file' || isCalendarUpload) && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-300">
                    {isCalendarUpload ? 'Calendar File (.xlsx, .xls, .csv)' : 'Excel File (.xlsx, .xls)'}
                  </label>
                  <input
                    type="file"
                    required={uploadMethod === 'file' || isCalendarUpload}
                    accept={isCalendarUpload ? '.xlsx,.xls,.csv' : '.xlsx,.xls'}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-brand-400 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
                  />
                </div>
              )}

              {uploadMethod === 'google' && !isCalendarUpload && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-300">Or paste Google Sheets link</label>
                  <input
                    type="url"
                    value={googleSheetUrl}
                    onChange={(e) => setGoogleSheetUrl(e.target.value)}
                    className={inputClass}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    required
                  />
                  <p className="mt-1 text-xs text-brand-500">
                    Sheet must be shared as "Anyone with the link can view."
                  </p>
                </div>
              )}
            </div>
          </div>

          {file && (uploadMethod === 'file' || isCalendarUpload) && (
            <div className="rounded-xl border border-brand-800 bg-brand-900/60 p-4">
              <p className="text-sm text-white">{file.name}</p>
              <p className="mt-1 text-xs text-brand-500">{(file.size / 1024).toFixed(1)} KB</p>
              {!isCalendarUpload && (
                <>
                  {detected.weekNumber ? (
                    <p className="mt-2 text-sm text-emerald-300">
                      Detected ad week: WK {detected.weekNumber}
                      {detected.year ? ` (${detected.year})` : ''}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-amber-300">
                      Could not detect week number from filename. Use the optional override below.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!isCalendarUpload && (
            <div className="rounded-xl border border-brand-800 bg-brand-900/40 p-4">
              <label className="mb-1 block text-sm font-medium text-brand-300">Optional Week Override</label>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className={inputClass}
              >
                <option value="">Auto-detect from filename (recommended)</option>
                {adWeeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    {week.label || `WK ${week.week_number}`} - {week.year}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-brand-500">
                Leave empty to auto-link/create by detected week. For Google Sheets links, set this explicitly.
              </p>
            </div>
          )}

          <details className="rounded-xl border border-brand-800 bg-brand-900/40 p-4">
            <summary className="cursor-pointer text-sm font-medium text-brand-300">View Expected Column Mapping</summary>
            {isCalendarUpload ? (
              <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-brand-500 sm:grid-cols-2">
                <span>A: Week Number</span>
                <span>B: Start Date</span>
                <span>C: End Date</span>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-brand-500 sm:grid-cols-2 lg:grid-cols-3">
                <span>A: Category</span>
                <span>B: Page Location</span>
                <span>C-E (row 1): Event names</span>
                <span>C-E (rows 2+): Event markers (X)</span>
                <span>F: Special Dates</span>
                <span>G: Priority</span>
                <span>H: Panel Name/Slot</span>
                <span>I: Prefix</span>
                <span>J: Value</span>
                <span>K: $/%</span>
                <span>L: Suffix</span>
                <span>M: Item Description</span>
                <span>N: Exclusions</span>
                <span>P: Brand/Category</span>
                <span>Q: Direction</span>
                <span>R: Image Reference</span>
                <span>S: Link Intent</span>
                <span>T: Link URL (optional)</span>
              </div>
            )}
          </details>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={loading || ((uploadMethod === 'file' || isCalendarUpload) && !file) || (uploadMethod === 'google' && !googleSheetUrl.trim())}
              className="rounded-full bg-nex-red px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-nex-redDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Importing...' : isCalendarUpload ? 'Seed Calendar' : 'Run Smart Import'}
            </button>
            <Link href="/ad-weeks" className="text-sm text-brand-400 underline-offset-2 hover:text-white hover:underline">
              Browse Ad Weeks
            </Link>
          </div>
        </form>
      </section>

      <RecentUploads />
    </div>
  )
}

function RecentUploads() {
  const supabase = useMemo(() => createClient(), [])
  const [uploads, setUploads] = useState<Array<{
    id: string
    filename: string
    upload_type: string | null
    status: string
    total_rows: number
    imported_rows: number
    conflict_rows: number
    created_at: string
    ad_week: { id: string; label: string | null; week_number: number; year: number } | null
  }>>([])

  useEffect(() => {
    async function fetchUploads() {
      const { data } = await supabase
        .from('uploads')
        .select('id, filename, upload_type, status, total_rows, imported_rows, conflict_rows, created_at, ad_week:ad_weeks!ad_week_id(id, label, week_number, year)')
        .order('created_at', { ascending: false })
        .limit(10)
      const normalized = (data ?? []).map((upload) => ({
        ...upload,
        ad_week: Array.isArray(upload.ad_week) ? upload.ad_week[0] ?? null : upload.ad_week,
      }))
      setUploads(normalized)
    }
    fetchUploads()
  }, [supabase])

  if (uploads.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-800 bg-brand-900 p-10 text-center">
        <p className="text-4xl text-brand-700">Upload</p>
        <p className="mt-3 text-sm text-brand-400">No uploads yet. Start with a turn-in document above.</p>
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-brand-800 bg-brand-900">
      <div className="flex items-center justify-between border-b border-brand-800 px-6 py-4">
        <h2 className="text-lg font-semibold text-white">Recent Uploads</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-brand-400">
              <th className="px-4 py-3 text-left font-medium">File</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Week</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Imported</th>
              <th className="px-4 py-3 text-left font-medium">Conflicts</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {uploads.map((upload, index) => (
              <tr
                key={upload.id}
                className={`${index % 2 === 0 ? 'bg-brand-900/30' : 'bg-brand-900/10'} transition-colors hover:bg-brand-800/40`}
              >
                <td className="px-4 py-3">
                  <Link href={`/upload/${upload.id}`} className="font-medium text-white hover:text-brand-300">
                    {upload.filename}
                  </Link>
                </td>
                <td className="px-4 py-3 text-brand-300">{upload.upload_type || '-'}</td>
                <td className="px-4 py-3 text-brand-300">
                  {upload.ad_week ? upload.ad_week.label || `WK ${upload.ad_week.week_number}` : '-'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                      upload.status === 'complete'
                        ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                        : upload.status === 'partial'
                          ? 'border-amber-500/30 bg-amber-500/20 text-amber-300'
                          : upload.status === 'failed'
                            ? 'border-red-500/30 bg-red-500/20 text-red-300'
                            : 'border-blue-500/30 bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {upload.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-brand-300">{upload.imported_rows}/{upload.total_rows}</td>
                <td className="px-4 py-3 text-brand-300">
                  {upload.conflict_rows > 0 ? (
                    <Link href={`/upload/${upload.id}/conflicts`} className="text-amber-300 underline-offset-2 hover:underline">
                      {upload.conflict_rows}
                    </Link>
                  ) : (
                    '0'
                  )}
                </td>
                <td className="px-4 py-3 text-brand-500">
                  {new Date(upload.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
