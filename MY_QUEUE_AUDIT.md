# My Queue Audit

## Scope

Requested checks completed:

- Read `src/app/(app)/my-queue/page.tsx`
- Read component files imported from the My Queue page, following imports through the queue UI/editor stack
- Listed `src/app/api/` routes containing `queue`, `panel`, or `work`
- Listed all files in `src/app/(app)/my-queue/`
- Listed `src/lib/` files related to queue or panel loading
- Checked `supabase/*.sql` for `profiles` schema signals and any `queue_preferences` / `user_preferences` table

## Quick Answers

### How My Queue determines which panels belong to the logged-in user

`src/app/(app)/my-queue/page.tsx` loads the authenticated user, fetches that user's row from `profiles`, then queries `panels` with:

- `assigned_to = user.id`
- `ad_week_id IN activeWeekIds` where active weeks are `ad_weeks.status != 'archived'`
- `archived = false`
- `status NOT IN ('complete', 'cancelled')`

So ownership is currently assignment-based, not requester-based or role-based.

### Shape of a "panel" item as fetched for My Queue

The page fetches a `QueuePanel`, which is:

- Base shape: `Panel` from `src/lib/types/database.ts`
- Joined fields:
  - `ad_week: { id, week_number, year, label, status, start_date, end_date } | null`
  - `event: { id, event_code, event_name } | null`
  - `assignee: { id, full_name, email } | null`

Core `Panel` fields include:

- Identity/relations: `id`, `ad_week_id`, `event_id`, `assigned_to`, `requester_id`, `upload_id`, `page_template_id`
- Work metadata: `category`, `page_location`, `priority`, `panel_type`, `status`, `source`
- Offer/content fields: `prefix`, `value`, `dollar_or_percent`, `suffix`, `item_description`, `exclusions`, `generated_description`
- Extra content fields: `brand_category_tracking`, `direction`, `image_reference`, `link_intent`, `link_url`, `special_dates`, `notes`
- Workflow flags: `design_needed`, `is_carryover`, `is_pickup`, `pickup_reference`
- Code editor fields: `generated_code`, `generated_code_draft`, `generated_code_final`, `code_status`
- Archive/timestamps: `archived`, `archived_at`, `created_at`, `updated_at`

### Does `profiles` have a `role` column? Possible values?

Yes, the repo clearly expects `profiles.role` to exist.

Evidence:

- `src/lib/types/database.ts` defines `Profile.role: UserRole`
- `src/lib/permissions.ts` reads `profiles.role`
- multiple SQL policies query `public.profiles.role`
- `supabase/migration.sql` inserts into `public.profiles (id, email, full_name, role)`

Current app-level role values:

- `admin`
- `senior_web_producer`
- `producer`

Important inconsistency:

- `supabase/migration.sql` also references legacy role names `readonly` and `requester` in `work_requests` RLS.
- Those values do not appear in `src/lib/types/database.ts` and are not used by My Queue.

Also important:

- No SQL file in this repo creates the `profiles` table itself, so the full DB schema for `profiles` is not present here.
- Based on code and SQL references, the table at minimum appears to include `id`, `email`, `full_name`, and `role`.
- The TS interface also expects `created_at`.

### Is there existing per-user preference/settings storage in the DB?

Yes, at the application level there is an expected `user_preferences` table.

Evidence:

- `src/lib/types/database.ts` defines `UserPreferences`
- `src/app/(app)/profile/profile-page-client.tsx` reads and upserts `user_preferences`

Expected columns from code:

- `id`
- `user_id`
- `theme`
- `email_notifications`
- `created_at`
- `updated_at`

Important caveat:

- No SQL migration in `supabase/*.sql` creates `user_preferences`, so the repo references it but does not define it here.
- No `queue_preferences` table was found anywhere in the repo.

### What Supabase tables does My Queue touch?

Directly or through imported queue components:

- `profiles`
- `ad_weeks`
- `panels`
- `ad_week_events` (joined)
- `page_access`
- `user_page_overrides`
- `page_templates`
- `code_templates`

Auth/session is also used through Supabase Auth.

### Is there a `work_requests` table? What columns does it have?

Yes. `supabase/migration.sql` creates `public.work_requests` with:

- `id`
- `title`
- `request_type`
- `description`
- `priority`
- `status`
- `ad_week`
- `due_date`
- `requester_id`
- `assigned_to`
- `notes`
- `status_history`
- `created_at`
- `updated_at`

This table is part of the older request workflow and is not used by My Queue.

## Inventories

### Files in `src/app/(app)/my-queue/`

- `src/app/(app)/my-queue/my-queue-client.tsx`
- `src/app/(app)/my-queue/page.tsx`

### API routes in `src/app/api/` containing `queue`, `panel`, or `work`

Found:

- `src/app/api/site-quality/panel-score/route.ts`
- `src/app/api/site-quality/panel-results/route.ts`
- `src/app/api/cron/site-quality-scan-panels/route.ts`

Not found:

- No `queue` route
- No `work` route

### `src/lib/` files related to queue or panel loading

Most relevant:

- `src/lib/types/database.ts`
- `src/lib/permissions.ts`
- `src/lib/codegen.ts`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`

Panel-related but unrelated to My Queue behavior:

- `src/lib/site-quality/panel-scraper.ts`
- `src/lib/site-quality/panel-scorer.ts`

## File-by-File Findings

### `src/app/(app)/my-queue/page.tsx`

What it does:
Server page for My Queue. It authenticates the user, loads the user's `profiles` row, finds all non-archived ad weeks, and fetches assigned open panels for the current user. It wraps the page with `PageGuard` and passes queue data into the client component.

Key data structures / types:
- `Profile`
- inline panel query result with joined `ad_week`, `event`, `assignee`
- helper `toIsoDateUTC()`

API routes it calls:
- None

Supabase tables it queries:
- `profiles`
- `ad_weeks`
- `panels`
- joined `ad_week_events`

Role-checking logic:
- Requires login
- Delegates page access check to `PageGuard`
- No inline admin/senior/producer branching beyond that

### `src/app/(app)/my-queue/my-queue-client.tsx`

What it does:
Client UI for rendering the current user's queue, with filters for This Week, Next Week, and All Active. It groups panels by ad week and page location, opens a drawer for panel editing, and lets the user change panel status inline.

Key data structures / types:
- `QueuePanel`
- `QueueTab`
- `Panel`
- `Profile`

API routes it calls:
- None

Supabase tables it queries:
- None directly in this file

Supabase tables it indirectly updates through imported components:
- `panels`
- `page_templates`
- `code_templates`

Role-checking logic:
- Receives `profile` but does not branch on `profile.role`
- Passes `canEdit={true}` to `PanelStatusBadge` and `CodeEditorPanel`

### `src/components/page-guard.tsx`

What it does:
Server component guard that checks page-level access before rendering children. If access is denied, it renders an "Access Restricted" state instead of redirecting.

Key data structures / types:
- `pageSlug: string`
- `children: React.ReactNode`

API routes it calls:
- None

Supabase tables it queries:
- Indirectly via `checkPageAccess()`: `profiles`, `page_access`, `user_page_overrides`

Role-checking logic:
- Central page access gate
- Depends on role resolution from `profiles.role`

### `src/components/panel-status-badge.tsx`

What it does:
Interactive badge/dropdown for viewing or changing a panel's production status. When editable, it updates the `panels.status` column directly from the browser via Supabase client.

Key data structures / types:
- `PanelStatus`
- `PanelStatusBadgeProps`
- `ALL_PANEL_STATUSES`

API routes it calls:
- None

Supabase tables it queries:
- `panels` (update)

Role-checking logic:
- UI-level editability is controlled by `canEdit`
- No explicit role check in the component itself

### `src/components/panel-type-badge.tsx`

What it does:
Pure presentational badge for displaying `panel_type`. It maps a `PanelType` to styling constants or shows an empty-state dash.

Key data structures / types:
- `PanelType`
- `PANEL_TYPE_COLORS`

API routes it calls:
- None

Supabase tables it queries:
- None

Role-checking logic:
- None

### `src/components/priority-circle.tsx`

What it does:
Pure display component for showing numeric panel priority in a circle. It renders `—` when no priority is present.

Key data structures / types:
- `value: number | null`

API routes it calls:
- None

Supabase tables it queries:
- None

Role-checking logic:
- None

### `src/components/code-editor/CodeEditorPanel.tsx`

What it does:
Drawer-style panel editor that supports form-based offer editing, HTML code editing, generated previews, and code workflow state changes. It loads page/code templates and persists most panel field edits directly into the `panels` table.

Key data structures / types:
- `Panel`
- `PageTemplateLite`
- `CodeTemplateLite`
- `CodeStatus`
- local `formValues`

API routes it calls:
- None

Supabase tables it queries:
- `panels`
- `page_templates`
- `code_templates`

Role-checking logic:
- Takes `canEdit`
- No direct admin/senior/producer branching
- Actual write permissions rely on Supabase RLS

### `src/components/code-editor/FormMode.tsx`

What it does:
Form UI for editing structured panel offer fields and previewing generated descriptions/code. It exposes panel metadata like page location, slot name, and priority, and triggers code generation through callbacks.

Key data structures / types:
- local `FormValues`
- constants `LINK_INTENTS`, `PANEL_EXCLUSIONS`, `PANEL_PREFIXES`, `PANEL_SUFFIXES`

API routes it calls:
- None

Supabase tables it queries:
- None

Role-checking logic:
- Controlled by `canEdit`

### `src/components/code-editor/CodeMode.tsx`

What it does:
Monaco-based editor for direct HTML editing of generated panel code. It is purely a UI wrapper around the editor value and editability state.

Key data structures / types:
- `value: string`
- `canEdit: boolean`

API routes it calls:
- None

Supabase tables it queries:
- None

Role-checking logic:
- Controlled by `canEdit`

### `src/components/code-editor/CodePreview.tsx`

What it does:
Simple iframe preview for generated HTML. It renders the current code string into `srcDoc`.

Key data structures / types:
- `code: string`

API routes it calls:
- None

Supabase tables it queries:
- None

Role-checking logic:
- None

### `src/components/code-editor/PanelStatusBar.tsx`

What it does:
Bottom action bar for the code editor workflow. It shows the current code status and exposes actions like save draft, mark final, copy, and mark loaded.

Key data structures / types:
- `CodeStatus`
- `CODE_STATUS_LABELS`
- `CODE_STATUS_COLORS`

API routes it calls:
- None

Supabase tables it queries:
- None directly

Role-checking logic:
- Button enabled state is controlled by `canEdit`

### `src/lib/permissions.ts`

What it does:
Central permission model for page-level access. It resolves the current user role from `profiles`, loads default access from `page_access`, applies per-user overrides from `user_page_overrides`, and determines whether a page slug is accessible.

Key data structures / types:
- `UserRole`
- `PageAccessRow`
- `UserOverrideRow`
- `Set<string>` of effective page slugs

API routes it calls:
- None

Supabase tables it queries:
- `profiles`
- `page_access`
- `user_page_overrides`

Role-checking logic:
- `admin` gets all nav items
- `senior_web_producer` gets all non-admin pages by default
- `producer` gets only explicitly enabled/default pages

### `src/lib/supabase/server.ts`

What it does:
Creates a server-side Supabase client using Next.js cookies. Used by My Queue page and `PageGuard` for server component auth/database access.

Key data structures / types:
- `CookieOptions`
- server Supabase client

API routes it calls:
- None

Supabase tables it queries:
- None directly

Role-checking logic:
- None

### `src/lib/supabase/client.ts`

What it does:
Creates a browser-side Supabase client. Used by interactive queue components that update `panels` or load template data client-side.

Key data structures / types:
- browser Supabase client

API routes it calls:
- None

Supabase tables it queries:
- None directly

Role-checking logic:
- None

### `src/lib/types/database.ts`

What it does:
Application-level source of truth for frontend TS types and enums used by My Queue and related pages. It defines roles, profiles, work requests, panels, templates, upload records, and display constants.

Key data structures / types:
- `UserRole`
- `Profile`
- `UserPreferences`
- `WorkRequest`
- `Panel`
- `AdWeek`
- `AdWeekEvent`
- `PageTemplate`
- `CodeTemplate`
- many status/type unions and label maps

API routes it calls:
- None

Supabase tables it queries:
- None directly, but mirrors table shapes for `profiles`, `work_requests`, `user_preferences`, `ad_weeks`, `ad_week_events`, `panels`, `page_templates`, `code_templates`, `uploads`, `panel_conflicts`, and others

Role-checking logic:
- Defines `UserRole = 'admin' | 'senior_web_producer' | 'producer'`

### `src/lib/codegen.ts`

What it does:
Contains helper logic for the panel code editor: default editor mode, HTML template variable substitution, and limited reverse parsing from HTML back into structured offer fields. It supports the form/code workflow used from the queue drawer.

Key data structures / types:
- `EditorMode`
- `CodeStatus`
- `TemplateVariableMap`
- helpers around `Partial<Panel>`

API routes it calls:
- None

Supabase tables it queries:
- None

Role-checking logic:
- None

### `src/app/api/site-quality/panel-score/route.ts`

What it does:
Admin-only API route for creating and running a site-quality panel scoring job. It inserts a run row, executes scoring asynchronously, inserts result rows, and updates the run summary.

Key data structures / types:
- `NextRequest`
- actor `{ userId, role }`
- scoring run payload `{ adWeek?, trigger? }`

API routes it calls:
- None internally

Supabase tables it queries:
- `profiles`
- `site_quality_panel_runs`
- `site_quality_panel_results`

Role-checking logic:
- Only `admin` may run it
- Cron bearer secret is treated as admin

### `src/app/api/site-quality/panel-results/route.ts`

What it does:
Authenticated API route for paginated retrieval of site-quality panel scoring results for a given run. It validates `runId`, optionally filters by AOR owner, and returns the run plus paginated results.

Key data structures / types:
- `NextRequest`
- pagination params `page`, `pageSize`

API routes it calls:
- None

Supabase tables it queries:
- `site_quality_panel_runs`
- `site_quality_panel_results`

Role-checking logic:
- Requires any authenticated user
- No admin/senior/producer split

### `src/app/api/cron/site-quality-scan-panels/route.ts`

What it does:
Cron trigger endpoint for scheduled site-quality scans. It validates a shared secret and then calls `/api/site-quality/panel-score` with a scheduled trigger.

Key data structures / types:
- `NextRequest`

API routes it calls:
- `/api/site-quality/panel-score`

Supabase tables it queries:
- None directly

Role-checking logic:
- Bearer `CRON_SECRET` required

### `src/app/(app)/profile/profile-page-client.tsx`

What it does:
Profile screen that loads the current user's profile and preferences, updates display name, changes password, and upserts user preference values. This is the only code found in the repo that clearly uses `user_preferences`.

Key data structures / types:
- `Profile`
- `UserPreferences`
- local `preferences` state with `theme` and `email_notifications`

API routes it calls:
- None

Supabase tables it queries:
- `profiles`
- `user_preferences`

Role-checking logic:
- Displays role badge styling for `admin`, `senior_web_producer`, `producer`
- Does not gate actions by role

### `supabase/migration.sql`

What it does:
Base migration for the older request workflow. It creates `work_requests`, adds `updated_at` trigger support, enables RLS, defines request-related policies, and seeds an admin profile row.

Key data structures / types:
- `public.work_requests`
- `public.handle_updated_at()`
- `public.get_my_role()`

API routes it calls:
- None

Supabase tables it queries:
- creates/uses `work_requests`
- references `profiles`

Role-checking logic:
- Uses `profiles.role`
- Policies mention `admin`, `producer`, `readonly`, `requester`
- This role set is broader than the current TS app role union

### `supabase/migration-phase-a.sql`

What it does:
Phase A migration for the panel workflow. It creates the core My Queue data model: `ad_weeks`, `ad_week_events`, `uploads`, `panels`, `aor_assignments`, `panel_conflicts`, and SOP tables, then adds RLS and seed data.

Key data structures / types:
- `public.ad_weeks`
- `public.ad_week_events`
- `public.uploads`
- `public.panels`
- `public.aor_assignments`
- `public.panel_conflicts`

API routes it calls:
- None

Supabase tables it queries:
- creates the main panel queue tables above
- references `profiles`

Role-checking logic:
- `admin` can manage broadly
- `producer` can insert panels and update only assigned panels
- authenticated users can read panel workflow tables

### `supabase/migration-phase-b.sql`

What it does:
Follow-up migration for ad week date ranges and upload summaries. It adds `start_date` and `end_date` to `ad_weeks`, which My Queue uses for This Week / Next Week filtering.

Key data structures / types:
- `ad_weeks.start_date`
- `ad_weeks.end_date`
- `uploads.summary`

API routes it calls:
- None

Supabase tables it queries:
- alters `ad_weeks`
- alters `uploads`

Role-checking logic:
- None in this file

### `supabase/migration-session-2.sql`

What it does:
Migration for the code editor workspace attached to panels. It creates `page_templates` and `code_templates`, adds code workflow/archive columns to `panels`, and seeds initial page templates.

Key data structures / types:
- `page_templates`
- `code_templates`
- added `panels` columns `generated_code`, `generated_code_draft`, `generated_code_final`, `code_status`, `page_template_id`, `archived`, `archived_at`

API routes it calls:
- None

Supabase tables it queries:
- creates `page_templates`
- creates `code_templates`
- alters `panels`
- references `profiles` in admin policies

Role-checking logic:
- only `admin` can manage templates
- authenticated users can read templates

### `supabase/migration-editor.sql`

What it does:
Migration for the separate Helm editor feature, unrelated to My Queue. It defines file/folder/version/share tables plus RLS for user-owned editor content.

Key data structures / types:
- `editor_folders`
- `editor_files`
- `editor_file_versions`
- `editor_file_shares`

API routes it calls:
- None

Supabase tables it queries:
- creates editor tables

Role-checking logic:
- Ownership/share-based RLS
- No admin/senior/producer logic

## Notable Observations

### 1. My Queue uses direct Supabase access, not internal API routes

The page load happens in a server component query, and queue interactions such as status updates and code edits go straight to Supabase from client components. There is no `/api/my-queue` or `/api/panels/...` route for this workflow in the repo.

### 2. UI editability is broader than explicit role checks

`my-queue-client.tsx` passes `canEdit={true}` into editable components. The actual restriction appears to rely on page access and database RLS, not on client-side role branching.

### 3. There is a role-model mismatch in the repo

The current app code expects only:

- `admin`
- `senior_web_producer`
- `producer`

But `supabase/migration.sql` still contains older request-workflow policies referencing:

- `readonly`
- `requester`

That inconsistency should be treated carefully if request workflows and queue workflows are expected to share the same `profiles.role`.

### 4. `profiles` and `user_preferences` are referenced but not fully migration-backed here

The repo proves these tables are expected, but the checked SQL files do not define them. That means the schema either lives outside this repo, predates these migrations, or is managed manually in Supabase.

