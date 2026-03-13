export type WogEventStatus = 'upcoming' | 'past' | 'archived'

export interface WogEvent {
  id: string
  event_name: string
  location: string | null
  start_date: string
  end_date: string | null
  description: string
  special_notes: string | null
  event_image_url: string
  cta1_title: string | null
  cta1_link: string | null
  cta2_title: string | null
  cta2_link: string | null
  status: WogEventStatus
  sort_order: number
  created_at: string
  updated_at: string
}
