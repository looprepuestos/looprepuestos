create table public.story_activity (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 user_id uuid references auth.users(id) on delete set null,
 session_id uuid not null,
 visitor_id uuid not null,
 story_id bigint not null,
 story_title varchar(180) not null,
 event_type text not null check (event_type in ('story_view','story_open','story_click'))
);
create index story_activity_created_at_idx on public.story_activity (created_at desc);
create index story_activity_story_idx on public.story_activity (story_id, created_at desc);
create index story_activity_user_idx on public.story_activity (user_id);
alter table public.story_activity enable row level security;
revoke all on public.story_activity from anon, authenticated;
grant insert on public.story_activity to anon, authenticated;
grant select on public.story_activity to authenticated;
grant usage on sequence public.story_activity_id_seq to anon, authenticated;
create policy story_activity_guest_insert on public.story_activity for insert to anon with check (
 user_id is null and exists (select 1 from public.web_stories s where s.id = story_id and s.active and s.starts_at <= now() and s.expires_at > now() and left(s.title,180) = story_title)
);
create policy story_activity_user_insert on public.story_activity for insert to authenticated with check (
 user_id = (select auth.uid()) and not (select public.is_admin()) and exists (select 1 from public.web_stories s where s.id = story_id and s.active and s.starts_at <= now() and s.expires_at > now() and left(s.title,180) = story_title)
);
create policy story_activity_admin_read on public.story_activity for select to authenticated using ((select public.is_admin()));
comment on table public.story_activity is 'Story engagement from activation onward. Titles remain available after stories are removed; only administrators may read.';
