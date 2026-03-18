'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SiteQualityPanelResult } from '@/lib/site-quality/types'
import type { UserRole } from '@/lib/types/database'

type PanelResult = Omit<SiteQualityPanelResult, 'score' | 'panel_type'> & {
  score: number | null
  panel_type?: 'PRODUCT' | 'BRAND' | 'CATEGORY' | null
  featured_product?: string | null
  brand_name?: string | null
  cta_text?: string | null
  price_shown?: string | null
  offer_language?: string | null
  is_bot_blocked?: boolean
  redirect_count?: number
  product_count_on_destination?: number | null
  is_out_of_stock?: boolean
  has_empty_results?: boolean
  source_page_url?: string | null
  destination_relevance_keywords?: string[] | null
  panel_fingerprint?: string | null
}

interface AssignableUser {
  id: string
  full_name: string
  role: string
}

interface ReviewComment {
  id: string
  review_id: string
  author_id: string | null
  author_name: string
  comment: string
  created_at: string | null
}

interface PanelReview {
  id: string
  panel_fingerprint: string
  status: 'open' | 'addressed' | 'suppressed'
  priority: 'normal' | 'elevated' | 'critical'
  suppress_scoring_until: string | null
  assigned_to: string | null
  assigned_to_name: string | null
  assigned_by: string | null
  assigned_by_name: string | null
  assigned_at: string | null
  addressed_by: string | null
  addressed_by_name: string | null
  addressed_at: string | null
  comments: ReviewComment[]
}

function formatIssueType(type: string): string {
  const labels: Record<string, string> = {
    item_not_found: 'Item Not Found',
    price_mismatch: 'Price Mismatch',
    wrong_destination: 'Wrong Destination',
    weak_correlation: 'Weak Correlation',
    empty_destination: 'Empty Destination',
    dead_link: 'Dead Link',
    redirect: 'Redirect',
    bot_blocked: 'Bot Blocked',
    none: 'No Issues',
  }
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function issueColor(type: string): { bg: string; text: string; border: string } {
  switch (type) {
    case 'dead_link':
    case 'wrong_destination':
      return { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/25' }
    case 'item_not_found':
    case 'price_mismatch':
    case 'empty_destination':
      return { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/25' }
    case 'weak_correlation':
      return { bg: 'bg-yellow-500/10', text: 'text-yellow-300', border: 'border-yellow-500/25' }
    default:
      return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' }
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-slate-500'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function extractPageLabel(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname
    if (path === '/' || path === '') return 'Homepage'
    const segments = path.split('/').filter(Boolean)
    const meaningful = segments.filter((s) => s !== 'browse' && !s.startsWith('_') && !s.startsWith('N-'))
    if (meaningful.length > 0) {
      const raw = meaningful[meaningful.length - 1]
      return raw.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    }
    return 'Unknown Page'
  } catch {
    return 'Unknown Page'
  }
}

function MetaRow({ label, value, pill = false }: { label: string; value: string; pill?: boolean }) {
  return (
    <>
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-200">
        {pill ? <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">{value}</span> : value}
      </div>
    </>
  )
}

function canManageReviews(role: UserRole) {
  return role === 'admin' || role === 'senior_web_producer'
}

async function computePanelFingerprint(panelImageUrl: string, outboundUrl: string) {
  const input = `${panelImageUrl}::${outboundUrl}`.toLowerCase().trim()
  const data = new TextEncoder().encode(input)
  const digest = await window.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

export function PanelDetailDrawer({
  panel,
  open,
  onClose,
  userRole,
  assignableUsers,
  onReviewChange,
}: {
  panel: PanelResult | null
  open: boolean
  onClose: () => void
  userRole: UserRole
  assignableUsers: AssignableUser[]
  onReviewChange: () => Promise<void> | void
}) {
  const [review, setReview] = useState<PanelReview | null>(null)
  const [panelFingerprint, setPanelFingerprint] = useState<string | null>(panel?.panel_fingerprint ?? null)
  const [toast, setToast] = useState<string | null>(null)
  const [actionMode, setActionMode] = useState<'assign' | 'suppress' | 'comment' | null>(null)
  const [assignTarget, setAssignTarget] = useState('')
  const [assignNote, setAssignNote] = useState('')
  const [suppressUntil, setSuppressUntil] = useState(() => {
    const next = new Date()
    next.setDate(next.getDate() + 28)
    return next.toISOString().slice(0, 10)
  })
  const [suppressNote, setSuppressNote] = useState('')
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    if (open) window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!panel) {
      setPanelFingerprint(null)
      return
    }

    const currentPanel = panel
    let cancelled = false

    async function loadFingerprint() {
      if (currentPanel.panel_fingerprint) {
        setPanelFingerprint(currentPanel.panel_fingerprint)
        return
      }
      const fingerprint = await computePanelFingerprint(currentPanel.panel_image_url, currentPanel.outbound_url)
      if (!cancelled) setPanelFingerprint(fingerprint)
    }

    void loadFingerprint()
    return () => {
      cancelled = true
    }
  }, [panel])

  useEffect(() => {
    if (!open || !panelFingerprint) {
      setReview(null)
      return
    }

    const fingerprint = panelFingerprint
    let cancelled = false

    async function loadReview() {
      const response = await fetch(`/api/panel-reviews?fingerprint=${encodeURIComponent(fingerprint)}`)
      const data = await response.json()
      if (!response.ok || cancelled) return
      setReview((data.reviews ?? [])[0] ?? null)
    }

    void loadReview()
    return () => {
      cancelled = true
    }
  }, [open, panelFingerprint])

  const visibleIssues = useMemo(() => (panel?.issues ?? []).filter((issue) => issue.type !== 'none'), [panel])

  const analysisRows = useMemo(() => {
    if (!panel) return []
    return [
      panel.panel_type ? ['Type', panel.panel_type, true] as const : null,
      panel.brand_name ? ['Brand', panel.brand_name, false] as const : null,
      panel.featured_product ? ['Product', panel.featured_product, false] as const : null,
      panel.price_shown ? ['Price', panel.price_shown, false] as const : null,
      panel.offer_language ? ['Offer', panel.offer_language, false] as const : null,
      panel.cta_text ? ['CTA', panel.cta_text, false] as const : null,
    ].filter(Boolean) as Array<readonly [string, string, boolean]>
  }, [panel])

  if (!open || !panel) return null

  const activePanel = panel
  const canManage = canManageReviews(userRole)
  const pageLabel = activePanel.source_page_url ? extractPageLabel(activePanel.source_page_url) : activePanel.category_l1
  const productCount = activePanel.product_count_on_destination ?? null
  const productVisibilityTone =
    productCount === null
      ? 'text-slate-500'
      : productCount >= 6
        ? 'text-emerald-400'
        : productCount >= 1
          ? 'text-amber-400'
          : 'text-red-400'

  async function refreshLocalReview() {
    if (!panelFingerprint) return
    const response = await fetch(`/api/panel-reviews?fingerprint=${encodeURIComponent(panelFingerprint)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Failed to refresh review')
    setReview((data.reviews ?? [])[0] ?? null)
    await onReviewChange()
  }

  async function ensureReview(overrides?: Record<string, unknown>) {
    if (!panelFingerprint) throw new Error('Panel fingerprint not ready')
    if (review) return review

    const response = await fetch('/api/panel-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        panel_fingerprint: panelFingerprint,
        panel_image_url: activePanel.panel_image_url,
        outbound_url: activePanel.outbound_url,
        source_page_url: activePanel.source_page_url,
        panel_name: activePanel.panel_name,
        ...overrides,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Failed to create review')
    setReview(data.review)
    await onReviewChange()
    return data.review as PanelReview
  }

  async function handleAssign() {
    if (!assignTarget) return
    setSubmitting(true)
    try {
      const existing = review ?? await ensureReview()
      const response = await fetch('/api/panel-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existing.id, assigned_to: assignTarget, priority: 'elevated', status: 'open' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to assign review')

      if (assignNote.trim()) {
        const commentResponse = await fetch('/api/panel-reviews/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ review_id: existing.id, comment: assignNote.trim() }),
        })
        const commentData = await commentResponse.json()
        if (!commentResponse.ok) throw new Error(commentData.error || 'Failed to post assignment note')
      }

      await refreshLocalReview()
      setAssignNote('')
      setAssignTarget('')
      setActionMode(null)
      setToast('Review assigned')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Assignment failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEscalate() {
    setSubmitting(true)
    try {
      if (review) {
        const response = await fetch('/api/panel-reviews', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: review.id, priority: 'critical', status: 'open' }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to escalate review')
      } else {
        await ensureReview({ priority: 'critical' })
      }

      await refreshLocalReview()
      setToast('Review escalated')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Escalation failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSuppress() {
    setSubmitting(true)
    try {
      const existing = review ?? await ensureReview({ status: 'suppressed', suppress_scoring_until: suppressUntil })
      const response = await fetch('/api/panel-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existing.id, status: 'suppressed', suppress_scoring_until: suppressUntil }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to suppress scoring')

      if (suppressNote.trim()) {
        const commentResponse = await fetch('/api/panel-reviews/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ review_id: existing.id, comment: suppressNote.trim() }),
        })
        const commentData = await commentResponse.json()
        if (!commentResponse.ok) throw new Error(commentData.error || 'Failed to post suppression note')
      }

      await refreshLocalReview()
      setSuppressNote('')
      setActionMode(null)
      setToast('Scoring suppressed')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Suppression failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleComment() {
    if (!commentText.trim()) return
    setSubmitting(true)
    try {
      const existing = review ?? await ensureReview({ status: 'open', priority: 'normal' })
      const response = await fetch('/api/panel-reviews/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: existing.id, comment: commentText.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to add comment')

      await refreshLocalReview()
      setCommentText('')
      setActionMode(null)
      setToast('Comment added')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Comment failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 max-h-[85vh] w-full max-w-[580px] overflow-y-auto rounded-[10px] border border-[rgba(71,85,105,0.3)] bg-[#111827] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-3 top-3 text-sm text-slate-500 hover:text-slate-200" aria-label="Close modal">
          ✕
        </button>

        {toast && (
          <div className="mb-3 rounded-md border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
            {toast}
          </div>
        )}

        <div className="flex items-start justify-between gap-4 pr-6">
          <div>
            <h2 className="text-[15px] font-medium text-slate-100">{panel.panel_name}</h2>
            <div className="mt-1 text-[11px] text-slate-500">
              <span>{pageLabel}</span>
              <span>{' · '}</span>
              <span>{panel.aor_owner}</span>
              <span>{' · '}</span>
              <span>Found on: </span>
              {panel.source_page_url ? (
                <a href={panel.source_page_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                  {panel.source_page_url}
                </a>
              ) : (
                <span>{panel.category_l1}</span>
              )}
            </div>
          </div>

          {panel.is_bot_blocked ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-amber-300">
              <div className="text-xs font-medium">⚠ Manual verification required</div>
              <div className="mt-1 text-[11px] leading-relaxed">
                Automated access to this destination was blocked (HTTP 403). Open the destination URL manually to verify it works for real customers.
              </div>
            </div>
          ) : (
            <div className="text-right">
              <div className={`text-2xl font-medium ${scoreColor(panel.score)}`}>{panel.score ?? '—'}</div>
              <div className="text-[10px] text-slate-500">Δ —</div>
            </div>
          )}
        </div>

        {panel.panel_image_url && (
          <section className="mt-4 rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#1a2332] p-3">
            <img src={panel.panel_image_url} alt={panel.panel_name} className="w-full rounded-md object-cover" />
          </section>
        )}

        {analysisRows.length > 0 && (
          <section className="mt-4 border-b border-[rgba(71,85,105,0.15)] pb-4">
            <div className="border-b border-[rgba(71,85,105,0.15)] pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Panel analysis</div>
            <div className="mt-3 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-xs">
              {analysisRows.map(([label, value, pill]) => (
                <MetaRow key={label} label={label} value={value} pill={pill} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-4 border-b border-[rgba(71,85,105,0.15)] pb-4">
          <div className="border-b border-[rgba(71,85,105,0.15)] pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Destination</div>
          <div className="mt-3 space-y-2 text-xs">
            <a href={panel.outbound_url} target="_blank" rel="noreferrer" className="break-all text-blue-400 hover:text-blue-300">
              {panel.outbound_url}
            </a>
            {typeof panel.redirect_count === 'number' && panel.redirect_count > 0 && (
              <div className={`text-[11px] ${panel.redirect_count >= 2 ? 'text-amber-300' : 'text-slate-400'}`}>
                ↪ {panel.redirect_count} redirect{panel.redirect_count === 1 ? '' : 's'}
              </div>
            )}
            {productCount !== null && <div className={`text-[11px] ${productVisibilityTone}`}>{productCount} products visible</div>}
            {panel.has_empty_results && <div className="text-[11px] text-red-300">⚠ Destination returned no products</div>}
            {panel.destination_relevance_keywords && panel.destination_relevance_keywords.length > 0 && (
              <div className="text-[11px] text-slate-500">{panel.destination_relevance_keywords.join(' · ')}</div>
            )}
          </div>
        </section>

        {!panel.is_bot_blocked && visibleIssues.length > 0 && (
          <section className="mt-4 border-b border-[rgba(71,85,105,0.15)] pb-4">
            <div className="border-b border-[rgba(71,85,105,0.15)] pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Issue</div>
            <div className="mt-3 space-y-3">
              {visibleIssues.map((issue, index) => {
                const color = issueColor(issue.type)
                return (
                  <div key={`${issue.type}-${index}`} className="rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#1a2332] p-3">
                    <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${color.bg} ${color.text} ${color.border}`}>{formatIssueType(issue.type)}</div>
                    {panel.featured_product && issue.type === 'item_not_found' && <div className="mt-2 text-xs text-slate-500">Looking for: {panel.featured_product}</div>}
                    <div className="mt-2 text-xs text-slate-400">{issue.detail}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {!panel.is_bot_blocked && (
          <section className="mt-4 border-b border-[rgba(71,85,105,0.15)] pb-4">
            <div className="border-b border-[rgba(71,85,105,0.15)] pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">AI reasoning</div>
            <div className="mt-3 text-xs leading-relaxed text-slate-500">{panel.ai_reasoning}</div>
          </section>
        )}

        <section className="mt-4 rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#1a2332] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${review?.status === 'suppressed' ? 'bg-emerald-500/10 text-emerald-300' : review?.status === 'addressed' ? 'bg-slate-500/10 text-slate-300' : 'bg-blue-500/10 text-blue-300'}`}>
              {review ? review.status.charAt(0).toUpperCase() + review.status.slice(1) : 'No Review'}
            </span>
            {review?.priority === 'elevated' && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">Elevated</span>}
            {review?.priority === 'critical' && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300">Critical</span>}
          </div>
          {review ? (
            <div className="mt-3 space-y-2 text-xs text-slate-400">
              {review.assigned_to_name && (
                <div>
                  Assigned to {review.assigned_to_name}
                  {review.assigned_by_name ? ` by ${review.assigned_by_name}` : ''}
                  {review.assigned_at ? ` · ${new Date(review.assigned_at).toLocaleString()}` : ''}
                </div>
              )}
              {review.status === 'suppressed' && review.suppress_scoring_until && (
                <div className="text-emerald-300">Scoring suppressed until {new Date(review.suppress_scoring_until).toLocaleDateString()}</div>
              )}
              <div className="space-y-2">
                {review.comments.length > 0 ? review.comments.map((comment) => (
                  <div key={comment.id} className="rounded-md border border-[rgba(71,85,105,0.15)] bg-[#111827] p-2">
                    <div className="text-[10px] text-slate-500">
                      {comment.author_name}
                      {comment.created_at ? ` · ${new Date(comment.created_at).toLocaleString()}` : ''}
                    </div>
                    <div className="mt-1 text-xs text-slate-300">{comment.comment}</div>
                  </div>
                )) : <div className="text-slate-500">No comments yet</div>}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-500">No review activity yet.</div>
          )}
        </section>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[rgba(71,85,105,0.15)] pt-4">
          {canManage && (
            <>
              <button type="button" onClick={() => setActionMode(actionMode === 'assign' ? null : 'assign')} className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2.5 py-1.5 text-[11px] text-blue-300">
                Assign for review
              </button>
              <button type="button" onClick={() => void handleEscalate()} className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
                Escalate
              </button>
              <button type="button" onClick={() => setActionMode(actionMode === 'suppress' ? null : 'suppress')} className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300">
                Suppress scoring
              </button>
            </>
          )}
          <button type="button" onClick={() => setActionMode(actionMode === 'comment' ? null : 'comment')} className="rounded-md border border-[rgba(71,85,105,0.15)] bg-[#1a2332] px-2.5 py-1.5 text-[11px] text-slate-400">
            Add comment
          </button>
        </div>

        {actionMode === 'assign' && canManage && (
          <div className="mt-3 rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#1a2332] p-3">
            <div className="space-y-2">
              <select value={assignTarget} onChange={(event) => setAssignTarget(event.target.value)} className="w-full rounded border border-[rgba(71,85,105,0.15)] bg-[#111827] px-2 py-1.5 text-xs text-slate-200">
                <option value="">Select producer</option>
                {assignableUsers.filter((user) => user.role !== 'admin').map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name}</option>
                ))}
              </select>
              <input value={assignNote} onChange={(event) => setAssignNote(event.target.value)} placeholder="Optional note" className="w-full rounded border border-[rgba(71,85,105,0.15)] bg-[#111827] px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500" />
              <button type="button" disabled={submitting || !assignTarget} onClick={() => void handleAssign()} className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2.5 py-1.5 text-[11px] text-blue-300 disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        )}

        {actionMode === 'suppress' && canManage && (
          <div className="mt-3 rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#1a2332] p-3">
            <div className="space-y-2">
              <input type="date" value={suppressUntil} onChange={(event) => setSuppressUntil(event.target.value)} className="w-full rounded border border-[rgba(71,85,105,0.15)] bg-[#111827] px-2 py-1.5 text-xs text-slate-200" />
              <input value={suppressNote} onChange={(event) => setSuppressNote(event.target.value)} placeholder="Suppression note" className="w-full rounded border border-[rgba(71,85,105,0.15)] bg-[#111827] px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500" />
              <button type="button" disabled={submitting} onClick={() => void handleSuppress()} className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300 disabled:opacity-50">
                Save suppression
              </button>
            </div>
          </div>
        )}

        {actionMode === 'comment' && (
          <div className="mt-3 rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#1a2332] p-3">
            <div className="space-y-2">
              <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add comment" rows={3} className="w-full rounded border border-[rgba(71,85,105,0.15)] bg-[#111827] px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500" />
              <button type="button" disabled={submitting || !commentText.trim()} onClick={() => void handleComment()} className="rounded-md border border-[rgba(71,85,105,0.15)] bg-[#111827] px-2.5 py-1.5 text-[11px] text-slate-300 disabled:opacity-50">
                Post comment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
