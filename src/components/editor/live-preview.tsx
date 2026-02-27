'use client'

import { useMemo } from 'react'
import type { EditorLanguage } from '@/lib/types/database'

export interface PreviewCompanionFile {
  language: EditorLanguage
  content: string
}

interface LivePreviewProps {
  content: string
  language: EditorLanguage
  companionFiles?: PreviewCompanionFile[]
}

interface ComposeDocumentOptions {
  content: string
  language: EditorLanguage
  companionFiles?: PreviewCompanionFile[]
}

function joinCompanionContent(companionFiles: PreviewCompanionFile[] | undefined, language: EditorLanguage): string {
  if (!companionFiles?.length) return ''
  return companionFiles
    .filter((file) => file.language === language)
    .map((file) => file.content)
    .filter((content) => content.trim().length > 0)
    .join('\n\n')
}

function injectCompanionsIntoDocument(documentContent: string, cssContent: string, jsContent: string): string {
  let composed = documentContent

  if (cssContent) {
    const cssBlock = `<style>\n${cssContent}\n</style>\n`
    if (/<\/head>/i.test(composed)) {
      composed = composed.replace(/<\/head>/i, `${cssBlock}</head>`)
    } else if (/<html[^>]*>/i.test(composed)) {
      composed = composed.replace(/<html[^>]*>/i, `$&\n<head>\n${cssBlock}</head>`)
    } else {
      composed = `${cssBlock}${composed}`
    }
  }

  if (jsContent) {
    const jsBlock = `<script>\n${jsContent}\n</script>\n`
    if (/<\/body>/i.test(composed)) {
      composed = composed.replace(/<\/body>/i, `${jsBlock}</body>`)
    } else if (/<\/html>/i.test(composed)) {
      composed = composed.replace(/<\/html>/i, `${jsBlock}</html>`)
    } else {
      composed = `${composed}\n${jsBlock}`
    }
  }

  return composed
}

export function composeDocument({ content, language, companionFiles }: ComposeDocumentOptions): string {
  const companionCss = joinCompanionContent(companionFiles, 'css')
  const companionJs = joinCompanionContent(companionFiles, 'javascript')

  if (language === 'html') {
    if (content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('<!doctype')) {
      if (!companionCss && !companionJs) return content
      return injectCompanionsIntoDocument(content, companionCss, companionJs)
    }

    const companionCssBlock = companionCss ? `
  <style>
${companionCss}
  </style>` : ''
    const companionJsBlock = companionJs ? `
  <script>
${companionJs}
  </script>` : ''

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    img { max-width: 100%; height: auto; }
  </style>
${companionCssBlock}
</head>
<body>${content}${companionJsBlock}</body>
</html>`
  }

  if (language === 'css') {
    const companionJsBlock = companionJs ? `
  <script>
${companionJs}
  </script>` : ''

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${content}</style>
</head>
<body>
  <div class="preview-container">
    <h1>Heading 1</h1>
    <h2>Heading 2</h2>
    <p>Preview text with <a href="#">a link</a>, <strong>bold</strong>, and <em>italic</em>.</p>
    <ul><li>List item one</li><li>List item two</li></ul>
    <button>Button</button>
  </div>
${companionJsBlock}
</body>
</html>`
  }

  const companionCssBlock = companionCss ? `
  <style>
${companionCss}
  </style>` : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 16px; font-family: monospace; background: #0a0e17; color: #dee6ee; font-size: 13px; }
    .log-entry { padding: 4px 0; border-bottom: 1px solid #1a2535; }
    .log-error { color: #C8102E; }
    .log-warn { color: #C5960C; }
    #output { white-space: pre-wrap; }
  </style>
${companionCssBlock}
</head>
<body>
  <div id="output"></div>
  <script>
    const output = document.getElementById('output');
    function appendLog(msg, cls) {
      const el = document.createElement('div');
      el.className = 'log-entry ' + (cls || '');
      el.textContent = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : String(msg);
      output.appendChild(el);
    }
    console.log = (...args) => args.forEach(a => appendLog(a));
    console.error = (...args) => args.forEach(a => appendLog(a, 'log-error'));
    console.warn = (...args) => args.forEach(a => appendLog(a, 'log-warn'));
    try { ${content} } catch(e) { appendLog('Error: ' + e.message, 'log-error'); }
  </script>
</body>
</html>`
}

export function LivePreview({ content, language, companionFiles }: LivePreviewProps) {
  const srcdoc = useMemo(() => composeDocument({ content, language, companionFiles }), [content, language, companionFiles])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-brand-800/50 bg-white">
      <div className="absolute right-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60 backdrop-blur-sm">
        Preview
      </div>
      <iframe
        className="h-full w-full border-0 bg-white"
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        title="Live Preview"
      />
    </div>
  )
}
