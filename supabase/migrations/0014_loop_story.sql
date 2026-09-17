create table if not exists public.web_stories (
  id smallint primary key default 1 check (id = 1),
  title text not null default 'Nuevos ingresos' check (char_length(title) between 1 and 80),
  video_url text not null,
  object_path text not null,
  button_text text not null default 'Ver catálogo' check (char_length(button_text) between 1 and 40),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

alter table public.web_stories enable row level security;

grant select on public.web_stories to anon, authenticated;
grant insert, update, delete on public.web_stories to authenticated;

drop policy if exists web_stories_public_read on public.web_stories;
create policy web_stories_public_read on public.web_stories
for select to anon, authenticated
using (
  active = true
  and starts_at <= now()
  and expires_at > now()
);

drop policy if exists web_stories_admin_read on public.web_stories;
create policy web_stories_admin_read on public.web_stories
for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  )
);

drop policy if exists web_stories_admin_insert on public.web_stories;
create policy web_stories_admin_insert on public.web_stories
for insert to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  )
);

drop policy if exists web_stories_admin_update on public.web_stories;
create policy web_stories_admin_update on public.web_stories
for update to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  )
);

drop policy if exists web_stories_admin_delete on public.web_stories;
create policy web_stories_admin_delete on public.web_stories
for delete to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  )
);

drop trigger if exists web_stories_set_updated_at on public.web_stories;
create trigger web_stories_set_updated_at
before update on public.web_stories
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'story-videos',
  'story-videos',
  true,
  31457280,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists story_videos_public_read on storage.objects;
create policy story_videos_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'story-videos');

drop policy if exists story_videos_admin_insert on storage.objects;
create policy story_videos_admin_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'story-videos'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  )
);

drop policy if exists story_videos_admin_delete on storage.objects;
create policy story_videos_admin_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'story-videos'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'ADMIN'
  )
);
