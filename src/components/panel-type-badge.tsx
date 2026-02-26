import { PANEL_TYPE_COLORS, type PanelType } from '@/lib/types/database'

export function PanelTypeBadge({ panelType }: { panelType: PanelType | null }) {
  if (!panelType) {
    return (
      <span className="inline-flex items-center rounded-full border border-brand-700 px-2 py-0.5 text-xs font-medium text-brand-300">
        —
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PANEL_TYPE_COLORS[panelType]}`}
    >
      {panelType}
    </span>
  )
}
