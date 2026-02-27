-- ============================================================
-- Helm Editor: Files, Folders, Versions, Shares
-- ============================================================

-- Folders (per-user organization)
create table if not exists editor_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Files
create table if not exists editor_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  folder_id uuid references editor_folders(id) on delete set null,
  title text not null default 'Untitled',
  language text not null default 'html' check (language in ('html', 'css', 'javascript')),
  content text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'team')),
  is_template boolean not null default false,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- File versions (manual save snapshots, capped at 20 per file via app logic)
create table if not exists editor_file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references editor_files(id) on delete cascade not null,
  content text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- File shares (granular sharing to specific users)
create table if not exists editor_file_shares (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references editor_files(id) on delete cascade not null,
  shared_with uuid references auth.users(id) on delete cascade not null,
  can_edit boolean not null default false,
  created_at timestamptz default now(),
  unique(file_id, shared_with)
);

-- Indexes
create index if not exists idx_editor_files_user on editor_files(user_id);
create index if not exists idx_editor_files_folder on editor_files(folder_id);
create index if not exists idx_editor_files_visibility on editor_files(visibility);
create index if not exists idx_editor_file_versions_file on editor_file_versions(file_id);
create index if not exists idx_editor_file_shares_shared on editor_file_shares(shared_with);
create index if not exists idx_editor_folders_user on editor_folders(user_id);

-- RLS policies
alter table editor_folders enable row level security;
alter table editor_files enable row level security;
alter table editor_file_versions enable row level security;
alter table editor_file_shares enable row level security;

create policy "Users can manage own folders"
  on editor_folders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own files"
  on editor_files for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can view team files"
  on editor_files for select
  using (visibility = 'team');

create policy "Users can view shared files"
  on editor_files for select
  using (
    exists (
      select 1 from editor_file_shares
      where editor_file_shares.file_id = editor_files.id
      and editor_file_shares.shared_with = auth.uid()
    )
  );

create policy "Users can edit shared files"
  on editor_files for update
  using (
    exists (
      select 1 from editor_file_shares
      where editor_file_shares.file_id = editor_files.id
      and editor_file_shares.shared_with = auth.uid()
      and editor_file_shares.can_edit = true
    )
  );

create policy "Users can view own file versions"
  on editor_file_versions for select
  using (
    exists (
      select 1 from editor_files
      where editor_files.id = editor_file_versions.file_id
      and editor_files.user_id = auth.uid()
    )
  );

create policy "Users can view team file versions"
  on editor_file_versions for select
  using (
    exists (
      select 1 from editor_files
      where editor_files.id = editor_file_versions.file_id
      and editor_files.visibility = 'team'
    )
  );

create policy "Users can create versions for own files"
  on editor_file_versions for insert
  with check (
    exists (
      select 1 from editor_files
      where editor_files.id = editor_file_versions.file_id
      and editor_files.user_id = auth.uid()
    )
  );

create policy "Owners can manage file shares"
  on editor_file_shares for all
  using (
    exists (
      select 1 from editor_files
      where editor_files.id = editor_file_shares.file_id
      and editor_files.user_id = auth.uid()
    )
  );

create policy "Users can view own shares"
  on editor_file_shares for select
  using (shared_with = auth.uid());
