export type UserRole = 'admin' | 'producer' | 'requester' | 'readonly'

export type RequestType =
  | 'new_panel'
  | 'panel_correction'
  | 'category_change'
  | 'spotlight_record'
  | 'marketing_snipe'
  | 'flyer_archive'
  | 'other'

export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export type RequestStatus =
  | 'submitted'
  | 'triaged'
  | 'in_progress'
  | 'in_review'
  | 'complete'
  | 'cancelled'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  created_at: string
}

export interface StatusHistoryEntry {
  from: RequestStatus | null
  to: RequestStatus
  changed_by: string
  changed_at: string
}

export interface WorkRequest {
  id: string
  title: string
  request_type: RequestType
  description: string | null
  priority: Priority
  status: RequestStatus
  ad_week: string | null
  due_date: string | null
  requester_id: string
  assigned_to: string | null
  notes: string | null
  status_history: StatusHistoryEntry[]
  created_at: string
  updated_at: string
  // Joined fields
  requester?: Profile
  assignee?: Profile
}

// Labels for display
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  new_panel: 'New Panel',
  panel_correction: 'Panel Correction',
  category_change: 'Category Change',
  spotlight_record: 'Spotlight Record',
  marketing_snipe: 'Marketing Snipe',
  flyer_archive: 'Flyer Archive',
  other: 'Other',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: 'Submitted',
  triaged: 'Triaged',
  in_progress: 'In Progress',
  in_review: 'In Review',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

// ============================================================
// Phase A — Panel Workflow Types
// ============================================================

export type AdWeekStatus = 'draft' | 'turn_in' | 'in_production' | 'proofing' | 'live' | 'archived'

export type PanelStatus =
  | 'pending'
  | 'design_needed'
  | 'in_production'
  | 'proofing'
  | 'revision'
  | 'complete'
  | 'cancelled'

export type PanelType = 'Marketing Header' | 'Banner' | 'Left Nav' | 'A' | 'B' | 'C'

export type DollarOrPercent = '$' | '%'

export type PanelSource = 'manual' | 'upload' | 'correction'
export type CodeStatus = 'none' | 'generated' | 'draft' | 'final' | 'loaded' | 'proofed'

export type UploadType = 'turn_in' | 'corrections' | 'ad_week_calendar'

export type UploadStatus = 'processing' | 'complete' | 'partial' | 'failed'

export type ConflictResolution = 'keep_existing' | 'use_uploaded' | 'merged'

export type SopStatus = 'draft' | 'published' | 'archived'

export const PANEL_CATEGORIES = [
  'Homepage',
  'Accessories',
  'Apparel',
  'Baby',
  'Baby Care',
  'Beauty',
  'Candy',
  'Electronics',
  'Everyday Home',
  'Food, Snacks & Candy',
  'Furniture',
  'General Hardware',
  'Health & Wellness',
  'Home Depot',
  'Household Essentials',
  'Luggage & Travel',
  'Military (Navy Pride)',
  'Office and School Supplies',
  'Outdoor Home',
  'Personal Care',
  'Pet',
  'Seasonal',
  'Shoes',
  'Speciality Shops',
  'Sports, Fitness and Outdoor',
  'Tactical',
  'Toys',
] as const

export type PanelCategory = (typeof PANEL_CATEGORIES)[number]

export const PANEL_TYPES: PanelType[] = ['Marketing Header', 'Banner', 'Left Nav', 'A', 'B', 'C']

export const PANEL_PREFIXES = [
  'Take An Additional ',
  'Save Up To ',
  'New! ',
  'BOGO ',
  'Sale ',
  'Save on ',
  'Coming Soon! ',
  'Online Exclusive ',
  'Special Buy! ',
  'True Blue Deal ',
  'Military Exclusive Price ',
  'Military Exclusive',
  'Take An Extra ',
] as const

export const PANEL_SUFFIXES = [
  'Off Our Everyday NEX Price ',
  'Off Retail Price ',
  'Off Our Everyday Value ',
  'Off Already Reduced Clearance ',
] as const

export const PANEL_EXCLUSIONS = [
  '*Price as marked online.',
  '*Excludes Special Buys.',
  '*Excludes lab grown diamonds.',
  '*Excludes clearance.',
  '*Excludes doorbusters.',
  '*Selection varies by store.',
] as const

export const LINK_INTENTS = [
  'Link to Brand',
  'Link To Category',
  'Link to Brand/Category',
] as const

export const AD_WEEK_STATUS_LABELS: Record<AdWeekStatus, string> = {
  draft: 'Draft',
  turn_in: 'Turn-In',
  in_production: 'In Production',
  proofing: 'Proofing',
  live: 'Live',
  archived: 'Archived',
}

export const AD_WEEK_STATUS_COLORS: Record<AdWeekStatus, string> = {
  draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  turn_in: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  in_production: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  proofing: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  live: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  archived: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

export const PANEL_STATUS_LABELS: Record<PanelStatus, string> = {
  pending: 'Pending',
  design_needed: 'Design Needed',
  in_production: 'In Production',
  proofing: 'Proofing',
  revision: 'Revision',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

export const PANEL_STATUS_COLORS: Record<PanelStatus, string> = {
  pending: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  design_needed: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  in_production: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  proofing: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  revision: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  complete: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
}

export const PANEL_TYPE_COLORS: Record<PanelType, string> = {
  A: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30',
  B: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
  C: 'bg-teal-500/20 text-teal-200 border-teal-500/30',
  Banner: 'bg-violet-500/20 text-violet-200 border-violet-500/30',
  'Marketing Header': 'bg-rose-500/20 text-rose-200 border-rose-500/30',
  'Left Nav': 'bg-sky-500/20 text-sky-200 border-sky-500/30',
}

export const SOP_STATUS_LABELS: Record<SopStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

export interface AdWeek {
  id: string
  week_number: number
  year: number
  label: string | null
  status: AdWeekStatus
  start_date: string | null
  end_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined
  events?: AdWeekEvent[]
  creator?: Profile
  panel_count?: number
}

export interface AdWeekEvent {
  id: string
  ad_week_id: string
  event_code: string
  event_name: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
}

export interface Panel {
  id: string
  ad_week_id: string
  event_id: string | null
  category: PanelCategory
  page_location: string
  priority: number | null
  panel_type: PanelType | null
  prefix: string | null
  value: string | null
  dollar_or_percent: DollarOrPercent | null
  suffix: string | null
  item_description: string | null
  exclusions: string | null
  generated_description: string | null
  brand_category_tracking: string | null
  direction: string | null
  image_reference: string | null
  link_intent: string | null
  link_url: string | null
  special_dates: string | null
  status: PanelStatus
  assigned_to: string | null
  requester_id: string | null
  design_needed: boolean
  is_carryover: boolean
  is_pickup: boolean
  pickup_reference: string | null
  source: PanelSource
  upload_id: string | null
  notes: string | null
  generated_code: string | null
  generated_code_draft: string | null
  generated_code_final: string | null
  code_status: CodeStatus
  page_template_id: string | null
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
  // Joined
  assignee?: Profile
  requester?: Profile
  event?: AdWeekEvent
  ad_week?: AdWeek
}

export interface PageTemplate {
  id: string
  name: string
  url: string | null
  page_type: string
  slots: Array<{ name: string; label?: string }>
  created_at: string
  updated_at: string
}

export interface CodeTemplate {
  id: string
  page_template_id: string
  slot_name: string
  html_template: string
  variable_map: Record<string, string>
  version: number
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface AorAssignment {
  id: string
  producer_id: string
  category: PanelCategory
  loe: number
  created_at: string
  // Joined
  producer?: Profile
}

export interface Upload {
  id: string
  filename: string
  uploaded_by: string | null
  upload_type: UploadType | null
  ad_week_id: string | null
  status: UploadStatus
  total_rows: number
  imported_rows: number
  conflict_rows: number
  error_log: Array<{ row: number; message: string }>
  summary: Record<string, unknown>
  created_at: string
  // Joined
  uploader?: Profile
  ad_week?: AdWeek
}

export interface PanelConflict {
  id: string
  panel_id: string | null
  upload_id: string
  conflict_type: string | null
  uploaded_data: Record<string, unknown>
  resolution: ConflictResolution | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  // Joined
  panel?: Panel
  resolver?: Profile
}

export interface SopDocument {
  id: string
  title: string
  slug: string
  content: string
  version: number
  status: SopStatus
  requires_acknowledgment: boolean
  created_by: string | null
  updated_by: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  // Joined
  creator?: Profile
  updater?: Profile
}

export interface SopAcknowledgment {
  id: string
  sop_id: string
  user_id: string
  version_acknowledged: number
  acknowledged_at: string
}

// Helper: compute generated_description from panel fields
export function computeGeneratedDescription(fields: {
  prefix?: string | null
  value?: string | null
  dollar_or_percent?: string | null
  suffix?: string | null
  item_description?: string | null
}): string {
  const parts: string[] = []
  if (fields.prefix) parts.push(fields.prefix)
  if (fields.value) {
    if (fields.dollar_or_percent === '$') {
      parts.push('$' + fields.value)
    } else if (fields.dollar_or_percent === '%') {
      parts.push(fields.value + '%')
    } else {
      parts.push(fields.value)
    }
  }
  if (fields.suffix) parts.push(fields.suffix)
  if (fields.item_description) parts.push(fields.item_description)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

// ============================================================
// Editor Types
// ============================================================

export type EditorLanguage = 'html' | 'css' | 'javascript'
export type FileVisibility = 'private' | 'team'

export interface EditorFolder {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface EditorTeamFolder {
  id: string
  name: string
  created_by: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface EditorFile {
  id: string
  user_id: string
  folder_id: string | null
  team_folder_id: string | null
  title: string
  language: EditorLanguage
  content: string
  visibility: FileVisibility
  is_template: boolean
  tags: string[]
  created_at: string
  updated_at: string
  // Joined
  owner?: Profile
  folder?: EditorFolder
}

export interface EditorFileVersion {
  id: string
  file_id: string
  content: string
  created_by: string | null
  created_at: string
  // Joined
  creator?: Profile
}

export interface EditorFileShare {
  id: string
  file_id: string
  shared_with: string
  can_edit: boolean
  created_at: string
}

export const EDITOR_LANGUAGE_LABELS: Record<EditorLanguage, string> = {
  html: 'HTML',
  css: 'CSS',
  javascript: 'JavaScript',
}

export const EDITOR_LANGUAGE_EXTENSIONS: Record<EditorLanguage, string> = {
  html: '.html',
  css: '.css',
  javascript: '.js',
}
