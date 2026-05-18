-- Bank CSV import staging tables + pg_trgm-based duplicate detection
-- for the M5 import wizard.
--
-- Two-stage commit pattern: rows land in transaction_import_rows in
-- 'pending' state; user previews; commit copies the kept rows into
-- transactions and flips the import + rows to 'committed'.

set search_path = public;

-- =========================================================================
-- 1. pg_trgm extension + duplicate-detection index on transactions
-- =========================================================================
create extension if not exists pg_trgm;

-- Trigram index on description so the wizard can fuzzy-match a staged
-- row against existing transactions on the same bank account + date +
-- amount with similar description (catches re-uploads where the bank
-- has nudged the description by a few characters).
create index if not exists transactions_description_trgm_idx
  on transactions using gin (description gin_trgm_ops)
  where deleted_at is null;

-- =========================================================================
-- 2. transaction_imports — the batch
-- =========================================================================
create table if not exists transaction_imports (
  id                  uuid         not null primary key default gen_random_uuid(),
  organisation_id     uuid         not null references organisations(id) on update cascade on delete restrict,
  bank_account_id     uuid         not null references bank_accounts(id) on update cascade on delete restrict,
  uploaded_by_user_id uuid         references users(id) on update cascade on delete set null,

  filename            text         not null,
  format              text         not null,
  row_count           int          not null default 0 check (row_count >= 0),
  status              text         not null default 'pending'
                        check (status in ('pending', 'previewing', 'committed', 'rejected')),
  committed_at        timestamptz(6),
  rejected_at         timestamptz(6),

  created_at          timestamptz(6) not null default current_timestamp,
  updated_at          timestamptz(6) not null default current_timestamp,
  deleted_at          timestamptz(6),

  constraint transaction_imports_format_check
    check (format in ('monzo', 'starling', 'hsbc', 'generic'))
);

create index if not exists transaction_imports_organisation_id_idx
  on transaction_imports (organisation_id);
create index if not exists transaction_imports_organisation_deleted_idx
  on transaction_imports (organisation_id, deleted_at);
create index if not exists transaction_imports_bank_account_id_idx
  on transaction_imports (bank_account_id);
create index if not exists transaction_imports_status_idx
  on transaction_imports (status);

alter table transaction_imports enable row level security;

-- Standard four-policy template + archived-visible-to-owner-admin.
create policy "transaction_imports_select" on transaction_imports
  for select using (
    organisation_id in (select * from current_user_orgs())
    and deleted_at is null
  );

create policy "transaction_imports_select_archived" on transaction_imports
  for select using (
    deleted_at is not null
    and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

create policy "transaction_imports_insert" on transaction_imports
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant']))
  );

create policy "transaction_imports_update" on transaction_imports
  for update
    using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant'])))
    with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant'])));

create policy "transaction_imports_delete" on transaction_imports
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

drop trigger if exists transaction_imports_audit on transaction_imports;
create trigger transaction_imports_audit
  after insert or update or delete on transaction_imports
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 3. transaction_import_rows — the staged rows
-- =========================================================================
create table if not exists transaction_import_rows (
  id              uuid          not null primary key default gen_random_uuid(),
  organisation_id uuid          not null references organisations(id) on update cascade on delete restrict,
  import_id       uuid          not null references transaction_imports(id) on update cascade on delete cascade,

  row_index       int           not null check (row_index >= 0),
  posted_at       date          not null,
  description     text          not null,
  amount_pence    bigint        not null,
  external_id     text,
  reference       text,

  category_code   text          not null default 'uncategorised',
  property_id     uuid          references properties(id) on update cascade on delete set null,

  status          text          not null default 'pending'
                    check (status in ('pending', 'duplicate', 'skipped', 'committed')),
  duplicate_of_transaction_id uuid references transactions(id) on update cascade on delete set null,

  created_at      timestamptz(6) not null default current_timestamp,

  constraint transaction_import_rows_unique_row
    unique (import_id, row_index)
);

create index if not exists transaction_import_rows_organisation_id_idx
  on transaction_import_rows (organisation_id);
create index if not exists transaction_import_rows_import_id_idx
  on transaction_import_rows (import_id);
create index if not exists transaction_import_rows_import_row_idx
  on transaction_import_rows (import_id, row_index);

alter table transaction_import_rows enable row level security;

create policy "transaction_import_rows_select" on transaction_import_rows
  for select using (
    organisation_id in (select * from current_user_orgs())
  );

create policy "transaction_import_rows_insert" on transaction_import_rows
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant']))
  );

create policy "transaction_import_rows_update" on transaction_import_rows
  for update
    using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant'])))
    with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant'])));

create policy "transaction_import_rows_delete" on transaction_import_rows
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

-- =========================================================================
-- 4. commit_bank_import_rpc — atomically copy approved staged rows
--    into `transactions` and flip the import + rows to committed.
-- =========================================================================
create or replace function commit_bank_import_rpc(
  p_organisation_id uuid,
  p_import_id uuid
)
returns int  -- number of transactions inserted
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_import_org uuid;
  v_import_status text;
  v_bank_account_id uuid;
begin
  -- Lock the import row to serialise concurrent commits of the same batch.
  select organisation_id, status, bank_account_id
    into v_import_org, v_import_status, v_bank_account_id
    from transaction_imports
    where id = p_import_id
    for update;

  if v_import_org is null then
    raise exception 'import % not found', p_import_id;
  end if;
  if v_import_org <> p_organisation_id then
    raise exception 'import % belongs to a different organisation', p_import_id;
  end if;
  if v_import_status not in ('pending', 'previewing') then
    raise exception 'import % already in terminal state %', p_import_id, v_import_status;
  end if;

  insert into transactions (
    organisation_id, bank_account_id, property_id, posted_at, description,
    amount_pence, category_code, reference, external_id, import_batch_id
  )
  select
    r.organisation_id,
    v_bank_account_id,
    r.property_id,
    r.posted_at,
    r.description,
    r.amount_pence,
    r.category_code,
    r.reference,
    r.external_id,
    p_import_id
  from transaction_import_rows r
  where r.import_id = p_import_id
    and r.organisation_id = p_organisation_id
    and r.status = 'pending';

  get diagnostics v_inserted = row_count;

  update transaction_import_rows
    set status = 'committed'
    where import_id = p_import_id
      and organisation_id = p_organisation_id
      and status = 'pending';

  update transaction_imports
    set status = 'committed',
        committed_at = current_timestamp,
        updated_at = current_timestamp
    where id = p_import_id
      and organisation_id = p_organisation_id;

  return v_inserted;
end
$$;

revoke all on function commit_bank_import_rpc(uuid, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function commit_bank_import_rpc(uuid, uuid) to service_role';
  end if;
end$$;
