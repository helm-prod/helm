'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { EditorLanguage } from '@/lib/types/database'

interface AiPromptProps {
  language: EditorLanguage
  currentCode: string
  onGenerated: (code: string) => void
}

export function AiPrompt({ language, currentCode, onGenerated }: AiPromptProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!isGenerating) setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, isGenerating])

  const generate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return
    setIsGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          language,
          currentCode: currentCode.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Generation failed')
        return
      }

      onGenerated(data.code)
      setPrompt('')
      setIsOpen(false)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }, [prompt, language, currentCode, isGenerating, onGenerated])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        generate()
      }
      if (e.key === 'Escape' && !isGenerating) {
        setIsOpen(false)
        setPrompt('')
        setError(null)
      }
    },
    [generate, isGenerating]
  )

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-300 transition-all hover:border-purple-500/50 hover:bg-purple-500/20 hover:text-purple-200"
        title="Generate code with AI"
      >
        <SparkleIcon className="h-3.5 w-3.5" />
        <span>AI</span>
      </button>
    )
  }

  return createPortal(
    <div ref={containerRef} className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0" />
      <div className="absolute left-1/2 top-14 w-full max-w-2xl -translate-x-1/2 px-4">
        <div className="rounded-xl border border-purple-500/30 bg-brand-950 shadow-2xl shadow-purple-500/5">
          <div className="flex items-center gap-2 border-b border-brand-800/50 px-4 py-2.5">
            <SparkleIcon className="h-4 w-4 text-purple-400" />
            <span className="text-xs font-semibold text-purple-300">AI Generate</span>
            <span className="rounded bg-brand-800 px-1.5 py-0.5 text-[10px] text-brand-400">
              {language.toUpperCase()}
            </span>
            {currentCode.trim() && (
              <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400">
                has context
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={() => { if (!isGenerating) { setIsOpen(false); setPrompt(''); setError(null) } }}
              className="text-brand-500 hover:text-white"
            >
              <CloseSmIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="p-3">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                currentCode.trim()
                  ? 'Describe what to change... (Enter to send, Shift+Enter for newline)'
                  : 'Describe what to build... (Enter to send, Shift+Enter for newline)'
              }
              rows={2}
              disabled={isGenerating}
              className="w-full resize-none rounded-lg border border-brand-700 bg-brand-900/80 px-3 py-2 text-sm text-white placeholder-brand-500 outline-none transition-colors focus:border-purple-500/50 disabled:opacity-50"
            />
            {error && (
              <div className="mt-2 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
                {error}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] text-brand-500">
                <span>Powered by Gemini Flash</span>
                {currentCode.trim() && <span>• AI can see your current code</span>}
              </div>
              <button
                onClick={generate}
                disabled={!prompt.trim() || isGenerating}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600"
              >
                {isGenerating ? (
                  <>
                    <LoadingDots />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <SparkleIcon className="h-3 w-3" />
                    <span>Generate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function LoadingDots() {
  return (
    <span className="flex items-center gap-0.5">
      <span className="h-1 w-1 animate-bounce rounded-full bg-white [animation-delay:0ms]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-white [animation-delay:150ms]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-white [animation-delay:300ms]" />
    </span>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}

function CloseSmIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
