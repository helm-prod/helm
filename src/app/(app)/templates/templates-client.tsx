'use client'

import { useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { createClient } from '@/lib/supabase/client'
import { mergeTemplateHtml } from '@/lib/codegen'
import type { Panel } from '@/lib/types/database'

interface PageSlot {
  name: string
  label?: string
}

interface PageTemplateRow {
  id: string
  name: string
  url: string | null
  page_type: string
  slots: PageSlot[]
  created_at: string
  updated_at: string
}

interface CodeTemplateRow {
  id: string
  page_template_id: string
  slot_name: string
  html_template: string
  variable_map: Record<string, string>
  version: number
  updated_by: string | null
  created_at: string
  updated_at: string
}

const PAGE_TYPES = ['homepage_hot', 'homepage_cold', 'l1', 'l2', 'brand', 'static'] as const

const VARIABLE_PALETTE: Array<{ placeholder: string; field: string }> = [
  { placeholder: '{{generated_description}}', field: 'generated_description' },
  { placeholder: '{{image_src}}', field: 'image_reference' },
  { placeholder: '{{link_href}}', field: 'link_url' },
  { placeholder: '{{alt_text}}', field: 'generated_description' },
  { placeholder: '{{exclusions}}', field: 'exclusions' },
  { placeholder: '{{prefix}}', field: 'prefix' },
  { placeholder: '{{value}}', field: 'value' },
  { placeholder: '{{suffix}}', field: 'suffix' },
  { placeholder: '{{item}}', field: 'item_description' },
]

const SAMPLE_PANEL: Partial<Panel> = {
  generated_description: 'Take An Additional 20% Off Our Everyday NEX Price Classic Home Memory Foam Pillows',
  image_reference: 'WK4_BEDDING_A_001.jpg',
  link_url: '/c/everyday-home/bedding',
  exclusions: '*Price as marked online.',
  prefix: 'Take An Additional',
  value: '20',
  dollar_or_percent: '%',
  suffix: 'Off Our Everyday NEX Price',
  item_description: 'Classic Home Memory Foam Pillows',
}

function normalizeSlots(raw: unknown): PageSlot[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((slot) => {
      if (!slot || typeof slot !== 'object') return null
      const slotObj = slot as Record<string, unknown>
      const name = String(slotObj.name || '').trim()
      const label = String(slotObj.label || '').trim()
      if (!name) return null
      return { name, label: label || undefined }
    })
    .filter(Boolean) as PageSlot[]
}

function normalizeVariableMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const map: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue
    map[key] = String(value || '').trim()
  }
  return map
}

function parseSlotsInput(value: string): PageSlot[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [nameRaw, labelRaw] = part.split(':')
      const name = (nameRaw || '').trim()
      const label = (labelRaw || name).trim()
      return { name, label }
    })
}

function slotsToInput(slots: PageSlot[]): string {
  return slots.map((slot) => `${slot.name}:${slot.label || slot.name}`).join(', ')
}

function firstLines(html: string): string {
  return html
    .split('\n')
    .slice(0, 3)
    .join('\n')
    .trim()
}

function inferVariableMap(html: string, fallback?: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = { ...(fallback ?? {}) }

  for (const variable of VARIABLE_PALETTE) {
    if (html.includes(variable.placeholder)) {
      merged[variable.placeholder] = variable.field
    }
  }

  return merged
}

export function TemplatesClient({
  pageTemplates,
  codeTemplates,
}: {
  pageTemplates: Array<Record<string, unknown>>
  codeTemplates: Array<Record<string, unknown>>
}) {
  const supabase = createClient()

  const [pages, setPages] = useState<PageTemplateRow[]>(
    pageTemplates.map((row) => ({
      id: String(row.id),
      name: String(row.name || ''),
      url: row.url ? String(row.url) : null,
      page_type: String(row.page_type || 'l2'),
      slots: normalizeSlots(row.slots),
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || ''),
    }))
  )

  const [templates, setTemplates] = useState<CodeTemplateRow[]>(
    codeTemplates.map((row) => ({
      id: String(row.id),
      page_template_id: String(row.page_template_id),
      slot_name: String(row.slot_name || ''),
      html_template: String(row.html_template || ''),
      variable_map: normalizeVariableMap(row.variable_map),
      version: Number(row.version || 1),
      updated_by: row.updated_by ? String(row.updated_by) : null,
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || ''),
    }))
  )

  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [savingPage, setSavingPage] = useState(false)

  const [pageDraft, setPageDraft] = useState({
    name: '',
    url: '',
    page_type: 'l2',
    slotsText: '',
  })

  const [templateModal, setTemplateModal] = useState<{
    pageTemplate: PageTemplateRow
    slotName: string
    existing: CodeTemplateRow | null
  } | null>(null)

  const templatesByPageAndSlot = useMemo(() => {
    const map = new Map<string, CodeTemplateRow>()
    for (const template of templates) {
      map.set(`${template.page_template_id}::${template.slot_name.toLowerCase()}`, template)
    }
    return map
  }, [templates])

  function resetDraft(page?: PageTemplateRow) {
    if (page) {
      setPageDraft({
        name: page.name,
        url: page.url || '',
        page_type: page.page_type,
        slotsText: slotsToInput(page.slots),
      })
      return
    }

    setPageDraft({
      name: '',
      url: '',
      page_type: 'l2',
      slotsText: '',
    })
  }

  async function savePageTemplate(existingId?: string) {
    const slots = parseSlotsInput(pageDraft.slotsText)
    if (!pageDraft.name.trim()) {
      setFormError('Name is required.')
      return
    }

    if (slots.length === 0) {
      setFormError('At least one slot is required. Example: A:Hero, C:Half-width')
      return
    }

    setFormError(null)
    setSavingPage(true)

    if (existingId) {
      const { data, error } = await supabase
        .from('page_templates')
        .update({
          name: pageDraft.name.trim(),
          url: pageDraft.url.trim() || null,
          page_type: pageDraft.page_type,
          slots,
        })
        .eq('id', existingId)
        .select('*')
        .single()

      if (error || !data) {
        setFormError(error?.message || 'Failed to update page template.')
        setSavingPage(false)
        return
      }

      const normalized: PageTemplateRow = {
        id: String(data.id),
        name: String(data.name),
        url: data.url ? String(data.url) : null,
        page_type: String(data.page_type),
        slots: normalizeSlots(data.slots),
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
      }

      setPages((current) => current.map((page) => (page.id === existingId ? normalized : page)))
      setEditingPageId(null)
      resetDraft()
      setSavingPage(false)
      return
    }

    const { data, error } = await supabase
      .from('page_templates')
      .insert({
        name: pageDraft.name.trim(),
        url: pageDraft.url.trim() || null,
        page_type: pageDraft.page_type,
        slots,
      })
      .select('*')
      .single()

    if (error || !data) {
      setFormError(error?.message || 'Failed to create page template.')
      setSavingPage(false)
      return
    }

    const normalized: PageTemplateRow = {
      id: String(data.id),
      name: String(data.name),
      url: data.url ? String(data.url) : null,
      page_type: String(data.page_type),
      slots: normalizeSlots(data.slots),
      created_at: String(data.created_at),
      updated_at: String(data.updated_at),
    }

    setPages((current) => [normalized, ...current].sort((a, b) => a.name.localeCompare(b.name)))
    resetDraft()
    setSavingPage(false)
  }

  async function deletePageTemplate(page: PageTemplateRow) {
    const confirmed = window.confirm(`Delete page template \"${page.name}\"? This also deletes slot code templates.`)
    if (!confirmed) return

    const { error } = await supabase.from('page_templates').delete().eq('id', page.id)
    if (error) {
      setFormError(error.message)
      return
    }

    setPages((current) => current.filter((item) => item.id !== page.id))
    setTemplates((current) => current.filter((template) => template.page_template_id !== page.id))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <h1 className="text-2xl font-bold text-white">Templates</h1>
        <p className="mt-1 text-brand-400">Manage page templates and slot-level HTML templates for code generation.</p>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-5">
          <input
            value={pageDraft.name}
            onChange={(event) => setPageDraft((current) => ({ ...current, name: event.target.value }))}
            className="rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white"
            placeholder="Page name"
          />
          <input
            value={pageDraft.url}
            onChange={(event) => setPageDraft((current) => ({ ...current, url: event.target.value }))}
            className="rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white"
            placeholder="https://www.mynavyexchange.com/..."
          />
          <select
            value={pageDraft.page_type}
            onChange={(event) => setPageDraft((current) => ({ ...current, page_type: event.target.value }))}
            className="rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white"
          >
            {PAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            value={pageDraft.slotsText}
            onChange={(event) => setPageDraft((current) => ({ ...current, slotsText: event.target.value }))}
            className="rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white lg:col-span-2"
            placeholder="A:Hero, B:Nav, C:Half-width"
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void savePageTemplate(editingPageId || undefined)}
            disabled={savingPage}
            className="rounded-full bg-nex-red px-4 py-2 text-sm font-medium text-white hover:bg-nex-redDark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPage ? 'Saving...' : editingPageId ? 'Save Page Template' : 'Add Page Template'}
          </button>
          {editingPageId && (
            <button
              onClick={() => {
                setEditingPageId(null)
                resetDraft()
              }}
              className="rounded-full border border-brand-700 px-4 py-2 text-sm text-brand-300 hover:border-brand-600 hover:text-white"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {formError && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</p>
        )}
      </section>

      <section className="space-y-4">
        {pages.map((page) => (
          <article key={page.id} className="rounded-2xl border border-brand-800 bg-brand-900">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-800 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-white">{page.name}</h2>
                <p className="mt-1 text-xs text-brand-400">
                  {page.page_type} / {page.slots.length} slot{page.slots.length === 1 ? '' : 's'}
                </p>
                {page.url && (
                  <a href={page.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-blue-300 underline-offset-2 hover:underline">
                    {page.url}
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingPageId(page.id)
                    resetDraft(page)
                  }}
                  className="rounded-full border border-brand-700 px-3 py-1.5 text-xs text-brand-200 hover:border-brand-600 hover:text-white"
                >
                  Edit Page
                </button>
                <button
                  onClick={() => void deletePageTemplate(page)}
                  className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="space-y-3 p-5">
              {page.slots.map((slot) => {
                const template = templatesByPageAndSlot.get(`${page.id}::${slot.name.toLowerCase()}`) || null

                return (
                  <div key={slot.name} className="rounded-xl border border-brand-800 bg-brand-900/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          {slot.name}
                          {slot.label ? ` / ${slot.label}` : ''}
                        </h3>
                        {template ? (
                          <div className="mt-2 space-y-2">
                            <pre className="max-h-20 overflow-auto rounded-lg border border-brand-800 bg-brand-950 p-2 text-xs text-brand-300">
                              <code>{firstLines(template.html_template) || '(empty template)'}</code>
                            </pre>
                            <p className="text-xs text-brand-500">
                              Version {template.version} / Updated {new Date(template.updated_at).toLocaleString('en-US')}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-brand-500">No code template yet.</p>
                        )}
                      </div>

                      <button
                        onClick={() =>
                          setTemplateModal({
                            pageTemplate: page,
                            slotName: slot.name,
                            existing: template,
                          })
                        }
                        className="rounded-full border border-brand-700 px-3 py-1.5 text-xs text-brand-200 hover:border-brand-600 hover:text-white"
                      >
                        {template ? 'Edit Template' : 'Create Template'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </section>

      {templateModal && (
        <TemplateEditorModal
          pageTemplate={templateModal.pageTemplate}
          slotName={templateModal.slotName}
          existing={templateModal.existing}
          onClose={() => setTemplateModal(null)}
          onSaved={(saved) => {
            setTemplates((current) => {
              const existingIndex = current.findIndex((item) => item.id === saved.id)
              if (existingIndex >= 0) {
                const next = [...current]
                next[existingIndex] = saved
                return next
              }
              return [saved, ...current]
            })
            setTemplateModal(null)
          }}
        />
      )}
    </div>
  )
}

function TemplateEditorModal({
  pageTemplate,
  slotName,
  existing,
  onClose,
  onSaved,
}: {
  pageTemplate: PageTemplateRow
  slotName: string
  existing: CodeTemplateRow | null
  onClose: () => void
  onSaved: (template: CodeTemplateRow) => void
}) {
  const supabase = createClient()

  const editorRef = useRef<any>(null)

  const [html, setHtml] = useState(existing?.html_template || '')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function saveTemplate() {
    setSaving(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const variableMap = inferVariableMap(html, existing?.variable_map)

    if (existing) {
      const { data, error: updateError } = await supabase
        .from('code_templates')
        .update({
          html_template: html,
          variable_map: variableMap,
          version: existing.version + 1,
          updated_by: user?.id || null,
        })
        .eq('id', existing.id)
        .select('*')
        .single()

      if (updateError || !data) {
        setError(updateError?.message || 'Failed to save template.')
        setSaving(false)
        return
      }

      onSaved({
        id: String(data.id),
        page_template_id: String(data.page_template_id),
        slot_name: String(data.slot_name),
        html_template: String(data.html_template || ''),
        variable_map: normalizeVariableMap(data.variable_map),
        version: Number(data.version || 1),
        updated_by: data.updated_by ? String(data.updated_by) : null,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
      })
      setSaving(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('code_templates')
      .insert({
        page_template_id: pageTemplate.id,
        slot_name: slotName,
        html_template: html,
        variable_map: variableMap,
        version: 1,
        updated_by: user?.id || null,
      })
      .select('*')
      .single()

    if (insertError || !data) {
      setError(insertError?.message || 'Failed to create template.')
      setSaving(false)
      return
    }

    onSaved({
      id: String(data.id),
      page_template_id: String(data.page_template_id),
      slot_name: String(data.slot_name),
      html_template: String(data.html_template || ''),
      variable_map: normalizeVariableMap(data.variable_map),
      version: Number(data.version || 1),
      updated_by: data.updated_by ? String(data.updated_by) : null,
      created_at: String(data.created_at),
      updated_at: String(data.updated_at),
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[90vh] w-full max-w-7xl flex-col rounded-2xl border border-brand-800 bg-brand-900">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {pageTemplate.name} / {slotName}
            </h2>
            <p className="text-xs text-brand-400">
              {existing ? `Editing version ${existing.version}` : 'Create slot template'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-brand-700 px-3 py-1.5 text-xs text-brand-300 hover:border-brand-600 hover:text-white"
          >
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-h-0 border-b border-brand-800 lg:border-b-0 lg:border-r">
            <Editor
              height="100%"
              defaultLanguage="html"
              theme="vs-dark"
              value={html}
              onChange={(value) => setHtml(value || '')}
              onMount={(editor) => {
                editorRef.current = editor
              }}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                automaticLayout: true,
                fontSize: 13,
                tabSize: 2,
              }}
            />
          </div>

          <aside className="space-y-4 overflow-y-auto p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Variables</h3>
              <p className="mt-1 text-xs text-brand-500">Click to insert at cursor.</p>
              <div className="mt-2 space-y-2">
                {VARIABLE_PALETTE.map((variable) => (
                  <button
                    key={variable.placeholder}
                    onClick={() => {
                      if (!editorRef.current) {
                        setHtml((current) => `${current}${variable.placeholder}`)
                        return
                      }

                      const selection = editorRef.current.getSelection()
                      editorRef.current.executeEdits('insert-variable', [
                        {
                          range: selection,
                          text: variable.placeholder,
                          forceMoveMarkers: true,
                        },
                      ])
                      setHtml(editorRef.current.getValue())
                    }}
                    className="w-full rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 text-left text-xs text-brand-200 hover:border-brand-600 hover:text-white"
                  >
                    {variable.placeholder}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  const variableMap = inferVariableMap(html, existing?.variable_map)
                  setPreview(
                    mergeTemplateHtml({
                      htmlTemplate: html,
                      variableMap,
                      panel: SAMPLE_PANEL,
                    })
                  )
                }}
                className="w-full rounded-full border border-blue-500/40 bg-blue-500/15 px-3 py-2 text-xs font-medium text-blue-100 hover:bg-blue-500/25"
              >
                Preview with Sample Data
              </button>

              <button
                onClick={() => void saveTemplate()}
                disabled={saving}
                className="w-full rounded-full bg-nex-red px-3 py-2 text-xs font-medium text-white hover:bg-nex-redDark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>

            {preview && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-400">Preview</h4>
                <div className="overflow-hidden rounded-lg border border-brand-800 bg-white">
                  <iframe className="h-40 w-full" title="Template Preview" srcDoc={preview} sandbox="allow-same-origin" />
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
