'use client'

import Editor from '@monaco-editor/react'

export function CodeMode({
  value,
  onChange,
  canEdit,
}: {
  value: string
  onChange: (next: string) => void
  canEdit: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-brand-800 bg-brand-950">
      <Editor
        height="360px"
        defaultLanguage="html"
        theme="vs-dark"
        value={value}
        onChange={(next) => onChange(next ?? '')}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'on',
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          fontSize: 13,
          bracketPairColorization: { enabled: true },
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          formatOnPaste: true,
          readOnly: !canEdit,
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  )
}
