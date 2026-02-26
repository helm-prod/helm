-- ============================================================
-- Web Production Hub — Migration
-- Paste this entire file into the Supabase SQL Editor and run.
-- ============================================================

-- 1. work_requests table
create table if not exists public.work_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  request_type text not null check (request_type in (
    'new_panel', 'panel_correction', 'category_change',
    'spotlight_record', 'marketing_snipe', 'flyer_archive', 'other'
  )),
  description text,
  priority text not null default 'normal' check (priority in (
    'low', 'normal', 'high', 'urgent'
  )),
  status text not null default 'submitted' check (status in (
    'submitted', 'triaged', 'in_progress', 'in_review', 'complete', 'cancelled'
  )),
  ad_week text,
  due_date date,
  requester_id uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  notes text,
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for common queries
create index if not exists idx_work_requests_requester on public.work_requests(requester_id);
create index if not exists idx_work_requests_assigned on public.work_requests(assigned_to);
create index if not exists idx_work_requests_status on public.work_requests(status);
create index if not exists idx_work_requests_due_date on public.work_requests(due_date);

-- 2. Auto-update updated_at on row change
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_work_request_updated
  before update on public.work_requests
  for each row
  execute function public.handle_updated_at();

-- 3. Enable RLS
alter table public.work_requests enable row level security;

-- 4. RLS Policies

-- Helper: get role for current user
create or replace function public.get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- SELECT: admins and producers can read all; requesters see only their own; readonly can read all
create policy "Admins and producers can read all requests"
  on public.work_requests for select
  using (
    public.get_my_role() in ('admin', 'producer', 'readonly')
  );

create policy "Requesters can read own requests"
  on public.work_requests for select
  using (
    public.get_my_role() = 'requester'
    and requester_id = auth.uid()
  );

-- INSERT: any authenticated user can insert their own requests
create policy "Authenticated users can insert own requests"
  on public.work_requests for insert
  with check (
    auth.uid() is not null
    and requester_id = auth.uid()
  );

-- UPDATE: admins and producers can update any request
create policy "Admins and producers can update any request"
  on public.work_requests for update
  using (
    public.get_my_role() in ('admin', 'producer')
  );

-- UPDATE: requesters can update their own requests only if status = 'submitted'
create policy "Requesters can update own submitted requests"
  on public.work_requests for update
  using (
    public.get_my_role() = 'requester'
    and requester_id = auth.uid()
    and status = 'submitted'
  );

-- 5. Seed: insert an admin profile placeholder
-- NOTE: You must first create a user via Supabase Auth (email signup),
-- then update the email below to match, and the id to match the auth.users id.
-- If you already have a profiles trigger that auto-creates profiles on signup,
-- you can simply run this UPDATE instead:
--
--   update public.profiles
--   set role = 'admin'
--   where email = 'your-admin@example.com';
--
-- Otherwise, insert a placeholder (update the id and email after signup):
insert into public.profiles (id, email, full_name, role)
values (
  '00000000-0000-0000-0000-000000000000',
  'admin@example.com',
  'Hub Admin',
  'admin'
)
on conflict (id) do update set role = 'admin';
