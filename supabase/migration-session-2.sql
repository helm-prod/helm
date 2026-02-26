-- Phase 2 Session 2: code editor workspace, templates, and panel archiving

-- ------------------------------------------------------------
-- 1) Page templates: managed pages and available slots
-- ------------------------------------------------------------
create table if not exists public.page_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  url text,
  page_type text not null default 'l2',
  slots jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_page_templates_name_key
  on public.page_templates ((lower(trim(name))));

create index if not exists idx_page_templates_page_type
  on public.page_templates(page_type);

create trigger on_page_template_updated
  before update on public.page_templates
  for each row execute function public.set_updated_at();

alter table public.page_templates enable row level security;

drop policy if exists "Authenticated users can view page_templates" on public.page_templates;
create policy "Authenticated users can view page_templates"
  on public.page_templates for select
  to authenticated using (true);

drop policy if exists "Admins can manage page_templates" on public.page_templates;
create policy "Admins can manage page_templates"
  on public.page_templates for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 2) Code templates: HTML snippet templates per page + slot
-- ------------------------------------------------------------
create table if not exists public.code_templates (
  id uuid default gen_random_uuid() primary key,
  page_template_id uuid not null references public.page_templates(id) on delete cascade,
  slot_name text not null,
  html_template text not null default '',
  variable_map jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(page_template_id, slot_name)
);

create index if not exists idx_code_templates_page_slot
  on public.code_templates(page_template_id, slot_name);

create trigger on_code_template_updated
  before update on public.code_templates
  for each row execute function public.set_updated_at();

alter table public.code_templates enable row level security;

drop policy if exists "Authenticated users can view code_templates" on public.code_templates;
create policy "Authenticated users can view code_templates"
  on public.code_templates for select
  to authenticated using (true);

drop policy if exists "Admins can manage code_templates" on public.code_templates;
create policy "Admins can manage code_templates"
  on public.code_templates for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 3) Panels: code editor workflow columns
-- ------------------------------------------------------------
alter table public.panels
  add column if not exists generated_code text,
  add column if not exists generated_code_draft text,
  add column if not exists generated_code_final text,
  add column if not exists code_status text not null default 'none'
    check (code_status in ('none', 'generated', 'draft', 'final', 'loaded', 'proofed')),
  add column if not exists page_template_id uuid references public.page_templates(id),
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz;

create index if not exists idx_panels_page_template on public.panels(page_template_id);
create index if not exists idx_panels_archived on public.panels(ad_week_id, archived);
create index if not exists idx_panels_code_status on public.panels(code_status);

-- ------------------------------------------------------------
-- 4) Seed page templates
-- ------------------------------------------------------------
do $$
declare
  homepage_slots jsonb :=
    '[
      {"name":"A","label":"Hero"},
      {"name":"B","label":"Nav"},
      {"name":"C","label":"Half-width"},
      {"name":"Banner","label":"Banner"},
      {"name":"Marketing Header","label":"Marketing Header"}
    ]'::jsonb;
  l1_slots jsonb :=
    '[
      {"name":"A","label":"Hero"},
      {"name":"B","label":"Nav"},
      {"name":"C","label":"Half-width"},
      {"name":"Left Nav","label":"Left Nav"}
    ]'::jsonb;
  l2_slots jsonb :=
    '[
      {"name":"A","label":"Hero"},
      {"name":"C","label":"Half-width"}
    ]'::jsonb;
  brand_slots jsonb :=
    '[
      {"name":"A","label":"Hero"}
    ]'::jsonb;
begin
  insert into public.page_templates (name, url, page_type, slots)
  values
    ('Homepage Hot', 'https://www.mynavyexchange.com/', 'homepage_hot', homepage_slots),
    ('Homepage Cold', 'https://www.mynavyexchange.com/', 'homepage_cold', homepage_slots),
    ('Electronics L1', 'https://www.mynavyexchange.com/c/electronics', 'l1', l1_slots),
    ('Beauty L1', 'https://www.mynavyexchange.com/c/beauty', 'l1', l1_slots),
    ('Everyday Home L1', 'https://www.mynavyexchange.com/c/everyday-home', 'l1', l1_slots),
    ('Bedding L2', 'https://www.mynavyexchange.com/c/everyday-home/bedding', 'l2', l2_slots),
    ('Kitchen & Dining L2', 'https://www.mynavyexchange.com/c/everyday-home/kitchen-dining', 'l2', l2_slots),
    ('Hair Care L2', 'https://www.mynavyexchange.com/c/beauty/hair-care', 'l2', l2_slots),
    ('Sunglasses L2', 'https://www.mynavyexchange.com/c/accessories/sunglasses', 'l2', l2_slots),
    ('Watches L2', 'https://www.mynavyexchange.com/c/accessories/watches', 'l2', l2_slots),
    ('Brand Template', null, 'brand', brand_slots)
  on conflict ((lower(trim(name)))) do update
  set
    url = excluded.url,
    page_type = excluded.page_type,
    slots = excluded.slots,
    updated_at = now();
end $$;
