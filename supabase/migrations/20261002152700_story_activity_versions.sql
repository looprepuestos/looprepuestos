alter table public.story_activity add column story_key text not null default '';
update public.story_activity a set story_key = s.object_path from public.web_stories s where a.story_id = s.id and a.story_title = left(s.title,180);
drop policy story_activity_guest_insert on public.story_activity;
create policy story_activity_guest_insert on public.story_activity for insert to anon with check (
 user_id is null and exists (select 1 from public.web_stories s where s.id = story_id and s.object_path = story_key and s.active and s.starts_at <= now() and s.expires_at > now() and left(s.title,180) = story_title)
);
drop policy story_activity_user_insert on public.story_activity;
create policy story_activity_user_insert on public.story_activity for insert to authenticated with check (
 user_id = (select auth.uid()) and not (select public.is_admin()) and exists (select 1 from public.web_stories s where s.id = story_id and s.object_path = story_key and s.active and s.starts_at <= now() and s.expires_at > now() and left(s.title,180) = story_title)
);
comment on column public.story_activity.story_key is 'Immutable uploaded video path; separates publications which reuse the singleton web_stories ID.';
