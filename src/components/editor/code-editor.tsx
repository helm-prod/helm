'use client'

import { useRef, useCallback } from 'react'
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react'
import type { EditorLanguage } from '@/lib/types/database'
import type { editor } from 'monaco-editor'

interface CodeEditorProps {
  value: string
  language: EditorLanguage
  onChange: (value: string) => void
  onSave?: () => void
  readOnly?: boolean
}

function defineNexTheme(monaco: Parameters<OnMount>[1]) {
  monaco.editor.defineTheme('nex-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'tag', foreground: 'C8102E', fontStyle: 'bold' },
      { token: 'tag.html', foreground: 'C8102E' },
      { token: 'tag.css', foreground: 'C8102E' },
      { token: 'attribute.name.html', foreground: '4A9BD9' },
      { token: 'attribute.value.html', foreground: 'C5960C' },
      { token: 'attribute.value.css', foreground: 'C5960C' },
      { token: 'delimiter.html', foreground: '6B7D8E' },
      { token: 'selector.css', foreground: 'C8102E' },
      { token: 'property.css', foreground: '4A9BD9' },
      { token: 'value.css', foreground: 'C5960C' },
      { token: 'number.css', foreground: 'E8A862' },
      { token: 'unit.css', foreground: 'E8A862' },
      { token: 'keyword', foreground: 'C8102E' },
      { token: 'keyword.js', foreground: 'C8102E' },
      { token: 'identifier.js', foreground: 'DEE6EE' },
      { token: 'type.identifier.js', foreground: '4A9BD9' },
      { token: 'string', foreground: 'C5960C' },
      { token: 'string.html', foreground: 'C5960C' },
      { token: 'comment', foreground: '3D6A8F', fontStyle: 'italic' },
      { token: 'comment.html', foreground: '3D6A8F', fontStyle: 'italic' },
      { token: 'number', foreground: 'E8A862' },
      { token: 'delimiter', foreground: '6B7D8E' },
      { token: 'operator', foreground: '8FA8BF' },
      { token: 'variable', foreground: 'DEE6EE' },
    ],
    colors: {
      'editor.background': '#001425',
      'editor.foreground': '#DEE6EE',
      'editor.lineHighlightBackground': '#002240',
      'editor.selectionBackground': '#003A6840',
      'editor.inactiveSelectionBackground': '#003A6825',
      'editorLineNumber.foreground': '#1B5D95',
      'editorLineNumber.activeForeground': '#4A9BD9',
      'editorCursor.foreground': '#CFA751',
      'editor.selectionHighlightBackground': '#003A6830',
      'editorBracketMatch.background': '#003A6840',
      'editorBracketMatch.border': '#4A9BD9',
      'editorIndentGuide.background': '#002240',
      'editorIndentGuide.activeBackground': '#003A68',
      'editorWidget.background': '#001C33',
      'editorWidget.border': '#003A68',
      'editorSuggestWidget.background': '#001C33',
      'editorSuggestWidget.border': '#003A68',
      'editorSuggestWidget.selectedBackground': '#002A50',
      'editorHoverWidget.background': '#001C33',
      'editorHoverWidget.border': '#003A68',
      'input.background': '#001C33',
      'input.border': '#003A68',
      'input.foreground': '#DEE6EE',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': '#003A6850',
      'scrollbarSlider.hoverBackground': '#003A6880',
      'scrollbarSlider.activeBackground': '#4A9BD960',
      'minimap.background': '#001425',
      'editorOverviewRuler.border': '#003A68',
      'focusBorder': '#4A9BD960',
    },
  })
}

const MONACO_LANGUAGE_MAP: Record<EditorLanguage, string> = {
  html: 'html',
  css: 'css',
  javascript: 'javascript',
}

export function CodeEditor({ value, language, onChange, onSave, readOnly = false }: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      defineNexTheme(monaco)
      monaco.editor.setTheme('nex-dark')

      if (onSave) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          onSave()
        })
      }

      editor.addCommand(
        monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
        () => {
          editor.getAction('editor.action.formatDocument')?.run()
        }
      )

      editor.focus()
    },
    [onSave]
  )

  const handleChange: OnChange = useCallback(
    (val) => {
      onChange(val ?? '')
    },
    [onChange]
  )

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-brand-800/50">
      <Editor
        height="100%"
        language={MONACO_LANGUAGE_MAP[language]}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        theme="nex-dark"
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          lineHeight: 20,
          minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          renderWhitespace: 'selection',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          guides: { indentation: true, bracketPairs: true },
          padding: { top: 16, bottom: 16 },
          readOnly,
          domReadOnly: readOnly,
        }}
        loading={
          <div className="flex h-full items-center justify-center bg-[#001425]">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 animate-pulse rounded-full bg-gold-400" />
              <span className="text-sm text-brand-400">Initializing editor...</span>
            </div>
          </div>
        }
      />
    </div>
  )
}

export function useEditorRef() {
  return useRef<editor.IStandaloneCodeEditor | null>(null)
}
