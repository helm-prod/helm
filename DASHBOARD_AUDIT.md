## 1. Dashboard Page (page.tsx)
File: `src/app/(app)/dashboard/page.tsx`

- What data does it fetch?
- Auth/session: current user via `createClient()` + `supabase.auth.getUser()`.
- Profile: `profiles` row for current user (`.eq('id', user.id).single()`).
- Ad week context:
- Active weeks from `ad_weeks` with status in `['turn_in', 'in_production', 'proofing']`.
- Current week from `ad_weeks` with status in `['in_production', 'proofing']`, ordered by year/week desc, `limit(1)`.
- Requests + people:
- Recent `work_requests` (latest 10) with joined requester profile name.
- All profiles (`id, full_name`) for downstream analytics selectors.
- Panel counts:
- My open panels (`panels`) scoped to active week IDs, assigned to user, excluding complete/cancelled.
- Panels needing design (`status='design_needed'`) in active week IDs.
- Completed this week (`status='complete'` and `updated_at >= now-7d`).
- Current week panel list (priority/status/descriptions/category/event code) for top-priority list + progress.

- What components does it render?
- `PageGuard pageSlug="dashboard"`
- Local stats cards + current week section + recent requests list
- `GscOverviewCard`
- `GmcOverviewCard`
- `Ga4Section`

- What props does it pass?
- `GscOverviewCard`: none
- `GmcOverviewCard`: none
- `Ga4Section`:
- `profileId={profile.id}`
- `allProfiles={allProfiles}`
- `userRole={profile.role}`

## 2. Dashboard Components (list each)

- `src/components/dashboard/ga4-section.tsx` -> Main GA4 dashboard UI (site KPIs, ecommerce KPIs, AOR producer/team views, page highlights, refresh button).
- Props interface: `{ profileId: string; allProfiles: ProfileOption[]; userRole?: string | null }`
- Data sources:
- `GET /api/ga4/metrics?scope=site`
- `GET /api/ga4/metrics?scope=aor&profile_id=...`
- `GET /api/ga4/metrics?scope=aor` (team view)
- `POST /api/ga4/refresh` (manual refresh)
- Uses `ga4-utils` helpers for aggregation/formatting/WoW.

- `src/components/dashboard/gsc-overview-card.tsx` -> Search snapshot card (clicks, impressions, CTR, avg position, top gaining queries).
- Props interface: none
- Data sources:
- `GET /api/gsc/metrics?type=summary&days=7`

- `src/components/dashboard/gmc-overview-card.tsx` -> Merchant Center snapshot card (product counts + top price opportunities).
- Props interface: none
- Data sources:
- `GET /api/gmc/metrics?type=summary`

- `src/components/dashboard/ai-insight-card.tsx` -> Weekly AI summary panel (load cached insight, generate/regenerate text, cache results).
- Props interface:
- `siteMetrics` (pageviews/sessions/users/conversion + WoW deltas)
- `categoryData` (category/pageviews/sessions/WoW)
- `adWeekNumber`
- Data sources:
- Supabase client query: `ai_insights` table (`insight_type='weekly_summary'`, `scope='sitewide'`, latest row)
- `POST /api/ai-gemini` to generate text
- `POST /api/ai-insights` to persist generated insight

## 3. Supabase Client Patterns

- Server: how to import and use
- File: `src/lib/supabase/server.ts`
- Import: `import { createClient } from '@/lib/supabase/server'`
- Pattern: call `createClient()` per request in server components/route handlers, then use `supabase.auth.getUser()` and `.from(...).select(...)` queries.
- Uses `@supabase/ssr` `createServerClient(...)` with Next `cookies()` plumbing.

- Client: how to import and use
- File: `src/lib/supabase/client.ts`
- Import either:
- `import { createClient } from '@/lib/supabase/client'`
- or shorthand `import { createClient } from '@/lib/supabase'` (via `src/lib/supabase/index.ts` re-export).
- Pattern: in client components, memoize `createClient()` and query directly when needed.

- Any helper functions for common queries
- `src/lib/supabase/service.ts` exports `createServiceRoleClient()` for privileged server-side jobs/API routes.
- Uses `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`.
- Used where writes must bypass user RLS context (for example `ai_insights`, GA4 cache tables).

## 4. Anthropic API Pattern
File: `src/app/api/ai-generate/route.ts`

- Route structure
- `POST` route.
- First verifies authenticated user via server Supabase client (`supabase.auth.getUser()`).
- Builds user message based on whether `currentCode` was provided.
- Calls Anthropic Messages API.
- Strips markdown fences from returned text.
- Returns JSON `{ code: generatedCode }`.

- How API key is accessed
- `process.env.ANTHROPIC_API_KEY`
- Returns HTTP 503 with config error if missing.

- Model used
- `claude-haiku-4-5-20251001`

- Request/response format
- Incoming body:
- `{ prompt: string, language: 'html'|'css'|'javascript', currentCode?: string }`
- Outgoing success:
- `{ code: string }`
- Outgoing errors:
- `401` unauthorized
- `400` missing prompt
- `502` Anthropic upstream failure
- `500` generic generation failure

## 5. Cron Jobs
File: `vercel.json`

Current cron entries:
- `/api/ga4/refresh` -> `0 3 * * *`
- `/api/cron/gsc-sync` -> `0 8 * * *`
- `/api/cron/gmc-sync` -> `0 9 * * *`

## 6. Nav Config
Requested file `src/config/nav-config.ts` does not exist.
Actual file: `src/lib/nav-config.ts`

- Dashboard route entry
- `dashboard` (label `Dashboard`) -> sidebar maps to `/dashboard`

- Any sub-routes
- Analytics slugs in `NAV_ITEMS`:
- `analytics-search`
- `analytics-products`
- `analytics-performance`
- `analytics-speed`
- Sidebar explicitly maps those to:
- `/analytics/search`
- `/analytics/products`
- `/analytics/performance`
- `/analytics/speed`

- Full nav slugs currently configured
- `dashboard`
- `my-queue`
- `ad-weeks`
- `calendar`
- `editor`
- `templates`
- `carousels`
- `upload`
- `aor-settings`
- `analytics-search`
- `analytics-products`
- `analytics-performance`
- `analytics-speed`
- `sops`
- `requests`
- `bugs`
- `settings`
- `profile`
- `admin`

## 7. Existing Insight/AI Generation

- Files found
- Pattern matches:
- `src/components/dashboard/ai-insight-card.tsx`
- `src/app/api/ai-insights/route.ts`
- No `*weekly-insight*` filename matches were found.
- Related generation route in active use:
- `src/app/api/ai-gemini/route.ts`
- Related Anthropic generator route (editor-oriented):
- `src/app/api/ai-generate/route.ts`

- How insights are currently generated and stored
- Generation:
- `AiInsightCard` builds a structured weekly prompt from GA4 site metrics + category deltas.
- Calls `POST /api/ai-gemini` (`type: 'weekly_summary'`).
- Storage:
- On success, card calls `POST /api/ai-insights` with `insight_type`, `scope`, `prompt_summary`, `response_text`, `model_used`, `tokens_used`.
- API route writes to `ai_insights` via service-role Supabase client.
- Retrieval/cache:
- Card loads latest `ai_insights` row for `weekly_summary/sitewide` and only reuses it if generated within 12h (`isFreshInsight`).

- What triggers generation
- Manual user action (`Generate Weekly Insight` or `Regenerate` button).
- No cron/automatic scheduled insight generation path found.

## 8. Analytics Data Fetching Patterns

- How GA4 data is queried (direct Supabase? API route?)
- Primary UI pattern is API-route based.
- Dashboard (`Ga4Section`): uses `/api/ga4/metrics` for site + AOR slices.
- Analytics Site Performance page (`PerformanceDashboard`): uses `/api/ga4/site-reports` for report bundles, plus `/api/ga4/metrics?scope=aor&profile_id=...` for producer AOR table.
- `/api/ga4/metrics` reads cached rows from Supabase tables:
- `ga4_page_metrics`
- `ga4_fetch_log`
- Direct GA4 API calls happen in refresh/report backends, not in client components:
- `/api/ga4/refresh` -> `fetchGa4Report(...)` -> GA4 Data API
- `/api/ga4/site-reports` POST -> `fetchAllSiteReports(...)` -> GA4 Data API

- How GSC data is queried
- Search dashboard calls `/api/gsc/metrics` for:
- summary (`type=summary`)
- query table (`type=queries`)
- page table (`type=pages`)
- with filters: `days`, `device`, search text, sort, pagination.
- Backend route reads Supabase tables:
- `gsc_page_performance`
- `gsc_query_performance`
- `data_sync_log` (for `last_sync`).
- Manual sync trigger for admins:
- `POST /api/gsc/trigger-sync`

- How AOR scoping works (the join pattern)
- Implemented in `/api/ga4/metrics` (application-level join logic, not SQL join).
- Flow:
- Load GA4 rows from `ga4_page_metrics` (`current_week` + `previous_week`).
- Load AOR patterns from `ga4_aor_patterns` with joined `profiles(full_name, email)`.
- Expand/normalize each producer pattern list (`url_patterns` + optional homepage `/`).
- For each page path, find the longest prefix match (`findBestMatch` with `startsWith`).
- Attach `category_label` and `producer_name` to matched rows.
- Dedupe by `page_path|period_start|period_end|period_type`.

- Any utility functions for period comparison / WoW calculation
- `src/lib/ga4-utils.ts`:
- `pctChange(...)`
- `pointsDelta(...)`
- `buildDeltaBadge(...)`
- `aggregateCategories(...)` (includes `wowViews`)
- `buildPageHighlights(...)` (page-level WoW)
- `aggregateProducers(...)`
- `src/app/api/gsc/metrics/route.ts`:
- `buildDateRange(days)` (current vs previous window)
- `percentChange(current, previous)`

## 9. Shared Utilities

- Any date/week helpers
- `src/lib/ga4/ad-weeks.ts`:
- Loads ad week calendar CSV
- `getCurrentAdWeek()`
- `getPreviousAdWeek()`
- `getAdWeekByDate()`
- `getAdWeekDates()`
- `getAllAdWeeks()`
- `src/lib/ga4-utils.ts`:
- `formatDateRange(...)`
- `formatRelativeTime(...)`

- Any formatting helpers (numbers, percentages, deltas)
- `src/lib/ga4-utils.ts`:
- `formatInteger`, `formatCurrency`, `formatPercent`
- `buildDeltaBadge`
- `truncatePath`
- `toNumber`, `sumMetric`, `averageMetric`
- Component-local formatters also exist in:
- `gsc-overview-card.tsx`
- `gmc-overview-card.tsx`
- `search-performance-dashboard.tsx`
- `products-analytics-dashboard.tsx`
- `speed-dashboard.tsx`

- Any shared types/interfaces for analytics data
- `src/lib/ga4-utils.ts`:
- `MetricsResponse`, `Ga4MetricRow`, `ProfileOption`, `CategoryAggregate`, `ProducerAggregate`, `PageHighlights`
- `src/lib/types/database.ts`:
- `AiInsight`
- `PagespeedResult`
- `SiteReportsResponse`
- `OverviewMetrics`
- Note: GSC/GMC response row types are mostly defined locally inside their dashboard components and API routes (not centralized in one shared analytics types file).
