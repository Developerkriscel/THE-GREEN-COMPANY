-- =====================================================================
-- Royal Green — 0004 : Storage buckets + object policies
-- All private. Access is by short-lived signed URL only.
-- Path conventions:
--   kyc/{user_id}/...          documents/{booking_id}/...
--   emi-slips/{booking_id}/... registry/{booking_id}/...
--   public-assets/...          (the only public bucket: banners, galleries)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-assets', 'public-assets', true,  10485760, array['image/png','image/jpeg','image/webp','image/avif','application/pdf']),
  ('kyc',           'kyc',           false,  5242880, array['image/png','image/jpeg','application/pdf']),
  ('documents',     'documents',     false, 10485760, array['application/pdf']),
  ('emi-slips',     'emi-slips',     false,  5242880, array['image/png','image/jpeg','application/pdf']),
  ('registry',      'registry',      false, 20971520, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

-- helper: first path segment
create or replace function app.path_head(p text) returns text
language sql immutable as $$ select split_part(p, '/', 1) $$;

-- Same, but as a uuid — returning NULL instead of raising when the prefix is
-- not a uuid. A malformed object name must DENY, not error the whole query.
create or replace function app.path_head_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p, '/', 1)::uuid;
exception when others then
  return null;
end $$;

-- ------------------------------------------------------- public-assets
create policy public_assets_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'public-assets');
create policy public_assets_write on storage.objects
  for insert to authenticated with check (bucket_id = 'public-assets' and app.is_admin());
create policy public_assets_update on storage.objects
  for update to authenticated using (bucket_id = 'public-assets' and app.is_admin());
create policy public_assets_delete on storage.objects
  for delete to authenticated using (bucket_id = 'public-assets' and app.is_admin());

-- ------------------------------------------------------------------ kyc
-- Owner writes their own folder; only owner + admin can read it.
create policy kyc_read on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc' and (app.path_head(name) = auth.uid()::text or app.is_admin()));
create policy kyc_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc' and app.path_head(name) = auth.uid()::text);
create policy kyc_update on storage.objects
  for update to authenticated
  using (bucket_id = 'kyc' and (app.path_head(name) = auth.uid()::text or app.is_admin()));
create policy kyc_delete on storage.objects
  for delete to authenticated using (bucket_id = 'kyc' and app.is_admin());

-- ------------------------------------------------------------ documents
-- Generated PDFs. Readable by any party to the booking; written server-side.
create policy documents_read on storage.objects
  for select to authenticated
  using (bucket_id = 'documents'
         and (app.is_admin() or app.owns_booking(app.path_head_uuid(name))));
create policy documents_write_admin on storage.objects
  for insert to authenticated with check (bucket_id = 'documents' and app.is_admin());
create policy documents_delete_admin on storage.objects
  for delete to authenticated using (bucket_id = 'documents' and app.is_admin());

-- ------------------------------------------------------------ emi-slips
-- The customer on the booking uploads; the booking's parties + admin read.
create policy emi_slips_read on storage.objects
  for select to authenticated
  using (bucket_id = 'emi-slips'
         and (app.is_admin() or app.owns_booking(app.path_head_uuid(name))));
create policy emi_slips_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'emi-slips'
              and (app.is_admin() or app.is_booking_customer(app.path_head_uuid(name))));
create policy emi_slips_delete_admin on storage.objects
  for delete to authenticated using (bucket_id = 'emi-slips' and app.is_admin());

-- ------------------------------------------------------------- registry
-- Admin-only upload; visible to the booking's parties.
create policy registry_read on storage.objects
  for select to authenticated
  using (bucket_id = 'registry'
         and (app.is_admin() or app.owns_booking(app.path_head_uuid(name))));
create policy registry_write_admin on storage.objects
  for insert to authenticated with check (bucket_id = 'registry' and app.is_admin());
create policy registry_delete_admin on storage.objects
  for delete to authenticated using (bucket_id = 'registry' and app.is_admin());
