'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, Trash2, Upload, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types/database'

const CDN_BASE_URL = 'https://img.nexweb.dev/'
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

type ToastState = {
  tone: 'success' | 'error'
  message: string
}

type PanelFile = {
  name: string
  createdAt: string | null
  size: number | null
  url: string
}

function formatBytes(bytes: number | null) {
  if (!bytes || Number.isNaN(bytes)) return 'Unknown size'

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function formatDate(value: string | null) {
  if (!value) return 'Unknown date'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function normalizeFilename(filename: string) {
  return filename.trim().replace(/\s+/g, '-').toLowerCase()
}

function withTimestampSuffix(filename: string) {
  const match = filename.match(/^(.*?)(\.[^.]+)?$/)
  const base = match?.[1] || filename
  const extension = match?.[2] || ''
  return `${base}-${Date.now()}${extension}`
}

function isAcceptedFile(file: File) {
  const lowercaseName = file.name.toLowerCase()
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.some((extension) => lowercaseName.endsWith(extension))
}

function mapStorageFile(file: {
  name: string
  created_at?: string | null
  updated_at?: string | null
  metadata?: { size?: number | null } | null
}): PanelFile {
  return {
    name: file.name,
    createdAt: file.created_at ?? file.updated_at ?? null,
    size: file.metadata?.size ?? null,
    url: `${CDN_BASE_URL}${encodeURIComponent(file.name)}`,
  }
}

export function PanelHosting({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<PanelFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  useEffect(() => {
    void loadFiles()
  }, [])

  useEffect(() => {
    if (!toast) return

    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!copiedUrl) return

    const timer = window.setTimeout(() => setCopiedUrl(null), 2000)
    return () => window.clearTimeout(timer)
  }, [copiedUrl])

  async function loadFiles() {
    setLoading(true)

    const { data, error } = await supabase.storage.from('panels').list('', {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    })

    if (error) {
      setToast({ tone: 'error', message: error.message })
      setLoading(false)
      return
    }

    const nextFiles = (data ?? [])
      .filter((file) => file.name)
      .map(mapStorageFile)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bTime - aTime
      })

    setFiles(nextFiles)
    setLoading(false)
  }

  async function uploadFile(file: File) {
    if (!isAcceptedFile(file)) {
      setToast({ tone: 'error', message: 'Use a JPG, PNG, GIF, or WEBP image.' })
      return
    }

    setUploading(true)
    setToast(null)

    const existingNames = new Set(files.map((existingFile) => existingFile.name))
    const normalizedName = normalizeFilename(file.name)
    const path = existingNames.has(normalizedName) ? withTimestampSuffix(normalizedName) : normalizedName

    const { error } = await supabase.storage.from('panels').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (error) {
      setToast({ tone: 'error', message: error.message })
      setUploading(false)
      return
    }

    await loadFiles()
    setToast({ tone: 'success', message: `Uploaded ${path}` })
    setUploading(false)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  async function handleFileSelection(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    await uploadFile(file)
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setToast({ tone: 'success', message: 'CDN URL copied to clipboard.' })
    } catch {
      setToast({ tone: 'error', message: 'Unable to copy the CDN URL.' })
    }
  }

  async function handleDelete(filename: string) {
    const confirmed = window.confirm(`Delete ${filename}?`)
    if (!confirmed) return

    const { error } = await supabase.storage.from('panels').remove([filename])

    if (error) {
      setToast({ tone: 'error', message: error.message })
      return
    }

    setFiles((current) => current.filter((file) => file.name !== filename))
    setToast({ tone: 'success', message: `Deleted ${filename}` })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="rounded-3xl border border-[rgba(0,110,180,0.25)] bg-[#001f3a] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)] sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8cb9de]">Panels</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Panel Image Hosting</h1>
            <p className="mt-3 max-w-3xl text-sm text-[#b9d4ea]">
              Upload public panel images for live use on mynavyexchange.com. Files keep their original name format with normalized casing and hyphens.
            </p>
          </div>
          <div className="rounded-2xl border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)] px-4 py-3 text-sm text-[#dbeafb]">
            Signed in as <span className="font-semibold text-white">{profile.full_name}</span>
          </div>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setDragActive(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragActive(false)
            void handleFileSelection(event.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
          className={`mt-8 cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
            dragActive
              ? 'border-[#5fb0ea] bg-[rgba(0,110,180,0.18)]'
              : 'border-[rgba(0,110,180,0.35)] bg-[rgba(0,65,115,0.45)] hover:border-[#5fb0ea] hover:bg-[rgba(0,90,150,0.28)]'
          }`}
        >
          <div className="mx-auto flex max-w-xl flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(0,110,180,0.35)] bg-[#002a4d] text-[#8fd0ff]">
              {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">
              {uploading ? 'Uploading image...' : 'Drop a panel image here'}
            </h2>
            <p className="mt-2 text-sm text-[#b9d4ea]">
              Click to browse or drag in a file. Accepted formats: JPG, PNG, GIF, WEBP.
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[#7fb1d8]">
              Public CDN base: {CDN_BASE_URL}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={(event) => void handleFileSelection(event.target.files)}
            className="hidden"
            disabled={uploading}
          />
        </div>

        {toast && (
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              toast.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-100'
            }`}
          >
            {toast.message}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-[rgba(0,110,180,0.25)] bg-[#001f3a] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Hosted Files</h2>
            <p className="mt-1 text-sm text-[#b9d4ea]">{files.length} image{files.length === 1 ? '' : 's'} in the panels bucket</p>
          </div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-[#8fd0ff]" />}
        </div>

        {files.length === 0 && !loading ? (
          <div className="mt-6 rounded-3xl border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)] p-10 text-center">
            <ImageIcon className="mx-auto h-10 w-10 text-[#7fb1d8]" />
            <p className="mt-4 text-base font-medium text-white">No panel images uploaded yet</p>
            <p className="mt-2 text-sm text-[#b9d4ea]">Upload your first image above to generate a production-ready CDN URL.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {files.map((file) => {
              const fullUrl = `${CDN_BASE_URL}${encodeURIComponent(file.name)}`

              return (
                <article
                  key={file.name}
                  className="overflow-hidden rounded-3xl border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)]"
                >
                  <div className="aspect-[16/9] bg-[#002646]">
                    <img src={file.url} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="space-y-4 p-5">
                    <div>
                      <p className="break-all text-sm font-semibold text-white">{file.name}</p>
                      <div className="mt-2 space-y-1 text-xs text-[#b9d4ea]">
                        <p>Uploaded {formatDate(file.createdAt)}</p>
                        <p>{formatBytes(file.size)}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopy(fullUrl)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[rgba(0,110,180,0.3)] bg-[#00345d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#004271]"
                      >
                        {copiedUrl === fullUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedUrl === fullUrl ? 'Copied' : 'Copy URL'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(file.name)}
                        className="inline-flex items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
