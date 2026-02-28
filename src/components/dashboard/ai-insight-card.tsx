'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatInteger, formatPercent, formatRelativeTime } from '@/lib/ga4-utils'
import type { AiInsight } from '@/lib/types/database'

interface Props {
  siteMetrics: {
    pageviews: number
    sessions: number
    users: number
    conversionRate: number | null
    pageviewsWow: number | null
    sessionsWow: number | null
    usersWow: number | null
  }
  categoryData: Array<{
    category: string
    pageviews: number
    sessions: number
    wowViews: number | null
  }>
  adWeekNumber: number | null
}

type GeminiResponse = {
  text?: string
  model?: string
  tokens?: number
  error?: string
}

function isFreshInsight(generatedAt: string | null) {
  if (!generatedAt) return false
  const generatedMs = new Date(generatedAt).getTime()
  if (!Number.isFinite(generatedMs)) return false
  return Date.now() - generatedMs < 12 * 60 * 60 * 1000
}

function formatSignedPercent(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return 'n/a'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function buildPrompt(params: Props) {
  const weekLabel = params.adWeekNumber === null ? 'Unknown' : String(params.adWeekNumber)
  const conversionText =
    params.siteMetrics.conversionRate === null
      ? 'n/a'
      : formatPercent(params.siteMetrics.conversionRate, 2)

  const categoryLines = [...params.categoryData]
    .sort((a, b) => b.pageviews - a.pageviews)
    .map(
      (category) =>
        `- ${category.category}: ${formatInteger(category.pageviews)} views, ${formatInteger(category.sessions)} sessions, ${formatSignedPercent(category.wowViews)} WoW`
    )
    .join('\n')

  return `Analyze this week's NEXCOM website performance (Ad Week ${weekLabel}):

Sitewide: ${formatInteger(params.siteMetrics.pageviews)} pageviews (${formatSignedPercent(params.siteMetrics.pageviewsWow)} WoW), ${formatInteger(params.siteMetrics.sessions)} sessions (${formatSignedPercent(params.siteMetrics.sessionsWow)} WoW), ${formatInteger(params.siteMetrics.users)} users (${formatSignedPercent(params.siteMetrics.usersWow)} WoW), ${conversionText} conversion rate.

Category breakdown (by pageviews):
${categoryLines}

Give a 3-4 sentence executive summary. Lead with the most important finding. Call out any categories with notable WoW changes (>20% swing). End with one actionable recommendation.`
}

function renderParagraphWithBold(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-strong-${idx}`} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }

    return <Fragment key={`${keyPrefix}-text-${idx}`}>{part}</Fragment>
  })
}

export function AiInsightCard({ siteMetrics, categoryData, adWeekNumber }: Props) {
  const supabase = useMemo(() => createClient(), [])

  const [insightText, setInsightText] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loadingCachedInsight, setLoadingCachedInsight] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hiddenByConfig, setHiddenByConfig] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true

    async function loadCachedInsight() {
      setLoadingCachedInsight(true)
      setError(null)

      const { data, error: queryError } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('insight_type', 'weekly_summary')
        .eq('scope', 'sitewide')
        .order('generated_at', { ascending: false })
        .limit(1)

      if (!active) return

      if (queryError) {
        console.error('Failed to load cached AI insight', queryError)
        setLoadingCachedInsight(false)
        return
      }

      const latestInsight = ((data ?? [])[0] ?? null) as AiInsight | null
      if (latestInsight && isFreshInsight(latestInsight.generated_at)) {
        setInsightText(latestInsight.response_text)
        setGeneratedAt(latestInsight.generated_at)
      }

      setLoadingCachedInsight(false)
    }

    void loadCachedInsight()

    return () => {
      active = false
    }
  }, [supabase])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)

    const prompt = buildPrompt({ siteMetrics, categoryData, adWeekNumber })

    try {
      const response = await fetch('/api/ai-gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          type: 'weekly_summary',
        }),
      })

      if (response.status === 503) {
        setHiddenByConfig(true)
        return
      }

      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(err?.error ?? 'Unable to generate insight')
      }

      const geminiData = (await response.json()) as GeminiResponse
      const text = geminiData.text?.trim()

      if (!text) {
        throw new Error('Unable to generate insight')
      }

      setInsightText(text)
      setGeneratedAt(new Date().toISOString())

      const cacheResponse = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          insight_type: 'weekly_summary',
          scope: 'sitewide',
          prompt_summary: `Ad Week ${adWeekNumber ?? 'Unknown'} sitewide summary`,
          response_text: text,
          model_used: geminiData.model ?? 'gemini-2.5-flash',
          tokens_used: geminiData.tokens ?? null,
        }),
      })

      if (cacheResponse.ok) {
        const cached = (await cacheResponse.json()) as AiInsight
        if (cached.generated_at) {
          setGeneratedAt(cached.generated_at)
        }
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate insight')
    } finally {
      setGenerating(false)
    }
  }, [adWeekNumber, categoryData, siteMetrics])

  if (hiddenByConfig) {
    return null
  }

  const generatedLabel = formatRelativeTime(generatedAt, nowMs)
  const paragraphs = insightText
    ? insightText
      .split(/\n\s*\n/g)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
    : []

  return (
    <div className="rounded-2xl border border-brand-800 border-l-4 border-l-purple-500/50 bg-brand-900 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-300" />
          <h3 className="text-base font-semibold text-white">Weekly Insight</h3>
        </div>
        <p className="text-xs text-brand-500">Powered by Gemini</p>
      </div>

      {loadingCachedInsight ? (
        <div className="mt-4 animate-pulse text-sm italic text-brand-400">Analyzing performance data...</div>
      ) : null}

      {generating ? (
        <div className="mt-4">
          <div className="animate-pulse text-sm italic text-brand-400">Analyzing performance data...</div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full rounded bg-brand-800/70" />
            <div className="h-3 w-11/12 rounded bg-brand-800/70" />
            <div className="h-3 w-10/12 rounded bg-brand-800/70" />
          </div>
        </div>
      ) : null}

      {!loadingCachedInsight && !generating && insightText ? (
        <div className="mt-4 space-y-3 text-sm leading-7 text-brand-200">
          {paragraphs.map((paragraph, index) => (
            <p key={`insight-paragraph-${index}`}>
              {renderParagraphWithBold(paragraph, `insight-${index}`)}
            </p>
          ))}
        </div>
      ) : null}

      {!loadingCachedInsight && !generating && !insightText && !error ? (
        <div className="mt-5 text-center">
          <p className="text-sm text-brand-400">
            Get an AI summary of this week&apos;s performance trends and recommendations.
          </p>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            className="mt-4 rounded-lg bg-nex-red px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-nex-redDark"
          >
            Generate Weekly Insight
          </button>
        </div>
      ) : null}

      {!loadingCachedInsight && !generating && error && !insightText ? (
        <div className="mt-5">
          <p className="text-sm text-red-300">Unable to generate insight</p>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-brand-700 px-3 py-1.5 text-sm text-brand-200 transition-colors hover:bg-brand-800/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : null}

      {!loadingCachedInsight && !generating && insightText ? (
        <div className="mt-5 flex items-center justify-between border-t border-brand-800 pt-3">
          <p className="text-xs text-brand-500">Generated {generatedLabel}</p>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-700 px-3 py-1.5 text-xs text-brand-200 transition-colors hover:bg-brand-800/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
        </div>
      ) : null}
    </div>
  )
}
