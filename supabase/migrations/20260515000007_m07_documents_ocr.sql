-- TenureIQ M7 — Documents & OCR scaffold.
--
-- Pipeline state on `documents` plus storage policy refinements. OCR
-- runs in app code (lib/ocr/* — Tesseract.js wrapper); this migration
-- is purely the persistence shape and the storage-side guards.

set search_path = public;

-- =========================================================================
-- 1. documents: new columns for the OCR + confirm/reject pipeline.
-- =========================================================================

alter table documents
  add column if not exists unit_id                   uuid,
  add column if not exists tenancy_id                uuid,
  add column if not exists mortgage_id               uuid,
  add column if not exists uploaded_at               timestamptz(6) not null default current_timestamp,
  add column if not exists status                    text not null default 'uploaded',
  add column if not exists ocr_confidence_bps        int,
  add column if not exists confidence_bps            int,
  add column if not exists ocr_failure_reason        text,
  add column if not exists confirmed_by_user_id      uuid,
  add column if not exists confirmed_at              timestamptz(6),
  add column if not exists rejected_at               timestamptz(6),
  add column if not exists derived_compliance_item_id uuid;

-- The pre-existing ocr_extracted_json maps to extracted_json in the
-- new Prisma model. Rename so the migration matches schema.prisma.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'documents' and column_name = 'ocr_extracted_json'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'documents' and column_name = 'extracted_json'
  ) then
    alter table documents rename column ocr_extracted_json to extracted_json;
  end if;
end$$;

-- Likewise ocr_status → status (keep status because new pipeline has
-- more values).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'documents' and column_name = 'ocr_status'
  ) then
    -- Migrate old ocr_status values into the new status column for any
    -- pre-existing rows.
    update documents
      set status = case ocr_status
        when 'pending'    then 'uploaded'
        when 'processing' then 'ocr_running'
        when 'done'       then 'ocr_complete'
        when 'failed'     then 'ocr_failed'
        when 'skipped'    then 'uploaded'
        else 'uploaded'
      end
      where status is null or status = 'uploaded';
    alter table documents drop column ocr_status;
  end if;
end$$;

-- CHECK constraint on the new status enum.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_status_check' and conrelid = 'documents'::regclass
  ) then
    alter table documents add constraint documents_status_check
      check (status in (
        'uploaded', 'ocr_running', 'ocr_complete', 'ocr_failed',
        'confirmed', 'rejected'
      ));
  end if;
end$$;

-- =========================================================================
-- 2. FKs on the new linkage columns. ON DELETE RESTRICT — documents
--    survive their parents being soft-deleted; hard-delete an attached
--    parent has to detach the document first.
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_unit_id_fkey'
  ) then
    alter table documents add constraint documents_unit_id_fkey
      foreign key (unit_id) references units(id) on update cascade on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'documents_tenancy_id_fkey'
  ) then
    alter table documents add constraint documents_tenancy_id_fkey
      foreign key (tenancy_id) references tenancies(id) on update cascade on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'documents_mortgage_id_fkey'
  ) then
    alter table documents add constraint documents_mortgage_id_fkey
      foreign key (mortgage_id) references mortgages(id) on update cascade on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'documents_derived_compliance_item_fkey'
  ) then
    alter table documents add constraint documents_derived_compliance_item_fkey
      foreign key (derived_compliance_item_id) references compliance_items(id)
      on update cascade on delete set null;
  end if;
end$$;

-- =========================================================================
-- 3. Composite indexes for the list view (status + org), and to look up
--    documents by parent.
-- =========================================================================

create index if not exists documents_org_status_idx
  on documents (organisation_id, status);
create index if not exists documents_org_deleted_idx
  on documents (organisation_id, deleted_at);
create index if not exists documents_derived_compliance_idx
  on documents (derived_compliance_item_id);
create index if not exists documents_unit_id_idx on documents (unit_id);
create index if not exists documents_tenancy_id_idx on documents (tenancy_id);
create index if not exists documents_mortgage_id_idx on documents (mortgage_id);

-- =========================================================================
-- 4. Storage: ensure the `documents` bucket exists private + tighten
--    storage policies. Path convention is
--      {organisation_id}/{property_id or 'unfiled'}/{document_id}.{ext}
--    so we can match the first path segment as the org gate without a
--    join — defence in depth on top of the documents-table RLS.
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,  -- 50MB
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Drop+recreate any existing policies to ensure the org-id-in-path
-- predicate is enforced (the initial-rls migration set up looser
-- policies that select via the organisations table).
drop policy if exists "documents_select_own_org" on storage.objects;
drop policy if exists "documents_insert_own_org" on storage.objects;
drop policy if exists "documents_delete_own_org" on storage.objects;
drop policy if exists "documents_update_own_org" on storage.objects;

create policy "documents_select_own_org" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (select * from current_user_orgs())
  );

create policy "documents_insert_own_org" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (
      select * from current_user_orgs_with_role(array['owner','admin','manager'])
    )
  );

create policy "documents_update_own_org" on storage.objects for update
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (
      select * from current_user_orgs_with_role(array['owner','admin','manager'])
    )
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (
      select * from current_user_orgs_with_role(array['owner','admin','manager'])
    )
  );

create policy "documents_delete_own_org" on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (
      select * from current_user_orgs_with_role(array['owner','admin'])
    )
  );

-- =========================================================================
-- 5. organisations: opt-in auto-confirm flag (off by default — wrong
--    compliance dates have legal consequences).
-- =========================================================================

alter table organisations
  add column if not exists auto_confirm_high_confidence_ocr boolean not null default false;
