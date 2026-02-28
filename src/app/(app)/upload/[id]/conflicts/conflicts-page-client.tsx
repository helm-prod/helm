'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface ConflictData {
  id: string
  panel_id: string | null
  conflict_type: string | null
  uploaded_data: Record<string, unknown>
  resolution: string | null
  resolved_at: string | null
  created_at: string
  panel: {
    id: string
    category: string
    page_location: string
    priority: number | null
    panel_type: string | null
    prefix: string | null
    value: string | null
    dollar_or_percent: string | null
    suffix: string | null
    item_description: string | null
    exclusions: string | null
    generated_description: string | null
    brand_category_tracking: string | null
    direction: string | null
    image_reference: string | null
    link_intent: string | null
    special_dates: string | null
  } | null
}

interface UploadInfo {
  id: string
  filename: string
  ad_week_id: string | null
  conflict_rows: number
}

const COMPARE_FIELDS = [
  { key: 'category', label: 'Category' },
  { key: 'page_location', label: 'Page Location' },
  { key: 'priority', label: 'Priority' },
  { key: 'panel_type', label: 'Panel Type' },
  { key: 'prefix', label: 'Prefix' },
  { key: 'value', label: 'Value' },
  { key: 'dollar_or_percent', label: '$/% ' },
  { key: 'suffix', label: 'Suffix' },
  { key: 'item_description', label: 'Item Description' },
  { key: 'exclusions', label: 'Exclusions' },
  { key: 'generated_description', label: 'Generated Description' },
  { key: 'brand_category_tracking', label: 'Brand/Category' },
  { key: 'direction', label: 'Direction' },
  { key: 'image_reference', label: 'Image Reference' },
  { key: 'link_intent', label: 'Link Intent' },
  { key: 'special_dates', label: 'Special Dates' },
]

export default function ConflictsPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const uploadId = params.id as string

  const [upload, setUpload] = useState<UploadInfo | null>(null)
  const [conflicts, setConflicts] = useState<ConflictData[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)

  const fetchConflicts = useCallback(async () => {
    const { data: uploadData } = await supabase
      .from('uploads')
      .select('id, filename, ad_week_id, conflict_rows')
      .eq('id', uploadId)
      .single()

    setUpload(uploadData)

    const { data } = await supabase
      .from('panel_conflicts')
      .select('*, panel:panels!panel_id(id, category, page_location, priority, panel_type, prefix, value, dollar_or_percent, suffix, item_description, exclusions, generated_description, brand_category_tracking, direction, image_reference, link_intent, special_dates)')
      .eq('upload_id', uploadId)
      .order('created_at')

    setConflicts(data ?? [])
    setLoading(false)
  }, [supabase, uploadId])

  useEffect(() => {
    fetchConflicts()
  }, [fetchConflicts])

  async function resolveConflict(conflictId: string, resolution: 'keep_existing' | 'use_uploaded') {
    setResolving(conflictId)

    const conflict = conflicts.find((c) => c.id === conflictId)
    if (!conflict) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (resolution === 'use_uploaded' && conflict.panel_id && conflict.uploaded_data) {
      // Update the existing panel with the uploaded data
      const updateData: Record<string, unknown> = {}
      for (const field of COMPARE_FIELDS) {
        if (field.key in conflict.uploaded_data) {
          updateData[field.key] = conflict.uploaded_data[field.key]
        }
      }

      await supabase
        .from('panels')
        .update(updateData)
        .eq('id', conflict.panel_id)
    }

    // Mark the conflict as resolved
    await supabase
      .from('panel_conflicts')
      .update({
        resolution,
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', conflictId)

    setResolving(null)
    fetchConflicts()
  }

  if (loading) {
    return (
      <div className="max-w-6xl">
        <div className="px-6 py-12 text-center text-brand-500">Loading conflicts...</div>
      </div>
    )
  }

  const unresolvedCount = conflicts.filter((c) => !c.resolution).length

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <Link
          href="/upload"
          className="text-sm text-brand-500 hover:text-brand-300 transition-colors mb-2 inline-block"
        >
          &larr; Back to Uploads
        </Link>
        <h1 className="text-2xl font-bold text-white">Upload Conflicts</h1>
        <p className="text-brand-400 mt-1">
          {upload?.filename} &mdash; {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
          {unresolvedCount > 0 && `, ${unresolvedCount} unresolved`}
        </p>
      </div>

      {conflicts.length === 0 ? (
        <div className="bg-brand-900 border border-brand-800 rounded-xl px-6 py-12 text-center text-brand-500">
          No conflicts found for this upload.
        </div>
      ) : (
        <div className="space-y-6">
          {conflicts.map((conflict) => (
            <div
              key={conflict.id}
              className={`bg-brand-900 border rounded-xl overflow-hidden ${
                conflict.resolution ? 'border-brand-800/50 opacity-75' : 'border-orange-500/30'
              }`}
            >
              <div className="px-4 py-3 border-b border-brand-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-white">
                    {String(conflict.uploaded_data?.category ?? 'Unknown')} — {String(conflict.uploaded_data?.page_location ?? '')}
                  </span>
                  <span className="text-xs text-brand-500">
                    {conflict.conflict_type === 'duplicate_position'
                      ? 'Duplicate Position'
                      : conflict.conflict_type === 'duplicate_in_upload'
                        ? 'Duplicate In Upload'
                        : conflict.conflict_type}
                  </span>
                </div>
                {conflict.resolution ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                    Resolved: {conflict.resolution.replace('_', ' ')}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => resolveConflict(conflict.id, 'keep_existing')}
                      disabled={resolving === conflict.id}
                      className="px-3 py-1.5 text-xs bg-brand-700 hover:bg-brand-600 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {conflict.panel_id ? 'Keep Existing' : 'Dismiss'}
                    </button>
                    {conflict.panel_id && (
                      <button
                        onClick={() => resolveConflict(conflict.id, 'use_uploaded')}
                        disabled={resolving === conflict.id}
                        className="px-3 py-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        Use Uploaded
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Side by side comparison */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-brand-800 text-brand-500">
                      <th className="text-left px-4 py-2 font-medium w-40">Field</th>
                      <th className="text-left px-4 py-2 font-medium">Existing</th>
                      <th className="text-left px-4 py-2 font-medium">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-800/30">
                    {COMPARE_FIELDS.map((field) => {
                      const existingVal = String(conflict.panel?.[field.key as keyof typeof conflict.panel] ?? '')
                      const uploadedVal = String(conflict.uploaded_data?.[field.key] ?? '')
                      const isDifferent = existingVal !== uploadedVal && (existingVal || uploadedVal)

                      return (
                        <tr key={field.key} className={isDifferent ? 'bg-orange-500/5' : ''}>
                          <td className="px-4 py-2 text-brand-400 font-medium">{field.label}</td>
                          <td className={`px-4 py-2 ${isDifferent ? 'text-white' : 'text-brand-500'}`}>
                            {existingVal || '—'}
                          </td>
                          <td className={`px-4 py-2 ${isDifferent ? 'text-orange-300 font-medium' : 'text-brand-500'}`}>
                            {uploadedVal || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {upload?.ad_week_id && (
        <div className="mt-6">
          <Link
            href={`/ad-weeks/${upload.ad_week_id}`}
            className="text-sm text-brand-400 hover:text-white transition-colors"
          >
            View Ad Week Panels &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}
