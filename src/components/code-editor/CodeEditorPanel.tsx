'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Panel, computeGeneratedDescription } from '@/lib/types/database'
import {
  getDefaultEditorMode,
  mergeTemplateHtml,
  parseOfferFromHtml,
  type CodeStatus,
} from '@/lib/codegen'
import { FormMode } from './FormMode'
import { CodeMode } from './CodeMode'
import { CodePreview } from './CodePreview'
import { PanelStatusBar } from './PanelStatusBar'

interface PageTemplateLite {
  id: string
  name: string
  url: string | null
  page_type: string
  slots: Array<{ name: string; label?: string }>
}

interface CodeTemplateLite {
  id: string
  slot_name: string
  html_template: string
  variable_map: Record<string, string>
  version: number
}

const MODE_BUTTON_CLASS =
  'rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export function CodeEditorPanel({
  panel,
  canEdit,
  onClose,
  onPanelUpdated,
  templatesHref = '/templates',
}: {
  panel: Panel
  canEdit: boolean
  onClose: () => void
  onPanelUpdated?: (panel: Panel) => void
  templatesHref?: string
}) {
  const supabase = createClient()

  const [panelState, setPanelState] = useState(panel)
  const [mode, setMode] = useState<'form' | 'code'>(getDefaultEditorMode(panel))
  const [parseWarning, setParseWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [pageTemplate, setPageTemplate] = useState<PageTemplateLite | null>(null)
  const [codeTemplate, setCodeTemplate] = useState<CodeTemplateLite | null>(null)
  const [loadingTemplate, setLoadingTemplate] = useState(false)

  const [formValues, setFormValues] = useState({
    prefix: panel.prefix || '',
    value: panel.value || '',
    dollar_or_percent: (panel.dollar_or_percent || '') as '$' | '%' | '',
    suffix: panel.suffix || '',
    item_description: panel.item_description || '',
    exclusions: panel.exclusions || '',
    image_reference: panel.image_reference || '',
    link_intent: panel.link_intent || '',
    link_url: panel.link_url || '',
  })

  const [editorValue, setEditorValue] = useState(
    panel.generated_code_draft || panel.generated_code || panel.generated_code_final || ''
  )
  const [generatedPreview, setGeneratedPreview] = useState(panel.generated_code || '')

  const [isGenerating, setIsGenerating] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [markingFinal, setMarkingFinal] = useState(false)
  const [markingLoaded, setMarkingLoaded] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPanelState(panel)
    setMode(getDefaultEditorMode(panel))
    setParseWarning(null)
    setError(null)
    setFormValues({
      prefix: panel.prefix || '',
      value: panel.value || '',
      dollar_or_percent: (panel.dollar_or_percent || '') as '$' | '%' | '',
      suffix: panel.suffix || '',
      item_description: panel.item_description || '',
      exclusions: panel.exclusions || '',
      image_reference: panel.image_reference || '',
      link_intent: panel.link_intent || '',
      link_url: panel.link_url || '',
    })
    setEditorValue(panel.generated_code_draft || panel.generated_code || panel.generated_code_final || '')
    setGeneratedPreview(panel.generated_code || '')
  }, [panel])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    async function loadTemplates() {
      if (!panelState.page_template_id) {
        setPageTemplate(null)
        setCodeTemplate(null)
        return
      }

      setLoadingTemplate(true)

      const [pageRes, codeRes] = await Promise.all([
        supabase
          .from('page_templates')
          .select('id, name, url, page_type, slots')
          .eq('id', panelState.page_template_id)
          .maybeSingle(),
        panelState.panel_type
          ? supabase
              .from('code_templates')
              .select('id, slot_name, html_template, variable_map, version')
              .eq('page_template_id', panelState.page_template_id)
              .eq('slot_name', panelState.panel_type)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

      setPageTemplate((pageRes.data as PageTemplateLite | null) ?? null)
      setCodeTemplate((codeRes.data as CodeTemplateLite | null) ?? null)
      setLoadingTemplate(false)
    }

    loadTemplates()
  }, [panelState.page_template_id, panelState.panel_type, supabase])

  const generatedDescription = useMemo(
    () =>
      computeGeneratedDescription({
        prefix: formValues.prefix || null,
        value: formValues.value || null,
        dollar_or_percent: formValues.dollar_or_percent || null,
        suffix: formValues.suffix || null,
        item_description: formValues.item_description || null,
      }),
    [formValues]
  )

  async function persistPanelPatch(patch: Partial<Panel>) {
    if (!canEdit) return

    const { data, error: updateError } = await supabase
      .from('panels')
      .update(patch)
      .eq('id', panelState.id)
      .select('*')
      .single()

    if (updateError || !data) {
      setError(updateError?.message || 'Failed to save panel code')
      return
    }

    setError(null)
    const nextPanel = data as Panel
    setPanelState(nextPanel)
    onPanelUpdated?.(nextPanel)
  }

  async function generateCode({ persist = true }: { persist?: boolean } = {}) {
    setParseWarning(null)

    if (!codeTemplate) {
      setGeneratedPreview('')
      if (!persist) return

      await persistPanelPatch({
        prefix: formValues.prefix || null,
        value: formValues.value || null,
        dollar_or_percent: formValues.dollar_or_percent || null,
        suffix: formValues.suffix || null,
        item_description: formValues.item_description || null,
        exclusions: formValues.exclusions || null,
        generated_description: generatedDescription || null,
        image_reference: formValues.image_reference || null,
        link_intent: formValues.link_intent || null,
        link_url: formValues.link_url || null,
      })
      return
    }

    setIsGenerating(true)

    const merged = mergeTemplateHtml({
      htmlTemplate: codeTemplate.html_template,
      variableMap: codeTemplate.variable_map,
      panel: {
        ...panelState,
        prefix: formValues.prefix || null,
        value: formValues.value || null,
        dollar_or_percent: formValues.dollar_or_percent || null,
        suffix: formValues.suffix || null,
        item_description: formValues.item_description || null,
        exclusions: formValues.exclusions || null,
        generated_description: generatedDescription || null,
        image_reference: formValues.image_reference || null,
        link_intent: formValues.link_intent || null,
        link_url: formValues.link_url || null,
      },
    })

    setGeneratedPreview(merged)
    setEditorValue(merged)

    if (persist) {
      await persistPanelPatch({
        prefix: formValues.prefix || null,
        value: formValues.value || null,
        dollar_or_percent: formValues.dollar_or_percent || null,
        suffix: formValues.suffix || null,
        item_description: formValues.item_description || null,
        exclusions: formValues.exclusions || null,
        generated_description: generatedDescription || null,
        image_reference: formValues.image_reference || null,
        link_intent: formValues.link_intent || null,
        link_url: formValues.link_url || null,
        generated_code: merged,
        code_status: 'generated',
      })
    }

    setIsGenerating(false)
  }

  async function handleSaveDraft() {
    setSavingDraft(true)
    await persistPanelPatch({
      prefix: formValues.prefix || null,
      value: formValues.value || null,
      dollar_or_percent: formValues.dollar_or_percent || null,
      suffix: formValues.suffix || null,
      item_description: formValues.item_description || null,
      exclusions: formValues.exclusions || null,
      generated_description: generatedDescription || null,
      image_reference: formValues.image_reference || null,
      link_intent: formValues.link_intent || null,
      link_url: formValues.link_url || null,
      generated_code_draft: editorValue || null,
      code_status: 'draft',
    })
    setSavingDraft(false)
  }

  async function handleMarkFinal() {
    setMarkingFinal(true)
    const finalCode = editorValue || panelState.generated_code_draft || panelState.generated_code || ''

    await persistPanelPatch({
      prefix: formValues.prefix || null,
      value: formValues.value || null,
      dollar_or_percent: formValues.dollar_or_percent || null,
      suffix: formValues.suffix || null,
      item_description: formValues.item_description || null,
      exclusions: formValues.exclusions || null,
      generated_description: generatedDescription || null,
      image_reference: formValues.image_reference || null,
      link_intent: formValues.link_intent || null,
      link_url: formValues.link_url || null,
      generated_code_draft: editorValue || null,
      generated_code_final: finalCode || null,
      code_status: 'final',
    })

    setMarkingFinal(false)
  }

  async function handleMarkLoaded() {
    setMarkingLoaded(true)
    await persistPanelPatch({ code_status: 'loaded' })
    setMarkingLoaded(false)
  }

  async function handleCopy() {
    const textToCopy =
      panelState.generated_code_final || editorValue || panelState.generated_code_draft || panelState.generated_code || ''
    if (!textToCopy) return

    await navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  async function handleModeChange(nextMode: 'form' | 'code') {
    if (nextMode === mode) return

    if (nextMode === 'code') {
      if (codeTemplate) {
        await generateCode({ persist: false })
      }
      setMode('code')
      return
    }

    const parsed = parseOfferFromHtml(editorValue)
    if (!parsed) {
      setParseWarning("Code was manually edited and can't be parsed back to form fields.")
      setMode('form')
      return
    }

    setFormValues((current) => ({
      ...current,
      prefix: parsed.prefix || '',
      value: parsed.value || '',
      dollar_or_percent: parsed.dollar_or_percent || '',
      suffix: parsed.suffix || '',
      item_description: parsed.item_description || '',
      exclusions: parsed.exclusions || '',
    }))
    setParseWarning(null)
    setMode('form')
  }

  const codeStatus = (panelState.code_status || 'none') as CodeStatus
  const showMarkLoaded = codeStatus === 'final' || codeStatus === 'loaded' || codeStatus === 'proofed'

  return (
    <div className="fixed inset-0 z-50 flex">
      <button type="button" onClick={onClose} className="h-full flex-1 bg-black/40" aria-label="Close code editor" />

      <aside className="ml-auto flex h-full w-full max-w-[1100px] flex-col border-l border-brand-800 bg-brand-900 shadow-2xl md:w-[70vw]">
        <header className="border-b border-brand-800 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-brand-500">Panel Workspace</p>
              <h2 className="text-base font-semibold text-white">
                {panelState.generated_description || panelState.item_description || 'Panel'}
              </h2>
              <p className="text-xs text-brand-400">
                {panelState.page_location} / {panelState.panel_type || '-'}
                {pageTemplate ? ` / ${pageTemplate.name}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full border border-brand-700 bg-brand-900/70 p-1">
                <button
                  type="button"
                  onClick={() => handleModeChange('form')}
                  className={`${MODE_BUTTON_CLASS} ${
                    mode === 'form' ? 'bg-blue-500/30 text-blue-100' : 'text-brand-300 hover:text-white'
                  }`}
                >
                  Form
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('code')}
                  className={`${MODE_BUTTON_CLASS} ${
                    mode === 'code' ? 'bg-blue-500/30 text-blue-100' : 'text-brand-300 hover:text-white'
                  }`}
                >
                  Code
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-brand-700 px-3 py-1.5 text-xs text-brand-300 hover:border-brand-600 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>

          {parseWarning && (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {parseWarning}
            </p>
          )}

          {error && (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          )}

          {loadingTemplate && <p className="mt-2 text-xs text-brand-500">Loading template...</p>}
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'form' ? (
            <FormMode
              values={formValues}
              generatedDescription={generatedDescription}
              pageLocation={panelState.page_location}
              slotName={panelState.panel_type}
              priority={panelState.priority}
              hasTemplate={Boolean(codeTemplate)}
              generatedPreview={generatedPreview}
              templatesHref={templatesHref}
              canEdit={canEdit}
              isGenerating={isGenerating}
              onChange={(field, value) =>
                setFormValues((current) => ({
                  ...current,
                  [field]: value,
                }))
              }
              onGenerate={() => void generateCode()}
            />
          ) : (
            <div className="space-y-4">
              <CodeMode value={editorValue} onChange={setEditorValue} canEdit={canEdit} />
              <CodePreview code={editorValue || generatedPreview || ''} />
            </div>
          )}
        </div>

        <PanelStatusBar
          status={codeStatus}
          canEdit={canEdit}
          copied={copied}
          showMarkLoaded={showMarkLoaded}
          savingDraft={savingDraft}
          markingFinal={markingFinal}
          markingLoaded={markingLoaded}
          onSaveDraft={() => void handleSaveDraft()}
          onMarkFinal={() => void handleMarkFinal()}
          onCopy={() => void handleCopy()}
          onMarkLoaded={() => void handleMarkLoaded()}
        />
      </aside>
    </div>
  )
}
