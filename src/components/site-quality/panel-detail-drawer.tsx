'use client'

import { useEffect } from 'react'
import type { SiteQualityPanelResult } from '@/lib/site-quality/types'

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

function formatPageLabel(sourcePageUrl: string | null | undefined, fallback: string) {
  if (!sourcePageUrl) return fallback

  try {
    const url = new URL(sourcePageUrl)
    if (url.pathname === '/' || url.pathname === '') return 'Homepage'
    const parts = url.pathname.split('/').filter(Boolean)
    const raw = parts[0] === 'browse' && parts[1] ? parts[1] : parts[0] || fallback
    return raw
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  } catch {
    return fallback
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

export function PanelDetailDrawer({
  panel,
  open,
  onClose,
}: {
  panel: PanelResult | null
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    if (open) window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || !panel) return null

  const visibleIssues = (panel.issues ?? []).filter((issue) => issue.type !== 'none')
  const pageLabel = formatPageLabel(panel.source_page_url, panel.category_l1)
  const analysisRows = [
    panel.panel_type ? ['Type', panel.panel_type, true] as const : null,
    panel.brand_name ? ['Brand', panel.brand_name, false] as const : null,
    panel.featured_product ? ['Product', panel.featured_product, false] as const : null,
    panel.price_shown ? ['Price', panel.price_shown, false] as const : null,
    panel.offer_language ? ['Offer', panel.offer_language, false] as const : null,
    panel.cta_text ? ['CTA', panel.cta_text, false] as const : null,
  ].filter(Boolean) as Array<readonly [string, string, boolean]>

  const productCount = panel.product_count_on_destination ?? null
  const productVisibilityTone =
    productCount === null
      ? 'text-slate-500'
      : productCount >= 6
        ? 'text-emerald-400'
        : productCount >= 1
          ? 'text-amber-400'
          : 'text-red-400'

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div
        className="relative mx-4 max-h-[85vh] w-full max-w-[580px] overflow-y-auto rounded-[10px] border border-[rgba(71,85,105,0.3)] bg-[#111827] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 text-sm text-slate-500 hover:text-slate-200"
          aria-label="Close modal"
        >
          ✕
        </button>

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
            <div className="border-b border-[rgba(71,85,105,0.15)] pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Panel analysis
            </div>
            <div className="mt-3 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-xs">
              {analysisRows.map(([label, value, pill]) => (
                <MetaRow key={label} label={label} value={value} pill={pill} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-4 border-b border-[rgba(71,85,105,0.15)] pb-4">
          <div className="border-b border-[rgba(71,85,105,0.15)] pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Destination
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <a href={panel.outbound_url} target="_blank" rel="noreferrer" className="break-all text-blue-400 hover:text-blue-300">
              {panel.outbound_url}
            </a>
            {typeof panel.redirect_count === 'number' && panel.redirect_count > 0 && (
              <div className={`text-[11px] ${panel.redirect_count >= 2 ? 'text-amber-300' : 'text-slate-400'}`}>
                ↪ {panel.redirect_count} redirect{panel.redirect_count === 1 ? '' : 's'}
              </div>
            )}
            {productCount !== null && (
              <div className={`text-[11px] ${productVisibilityTone}`}>{productCount} products visible</div>
            )}
            {panel.has_empty_results && (
              <div className="text-[11px] text-red-300">⚠ Destination returned no products</div>
            )}
            {panel.destination_relevance_keywords && panel.destination_relevance_keywords.length > 0 && (
              <div className="text-[11px] text-slate-500">{panel.destination_relevance_keywords.join(' · ')}</div>
            )}
          </div>
        </section>

        {!panel.is_bot_blocked && visibleIssues.length > 0 && (
          <section className="mt-4 border-b border-[rgba(71,85,105,0.15)] pb-4">
            <div className="border-b border-[rgba(71,85,105,0.15)] pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Issue
            </div>
            <div className="mt-3 space-y-3">
              {visibleIssues.map((issue, index) => {
                const color = issueColor(issue.type)
                return (
                  <div key={`${issue.type}-${index}`} className="rounded-lg border border-[rgba(71,85,105,0.15)] bg-[#1a2332] p-3">
                    <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${color.bg} ${color.text} ${color.border}`}>
                      {formatIssueType(issue.type)}
                    </div>
                    {panel.featured_product && issue.type === 'item_not_found' && (
                      <div className="mt-2 text-xs text-slate-500">Looking for: {panel.featured_product}</div>
                    )}
                    <div className="mt-2 text-xs text-slate-400">{issue.detail}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {!panel.is_bot_blocked && (
          <section className="mt-4 border-b border-[rgba(71,85,105,0.15)] pb-4">
            <div className="border-b border-[rgba(71,85,105,0.15)] pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              AI reasoning
            </div>
            <div className="mt-3 text-xs leading-relaxed text-slate-500">{panel.ai_reasoning}</div>
          </section>
        )}

        <div className="mt-4 rounded-lg border border-dashed border-[rgba(71,85,105,0.3)] bg-[rgba(30,41,59,0.3)] p-4 text-center">
          <div className="text-[11px] text-slate-500">Comments & review history</div>
          <div className="mt-1 text-[10px] text-slate-500 opacity-60">Thread of comments from reviewers will appear here</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[rgba(71,85,105,0.15)] pt-4">
          <button type="button" className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2.5 py-1.5 text-[11px] text-blue-300">
            Assign for review
          </button>
          <button type="button" className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
            Escalate
          </button>
          <button type="button" className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300">
            Suppress scoring
          </button>
          <button type="button" className="rounded-md border border-[rgba(71,85,105,0.15)] bg-[#1a2332] px-2.5 py-1.5 text-[11px] text-slate-400">
            Add comment
          </button>
        </div>
      </div>
    </div>
  )
}
