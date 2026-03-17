export type SiteQualityRunStatus = 'pending' | 'running' | 'complete' | 'failed'
export type SiteQualityAorOwner = 'Megan' | 'Maddie' | 'Daryl'
export type { ScrapedPanel, PanelScrapeResult } from './panel-scraper'

export interface SiteQualityLinkRun {
  id: string
  scope: 'all' | 'aor' | 'url'
  scope_value: string | null
  trigger: 'manual' | 'scheduled'
  status: SiteQualityRunStatus
  pages_scanned: number
  links_checked: number
  broken_count: number
  redirect_count: number
  started_at: string | null
  created_at: string
  completed_at: string | null
  created_by: string | null
}

export interface SiteQualityLinkResult {
  id: string
  run_id: string
  page_url: string
  link_url: string
  source_type: string
  source_label: string
  http_status: number | null
  error_message: string | null
  redirect_target: string | null
  aor_owner: string | null
  created_at: string
}

export interface SiteQualityPanelRun {
  id: string
  ad_week: string | null
  trigger: 'manual' | 'scheduled'
  status: SiteQualityRunStatus
  total_panels: number
  avg_score: number | null
  issues_flagged: number
  passing_count: number
  created_at: string
  completed_at: string | null
  created_by: string | null
}

export type SiteQualityPanelIssueType =
  | 'price_mismatch'
  | 'item_not_found'
  | 'dead_link'
  | 'redirect'
  | 'context_mismatch'
  | 'bot_blocked'
  | 'none'

export interface SiteQualityPanelIssue {
  type: SiteQualityPanelIssueType
  detail: string
}

export interface SiteQualityPanelResult {
  id: string
  run_id: string
  panel_id: string
  panel_name: string
  category_l1: string
  source_page_url: string | null
  panel_type?: 'PRODUCT' | 'BRAND' | 'CATEGORY'
  featured_product?: string | null
  price_shown?: string | null
  offer_language?: string | null
  is_bot_blocked?: boolean
  redirect_count?: number
  product_count_on_destination?: number | null
  is_out_of_stock?: boolean
  outbound_url: string
  aor_owner: string
  ad_week: number | null
  ad_year: number | null
  slot: string | null
  is_stale: boolean | null
  category_folder: string | null
  score: number
  issues: SiteQualityPanelIssue[]
  ai_reasoning: string
  outbound_page_title: string
  panel_image_url: string
  created_at: string
}

export interface SiteQualityLinkResultsResponse {
  run: SiteQualityLinkRun | null
  results: SiteQualityLinkResult[]
  page: number
  pageSize: number
  total: number
}

export interface SiteQualityPanelResultsResponse {
  run: SiteQualityPanelRun | null
  results: SiteQualityPanelResult[]
  page: number
  pageSize: number
  total: number
}
