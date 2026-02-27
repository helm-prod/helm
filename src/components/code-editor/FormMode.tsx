'use client'

import Link from 'next/link'
import { LINK_INTENTS, PANEL_EXCLUSIONS, PANEL_PREFIXES, PANEL_SUFFIXES } from '@/lib/types/database'

interface FormValues {
  prefix: string
  value: string
  dollar_or_percent: '$' | '%' | ''
  suffix: string
  item_description: string
  exclusions: string
  image_reference: string
  link_intent: string
  link_url: string
}

export function FormMode({
  values,
  generatedDescription,
  pageLocation,
  slotName,
  priority,
  hasTemplate,
  generatedPreview,
  templatesHref,
  canEdit,
  onChange,
  onGenerate,
  isGenerating,
}: {
  values: FormValues
  generatedDescription: string
  pageLocation: string
  slotName: string | null
  priority: number | null
  hasTemplate: boolean
  generatedPreview: string
  templatesHref: string
  canEdit: boolean
  onChange: (field: keyof FormValues, value: string) => void
  onGenerate: () => void
  isGenerating: boolean
}) {
  const inputClass =
    'w-full rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white placeholder-brand-500 focus:border-brand-500 focus:outline-none'

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-brand-800 bg-brand-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">Offer Builder</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Prefix</label>
            <select
              value={values.prefix}
              onChange={(e) => onChange('prefix', e.target.value)}
              className={inputClass}
              disabled={!canEdit}
            >
              <option value="">None</option>
              {PANEL_PREFIXES.map((value) => (
                <option key={value} value={value.trim()}>
                  {value.trim()}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Value</label>
              <input
                value={values.value}
                onChange={(e) => onChange('value', e.target.value)}
                className={inputClass}
                inputMode="decimal"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">$/%</label>
              <div className="inline-flex overflow-hidden rounded-lg border border-brand-700">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onChange('dollar_or_percent', '$')}
                  className={`px-3 py-2 text-sm ${
                    values.dollar_or_percent === '$' ? 'bg-blue-500/30 text-white' : 'bg-brand-900 text-brand-300'
                  }`}
                >
                  $
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onChange('dollar_or_percent', '%')}
                  className={`px-3 py-2 text-sm ${
                    values.dollar_or_percent === '%' ? 'bg-blue-500/30 text-white' : 'bg-brand-900 text-brand-300'
                  }`}
                >
                  %
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Suffix</label>
            <select
              value={values.suffix}
              onChange={(e) => onChange('suffix', e.target.value)}
              className={inputClass}
              disabled={!canEdit}
            >
              <option value="">None</option>
              {PANEL_SUFFIXES.map((value) => (
                <option key={value} value={value.trim()}>
                  {value.trim()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Item</label>
            <input
              value={values.item_description}
              onChange={(e) => onChange('item_description', e.target.value)}
              className={inputClass}
              disabled={!canEdit}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Exclusions</label>
            <select
              value={values.exclusions}
              onChange={(e) => onChange('exclusions', e.target.value)}
              className={inputClass}
              disabled={!canEdit}
            >
              <option value="">None</option>
              {PANEL_EXCLUSIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-brand-800 bg-brand-900 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-brand-500">Generated Description</p>
          <p className="mt-1 text-sm text-white">{generatedDescription || 'Offer description preview appears here.'}</p>
        </div>
      </section>

      <section className="rounded-xl border border-brand-800 bg-brand-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">Panel Details</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <ReadOnlyField label="Page Location" value={pageLocation} />
          <ReadOnlyField label="Panel Name / Slot" value={slotName || '-'} />
          <ReadOnlyField label="Priority" value={priority?.toString() || '-'} />
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Image Reference</label>
            <input
              value={values.image_reference}
              onChange={(e) => onChange('image_reference', e.target.value)}
              className={inputClass}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Link Intent</label>
            <select
              value={values.link_intent}
              onChange={(e) => onChange('link_intent', e.target.value)}
              className={inputClass}
              disabled={!canEdit}
            >
              <option value="">None</option>
              {LINK_INTENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Link URL</label>
            <input
              value={values.link_url}
              onChange={(e) => onChange('link_url', e.target.value)}
              className={inputClass}
              placeholder="/c/beauty"
              disabled={!canEdit}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-brand-800 bg-brand-900/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">Code Output</h3>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canEdit || isGenerating}
            className="rounded-full bg-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-100 transition-colors hover:bg-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? 'Generating...' : 'Generate Code'}
          </button>
        </div>

        {!hasTemplate && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            No template for this page/slot. Set one up in{' '}
            <Link href={templatesHref} className="underline underline-offset-2">
              Templates
            </Link>
            .
          </p>
        )}

        <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-brand-800 bg-brand-950 p-3 text-xs text-brand-200">
          <code>{generatedPreview || 'No generated code yet.'}</code>
        </pre>
      </section>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-brand-500">{label}</p>
      <div className="rounded-lg border border-brand-800 bg-brand-900 px-3 py-2 text-sm text-brand-200">{value}</div>
    </div>
  )
}
