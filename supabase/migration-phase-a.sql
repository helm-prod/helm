-- ============================================================
-- Web Production Hub — Phase A Migration
-- Panel-based workflow system: ad weeks, panels, AOR, uploads, SOPs
-- Paste this entire file into the Supabase SQL Editor and run.
-- ============================================================

-- ============================================================
-- 1. AD WEEKS
-- ============================================================
create table if not exists public.ad_weeks (
  id uuid primary key default gen_random_uuid(),
  week_number integer not null,
  year integer not null,
  label text,
  status text not null default 'draft' check (status in (
    'draft', 'turn_in', 'in_production', 'proofing', 'live', 'archived'
  )),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_number, year)
);

create index if not exists idx_ad_weeks_year_week on public.ad_weeks(year desc, week_number desc);

-- ============================================================
-- 2. AD WEEK EVENTS
-- ============================================================
create table if not exists public.ad_week_events (
  id uuid primary key default gen_random_uuid(),
  ad_week_id uuid not null references public.ad_weeks(id) on delete cascade,
  event_code text not null,
  event_name text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_week_events_week on public.ad_week_events(ad_week_id);

-- ============================================================
-- 3. UPLOADS (must come before panels since panels references it)
-- ============================================================
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  uploaded_by uuid references public.profiles(id),
  upload_type text check (upload_type in ('turn_in', 'corrections')),
  ad_week_id uuid references public.ad_weeks(id),
  status text not null default 'processing' check (status in (
    'processing', 'complete', 'partial', 'failed'
  )),
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  conflict_rows integer not null default 0,
  error_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_uploads_ad_week on public.uploads(ad_week_id);

-- ============================================================
-- 4. PANELS — core table
-- ============================================================
create table if not exists public.panels (
  id uuid primary key default gen_random_uuid(),
  ad_week_id uuid not null references public.ad_weeks(id) on delete cascade,
  event_id uuid references public.ad_week_events(id),
  category text not null check (category in (
    'Homepage', 'Accessories', 'Apparel', 'Baby', 'Baby Care', 'Beauty',
    'Candy', 'Electronics', 'Everyday Home', 'Food, Snacks & Candy',
    'Furniture', 'General Hardware', 'Health & Wellness', 'Home Depot',
    'Household Essentials', 'Luggage & Travel', 'Military (Navy Pride)',
    'Office and School Supplies', 'Outdoor Home', 'Personal Care', 'Pet',
    'Seasonal', 'Shoes', 'Speciality Shops', 'Sports, Fitness and Outdoor',
    'Tactical', 'Toys'
  )),
  page_location text not null,
  priority integer,
  panel_type text check (panel_type in (
    'Marketing Header', 'Banner', 'Left Nav', 'A', 'B', 'C'
  )),
  prefix text,
  value text,
  dollar_or_percent text check (dollar_or_percent in ('$', '%') or dollar_or_percent is null),
  suffix text,
  item_description text,
  exclusions text,
  generated_description text,
  brand_category_tracking text,
  direction text,
  image_reference text,
  link_intent text,
  link_url text,
  special_dates text,
  status text not null default 'pending' check (status in (
    'pending', 'design_needed', 'in_production', 'proofing',
    'revision', 'complete', 'cancelled'
  )),
  assigned_to uuid references public.profiles(id),
  requester_id uuid references public.profiles(id),
  design_needed boolean not null default false,
  is_carryover boolean not null default false,
  is_pickup boolean not null default false,
  pickup_reference text,
  source text not null default 'manual' check (source in ('manual', 'upload', 'correction')),
  upload_id uuid references public.uploads(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_panels_ad_week on public.panels(ad_week_id);
create index if not exists idx_panels_category on public.panels(category);
create index if not exists idx_panels_assigned on public.panels(assigned_to);
create index if not exists idx_panels_status on public.panels(status);
create index if not exists idx_panels_event on public.panels(event_id);

-- ============================================================
-- 5. AOR ASSIGNMENTS
-- ============================================================
create table if not exists public.aor_assignments (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in (
    'Homepage', 'Accessories', 'Apparel', 'Baby', 'Baby Care', 'Beauty',
    'Candy', 'Electronics', 'Everyday Home', 'Food, Snacks & Candy',
    'Furniture', 'General Hardware', 'Health & Wellness', 'Home Depot',
    'Household Essentials', 'Luggage & Travel', 'Military (Navy Pride)',
    'Office and School Supplies', 'Outdoor Home', 'Personal Care', 'Pet',
    'Seasonal', 'Shoes', 'Speciality Shops', 'Sports, Fitness and Outdoor',
    'Tactical', 'Toys'
  )),
  loe integer not null default 1 check (loe between 1 and 5),
  created_at timestamptz not null default now(),
  unique (producer_id, category)
);

create index if not exists idx_aor_producer on public.aor_assignments(producer_id);
create index if not exists idx_aor_category on public.aor_assignments(category);

-- ============================================================
-- 6. PANEL CONFLICTS
-- ============================================================
create table if not exists public.panel_conflicts (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid references public.panels(id) on delete cascade,
  upload_id uuid not null references public.uploads(id) on delete cascade,
  conflict_type text,
  uploaded_data jsonb,
  resolution text check (resolution in ('keep_existing', 'use_uploaded', 'merged') or resolution is null),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_conflicts_upload on public.panel_conflicts(upload_id);
create index if not exists idx_conflicts_panel on public.panel_conflicts(panel_id);

-- ============================================================
-- 7. SOP DOCUMENTS
-- ============================================================
create table if not exists public.sop_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  content text not null,
  version integer not null default 1,
  status text not null default 'draft' check (status in (
    'draft', 'published', 'archived'
  )),
  requires_acknowledgment boolean not null default false,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8. SOP ACKNOWLEDGMENTS
-- ============================================================
create table if not exists public.sop_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sop_documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version_acknowledged integer not null,
  acknowledged_at timestamptz not null default now(),
  unique (sop_id, user_id, version_acknowledged)
);

create index if not exists idx_sop_ack_user on public.sop_acknowledgments(user_id);
create index if not exists idx_sop_ack_sop on public.sop_acknowledgments(sop_id);

-- ============================================================
-- 9. TRIGGERS — updated_at auto-update
-- ============================================================
-- Reuse the existing handle_updated_at() function from migration.sql

create trigger on_ad_week_updated
  before update on public.ad_weeks
  for each row
  execute function public.handle_updated_at();

create trigger on_panel_updated
  before update on public.panels
  for each row
  execute function public.handle_updated_at();

create trigger on_sop_document_updated
  before update on public.sop_documents
  for each row
  execute function public.handle_updated_at();

-- ============================================================
-- 10. ENABLE RLS
-- ============================================================
alter table public.ad_weeks enable row level security;
alter table public.ad_week_events enable row level security;
alter table public.panels enable row level security;
alter table public.aor_assignments enable row level security;
alter table public.uploads enable row level security;
alter table public.panel_conflicts enable row level security;
alter table public.sop_documents enable row level security;
alter table public.sop_acknowledgments enable row level security;

-- ============================================================
-- 11. RLS POLICIES
-- ============================================================

-- ---------- ad_weeks ----------
create policy "Authenticated users can read ad_weeks"
  on public.ad_weeks for select
  using (auth.uid() is not null);

create policy "Admins can manage ad_weeks"
  on public.ad_weeks for all
  using (public.get_my_role() = 'admin');

create policy "Producers can insert ad_weeks"
  on public.ad_weeks for insert
  with check (public.get_my_role() in ('admin', 'producer'));

create policy "Producers can update ad_weeks"
  on public.ad_weeks for update
  using (public.get_my_role() in ('admin', 'producer'));

-- ---------- ad_week_events ----------
create policy "Authenticated users can read ad_week_events"
  on public.ad_week_events for select
  using (auth.uid() is not null);

create policy "Admins can manage ad_week_events"
  on public.ad_week_events for all
  using (public.get_my_role() = 'admin');

create policy "Producers can insert ad_week_events"
  on public.ad_week_events for insert
  with check (public.get_my_role() in ('admin', 'producer'));

create policy "Producers can update ad_week_events"
  on public.ad_week_events for update
  using (public.get_my_role() in ('admin', 'producer'));

-- ---------- panels ----------
create policy "Authenticated users can read panels"
  on public.panels for select
  using (auth.uid() is not null);

create policy "Admins can manage panels"
  on public.panels for all
  using (public.get_my_role() = 'admin');

create policy "Admins and producers can insert panels"
  on public.panels for insert
  with check (public.get_my_role() in ('admin', 'producer'));

create policy "Producers can update assigned panels"
  on public.panels for update
  using (
    public.get_my_role() = 'producer'
    and assigned_to = auth.uid()
  );

-- ---------- aor_assignments ----------
create policy "Authenticated users can read aor_assignments"
  on public.aor_assignments for select
  using (auth.uid() is not null);

create policy "Admins can manage aor_assignments"
  on public.aor_assignments for all
  using (public.get_my_role() = 'admin');

create policy "Producers can manage own aor_assignments"
  on public.aor_assignments for insert
  with check (
    public.get_my_role() = 'producer'
    and producer_id = auth.uid()
  );

create policy "Producers can update own aor_assignments"
  on public.aor_assignments for update
  using (
    public.get_my_role() = 'producer'
    and producer_id = auth.uid()
  );

-- ---------- uploads ----------
create policy "Authenticated users can read uploads"
  on public.uploads for select
  using (auth.uid() is not null);

create policy "Authenticated users can insert uploads"
  on public.uploads for insert
  with check (auth.uid() is not null);

create policy "Admins can manage uploads"
  on public.uploads for all
  using (public.get_my_role() = 'admin');

create policy "Admins and producers can update uploads"
  on public.uploads for update
  using (public.get_my_role() in ('admin', 'producer'));

-- ---------- panel_conflicts ----------
create policy "Authenticated users can read panel_conflicts"
  on public.panel_conflicts for select
  using (auth.uid() is not null);

create policy "Admins can manage panel_conflicts"
  on public.panel_conflicts for all
  using (public.get_my_role() = 'admin');

create policy "Producers can update panel_conflicts"
  on public.panel_conflicts for update
  using (public.get_my_role() in ('admin', 'producer'));

create policy "Authenticated users can insert panel_conflicts"
  on public.panel_conflicts for insert
  with check (auth.uid() is not null);

-- ---------- sop_documents ----------
create policy "Authenticated users can read sop_documents"
  on public.sop_documents for select
  using (auth.uid() is not null);

create policy "Admins can manage sop_documents"
  on public.sop_documents for all
  using (public.get_my_role() = 'admin');

-- ---------- sop_acknowledgments ----------
create policy "Authenticated users can read sop_acknowledgments"
  on public.sop_acknowledgments for select
  using (auth.uid() is not null);

create policy "Users can insert own sop_acknowledgments"
  on public.sop_acknowledgments for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

-- ============================================================
-- 12. SEED DATA — AOR Assignments
-- ============================================================
do $$
declare
  v_megan_id uuid;
  v_maddie_id uuid;
  v_daryl_id uuid;
  v_admin_id uuid;
begin
  -- Look up producer IDs by email
  select id into v_megan_id from public.profiles where email = 'meganbaita@gmail.com';
  select id into v_maddie_id from public.profiles where email = 'maddiecarff@gmail.com';
  select id into v_daryl_id from public.profiles where email = 'darylstrawhand@gmail.com';
  select id into v_admin_id from public.profiles where email = 'ashtonhawkins@gmail.com';

  -- Megan Baita assignments
  if v_megan_id is not null then
    insert into public.aor_assignments (producer_id, category, loe) values
      (v_megan_id, 'Homepage', 5),
      (v_megan_id, 'Apparel', 4),
      (v_megan_id, 'Health & Wellness', 3),
      (v_megan_id, 'Sports, Fitness and Outdoor', 3),
      (v_megan_id, 'Household Essentials', 2),
      (v_megan_id, 'Seasonal', 1),
      (v_megan_id, 'Military (Navy Pride)', 1)
    on conflict (producer_id, category) do update set loe = excluded.loe;
  end if;

  -- Maddie Carff assignments
  if v_maddie_id is not null then
    insert into public.aor_assignments (producer_id, category, loe) values
      (v_maddie_id, 'Beauty', 5),
      (v_maddie_id, 'Everyday Home', 5),
      (v_maddie_id, 'Outdoor Home', 4),
      (v_maddie_id, 'Furniture', 4),
      (v_maddie_id, 'Baby', 3),
      (v_maddie_id, 'Pet', 3),
      (v_maddie_id, 'Shoes', 3),
      (v_maddie_id, 'Tactical', 2),
      (v_maddie_id, 'Personal Care', 1)
    on conflict (producer_id, category) do update set loe = excluded.loe;
  end if;

  -- Daryl Strawhand assignments
  if v_daryl_id is not null then
    insert into public.aor_assignments (producer_id, category, loe) values
      (v_daryl_id, 'Electronics', 5),
      (v_daryl_id, 'Accessories', 4),
      (v_daryl_id, 'Toys', 4),
      (v_daryl_id, 'Food, Snacks & Candy', 2),
      (v_daryl_id, 'Office and School Supplies', 1),
      (v_daryl_id, 'General Hardware', 1),
      (v_daryl_id, 'Luggage & Travel', 1)
    on conflict (producer_id, category) do update set loe = excluded.loe;
  end if;

  -- Default admin for unassigned categories
  if v_admin_id is not null then
    insert into public.aor_assignments (producer_id, category, loe) values
      (v_admin_id, 'Baby Care', 1),
      (v_admin_id, 'Candy', 1),
      (v_admin_id, 'Home Depot', 1),
      (v_admin_id, 'Speciality Shops', 1)
    on conflict (producer_id, category) do update set loe = excluded.loe;
  end if;
end;
$$;
