'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Profile, SopDocument, SopStatus } from '@/lib/types/database'
import { SOP_STATUS_LABELS } from '@/lib/types/database'

interface Props {
  profile: Profile
  sop: SopDocument & {
    creator: { full_name: string } | null
    updater: { full_name: string } | null
  }
  ackedVersion: number
}

export function SopDetailClient({ profile, sop: initial, ackedVersion: initialAcked }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const isAdmin = profile.role === 'admin'

  const [sop, setSop] = useState(initial)
  const [ackedVersion, setAckedVersion] = useState(initialAcked)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(sop.title)
  const [content, setContent] = useState(sop.content)
  const [requiresAck, setRequiresAck] = useState(sop.requires_acknowledgment)
  const [status, setStatus] = useState<SopStatus>(sop.status as SopStatus)

  const needsAck = sop.requires_acknowledgment && sop.status === 'published' && ackedVersion < sop.version

  async function handleSave() {
    setSaving(true)
    setError(null)

    const newVersion = content !== sop.content ? sop.version + 1 : sop.version
    const publishedAt = status === 'published' && sop.status !== 'published'
      ? new Date().toISOString()
      : sop.published_at

    const { error: updateError } = await supabase
      .from('sop_documents')
      .update({
        title,
        content,
        version: newVersion,
        status,
        requires_acknowledgment: requiresAck,
        updated_by: profile.id,
        published_at: publishedAt,
      })
      .eq('id', sop.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSop({
      ...sop,
      title,
      content,
      version: newVersion,
      status,
      requires_acknowledgment: requiresAck,
      published_at: publishedAt,
    })
    setEditing(false)
    setSaving(false)
    router.refresh()
  }

  async function handleAcknowledge() {
    setAcknowledging(true)
    setError(null)

    const { error: ackError } = await supabase
      .from('sop_acknowledgments')
      .insert({
        sop_id: sop.id,
        user_id: profile.id,
        version_acknowledged: sop.version,
      })

    if (ackError) {
      setError(ackError.message)
      setAcknowledging(false)
      return
    }

    setAckedVersion(sop.version)
    setAcknowledging(false)
  }

  const inputClass =
    'w-full px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-white placeholder-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/sops"
            className="text-sm text-brand-500 hover:text-brand-300 transition-colors mb-2 inline-block"
          >
            &larr; Back to SOPs
          </Link>
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputClass} text-xl font-bold mt-1`}
            />
          ) : (
            <h1 className="text-2xl font-bold text-white">{sop.title}</h1>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-brand-500">
            <span>Version {sop.version}</span>
            <span className="text-brand-700">&middot;</span>
            <span>{SOP_STATUS_LABELS[sop.status as SopStatus]}</span>
            {sop.updater && (
              <>
                <span className="text-brand-700">&middot;</span>
                <span>Last updated by {sop.updater.full_name}</span>
              </>
            )}
            {sop.updated_at && (
              <>
                <span className="text-brand-700">&middot;</span>
                <span>
                  {new Date(sop.updated_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {isAdmin && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 text-sm bg-brand-800 hover:bg-brand-700 text-white rounded-lg transition-colors border border-brand-700"
            >
              Edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => {
                  setEditing(false)
                  setTitle(sop.title)
                  setContent(sop.content)
                  setRequiresAck(sop.requires_acknowledgment)
                  setStatus(sop.status as SopStatus)
                }}
                className="px-4 py-2 text-sm text-brand-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-nex-red hover:bg-nex-redDark disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Save & Update Version'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3 mb-6">
          {error}
        </div>
      )}

      {editing && (
        <div className="mb-6 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-brand-300">
            <input
              type="checkbox"
              checked={requiresAck}
              onChange={(e) => setRequiresAck(e.target.checked)}
              className="rounded border-brand-700 bg-brand-800"
            />
            Requires Acknowledgment
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SopStatus)}
            className="px-3 py-1.5 bg-brand-800 border border-brand-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}

      {/* Content */}
      <div className="bg-brand-900 border border-brand-800 rounded-xl p-6">
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            className={`${inputClass} font-mono text-sm`}
            placeholder="Write SOP content in markdown..."
          />
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <MarkdownRenderer content={sop.content} />
          </div>
        )}
      </div>

      {/* Acknowledgment */}
      {needsAck && !editing && (
        <div className="mt-6 bg-brand-900 border border-orange-500/30 rounded-xl p-6 text-center">
          <p className="text-sm text-brand-300 mb-4">
            This SOP requires your acknowledgment. Please read the document above carefully.
          </p>
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="px-5 py-2.5 bg-nex-red hover:bg-nex-redDark disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {acknowledging ? 'Acknowledging...' : 'I have read and agree to this SOP'}
          </button>
        </div>
      )}

      {!needsAck && sop.requires_acknowledgment && sop.status === 'published' && !editing && (
        <div className="mt-6 bg-brand-900 border border-green-500/30 rounded-xl p-4 text-center">
          <p className="text-sm text-green-400">
            You have acknowledged this SOP (version {ackedVersion}).
          </p>
        </div>
      )}
    </div>
  )
}

// Simple markdown renderer (no external dependencies)
function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-lg font-semibold text-white mt-6 mb-2">{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-xl font-bold text-white mt-8 mb-3">{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-2xl font-bold text-white mt-8 mb-4">{line.slice(2)}</h1>)
    }
    // Unordered lists
    else if (line.match(/^[-*] /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(lines[i].replace(/^[-*] /, ''))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 text-brand-300 my-2">
          {items.map((item, idx) => (
            <li key={idx}>{formatInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }
    // Ordered lists
    else if (line.match(/^\d+\. /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 text-brand-300 my-2">
          {items.map((item, idx) => (
            <li key={idx}>{formatInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      elements.push(<hr key={i} className="border-brand-800 my-6" />)
    }
    // Empty line
    else if (line.trim() === '') {
      // skip
    }
    // Paragraph
    else {
      elements.push(
        <p key={i} className="text-brand-300 my-2 leading-relaxed">
          {formatInline(line)}
        </p>
      )
    }

    i++
  }

  return <>{elements}</>
}

function formatInline(text: string): React.ReactNode {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
    }
    // Inline code
    const codeParts = part.split(/(`[^`]+`)/g)
    return codeParts.map((cp, j) => {
      if (cp.startsWith('`') && cp.endsWith('`')) {
        return <code key={`${i}-${j}`} className="px-1.5 py-0.5 bg-brand-800 rounded text-brand-200 text-xs">{cp.slice(1, -1)}</code>
      }
      return cp
    })
  })
}
