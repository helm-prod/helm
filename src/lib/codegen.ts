import { PANEL_PREFIXES, PANEL_SUFFIXES, computeGeneratedDescription, type Panel } from '@/lib/types/database'

export type EditorMode = 'form' | 'code'

export const CODE_STATUS_VALUES = ['none', 'generated', 'draft', 'final', 'loaded', 'proofed'] as const
export type CodeStatus = (typeof CODE_STATUS_VALUES)[number]

export const CODE_STATUS_LABELS: Record<CodeStatus, string> = {
  none: 'None',
  generated: 'Generated',
  draft: 'Draft',
  final: 'Final',
  loaded: 'Loaded',
  proofed: 'Proofed',
}

export const CODE_STATUS_COLORS: Record<CodeStatus, string> = {
  none: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
  generated: 'border-blue-500/40 bg-blue-500/20 text-blue-200',
  draft: 'border-amber-500/40 bg-amber-500/20 text-amber-200',
  final: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200',
  loaded: 'border-fuchsia-500/40 bg-fuchsia-500/20 text-fuchsia-200',
  proofed: 'border-cyan-500/40 bg-cyan-500/20 text-cyan-200',
}

export type TemplateVariableMap = Record<string, string>

const COMMON_VARIABLE_MAP: TemplateVariableMap = {
  '{{generated_description}}': 'generated_description',
  '{{image_src}}': 'image_reference',
  '{{link_href}}': 'link_url',
  '{{alt_text}}': 'generated_description',
  '{{exclusions}}': 'exclusions',
  '{{prefix}}': 'prefix',
  '{{value}}': 'value',
  '{{suffix}}': 'suffix',
  '{{item}}': 'item_description',
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizePlaceholder(placeholder: string): string {
  const trimmed = placeholder.trim()
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) return trimmed
  return `{{${trimmed.replace(/^\{+|\}+$/g, '').trim()}}}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lookupPanelField(panel: Partial<Panel>, fieldName: string): string {
  const key = fieldName.trim().toLowerCase()

  if (key === 'generated_description') {
    const generated = panel.generated_description || computeGeneratedDescription(panel)
    return asText(generated)
  }

  if (key === 'image_src') return asText(panel.image_reference)
  if (key === 'link_href') return asText(panel.link_url)
  if (key === 'alt_text') return asText(panel.generated_description || computeGeneratedDescription(panel))
  if (key === 'item') return asText(panel.item_description)
  if (key === 'offer_value') return asText(panel.value)

  return asText((panel as Record<string, unknown>)[fieldName])
}

export function mergeTemplateHtml({
  htmlTemplate,
  variableMap,
  panel,
}: {
  htmlTemplate: string
  variableMap: TemplateVariableMap | null | undefined
  panel: Partial<Panel>
}): string {
  let merged = htmlTemplate

  const resolvedMap: TemplateVariableMap = {
    ...COMMON_VARIABLE_MAP,
    ...(variableMap ?? {}),
  }

  for (const [rawPlaceholder, fieldName] of Object.entries(resolvedMap)) {
    const placeholder = normalizePlaceholder(rawPlaceholder)
    const value = lookupPanelField(panel, fieldName)
    merged = merged.replace(new RegExp(escapeRegExp(placeholder), 'g'), value)
  }

  return merged
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripHtml(html: string): string {
  return normalizeText(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  )
}

export function parseOfferFromHtml(html: string): {
  prefix: string | null
  value: string | null
  dollar_or_percent: '$' | '%' | null
  suffix: string | null
  item_description: string | null
  exclusions: string | null
  generated_description: string | null
} | null {
  const plain = stripHtml(html)
  if (!plain) return null

  const prefixes = [...PANEL_PREFIXES].map((value) => value.trim()).sort((a, b) => b.length - a.length)
  const suffixes = [...PANEL_SUFFIXES].map((value) => value.trim()).sort((a, b) => b.length - a.length)

  const prefix = prefixes.find((candidate) => plain.toLowerCase().includes(candidate.toLowerCase()))
  if (!prefix) return null

  const prefixIndex = plain.toLowerCase().indexOf(prefix.toLowerCase())
  if (prefixIndex < 0) return null

  const afterPrefix = plain.slice(prefixIndex + prefix.length).trim()
  const valueMatch = afterPrefix.match(/^(\$)?\s*(\d+(?:\.\d+)?)\s*(%)?/)
  if (!valueMatch) return null

  const currencySymbol = valueMatch[1] ? '$' : valueMatch[3] ? '%' : null
  const value = valueMatch[2] || null
  const afterValue = afterPrefix.slice(valueMatch[0].length).trim()

  const suffix = suffixes.find((candidate) => afterValue.toLowerCase().startsWith(candidate.toLowerCase()))
  if (!suffix) return null

  let itemPlusExclusions = afterValue.slice(suffix.length).trim()
  let exclusions: string | null = null
  const exclusionIndex = itemPlusExclusions.indexOf('*')
  if (exclusionIndex >= 0) {
    exclusions = itemPlusExclusions.slice(exclusionIndex).trim() || null
    itemPlusExclusions = itemPlusExclusions.slice(0, exclusionIndex).trim()
  }

  const itemDescription = itemPlusExclusions || null

  const generatedDescription = computeGeneratedDescription({
    prefix,
    value,
    dollar_or_percent: currencySymbol,
    suffix,
    item_description: itemDescription,
  })

  return {
    prefix,
    value,
    dollar_or_percent: currencySymbol,
    suffix,
    item_description: itemDescription,
    exclusions,
    generated_description: generatedDescription || null,
  }
}

export function getDefaultEditorMode(panel: Partial<Panel>): EditorMode {
  const hasStructuredOffer = Boolean(
    panel.prefix || panel.value || panel.suffix || panel.item_description || panel.generated_description
  )

  return hasStructuredOffer ? 'form' : 'code'
}

export function normalizeTemplateName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
