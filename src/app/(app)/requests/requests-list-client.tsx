'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  type Profile,
  type WorkRequest,
  type RequestType,
  REQUEST_TYPE_LABELS,
} from '@/lib/types/database'
import { StatusBadge } from '@/components/status-badge'
import { PriorityBadge } from '@/components/priority-badge'
import { FilterBar, type Filters } from '@/components/filter-bar'

interface Props {
  profile: Profile
  producers: { id: string; full_name: string }[]
}

export function RequestsListClient({ profile, producers }: Props) {
  const supabase = createClient()
  const canEdit = profile.role === 'admin' || profile.role === 'producer'

  const [requests, setRequests] = useState<
    (WorkRequest & {
      requester: { full_name: string } | null
      assignee: { full_name: string } | null
    })[]
  >([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>({
    status: '',
    type: '',
    priority: '',
    assigned_to: '',
    sort: 'created_at',
  })

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('work_requests')
      .select(
        '*, requester:profiles!requester_id(full_name), assignee:profiles!assigned_to(full_name)'
      )

    if (filters.status) query = query.eq('status', filters.status)
    if (filters.type) query = query.eq('request_type', filters.type)
    if (filters.priority) query = query.eq('priority', filters.priority)
    if (filters.assigned_to === 'unassigned') {
      query = query.is('assigned_to', null)
    } else if (filters.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to)
    }

    query = query.order(filters.sort, {
      ascending: filters.sort === 'due_date',
      nullsFirst: false,
    })

    const { data } = await query
    setRequests((data as typeof requests) ?? [])
    setLoading(false)
  }, [supabase, filters])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {canEdit ? 'All Requests' : 'My Requests'}
          </h1>
          <p className="text-brand-400 mt-1">
            {requests.length} request{requests.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <Link
          href="/requests/new"
          className="px-4 py-2.5 bg-nex-red hover:bg-nex-redDark text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New Request
        </Link>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        producers={producers}
      />

      <div className="bg-brand-900 border border-brand-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-brand-500">
            Loading...
          </div>
        ) : requests.length === 0 ? (
          <div className="px-6 py-12 text-center text-brand-500">
            No requests match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-800 text-brand-400">
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Priority</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Ad Week</th>
                  <th className="text-left px-4 py-3 font-medium">Due</th>
                  <th className="text-left px-4 py-3 font-medium">
                    Assigned To
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-800/50">
                {requests.map((req, index) => (
                  <tr
                    key={req.id}
                    className={`${index % 2 === 0 ? 'bg-brand-900/30' : 'bg-brand-900/10'} hover:bg-brand-800/30 transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/requests/${req.id}`}
                        className="text-white hover:text-brand-300 font-medium transition-colors"
                      >
                        {req.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-brand-400">
                      {REQUEST_TYPE_LABELS[req.request_type as RequestType]}
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={req.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={req.status}
                        requestId={req.id}
                        canEdit={canEdit}
                        currentUserId={profile.id}
                        statusHistory={req.status_history ?? []}
                        onUpdate={fetchRequests}
                      />
                    </td>
                    <td className="px-4 py-3 text-brand-400">
                      {req.ad_week || '—'}
                    </td>
                    <td className="px-4 py-3 text-brand-400">
                      {formatDate(req.due_date)}
                    </td>
                    <td className="px-4 py-3 text-brand-400">
                      {req.assignee?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-brand-400">
                      {formatDate(req.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
