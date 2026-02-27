'use client'

export function CodePreview({ code }: { code: string }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-white">Preview</h3>
      <div className="overflow-hidden rounded-xl border border-brand-800 bg-white">
        <iframe
          title="Generated code preview"
          srcDoc={code}
          sandbox="allow-same-origin"
          className="h-56 w-full"
        />
      </div>
    </section>
  )
}
