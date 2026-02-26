'use client'

import {
  type RequestStatus,
  type RequestType,
  type Priority,
  STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  PRIORITY_LABELS,
} from '@/lib/types/database'

export interface Filters {
  status: RequestStatus | ''
  type: RequestType | ''
  priority: Priority | ''
  assigned_to: string
  sort: 'due_date' | 'created_at'
}

interface FilterBarProps {
  filters: Filters
  onChange: (filters: Filters) => void
  producers: { id: string; full_name: string }[]
}

export function FilterBar({ filters, onChange, producers }: FilterBarProps) {
  function update(patch: Partial<Filters>) {
    onChange({ ...filters, ...patch })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <select
        value={filters.status}
        onChange={(e) => update({ status: e.target.value as RequestStatus | '' })}
        className="px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-sm text-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">All Statuses</option>
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <select
        value={filters.type}
        onChange={(e) => update({ type: e.target.value as RequestType | '' })}
        className="px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-sm text-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">All Types</option>
        {Object.entries(REQUEST_TYPE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <select
        value={filters.priority}
        onChange={(e) => update({ priority: e.target.value as Priority | '' })}
        className="px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-sm text-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">All Priorities</option>
        {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <select
        value={filters.assigned_to}
        onChange={(e) => update({ assigned_to: e.target.value })}
        className="px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-sm text-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">All Assignees</option>
        <option value="unassigned">Unassigned</option>
        {producers.map((p) => (
          <option key={p.id} value={p.id}>{p.full_name}</option>
        ))}
      </select>

      <select
        value={filters.sort}
        onChange={(e) => update({ sort: e.target.value as 'due_date' | 'created_at' })}
        className="px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-sm text-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="created_at">Sort: Created Date</option>
        <option value="due_date">Sort: Due Date</option>
      </select>
    </div>
  )
}
