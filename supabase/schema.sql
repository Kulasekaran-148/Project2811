-- Sourashtra app — database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: it drops and recreates the policies.

-- ---------- Tables ----------

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  role text not null default 'student' check (role in ('teacher', 'student'))
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  day_number int not null,
  title text not null,
  intro text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons on delete cascade,
  position int not null default 0,
  word text not null,          -- Sourashtra, in the agreed English-letter spelling
  meaning text not null,       -- English meaning
  tamil text,                  -- optional Tamil-script spelling
  alternatives text,           -- other spellings to accept, comma-separated
  sounds_like text,            -- pronunciation hint
  example text,                -- example sentence in Sourashtra
  example_meaning text,
  note text,                   -- usage note ("only to elders", "family slang")
  audio_path text              -- file in the 'audio' storage bucket
);

create table if not exists progress (
  student_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references items on delete cascade,
  ease real not null default 2.5,
  interval_days int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  correct int not null default 0,
  wrong int not null default 0,
  due_at timestamptz not null default now(),
  last_seen timestamptz,
  primary key (student_id, item_id)
);

create table if not exists activity (
  id bigint generated always as identity primary key,
  student_id uuid not null references auth.users on delete cascade,
  day date not null,             -- the student's local date
  xp int not null default 0,
  kind text not null,            -- 'lesson' | 'review'
  lesson_id uuid references lessons on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists completions (
  id bigint generated always as identity primary key,
  student_id uuid not null references auth.users on delete cascade,
  lesson_id uuid not null references lessons on delete cascade,
  score int,                     -- % correct on first try
  completed_at timestamptz not null default now()
);

-- ---------- Profile row for every new user (role defaults to student) ----------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this script ran.
insert into profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher');
$$;

-- ---------- Row level security ----------
-- Teacher: writes lessons and words, reads everyone's progress.
-- Student: reads lessons and words, writes only their own progress.

alter table profiles enable row level security;
alter table lessons enable row level security;
alter table items enable row level security;
alter table progress enable row level security;
alter table activity enable row level security;
alter table completions enable row level security;

drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select to authenticated using (true);

drop policy if exists "read lessons" on lessons;
drop policy if exists "teacher writes lessons" on lessons;
create policy "read lessons" on lessons for select to authenticated using (true);
create policy "teacher writes lessons" on lessons for all to authenticated
  using (is_teacher()) with check (is_teacher());

drop policy if exists "read items" on items;
drop policy if exists "teacher writes items" on items;
create policy "read items" on items for select to authenticated using (true);
create policy "teacher writes items" on items for all to authenticated
  using (is_teacher()) with check (is_teacher());

do $$
declare t text;
begin
  foreach t in array array['progress', 'activity', 'completions'] loop
    execute format('drop policy if exists "own or teacher reads" on %I', t);
    execute format('drop policy if exists "student writes own" on %I', t);
    execute format('create policy "own or teacher reads" on %I for select to authenticated
                    using (student_id = auth.uid() or is_teacher())', t);
    execute format('create policy "student writes own" on %I for all to authenticated
                    using (student_id = auth.uid()) with check (student_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- Audio storage ----------

insert into storage.buckets (id, name, public) values ('audio', 'audio', false)
on conflict (id) do nothing;

drop policy if exists "read audio" on storage.objects;
drop policy if exists "teacher uploads audio" on storage.objects;
drop policy if exists "teacher updates audio" on storage.objects;
drop policy if exists "teacher deletes audio" on storage.objects;
create policy "read audio" on storage.objects for select to authenticated
  using (bucket_id = 'audio');
create policy "teacher uploads audio" on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and is_teacher());
create policy "teacher updates audio" on storage.objects for update to authenticated
  using (bucket_id = 'audio' and is_teacher());
create policy "teacher deletes audio" on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and is_teacher());
