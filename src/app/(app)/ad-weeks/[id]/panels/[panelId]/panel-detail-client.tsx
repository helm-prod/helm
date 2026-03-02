'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  computeGeneratedDescription,
  LINK_INTENTS,
  type AdWeekEvent,
  type Panel,
  type PanelCategory,
  PANEL_CATEGORIES,
  PANEL_PREFIXES,
  PANEL_SUFFIXES,
  PANEL_TYPES,
  type Profile,
} from '@/lib/types/database'
import { PanelStatusBadge } from '@/components/panel-status-badge'

interface Props {
  profile: Profile
  panel: Panel & {
    assignee: { id: string; full_name: string; email: string } | null
    requester: { id: string; full_name: string; email: string } | null
    event: AdWeekEvent | null
    ad_week: { id: string; label: string | null; week_number: number; year: number } | null
  }
  producers: { id: string; full_name: string; email: string }[]
  events: AdWeekEvent[]
  adWeekId: string
  conflicts: unknown[]
}

const PAGE_LOCATION_SUGGESTIONS: Partial<Record<PanelCategory, string[]>> = {
  Homepage: ['Homepage L1', 'Homepage L2', 'Homepage Hero', 'Homepage Spotlight'],
  Electronics: ['Electronics L1', 'Electronics L2', 'Watches L2', 'Audio L2'],
  Apparel: ['Apparel L1', 'Apparel L2', 'Apparel Spotlight'],
  Shoes: ['Shoes L1', 'Shoes L2'],
  'Outdoor Home': ['Outdoor Home L1', 'Patio L2'],
  'Everyday Home': ['Everyday Home L1', 'Kitchen L2', 'Bedding L2'],
  Beauty: ['Beauty L1', 'Beauty L2'],
  Toys: ['Toys L1', 'Toys L2'],
}

export function PanelDetailClient({
  profile,
  panel: initial,
  producers,
  events,
  adWeekId,
  conflicts,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const isAdmin = profile.role === 'admin'
  const isAssigned = initial.assigned_to === profile.id
  const canEdit =
    isAdmin ||
    ((profile.role === 'producer' || profile.role === 'senior_web_producer') && isAssigned)

  const [panel, setPanel] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState(panel.category)
  const [pageLocation, setPageLocation] = useState(panel.page_location)
  const [priority, setPriority] = useState(panel.priority?.toString() ?? '')
  const [panelType, setPanelType] = useState(panel.panel_type ?? '')
  const [eventId, setEventId] = useState(panel.event_id ?? '')

  const [prefix, setPrefix] = useState(panel.prefix ?? '')
  const [value, setValue] = useState(panel.value ?? '')
  const [dollarOrPercent, setDollarOrPercent] = useState(panel.dollar_or_percent ?? '')
  const [suffix, setSuffix] = useState(panel.suffix ?? '')
  const [itemDescription, setItemDescription] = useState(panel.item_description ?? '')
  const [exclusions, setExclusions] = useState(panel.exclusions ?? '')

  const [imageReference, setImageReference] = useState(panel.image_reference ?? '')
  const [linkIntent, setLinkIntent] = useState(panel.link_intent ?? '')
  const [linkUrl, setLinkUrl] = useState(panel.link_url ?? '')
  const [direction, setDirection] = useState(panel.direction ?? '')

  const [specialDates, setSpecialDates] = useState(panel.special_dates ?? '')
  const [brandCategoryTracking, setBrandCategoryTracking] = useState(panel.brand_category_tracking ?? '')
  const [designNeeded, setDesignNeeded] = useState(panel.design_needed)
  const [isCarryover, setIsCarryover] = useState(panel.is_carryover)
  const [isPickup, setIsPickup] = useState(panel.is_pickup)
  const [pickupReference, setPickupReference] = useState(panel.pickup_reference ?? '')
  const [assignedTo, setAssignedTo] = useState(panel.assigned_to ?? '')
  const [notes, setNotes] = useState(panel.notes ?? '')

  const [showAssets, setShowAssets] = useState(true)
  const [showMetadata, setShowMetadata] = useState(true)

  const generatedDesc = computeGeneratedDescription({
    prefix: prefix || null,
    value: value || null,
    dollar_or_percent: dollarOrPercent || null,
    suffix: suffix || null,
    item_description: itemDescription || null,
  })

  const inputClass =
    'w-full rounded-xl border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white placeholder-brand-500 focus:border-brand-500 focus:outline-none'

  const weekLabel = panel.ad_week?.label || `WK ${panel.ad_week?.week_number ?? '-'}`
  const suggestedLocations = PAGE_LOCATION_SUGGESTIONS[category] ?? []

  async function handleSave() {
    setSaving(true)
    setError(null)

    const { data: updated, error: updateError } = await supabase
      .from('panels')
      .update({
        category,
        page_location: pageLocation,
        priority: priority ? Number.parseInt(priority, 10) : null,
        panel_type: panelType || null,
        event_id: eventId || null,
        prefix: prefix || null,
        value: value || null,
        dollar_or_percent: dollarOrPercent || null,
        suffix: suffix || null,
        item_description: itemDescription || null,
        exclusions: exclusions || null,
        generated_description: generatedDesc || null,
        image_reference: imageReference || null,
        link_intent: linkIntent || null,
        link_url: linkUrl || null,
        direction: direction || null,
        special_dates: specialDates || null,
        brand_category_tracking: brandCategoryTracking || null,
        design_needed: designNeeded,
        is_carryover: isCarryover,
        is_pickup: isPickup,
        pickup_reference: pickupReference || null,
        assigned_to: isAdmin ? assignedTo || null : panel.assigned_to,
        notes: notes || null,
      })
      .eq('id', panel.id)
      .select('*, assignee:profiles!assigned_to(id, full_name, email), event:ad_week_events!event_id(*)')
      .single()

    if (updateError || !updated) {
      setError(updateError?.message || 'Failed to save panel')
      setSaving(false)
      return
    }

    setPanel((current) => ({ ...current, ...updated }))
    setEditing(false)
    setSaving(false)
    router.refresh()
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <Link href={`/ad-weeks/${adWeekId}`} className="text-sm text-brand-500 hover:text-brand-300">
          &larr; Back to {weekLabel}
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {panel.generated_description || panel.item_description || 'Panel Detail'}
            </h1>
            <p className="mt-1 text-brand-400">
              {panel.category} / {panel.page_location}
              {panel.panel_type ? ` / ${panel.panel_type}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <PanelStatusBadge status={panel.status} panelId={panel.id} canEdit={canEdit} onUpdate={() => router.refresh()} />
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="rounded-full border border-brand-700 px-4 py-2 text-sm text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
              >
                Edit Panel
              </button>
            )}
            {editing && (
              <>
                <button onClick={() => setEditing(false)} className="text-sm text-brand-400 hover:text-white">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-gold-400 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>

        {error && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
      </div>

      {editing ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-brand-800 bg-brand-900 p-4">
            <h3 className="text-sm font-semibold text-white">1. Placement</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value as PanelCategory)} className={inputClass}>
                  {PANEL_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Page Location</label>
                <input
                  value={pageLocation}
                  onChange={(e) => setPageLocation(e.target.value)}
                  className={inputClass}
                  list="edit-panel-page-location-suggestions"
                />
                {suggestedLocations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedLocations.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setPageLocation(suggestion)}
                        className="rounded-full border border-brand-700 px-2 py-0.5 text-xs text-brand-300 hover:border-brand-600 hover:text-white"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                <datalist id="edit-panel-page-location-suggestions">
                  {suggestedLocations.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Priority</label>
                <input type="number" min={1} value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass} />
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Panel Type</label>
                <select value={panelType} onChange={(e) => setPanelType(e.target.value)} className={inputClass}>
                  <option value="">Select</option>
                  {PANEL_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Event</label>
                <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.event_code}
                      {event.event_name ? ` - ${event.event_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Assigned Producer</label>
                {isAdmin ? (
                  <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass}>
                    <option value="">Unassigned</option>
                    {producers.map((producer) => (
                      <option key={producer.id} value={producer.id}>
                        {producer.full_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-brand-800 bg-brand-900/60 px-3 py-2 text-sm text-brand-300">
                    {panel.assignee?.full_name || 'Unassigned'}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-brand-800 bg-brand-900 p-4">
            <h3 className="text-sm font-semibold text-white">2. Content</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Prefix</label>
                <select value={prefix} onChange={(e) => setPrefix(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {PANEL_PREFIXES.map((value) => (
                    <option key={value} value={value}>
                      {value.trim()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Value</label>
                <input value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">$/%</label>
                <select value={dollarOrPercent} onChange={(e) => setDollarOrPercent(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  <option value="$">$</option>
                  <option value="%">%</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Suffix</label>
                <select value={suffix} onChange={(e) => setSuffix(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {PANEL_SUFFIXES.map((value) => (
                    <option key={value} value={value}>
                      {value.trim()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Item Description</label>
                <input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Exclusions</label>
                <input value={exclusions} onChange={(e) => setExclusions(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-brand-800 bg-brand-900/60 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-brand-500">Generated Description Preview</p>
              <p className="mt-1 text-sm text-white">{generatedDesc || 'Description will appear here as you type.'}</p>
            </div>
          </section>

          <section className="rounded-xl border border-brand-800 bg-brand-900 p-4">
            <button type="button" onClick={() => setShowAssets((current) => !current)} className="flex w-full items-center justify-between">
              <h3 className="text-sm font-semibold text-white">3. Assets</h3>
              <span className="text-brand-500">{showAssets ? '-' : '+'}</span>
            </button>

            {showAssets && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Image Reference</label>
                  <input value={imageReference} onChange={(e) => setImageReference(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Link Intent</label>
                  <select value={linkIntent} onChange={(e) => setLinkIntent(e.target.value)} className={inputClass}>
                    <option value="">Select</option>
                    {LINK_INTENTS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Link URL</label>
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Direction</label>
                  <input value={direction} onChange={(e) => setDirection(e.target.value)} className={inputClass} />
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-brand-800 bg-brand-900 p-4">
            <button type="button" onClick={() => setShowMetadata((current) => !current)} className="flex w-full items-center justify-between">
              <h3 className="text-sm font-semibold text-white">4. Metadata</h3>
              <span className="text-brand-500">{showMetadata ? '-' : '+'}</span>
            </button>

            {showMetadata && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Special Dates</label>
                    <input value={specialDates} onChange={(e) => setSpecialDates(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Brand/Category Tracking</label>
                    <input value={brandCategoryTracking} onChange={(e) => setBrandCategoryTracking(e.target.value)} className={inputClass} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-brand-300">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={designNeeded} onChange={(e) => setDesignNeeded(e.target.checked)} className="rounded border-brand-700 bg-brand-900" />
                    Design Needed
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={isCarryover} onChange={(e) => setIsCarryover(e.target.checked)} className="rounded border-brand-700 bg-brand-900" />
                    Is Carryover
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={isPickup} onChange={(e) => setIsPickup(e.target.checked)} className="rounded border-brand-700 bg-brand-900" />
                    Is Pickup
                  </label>
                </div>

                {isPickup && (
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Pickup Reference</label>
                    <input value={pickupReference} onChange={(e) => setPickupReference(e.target.value)} className={inputClass} />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-brand-800 bg-brand-900 p-4">
              <h3 className="text-sm font-semibold text-white">Placement</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-brand-300 sm:grid-cols-2">
                <DataRow label="Category" value={panel.category} />
                <DataRow label="Page Location" value={panel.page_location} />
                <DataRow label="Priority" value={panel.priority?.toString() || '-'} />
                <DataRow label="Panel Type" value={panel.panel_type || '-'} />
                <DataRow label="Event" value={panel.event ? `${panel.event.event_code}${panel.event.event_name ? ` - ${panel.event.event_name}` : ''}` : 'None'} />
                <DataRow label="Assigned Producer" value={panel.assignee?.full_name || 'Unassigned'} />
              </div>
            </div>

            <div className="rounded-xl border border-brand-800 bg-brand-900 p-4">
              <h3 className="text-sm font-semibold text-white">Content</h3>
              <div className="mt-3 rounded-xl border border-brand-800 bg-brand-900/60 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-brand-500">Generated Description</p>
                <p className="mt-1 text-sm text-white">{panel.generated_description || '-'}</p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-brand-300 sm:grid-cols-2">
                <DataRow label="Prefix" value={panel.prefix || '-'} />
                <DataRow label="Value" value={panel.value ? `${panel.dollar_or_percent === '$' ? '$' : ''}${panel.value}${panel.dollar_or_percent === '%' ? '%' : ''}` : '-'} />
                <DataRow label="Suffix" value={panel.suffix || '-'} />
                <DataRow label="Item Description" value={panel.item_description || '-'} />
                <DataRow label="Exclusions" value={panel.exclusions || '-'} />
              </div>
            </div>

            <div className="rounded-xl border border-brand-800 bg-brand-900 p-4">
              <h3 className="text-sm font-semibold text-white">Assets & Metadata</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-brand-300 sm:grid-cols-2">
                <DataRow label="Image Reference" value={panel.image_reference || '-'} />
                <DataRow label="Direction" value={panel.direction || '-'} />
                <DataRow label="Link Intent" value={panel.link_intent || '-'} />
                <DataRow label="Link URL" value={panel.link_url || '-'} />
                <DataRow label="Special Dates" value={panel.special_dates || '-'} />
                <DataRow label="Brand/Category Tracking" value={panel.brand_category_tracking || '-'} />
                <DataRow label="Design Needed" value={panel.design_needed ? 'Yes' : 'No'} />
                <DataRow label="Carryover" value={panel.is_carryover ? 'Yes' : 'No'} />
                <DataRow label="Pickup" value={panel.is_pickup ? 'Yes' : 'No'} />
                <DataRow label="Pickup Reference" value={panel.pickup_reference || '-'} />
              </div>
              <div className="mt-3">
                <p className="text-xs uppercase tracking-wide text-brand-500">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-brand-300">{panel.notes || 'No notes.'}</p>
              </div>
            </div>

            {panel.source !== 'manual' && (
              <div className="rounded-xl border border-brand-800 bg-brand-900 p-4 text-sm text-brand-300">
                Source: <span className="capitalize text-white">{panel.source}</span>
                {conflicts.length > 0 && (
                  <p className="mt-2 text-amber-300">
                    This panel had {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} during upload.
                  </p>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-brand-800 bg-brand-900 p-4 text-sm text-brand-300">
              <p className="text-xs uppercase tracking-wide text-brand-500">Created</p>
              <p className="mt-1">{formatDateTime(panel.created_at)}</p>
            </div>
            <div className="rounded-xl border border-brand-800 bg-brand-900 p-4 text-sm text-brand-300">
              <p className="text-xs uppercase tracking-wide text-brand-500">Last Updated</p>
              <p className="mt-1">{formatDateTime(panel.updated_at)}</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-brand-500">{label}</p>
      <p className="mt-0.5 text-sm text-brand-200">{value}</p>
    </div>
  )
}
