'use client'

import { useState } from 'react'
import type { ReportRecipient } from '@/lib/site-quality/report-recipients'

const AOR_OPTIONS = ['Megan', 'Maddie', 'Daryl'] as const

export function ReportRecipientsManager({ initialRecipients }: { initialRecipients: ReportRecipient[] }) {
  const [recipients, setRecipients] = useState(initialRecipients)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reportType, setReportType] = useState<'full' | 'aor'>('full')
  const [aorOwner, setAorOwner] = useState<(typeof AOR_OPTIONS)[number]>('Megan')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function refreshRecipients() {
    const response = await fetch('/api/site-quality/report-recipients')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Failed to load recipients')
    setRecipients(data.recipients ?? [])
  }

  async function handleAdd() {
    if (!name.trim() || !email.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/site-quality/report-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          report_type: reportType,
          aor_owner: reportType === 'aor' ? aorOwner : null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to add recipient')
      setName('')
      setEmail('')
      await refreshRecipients()
      setMessage('Recipient added')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add recipient')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(id: string) {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/site-quality/report-recipients?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to remove recipient')
      await refreshRecipients()
      setMessage('Recipient removed')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to remove recipient')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-[24px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Report recipients</h3>
          <p className="mt-1 text-sm text-blue-100/65">Manage delivery lists for full-team and AOR-only summaries.</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {recipients.map((recipient) => (
          <div key={recipient.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div>
              <div className="text-sm font-medium text-white">{recipient.name}</div>
              <div className="text-sm text-blue-100/65">{recipient.email}</div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-blue-300/15 px-2.5 py-1 text-blue-200">{recipient.report_type}</span>
              {recipient.aor_owner && <span className="rounded-full bg-indigo-300/15 px-2.5 py-1 text-indigo-200">{recipient.aor_owner}</span>}
              <button onClick={() => handleRemove(recipient.id)} disabled={busy} className="rounded-full border border-red-300/30 px-3 py-1 text-red-200 transition hover:bg-red-300/10">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="rounded-2xl border border-white/10 bg-[#00182f] px-4 py-3 text-sm text-white outline-none" />
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="rounded-2xl border border-white/10 bg-[#00182f] px-4 py-3 text-sm text-white outline-none" />
        <select value={reportType} onChange={(event) => setReportType(event.target.value as 'full' | 'aor')} className="rounded-2xl border border-white/10 bg-[#00182f] px-4 py-3 text-sm text-white outline-none">
          <option value="full">full</option>
          <option value="aor">aor</option>
        </select>
        {reportType === 'aor' && (
          <select value={aorOwner} onChange={(event) => setAorOwner(event.target.value as (typeof AOR_OPTIONS)[number])} className="rounded-2xl border border-white/10 bg-[#00182f] px-4 py-3 text-sm text-white outline-none">
            {AOR_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-blue-100/70">{message ?? ' '}</p>
        <button onClick={handleAdd} disabled={busy} className="rounded-full bg-blue-300 px-4 py-2 text-sm font-medium text-[#001f3a] disabled:opacity-60">
          {busy ? 'Working...' : 'Add recipient'}
        </button>
      </div>
    </section>
  )
}
