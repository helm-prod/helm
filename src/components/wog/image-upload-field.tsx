'use client'

import { useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ImageUploadFieldProps {
  value: string | null
  onChange: (url: string | null) => void
  disabled?: boolean
  onUploadingChange?: (uploading: boolean) => void
  onErrorChange?: (error: string | null) => void
}

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function uploadImage(file: File): Promise<string> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const path = `events/${filename}`

  const { error } = await supabase.storage.from('wog-images').upload(path, file, { upsert: false })

  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from('wog-images').getPublicUrl(path)
  return data.publicUrl
}

export default function ImageUploadField({
  value,
  onChange,
  disabled = false,
  onUploadingChange,
  onErrorChange,
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileLabel, setFileLabel] = useState<string>('Uploaded')

  const previewLabel = useMemo(() => (value ? fileLabel : ''), [fileLabel, value])

  function setUploadState(uploading: boolean) {
    setIsUploading(uploading)
    onUploadingChange?.(uploading)
  }

  function setFieldError(message: string | null) {
    setError(message)
    onErrorChange?.(message)
  }

  async function handleFile(file: File | null) {
    if (!file) return

    if (!ALLOWED_TYPES.has(file.type)) {
      setFieldError('Please upload a JPEG, PNG, WebP, or GIF')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setFieldError('Image must be under 5MB')
      return
    }

    setFieldError(null)
    setFileLabel(file.name)
    setUploadState(true)

    try {
      const publicUrl = await uploadImage(file)
      onChange(publicUrl)
      setFileLabel(file.name || 'Uploaded')
    } catch {
      setFieldError('Upload failed — please try again')
    } finally {
      setUploadState(false)
    }
  }

  return (
    <div>
      {value ? (
        <div className="relative inline-flex max-w-[200px] flex-col gap-2">
          <div className="overflow-hidden rounded-2xl border border-brand-700 bg-brand-950/80">
            <img src={value} alt="Selected event" className="h-auto max-w-[200px] rounded-2xl object-cover" />
          </div>
          <p className="text-xs text-slate-400">{previewLabel || 'Uploaded'}</p>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setFieldError(null)
              setFileLabel('Uploaded')
              if (fileInputRef.current) {
                fileInputRef.current.value = ''
              }
            }}
            disabled={disabled || isUploading}
            className="absolute right-2 top-2 rounded-full bg-black/65 p-1 text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled && !isUploading) {
              setIsDragging(true)
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            if (disabled || isUploading) return
            void handleFile(event.dataTransfer.files[0] ?? null)
          }}
          disabled={disabled || isUploading}
          className={`flex h-[200px] w-full flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center transition-colors ${
            isDragging
              ? 'border-[rgba(59,130,246,0.7)] bg-[rgba(0,65,115,0.5)]'
              : 'border-[rgba(0,110,180,0.4)] bg-[rgba(0,65,115,0.3)] hover:bg-[rgba(0,65,115,0.5)]'
          } disabled:cursor-not-allowed disabled:opacity-70`}
        >
          {isUploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
          ) : (
            <>
              <div className="mb-3 rounded-full border border-brand-700/80 bg-brand-950/80 p-3 text-sky-300">
                {isDragging ? <Upload className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
              </div>
              <p className="text-sm font-medium text-white">Drop image here or click to browse</p>
              <p className="mt-1 text-xs text-slate-400">JPEG, PNG, WebP · Max 5MB</p>
            </>
          )}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          void handleFile(event.target.files?.[0] ?? null)
        }}
        disabled={disabled || isUploading}
      />

      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  )
}
