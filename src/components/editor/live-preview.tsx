'use client'

import { useEffect, useRef, useState } from 'react'
import type { EditorLanguage } from '@/lib/types/database'

interface LivePreviewProps {
  content: string
  language: EditorLanguage
}

export function LivePreview({ content, language }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)

    refreshTimeoutRef.current = setTimeout(() => {
      if (!iframeRef.current) return

      setIsRefreshing(true)
      setTimeout(() => setIsRefreshing(false), 150)

      const doc = iframeRef.current.contentDocument
      if (!doc) return

      let html: string

      if (language === 'html') {
        if (content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('<!doctype')) {
          html = content
        } else {
          html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>${content}</body>
</html>`
        }
      } else if (language === 'css') {
        html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${content}</style>
</head>
<body>
  <div class="preview-container">
    <h1>Heading 1</h1>
    <h2>Heading 2</h2>
    <p>This is a paragraph of text to preview your CSS styles. It contains <a href="#">a link</a>, <strong>bold text</strong>, and <em>italic text</em>.</p>
    <ul>
      <li>List item one</li>
      <li>List item two</li>
      <li>List item three</li>
    </ul>
    <button>Button</button>
    <div class="box" style="margin-top:16px;padding:16px;border:1px solid #ccc;border-radius:4px;">
      <p>This is a div.box element for testing container styles.</p>
    </div>
  </div>
</body>
</html>`
      } else {
        html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 16px; font-family: 'JetBrains Mono', monospace; background: #0a0e17; color: #dee6ee; font-size: 13px; }
    .log-entry { padding: 4px 0; border-bottom: 1px solid #1a2535; }
    .log-error { color: #C8102E; }
    .log-warn { color: #C5960C; }
    #output { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="output"></div>
  <script>
    const output = document.getElementById('output');
    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;
    function appendLog(msg, cls) {
      const el = document.createElement('div');
      el.className = 'log-entry ' + (cls || '');
      el.textContent = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : String(msg);
      output.appendChild(el);
    }
    console.log = (...args) => { args.forEach(a => appendLog(a)); origLog.apply(console, args); };
    console.error = (...args) => { args.forEach(a => appendLog(a, 'log-error')); origError.apply(console, args); };
    console.warn = (...args) => { args.forEach(a => appendLog(a, 'log-warn')); origWarn.apply(console, args); };
    try {
      ${content}
    } catch (e) {
      appendLog('Error: ' + e.message, 'log-error');
    }
  </script>
</body>
</html>`
      }

      doc.open()
      doc.write(html)
      doc.close()
    }, 300)

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    }
  }, [content, language])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-brand-800/50 bg-white">
      <div
        className={`absolute left-0 right-0 top-0 z-10 h-[2px] bg-gradient-to-r from-transparent via-nex-red to-transparent transition-opacity duration-300 ${
          isRefreshing ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div className="absolute right-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60 backdrop-blur-sm">
        Preview
      </div>
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0 bg-white"
        sandbox="allow-scripts"
        title="Live Preview"
      />
    </div>
  )
}
