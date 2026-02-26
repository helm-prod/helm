-- ============================================================
-- Web Production Hub — Phase B Migration
-- Phase 2 Session 1: import fixes, calendar seed, upload summaries
-- ============================================================

-- 1) Add date range directly to ad_weeks for calendar seeding + queue filters
alter table public.ad_weeks
  add column if not exists start_date date,
  add column if not exists end_date date;

create index if not exists idx_ad_weeks_status_dates
  on public.ad_weeks(status, start_date, end_date);

-- 2) Persist rich upload summaries for reporting screens
alter table public.uploads
  add column if not exists summary jsonb not null default '{}'::jsonb;

-- 3) Expand upload_type values to include calendar seed imports
alter table public.uploads
  drop constraint if exists uploads_upload_type_check;

alter table public.uploads
  add constraint uploads_upload_type_check
  check (
    upload_type is null
    or upload_type in ('turn_in', 'corrections', 'ad_week_calendar')
  );
