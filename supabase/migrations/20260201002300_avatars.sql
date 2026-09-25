-- =====================================================================
-- Profile photos
--
-- `profiles.avatar_path` has existed from the start and no member has ever
-- had one: there was no bucket to put a photo in and no screen to upload
-- from. The bytes go to Cloudflare R2 like every other file (server/r2.mjs);
-- who may read and write them is decided here, in storage.objects policies.
--
-- Private bucket. A member photo is shown on their own screens, on their ID
-- card and to the office -- not published -- so it is served through
-- short-lived signed URLs rather than a public address anyone could walk.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored as <member uuid>/<file>. The first path segment is the
-- owner, so a member can only ever write inside their own folder.
drop policy if exists avatars_read   on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;

create policy avatars_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars'
         and (app.path_head_uuid(name) = auth.uid() or app.is_admin()));

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and app.path_head_uuid(name) = auth.uid());

create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and app.path_head_uuid(name) = auth.uid());

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (app.path_head_uuid(name) = auth.uid() or app.is_admin()));

-- ---------------------------------------------------------------------
-- avatar_path may only point inside the member's own folder
--
-- profiles_guard lets a member edit their own row, and avatar_path is not a
-- protected field -- rightly, since changing your photo is yours to do. But
-- nothing stopped a member setting it to another member's file, which the
-- office (who can read every avatar) would then see on the wrong record.
-- ---------------------------------------------------------------------
create or replace function app.profiles_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_admin() then return new; end if;

  if new.role            is distinct from old.role
     or new.status       is distinct from old.status
     or new.rank_id      is distinct from old.rank_id
     or new.manager_id   is distinct from old.manager_id
     or new.commission_rate is distinct from old.commission_rate
     or new.user_code    is distinct from old.user_code
     or new.member_code  is distinct from old.member_code
     or new.referrer_id  is distinct from old.referrer_id
     or new.placement_parent_id is distinct from old.placement_parent_id
     or new.frozen         is distinct from old.frozen
     or new.welcome_letter is distinct from old.welcome_letter
     or new.approved_by  is distinct from old.approved_by
     or new.deleted_at   is distinct from old.deleted_at
  then
    raise exception 'Only an administrator can change protected member fields'
      using errcode = '42501';
  end if;

  if new.avatar_path is distinct from old.avatar_path
     and new.avatar_path is not null
     and app.path_head_uuid(new.avatar_path) is distinct from new.id
  then
    raise exception 'A profile photo must be one of your own uploads'
      using errcode = '42501';
  end if;

  return new;
end $$;
