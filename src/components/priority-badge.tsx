import { type Priority, PRIORITY_LABELS } from '@/lib/types/database'

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-brand-700/50 text-brand-300',
  normal: 'bg-brand-600/30 text-brand-200',
  high: 'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  )
}
