'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function NewSOPPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [content, setContent] = useState('')
  const [requiresAck, setRequiresAck] = useState(false)

  function generateSlug(t: string) {
    return t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('You must be logged in.')
      setLoading(false)
      return
    }

    const finalSlug = slug || generateSlug(title)

    const { data, error: insertError } = await supabase
      .from('sop_documents')
      .insert({
        title,
        slug: finalSlug,
        content,
        requires_acknowledgment: requiresAck,
        created_by: user.id,
        updated_by: user.id,
        status: 'draft',
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push(`/sops/${data.slug}`)
    router.refresh()
  }

  const inputClass =
    'w-full px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-white placeholder-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
  const labelClass = 'block text-sm font-medium text-brand-300 mb-1'

  return (
    <div className="max-w-3xl">
      <Link
        href="/sops"
        className="text-sm text-brand-500 hover:text-brand-300 transition-colors mb-4 inline-block"
      >
        &larr; Back to SOPs
      </Link>

      <h1 className="text-2xl font-bold text-white mb-6">Create SOP</h1>

      <form
        onSubmit={handleSubmit}
        className="bg-brand-900 border border-brand-800 rounded-xl p-6 space-y-5"
      >
        <div>
          <label htmlFor="title" className={labelClass}>
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (!slug) setSlug(generateSlug(e.target.value))
            }}
            className={inputClass}
            placeholder="e.g., Panel Production Workflow"
          />
        </div>

        <div>
          <label htmlFor="slug" className={labelClass}>
            URL Slug
          </label>
          <input
            id="slug"
            type="text"
            value={slug || generateSlug(title)}
            onChange={(e) => setSlug(e.target.value)}
            className={inputClass}
            placeholder="auto-generated-from-title"
          />
          <p className="text-xs text-brand-500 mt-1">
            Will be accessible at /sops/{slug || generateSlug(title) || 'slug'}
          </p>
        </div>

        <div>
          <label htmlFor="content" className={labelClass}>
            Content (Markdown) <span className="text-red-400">*</span>
          </label>
          <textarea
            id="content"
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={15}
            className={`${inputClass} font-mono text-sm`}
            placeholder="# SOP Title&#10;&#10;## Overview&#10;&#10;Write your SOP content here using markdown..."
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-brand-300">
          <input
            type="checkbox"
            checked={requiresAck}
            onChange={(e) => setRequiresAck(e.target.checked)}
            className="rounded border-brand-700 bg-brand-800"
          />
          Requires Acknowledgment
        </label>

        {error && (
          <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-gold-400 hover:bg-gold-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create SOP'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 text-brand-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
