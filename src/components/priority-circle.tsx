export function PriorityCircle({ value }: { value: number | null }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-700 bg-brand-800 text-sm font-semibold text-white">
      {value ?? '—'}
    </span>
  )
}
