-- =====================================================================
-- Royal Green — 0006 : access logging
-- Some READS are auditable events, not just writes: opening a KYC document,
-- downloading a registry copy, exporting a lead list.
-- =====================================================================

create or replace function public.log_kyc_access(p_kyc_id uuid, p_document text)
returns void
language plpgsql security definer set search_path = public, app as $$
declare v_user uuid;
begin
  if not app.is_admin() then
    -- Owners reading their own KYC is not noteworthy; anyone else must be an admin.
    select user_id into v_user from public.kyc where id = p_kyc_id;
    if v_user is distinct from auth.uid() then
      raise exception 'Not permitted' using errcode = '42501';
    end if;
    return;
  end if;

  perform app.write_audit(
    'access', 'kyc', p_kyc_id::text,
    'Viewed KYC document: ' || coalesce(p_document, 'unknown'),
    null, null
  );
end $$;

grant execute on function public.log_kyc_access(uuid, text) to authenticated;

create or replace function public.log_export(p_entity text, p_row_count int)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null then return; end if;
  perform app.write_audit(
    'access', p_entity, null,
    'Exported ' || coalesce(p_row_count, 0) || ' rows to CSV',
    null, null
  );
end $$;

grant execute on function public.log_export(text, int) to authenticated;

create or replace function public.log_document_access(p_document_id uuid)
returns void
language plpgsql security definer set search_path = public, app as $$
declare v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where id = p_document_id;
  if v_doc.id is null then return; end if;

  if not (app.is_admin() or v_doc.owner_id = auth.uid()
          or (v_doc.booking_id is not null and app.owns_booking(v_doc.booking_id))) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  perform app.write_audit(
    'access', 'documents', p_document_id::text,
    'Downloaded ' || v_doc.type::text || ': ' || v_doc.title,
    null, null
  );
end $$;

grant execute on function public.log_document_access(uuid) to authenticated;
